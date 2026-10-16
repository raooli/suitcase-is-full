/**
 * 首页 + 选关（M2-7，UI Spec 5.1·5.4 / PRD F01）。
 *
 * ## 职责
 *
 * 读存档 → 渲染首页（标题 + 「开始收纳」主 CTA + 关卡卡片网格）→
 * 处理进关 / 解锁门禁。
 *
 * ## 卡片三态（UI Spec 5.4）
 *
 * - **已完成（cleared）**：绿描边 + 对勾，可重玩；
 * - **当前可玩（current = 最高已解锁关）**：粉填充 + 粗粉描边 + 右上角三角标记 +
 *   「继续」字样——**不只靠颜色**区分（规格硬要求「不能只用颜色」）；
 * - **未解锁（locked）**：整卡降透明度 + 「未解锁」+ 锁形，点击只抖一下、不进关。
 *
 * 「当前可玩」= `continueLevelId(progress)`（= 最高已解锁关），主 CTA 点它进；
 * 卡片网格允许直接挑任意已解锁关重玩。
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

import { _decorator, Color, Component, director, EventTouch, Graphics, JsonAsset, Label, Node, UIOpacity, UITransform, Vec3 } from 'cc';
import { DEBUG } from 'cc/env';

import {
  continueLevelId,
  isCleared,
  isUnlocked,
  levelIdsOf,
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_PALETTE,
  UI_SAFE_MARGIN,
} from '../core';
import type { SaveDataV1 } from '../core';
import { loadProgress } from './storage';
import { setPendingLevel } from './route';
import { shakeX } from './shake';

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

type CardState = 'cleared' | 'current' | 'playable' | 'locked';

@ccclass('HomeController')
export class HomeController extends Component {
  /** 关卡数据资产（同 Game，首页要读关卡总数与标题） */
  @property(JsonAsset)
  levelJson: JsonAsset | null = null;

  override onLoad(): void {
    const progress = loadProgress();
    const ids = levelIdsOf(this.levelJson?.json);
    const levelIds = ids.length > 0 ? ids : [1];
    const maxLevelId = Math.max(...levelIds);
    const currentLevel = continueLevelId(progress, maxLevelId);

    if (DEBUG) {
      console.log(
        `[HomeController] 首页：最高解锁 L${progress.maxUnlockedLevelId}` +
          ` / 已通关 ${progress.clearedLevelIds.length} 关 → 当前可玩 L${currentLevel}` +
          ` / 共 ${levelIds.length} 关`,
      );
    }

    this.buildBackground();
    this.buildHeader();
    this.buildCTA(currentLevel);
    this.buildGrid(levelIds, progress, currentLevel);
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
      this.drawCheck(g, 0, 6);
    } else if (state === 'current') {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.accentPink);
      g.lineWidth = 4;
      box();
      g.stroke();
    } else if (state === 'locked') {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
      g.lineWidth = 2;
      box();
      g.stroke();
      // 锁形作为右上角小徽标，避免和大号关卡数字重叠
      this.drawLock(g, halfW - 14, halfH - 14, 6);
    } else {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
      g.lineWidth = 2;
      box();
      g.stroke();
    }
  }

  /** 对勾（已完成） */
  private drawCheck(g: Graphics, cx: number, cy: number): void {
    g.lineWidth = 4;
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.valid);
    g.moveTo(cx - 10, cy);
    g.lineTo(cx - 3, cy + 8);
    g.lineTo(cx + 11, cy - 9);
    g.stroke();
  }

  /** 锁形（未解锁）徽标；`s` = 半宽，锁体高约 1.6s */
  private drawLock(g: Graphics, cx: number, cy: number, s: number): void {
    const color = Color.fromHEX(new Color(), UI_PALETTE.textSecondary);
    const bodyTop = cy - s * 0.8;
    // 锁体
    g.fillColor = color;
    g.roundRect(cx - s, bodyTop, s * 2, s * 1.6, 2);
    g.fill();
    // 锁梁（半圆，跨在锁体上方）
    g.strokeColor = color;
    g.lineWidth = Math.max(1.5, s * 0.35);
    g.arc(cx, bodyTop, s * 0.7, Math.PI, Math.PI * 2, false);
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

  // ───────────────────────── 文本工具 ─────────────────────────

  /** 在父节点下建一个居中文字节点（自身带 UITransform，便于单独定位） */
  private makeLabelOn(
    parent: Node,
    text: string,
    fontSize: number,
    colorHex: string,
    yOffset: number,
    height: number,
  ): Node {
    const node = new Node('Label');
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(0, yOffset, 0);
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
    return node;
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
