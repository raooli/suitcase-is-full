/**
 * 关卡配置校验单测 + 面积快检单测。
 *
 * 校验器的价值在于「坏数据必须在加载期就被挡住」——
 * 断裂形状、未归一化的坐标、重复格这些东西如果在运行期才发现，
 * 症状会是"物品能穿模"或"高亮位置不对"这类极难定位的问题。
 */

import { describe, expect, it } from 'vitest';

import { LevelDataError, parseLevelBundle, parseLevelSpec, validateLevelSpec } from '../assets/core/model/level';
import { OccupancyIndex, buildIndex, totalItemCellCount, usableCellCount } from '../assets/core/rules/board';
import { checkDeadend, occupiedCellsOf, progressOf } from '../assets/core/solver/deadend';
import type { LevelSpec, RC } from '../assets/core/model/types';
import { toIndex, toRC, clampAnchor, inBounds } from '../assets/core/geometry/coords';
// 真实产物（tools/verify-levels.ts 生成），用来守住「包 → 单关」的取数路径
import levelsBundle from '../assets/data/levels.json';

function baseLevel(over: Partial<LevelSpec> = {}): LevelSpec {
  return {
    levelId: 1,
    title: 'base',
    board: { rows: 3, cols: 3, blockedCells: [] },
    items: [
      { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 1 },
    ],
    ...over,
  };
}

describe('validateLevelSpec：通过用例', () => {
  it('正常关卡无问题', () => {
    expect(validateLevelSpec(baseLevel())).toEqual([]);
  });

  it('带障碍的正常关卡无问题', () => {
    const level = baseLevel({ board: { rows: 3, cols: 3, blockedCells: [[1, 1]] } });
    expect(validateLevelSpec(level)).toEqual([]);
  });

  it('parseLevelSpec 通过时原样返回', () => {
    const level = baseLevel();
    expect(parseLevelSpec(level)).toBe(level);
  });
});

describe('validateLevelSpec：坏数据必须被挡住', () => {
  it('物品总面积超过可用格', () => {
    const level = baseLevel({
      board: { rows: 2, cols: 2, blockedCells: [] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 1 },
        { id: 'B', name: 'b', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [1, 0]], rotatable: true, trayOrder: 2 },
      ],
    });
    expect(validateLevelSpec(level).join()).toContain('超过棋盘可用格');
  });

  it('断裂形状被挡住（4 连通校验）', () => {
    const level = baseLevel({
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 2]], rotatable: true, trayOrder: 1 },
      ],
    });
    expect(validateLevelSpec(level).join()).toContain('4 连通');
  });

  it('未归一化的坐标被挡住', () => {
    const level = baseLevel({
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[1, 1], [1, 2]], rotatable: true, trayOrder: 1 },
      ],
    });
    expect(validateLevelSpec(level).join()).toContain('未归一化');
  });

  it('未排序的坐标被挡住', () => {
    const level = baseLevel({
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[1, 1], [0, 1]], rotatable: true, trayOrder: 1 },
      ],
    });
    expect(validateLevelSpec(level).join()).toContain('未归一化');
  });

  it('物品 id 重复', () => {
    const level = baseLevel({
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0]], rotatable: true, trayOrder: 1 },
        { id: 'A', name: 'a2', itemType: 't', spriteKey: 'k', cells: [[0, 0]], rotatable: true, trayOrder: 2 },
      ],
    });
    expect(validateLevelSpec(level).join()).toContain('id 重复');
  });

  it('trayOrder 不连续', () => {
    const level = baseLevel({
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0]], rotatable: true, trayOrder: 1 },
        { id: 'B', name: 'b', itemType: 't', spriteKey: 'k', cells: [[0, 0]], rotatable: true, trayOrder: 3 },
      ],
    });
    expect(validateLevelSpec(level).join()).toContain('trayOrder');
  });

  it('障碍越界', () => {
    const level = baseLevel({ board: { rows: 3, cols: 3, blockedCells: [[5, 5]] } });
    expect(validateLevelSpec(level).join()).toContain('越界');
  });

  it('障碍重复', () => {
    const level = baseLevel({ board: { rows: 3, cols: 3, blockedCells: [[1, 1], [1, 1]] } });
    expect(validateLevelSpec(level).join()).toContain('重复');
  });

  it('棋盘尺寸超上限', () => {
    const level = baseLevel({ board: { rows: 99, cols: 3, blockedCells: [] } });
    expect(validateLevelSpec(level).join()).toContain('board.rows');
  });

  it('没有任何物品', () => {
    expect(validateLevelSpec(baseLevel({ items: [] })).join()).toContain('至少要有一件物品');
  });

  it('parseLevelSpec 抛 LevelDataError 且携带问题清单', () => {
    const level = baseLevel({ items: [] });
    expect(() => parseLevelSpec(level)).toThrow(LevelDataError);
    try {
      parseLevelSpec(level);
    } catch (e) {
      expect(e).toBeInstanceOf(LevelDataError);
      expect((e as LevelDataError).problems.length).toBeGreaterThan(0);
    }
  });
});

