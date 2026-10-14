/**
 * 拖起视觉补偿（`core/geometry/lift.ts`）。
 *
 * 这组断言的存在理由：G1-1 要求「手指不遮挡目标格」，实现方式是**上浮 + 轻微放大**
 * 的纯绘制补偿。它有两个极易写错的地方，且都**看不出明显异常**：
 *
 * 1. **缩放锚点取错**——取单格中心而不是整体包围盒中心，多格物品会散成几块
 *    （格缝被成倍拉开）。在 1.05 这种小倍率下肉眼几乎不可见，只有算才知道；
 * 2. **上浮改到了判定**——一旦把偏移加进 `anchor` 或节点位置，G1-2
 *    「松手落格 = 预览所示格」就破了，而且破得很隐蔽（差半格）。
 *
 * 所以这里钉死四条不变量：恒等、中心不动、上浮只改 y、格缝按比例缩放不重叠。
 */

import { describe, expect, it } from 'vitest';

import {
  UI_DRAG_LIFT_PX,
  UI_DRAG_LIFT_SCALE,
  UI_ITEM_CELL_INSET_RATIO,
  centerOf,
  liftAndScale,
  offsetRects,
} from '../assets/core';
import type { Rect } from '../assets/core';

/** 棋盘格 114（L1 实测值），内缩后单格色块边长 */
const CELL = 114;
const SIDE = CELL - CELL * UI_ITEM_CELL_INSET_RATIO * 2;

/** 1×2 物品在 corner=(0,0) 处的两格矩形（与 PreviewLayer 的构造同口径） */
const twoCells: Rect[] = [
  { x: CELL / 2 - SIDE / 2, y: -CELL / 2 - SIDE / 2, w: SIDE, h: SIDE },
  { x: CELL * 1.5 - SIDE / 2, y: -CELL / 2 - SIDE / 2, w: SIDE, h: SIDE },
];

describe('centerOf', () => {
  it('两格横向并排：中心在整体包围盒中心（不是某一格中心）', () => {
    const c = centerOf(twoCells);
    // 包围盒 x：6.84 → 221.16，中心 114；y：-107.16 → -6.84，中心 -57
    expect(c.x).toBeCloseTo(CELL, 6);
    expect(c.y).toBeCloseTo(-CELL / 2, 6);
  });

  it('空数组退回原点（除零保护，不抛异常）', () => {
    expect(centerOf([])).toEqual({ x: 0, y: 0 });
  });
});

describe('liftAndScale', () => {
  it('scale=1 / lift=0 → 原样返回（恒等）', () => {
    const out = liftAndScale(twoCells, 1, 0);
    expect(out).toHaveLength(2);
    out.forEach((r, i) => {
      expect(r.x).toBeCloseTo(twoCells[i]!.x, 6);
      expect(r.y).toBeCloseTo(twoCells[i]!.y, 6);
      expect(r.w).toBeCloseTo(twoCells[i]!.w, 6);
      expect(r.h).toBeCloseTo(twoCells[i]!.h, 6);
    });
  });

  it('等比缩放：包围盒中心不动，只有尺寸变大', () => {
    const before = centerOf(twoCells);
    const out = liftAndScale(twoCells, 2, 0);
    const after = centerOf(out);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    // 整体宽度翻倍：原 214.32 → 428.64
    const w = (rs: Rect[]) => Math.max(...rs.map((r) => r.x + r.w)) - Math.min(...rs.map((r) => r.x));
    expect(w(out)).toBeCloseTo(w(twoCells) * 2, 6);
  });

  it('上浮只改 y：x / 宽 / 高全部不变', () => {
    const out = liftAndScale(twoCells, 1, UI_DRAG_LIFT_PX);
    out.forEach((r, i) => {
      expect(r.x).toBeCloseTo(twoCells[i]!.x, 6);
      expect(r.w).toBeCloseTo(twoCells[i]!.w, 6);
      expect(r.h).toBeCloseTo(twoCells[i]!.h, 6);
      expect(r.y).toBeCloseTo(twoCells[i]!.y + UI_DRAG_LIFT_PX, 6);
    });
  });

  it('上浮把整体中心抬高 liftPx（不是把某一格抬高）', () => {
    const before = centerOf(twoCells);
    const after = centerOf(liftAndScale(twoCells, UI_DRAG_LIFT_SCALE, UI_DRAG_LIFT_PX));
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y + UI_DRAG_LIFT_PX, 6);
  });

  it('格缝按倍率同比例变化：缩放后仍不重叠（不会散开也不会糊住）', () => {
    const gap = (rs: Rect[]) => rs[1]!.x - (rs[0]!.x + rs[0]!.w);
    const before = gap(twoCells);
    const out = liftAndScale(twoCells, UI_DRAG_LIFT_SCALE, UI_DRAG_LIFT_PX);
    const after = gap(out);
    expect(after).toBeCloseTo(before * UI_DRAG_LIFT_SCALE, 6);
    // 缝必须还是正的——否则色块糊成一坨，数不出占几格
    expect(after).toBeGreaterThan(0);
  });

  it('非法倍率退化为 1（不让 NaN 污染绘制坐标）', () => {
    const out = liftAndScale(twoCells, Number.NaN, 0);
    expect(out[0]!.x).toBeCloseTo(twoCells[0]!.x, 6);
    // 0 和负数同样退化
    expect(liftAndScale(twoCells, 0, 0)[0]!.w).toBeCloseTo(twoCells[0]!.w, 6);
    expect(liftAndScale(twoCells, -2, 0)[0]!.w).toBeCloseTo(twoCells[0]!.w, 6);
  });

  it('非法上浮退化为 0', () => {
    const out = liftAndScale(twoCells, 1, Number.NaN);
    expect(out[0]!.y).toBeCloseTo(twoCells[0]!.y, 6);
  });
});

describe('offsetRects', () => {
  it('整体平移，尺寸不变', () => {
    const out = offsetRects(twoCells, 3, -3);
    out.forEach((r, i) => {
      expect(r.x).toBeCloseTo(twoCells[i]!.x + 3, 6);
      expect(r.y).toBeCloseTo(twoCells[i]!.y - 3, 6);
      expect(r.w).toBeCloseTo(twoCells[i]!.w, 6);
    });
  });

  it('非法偏移退化为 0', () => {
    const out = offsetRects(twoCells, Number.NaN, Number.NaN);
    expect(out[0]!.x).toBeCloseTo(twoCells[0]!.x, 6);
    expect(out[0]!.y).toBeCloseTo(twoCells[0]!.y, 6);
  });
});
