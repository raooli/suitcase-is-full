/**
 * 通关浮层（实施计划 M1-7）。
 *
 * ## 触发与生命周期
 *
 * `level-cleared` 事件（`GameSession` 在最后一件物品合法落盘后、把 phase 推到
 * `WinAnimating` 时发）到达 `GameController`，由它调本组件的 `show()`：
 *
 * 1. **懒加载构建**：节点初始 `active=false`，首次 `show()` 才搭 UI
 *    （M1 其余视图同理：场景只承载结构节点，内容由代码建）；
 * 2. **入场动画**（UI Spec 5.3「回弹→合盖→星光→整理完成！」的最小版）：
 *    `UIOpacity` 0→1 淡入 200ms + 面板 scale 0.8→1.06→1 弹一下 280ms；
 * 3. **播完汇报**：`scheduleOnce(SETTLE_MS)` 后调 `onSettled` 回调，
 *    `GameController` 借此调 `session.completeWinAnimation()` 把 phase 推到
 *    `Completed`——**冻结的解除时机在 view 手里**，core 不自己数时间；
 * 4. **按钮门控**：动画期间 `settled=false`，按钮不响应（点了也没反应比
 *    动画中误触好）；播完才可点。
 *
 * ## 边界
 *
 * - **不持有玩法状态**：只消费 `level-cleared` 事件里的一次性数据
 *   （`levelId / elapsedMs / moves`），不读 `GameSession`；
 * - **输入冻结不是本组件职责**：遮罩只是视觉兜底，真正的冻结在
 *   `session.isInputFrozen()`（WinAnimating/Completed 拒收一切 intent）+
 *   `DragController.inputFrozen` 双保险（UI Spec 5.3「禁止背景误触」）；
 * - **「下一关」不建按钮**：M1 没有关卡推进机制（M2-1 才做关卡加载），
 *   建一个不做事的按钮 = UI Spec 明令禁止的空按钮。留 `onNextLevel`
 *   扩展点，M2 接上时再加按钮，浮层结构不用动。
 */

import { Color, Component, Graphics, Label, Node, Tween, UIOpacity, UITransform, Vec3, tween, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_OVERLAY_BUTTON_HEIGHT,
  UI_OVERLAY_BUTTON_WIDTH,
  UI_OVERLAY_MASK_ALPHA,
  UI_OVERLAY_PANEL_HEIGHT,
  UI_OVERLAY_PANEL_RADIUS,
  UI_OVERLAY_PANEL_WIDTH,
  UI_PALETTE,
} from '../core';
import type { GameEvent } from '../core';

const { ccclass } = _decorator;

/** `level-cleared` 事件的形状（从 core 事件联合体派生，不为它单开出口） */
type LevelClearedEvent = Extract<GameEvent, { type: 'level-cleared' }>;

/** 遮罩/面板淡入时长（ms） */
const FADE_MS = 200;
/** 面板弹跳两段：0.8→1.06（backOut）→1.0（ms） */
const PANEL_GROW_MS = 220;
const PANEL_SNAP_MS = 80;

/**
 * 动画收敛判定窗口（ms）。
 *
 * 两个约束：① 必须大于**并行**两个 tween 的较长者（弹跳 220+80=300ms；
 * 淡入 200ms 先结束），否则按钮会比动画先解冻；② tween 经帧量化会被拖长——
 * M1-5 实测 160ms 的抖动跑了 174ms（约 9%），按同比例 300ms 可能到 ~330ms，
 * 所以留 30ms 余量。改上面任何一段时长后，这里要跟着复核。
 */
const SETTLE_MS = 360;

/** 面板内文字布局（设计单位，画布中心为原点，+y 向上） */
const TITLE_Y = 78;
const LEVEL_Y = 44;
const STATS_Y = 4;
const REPLAY_Y = -98;

/** 装饰星光的小圆半径与错位（UI Spec 5.3「轻微星光」，纯装饰、不暗示星级） */
const DECO_RADII = [5, 3.5, 4.5, 3] as const;
const DECO_OFFSETS = [
  [-104, 6],
  [96, -4],
  [-76, -14],
  [64, 12],
] as const;

