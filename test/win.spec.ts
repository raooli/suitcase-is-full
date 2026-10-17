/**
 * 通关庆祝序列时长的单测（M2-10 / UI Spec 5.3）。
 *
 * 庆祝的四段时长是**纯数据**（`core/config.ts` 的 `UI_WIN_*`），规格区间可以
 * 在此直接断言；真正的播放（tween / 时序）在 view 层，由无头预览的 Console
 * 时间戳取证。这里守两条不变量：
 *
 * 1. **规格区间**：回弹 100–180ms、合盖 250–450ms 是 UI Spec 5.3 原文——
 *    调参调出区间等于改设计，要被叫醒；
 * 2. **收敛自洽**：`UI_WIN_SETTLE_MS`（按钮解冻时刻）必须**大于**整条序列的
 *    画面结束时刻（回弹 + 合盖 + max(面板淡入, 面板弹跳)）。早一点解冻就是
 *    「动画中误触」，晚很多则是白等——余量在数十毫秒量级。
 */

import { describe, expect, it } from 'vitest';

import {
  UI_WIN_BOUNCE_MS,
  UI_WIN_BOUNCE_SCALE,
  UI_WIN_LID_DIP_PX,
  UI_WIN_LID_MS,
  UI_WIN_PANEL_FADE_MS,
  UI_WIN_PANEL_GROW_MS,
  UI_WIN_PANEL_PEAK_SCALE,
  UI_WIN_PANEL_SNAP_MS,
  UI_WIN_PANEL_START_SCALE,
  UI_WIN_SETTLE_MARGIN_MS,
  UI_WIN_SETTLE_MS,
  UI_WIN_TWINKLE_MIN_ALPHA,
} from '../assets/core/config';

/** UI Spec 5.3 原文给出的两段区间 */
const SPEC_BOUNCE_RANGE = [100, 180] as const;
const SPEC_LID_RANGE = [250, 450] as const;

describe('通关庆祝时长：UI Spec 5.3 区间', () => {
  it('回弹时长落在 100–180ms', () => {
    expect(UI_WIN_BOUNCE_MS).toBeGreaterThanOrEqual(SPEC_BOUNCE_RANGE[0]);
    expect(UI_WIN_BOUNCE_MS).toBeLessThanOrEqual(SPEC_BOUNCE_RANGE[1]);
  });

  it('合盖时长落在 250–450ms', () => {
    expect(UI_WIN_LID_MS).toBeGreaterThanOrEqual(SPEC_LID_RANGE[0]);
    expect(UI_WIN_LID_MS).toBeLessThanOrEqual(SPEC_LID_RANGE[1]);
  });

  it('回弹只做缩放且峰值为温和的正放大（不改判定、不放大到失真）', () => {
    expect(UI_WIN_BOUNCE_SCALE).toBeGreaterThan(1);
    expect(UI_WIN_BOUNCE_SCALE).toBeLessThanOrEqual(1.2);
  });

  it('合盖回挑是小幅度固定值（不随棋盘尺寸等比放大）', () => {
    expect(UI_WIN_LID_DIP_PX).toBeGreaterThan(0);
    expect(UI_WIN_LID_DIP_PX).toBeLessThanOrEqual(16);
  });

  it('星光呼吸不到 0（UI Spec 8「减弱频闪」）', () => {
    expect(UI_WIN_TWINKLE_MIN_ALPHA).toBeGreaterThanOrEqual(0.3);
    expect(UI_WIN_TWINKLE_MIN_ALPHA).toBeLessThan(1);
  });
});

describe('通关庆祝收敛：SETTLE_MS 覆盖整条序列', () => {
  /** 面板入场段的总时长（淡入与弹跳并行，取较长者） */
  const panelTotalMs = Math.max(UI_WIN_PANEL_FADE_MS, UI_WIN_PANEL_GROW_MS + UI_WIN_PANEL_SNAP_MS);
  /** 所有画面结束的时刻（不含余量） */
  const sequenceMs = UI_WIN_BOUNCE_MS + UI_WIN_LID_MS + panelTotalMs;

  it('SETTLE_MS = 序列 + 余量（公式没被手改坏）', () => {
    expect(UI_WIN_SETTLE_MS).toBe(sequenceMs + UI_WIN_SETTLE_MARGIN_MS);
  });

  it('解冻晚于画面结束（按钮不会在动画中可点）', () => {
    expect(UI_WIN_SETTLE_MS).toBeGreaterThan(sequenceMs);
  });

  it('余量在数十毫秒量级（不至于解冻后玩家干等）', () => {
    expect(UI_WIN_SETTLE_MARGIN_MS).toBeGreaterThanOrEqual(30);
    expect(UI_WIN_SETTLE_MARGIN_MS).toBeLessThanOrEqual(200);
  });

  it('面板弹跳是「放大再过冲回 1」的两段（M1-7 手感的数值化）', () => {
    expect(UI_WIN_PANEL_START_SCALE).toBeLessThan(1);
    expect(UI_WIN_PANEL_PEAK_SCALE).toBeGreaterThan(1);
    expect(UI_WIN_PANEL_GROW_MS + UI_WIN_PANEL_SNAP_MS).toBeLessThanOrEqual(400);
  });
});
