/**
 * 棋盘网格渲染 + **全项目唯一的网格坐标 ↔ 像素坐标转换点**（R-A6 / ADR A-07）。
 *
 * 为什么只允许在这里转换：拖拽偏移 bug 的经典成因就是"两个地方各算一遍 cellSize"，
 * 一处 floor、一处 round、一处没减锚点，症状是"看起来对齐了、放下却差一格"。
 * 所以本文件之外**任何文件都不许出现格边长算术**（`tools/check-arch.ts` 的 R-A6 会拦）。
 *
 * 边界：
 * - 只负责"把棋盘画出来"和"坐标换算"，**不做任何碰撞/合法性判定**（架构文档 4.3）
 * - 只读 `BoardSpec`（来自 core 的关卡数据），不持有任何玩法状态
 * - 格子用 `GridCellView` 程序绘制，节点在**运行时**创建（场景只放棋盘根节点）
 *
 * 坐标口径（与 TDD 6.3 一致）：
 * - 局部坐标原点 = 棋盘几何中心；`+y` 向上（Cocos 节点坐标）
 * - 格 `(row, col)` 的 **row 0 在最上**、col 0 在最左 → 与 GDD / core 的网格坐标一致
 */

import { Component, Node, UITransform, Vec3, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  CELL_PX_MIN,
  GRID_EPSILON,
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_HEADER_HEIGHT,
  UI_SAFE_MARGIN,
  UI_TOOLBAR_HEIGHT,
  UI_TRAY_HEIGHT,
  rcKey,
  toIndex,
  toRC,
} from '../core';
import type { BoardSpec, RC } from '../core';
import { GridCellView } from './GridCellView';

const { ccclass } = _decorator;

/** 摆放棋盘的可用区域（设计单位） */
export interface BoardArea {
  readonly width: number;
  readonly height: number;
}

@ccclass('BoardView')
export class BoardView extends Component {
  private board: BoardSpec | null = null;
  /** 当前格边长（设计单位）。**只有本文件与 core/config.ts 能碰这个量** */
  private cellPx = 0;
  private cellNodes: Node[] = [];

  // ───────────────────────── 渲染 ─────────────────────────