@ccclass('SuccessOverlay')
export class SuccessOverlay extends Component {
  /**
   * 动画播完 → `GameController` 调 `session.completeWinAnimation()`。
   * 由装配方赋值；本组件只负责在正确的时机调它一次。
   */
  onSettled: (() => void) | null = null;

  /** 「再来一次」被点（ settled 之后才响应）。装配方换成新会话即可 */
  onReplay: (() => void) | null = null;

  /** 「下一关」被点。M1 不建该按钮（无关卡推进），扩展点留给 M2-1 */
  onNextLevel: (() => void) | null = null;

  /** 懒加载：UI 是否已建。节点初始 active=false，首次 show 才建 */
  private built = false;

  /** 入场动画是否播完（按钮门控） */
  private settled = false;

  private panelNode: Node | null = null;
  private panelOpacity: UIOpacity | null = null;
  private levelLabel: Label | null = null;
  private statsLabel: Label | null = null;

  override onLoad(): void {
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    // 覆盖整屏：遮罩必须挡住整个设计画布，尺寸给满 390×844（由场景建）
    transform.setAnchorPoint(0.5, 0.5);
    // 初始不可见：未通关时浮层完全不参与渲染与命中
    this.node.active = false;
  }

  /**
   * 显示通关浮层。`event` = `level-cleared` 的一次性数据。
   *
   * **可重复调用，且每次都必须重刷文案**：`replayLevel()` 换新会话后，同一关
   * 会再发一次 `level-cleared`，战绩（步数/用时）是**新的**。所以节点结构留给
   * `buildOnce()`，随事件变化的部分走 `applyEvent()`——后者无条件执行。
   *
   * （一次通关内只发一次 `level-cleared` 是 phase 保证的：`WinAnimating`
   * 冻结期内没有 intent 能改状态，AC12「只触发一次」指的是**这个**。）
   */
  show(event: LevelClearedEvent): void {
    // 上一次入场遗留的 settle 回调作废：360ms 内二次 show() 不该叠两个回调
    this.unscheduleAllCallbacks();

    this.buildOnce();
    this.applyEvent(event);
    this.settled = false;
    this.node.active = true;

    if (DEBUG) {
      console.log(
        `[SuccessOverlay] 通关浮层入场：L${event.levelId} ${event.moves} 步` +
          ` ${(event.elapsedMs / 1000).toFixed(1)}s`,
      );
    }

    this.playEntrance();

    // 动画收敛后汇报。scheduleOnce 挂在组件自己的节点上，组件/节点销毁时
    // 引擎会自动取消未执行的回调，不会出现悬空调用
    this.scheduleOnce(() => {
      this.settled = true;
      if (DEBUG) console.log('[SuccessOverlay] 入场动画播完，按钮解冻');
      this.onSettled?.();
    }, SETTLE_MS / 1000);
  }

  /** 隐藏浮层（「再来一次」后由装配方调，恢复可拖拽状态） */
  hide(): void {
    this.node.active = false;
    this.settled = false;
  }

  // ───────────────────────── 懒加载构建 ─────────────────────────

