/**
 * 「装不下」非阻断提示条（实施计划 M2-4 / UI Spec HintToast / PRD R-10 / TDD 8.4）。
 *
 * ## 定位与约束
 *
 * - **非阻断**：本组件**不注册任何触摸监听**、**不** `propagationStopped`。
 *   Cocos 把触摸派发给所有命中节点，整屏手势根 `SafeAreaRoot` 始终会收到事件，
 *   所以即便提示条短暂出现在顶部，棋盘 / 托盘的拖拽手势也不受影响
 *   （UI Spec 13「提示出现时棋盘仍可操作」）。
 * - 小尺寸 pill 只在顶部一隅，不覆盖棋盘（UI Spec「不遮挡棋盘」）。
 * - **不持有玩法状态**，只显示一条来自 `deadlock-warning` 事件的文案。
 *
 * ## 生命周期
 *
 * `show(msg)` 幂等、可重复触发：每次都取消上一次待执行的淡出、重置并重新淡入，
 * `DEADLOCK_TOAST_MS` 后自动淡出（UI Spec「约 2s 自动淡出」）。
 */

import { Color, Component, Graphics, Label, Node, Tween, UIOpacity, UITransform, tween, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  DEADLOCK_TOAST_MS,
  UI_PALETTE,
  UI_TOAST_HEIGHT,
  UI_TOAST_RADIUS,
  UI_TOAST_WIDTH,
  UI_TOAST_Y,
} from '../core';

const { ccclass } = _decorator;

/** 淡入 / 淡出时长（ms） */
const FADE_IN_MS = 150;
const FADE_OUT_MS = 300;

@ccclass('Toast')
export class Toast extends Component {
  private built = false;
  private label: Label | null = null;
  private opacity: UIOpacity | null = null;

  override onLoad(): void {
    // 初始不可见：平时不参与渲染与命中
    this.node.active = false;
  }

  /**
   * 显示一条提示并自动淡出。幂等、可重复触发：每次都取消上一次待执行的淡出、
   * 重置并重新淡入，`DEADLOCK_TOAST_MS` 后再次淡出（UI Spec「约 2s 自动淡出」）。
   */
  show(message: string): void {
    // 取消上一次待执行的淡出（重复触发时重置计时，不叠加多个隐藏回调）
    this.unscheduleAllCallbacks();

    this.buildOnce();
    if (this.label !== null) this.label.string = message;

    this.node.active = true;

    const opacity = this.opacity;
    if (opacity !== null) {
      Tween.stopAllByTarget(opacity); // 停掉可能在飞的淡出 tween
      opacity.opacity = 0;
      tween(opacity).to(FADE_IN_MS / 1000, { opacity: 255 }).start();
    }

    if (DEBUG) console.log(`[Toast] 显示：${message}`);

    // DEADLOCK_TOAST_MS 后开始淡出
    this.scheduleOnce(this.hide, DEADLOCK_TOAST_MS / 1000);
  }

  /** 自动淡出后隐藏（由 `scheduleOnce` 调用） */
  private hide = (): void => {
    const opacity = this.opacity;
    if (opacity === null) {
      this.node.active = false;
      return;
    }
    Tween.stopAllByTarget(opacity);
    tween(opacity)
      .to(FADE_OUT_MS / 1000, { opacity: 0 })
      .call(() => {
        this.node.active = false;
      })
      .start();
  };

  private buildOnce(): void {
    if (this.built) return;
    this.built = true;

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(UI_TOAST_WIDTH, UI_TOAST_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);
    this.node.setPosition(0, UI_TOAST_Y, 0);

    // 背景：棕底（半透明）+ 奶油字——清晰的非阻断提示，不依赖颜色单通道
    const g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    const bg = Color.fromHEX(new Color(), UI_PALETTE.brown);
    bg.a = Math.round(255 * 0.92);
    g.fillColor = bg;
    g.roundRect(-UI_TOAST_WIDTH / 2, -UI_TOAST_HEIGHT / 2, UI_TOAST_WIDTH, UI_TOAST_HEIGHT, UI_TOAST_RADIUS);
    g.fill();

    // 整节点淡入淡出（UIOpacity 作用于本节点及其子节点）
    this.opacity = this.node.addComponent(UIOpacity);
    this.opacity.opacity = 0;

    // 文案：子节点 Label（一个节点只允许一个 renderable，文字挂子节点，
    // 与 SuccessOverlay 的「文字挂子节点」范式一致）
    const labelNode = new Node('ToastLabel');
    labelNode.layer = this.node.layer;
    this.node.addChild(labelNode);
    const labelTransform = labelNode.addComponent(UITransform);
    labelTransform.setContentSize(UI_TOAST_WIDTH - 24, UI_TOAST_HEIGHT);
    labelTransform.setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = '';
    label.fontSize = 15;
    label.lineHeight = 18;
    label.color = Color.fromHEX(new Color(), UI_PALETTE.surfaceCream);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.RESIZE_HEIGHT; // 过长自动换行，不裁切
    this.label = label;
  }

  /** DEBUG 对账：当前是否可见 */
  get isShowing(): boolean {
    return this.node.active && this.built;
  }
}