describe('coords', () => {
  it('显式索引与坐标互转可往返', () => {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(toRC(toIndex(r, c, 6), 6)).toEqual([r, c]);
      }
    }
  });

  it('inBounds 正确处理四边', () => {
    expect(inBounds(0, 0, 3, 3)).toBe(true);
    expect(inBounds(-1, 0, 3, 3)).toBe(false);
    expect(inBounds(3, 0, 3, 3)).toBe(false);
    expect(inBounds(0, 3, 3, 3)).toBe(false);
  });

  it('clampAnchor 把形状推回界内', () => {
    expect(clampAnchor(-5, -5, 4, 4, 2, 2)).toEqual([0, 0]);
    expect(clampAnchor(9, 9, 4, 4, 2, 2)).toEqual([2, 2]);
  });
});

describe('OccupancyIndex', () => {
  const level = baseLevel({ board: { rows: 3, cols: 3, blockedCells: [[1, 1]] } });

  it('障碍格标记为 OWNER_BLOCKED', () => {
    const index = new OccupancyIndex(3, 3, [[1, 1]]);
    expect(index.isBlocked(1, 1)).toBe(true);
    expect(index.isFree(1, 1)).toBe(false);
  });

  it('界外一律视为不可用（越界不应被当成"空"）', () => {
    const index = new OccupancyIndex(3, 3, []);
    expect(index.ownerAt(-1, 0)).toBe(-2);
    expect(index.isFree(3, 0)).toBe(false);
  });

  it('buildIndex 按 placements 重建，且忽略未知 itemId', () => {
    const placements = new Map([['A', { row: 0, col: 0, rotation: 0 as const }]]);
    const index = buildIndex(level, placements);
    expect(index.isFree(0, 0)).toBe(false);
    expect(index.isFree(0, 1)).toBe(false);
    expect(index.isFree(2, 2)).toBe(true);

    const bogus = buildIndex(level, new Map([['NOPE', { row: 0, col: 0, rotation: 0 as const }]]));
    expect(bogus.isFree(0, 0)).toBe(true);
  });

  it('usableCellCount / totalItemCellCount 数值正确', () => {
    expect(usableCellCount(level)).toBe(8);
    expect(totalItemCellCount(level)).toBe(2);
  });
});

describe('deadend：面积守恒快检', () => {
  it('空间不足时报 stuck，并给出两个数字', () => {
    const level: LevelSpec = {
      levelId: 1,
      title: 'stuck',
      board: { rows: 2, cols: 3, blockedCells: [] },
      items: [
        { id: 'X', name: 'x', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: true, trayOrder: 1 },
        { id: 'Y', name: 'y', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], rotatable: true, trayOrder: 2 },
      ],
    };
    const state = {
      levelId: 1,
      placements: new Map([['X', { row: 0, col: 0, rotation: 0 as const }]]),
      tray: ['Y'],
      trayRotations: new Map(),
      selectedId: null,
    };
    const report = checkDeadend(level, state);
    expect(report.freeCells).toBe(3);
    expect(report.requiredCells).toBe(4);
    expect(report.stuck).toBe(true);
  });

  it('未放置任何物品时不会误报（全曲线回归）', () => {
    const level: LevelSpec = {
      levelId: 2,
      title: 'ok',
      board: { rows: 3, cols: 3, blockedCells: [[1, 1]] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: true, trayOrder: 1 },
      ],
    };
    const state = {
      levelId: 2,
      placements: new Map<string, { row: number; col: number; rotation: 0 }>(),
      tray: ['A'],
      trayRotations: new Map(),
      selectedId: null,
    };
    expect(checkDeadend(level, state).stuck).toBe(false);
  });

  it('障碍格不计入剩余空间（否则会低估困难程度）', () => {
    const level: LevelSpec = {
      levelId: 3,
      title: 'blocked',
      board: { rows: 2, cols: 2, blockedCells: [[0, 0], [0, 1]] },
      // 两件均为 2×2，但 2×2 棋盘上唯一落点锚 [0,0] 已被障碍占住，
      // 其余锚点越界 → 任何一件都放不进 → 确定装不下（新的「无合法落点」判据）
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], rotatable: false, trayOrder: 1 },
        { id: 'B', name: 'b', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], rotatable: false, trayOrder: 2 },
      ],
    };
    const state = {
      levelId: 3,
      placements: new Map<string, { row: number; col: number; rotation: 0 }>(),
      tray: ['A', 'B'],
      trayRotations: new Map(),
      selectedId: null,
    };
    const report = checkDeadend(level, state);
    expect(report.freeCells).toBe(2); // 4 - 2 障碍（障碍不计入剩余空间）
    expect(report.requiredCells).toBe(8); // 2 件 × 4 格
    expect(report.stuck).toBe(true);
  });

  it('面积够但碎片化为「装不下」仍能检出（旧面积守恒快检的盲区）', () => {
    // 旧实现用 `freeCells < requiredCells` 做快检，与此局无关（面积恒守恒），
    // 对「玩家把局面走死」毫无作用；此处用中心障碍切断棋盘来构造：剩余 8 格
    // 面积足够放一件 2×2（4 格），但中心障碍使任何 2×2 都越不过 [1,1] → 真·装不下。
    const level: LevelSpec = {
      levelId: 4,
      title: 'fragmented',
      board: { rows: 3, cols: 3, blockedCells: [[1, 1]] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], rotatable: false, trayOrder: 1 },
      ],
    };
    const state = {
      levelId: 4,
      placements: new Map<string, { row: number; col: number; rotation: 0 }>(),
      tray: ['A'],
      trayRotations: new Map(),
      selectedId: null,
    };
    const report = checkDeadend(level, state);
    expect(report.freeCells).toBe(8); // 9 - 1 障碍
    expect(report.requiredCells).toBe(4); // 一件 2×2
    expect(report.stuck).toBe(true); // 面积够但中心障碍切断，2×2 无处落
  });
});

