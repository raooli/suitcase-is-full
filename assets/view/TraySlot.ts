/**
 * 托盘里的**一个槽位**（UI Spec 7 节 `TraySlot`）。
 *
 * 边界（与其它 view 组件同构）：
 * - 只画自己这张卡片 + 装一件物品的缩略图，**不做任何逻辑判定**；
 * - **不做格算术**：物品按棋盘的包围盒画好，这里只**整体缩放**塞进槽位
 *   （纯像素比），托盘因此不需要第二套格边长（R-A6 的初衷就是这个）；
 * - 不持有选中状态——`selected` 只是"当前该显示成什么样"，真相在 `state.selectedId`。
 *
 * 为什么用"缩放"而不是"按托盘格边长重画"：重画就要在托盘里再算一遍
 * `unit = min(槽宽/cols, 槽高/rows)`，那是第二个格→像素转换点，
 * 一旦与棋盘口径不一致就会出现"托盘看着是竖的、落盘变成横的"这类错位。
 * 缩放是像素到像素，天然没有这个风险，且 M4-5 换真图后行为一致。
 */

import { Color, Component, EventTouch, Graphics, Node, UITransform, _decorator } from 'cc';

import {
  UI_PALETTE,
  UI_TRAY_SELECT_BORDER,
  UI_TRAY_SLOT_PADDING,
  UI_TRAY_SLOT_RADIUS,
  fitThumbnail,
} from '../core';

const { ccclass } = _decorator;

/** 槽位视觉态。`drop-target` 是取出拖拽时的目标高亮（M1-5/M2 接） */
export type SlotVisual = 'normal' | 'selected' | 'drop-target';

@ccclass('TraySlot')
export class TraySlot extends Component {
  private itemId = '';
  private side = 0;
  private visual: SlotVisual = 'normal';
  private graphics: Graphics | null = null;
  /** 当前缩略图节点与其缩放后的像素尺寸（DEBUG 对账用，也是 `setItem` 的记账） */
  private itemNode: Node | null = null;
  private itemSize: { readonly width: number; readonly height: number } | null = null;

  /** 点选回调。由 `TrayView` 注入；值是**物品 id**，不是状态 */
  onSelect: ((itemId: string) => void) | null = null;

  /** 由 `TrayView` 在创建时调用一次；之后只通过 `setVisual` 改外观 */
  init(itemId: string, side: number): void {
    this.itemId = itemId;
    this.side = side;

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(side, side);

    this.graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.redraw();
  }

  onDestroy(): void {
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  setVisual(visual: SlotVisual): void {
    if (this.visual === visual) return;
    this.visual = visual;
    this.redraw();
  }

  getItemId(): string {
    return this.itemId;
  }

  /**
   * 把物品节点装进槽位：等比缩放并居中。
   *
   * 算术本身在 core 的 `fitThumbnail()`（纯函数、有单测）——本方法只负责把结果
   * 落到节点上。首版把这段算式写在这里，偏了半个槽位却没有任何断言能拦住，
   * 提到 core 之后"居中 + 不溢出"是**可被测试的不变量**。
   *
   * ⚠️ 两套锚点：本节点锚点是**中心**（返回值以此为中心为原点），
   * 而物品节点锚点在**左上角**（`ItemView`，`y` 是包围盒左上角的落点）。
   */
  setItem(node: Node): void {
    const transform = node.getComponent(UITransform);
    if (transform === null) return;

    const size = transform.contentSize;
    const fit = fitThumbnail(size.width, size.height, this.side, UI_TRAY_SLOT_PADDING);
    node.setScale(fit.scale, fit.scale, 1);
    node.setPosition(fit.x, fit.y, 0);

    this.itemNode = node;
    this.itemSize = { width: fit.width, height: fit.height };
  }

  /** DEBUG 对账用。带上缩略图的落点，居中与否在日志里就能核，不用靠截图目测 */
  describe(): string {
    const size = this.itemSize;
    const at = this.itemNode?.position ?? null;
    const thumb =
      size === null || at === null
        ? '无缩略图'
        : `缩略${Math.round(size.width)}×${Math.round(size.height)}@(${Math.round(at.x)},${Math.round(at.y)})`;
    return `${this.itemId}@${this.side}px(${this.visual}) ${thumb}`;
  }

  private onTouchEnd(event: EventTouch): void {
    // 必须掐断冒泡：否则会一路冒到 `TrayRoot` 的"点空白取消选中"，
    // 结果是"点一下物品 → 选中 → 立刻被取消"，现象极像没写选中逻辑。
    event.propagationStopped = true;
    this.onSelect?.(this.itemId);
  }

  private redraw(): void {
    const g = this.graphics;
    if (g === null) return;

    const half = this.side / 2;
    const radius = Math.min(UI_TRAY_SLOT_RADIUS, half);
    const selected = this.visual !== 'normal';

    g.clear();
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceWhite);
    g.roundRect(-half, -half, this.side, this.side, radius);
    g.fill();

    // 选中态只靠描边区分（不依赖颜色单通道：形状 + 线宽同时变化）
    g.strokeColor = Color.fromHEX(
      new Color(),
      this.visual === 'drop-target' ? UI_PALETTE.valid : selected ? UI_PALETTE.accentPink : UI_PALETTE.border,
    );
    g.lineWidth = selected ? UI_TRAY_SELECT_BORDER : 1;
    g.roundRect(-half, -half, this.side, this.side, radius);
    g.stroke();
  }
}