  /**
   * 只建一次的结构（遮罩/面板/装饰/按钮）。**不写任何随事件变化的文案**——
   * 那是 `applyEvent()` 的活；混在这里会变成"复玩后战绩还停在第一次"
   * （M1-7 实测：第二次通关 6.1s，面板显示首次的 15.1s）。
   */
  private buildOnce(): void {
    if (this.built) return;
    this.built = true;

    // 遮罩：整屏半透明深色，挡背景误触（冻结是主防线，这是兜底）
    const mask = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    mask.clear();
    const maskColor = Color.fromHEX(new Color(), UI_PALETTE.brown);
    maskColor.a = Math.round(255 * UI_OVERLAY_MASK_ALPHA);
    mask.fillColor = maskColor;
    mask.fillRect(-UI_DESIGN_WIDTH / 2, -UI_DESIGN_HEIGHT / 2, UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT);

    // 面板：白底圆角 + 浅描边（UI Spec 5.3 弹窗 = surface.white）
    const panel = new Node('Panel');
    panel.layer = this.node.layer;
    this.node.addChild(panel);
    const panelTransform = panel.addComponent(UITransform);
    panelTransform.setContentSize(UI_OVERLAY_PANEL_WIDTH, UI_OVERLAY_PANEL_HEIGHT);
    panelTransform.setAnchorPoint(0.5, 0.5);
    const panelG = panel.addComponent(Graphics);
    panelG.fillColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceWhite);
    panelG.roundRect(
      -UI_OVERLAY_PANEL_WIDTH / 2,
      -UI_OVERLAY_PANEL_HEIGHT / 2,
      UI_OVERLAY_PANEL_WIDTH,
      UI_OVERLAY_PANEL_HEIGHT,
      UI_OVERLAY_PANEL_RADIUS,
    );
    panelG.fill();
    // fill 之后 path 仍保留，但重画一遍再 stroke 是 PreviewLayer/TraySlot
    // 的既有写法（不依赖"fill 不清 path"这个隐式行为）
    panelG.roundRect(
      -UI_OVERLAY_PANEL_WIDTH / 2,
      -UI_OVERLAY_PANEL_HEIGHT / 2,
      UI_OVERLAY_PANEL_WIDTH,
      UI_OVERLAY_PANEL_HEIGHT,
      UI_OVERLAY_PANEL_RADIUS,
    );
    panelG.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
    panelG.lineWidth = 2;
    panelG.stroke();
    this.panelNode = panel;

    // 面板整体淡入：UIOpacity 挂在面板上（不是根节点——遮罩应该立即可见，
    // 跟着淡入会闪一下底板）
    this.panelOpacity = panel.addComponent(UIOpacity);
    this.panelOpacity.opacity = 0;

    // 标题「整理完成！」（UI Spec 5.3 原文文案）
    this.addLabel(panel, 'Title', '整理完成！', TITLE_Y, 34, UI_PALETTE.textPrimary);
    // 副标题：第几关（文案由 applyEvent 每次写入，这里只占位）
    this.levelLabel = this.addLabel(panel, 'Level', '', LEVEL_Y, 20, UI_PALETTE.textSecondary);

    // 战绩行：步数 + 用时（同上）。数据只来自事件，不反查 session
    this.statsLabel = this.addLabel(panel, 'Stats', '', STATS_Y, 22, UI_PALETTE.brown);

    // 装饰星光：纯装饰小圆（UI Spec 5.3：无星级规则不得暗示星级）。
    // 画在面板已有的 Graphics 上——**不能给 panel 再加一个 Graphics**：
    // 一个节点只允许一个 renderable 组件，第二次 addComponent(Graphics) 会被
    // 引擎静默拒绝（Console 一条 warning，圆一个都不画）
    const decoColors = [
      UI_PALETTE.accentPink,
      UI_PALETTE.surfaceCream,
      UI_PALETTE.surfaceMint,
      UI_PALETTE.surfaceRose,
    ];
    for (let i = 0; i < DECO_RADII.length; i++) {
      panelG.fillColor = Color.fromHEX(new Color(), decoColors[i]);
      panelG.circle(DECO_OFFSETS[i][0], DECO_OFFSETS[i][1], DECO_RADII[i]);
      panelG.fill();
    }

