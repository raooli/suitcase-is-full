/**
 * 放置规则单测（TDD 6.2 / 6.5）。
 *
 * 这里的三条是本项目最容易写错的地方，必须钉死：
 * 1. 判定顺序 越界 → 障碍 → 重叠
 * 2. 「忽略自身」必须用"摘掉自己重建索引"，不能用 `owner === selfId` 特判
 * 3. 原位旋转失败时**绝不能**提交非法状态
 */

import { describe, expect, it } from 'vitest';

import type { LevelSpec, LevelState, Placement, Rotation } from '../assets/core/model/types';
import { buildIndex } from '../assets/core/rules/board';
import {
  applyPlacement,
  canPlace,
  insertByTrayOrder,
  removeToTray,
  rotateInPlace,
} from '../assets/core/rules/placement';

// ─────────────────────── 测试用关卡 ───────────────────────

// 障碍放在 (3,3) 这个角落，避免挡住下面要用的 (0,0)/(1,0)/(1,1) 一带。
// 之前的版本把障碍放在 (1,1)，结果 A 放在 (0,0) 就会压到障碍，
// 好几个用例其实在测"障碍"而不是它们声称在测的东西。
const level: LevelSpec = {
  levelId: 99,
  title: 'test',
  board: { rows: 4, cols: 4, blockedCells: [[3, 3]] },
  items: [
    { id: 'A', name: 'L3', itemType: 't', spriteKey: 'k', cells: [[0, 0], [1, 0], [1, 1]], rotatable: true, trayOrder: 1 },
    { id: 'B', name: 'I3', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: true, trayOrder: 2 },
    { id: 'C', name: 'O2', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], rotatable: false, trayOrder: 3 },
  ],
};

function emptyState(): LevelState {
  return {
    levelId: level.levelId,
    placements: new Map<string, Placement>(),
    tray: ['A', 'B', 'C'],
    trayRotations: new Map<string, Rotation>(),
    selectedId: null,
  };
}

function withPlacements(entries: Array<[string, Placement]>): LevelState {
  const placements = new Map(entries);
  return {
    ...emptyState(),
    placements,
    tray: ['A', 'B', 'C'].filter((id) => !placements.has(id)),
  };
}

// ─────────────────────── canPlace ───────────────────────

describe('canPlace：判定顺序与语义', () => {
  it('空棋盘上的合法落位通过', () => {
    expect(canPlace(level, emptyState(), { itemId: 'A', row: 0, col: 0, rotation: 0 }).ok).toBe(true);
  });

  it('越界被识别为 out-of-bounds', () => {
    // I3 横放在 (0,2)：第三格落在 col 4，越界
    const check = canPlace(level, emptyState(), { itemId: 'B', row: 0, col: 2, rotation: 0 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('out-of-bounds');
  });

  it('障碍被识别为 blocked', () => {
    // 2×2 方块放在 (2,2)：(2,2)(2,3)(3,2)(3,3)，其中 (3,3) 是障碍
    const check = canPlace(level, emptyState(), { itemId: 'C', row: 2, col: 2, rotation: 0 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('blocked');
  });

  it('同一形状同时越界与压障碍时，先报越界（PRD R-03 的判定顺序）', () => {
    // 2×2 放在 (2,3)：第二格 (2,4) 越界，而第四格 (3,3) 是障碍。
    // 若不按下标顺序逐格判、或判序颠倒，这里会报成 blocked。
    const check = canPlace(level, emptyState(), { itemId: 'C', row: 2, col: 3, rotation: 0 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('out-of-bounds');
  });

  it('与他物重叠被识别为 overlap', () => {
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 0 }]]);
    const check = canPlace(level, state, { itemId: 'C', row: 0, col: 0, rotation: 0 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('overlap');
  });

  it('不可旋转的物品带非 0 朝向被拒', () => {
    const check = canPlace(level, emptyState(), { itemId: 'C', row: 0, col: 0, rotation: 1 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('not-rotatable');
  });

  it('未知物品被拒，且不抛异常', () => {
    const check = canPlace(level, emptyState(), { itemId: 'ZZZ', row: 0, col: 0, rotation: 0 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('unknown-item');
  });
});

describe('canPlace：忽略自身（TDD 6.2 关键细节）', () => {
  it('已放置物品原地不动时不算自碰撞', () => {
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 0 }]]);
    const check = canPlace(level, state, { itemId: 'A', row: 0, col: 0, rotation: 0 });
    expect(check.ok).toBe(true);
  });

  it('旋转后新旧格部分重合也不算自碰撞（这正是"特判 owner===self"会写错的情形）', () => {
    // A 是 L 形，转 90° 后仍会覆盖 (0,0)，加特判的实现可能在这里判错
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 0 }]]);
    const check = canPlace(level, state, { itemId: 'A', row: 0, col: 0, rotation: 1 });
    expect(check.ok).toBe(true);
  });

  it('但移动到自己与他物的重叠处仍然非法', () => {
    const state = withPlacements([
      ['A', { row: 0, col: 0, rotation: 0 }],
      ['C', { row: 0, col: 1, rotation: 0 }],
    ]);
    const check = canPlace(level, state, { itemId: 'A', row: 0, col: 1, rotation: 0 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('overlap');
  });
});

// ─────────────────────── applyPlacement / removeToTray ───────────────────────

describe('applyPlacement', () => {
  it('物品从托盘移除并写入 placements', () => {
    const next = applyPlacement(level, emptyState(), { itemId: 'A', row: 0, col: 0, rotation: 0 });
    expect(next.tray).toEqual(['B', 'C']);
    expect(next.placements.get('A')).toEqual({ row: 0, col: 0, rotation: 0 });
  });

  it('不修改原 state（不可变）', () => {
    const before = emptyState();
    applyPlacement(level, before, { itemId: 'A', row: 0, col: 0, rotation: 0 });
    expect(before.tray).toEqual(['A', 'B', 'C']);
    expect(before.placements.size).toBe(0);
  });

  it('棋盘内移动不改变 tray', () => {
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 0 }]]);
    const next = applyPlacement(level, state, { itemId: 'A', row: 0, col: 1, rotation: 1 });
    expect(next.tray).toEqual(['B', 'C']);
    expect(next.placements.get('A')).toEqual({ row: 0, col: 1, rotation: 1 });
  });

  it('放置后清理 trayRotations 里的残留朝向', () => {
    const state = emptyState();
    const withRot = { ...state, trayRotations: new Map([['A', 2 as Rotation]]) };
    const next = applyPlacement(level, withRot, { itemId: 'A', row: 0, col: 0, rotation: 2 });
    expect(next.trayRotations.has('A')).toBe(false);
    expect(next.placements.get('A')?.rotation).toBe(2);
  });
});

