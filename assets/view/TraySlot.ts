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

import { Color, Component, Graphics, Node, UITransform, _decorator } from 'cc';

import {
  UI_PALETTE,
  UI_TRAY_SELECT_BORDER,
  UI_TRAY_SLOT_PADDING,
  UI_TRAY_SLOT_RADIUS,
  fitThumbnail,
} from '../core';

const { ccclass } = _decorator;

/** 槽位视觉态。`drop-target` 是取出拖拽时的目标高亮；`hint` 是提示高亮（M2-2） */
export type SlotVisual = 'normal' | 'selected' | 'drop-target' | 'hint';

@ccclass('TraySlot')
export class TraySlot extends Component {
  private itemId = '';
  private side = 0;
  private visual: SlotVisual = 'normal';
  private graphics: Graphics | null = null;
  /** 当前缩略图节点与其缩放后的像素尺寸（DEBUG 对账用，也是 `setItem` 的记账） */
  private itemNode: Node | null = null;
  private itemSize: { readonly width: number; readonly height: number } | null = null;
  /**
   * 物品的**格数**（不是像素）。M1-4 从托盘拖起时，要按"手指压在缩略图的哪一格"
   * 算 `grabOffset`，所以这里得记住形状尺寸。
   *
   * 存格数而不是让调用方再算一遍：包围盒格数是渲染时就已知的量，
   * 再算一遍等于给"托盘看着是竖的、落盘变成横的"这类错位开第二个口子。
   */
  private shapeRows = 0;
  private shapeCols = 0;
  /**
   * 两个**独立**的显隐理由，必须分开记（M2-11 起）：
   * - `inWindow`：横向滚动是否把这个槽位带进可见窗口（M2-11 取代 M1-3 的
   *   `markOverflow`——现在所有槽位都建，靠滚动露出，溢出件不再永久隐藏）；
   * - `dragHidden`：拖拽中排除（M1-6，物品被拖起时槽位跟着藏，防幽灵）。
   *
   * 合成规则 `active = inWindow && !dragHidden`。分开记的理由：滚动时不该把
   * "正在被拖"的槽位放出来，拖拽结束也不该把"滚出窗外"的槽位放回来。
   */
  private inWindow = true;
  private dragHidden = false;

  /**
   * 本槽位**不注册任何触摸监听**（M1-4 起）。
   *
   * 原因很实在：Cocos 由"手指按下时命中的最深节点"认领整次触摸，而松手时
   * 若手指已不在该节点内，引擎派发的是 **TOUCH_CANCEL 而不是 TOUCH_END**
   * （`NodeEventProcessor._handleTouchEnd`）。槽位只有 76×76，从托盘拖到棋盘
   * 松手必然在它外面 → 拖拽永远收不到"松手"。
   *
   * 点选因此上移给 `DragController`（它挂在覆盖整屏的 `SafeAreaRoot` 上），
   * 顺带把"点 vs 拖"的仲裁收在一处——这正是 M1-3 注释里留给 M1-4 的活。
   */

  /** 由 `TrayView` 在创建时调用一次；之后只通过 `setVisual` 改外观 */
  init(itemId: string, side: number): void {
    this.itemId = itemId;
    this.side = side;

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(side, side);

    this.graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.redraw();
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
  setItem(node: Node, rows: number, cols: number): void {
    const transform = node.getComponent(UITransform);
    if (transform === null) return;

    const size = transform.contentSize;
    const fit = fitThumbnail(size.width, size.height, this.side, UI_TRAY_SLOT_PADDING);
    node.setScale(fit.scale, fit.scale, 1);
    node.setPosition(fit.x, fit.y, 0);

    this.itemNode = node;
    this.itemSize = { width: fit.width, height: fit.height };
    this.shapeRows = rows;
    this.shapeCols = cols;
  }

  /** 缩略图节点（M1-4 命中测试后要把按下点换算进去） */
  getItemNode(): Node | null {
    return this.itemNode;
  }

  /**
   * 是否落在可见窗口内（M2-11 横向滚动）。滚出窗外的槽位整块隐藏——
   * 既不可见也不可命中（`TrayView.hitTest` 跳过 `active=false` 的槽位）。
   */
  setInWindow(inWindow: boolean): void {
    if (this.inWindow === inWindow) return;
    this.inWindow = inWindow;
    this.updateActive();
  }

  /**
   * 拖拽中排除 / 恢复（M1-6）。`hidden === true` 时物品被拖起，
   * 槽位跟着藏——拖拽中被拖物品还显示在托盘里 = 幽灵物品。
   * 与"滚出窗外"是两个独立理由，合成见 `updateActive`。
   */
  setHidden(hidden: boolean): void {
    this.dragHidden = hidden;
    this.updateActive();
  }

  /** 合成最终显隐：在窗内 且 未被拖拽排除 */
  private updateActive(): void {
    this.node.active = this.inWindow && !this.dragHidden;
  }

  /** 物品的格数 `{rows, cols}`；还没装物品时是 `{0,0}` */
  getShape(): { readonly rows: number; readonly cols: number } {
    return { rows: this.shapeRows, cols: this.shapeCols };
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

  private redraw(): void {
    const g = this.graphics;
    if (g === null) return;

    const half = this.side / 2;
    const radius = Math.min(UI_TRAY_SLOT_RADIUS, half);

    g.clear();
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceWhite);
    g.roundRect(-half, -half, this.side, this.side, radius);
    g.fill();

    // 视觉态只靠描边区分（不依赖颜色单通道：形状 + 线宽同时变化）
    let strokeHex: string = UI_PALETTE.border;
    let lineWidth = 1;
    if (this.visual === 'drop-target') {
      strokeHex = UI_PALETTE.valid;
      lineWidth = UI_TRAY_SELECT_BORDER;
    } else if (this.visual === 'hint') {
      // 提示高亮：蓝色描边（与棋盘蓝一致，UI Spec 152 免费提示）
      strokeHex = UI_PALETTE.surfaceBlue;
      lineWidth = UI_TRAY_SELECT_BORDER;
    } else if (this.visual === 'selected') {
      strokeHex = UI_PALETTE.accentPink;
      lineWidth = UI_TRAY_SELECT_BORDER;
    }
    g.strokeColor = Color.fromHEX(new Color(), strokeHex);
    g.lineWidth = lineWidth;
    g.roundRect(-half, -half, this.side, this.side, radius);
    g.stroke();
  }
}