    // 「再来一次」：粉色主按钮（UI Spec：accent.pink = 主操作）
    const button = new Node('ReplayButton');
    button.layer = this.node.layer;
    panel.addChild(button);
    button.setPosition(0, REPLAY_Y, 0);
    const buttonTransform = button.addComponent(UITransform);
    buttonTransform.setContentSize(UI_OVERLAY_BUTTON_WIDTH, UI_OVERLAY_BUTTON_HEIGHT);
    buttonTransform.setAnchorPoint(0.5, 0.5);
    const buttonG = button.addComponent(Graphics);
    buttonG.fillColor = Color.fromHEX(new Color(), UI_PALETTE.accentPink);
    buttonG.roundRect(
      -UI_OVERLAY_BUTTON_WIDTH / 2,
      -UI_OVERLAY_BUTTON_HEIGHT / 2,
      UI_OVERLAY_BUTTON_WIDTH,
      UI_OVERLAY_BUTTON_HEIGHT,
      UI_OVERLAY_BUTTON_HEIGHT / 2,
    );
    buttonG.fill();
    this.addLabel(button, 'Label', '再来一次', 0, 22, UI_PALETTE.surfaceWhite);
    // 节点级 TOUCH_END（M1-4 实测：全局 input.on 在 web-mobile 收不到事件；
    // 且引擎会把"松手点在节点外"转成 TOUCH_CANCEL——按钮尺寸就是热区，在热区内
    // 松手才算数，天然不会误触）
    button.on(Node.EventType.TOUCH_END, this.onReplayTouch, this);
  }

  /**
   * 写入随事件变化的文案。**每次 `show()` 都要跑**，不能留在 `buildOnce()` 里。
   *
   * 同类结构（`GuideOverlay` / `ConfirmDialog`，M2）照此预防：懒加载的
   * `built` 提前 return 会静默吞掉"第二次调用"的差异，症状是**界面停在
   * 第一次的数据上**，而日志/状态都是对的——只能靠肉眼对比发现。
   */
  private applyEvent(event: LevelClearedEvent): void {
    if (this.levelLabel !== null) this.levelLabel.string = `第 ${event.levelId} 关`;
    if (this.statsLabel !== null) {
      this.statsLabel.string = `${event.moves} 步 · ${(event.elapsedMs / 1000).toFixed(1)}s`;
    }
  }

  private addLabel(parent: Node, name: string, text: string, y: number, fontSize: number, hex: string): Label {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(0, y, 0);
    // 显式给 UITransform：Label 不会自己加，没有它命中测试会跳过这个节点
    // （文字虽照样渲染，但触摸归属就不可控了）。尺寸取文字行的合理包围盒
    const transform = node.addComponent(UITransform);
    transform.setContentSize(UI_OVERLAY_PANEL_WIDTH - 40, fontSize * 2);
    transform.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = Color.fromHEX(new Color(), hex);
    // M1-7 是全项目第一处文本：不指定字体，用系统默认（中文可渲染需预览实证）
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
  }

  // ───────────────────────── 动画与交互 ─────────────────────────

  /**
   * 入场：遮罩下的面板淡入 + 弹跳缩放（UI Spec 5.3「轻微星光与整理完成！」的
   * 最小实现——星光已在面板上画好，回弹/合盖的完整版留 M2 动效项）。
   */
  private playEntrance(): void {
    const panel = this.panelNode;
    const opacity = this.panelOpacity;
    if (panel === null || opacity === null) return;

    // 幂等：重入先停旧动画，避免 scale/opacity 停在中间帧
    Tween.stopAllByTarget(panel);
    Tween.stopAllByTarget(opacity);

    opacity.opacity = 0;
    panel.setScale(new Vec3(0.8, 0.8, 1));
    tween(opacity)
      .to(FADE_MS / 1000, { opacity: 255 })
      .start();
    tween(panel)
      .to(PANEL_GROW_MS / 1000, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'backOut' })
      .to(PANEL_SNAP_MS / 1000, { scale: new Vec3(1, 1, 1) })
      .start();
  }

  /**
   * 「再来一次」点击。**settled 之前不响应**：入场动画中的误触比
   * 「点了没反应」更糟（会打断庆祝节奏）。
   */
  private onReplayTouch(): void {
    if (!this.settled) {
      if (DEBUG) console.log('[SuccessOverlay] 动画中点击按钮，已忽略');
      return;
    }
    if (DEBUG) console.log('[SuccessOverlay] 点击「再来一次」');
    this.onReplay?.();
  }

  /** DEBUG 对账：战绩 Label 是否已在位（预览夹具断言用） */
  get debugStats(): string {
    return this.statsLabel?.string ?? '(未构建)';
  }

  /** DEBUG 对账：当前是否处于「已入场、未隐藏」 */
  get isShowing(): boolean {
    return this.node.active && this.built;
  }

  /** DEBUG 对账：按钮是否已解冻 */
  get isSettled(): boolean {
    return this.settled;
  }
}