describe('调试辅助函数', () => {
  it('occupiedCellsOf 返回旋转后的绝对格', () => {
    const level = baseLevel();
    const state = {
      levelId: 1,
      placements: new Map([['A', { row: 1, col: 1, rotation: 1 as const }]]),
      tray: [] as string[],
      trayRotations: new Map(),
      selectedId: null,
    };
    const cells = occupiedCellsOf(level, state, 'A');
    // 1×2 转 90° → 2×1，锚点 (1,1) → (1,1) 与 (2,1)
    expect(cells.sort()).toEqual(([[1, 1], [2, 1]] as Array<readonly [number, number]>).sort());
  });

  it('progressOf 给出已放置 / 总数', () => {
    const level = baseLevel();
    const state = {
      levelId: 1,
      placements: new Map([['A', { row: 0, col: 0, rotation: 0 as const }]]),
      tray: [] as string[],
      trayRotations: new Map(),
      selectedId: null,
    };
    expect(progressOf(level, state)).toEqual({ placed: 1, total: 1 });
  });
});

describe('parseLevelBundle：从关卡包里取单关', () => {
  function bundleOf(levels: unknown): unknown {
    return { schemaVersion: '1.1', levels };
  }

  it('取到指定关卡并做校验', () => {
    const l1 = baseLevel({ levelId: 1 });
    const l2 = baseLevel({ levelId: 2, title: 'second' });
    const got = parseLevelBundle(bundleOf([l1, l2]), 2);
    expect(got.levelId).toBe(2);
    expect(got.title).toBe('second');
  });

  it('包里没有这一关 → LevelDataError，并列出包内已有的 levelId', () => {
    expect(() => parseLevelBundle(bundleOf([baseLevel({ levelId: 1 })]), 7)).toThrow(LevelDataError);
    try {
      parseLevelBundle(bundleOf([baseLevel({ levelId: 1 })]), 7);
    } catch (e) {
      expect((e as LevelDataError).problems.join()).toContain('1');
    }
  });

  it('包结构不对（非对象 / 缺 levels）→ LevelDataError', () => {
    expect(() => parseLevelBundle(null, 1)).toThrow(LevelDataError);
    expect(() => parseLevelBundle('nope', 1)).toThrow(LevelDataError);
    expect(() => parseLevelBundle({ schemaVersion: '1.1' }, 1)).toThrow(LevelDataError);
  });

  it('关卡本身不合法时，把校验问题原样透出', () => {
    // 物品面积 9 > 棋盘可用格 4 → 一定装不下
    const bad = baseLevel({
      board: { rows: 2, cols: 2, blockedCells: [] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: false, trayOrder: 1 },
      ],
    });
    expect(() => parseLevelBundle(bundleOf([bad]), 1)).toThrow(LevelDataError);
  });

  it('真实产物 assets/data/levels.json 的第 1 关可取出（守 R-A7 数据一致性）', () => {
    const got = parseLevelBundle(levelsBundle, 1);
    expect(got.levelId).toBe(1);
    expect(got.items.length).toBeGreaterThan(0);
  });
});
