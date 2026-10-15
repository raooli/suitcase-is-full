/**
 * 「取出」判定单测（PRD R-06b / TDD 7.3 规则 1 / UI Spec 6 节 / O11）。
 *
 * 重点是**边界语义**：外扩半格处恰好落在边界上算「还没出」（严格大于），
 * 因为外扩半格本身就是防误触的缓冲带，把边界也算成"已出"等于把缓冲带吃掉一半。
 */

import { describe, expect, it } from 'vitest';

import { isTakeoutPosition } from '../assets/core/geometry/takeout';

/** 3×3 棋盘、格边长 100 → 棋盘 300×300，外扩半格后边界在 ±200 */
const W = 300;
const H = 300;
const UNIT = 100;

describe('isTakeoutPosition：物品中心 vs 棋盘外扩半格', () => {
  it('中心在棋盘内 → 不是取出（含贴棋盘边）', () => {
    expect(isTakeoutPosition(0, 0, W, H, UNIT)).toBe(false); // 正中央
    expect(isTakeoutPosition(149, 149, W, H, UNIT)).toBe(false); // 贴近棋盘边（内侧）
    expect(isTakeoutPosition(150, 150, W, H, UNIT)).toBe(false); // 恰好贴棋盘边
    expect(isTakeoutPosition(-150, -150, W, H, UNIT)).toBe(false); // 对侧同理
  });

  it('中心恰好在外扩半格处 → 仍不算出（缓冲带不被吃掉）', () => {
    expect(isTakeoutPosition(200, 0, W, H, UNIT)).toBe(false); // x 贴外扩边界
    expect(isTakeoutPosition(0, 200, W, H, UNIT)).toBe(false); // y 贴外扩边界
    expect(isTakeoutPosition(-200, -200, W, H, UNIT)).toBe(false); // 对角
  });

  it('中心越过外扩半格 → 取出', () => {
    expect(isTakeoutPosition(200.01, 0, W, H, UNIT)).toBe(true);
    expect(isTakeoutPosition(0, -200.01, W, H, UNIT)).toBe(true);
    expect(isTakeoutPosition(250, -250, W, H, UNIT)).toBe(true); // 拖去托盘/页头都算
  });

  it('非正方形棋盘：两个方向各自独立判定', () => {
    // 300×200 的棋盘，unit=100 → 外扩边界 x=±200、y=±150
    expect(isTakeoutPosition(0, 150, 300, 200, UNIT)).toBe(false); // y 贴边
    expect(isTakeoutPosition(0, 150.01, 300, 200, UNIT)).toBe(true); // y 出界
    expect(isTakeoutPosition(200, 0, 300, 200, UNIT)).toBe(false); // x 贴边
    expect(isTakeoutPosition(200.01, 0, 300, 200, UNIT)).toBe(true); // x 出界
  });

  it('外扩量随格边长缩放（大棋盘缓冲带更宽）', () => {
    // 格边长 40 → 外扩 20 → 边界 x=±170
    expect(isTakeoutPosition(170, 0, W, H, 40)).toBe(false);
    expect(isTakeoutPosition(170.01, 0, W, H, 40)).toBe(true);
  });

  it('unit=0 的退化情形不崩（退化为"棋盘边即边界"）', () => {
    expect(isTakeoutPosition(150, 0, W, H, 0)).toBe(false);
    expect(isTakeoutPosition(150.01, 0, W, H, 0)).toBe(true);
  });
});
