/**
 * 单个棋盘格的渲染（UI Spec 第 7 节 `GridCell`，四态：空白 / 障碍 / 合法 / 非法）。
 *
 * 边界：
 * - **不持有逻辑状态**。它渲染的"合法/非法"是 M1-5 `PreviewLayer` 推给它的视觉态，
 *   是否真的可放由 `core.canPlace` 决定，本组件不参与判定（架构文档 4.3）。
 * - **不做坐标转换**。它在自己节点局部坐标里画一个以中心为原点的方形，
 *   位置由 `BoardView` 设置（R-A6：转换只在 BoardView）。
 * - 用 `Graphics` 程序绘制（TDD T5 定的"占位色块"路线），不依赖任何贴图。
 */

import { Color, Component, Graphics, UITransform, _decorator } from 'cc';

import { UI_CELL_ALT_ALPHA, UI_CELL_RADIUS_RATIO, UI_PALETTE } from '../core';
import type { RC } from '../core';

const { ccclass } = _decorator;

/** 格子视觉态 */
export type CellVisual = 'normal' | 'blocked' | 'valid' | 'invalid';

@ccclass('GridCellView')
export class GridCellView extends Component {
  private cell: RC = [0, 0];
  private side = 0;
  private alternate = false;
  private visual: CellVisual = 'normal';
  private graphics: Graphics | null = null;

  /** 由 `BoardView` 在创建时调用一次。之后只通过 `setState` 改视觉 */
  init(cell: RC, side: number, alternate: boolean, visual: CellVisual): void {
    this.cell = cell;
    this.side = side;
    this.alternate = alternate;
    this.visual = visual;

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(side, side);

    this.graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.redraw();
  }

  /** 预览态切换的唯一入口 */
  setState(visual: CellVisual): void {
    if (this.visual === visual) return;
    this.visual = visual;
    this.redraw();
  }

  /** 只读，供调试日志与断言使用 */
  getCell(): RC {
    return this.cell;
  }

  private redraw(): void {
    const g = this.graphics;
    if (g === null) return;

    const side = this.side;
    const half = side / 2;
    // 圆角不能超过半边长，否则 Graphics 画出来会变形
    const radius = Math.min(side * UI_CELL_RADIUS_RATIO, half);

    g.clear();
    g.fillColor = this.fillColor();
    g.roundRect(-half, -half, side, side, radius);
    g.fill();

    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
    g.lineWidth = 1;
    g.roundRect(-half, -half, side, side, radius);
    g.stroke();

    if (this.visual === 'blocked') {
      // 障碍不只靠颜色区分（UI Spec 第 10 节第 6 条：不依赖颜色单通道）
      g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.bg);
      const arm = side * 0.22;
      g.moveTo(-arm, -arm);
      g.lineTo(arm, arm);
      g.moveTo(-arm, arm);
      g.lineTo(arm, -arm);
      g.stroke();
    }
  }

  private fillColor(): Color {
    switch (this.visual) {
      case 'blocked':
        return Color.fromHEX(new Color(), UI_PALETTE.brown);
      case 'valid':
        return Color.fromHEX(new Color(), UI_PALETTE.valid);
      case 'invalid':
        return Color.fromHEX(new Color(), UI_PALETTE.invalid);
      default: {
        const base = this.alternate ? UI_PALETTE.surfaceCream : UI_PALETTE.surfaceWhite;
        const color = Color.fromHEX(new Color(), base);
        if (this.alternate) color.a = UI_CELL_ALT_ALPHA;
        return color;
      }
    }
  }
}
