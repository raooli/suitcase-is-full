/**
 * 拖拽的**纯算术**（实施计划 M1-4 `DragController`）。
 *
 * 为什么单独抽出来：这段算术的错法非常隐蔽——偏半格、抓取点与落点不一致，
 * 单看画面"好像也对"，只有把「抓取的那一格始终跟着手指」写成不变量才拦得住。
 * （M1-3 的教训：同样的居中算术写在 view 里，偏了 38 设计单位却没有任何断言。）
 *
 * ## grabOffset 语义（实施计划 M1-4 注）
 *
 * `grabOffset` = **抓取那一刻，手指相对物品锚点的格偏移**，整个 move 过程保持不变。
 *
 * ```
 * anchor = 手指所在格 - grabOffset
 * ```
 *
 * 于是「手指压住的那一格」永远就是「松手时物品占据的那一格」——
 * 这就是 T1/T2「右下角与左上角抓取落位一致」的本质：
 * 抓左上角时左上格跟手，抓右下角时右下格跟手，两次的**锚点不同**，
 * 但「被抓的那一格落在手指下」这件事是一致的。若这里写成"物品中心对准手指"，
 * 抓右下角会整体跳半格，手感立刻发飘。
 *
 * ## 边界
 *
 * 只处理**格索引**的整数算术。像素质换算（`cellPx` 那一套）不在这里，
 * 唯一合法的位置是 `view/BoardView`（R-A6 / TDD 8.3 铁律 2）。
 */

import type { RC } from '../model/types';

/** 两个 `(row, col)` 是否相等（拖拽节流用：逐格变化才发 `move`） */
export function sameRC(a: RC, b: RC): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * 从棋盘上已放置的物品算抓取偏移：`offset = 手指格 - 物品锚点`。
 *
 * 结果可能为负或超出包围盒（手指压在物品的空洞格上），这是**有意的**——
 * 物品形状有洞时，"手指压住的是哪一格"就该如实反映，不要自作聪明夹到形状内。
 */
export function grabOffsetForBoardCell(anchor: RC, pointerCell: RC): RC {
  return [pointerCell[0] - anchor[0], pointerCell[1] - anchor[1]] as RC;
}

/**
 * 手指所在格 + 抓取偏移 → 物品锚点（拖拽全程用这一条）。
 *
 * 与 `grabOffsetForBoardCell` 互为逆运算，因此恒有
 * `anchorForPointerCell(p, grabOffsetForBoardCell(a, p)) === a`——
 * 单测把这条钉死，就是 T1/T2 的机械化表述。
 */
export function anchorForPointerCell(pointerCell: RC, offset: RC): RC {
  return [pointerCell[0] - offset[0], pointerCell[1] - offset[1]] as RC;
}

/**
 * 从**物品包围盒内的归一化按下位置**算抓取偏移。
 *
 * 用于「从托盘拖起」：那一刻物品还在托盘里、没有棋盘锚点，只能按
 * "手指压在缩略图的哪一格"来定偏移，语义与棋盘抓取保持一致。
 *
 * @param u 横向比例，0 = 包围盒左边，1 = 右边（**不夹取**，允许手指压在缩略图外）
 * @param v 纵向比例，0 = 包围盒上边，1 = 下边
 * @param rows 形状占的**格行数**，cols 格列数
 */
export function grabOffsetFromRatio(u: number, v: number, rows: number, cols: number): RC {
  // 非有限值按 0 处理：手指坐标理论上不会是 NaN，但一旦出现，夹取也夹不住
  // （Math.max(NaN,0) 仍是 NaN），会一路污染成"锚点变成 NaN"这类极难查的故障。
  const uu = Number.isFinite(u) ? u : 0;
  const vv = Number.isFinite(v) ? v : 0;
  const row = Math.floor(vv * Math.max(rows, 1));
  const col = Math.floor(uu * Math.max(cols, 1));
  return [clamp(row, 0, Math.max(rows - 1, 0)), clamp(col, 0, Math.max(cols - 1, 0))] as RC;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
