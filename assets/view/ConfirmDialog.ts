/**
 * 通用确认框（M2-3，UI Spec 149：重置弹二次确认）。
 *
 * 当前唯一用途：工具栏「重置」按钮按下后弹出，确认才 dispatch `{type:'reset'}`，
 * 取消则什么都不做。结构上是个全屏遮罩 + 居中面板 + 两按钮，**可复用**
 * （后续如需「放弃本关」之类二次确认，直接换文案复用本组件）。
 *
 * ## 输入隔离
 *
 * 遮罩（整屏）吸收所有触摸 `stopPropagation`，使背后的 `DragController`
 * （挂在 SafeAreaRoot）收不到任何手势——确认框期间输入被彻底挡住，不是只靠
 * 冻结兜底（与 `SuccessOverlay` / `ToolbarView` 同策略）。
 *
 * ## 懒加载 + 每次 `show` 重刷文案
 *
 * 与 `SuccessOverlay` 同理：构建只一次（`buildOnce`），随调用变化的文案走
 * `applyText()`——否则懒加载的 `built` 提前 return 会吞掉第二次调用的差异
 * （M1-7 教训）。
 */

import { Color, Component, EventTouch, Graphics, Label, Node, UIOpacity, UITransform, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_OVERLAY_MASK_ALPHA,
  UI_OVERLAY_PANEL_HEIGHT,
  UI_OVERLAY_PANEL_RADIUS,
  UI_OVERLAY_PANEL_WIDTH,
  UI_PALETTE,
} from '../core';

const { ccclass } = _decorator;

/** 确认框按钮尺寸（热区 ≥44，UI Spec 4 节下限之上留余量） */
const BUTTON_WIDTH = 200;
const BUTTON_HEIGHT = 48;
const BUTTON_GAP = 16;
const TITLE_Y = 60;
const MESSAGE_Y = 16;
const CONFIRM_Y = -48;
const CANCEL_Y = -104;

@ccclass('ConfirmDialog')
export class ConfirmDialog extends Component {
  /** 确认按钮被点（settled 之后才响应） */
  onConfirm: (() => void) | null = null;
  /** 取消按钮被点 */
  onCancel: (() => void) | null = null;

  private built = false;
  private settled = false;
  private titleLabel: Label | null = null;
  private messageLabel: Label | null = null;
  private confirmButton: Node | null = null;
  private cancelButton: Node | null = null;

  override onLoad(): void {
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT);
    this.node.active = false;
  }

  /**
   * 显示确认框。每次调用都重刷文案（同一次会话可能多次重置）。
   * `title` 默认「重置关卡？」，`message` 说明后果，`confirmText`/`cancelText` 按钮文案。
   */
  show(
    options: {
      title?: string;
      message?: string;
      confirmText?: string;
      cancelText?: string;
    } = {},
  ): void {
    this.buildOnce();
    this.applyText(
      options.title ?? '重置关卡？',
      options.message ?? '已放入的物品会全部退回托盘，确定吗？',
      options.confirmText ?? '确定',
      options.cancelText ?? '取消',
    );
    this.settled = true; // 确认框无需入场动画，立即可点
    this.node.active = true;
    if (DEBUG) console.log('[ConfirmDialog] 显示确认框');
  }

  /** 隐藏（确认或取消后由装配方调） */
  hide(): void {
    this.node.active = false;
    this.settled = false;
  }

  private buildOnce(): void {
    if (this.built) return;
    this.built = true;

    // 整屏遮罩：吸收触摸，挡住背后的拖拽手势
    const mask = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    mask.clear();
    const maskColor = Color.fromHEX(new Color(), UI_PALETTE.brown);
    maskColor.a = Math.round(255 * UI_OVERLAY_MASK_ALPHA);
    mask.fillColor = maskColor;
    mask.fillRect(-UI_DESIGN_WIDTH / 2, -UI_DESIGN_HEIGHT / 2, UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT);
    this.node.on(Node.EventType.TOUCH_START, (e: EventTouch) => e.propagationStopped = true, this);
    this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => e.propagationStopped = true, this);

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

    this.titleLabel = this.addLabel(panel, 'Title', '', TITLE_Y, 24, UI_PALETTE.textPrimary);
    this.messageLabel = this.addLabel(panel, 'Message', '', MESSAGE_Y, 18, UI_PALETTE.textSecondary);

    const confirm = this.addButton(panel, 'ConfirmButton', '确定', CONFIRM_Y, UI_PALETTE.accentPink, UI_PALETTE.surfaceWhite);
    confirm.on(Node.EventType.TOUCH_END, this.onConfirmTouch, this);
    this.confirmButton = confirm;

    const cancel = this.addButton(panel, 'CancelButton', '取消', CANCEL_Y, UI_PALETTE.surfaceWhite, UI_PALETTE.textSecondary);
    cancel.on(Node.EventType.TOUCH_END, this.onCancelTouch, this);
    this.cancelButton = cancel;
  }

  private applyText(title: string, message: string, confirmText: string, cancelText: string): void {
    if (this.titleLabel !== null) this.titleLabel.string = title;
    if (this.messageLabel !== null) this.messageLabel.string = message;
    const confirmLabel = this.confirmButton?.getChildByName('Label')?.getComponent(Label);
    if (confirmLabel !== null && confirmLabel !== undefined) confirmLabel.string = confirmText;
    const cancelLabel = this.cancelButton?.getChildByName('Label')?.getComponent(Label);
    if (cancelLabel !== null && cancelLabel !== undefined) cancelLabel.string = cancelText;
  }

  private addLabel(parent: Node, name: string, text: string, y: number, fontSize: number, hex: string): Label {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(0, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(UI_OVERLAY_PANEL_WIDTH - 40, fontSize * 2);
    transform.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = Color.fromHEX(new Color(), hex);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
  }

  private addButton(parent: Node, name: string, text: string, y: number, fillHex: string, textHex: string): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(0, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(BUTTON_WIDTH, BUTTON_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);
    const g = node.addComponent(Graphics);
    const box = () =>
      g.roundRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_HEIGHT / 2);
    g.fillColor = Color.fromHEX(new Color(), fillHex);
    box();
    g.fill();
    if (fillHex === UI_PALETTE.surfaceWhite) {
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
      g.lineWidth = 2;
      box();
      g.stroke();
    }
    const labelNode = new Node('Label');
    labelNode.layer = node.layer;
    node.addChild(labelNode);
    const lt = labelNode.addComponent(UITransform);
    lt.setContentSize(BUTTON_WIDTH - 8, BUTTON_HEIGHT);
    lt.setAnchorPoint(0.5, 0.5);
    const lbl = labelNode.addComponent(Label);
    lbl.string = text;
    lbl.fontSize = 22;
    lbl.lineHeight = 26;
    lbl.color = Color.fromHEX(new Color(), textHex);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    // 按钮吸收触摸：不冒泡给遮罩/背后的 SafeAreaRoot
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => e.propagationStopped = true, this);
    return node;
  }

  private onConfirmTouch(): void {
    if (!this.settled) return;
    if (DEBUG) console.log('[ConfirmDialog] 点击「确定」');
    this.onConfirm?.();
  }

  private onCancelTouch(): void {
    if (!this.settled) return;
    if (DEBUG) console.log('[ConfirmDialog] 点击「取消」');
    this.onCancel?.();
  }

  /** DEBUG 对账：当前是否显示中 */
  get isShowing(): boolean {
    return this.node.active && this.built;
  }
}
