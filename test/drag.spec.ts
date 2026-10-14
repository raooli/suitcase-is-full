/**
 * 拖拽算术（`core/geometry/drag.ts`）+ 棋盘命中（`core/rules/placement.itemAtCell`）。
 *
 * 这组断言的存在理由：M1-4 的验收是 **T1/T2「右下角与左上角抓取落位一致」**，
 * 而"一致"是个手感描述，靠目测截图判不准。把它翻译成可断言的不变量后：
 *
 * > **被手指压住的那一格，永远就是松手时物品占据的那一格。**
 *
 * 即 `anchorForPointerCell(p, offset) + offset === p` 对任意抓取点成立。
 * 这条一破，抓右下角就会整体跳半格——正是"手感发飘"的数学形态。
 */

import { describe, expect, it } from 'vitest';

import type { LevelSpec, Placement, RC } from '../assets/core';
import {
  anchorForPointerCell,
  grabOffsetForBoardCell,
  grabOffsetFromRatio,
  itemAtCell,
  sameRC,
} from '../assets/core';

/** 2 行 3 列的一件物品（L1 的 L01_D 就是 1×3，这里取更一般的多格形状） */
const ROWS = 2;
const COLS = 3;

describe('grabOffset：棋盘上已放置的物品', () => {
  it('抓左上角 → 偏移 (0,0)', () => {
    const anchor: RC = [2, 1];
    expect(grabOffsetForBoardCell(anchor, [2, 1])).toEqual([0, 0]);
  });

  it('抓右下角 → 偏移 (rows-1, cols-1)', () => {
    const anchor: RC = [2, 1];
    // 锚点 (2,1) 的 2×3 物品占 row 2..3 / col 1..3，右下角格 = (3,3)
    expect(grabOffsetForBoardCell(anchor, [3, 3])).toEqual([1, 2]);
  });
});

describe('T1/T2：右下角与左上角抓取落位一致', () => {
  /**
   * 同一件 2×3 物品，手指最终停在同一格 P：
   * - T1 抓左上角 → 偏移 (0,0) → 锚点 = P
   * - T2 抓右下角 → 偏移 (1,2) → 锚点 = P-(1,2)
   * 两个锚点不同（这是对的，否则物品会跳），但**被抓的那一格都落在 P**。
   */
  const pointer: RC = [4, 4];

  it('T1 抓左上角：左上格落在手指下', () => {
    const offset = grabOffsetFromRatio(0, 0, ROWS, COLS); // (0,0)
    const anchor = anchorForPointerCell(pointer, offset);
    expect(anchor).toEqual([4, 4]);
    // 被抓的那一格（锚点+偏移）=== 手指所在格
    expect([anchor[0] + offset[0], anchor[1] + offset[1]]).toEqual(pointer);
  });

  it('T2 抓右下角：右下格落在手指下', () => {
    const offset = grabOffsetFromRatio(1, 1, ROWS, COLS); // (1,2)
    expect(offset).toEqual([1, 2]);
    const anchor = anchorForPointerCell(pointer, offset);
    expect(anchor).toEqual([3, 2]);
    // 关键不变量：右下角那格仍然正好在手指下
    expect([anchor[0] + offset[0], anchor[1] + offset[1]]).toEqual(pointer);
  });

  it('不变量：任意抓取点都满足「被抓的格跟着手指」', () => {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const offset: RC = [row, col];
        for (const pointerCell of [
          [0, 0],
          [4, 4],
          [-1, 7], // 手指在棋盘外（刚从托盘拖起时的状态）也要成立
        ] as RC[]) {
          const anchor = anchorForPointerCell(pointerCell, offset);
          expect([anchor[0] + offset[0], anchor[1] + offset[1]]).toEqual(pointerCell);
        }
      }
    }
  });

  it('逆运算：先算偏移再还原锚点，等于原锚点', () => {
    const anchor: RC = [2, 1];
    const pointerCell: RC = [3, 3];
    const offset = grabOffsetForBoardCell(anchor, pointerCell);
    expect(anchorForPointerCell(pointerCell, offset)).toEqual(anchor);
  });
});

