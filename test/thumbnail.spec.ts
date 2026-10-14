/**
 * 缩略图装框（`core/geometry/thumbnail.ts`）。
 *
 * 这组断言的存在理由：M1-3 首版把"距边距离"当成了子节点坐标，三件托盘物品整体
 * 偏出半个槽位（横向跑出卡片右缘、纵向垂到卡片下方），而**视图层没有单测兜着**，
 * 只能靠截图目测——它就是这么溜过去的。把算式提成纯函数后，"居中 + 不溢出 +
 * 不放大小件"变成可断言的不变量。
 */

import { describe, expect, it } from 'vitest';

import { fitThumbnail } from '../assets/core';
import { UI_TRAY_SLOT, UI_TRAY_SLOT_PADDING } from '../assets/core';

/** 槽位实测口径：76 边长、8 内边距 → 内框 60 */
const SIDE = UI_TRAY_SLOT;
const PAD = UI_TRAY_SLOT_PADDING;
/** 棋盘格边长 114 时，1×2 物品的包围盒 */
const CELL = 114;

describe('fitThumbnail', () => {
  it('1×2 物品：等比缩放居中（M1-3 回归点位）', () => {
    const fit = fitThumbnail(2 * CELL, CELL, SIDE, PAD);
    // 缩放到内框（60）为止：60/228
    expect(fit.scale).toBeCloseTo(60 / 228, 6);
    expect(fit.width).toBeCloseTo(60, 6);
    expect(fit.height).toBeCloseTo(30, 6);
    // 居中：左上角在 (-w/2, +h/2)
    expect(fit.x).toBeCloseTo(-30, 6);
    expect(fit.y).toBeCloseTo(15, 6);
  });

  it('2×1 物品：旋 90° 后仍居中（宽高互换）', () => {
    const fit = fitThumbnail(CELL, 2 * CELL, SIDE, PAD);
    expect(fit.width).toBeCloseTo(30, 6);
    expect(fit.height).toBeCloseTo(60, 6);
    expect(fit.x).toBeCloseTo(-15, 6);
    expect(fit.y).toBeCloseTo(30, 6);
  });

  it('居中不变量：外框中心恒在槽位中心', () => {
    for (const [w, h] of [
      [CELL, CELL],
      [2 * CELL, CELL],
      [CELL, 2 * CELL],
      [3 * CELL, 2 * CELL],
      [4 * CELL, 4 * CELL],
    ] as const) {
      const fit = fitThumbnail(w, h, SIDE, PAD);
      // 锚点在左上角 → 外框中心的 x = x + w/2、y = y - h/2（y 向下延伸）
      expect(fit.x + fit.width / 2).toBeCloseTo(0, 6);
      expect(fit.y - fit.height / 2).toBeCloseTo(0, 6);
    }
  });

  it('永不溢出槽位内框（含 padding）', () => {
    const inner = SIDE - PAD * 2;
    for (const [w, h] of [
      [CELL, CELL],
      [2 * CELL, CELL],
      [CELL, 3 * CELL],
      [3 * CELL, 3 * CELL],
      [6 * CELL, 6 * CELL],
    ] as const) {
      const fit = fitThumbnail(w, h, SIDE, PAD);
      expect(fit.width).toBeLessThanOrEqual(inner + 1e-9);
      expect(fit.height).toBeLessThanOrEqual(inner + 1e-9);
      // 外框四边都落在槽位卡片内
      expect(fit.x).toBeGreaterThanOrEqual(-SIDE / 2 - 1e-9);
      expect(fit.x + fit.width).toBeLessThanOrEqual(SIDE / 2 + 1e-9);
      expect(fit.y).toBeLessThanOrEqual(SIDE / 2 + 1e-9);
      expect(fit.y - fit.height).toBeGreaterThanOrEqual(-SIDE / 2 - 1e-9);
    }
  });

  it('只缩不放：小于槽位的物品保持原尺寸（保住"占几格"的预判）', () => {
    const fit = fitThumbnail(20, 20, SIDE, PAD);
    expect(fit.scale).toBe(1);
    expect(fit.width).toBeCloseTo(20, 6);
    expect(fit.height).toBeCloseTo(20, 6);
  });

  it('等比：不改变宽高比', () => {
    for (const [w, h] of [
      [2 * CELL, CELL],
      [CELL, 3 * CELL],
      [228, 114],
    ] as const) {
      const fit = fitThumbnail(w, h, SIDE, PAD);
      expect(fit.width / fit.height).toBeCloseTo(w / h, 6);
    }
  });

  it('退化输入不产生 NaN/Infinity（除零兜底）', () => {
    for (const [w, h, side, pad] of [
      [0, 0, SIDE, PAD],
      [CELL, CELL, 0, 0],
      [CELL, CELL, 10, 8], // side 比 padding 还小
      [-5, -5, SIDE, PAD],
    ] as const) {
      const fit = fitThumbnail(w, h, side, pad);
      for (const v of [fit.scale, fit.x, fit.y, fit.width, fit.height]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(fit.scale).toBeGreaterThan(0);
      expect(fit.scale).toBeLessThanOrEqual(1);
    }
  });

  it('与 core/config 的槽位常量自洽（改常量会被这组断言叫醒）', () => {
    expect(SIDE).toBe(76);
    expect(PAD).toBe(8);
    const fit = fitThumbnail(6 * CELL, 6 * CELL, SIDE, PAD);
    expect(fit.width).toBeCloseTo(SIDE - PAD * 2, 6);
  });
});
