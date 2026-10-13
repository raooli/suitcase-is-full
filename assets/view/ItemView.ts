/**
 * 一件物品的**占位渲染**（实施计划 M1-2）。
 *
 * 边界（与 `GridCellView` 同构，别越界）：
 * - **不做 RC ↔ 像素转换**。包围盒尺寸与逐格中心偏移由 `BoardView.shapeMetrics()` 给，
 *   格边长由 `BoardView.getCellPx()` 给（参数名 `unit`），本文件只做
 *   "以单格为尺子的绘制细节"（内缩 / 圆角 / 居中）——这是 R-A6 允许的那部分。
 * - **不持有玩法状态**。是否在盘上、朝向如何，都是调用方说了算（M1-6 起由事件驱动）。
 * - **不加载资源**。色块用 `Graphics` 画（TDD T5 路线）；`setSpriteFrame()` 只是桩，
 *   M4-5 换真图时结构不动。
 *
 * 两条验收都落在这一层：
 * - 「1 格物品看起来是 1 格」→ 节点尺寸**严格等于**包围盒 `rows × cols` 个格
 *   （TDD 17.4：占位图按最终规格的包围盒绘制，换真图布局不跳）。
 * - 「相邻物品明度可区分」→ 填充色 = 基色按 trayOrder 轮换 × 按占格数分档（core/palette）。
 */

import { Color, Component, Graphics, SpriteFrame, UITransform, Vec3, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_ITEM_BORDER_PX,
  UI_ITEM_CELL_INSET_RATIO,
  UI_ITEM_RADIUS_RATIO,
  UI_PALETTE,
  itemFillHex,
} from '../core';
import type { ItemSpec } from '../core';

const { ccclass } = _decorator;

/** 形状的像素指标。`BoardView` 产出（唯一的格算术出口），`ItemView` 只消费 */
export interface ShapeMetrics {
  /** 包围盒像素尺寸 */
  readonly size: { readonly width: number; readonly height: number };
  /** 每格中心相对包围盒左上角的局部偏移，顺序与 `cells` 一致 */
  readonly centers: readonly Vec3[];
  /** 包围盒的格数（DEBUG 对账用：尺寸应等于 `rows × cols` 个格） */
  readonly rows: number;
  readonly cols: number;
}

@ccclass('ItemView')
export class ItemView extends Component {
  private itemId = '';
  private unit = 0;
  private metrics: ShapeMetrics | null = null;
  private fillHex = '#FFFFFF';
  private graphics: Graphics | null = null;
  /** M4-5 之前只登记不渲染 */
  private spriteFrame: SpriteFrame | null = null;

  /**
   * @param item   物品规格（只读；着色取 `trayOrder` 与 `cells.length`）
   * @param unit   单格边长像素，来自 `BoardView.getCellPx()`
   * @param metrics 包围盒尺寸与逐格中心偏移，来自 `BoardView`
   */
  init(item: ItemSpec, unit: number, metrics: ShapeMetrics): void {
    this.itemId = item.id;
    this.unit = unit;
    this.metrics = metrics;
    this.fillHex = itemFillHex(item.trayOrder, item.cells.length);

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(metrics.size.width, metrics.size.height);
    // 锚点固定在**左上角**：与 `BoardView.gridToLocal`（格左上角口径）对齐，
    // 这样"摆放位置 = 锚点格左上角"，不用在两处各减一次半格。
    transform.setAnchorPoint(0, 1);

    this.graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.redraw();
  }

  /**
   * M4-5 换真图的接口桩（M1-2 要求：**换图不动结构**）。
   *
   * 签名现在就定死，M4-5 只需把方法体换成"挂 Sprite / 关 Graphics"，
   * 所有调用方一行都不用改。
   */
  setSpriteFrame(frame: SpriteFrame | null): void {
    this.spriteFrame = frame;
    if (frame !== null && DEBUG) {
      console.warn(
        `[ItemView] ${this.itemId} 收到 SpriteFrame，但真图渲染在 M4-5；当前仍是程序化色块`,
      );
    }
  }

  /** 已登记的贴图（M4-5 之前恒为 null）。M1-3 起托盘/棋盘节点靠 `getItemId()` 反查 */
  getSpriteFrame(): SpriteFrame | null {
    return this.spriteFrame;
  }

  getItemId(): string {
    return this.itemId;
  }

  /**
   * DEBUG 对账用：把「逻辑格数 / 包围盒像素 / 单格边长」三个数摆在一起，
   * 「1 格物品看起来是 1 格」就是靠这三个数自洽看出来的
   * （例如 1×2 格、单格 57px 时，节点应为 114×57px）。
   */
  describe(): string {
    const metrics = this.metrics;
    if (metrics === null) return `${this.itemId}(未初始化)`;
    return (
      `${this.itemId} ${metrics.rows}×${metrics.cols}格=${metrics.size.width}×${metrics.size.height}px` +
      ` @${this.unit}px ${this.fillHex}`
    );
  }

  private redraw(): void {
    const g = this.graphics;
    const metrics = this.metrics;
    if (g === null || metrics === null) return;

    // 每格留一道内缩缝：多格物品才**数得出格数**（TDD 17.6 A-01 缩略图测试）
    const inset = this.unit * UI_ITEM_CELL_INSET_RATIO;
    const side = this.unit - inset * 2;
    const radius = Math.min(side * UI_ITEM_RADIUS_RATIO, side / 2);

    const fill = Color.fromHEX(new Color(), this.fillHex);
    const stroke = Color.fromHEX(new Color(), UI_PALETTE.brown);

    g.clear();
    for (const center of metrics.centers) {
      const x = center.x - side / 2;
      const y = center.y - side / 2;
      g.fillColor = fill;
      g.roundRect(x, y, side, side, radius);
      g.fill();
      g.strokeColor = stroke;
      g.lineWidth = UI_ITEM_BORDER_PX;
      g.roundRect(x, y, side, side, radius);
      g.stroke();
    }
  }
}
