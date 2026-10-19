/**
 * 首页 + 选关（M2-7，UI Spec 5.1·5.4 / PRD F01）。
 *
 * ## 职责
 *
 * 读存档 → 渲染首页（标题 + 「开始收纳」主 CTA + 关卡卡片网格 + 音效开关）→
 * 处理进关 / 解锁门禁。
 *
 * ## 卡片三态（UI Spec 5.4）
 *
 * 三态的状态徽标统一放在**右上角**（已完成 ✓ / 当前 ▲ / 未解锁 🔒），避开圆角与
 * 中央大号关卡数字——中央只放数字、底部放状态小字。
 *
 * - **已完成（cleared）**：绿描边 + 右上角对勾徽标，可重玩；
 * - **当前可玩（current = 最高已解锁关）**：粉填充 + 粗粉描边 + 右上角三角标记 +
 *   「继续」字样——**不只靠颜色**区分（规格硬要求「不能只用颜色」）；
 * - **未解锁（locked）**：整卡降透明度 + 「未解锁」+ 右上角锁形，点击只抖一下、不进关。
 *
 * 「当前可玩」= `continueLevelId(progress)`（= 最高已解锁关），主 CTA 点它进；
 * 卡片网格允许直接挑任意已解锁关重玩。
 *
 * ## 音效开关（M2-9 / PRD F14·290 / AC18）
 *
 * PRD 290 把「音效开关」列在首页信息里：网格下方一枚 pill 按钮（喇叭图形 +
 * 「音效：开/关」文字，双通道不只靠颜色）。点击 → `setMuted` + `saveProgress`
 * **读改存**（M2-8 规则，只覆盖 muted 一个字段）+ 同步 `audio` 适配器；
 * 开启时顺手播一声轻点作确认。静音态与进度同命名空间，重启后保持（AC18）。
 *
 * ## 进关链路
 *
 * 点已解锁卡片 / CTA → `setPendingLevel(id)`（`route.ts` 模块单例）→
 * `director.loadScene('Game')`；Game 端 `takePendingLevel()` 取出即清。
 *
 * ## 不手改场景
 *
 * 本控制器的节点全部由代码 `new Node()` 创建（与 `SuccessOverlay` / `ToolbarView`
 * 的「代码建 UI」范式一致），场景 JSON 只挂这个脚本组件 + `levelJson` 资产。
 */

