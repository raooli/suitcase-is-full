/**
 * 形状代数：归一化、旋转、包围盒、连通性（TDD 6.1）。
 *
 * 全部是纯函数，无副作用、无外部依赖。这是一个多项式时间的模块，
 * 也是整个项目里最值得写单测的一段代码。
 */

import type { RC, Rotation } from '../model/types';

/** 顺时针 90° 的坐标映射：`(r, c) → (c, -r)` */
export function rotateCW(cells: readonly RC[]): RC[] {
  return normalize(cells.map(([r, c]) => [c, -r] as RC));
}

/** 平移到 `minRow = minCol = 0`，并按 `(row, col)` 字典序排序 */
export function normalize(cells: readonly RC[]): RC[] {
  if (cells.length === 0) return [];
  let minR = Infinity;
  let minC = Infinity;
  for (const [r, c] of cells) {
    if (r < minR) minR = r;
    if (c < minC) minC = c;
  }
  return cells
    .map(([r, c]) => [r - minR, c - minC] as RC)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** 顺时针旋转 `n` 次并归一化。`n` 会先取模 4 */
export function rotateBy(cells: readonly RC[], n: Rotation | number): RC[] {
  let out = normalize(cells);
  const times = ((n % 4) + 4) % 4;
  for (let i = 0; i < times; i++) out = rotateCW(out);
  return out;
}

/** 逆时针 90°，仅用于测试与调试 */
export function rotateCCW(cells: readonly RC[]): RC[] {
  return normalize(cells.map(([r, c]) => [-c, r] as RC));
}

export interface BBox {
  readonly height: number;
  readonly width: number;
  readonly maxRow: number;
  readonly maxCol: number;
}

export function bboxOf(cells: readonly RC[]): BBox {
  let maxR = 0;
  let maxC = 0;
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { height: maxR + 1, width: maxC + 1, maxRow: maxR, maxCol: maxC };
}

/** 4 连通校验。关卡数据里出现断裂形状会让碰撞检测的假设失效，必须在加载期挡住 */
export function isConnected(cells: readonly RC[]): boolean {
  if (cells.length <= 1) return cells.length === 1;
  const key = (r: number, c: number) => `${r},${c}`;
  const set = new Set(cells.map(([r, c]) => key(r, c)));
  if (set.size !== cells.length) return false; // 有重复格
  const seen = new Set<string>();
  const start = key(cells[0][0], cells[0][1]);
  const queue: RC[] = [cells[0]];
  seen.add(start);
  while (queue.length > 0) {
    const [r, c] = queue.pop()!;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const k = key(r + dr, c + dc);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([r + dr, c + dc] as RC);
      }
    }
  }
  return seen.size === cells.length;
}

/** 形状是否每格都不同（无重复坐标） */
export function hasDuplicates(cells: readonly RC[]): boolean {
  return new Set(cells.map(([r, c]) => `${r},${c}`)).size !== cells.length;
}

/** 稳定字符串键，用于去重与缓存 */
export function cellsToKey(cells: readonly RC[]): string {
  return cells.map(([r, c]) => `${r},${c}`).join(';');
}

/**
 * 一件物品在 `rotatable` 约束下的**去重**朝向列表。
 *
 * 去重是必要的：2×2 正方形旋转后 `cells` 完全相同，
 * 枚举 4 次会让求解器做 4 倍无用功。
 * 但注意——**去重只用于算法，不能用来禁用旋转按钮**（TDD 6.1 单测第 3 条）。
 */
export function rotationVariants(
  cells: readonly RC[],
  rotatable: boolean,
): Array<{ rotation: Rotation; cells: RC[] }> {
  const out: Array<{ rotation: Rotation; cells: RC[] }> = [];
  const seen = new Set<string>();
  const rotations: Rotation[] = rotatable ? [0, 1, 2, 3] : [0];
  for (const r of rotations) {
    const shape = rotateBy(cells, r);
    const key = cellsToKey(shape);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ rotation: r, cells: shape });
  }
  return out;
}

/** 复制一份 cells，切断与调用方的引用共享 */
export function cloneCells(cells: readonly RC[]): RC[] {
  return cells.map(([r, c]) => [r, c] as RC);
}
