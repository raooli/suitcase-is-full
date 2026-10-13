/**
 * 占用索引（TDD 5.3 / 4 节 `rules.board`）。
 *
 * 回答两个问题：「这一格是谁的」「这一格能不能放」。
 * 索引由 `placements` 每次重建，**不做增量维护**——36 格的重建成本 < 1μs，
 * 为了省这点开销去维护增量更新是纯粹的负债（TDD 5.3 明确裁决）。
 */

import { toIndex } from '../geometry/coords';
import { rotateBy } from '../geometry/shape';
import type { LevelSpec, Placement, RC } from '../model/types';

/** 空格 */
export const OWNER_EMPTY = -1;
/** 障碍格 */
export const OWNER_BLOCKED = -2;

/**
 * `placements` 上的占用视图。**只读**——没有任何写方法。
 *
 * 内部用 `Int32Array(rows*cols)`，值语义：
 * - `-1` 空
 * - `-2` 障碍
 * - `>= 0` 物品在本关 `items` 数组中的下标
 */
export class OccupancyIndex {
  private readonly owner: Int32Array;
  private readonly rows: number;
  private readonly cols: number;

  constructor(rows: number, cols: number, blockedCells: readonly RC[]) {
    this.rows = rows;
    this.cols = cols;
    this.owner = new Int32Array(rows * cols).fill(OWNER_EMPTY);
    for (const [r, c] of blockedCells) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        this.owner[toIndex(r, c, cols)] = OWNER_BLOCKED;
      }
    }
  }

  /** 在索引上登记一件物品的占位。用于构造期，不对外暴露成"增量更新" */
  mark(cells: readonly RC[], itemIndex: number): void {
    for (const [r, c] of cells) {
      if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
        this.owner[toIndex(r, c, this.cols)] = itemIndex;
      }
    }
  }

  /** `-1` 空 / `-2` 障碍 / `>= 0` 物品下标 */
  ownerAt(row: number, col: number): number {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return OWNER_BLOCKED;
    return this.owner[toIndex(row, col, this.cols)];
  }

  isBlocked(row: number, col: number): boolean {
    return this.ownerAt(row, col) === OWNER_BLOCKED;
  }

  isFree(row: number, col: number): boolean {
    return this.ownerAt(row, col) === OWNER_EMPTY;
  }
}

/**
 * 由 `placements` 重建占用索引。
 *
 * `placements` 里出现的 itemId 必须能在 `level.items` 里找到；
 * 找不到的条目会被**静默忽略**（不抛异常）——调用方通常是预览路径，
 * 在拖动过程中出现悬空 id 不应该让游戏崩掉。
 */
export function buildIndex(
  level: LevelSpec,
  placements: ReadonlyMap<string, Placement>,
): OccupancyIndex {
  const index = new OccupancyIndex(level.board.rows, level.board.cols, level.board.blockedCells);
  const itemIndexById = new Map<string, number>();
  level.items.forEach((item, i) => itemIndexById.set(item.id, i));
  for (const [id, placement] of placements) {
    const itemIndex = itemIndexById.get(id);
    if (itemIndex === undefined) continue;
    const item = level.items[itemIndex];
    const shape = rotateBy(item.cells, placement.rotation);
    const cells: RC[] = shape.map(([dr, dc]) => [placement.row + dr, placement.col + dc] as RC);
    index.mark(cells, itemIndex);
  }
  return index;
}

/** 棋盘可用格总数（不含障碍） */
export function usableCellCount(level: LevelSpec): number {
  return level.board.rows * level.board.cols - level.board.blockedCells.length;
}

/** 本关全部物品的形状面积之和（与是否已放置无关）。面积守恒快检用得到 */
export function totalItemCellCount(level: LevelSpec): number {
  let n = 0;
  for (const item of level.items) n += item.cells.length;
  return n;
}