import { _decorator, Color, Component, director, EventTouch, Graphics, JsonAsset, Label, Node, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import { DEBUG } from 'cc/env';

import {
  continueLevelId,
  isCleared,
  isUnlocked,
  levelIdsOf,
  setMuted,
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_PALETTE,
  UI_SAFE_MARGIN,
} from '../core';
import type { SaveDataV1 } from '../core';
import { audio } from './AudioAdapter';
import { loadProgress, saveProgress } from './storage';
import { setPendingLevel } from './route';
import { shakeX } from './shake';
import { applyUiSprite, preloadUiSprites } from './uiAssets';

const { ccclass, property } = _decorator;

// ── 首页布局（集中命名常量，避免散落魔法数字）──
const HEADER_TITLE_Y = 360;
const HEADER_SUBTITLE_Y = 322;
const CTA_WIDTH = 240;
const CTA_HEIGHT = 56;
const CTA_Y = 250;
const CTA_RADIUS = 24;

const GRID_COLS = 3;
const CARD_WIDTH = 100;
const CARD_HEIGHT = 100;
const CARD_RADIUS = 14;
const CARD_GAP_X = 21; // (内容宽 342 − 3×100) / 2
const CARD_GAP_Y = 16;
const GRID_TOP_Y = 150; // 第一行中心 y；向下递减 (CARD_HEIGHT + CARD_GAP_Y)
const CARD_LOCKED_OPACITY = 0.55;

// M4-5b 顶部插画：源图 560×400，等比放大到内容宽（安全边距内），顶边贴齐设计
// 上沿附近。图上半是张开的箱盖（浅色），标题/副标题正好压在浅色区上（深棕字
// 清晰、不压住箱子本体）；更往下被 CTA（不透明粉按钮）与关卡卡遮住。
const HERO_SOURCE_WIDTH = 560;
const HERO_SOURCE_HEIGHT = 400;
const HERO_WIDTH = UI_DESIGN_WIDTH - UI_SAFE_MARGIN * 2; // 342，与内容同宽
const HERO_TOP_Y = UI_DESIGN_HEIGHT / 2 - 4; // 422 − 4

// 音效开关（M2-9）：网格下方一枚 pill。网格末行中心 = 150 − 3×116 = −198、
// 卡底 ≈ −248，故 −300 既不相连也不贴底（设计高半幅 −422）。
const MUTE_BUTTON_WIDTH = 156;
const MUTE_BUTTON_HEIGHT = 44;
const MUTE_BUTTON_Y = -300;
const MUTE_BUTTON_RADIUS = 22; // 半高 → 全圆角 pill
const MUTE_GLYPH_SIZE = 28; // 喇叭图形节点边长

type CardState = 'cleared' | 'current' | 'playable' | 'locked';

@ccclass('HomeController')
export class HomeController extends Component {
  /** 关卡数据资产（同 Game，首页要读关卡总数与标题） */
  @property(JsonAsset)
  levelJson: JsonAsset | null = null;

  /**
   * 音效静音态（M2-9）。来自存档（AC18 重启保持），与 `audio` 适配器双向同步：
   * onLoad 灌入、开关点击时改出。`SaveDataV1.muted` 是唯一真相。
   */
  private muted = false;

  /** 开关里的文字与喇叭图形（切换时只改内容，不重建节点） */
  private muteLabel: Label | null = null;
  private muteGlyph: Graphics | null = null;

  override onLoad(): void {
    const progress = loadProgress();
    const ids = levelIdsOf(this.levelJson?.json);
    const levelIds = ids.length > 0 ? ids : [1];
    const maxLevelId = Math.max(...levelIds);
    const currentLevel = continueLevelId(progress, maxLevelId);

    // M2-9：静音态从存档灌入适配器（AC18：重启后保持）。Game 场景的 onLoad 也会
    // 灌一次（单例两份调用方，同一真相同一字段，幂等）。
    this.muted = progress.muted;
    audio.setMuted(this.muted);
    // M4-5b：提前载入首页插画与全部音效（不发声，只入缓存），消除首次延迟
    preloadUiSprites(['home-hero']);
    audio.preload();

    if (DEBUG) {
      console.log(
        `[HomeController] 首页：最高解锁 L${progress.maxUnlockedLevelId}` +
          ` / 已通关 ${progress.clearedLevelIds.length} 关 → 当前可玩 L${currentLevel}` +
          ` / 共 ${levelIds.length} 关` +
          ` / 音效${this.muted ? '关' : '开'}`,
      );
    }

    this.buildBackground();
    this.buildHero();
    this.buildHeader();
    this.buildCTA(currentLevel);
    this.buildGrid(levelIds, progress, currentLevel);
    this.buildMuteButton();
  }

  // ───────────────────────── 背景与标题 ─────────────────────────

  private buildBackground(): void {
    const node = new Node('HomeBg');
    node.layer = this.node.layer;
    this.node.addChild(node);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);
    const g = node.addComponent(Graphics);
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.bg);
    g.fillRect(-UI_DESIGN_WIDTH / 2, -UI_DESIGN_HEIGHT / 2, UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT);
  }

  /**
   * 顶部插画（M4-5b）：把 `ui/home-hero`（开着的行李箱 + 衣物）铺在背景之上、
   * 标题之下。等比缩放到内容宽（342），**不拉伸**；顶边贴齐设计上沿。
   *
   * 层序：`onLoad` 里先建背景 → 再建插画 → 后建标题/CTA/关卡卡，故插画在
   * 背景之上、又在所有文字与不透明卡片之下——浅色的张盖区承托标题、箱体被
   * CTA 与卡片自然遮住。
   */
  private buildHero(): void {
    const height = (HERO_WIDTH * HERO_SOURCE_HEIGHT) / HERO_SOURCE_WIDTH;
    const node = new Node('HomeHero');
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(0, HERO_TOP_Y - height / 2, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(HERO_WIDTH, height);
    transform.setAnchorPoint(0.5, 0.5);
    // 先定 type/sizeMode 再贴帧（CUSTOM 才不被帧尺寸改写，见 MEMORY 引擎限制）
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    applyUiSprite(sprite, 'home-hero');
  }

  private buildHeader(): void {
    this.makeLabel('HomeTitle', '行李箱装不下啦！', 26, UI_PALETTE.brown, HEADER_TITLE_Y, 32);
    this.makeLabel(
      'HomeSubtitle',
      '把每一件行李都装进箱子 · 选关开始',
      14,
      UI_PALETTE.textSecondary,
      HEADER_SUBTITLE_Y,
      18,
    );
  }

  // ───────────────────────── 主 CTA ─────────────────────────

  private buildCTA(targetLevelId: number): void {
    const node = new Node('HomeCTA');
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(0, CTA_Y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(CTA_WIDTH, CTA_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);

    const g = node.addComponent(Graphics);
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.accentPink);
    g.roundRect(-CTA_WIDTH / 2, -CTA_HEIGHT / 2, CTA_WIDTH, CTA_HEIGHT, CTA_RADIUS);
    g.fill();

    this.makeLabelOn(node, '开始收纳', 22, UI_PALETTE.surfaceWhite, 0, 26);

    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => (e.propagationStopped = true), this);
    node.on(
      Node.EventType.TOUCH_END,
      (e: EventTouch) => {
        e.propagationStopped = true;
        if (DEBUG) console.log(`[HomeController] 主 CTA → 进入 L${targetLevelId}`);
        setPendingLevel(targetLevelId);
        director.loadScene('Game');
      },
      this,
    );
  }

  // ───────────────────────── 关卡网格 ─────────────────────────

  private buildGrid(levelIds: number[], progress: SaveDataV1, currentLevel: number): void {
    const contentWidth = UI_DESIGN_WIDTH - UI_SAFE_MARGIN * 2;
    const startX = -contentWidth / 2 + CARD_WIDTH / 2;
    levelIds.forEach((levelId, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = startX + col * (CARD_WIDTH + CARD_GAP_X);
      const y = GRID_TOP_Y - row * (CARD_HEIGHT + CARD_GAP_Y);

      const state: CardState = !isUnlocked(progress, levelId)
        ? 'locked'
        : levelId === currentLevel
          ? 'current'
          : isCleared(progress, levelId)
            ? 'cleared'
            : 'playable';

      this.createCard(levelId, state, x, y);
    });
  }

  private createCard(levelId: number, state: CardState, x: number, y: number): void {
    const node = new Node(`LevelCard_${levelId}`);
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(CARD_WIDTH, CARD_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);

    if (state === 'locked') {
      const opacity = node.addComponent(UIOpacity);
      opacity.opacity = CARD_LOCKED_OPACITY * 255;
    }

    const g = node.addComponent(Graphics);
    this.drawCardFace(g, state);

    // 大号关卡数字（偏上）
    const numberColor =
      state === 'locked' ? UI_PALETTE.textSecondary : UI_PALETTE.textPrimary;
    this.makeLabelOn(node, String(levelId), 40, numberColor, 6, 48);

    // 状态小字（底部）
    const status = cardStatusText(state);
    const statusColor = cardStatusColor(state);
    this.makeLabelOn(node, status, 14, statusColor, -CARD_HEIGHT / 2 + 16, 18);

    const base = new Vec3(x, y, 0);
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => (e.propagationStopped = true), this);
    node.on(
      Node.EventType.TOUCH_END,
      (e: EventTouch) => {
        e.propagationStopped = true;
        this.onCardTap(levelId, state, node, base);
      },
      this,
    );
  }

  private drawCardFace(g: Graphics, state: CardState): void {
    const halfW = CARD_WIDTH / 2;
    const halfH = CARD_HEIGHT / 2;
    const box = () => g.roundRect(-halfW, -halfH, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    // 右上角状态徽标锚点（三态同位：已完成✓ / 当前▲ / 未解锁🔒）。
    // 取圆角弧心附近、略向内收，保证徽标整体落在圆角矩形内、且不压中央大号关卡数字。
    const badgeX = halfW - 15;
    const badgeY = halfH - 15;

    g.clear();
    // 底
    g.fillColor = Color.fromHEX(
      new Color(),
      state === 'current' ? UI_PALETTE.surfaceRose : UI_PALETTE.surfaceWhite,
    );
    box();
    g.fill();

    // 描边（颜色 + 粗细区分状态）
    if (state === 'cleared') {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.valid);
      g.lineWidth = 3;
      box();
      g.stroke();
      this.drawCheck(g, badgeX, badgeY);
    } else if (state === 'current') {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.accentPink);
      g.lineWidth = 4;
      box();
      g.stroke();
      this.drawSelectedMark(g, badgeX, badgeY);
    } else if (state === 'locked') {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
      g.lineWidth = 2;
      box();
      g.stroke();
      // 锁形作为右上角小徽标，避免和大号关卡数字重叠
      this.drawLock(g, badgeX, badgeY, 6);
    } else {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
      g.lineWidth = 2;
      box();
      g.stroke();
    }
  }

  /**
   * 对勾（已完成）徽标：右上角小勾。
   *
   * 早期画在卡中心 `(0, 6)`，与大号关卡数字（`yOffset=6`、`fontSize=40`）同中心 →
   * √ 压在数字上。现移到右上角徽标位（与锁角标 / 三角标记同位），并缩小到徽标尺寸。
   */
  private drawCheck(g: Graphics, cx: number, cy: number): void {
    g.lineWidth = 3.5;
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.valid);
    g.moveTo(cx - 7, cy);
    g.lineTo(cx - 2, cy + 5);
    g.lineTo(cx + 7, cy - 6);
    g.stroke();
  }

  /**
   * 选中标记（当前可玩）：右上角实心三角（▲）。
   *
   * Cocos 3.8.8 的 `Graphics` **没有 `fillTriangle`**（`cc.d.ts` 查无此方法，M2-7 曾
   * 因此 typecheck 报错），故用路径 `moveTo → lineTo → lineTo → close → fill` 画。
   * 与锁卡锁角标同位，作为 UI Spec 5.4「当前关卡选中态不能只用颜色区分」的图形佐证
   * （「继续」文案之外的第二重非颜色区分）。
   */
  private drawSelectedMark(g: Graphics, cx: number, cy: number): void {
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.accentPink);
    g.moveTo(cx, cy + 7); // 上顶点
    g.lineTo(cx - 6.5, cy - 4); // 左下
    g.lineTo(cx + 6.5, cy - 4); // 右下
    g.close();
    g.fill();
  }

  /** 锁形（未解锁）徽标；`s` = 半宽，锁体高约 1.6s */
  private drawLock(g: Graphics, cx: number, cy: number, s: number): void {
    const color = Color.fromHEX(new Color(), UI_PALETTE.textSecondary);
    // Graphics 局部坐标 y 向上：`roundRect` 的 y 参数是**下**边缘（曾按"Top"命名，
    // 导致锁梁圆心被放在锁体下边缘——半圆埋进填充锁体，锁退化成圆角方块）。
    const bodyBottom = cy - s * 0.8;
    // 锁体
    g.fillColor = color;
    g.roundRect(cx - s, bodyBottom, s * 2, s * 1.6, 2);
    g.fill();
    // 锁梁（半圆，跨在锁体上方）
    g.strokeColor = color;
    g.lineWidth = Math.max(1.5, s * 0.35);
    // Cocos 3.8.8 `Graphics.arc` 末参 `counterclockwise=false` 渲染的是
    // `[start,end]` 的**补集**（探针实证，见 MEMORY 引擎限制）——画标称区间必须
    // 传 `true`；圆心还必须落在锁体**上**边缘，否则 ∩ 看不见。
    g.arc(cx, bodyBottom + s * 1.6, s * 0.7, 0, Math.PI, true);
    g.stroke();
  }

  // ───────────────────────── 交互 ─────────────────────────

  private onCardTap(levelId: number, state: CardState, node: Node, base: Vec3): void {
    if (state === 'locked') {
      if (DEBUG) console.log(`[HomeController] 关卡 L${levelId} 未解锁，拒绝进入（抖动提示）`);
      shakeX(node, base);
      return;
    }
    if (DEBUG) console.log(`[HomeController] 进入 L${levelId}`);
    setPendingLevel(levelId);
    director.loadScene('Game');
  }

  // ───────────────────────── 音效开关（M2-9） ─────────────────────────

  /**
   * 首页音效开关（PRD 290 把「音效开关」列在首页信息里 / F14「可静音」）。
   *
   * pill 按钮 = 喇叭图形 + 「音效：开 / 关」文字——**双通道**（UI Spec 无障碍：
   * 不只靠图形、也不只靠颜色区分状态）。点击切换 → 落盘 → 同步适配器。
   */
  private buildMuteButton(): void {
    const node = new Node('MuteToggle');
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(0, MUTE_BUTTON_Y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(MUTE_BUTTON_WIDTH, MUTE_BUTTON_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);

    const g = node.addComponent(Graphics);
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceWhite);
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
    g.lineWidth = 2;
    g.roundRect(
      -MUTE_BUTTON_WIDTH / 2,
      -MUTE_BUTTON_HEIGHT / 2,
      MUTE_BUTTON_WIDTH,
      MUTE_BUTTON_HEIGHT,
      MUTE_BUTTON_RADIUS,
    );
    g.fill();
    g.stroke();

    // 喇叭图形（左侧，独立小节点，切换时重绘）
    const glyph = new Node('MuteGlyph');
    glyph.layer = this.node.layer;
    node.addChild(glyph);
    glyph.setPosition(-MUTE_BUTTON_WIDTH / 2 + 32, 0, 0);
    const glyphTransform = glyph.addComponent(UITransform);
    glyphTransform.setContentSize(MUTE_GLYPH_SIZE, MUTE_GLYPH_SIZE);
    glyphTransform.setAnchorPoint(0.5, 0.5);
    this.muteGlyph = glyph.addComponent(Graphics);

    // 文字（右侧）：节点宽沿用卡内文字的 94，右移让「喇叭 + 文字」整体居中
    this.muteLabel = this.makeLabelOn(node, '音效：开', 16, UI_PALETTE.textPrimary, 0, 22, 26);

    this.refreshMuteButton();

    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => (e.propagationStopped = true), this);
    node.on(
      Node.EventType.TOUCH_END,
      (e: EventTouch) => {
        e.propagationStopped = true;
        this.onMuteTap();
      },
      this,
    );
  }

  /** 切换静音：内存 + 适配器 + 存档三处同步（存档走读改存，见 M2-8 规则） */
  private onMuteTap(): void {
    // 注意语义方向：`muted === true` 表示**音效关**。文案映射与 UI 标签
    // （`音效：关`）保持一致，别写反了（曾在这里把 before/after 标反，日志骗人）。
    const before = this.muted ? '关' : '开';
    const next = !this.muted;
    this.muted = next;
    audio.setMuted(next);
    saveProgress(setMuted(loadProgress(), next, Date.now()));
    this.refreshMuteButton();
    // 开启时播一声轻点作确认（"我听不听得见"当场可验）；关闭时播放本就被
    // 静音闸挡掉，无需特判。
    audio.play('select');
    if (DEBUG) {
      console.log(`[HomeController] 音效开关：${before} → ${next ? '关' : '开'}（已保存）`);
    }
  }

  /** 按当前静音态重绘图形与文字（只改内容，不重建节点） */
  private refreshMuteButton(): void {
    if (this.muteLabel !== null) {
      this.muteLabel.string = this.muted ? '音效：关' : '音效：开';
    }
    if (this.muteGlyph !== null) {
      this.drawSpeaker(this.muteGlyph, !this.muted);
    }
  }

  /**
   * 喇叭图形（程序绘制，同卡片徽标范式）。`on` = 有声（带两道声波弧），
   * `off` = 静音（加一道斜杠）。都不靠颜色传达状态——文字「音效：开/关」
   * 是第二通道。
   */
  private drawSpeaker(g: Graphics, on: boolean): void {
    const body = Color.fromHEX(new Color(), UI_PALETTE.textPrimary);
    g.clear();
    // 喇叭体（小梯形 + 右侧出口）
    g.fillColor = body;
    g.moveTo(-9, -4);
    g.lineTo(-9, 4);
    g.lineTo(-4, 4);
    g.lineTo(2, 9);
    g.lineTo(2, -9);
    g.lineTo(-4, -4);
    g.close();
    g.fill();
    if (on) {
      g.strokeColor = body;
      g.lineWidth = 2;
      // 末参必须 `true`：`counterclockwise=false` 在 Cocos 3.8.8 渲染的是
      // [-60°,60°] 的**补集**——弧绕到喇叭背后画 240°（探针实证见 MEMORY）。
      g.arc(3, 0, 6, -Math.PI / 3, Math.PI / 3, true);
      g.stroke();
      g.arc(3, 0, 10, -Math.PI / 3, Math.PI / 3, true);
      g.stroke();
    } else {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.textSecondary);
      g.lineWidth = 2.5;
      g.moveTo(-4, -9);
      g.lineTo(11, 9);
      g.stroke();
    }
  }

  // ───────────────────────── 文本工具 ─────────────────────────

  /** 在父节点下建一个居中文字节点（自身带 UITransform，便于单独定位）。返回 Label 组件 */
  private makeLabelOn(
    parent: Node,
    text: string,
    fontSize: number,
    colorHex: string,
    yOffset: number,
    height: number,
    xOffset = 0,
  ): Label {
    const node = new Node('Label');
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(xOffset, yOffset, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(CARD_WIDTH - 6, height);
    transform.setAnchorPoint(0.5, 0.5);
    const lbl = node.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = fontSize;
    lbl.lineHeight = height;
    lbl.color = Color.fromHEX(new Color(), colorHex);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    return lbl;
  }

  /** 在 HomeRoot 下建一个绝对定位的标题 / 副标题节点 */
  private makeLabel(
    name: string,
    text: string,
    fontSize: number,
    colorHex: string,
    yOffset: number,
    height: number,
  ): Node {
    const node = new Node(name);
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(0, yOffset, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(UI_DESIGN_WIDTH - UI_SAFE_MARGIN * 2, height);
    transform.setAnchorPoint(0.5, 0.5);
    const lbl = node.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = fontSize;
    lbl.lineHeight = height;
    lbl.color = Color.fromHEX(new Color(), colorHex);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    return node;
  }
}

function cardStatusText(state: CardState): string {
  switch (state) {
    case 'cleared':
      return '已通关';
    case 'current':
      return '继续';
    case 'locked':
      return '未解锁';
    default:
      return '可玩';
  }
}

function cardStatusColor(state: CardState): string {
  switch (state) {
    case 'cleared':
      return UI_PALETTE.valid;
    case 'current':
      return UI_PALETTE.accentPink;
    case 'locked':
      return UI_PALETTE.textSecondary;
    default:
      return UI_PALETTE.textSecondary;
  }
}
