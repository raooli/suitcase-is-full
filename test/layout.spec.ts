/**
 * M3-5 短屏适配：横带压缩阶梯选型（`core/config.ts` 的纯函数）。
 *
 * 钉死几类「数值差一点但看不出」的不变量：
 * 1. **长屏零回归**：可见高 ≥ 844 必选 L0，且三横带中心等于旧常量口径
 *    （board +68 / tray −246 / toolbar −374 / top +362），布局与改前完全一致；
 * 2. **320×568 短屏被 L1 修好**：可见设计高 ≈692，6×6 棋盘格边长（设计 + 320px 折算）
 *    都满足 ≥44，不再击穿 P-04 下限；
 * 3. **阶梯只压非棋盘区域直到必要**：前档够用就不动下一档（692 → L1 而非 L2）；
 * 4. **更短屏继续降级**：可见高跌破 L1 容量时落到 L2，仍守住 ≥44；
 * 5. **所有中心落在可见半幅内**：`±effectiveHeight/2`，不会被挤出屏幕；
 * 6. `maxBoardOf` 横向 / 纵向分别取各关最大值（全局选型避免换关横带跳动）。
 */

import { describe, expect, it } from 'vitest';

import {
  CELL_PX_MIN,
  PHYSICAL_REF_WIDTH,
  UI_DESIGN_WIDTH,
  UI_MAX_BOARD,
  maxBoardOf,
  resolveLayout,
  selectLayoutBand,
  type LayoutBand,
} from '../assets/core';

/** 给定选型后的横带，按与 `BoardView.cellPxFor` 同口径算设计格边长（向下取整） */
function cellPxForBand(band: LayoutBand, effectiveHeight: number, board: { rows: number; cols: number }): number {
  const areaH = effectiveHeight - band.header - band.tray - band.toolbar;
  return Math.floor(Math.min((UI_DESIGN_WIDTH - band.margin * 2) / board.cols, areaH / board.rows));
}

/** 折算到 320px 屏的物理格边长（与 `BoardView.physicalCellPx` 同口径） */
function physicalPx(cellPx: number): number {
  return (cellPx * PHYSICAL_REF_WIDTH) / UI_DESIGN_WIDTH;
}

const MAX_BOARD = { rows: 6, cols: 6 };

describe('M3-5 resolveLayout · 长屏零回归', () => {
  it('可见高 844 → L0，且中心等于旧常量口径', () => {
    const r = resolveLayout(844, MAX_BOARD);
    expect(r.name).toContain('L0');
    expect(r.effectiveHeight).toBe(844);
    expect(r.band.header).toBe(120);
    expect(r.band.tray).toBe(160);
    expect(r.band.toolbar).toBe(96);
    expect(r.band.margin).toBe(24);
    // 旧常量：board +68 / tray −246 / toolbar −374 / top +362
    expect(r.boardBandCenterY).toBe(68);
    expect(r.trayBandCenterY).toBe(-246);
    expect(r.toolbarBandCenterY).toBe(-374);
    expect(r.topBandCenterY).toBe(362);
  });

  it('可见高 > 844（长屏）封顶 844 → 仍 L0，不放大布局', () => {
    const r = resolveLayout(900, MAX_BOARD);
    expect(r.effectiveHeight).toBe(844);
    expect(r.name).toContain('L0');
  });

  it('正常 390×844 屏（可见高 844）下 6×6 格边长≥44，不压缩', () => {
    const r = resolveLayout(844, MAX_BOARD);
    const cellPx = cellPxForBand(r.band, r.effectiveHeight, MAX_BOARD);
    expect(cellPx).toBeGreaterThanOrEqual(CELL_PX_MIN);
    expect(physicalPx(cellPx)).toBeGreaterThanOrEqual(CELL_PX_MIN);
  });
});

describe('M3-5 resolveLayout · 短屏选型', () => {
  // 320×568：可见设计高 = 568 × 390 / 320 = 692.25
  const SHORT_320x568 = (568 * UI_DESIGN_WIDTH) / 320;

  it('320×568（≈692）6×6 → L1，格边长守住 44 下限', () => {
    const r = resolveLayout(SHORT_320x568, MAX_BOARD);
    expect(r.name).toContain('L1');
    expect(r.band.tray).toBe(128);
    const cellPx = cellPxForBand(r.band, r.effectiveHeight, MAX_BOARD);
    expect(cellPx).toBeGreaterThanOrEqual(CELL_PX_MIN);
    expect(physicalPx(cellPx)).toBeGreaterThanOrEqual(CELL_PX_MIN);
  });

  it('更小的棋盘（3×3）在 320×568 下格边长更大，同样达标', () => {
    const r = resolveLayout(SHORT_320x568, { rows: 3, cols: 3 });
    const cellPx = cellPxForBand(r.band, r.effectiveHeight, { rows: 3, cols: 3 });
    expect(physicalPx(cellPx)).toBeGreaterThan(physicalPx(cellPxForBand(r.band, r.effectiveHeight, MAX_BOARD)));
    expect(physicalPx(cellPx)).toBeGreaterThanOrEqual(CELL_PX_MIN);
  });

  it('可见高跌破 L1 容量（≈660）→ 落到 L2，仍≥44', () => {
    const r = resolveLayout(660, MAX_BOARD);
    expect(r.name).toContain('L2');
    const cellPx = cellPxForBand(r.band, r.effectiveHeight, MAX_BOARD);
    expect(physicalPx(cellPx)).toBeGreaterThanOrEqual(CELL_PX_MIN);
  });

  it('前档够用就不动下一档：692 命中 L1 而非 L2', () => {
    const band692 = selectLayoutBand(SHORT_320x568, MAX_BOARD);
    const band660 = selectLayoutBand(660, MAX_BOARD);
    expect(band692.name).toContain('L1');
    expect(band660.name).toContain('L2');
  });
});

describe('M3-5 resolveLayout · 中心不越出可见半幅', () => {
  for (const h of [844, 700, 660, 620]) {
    it(`可见高 ${h}：四个中心都在 ±${h / 2} 内`, () => {
      const r = resolveLayout(h, MAX_BOARD);
      const half = r.effectiveHeight / 2;
      for (const y of [r.boardBandCenterY, r.trayBandCenterY, r.toolbarBandCenterY, r.topBandCenterY]) {
        expect(y).toBeGreaterThanOrEqual(-half - 1e-9);
        expect(y).toBeLessThanOrEqual(half + 1e-9);
      }
    });
  }
});

describe('M3-5 maxBoardOf', () => {
  it('横向 / 纵向分别取各关最大值', () => {
    const levels = [
      { board: { rows: 3, cols: 3 } },
      { board: { rows: 6, cols: 5 } },
      { board: { rows: 4, cols: 6 } },
    ];
    expect(maxBoardOf(levels)).toEqual({ rows: 6, cols: 6 });
  });

  it('空列表 → 0×0（兜底，不抛）', () => {
    expect(maxBoardOf([])).toEqual({ rows: 0, cols: 0 });
  });
});

describe('M3-5 UI_MAX_BOARD 与已知最大棋盘一致', () => {
  it('当前 10 关最大 6×6', () => {
    expect(UI_MAX_BOARD).toEqual({ rows: 6, cols: 6 });
  });
});