  /** 按棋盘规格重建网格。M1-6 起由 `state-changed` 事件驱动，MVP 不做增量 diff */
  renderBoard(board: BoardSpec): void {
    this.board = board;

    const area = this.availableArea();
    this.cellPx = BoardView.cellPxFor(board, area);

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(board.cols * this.cellPx, board.rows * this.cellPx);
    // 棋盘带（顶部信息 / 底部托盘 + 工具栏之间）居中
    this.node.setPosition(0, BoardView.boardBandCenterY(), 0);

    this.clearCells();
    const blocked = new Set(board.blockedCells.map(([r, c]) => rcKey(r, c)));
    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        const cellNode = new Node(`Cell_${row}_${col}`);
        cellNode.layer = this.node.layer;
        this.node.addChild(cellNode);
        cellNode.setPosition(this.cellCenterLocal(row, col));

        const view = cellNode.addComponent(GridCellView);
        view.init(
          [row, col] as RC,
          this.cellPx,
          (row + col) % 2 === 1,
          blocked.has(rcKey(row, col)) ? 'blocked' : 'normal',
        );
        this.cellNodes.push(cellNode);
      }
    }

    if (DEBUG) this.logDiagnostics(area);
  }

  /** 按格坐标取格子视觉态（M1-5 预览高亮用；找不到返回 null） */
  cellViewAt(row: number, col: number): GridCellView | null {
    const index = toIndex(row, col, this.board?.cols ?? 0);
    return this.cellNodes[index]?.getComponent(GridCellView) ?? null;
  }

  private clearCells(): void {
    for (const node of this.cellNodes) {
      node.removeFromParent();
      node.destroy();
    }
    this.cellNodes = [];
  }

  // ───────────────────────── 唯一的坐标转换（R-A6） ─────────────────────────

  /** 格 `(row, col)` **左上角**的局部坐标。物品落位锚点就是它 */
  gridToLocal(row: number, col: number): Vec3 {
    return new Vec3(
      -this.boardWidth() / 2 + col * this.cellPx,
      this.boardHeight() / 2 - row * this.cellPx,
      0,
    );
  }

  /** 局部坐标 → 包含该点的格（`floor` 语义：命中测试用） */
  localToGrid(x: number, y: number): RC {
    return [
      Math.floor((this.boardHeight() / 2 - y) / this.cellPx + GRID_EPSILON),
      Math.floor((x + this.boardWidth() / 2) / this.cellPx + GRID_EPSILON),
    ] as RC;
  }

  /**
   * 局部坐标 → **最近**格（`round` 语义）。
   *
   * 拖拽锚点用这个而不是 `localToGrid`：TDD 6.3 明确要求 round——
   * floor 会让物品在格子中线附近"迟一拍"才跳格，手感发滞。
   */
  snapToGrid(x: number, y: number): RC {
    return [
      Math.round((this.boardHeight() / 2 - y) / this.cellPx),
      Math.round((x + this.boardWidth() / 2) / this.cellPx),
    ] as RC;
  }

  /** 格中心局部坐标（物品节点、预览投影都按中心对齐） */
  cellCenterLocal(row: number, col: number): Vec3 {
    const corner = this.gridToLocal(row, col);
    return new Vec3(corner.x + this.cellPx / 2, corner.y - this.cellPx / 2, 0);
  }

  getCellPx(): number {
    return this.cellPx;
  }

  private boardWidth(): number {
    return (this.board?.cols ?? 0) * this.cellPx;
  }

  private boardHeight(): number {
    return (this.board?.rows ?? 0) * this.cellPx;
  }

  // ───────────────────────── 尺寸推算 ─────────────────────────

  /** 棋盘可用区域：父节点（SafeAreaRoot）的实际尺寸，取不到时退回设计画布 */
  private availableArea(): BoardArea {
    const parentSize = this.node.parent?.getComponent(UITransform)?.contentSize;
    const width = parentSize?.width ?? UI_DESIGN_WIDTH;
    const height = parentSize?.height ?? UI_DESIGN_HEIGHT;
    return {
      width: width - UI_SAFE_MARGIN * 2,
      height: height - UI_HEADER_HEIGHT - UI_TRAY_HEIGHT - UI_TOOLBAR_HEIGHT,
    };
  }

  /** 设计画布下的棋盘可用区域（P-04 体检表用，与运行时同口径） */
  static designArea(): BoardArea {
    return {
      width: UI_DESIGN_WIDTH - UI_SAFE_MARGIN * 2,
      height: UI_DESIGN_HEIGHT - UI_HEADER_HEIGHT - UI_TRAY_HEIGHT - UI_TOOLBAR_HEIGHT,
    };
  }

  /**
   * 格边长 = `min(可用宽 / cols, 可用高 / rows)` **向下取整**（UI Spec 3 节 + 实施计划 M1.B）。
   * 向下取整是为了不超框；棋盘必须完整可见且格子是正方形，不能分别伸缩 X/Y。
   */
  static cellPxFor(board: Pick<BoardSpec, 'rows' | 'cols'>, area: BoardArea): number {
    return Math.floor(Math.min(area.width / board.cols, area.height / board.rows));
  }

  /**
   * 折算到实际屏幕宽度下的物理格边长（Fit Width：设计宽度恒等于屏幕宽度）。
   * P-04 的验收口径是「320px 宽下 ≥ 44px」，靠这个换算检查。
   */
  static physicalCellPx(cellPx: number, screenWidth: number): number {
    return (cellPx * screenWidth) / UI_DESIGN_WIDTH;
  }

  /** 棋盘带的中心 y（三横带布局，UI Spec 3 节） */
  private static boardBandCenterY(): number {
    return (UI_TRAY_HEIGHT + UI_TOOLBAR_HEIGHT - UI_HEADER_HEIGHT) / 2;
  }

  /**
   * P-04 体检表：把全部关卡尺寸在设计画布下的格边长与「320px 屏折算值」打出来。
   *
   * 为什么值得单独打一张表：UI Spec 3 节要求**六种棋盘尺寸全部覆盖**，不能只针对
   * 某一尺寸调参；而 P-04 的硬下限（44px）只有折算到实际屏幕宽度才有意义
   * （Fit Width 下设计宽度恒等于屏幕宽度）。只测当前这一关是看不出问题的。
   */
  static logSizingTable(levels: readonly { levelId: number; board: BoardSpec }[]): void {
    if (levels.length === 0) return;
    const area = BoardView.designArea();
    const entries = levels.map((level) => {
      const cellPx = BoardView.cellPxFor(level.board, area);
      const at320 = BoardView.physicalCellPx(cellPx, 320);
      const flag = at320 >= CELL_PX_MIN ? '' : ' ❌';
      // 尺寸按 UI Spec 的 rows×cols 口径显示（与 core 的 board.rows/cols 一致）
      return `L${level.levelId}:${level.board.rows}×${level.board.cols}=${cellPx}(${at320.toFixed(1)}px${flag})`;
    });
    console.log(
      `[BoardView] P-04 体检（设计 ${UI_DESIGN_WIDTH}×${UI_DESIGN_HEIGHT}，可用 ${area.width}×${area.height}，` +
        `Fit Width 折算到 320px 屏，下限 ${CELL_PX_MIN}px）：${entries.join('  ')}`,
    );
  }

  // ───────────────────────── 自检（DEBUG） ─────────────────────────

  private logDiagnostics(area: BoardArea): void {
    const board = this.board;
    if (board === null) return;

    const at320 = BoardView.physicalCellPx(this.cellPx, 320);
    const verdict = at320 >= CELL_PX_MIN ? '✅' : '❌';
    console.log(
      `[BoardView] ${board.rows}×${board.cols} 格边长=${this.cellPx}（可用 ${area.width}×${area.height}）` +
        ` 棋盘 ${board.cols * this.cellPx}×${board.rows * this.cellPx}` +
        ` ｜320px 屏折算 ${at320.toFixed(1)}px ${verdict} 下限 ${CELL_PX_MIN}`,
    );
    console.log(`[BoardView] 坐标往返自检：${this.diagnoseConversion()}`);
  }

  /**
   * 逐格验证「格坐标 → 局部像素 → 格坐标」无损，并与 core 的 `toIndex`/`toRC`/`rcKey`
   * 交叉核对（M1-1 验收：与 toRC/rcKey 双向转换无偏移）。
   */
  private diagnoseConversion(): string {
    const board = this.board;
    if (board === null) return '无棋盘';
    const problems: string[] = [];

    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        const key = rcKey(row, col);
        // ① 左上角往返
        const corner = this.gridToLocal(row, col);
        const [cr, cc] = this.localToGrid(corner.x, corner.y);
        if (cr !== row || cc !== col) problems.push(`${key} 角点→${rcKey(cr, cc)}`);
        // ② 格中心往返
        const center = this.cellCenterLocal(row, col);
        const [mr, mc] = this.localToGrid(center.x, center.y);
        if (mr !== row || mc !== col) problems.push(`${key} 中心→${rcKey(mr, mc)}`);
        // ③ round 吸附：`snapToGrid` 是给**物品包围盒左上角**用的（TDD 6.3），
        //    所以这里拿格角点测——拿格中心测必然偏到下一格（中心距上下格角都是半格）。
        const [sr, sc] = this.snapToGrid(corner.x, corner.y);
        if (sr !== row || sc !== col) problems.push(`${key} 吸附→${rcKey(sr, sc)}`);
        // ④ 与 core 的线性索引口径一致（行优先）
        const index = toIndex(row, col, board.cols);
        const [ir, ic] = toRC(index, board.cols);
        if (ir !== row || ic !== col) problems.push(`${key} 索引→${rcKey(ir, ic)}`);
      }
    }

    const total = board.rows * board.cols;
    return problems.length === 0
      ? `${total} 格 × 4 项往返全部无偏移`
      : `发现 ${problems.length} 处偏移：${problems.slice(0, 6).join(' / ')}`;
  }
}
