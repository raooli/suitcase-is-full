/**
 * 占位色块的明度阶梯单测（M1-2）。
 *
 * 为什么值得为"取个颜色"写单测：TDD 17.6 的 A-02 要求「任意两件相邻物品的
 * 颜色明度差 ≥ 1 个阶梯」，这条**只能算**——肉眼看截图判不了，而且占位色块
 * 一旦层次拉不开，等换成真图时才发现"拼在一起像四个人画的"就晚了。
 *
 * 另一半价值是守住「色号不动」：色板是已确认的设计令牌，派生只允许压明度，
 * 不允许改色相。这里用色相不变（三通道比例恒定）把这条钉死。
 */

import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  itemFillHex,
  relativeLuminance,
  rgbOf,
  shadeHex,
  toHex,
  toneBaseHex,
  toneBaseIndexFor,
  toneLevelFor,
} from '../assets/core/palette';
import { UI_PALETTE, UI_TONE_FACTOR } from '../assets/core/config';

/**
 * 三通道相对比例（色相指纹）：等比缩放不应改变它。
 * 用数组而非字符串，因为 8bit 取整会带来 ±0.5/255 的抖动，要留容差。
 */
function hueFingerprint(hex: string): number[] {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b) || 1;
  return [r / max, g / max, b / max];
}

describe('明度档位（实施计划 M1.B：2 格亮、3 格中、4+ 格深）', () => {
  it('按占格数分档，边界值不踩空', () => {
    expect(toneLevelFor(1)).toBe('light');
    expect(toneLevelFor(2)).toBe('light');
    expect(toneLevelFor(3)).toBe('mid');
    expect(toneLevelFor(4)).toBe('deep');
    expect(toneLevelFor(9)).toBe('deep');
  });

  it('档位倍率单调递减', () => {
    expect(UI_TONE_FACTOR.light).toBeGreaterThan(UI_TONE_FACTOR.mid);
    expect(UI_TONE_FACTOR.mid).toBeGreaterThan(UI_TONE_FACTOR.deep);
  });
});

describe('色相轮换', () => {
  it('trayOrder 相邻的两件不同色（1-based，三色循环）', () => {
    expect(toneBaseIndexFor(1)).toBe(0);
    expect(toneBaseIndexFor(2)).toBe(1);
    expect(toneBaseIndexFor(3)).toBe(2);
    expect(toneBaseIndexFor(4)).toBe(0);
    for (let order = 1; order <= 12; order++) {
      expect(toneBaseHex(order)).not.toBe(toneBaseHex(order + 1));
    }
  });

  it('基色取自 UI Spec 令牌本身，不另行造色', () => {
    expect(toneBaseHex(1)).toBe(UI_PALETTE.surfaceMint);
    expect(toneBaseHex(2)).toBe(UI_PALETTE.surfaceBlue);
    expect(toneBaseHex(3)).toBe(UI_PALETTE.surfaceRose);
  });
});

describe('明度阶梯：相邻档位必须拉得开（TDD 17.6 A-02）', () => {
  it('同基色三档的相对亮度单调递减，且相邻档差 ≥ 0.05', () => {
    for (const order of [1, 2, 3]) {
      const base = toneBaseHex(order);
      const light = relativeLuminance(itemFillHex(order, 2));
      const mid = relativeLuminance(itemFillHex(order, 3));
      const deep = relativeLuminance(itemFillHex(order, 4));
      expect(light).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(deep);
      expect(light - mid).toBeGreaterThanOrEqual(0.05);
      expect(mid - deep).toBeGreaterThanOrEqual(0.05);
      // 派生后的色值仍在浅色区间（UI Spec：低饱和浅色，不能压成深色块）
      expect(deep).toBeGreaterThan(0.3);
      expect(base.length).toBe(7);
    }
  });

  it('派生只压明度、不改色相（容差 0.01 = 8bit 取整抖动）', () => {
    for (const base of [UI_PALETTE.surfaceMint, UI_PALETTE.surfaceBlue, UI_PALETTE.surfaceRose]) {
      for (const factor of [UI_TONE_FACTOR.mid, UI_TONE_FACTOR.deep]) {
        const got = hueFingerprint(shadeHex(base, factor));
        const want = hueFingerprint(base);
        for (let i = 0; i < want.length; i++) expect(got[i]).toBeCloseTo(want[i], 2);
      }
    }
  });
});

describe('颜色工具', () => {
  it('相对亮度：白 = 1、黑 = 0', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('对比度：正文色与次级强调色在主背景上都过 WCAG AA（UI Spec 4 节）', () => {
    expect(contrastRatio(UI_PALETTE.textPrimary, UI_PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
    // UI Spec 4 节声明 brown 在 #FFF8EE 上约 5.7:1，这里守住它没被改坏
    expect(contrastRatio(UI_PALETTE.brown, UI_PALETTE.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('hex 解析与回写闭合（大写、补零、夹紧）', () => {
    expect(rgbOf('#BCEAD5')).toEqual([188, 234, 213]);
    expect(toHex(188, 234, 213)).toBe('#BCEAD5');
    expect(toHex(-5, 300, 12.6)).toBe('#00FF0D');
    expect(shadeHex('#FFFFFF', 1)).toBe('#FFFFFF');
  });
});
