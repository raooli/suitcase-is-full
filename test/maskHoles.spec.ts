/**
 * 蒙层挖洞单测（UI Spec 5.2「蒙层高亮」/ 实施计划 M2-6）。
 *
 * 断言的主轴是**面积守恒**：画出来的遮罩面积必须等于「整屏 − 洞的并集」，
 * 且不重叠。这样无论洞怎么摆（贴边 / 重叠 / 出界 / 多个），只要面积对得上，
 * 就不会出现"漏一条缝"或"该亮的地方被压暗"。
 */

import { describe, expect, it } from 'vitest';

import { maskBands, screenRect } from '../assets/core/geometry/maskHoles';
import type { Rect } from '../assets/core/geometry/maskHoles';

/** 100×100 的屏幕（设计坐标原点在中心 → 左下角 (−50,−50)） */
const W = 100;
const H = 100;

function areaOf(rects: readonly Rect[]): number {
  return rects.reduce((sum, r) => sum + r.w * r.h, 0);
}

/** 两块是否重叠（面积法：任意两块都不该有交集） */
function hasOverlap(rects: readonly Rect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapW > 1e-6 && overlapH > 1e-6) return true;
    }
  }
  return false;
}

/** 断言：遮罩面积 = 整屏 − 洞并集面积，且块不重叠、都在屏内 */
function expectMask(width: number, height: number, holes: readonly Rect[], holeArea: number): Rect[] {
  const bands = maskBands(width, height, holes);
  expect(hasOverlap(bands)).toBe(false);
  const screen = screenRect(width, height);
  for (const b of bands) {
    expect(b.x).toBeGreaterThanOrEqual(screen.x - 1e-6);
    expect(b.y).toBeGreaterThanOrEqual(screen.y - 1e-6);
    expect(b.x + b.w).toBeLessThanOrEqual(screen.x + screen.w + 1e-6);
    expect(b.y + b.h).toBeLessThanOrEqual(screen.y + screen.h + 1e-6);
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
  }
  expect(areaOf(bands)).toBeCloseTo(width * height - holeArea, 6);
  return bands;
}

describe('maskBands：整屏遮罩挖洞', () => {
  it('无洞 → 一整块（屏幕矩形本身）', () => {
    const bands = expectMask(W, H, [], 0);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ x: -50, y: -50, w: 100, h: 100 });
  });

  it('居中一个洞 → 上下左右四块', () => {
    const hole = { x: -10, y: -10, w: 20, h: 20 };
    const bands = expectMask(W, H, [hole], 400);
    expect(bands).toHaveLength(4);
    // 上下两条通栏 + 左右两条（中间那条带的左右两块）
    expect(bands.filter((b) => b.w === 100)).toHaveLength(2);
    expect(bands.filter((b) => b.w === 40)).toHaveLength(2);
  });

  it('洞贴左边 → 少一块（贴边那侧没有剩余）', () => {
    const hole = { x: -50, y: -10, w: 20, h: 20 };
    const bands = expectMask(W, H, [hole], 400);
    expect(bands).toHaveLength(3);
  });

  it('洞占满整屏 → 一块都不画（返回空）', () => {
    const bands = maskBands(W, H, [{ x: -50, y: -50, w: 100, h: 100 }]);
    expect(bands).toHaveLength(0);
  });

  it('两个洞上下分布 → 切成更多条带，面积仍守恒', () => {
    const holes = [
      { x: -40, y: 10, w: 30, h: 20 },
      { x: 10, y: -30, w: 30, h: 20 },
    ];
    const bands = expectMask(W, H, holes, 600 + 600);
    // 两个洞的 y 区间互不重叠 → 中间那条带是通栏的
    expect(bands.some((b) => b.w === 100)).toBe(true);
  });

  it('两个洞在同一水平带 → 中间多出一块遮罩', () => {
    const holes = [
      { x: -40, y: -10, w: 20, h: 20 },
      { x: 20, y: -10, w: 20, h: 20 },
    ];
    const bands = expectMask(W, H, holes, 400 + 400);
    // 中间那块：x ∈ [−20, 20] → 宽 40、高 20
    expect(bands).toContainEqual({ x: -20, y: -10, w: 40, h: 20 });
  });

  it('洞超出屏幕 → 先夹取再挖，面积守恒', () => {
    // 洞 x,y ∈ [−80,−20]，屏幕是 [−50,50] → 屏内部分只有 [−50,−20]² = 30×30
    const holes = [{ x: -80, y: -80, w: 60, h: 60 }];
    const bands = expectMask(W, H, holes, 30 * 30);
    expect(bands).toHaveLength(2); // 贴着左下角 → 上一条通栏 + 右一块
  });

  it('洞完全在屏幕外 → 等同无洞', () => {
    const bands = maskBands(W, H, [{ x: 200, y: 200, w: 20, h: 20 }]);
    expect(bands).toHaveLength(1);
    expect(areaOf(bands)).toBeCloseTo(W * H, 6);
  });

  it('洞重叠 → 并集只算一次，不产生重复块', () => {
    const holes = [
      { x: -20, y: -20, w: 40, h: 40 },
      { x: 0, y: 0, w: 40, h: 40 },
    ];
    // 并集：40×40 + 40×40 − 20×20（交集）= 2800
    expectMask(W, H, holes, 2800);
  });

  it('零面积洞被忽略（不产生额外切分）', () => {
    const bands = expectMask(W, H, [{ x: 0, y: 0, w: 0, h: 0 }], 0);
    expect(bands).toHaveLength(1);
  });

  it('非正方形屏幕（390×844 设计尺寸）同样守恒', () => {
    const holes = [{ x: -45, y: -400, w: 72, h: 56 }]; // 工具栏「旋转」按钮那一块
    expectMask(390, 844, holes, 72 * 56);
  });
});
