/**
 * 网格坐标 ↔ 线性索引互转、边界检查（TDD 3 节 `geometry/coords.ts`）。
 *
 * 只处理**网格**坐标。任何与 cellSize / 像素相关的换算都不属于 core，
 * 唯一合法的位置是 `view/BoardView.localToGrid()`。
 */

import type { RC } from '../model/types';

/** `(row, col)` → 线性下标，行优先 */
export function toIndex(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/** 线性下标 → `(row, col)` */
export function toRC(index: number, cols: number): RC {
  return [Math.floor(index / cols), index % cols] as RC;
}

export function inBounds(row: number, col: number, rows: number, cols: number): boolean {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

/**
 * 归一化锚点使其整体落在棋盘内（TDD 6.5）。
 * 只在「形状比棋盘小」时有意义——形状比棋盘大时 clamp 无法挽救，调用方需另行判断。
 */
export function clampAnchor(row: number, col: number, rows: number, cols: number, h: number, w: number): RC {
  const r = Math.min(Math.max(row, 0), Math.max(rows - h, 0));
  const c = Math.min(Math.max(col, 0), Math.max(cols - w, 0));
  return [r, c] as RC;
}

/** 稳定字符串键，用于 Set / Map 去重 */
export function rcKey(row: number, col: number): string {
  return `${row},${col}`;
}