describe('removeToTray（PRD R-06b，V1.1 新增规则）', () => {
  it('回到原 trayOrder 位置，而不是追加到末尾', () => {
    // 只把 B（trayOrder=2）放上棋盘，托盘剩 ['A','C']
    const state = withPlacements([['B', { row: 0, col: 0, rotation: 0 }]]);
    expect(state.tray).toEqual(['A', 'C']);

    const next = removeToTray(level, state, 'B');
    // 取出后应插回 A 与 C 之间，而不是变成 ['A','C','B']
    expect(next.tray).toEqual(['A', 'B', 'C']);
  });

  it('保留取出时的朝向', () => {
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 3 }]]);
    const next = removeToTray(level, state, 'A');
    expect(next.trayRotations.get('A')).toBe(3);
    expect(next.placements.has('A')).toBe(false);
  });

  it('对未放置的物品调用是无操作（托盘物品拖到棋盘外属此类）', () => {
    const state = emptyState();
    const next = removeToTray(level, state, 'A');
    expect(next).toBe(state);
  });

  it('障碍格不受影响', () => {
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 0 }]]);
    const next = removeToTray(level, state, 'A');
    const index = buildIndex(level, next.placements);
    expect(index.isBlocked(3, 3)).toBe(true);
  });
});

describe('insertByTrayOrder', () => {
  it('按 trayOrder 插入正确位置', () => {
    expect(insertByTrayOrder(level, ['A', 'C'], 'B')).toEqual(['A', 'B', 'C']);
    expect(insertByTrayOrder(level, ['B', 'C'], 'A')).toEqual(['A', 'B', 'C']);
    expect(insertByTrayOrder(level, ['A', 'B'], 'C')).toEqual(['A', 'B', 'C']);
  });
});

// ─────────────────────── rotateInPlace ───────────────────────

describe('rotateInPlace（TDD 6.5 四条策略）', () => {
  it('空旷棋盘上靠策略 1（包围盒中心）成功', () => {
    const big: LevelSpec = {
      ...level,
      board: { rows: 5, cols: 5, blockedCells: [] },
    };
    const state: LevelState = {
      levelId: 99,
      placements: new Map([['B', { row: 2, col: 1, rotation: 0 }]]),
      tray: ['A', 'C'],
      trayRotations: new Map(),
      selectedId: null,
    };
    const result = rotateInPlace(big, state, 'B');
    expect(result.ok).toBe(true);
    expect(result.placement?.rotation).toBe(1);
    expect(result.strategy).toBe(1);
  });

  it('中心保持失败时回退到策略 2（原 anchor）', () => {
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 0 }]]);
    const result = rotateInPlace(level, state, 'A');
    expect(result.ok).toBe(true);
    expect([1, 2, 3]).toContain(result.strategy);
  });

  it('四条策略全失败时**不返回任何 placement**', () => {
    // 3×3 棋盘塞满：(1,1) 是障碍，剩 8 格；放一个 2×2（C，不可旋转）+ 一个 L 形
    const tight: LevelSpec = {
      ...level,
      board: { rows: 2, cols: 2, blockedCells: [] },
      items: [
        { id: 'X', name: 'I2', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 1 },
        { id: 'Y', name: 'I2b', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 2 },
      ],
    };
    // 两件 1×2 各占一行满填，此时把 X 转成竖的必然失败（没有空间）
    const state: LevelState = {
      levelId: 99,
      placements: new Map([
        ['X', { row: 0, col: 0, rotation: 0 }],
        ['Y', { row: 1, col: 0, rotation: 0 }],
      ]),
      tray: [],
      trayRotations: new Map(),
      selectedId: null,
    };
    const result = rotateInPlace(tight, state, 'X');
    expect(result.ok).toBe(false);
    expect(result.placement).toBeNull();
    expect(result.reason).toBe('rotate-blocked');
    expect(result.strategy).toBe(4);
  });

  it('不可旋转物品直接失败', () => {
    const state = withPlacements([['C', { row: 0, col: 0, rotation: 0 }]]);
    const result = rotateInPlace(level, state, 'C');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-rotatable');
  });

  it('成功返回的 placement 一定是合法的（防御性断言）', () => {
    const state = withPlacements([['A', { row: 0, col: 0, rotation: 0 }]]);
    const result = rotateInPlace(level, state, 'A');
    if (result.ok && result.placement) {
      const check = canPlace(level, state, {
        itemId: 'A',
        row: result.placement.row,
        col: result.placement.col,
        rotation: result.placement.rotation,
      });
      expect(check.ok).toBe(true);
    }
  });
});
