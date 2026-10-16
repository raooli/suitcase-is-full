/**
 * 首次引导层（实施计划 M2-6 / PRD F13 / UI Spec 5.2·7·14 / GDD 3.1·3.3）。
 *
 * ## 定位与约束
 *
 * - **只作用于提示层级、不拦截棋盘核心交互**（UI Spec 5.2 原文）。所以与
 *   `Toast` 同一范式：**不注册任何触摸监听、不设 `propagationStopped`**——
 *   Cocos 把触摸派发给所有命中节点，整屏手势根 `SafeAreaRoot` 与工具栏按钮照常
 *   收到事件，引导出现时棋盘仍可拖拽、按钮仍可点（UI Spec 14「首次引导可跳过」）。
 * - **蒙层高亮**：整屏压暗 + 在目标处挖洞（`core/geometry/maskHoles.ts` 的条带
 *   切割）+ 亮色描边圈出目标。挖洞而不是"叠一层亮色"，是因为引导要真的把注意力
 *   压到目标上；条带算法进 core 是因为那是纯几何算术、view 没有单测兜底。
 * - **不持有玩法状态**：只按调用方给的洞与手指路径画一次；"哪关该不该弹、什么
 *   算学会"全在 core `guide.ts`，本组件不知道。
 *
 * ## 生命周期
 *
 * `show(request)` 幂等（重复调用先停旧动画再重画）→ 玩家拖动 / 点击时由
 * `GameController` 调 `hide()`。**停动画必须同时归位**（M1-5 / M1-7 的教训：
 * `Tween.stopAllByTarget` 只停动画、不动节点，节点会留在被打断那一帧的位置上）。
 */

import {
  Color,
  Component,
  Graphics,
  Label,
  Node,
  Tween,
  UITransform,
  Vec3,
  tween,
  _decorator,
} from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_GUIDE_FINGER_BORDER_PX,
  UI_GUIDE_FINGER_HEIGHT,
  UI_GUIDE_FINGER_MOVE_MS,
  UI_GUIDE_FINGER_PAUSE_MS,
  UI_GUIDE_FINGER_WIDTH,
  UI_GUIDE_HOLE_BORDER_PX,
  UI_GUIDE_HOLE_PADDING,
  UI_GUIDE_HOLE_RADIUS,
  UI_GUIDE_MASK_ALPHA,
  UI_GUIDE_TAP_DIP_PX,
  UI_GUIDE_TEXT,
  UI_GUIDE_TEXT_LINE_HEIGHT,
  UI_GUIDE_TEXT_SIZE,
  UI_GUIDE_TEXT_WIDTH,
  UI_GUIDE_TEXT_Y,
  UI_PALETTE,
  maskBands,
} from '../core';
import type { GuideKind } from '../core';

import type { DesignRect } from './designRect';

const { ccclass } = _decorator;

/** 「松手缩回」的缩放（回程时手指缩小一点，读起来像"放开了"） */
const FINGER_RELEASE_SCALE = 0.85;
/** 「点按」按下去的缩放 */
const FINGER_TAP_SCALE = 0.9;

/** 一次引导请求：洞（高亮目标）+ 手指路径，全部是**设计坐标** */
export interface GuideRequest {
  readonly kind: GuideKind;
  /** 要挖洞高亮的目标矩形（左下角 + 宽高，相对 SafeAreaRoot 设计坐标系） */
  readonly holes: readonly DesignRect[];
  /** 手指起点中心（拖拽型）。`null` = 不画手指 */
  readonly from: readonly [number, number] | null;
  /** 手指终点中心（拖拽型的落点 / 点击型的点按位置） */
  readonly to: readonly [number, number] | null;
}

@ccclass('GuideOverlay')
export class GuideOverlay extends Component {
  private built = false;
  private mask: Graphics | null = null;
  private finger: Node | null = null;
  private label: Label | null = null;

  override onLoad(): void {
    // 平时不参与渲染与命中（`active=false` 的节点不收触摸）
    this.node.active = false;
  }

  /** 显示一次引导。幂等：重复调用会先停掉上一次的循环动画再重画 */
  show(request: GuideRequest): void {
    this.hide();
    this.buildOnce();

    this.drawMask(request.holes);
    this.drawFinger(request);
    if (this.label !== null) this.label.string = UI_GUIDE_TEXT[request.kind];

    this.node.active = true;

    if (DEBUG) {
      const holes = request.holes.length;
      console.log(`[GuideOverlay] 显示：${request.kind} 引导，高亮 ${holes} 处`);
    }
  }

  /** 隐藏引导（可跳过：玩家拖动 / 点击即消失）。停循环动画并把手指归位 */
  hide(): void {
    const wasShowing = this.isShowing;
    this.unscheduleAllCallbacks();
    const finger = this.finger;
    if (finger !== null) {
      Tween.stopAllByTarget(finger);
      finger.setPosition(0, 0, 0);
      finger.setScale(1, 1, 1);
    }
    this.node.active = false;
    // 只在"从可见变不可见"时打日志：hide 是幂等的收尾，会被无脑调用
    if (DEBUG && wasShowing) console.log('[GuideOverlay] 收起');
  }

  get isShowing(): boolean {
    return this.node.active && this.built;
  }

  // ───────────────────────── 绘制 ─────────────────────────

