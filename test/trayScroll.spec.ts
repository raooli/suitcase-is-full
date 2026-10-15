/**
 * 托盘横向滚动布局（`core/geometry/trayScroll.ts`，实施计划 M2-11）。
 *
 * 钉死四类不变量（都是"数值差一点但看不出"的典型）：
 * 1. **放得下就不可滚**：L1–L6（≤6 件）`maxScroll === 0`，滚动根本不该启用；
 * 2. **滚到底恰好露出最后一件**：`offset = maxScroll` 时最后一件整块落入窗口右沿，
 *    第一件整块移出（仅当滚动范围足够时）——这保证每件都"够得着"；
 * 3. **夹取**：任何越界偏移都被夹回 `[0, maxScroll]`，不会拖出回不来的空白；
 * 4. **可见性用相交**：边缘槽位部分露出仍算可见（可交互），整块移出才隐藏。
 */

import { describe, expect, it } from 'vitest';

import {
  trayClampScroll,
  trayContentWidth,
  trayMaxScroll,
  traySlotCenterX,
  traySlotInWindow,
} from '../assets/core';

// 与 view 侧同口径的常量（此处硬编码以锁定"纯函数不依赖 cc"的属性）
const WINDOW = 342; // UI_DESIGN_WIDTH − 2×UI_SAFE_MARGIN = 390 − 48
const SLOT = 44; // UI_TRAY_SLOT_MIN（溢出时槽位被夹到的热区下限）
const GAP = 8; // UI_TRAY_GAP

describe('trayContentWidth', () => {
  it('空托盘宽 0', () => {
    expect(trayContentWidth(0, SLOT, GAP)).toBe(0);
  });

  it('单件无间距', () => {
    expect(trayContentWidth(1, SLOT, GAP)).toBe(SLOT);
  });

  it('多件含间距：n×slot + (n−1)×gap', () => {
    expect(trayContentWidth(4, 76, GAP)).toBe(4 * 76 + 3 * GAP); // L1 四件 = 328
    expect(trayContentWidth(7, SLOT, GAP)).toBe(7 * SLOT + 6 * GAP); // 356
    expect(trayContentWidth(9, SLOT, GAP)).toBe(9 * SLOT + 8 * GAP); // 460
  });
});

describe('trayMaxScroll', () => {
  it('放得下 → 0（L1–L6 不可滚）', () => {
    expect(trayMaxScroll(trayContentWidth(4, 76, GAP), WINDOW)).toBe(0); // 328 ≤ 342
    expect(trayMaxScroll(WINDOW, WINDOW)).toBe(0); // 恰好铺满也不滚
    expect(trayMaxScroll(WINDOW - 1, WINDOW)).toBe(0); // 差 1px 放得下
    expect(trayMaxScroll(300, WINDOW)).toBe(0);
  });

  it('放不下 → 差值', () => {
    expect(trayMaxScroll(trayContentWidth(7, SLOT, GAP), WINDOW)).toBe(14); // 356−342
    expect(trayMaxScroll(trayContentWidth(9, SLOT, GAP), WINDOW)).toBe(118); // 460−342
  });
});

describe('trayClampScroll', () => {
  it('夹进 [0, max]', () => {
    const max = trayMaxScroll(trayContentWidth(9, SLOT, GAP), WINDOW); // 118
    expect(trayClampScroll(-50, trayContentWidth(9, SLOT, GAP), WINDOW)).toBe(0);
    expect(trayClampScroll(50, trayContentWidth(9, SLOT, GAP), WINDOW)).toBe(50);
    expect(trayClampScroll(9999, trayContentWidth(9, SLOT, GAP), WINDOW)).toBe(max);
  });

  it('不可滚时任何偏移都归 0', () => {
    expect(trayClampScroll(30, trayContentWidth(4, 76, GAP), WINDOW)).toBe(0);
    expect(trayClampScroll(-30, trayContentWidth(4, 76, GAP), WINDOW)).toBe(0);
  });
});

describe('traySlotCenterX', () => {
  it('首件左沿贴窗口左沿', () => {
    // slot 0 左缘 = center − slot/2 = (−W/2 + slot/2) − slot/2 = −W/2
    const c0 = traySlotCenterX(0, SLOT, GAP, WINDOW);
    expect(c0 - SLOT / 2).toBeCloseTo(-WINDOW / 2, 6);
  });

  it('相邻槽位间距恒为 slot+gap', () => {
    const step = traySlotCenterX(3, SLOT, GAP, WINDOW) - traySlotCenterX(2, SLOT, GAP, WINDOW);
    expect(step).toBeCloseTo(SLOT + GAP, 6);
  });
});

describe('traySlotInWindow', () => {
  it('offset=0：首件整块在窗内；末件（溢出）部分露出仍算可见', () => {
    expect(traySlotInWindow(traySlotCenterX(0, SLOT, GAP, WINDOW), SLOT, 0, WINDOW)).toBe(true);
    // 第 7 件（count=7）span [141,185]，窗口右沿 171 → 相交 → 可见
    expect(traySlotInWindow(traySlotCenterX(6, SLOT, GAP, WINDOW), SLOT, 0, WINDOW)).toBe(true);
  });

  it('offset=maxScroll：末件整块落入窗口右沿，首件整块移出（滚动范围够时）', () => {
    const content = trayContentWidth(9, SLOT, GAP);
    const max = trayMaxScroll(content, WINDOW); // 118
    const last = traySlotCenterX(8, SLOT, GAP, WINDOW) - max; // 平移到窗口坐标
    expect(last + SLOT / 2).toBeCloseTo(WINDOW / 2, 6); // 右缘正好贴窗口右沿
    expect(traySlotInWindow(traySlotCenterX(8, SLOT, GAP, WINDOW), SLOT, max, WINDOW)).toBe(true);
    // 首件被整块推到窗口左侧之外 → 隐藏
    expect(traySlotInWindow(traySlotCenterX(0, SLOT, GAP, WINDOW), SLOT, max, WINDOW)).toBe(false);
  });

  it('完全在窗外的槽位 → 不可见', () => {
    // 第 9 件在 offset=0 时 span [245,289]，远在窗口右侧外
    expect(traySlotInWindow(traySlotCenterX(8, SLOT, GAP, WINDOW), SLOT, 0, WINDOW)).toBe(false);
  });
});