describe('grabOffsetFromRatio：从托盘拖起', () => {
  it('按下缩略图正中间 → 偏移落在中间格', () => {
    // 2 行 3 列，正中 = (0.5, 0.5) → row floor(0.5*2)=1, col floor(0.5*3)=1
    expect(grabOffsetFromRatio(0.5, 0.5, ROWS, COLS)).toEqual([1, 1]);
  });

  it('按下左上与右下角 → 两个极端格', () => {
    expect(grabOffsetFromRatio(0, 0, ROWS, COLS)).toEqual([0, 0]);
    expect(grabOffsetFromRatio(1, 1, ROWS, COLS)).toEqual([1, 2]);
  });

  it('手指压在缩略图外（槽位留白）→ 夹到边界格，不越界', () => {
    expect(grabOffsetFromRatio(-0.3, -0.3, ROWS, COLS)).toEqual([0, 0]);
    expect(grabOffsetFromRatio(1.8, 1.8, ROWS, COLS)).toEqual([1, 2]);
  });

  it('退化输入（1 格物品 / 空形状）不产生 NaN', () => {
    expect(grabOffsetFromRatio(0.5, 0.5, 1, 1)).toEqual([0, 0]);
    expect(grabOffsetFromRatio(0.5, 0.5, 0, 0)).toEqual([0, 0]);
    for (const v of grabOffsetFromRatio(Number.NaN, 0.5, 2, 2)) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });
});

describe('sameRC：拖拽节流（逐格变化才发 move）', () => {
  it('相同与不同', () => {
    expect(sameRC([1, 2], [1, 2])).toBe(true);
    expect(sameRC([1, 2], [1, 3])).toBe(false);
    expect(sameRC([1, 2], [2, 2])).toBe(false);
  });
});

// ───────────────────────── 棋盘命中 ─────────────────────────

/** 3×3 棋盘、一件 1×2 物品放在锚点 (1,1)（占 (1,1) 与 (1,2)） */
function fixture(): { level: LevelSpec; placements: Map<string, Placement> } {
  const level = {
    levelId: 1,
    title: 'T',
    board: { rows: 3, cols: 3, blockedCells: [] as RC[] },
    items: [{ id: 'A', trayOrder: 1, cells: [[0, 0], [0, 1]] as RC[] }],
  } as unknown as LevelSpec;
  const placements = new Map<string, Placement>([['A', { row: 1, col: 1, rotation: 0 } as Placement]]);
  return { level, placements };
}

describe('itemAtCell', () => {
  it('命中物品任一格 → 给回该物品的锚点', () => {
    const { level, placements } = fixture();
    expect(itemAtCell(level, placements, 1, 1)).toEqual({ itemId: 'A', anchor: [1, 1] });
    // 压在第二格上，拿到的同样是锚点 (1,1) —— 调用方据此算 grabOffset
    expect(itemAtCell(level, placements, 1, 2)).toEqual({ itemId: 'A', anchor: [1, 1] });
  });

  it('空格 / 越界 → null', () => {
    const { level, placements } = fixture();
    expect(itemAtCell(level, placements, 0, 0)).toBeNull();
    expect(itemAtCell(level, placements, -1, 1)).toBeNull();
    expect(itemAtCell(level, placements, 3, 3)).toBeNull();
  });

  it('与 grabOffset 串起来：抓第二格，偏移是 (0,1)', () => {
    const { level, placements } = fixture();
    const hit = itemAtCell(level, placements, 1, 2);
    expect(hit).not.toBeNull();
    const offset = grabOffsetForBoardCell(hit!.anchor, [1, 2]);
    expect(offset).toEqual([0, 1]);
    // 手指移到 (2,2) → 锚点 (2,1)，被抓的第二格跟着落在 (2,2)
    expect(anchorForPointerCell([2, 2], offset)).toEqual([2, 1]);
  });
});