  /**
   * 整屏遮罩 − 洞。矩形表由 core 的 `maskBands` 算（条带切割，纯几何 + 有单测），
   * 本方法只负责画。
   */
  private drawMask(holes: readonly DesignRect[]): void {
    const g = this.mask;
    if (g === null) return;

    g.clear();

    const maskColor = Color.fromHEX(new Color(), UI_PALETTE.brown);
    maskColor.a = Math.round(255 * UI_GUIDE_MASK_ALPHA);
    g.fillColor = maskColor;
    for (const band of maskBands(UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT, holes)) {
      g.fillRect(band.x, band.y, band.w, band.h);
    }

    // 洞的亮色描边：外扩一圈，不压在目标自己的边缘上（托盘槽位有选中描边，
    // 叠在一起会糊成一团）
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceCream);
    g.lineWidth = UI_GUIDE_HOLE_BORDER_PX;
    const pad = UI_GUIDE_HOLE_PADDING;
    for (const hole of holes) {
      g.roundRect(
        hole.x - pad,
        hole.y - pad,
        hole.w + pad * 2,
        hole.h + pad * 2,
        UI_GUIDE_HOLE_RADIUS,
      );
      g.stroke();
    }
  }

  /** 手指示意 + 循环动画（拖拽型：起点↔终点；点击型：原地按压） */
  private drawFinger(request: GuideRequest): void {
    const finger = this.finger;
    if (finger === null) return;

    const to = request.to;
    if (to === null) {
      finger.active = false;
      return;
    }
    finger.active = true;
    finger.setPosition(to[0], to[1], 0);
    finger.setScale(1, 1, 1);

    const moveSec = UI_GUIDE_FINGER_MOVE_MS / 1000;
    const pauseSec = UI_GUIDE_FINGER_PAUSE_MS / 1000;
    const toVec = new Vec3(to[0], to[1], 0);
    const from = request.from;

    if (from === null) {
      // 点击型：在目标上方做「按下 → 抬起」的循环（GDD 3.3：点一下旋转按钮）
      const dip = new Vec3(to[0], to[1] - UI_GUIDE_TAP_DIP_PX, 0);
      tween(finger)
        .to(moveSec / 2, { position: dip, scale: new Vec3(FINGER_TAP_SCALE, FINGER_TAP_SCALE, 1) })
        .to(moveSec / 2, { position: toVec, scale: new Vec3(1, 1, 1) })
        .delay(pauseSec)
        .repeatForever()
        .start();
      return;
    }

    // 拖拽型：起点 → 终点 → 缩回起点，循环演示这条路径（GDD 3.1：拖进箱子）
    const fromVec = new Vec3(from[0], from[1], 0);
    tween(finger)
      .set({ position: fromVec.clone(), scale: new Vec3(1, 1, 1) })
      .to(moveSec, { position: toVec.clone() })
      .delay(pauseSec)
      .to(moveSec / 2, {
        position: fromVec.clone(),
        scale: new Vec3(FINGER_RELEASE_SCALE, FINGER_RELEASE_SCALE, 1),
      })
      .delay(pauseSec)
      .repeatForever()
      .start();
  }

  // ───────────────────────── 懒加载构建 ─────────────────────────

  private buildOnce(): void {
    if (this.built) return;
    this.built = true;

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);
    this.node.setPosition(0, 0, 0);

    // 遮罩 + 洞描边共用同一个 Graphics（一节点一 renderable）
    this.mask = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);

    this.finger = this.buildFinger();

    // 文案：子节点 Label（一节点一 renderable，与 Toast / SuccessOverlay 同范式）
    const labelNode = new Node('GuideLabel');
    labelNode.layer = this.node.layer;
    this.node.addChild(labelNode);
    const labelTransform = labelNode.addComponent(UITransform);
    labelTransform.setContentSize(UI_GUIDE_TEXT_WIDTH, UI_GUIDE_TEXT_LINE_HEIGHT * 2);
    labelTransform.setAnchorPoint(0.5, 0.5);
    labelNode.setPosition(0, UI_GUIDE_TEXT_Y, 0);
    const label = labelNode.addComponent(Label);
    label.string = '';
    label.fontSize = UI_GUIDE_TEXT_SIZE;
    label.lineHeight = UI_GUIDE_TEXT_LINE_HEIGHT;
    label.color = Color.fromHEX(new Color(), UI_PALETTE.surfaceCream);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.RESIZE_HEIGHT;
    this.label = label;
  }

  /** 手指示意：程序绘制的胶囊形（无贴图，M4 换美术时替换成 Sprite 即可） */
  private buildFinger(): Node {
    const node = new Node('GuideFinger');
    node.layer = this.node.layer;
    this.node.addChild(node);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(UI_GUIDE_FINGER_WIDTH, UI_GUIDE_FINGER_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);

    const g = node.addComponent(Graphics);
    const halfW = UI_GUIDE_FINGER_WIDTH / 2;
    const halfH = UI_GUIDE_FINGER_HEIGHT / 2;
    // 圆角半径 = 半宽 → 胶囊形，读起来就是"一根手指"
    const radius = halfW;
    const inset = UI_GUIDE_FINGER_BORDER_PX / 2;
    const box = (): void => {
      g.roundRect(
        -halfW + inset,
        -halfH + inset,
        UI_GUIDE_FINGER_WIDTH - inset * 2,
        UI_GUIDE_FINGER_HEIGHT - inset * 2,
        radius - inset,
      );
    };
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceCream);
    box();
    g.fill();
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.brown);
    g.lineWidth = UI_GUIDE_FINGER_BORDER_PX;
    box(); // fill 之后重画一遍再 stroke（不依赖"fill 不清 path"这个隐式行为）
    g.stroke();

    return node;
  }
}
