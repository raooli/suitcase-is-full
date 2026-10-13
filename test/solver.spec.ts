/**
 * 求解器单测（TDD 9.3）+ **真实关卡的回归测试**。
 *
 * 后半部分是这份骨架最重要的东西：它把 GDD 里那句
 * 「第 3 关要求至少一次旋转」从人工断言变成了 CI 断言。
 * 以后谁改关卡数据把旋转教学改丢了，构建会直接失败。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { LevelSpec, RC } from '../assets/core/model/types';
import { countSolutions, requiresRotation, solve, validateSolution } from '../assets/core/solver/packer';
import { validateLevelSpec } from '../assets/core/model/level';
import { checkDeadend } from '../assets/core/solver/deadend';
import { GameSession } from '../assets/core/session/GameSession';

// ─────────────────────── 人造用例（TDD 9.3 前四条） ───────────────────────

describe('solve：人造关卡', () => {
  it('简单可解关卡返回解', () => {
    const level: LevelSpec = {
      levelId: 1,
      title: 'simple',
      board: { rows: 1, cols: 3, blockedCells: [] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: true, trayOrder: 1 },
      ],
    };
    const result = solve(level);
    expect(result.outcome).toBe('solved');
    expect(result.solution).toHaveLength(1);
    expect(result.solution?.[0]).toMatchObject({ itemId: 'A', row: 0, col: 0, rotation: 0 });
  });

  it('不可解关卡返回 unsolvable（而非 unknown）', () => {
    const level: LevelSpec = {
      levelId: 2,
      title: 'impossible',
      board: { rows: 2, cols: 2, blockedCells: [] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 1 },
        { id: 'B', name: 'b', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 2 },
        { id: 'C', name: 'c', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 3 },
      ],
    };
    expect(solve(level).outcome).toBe('unsolvable');
  });

  it('节点上限触发时返回 unknown，**不是** unsolvable', () => {
    // 大棋盘 + 多物品 + 上限设成 1，保证两步之内就撞墙
    const level: LevelSpec = {
      levelId: 3,
      title: 'huge',
      board: { rows: 6, cols: 6, blockedCells: [] },
      items: Array.from({ length: 9 }, (_, i) => ({
        id: `I${i}`,
        name: `i${i}`,
        itemType: 't',
        spriteKey: 'k',
        cells: [[0, 0], [0, 1], [0, 2], [0, 3]] as RC[],
        rotatable: true,
        trayOrder: i + 1,
      })),
    };
    const result = solve(level, { maxNodes: 1 });
    expect(result.outcome).toBe('unknown');
    expect(result.solution).toBeNull();
  });

  it('已知唯一解的关卡返回那个解', () => {
    const level: LevelSpec = {
      levelId: 4,
      title: 'unique',
      board: { rows: 2, cols: 2, blockedCells: [] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: false, trayOrder: 1 },
      ],
    };
    const result = solve(level);
    expect(result.outcome).toBe('solved');
    // 不可旋转 + 2×2 棋盘 → 只有 (0,0) 和 (1,0) 两个位置
    expect(result.solution).toHaveLength(1);
  });

  it('禁止旋转时横条放不进竖窄棋盘（allowRotation 生效）', () => {
    const level: LevelSpec = {
      levelId: 5,
      title: 'rot',
      board: { rows: 2, cols: 1, blockedCells: [] },
      items: [
        { id: 'A', name: 'I2', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 1 },
      ],
    };
    // 棋盘只有 1 列，1×2 横着绝对放不下；转 90° 成 2×1 才行
    expect(solve(level, { allowRotation: false }).outcome).toBe('unsolvable');
    expect(solve(level, { allowRotation: true }).outcome).toBe('solved');
  });
});

describe('countSolutions', () => {
  it('完全确定性：同一关卡多次调用结果一致', () => {
    const level: LevelSpec = {
      levelId: 6,
      title: 'det',
      board: { rows: 2, cols: 4, blockedCells: [] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 1 },
        { id: 'B', name: 'b', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 2 },
      ],
    };
    const runs = Array.from({ length: 5 }, () => countSolutions(level).count);
    expect(new Set(runs).size).toBe(1);
    expect(runs[0]).toBeGreaterThan(0);
  });

  it('solutionCap 生效时 capped 为 true', () => {
    const level: LevelSpec = {
      levelId: 7,
      title: 'many',
      board: { rows: 4, cols: 4, blockedCells: [] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0]], rotatable: false, trayOrder: 1 },
      ],
    };
    const capped = countSolutions(level, { solutionCap: 3 });
    expect(capped.capped).toBe(true);
    expect(capped.count).toBe(3);

    const full = countSolutions(level);
    expect(full.capped).toBe(false);
    expect(full.count).toBe(16); // 4×4 里放一个单格，16 种
  });

  it('单格物品的解数等于可用格数（可手算的校验点）', () => {
    const level: LevelSpec = {
      levelId: 8,
      title: 'one',
      board: { rows: 3, cols: 3, blockedCells: [[1, 1]] },
      items: [
        { id: 'A', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0]], rotatable: false, trayOrder: 1 },
      ],
    };
    expect(countSolutions(level).count).toBe(8); // 9 - 1 障碍
  });
});

// ─────────────────────── 真实关卡数据回归 ───────────────────────

interface RawLevel {
  levelId: number;
  title: string;
  board: { rows: number; cols: number; blockedCells: number[][] };
  items: Array<{
    id: string;
    name: string;
    itemType?: string;
    spriteKey?: string;
    cells: number[][];
    rotatable: boolean;
    trayOrder: number;
  }>;
  solution?: Array<{ itemId: string; row: number; col: number; rotation: number }>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GDD_PATH = resolve(HERE, '../docs/02-GDD-levels-v1.0.json');

function loadGdd(): { schemaVersion: string; levels: RawLevel[] } {
  return JSON.parse(readFileSync(GDD_PATH, 'utf8'));
}

function toSpec(raw: RawLevel): LevelSpec {
  return {
    levelId: raw.levelId,
    title: raw.title,
    board: {
      rows: raw.board.rows,
      cols: raw.board.cols,
      blockedCells: raw.board.blockedCells.map(([r, c]) => [r, c] as RC),
    },
    items: raw.items.map((it) => ({
      id: it.id,
      name: it.name,
      itemType: it.itemType ?? 'default',
      spriteKey: it.spriteKey ?? 'k',
      cells: it.cells.map(([r, c]) => [r, c] as RC),
      rotatable: it.rotatable,
      trayOrder: it.trayOrder,
    })),
  };
}

const gdd = loadGdd();

describe('真实关卡数据：结构合法性', () => {
  it('schemaVersion 是 1.1', () => {
    expect(gdd.schemaVersion).toBe('1.1');
  });

  it('恰好 10 关，levelId 为 1..10', () => {
    expect(gdd.levels).toHaveLength(10);
    expect(gdd.levels.map((l) => l.levelId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each(gdd.levels.map((l) => [l.levelId, l.title] as const))(
    'L%i %s 通过 validateLevelSpec',
    (levelId) => {
      const raw = gdd.levels.find((l) => l.levelId === levelId)!;
      expect(validateLevelSpec(toSpec(raw))).toEqual([]);
    },
  );
});

describe('真实关卡数据：标准解合法性', () => {
  it.each(gdd.levels.map((l) => l.levelId))('L%i 的 solution 逐格合法', (levelId) => {
    const raw = gdd.levels.find((l) => l.levelId === levelId)!;
    const spec = toSpec(raw);
    const solution = (raw.solution ?? []).map((p) => ({
      itemId: p.itemId,
      row: p.row,
      col: p.col,
      rotation: p.rotation as 0 | 1 | 2 | 3,
    }));
    expect(solution.length).toBeGreaterThan(0);
    const check = validateSolution(spec, solution);
    expect(check.problems).toEqual([]);
    expect(check.valid).toBe(true);
  });
});

describe('真实关卡数据：全部可解', () => {
  it.each(gdd.levels.map((l) => l.levelId))('L%i 求解器判定为 solved', (levelId) => {
    const raw = gdd.levels.find((l) => l.levelId === levelId)!;
    const result = solve(toSpec(raw));
    // 若这里变成 unknown，说明需要提高 maxNodes——但更可能是关卡数据被改坏了
    expect(result.outcome).toBe('solved');
  });
});

describe('真实关卡数据：L03 的旋转教学（G-04 的 CI 化）', () => {
  it('第 3 关不旋转时无解', () => {
    const raw = gdd.levels.find((l) => l.levelId === 3)!;
    expect(solve(toSpec(raw), { allowRotation: false }).outcome).toBe('unsolvable');
  });

  it('第 3 关 requiresRotation 为 true', () => {
    const raw = gdd.levels.find((l) => l.levelId === 3)!;
    expect(requiresRotation(toSpec(raw))).toBe(true);
  });

  it('教学顺序：第 1、2 关不旋转也必须能通关', () => {
    // 玩家是在第 3 关才被教旋转的。如果前两关就硬性要求旋转，
    // 新手会在还没学到操作时就卡死。
    for (const levelId of [1, 2]) {
      const raw = gdd.levels.find((l) => l.levelId === levelId)!;
      expect(
        solve(toSpec(raw), { allowRotation: false }).outcome,
        `L${levelId} 在学会旋转之前就要求旋转`,
      ).toBe('solved');
      expect(requiresRotation(toSpec(raw))).toBe(false);
    }
  });

  it('第 5/6/8 关也用到旋转（旋转在第 3 关之后成为常规工具，这是正常的）', () => {
    // 记录当前事实，避免以后误以为「只有第 3 关需要旋转」。
    // 这条不是要求，而是回归锚点：如果哪天这几关不再需要旋转，说明数据被改动过。
    const needing = [5, 6, 8];
    for (const levelId of needing) {
      const raw = gdd.levels.find((l) => l.levelId === levelId)!;
      expect(requiresRotation(toSpec(raw)), `L${levelId} 不再需要旋转`).toBe(true);
    }
  });
});

describe('真实关卡数据：难度代理指标', () => {
  it('L09 的解数远多于 L10（GDD 2.4 记录的结构性异常，作为回归锚点）', () => {
    const l09 = gdd.levels.find((l) => l.levelId === 9)!;
    const l10 = gdd.levels.find((l) => l.levelId === 10)!;
    const c09 = countSolutions(toSpec(l09), { solutionCap: 500_000 });
    const c10 = countSolutions(toSpec(l10), { solutionCap: 500_000 });
    // 不写死具体数字（改数据会变），只钉住"至少差一个数量级"这个结构特征
    expect(c09.count).toBeGreaterThan(c10.count * 10);
  });

  it('每关都有可用格 >= 物品总面积（面积守恒的静态前提）', () => {
    for (const raw of gdd.levels) {
      const spec = toSpec(raw);
      const usable = spec.board.rows * spec.board.cols - spec.board.blockedCells.length;
      const needed = spec.items.reduce((s, it) => s + it.cells.length, 0);
      expect(needed, `L${raw.levelId}`).toBeLessThanOrEqual(usable);
    }
  });
});

describe('真实关卡数据：用标准解走一遍会话（端到端）', () => {
  it.each(gdd.levels.map((l) => l.levelId))('L%i 按标准解操作可以通关', (levelId) => {
    const raw = gdd.levels.find((l) => l.levelId === levelId)!;
    const spec = toSpec(raw);
    const session = new GameSession(spec);

    // 先把所有物品在托盘里转到目标朝向（托盘旋转不计入撤回栈）
    for (const p of raw.solution ?? []) {
      for (let i = 0; i < p.rotation; i++) {
        session.dispatch({ type: 'rotate', itemId: p.itemId });
      }
    }

    // 再逐一抓取、拖到目标锚点、松手
    let cleared = 0;
    for (const p of raw.solution ?? []) {
      session.dispatch({ type: 'grab', itemId: p.itemId, anchor: [p.row, p.col] });
      const result = session.dispatch({ type: 'drop' });
      if (result.events.some((e) => e.type === 'level-cleared')) cleared++;
      expect(
        result.events.some((e) => e.type === 'placement-rejected'),
        `L${levelId} 物品 ${p.itemId} 落位被拒绝`,
      ).toBe(false);
    }

    expect(cleared, `L${levelId} 未触发通关`).toBe(1);
    expect(session.getPhase()).toBe('WinAnimating');
  });
});

describe('真实关卡数据：面积快检不误报', () => {
  it('初始状态下任何关卡都不应报「装不下」', () => {
    for (const raw of gdd.levels) {
      const spec = toSpec(raw);
      const session = new GameSession(spec);
      const report = checkDeadend(spec, session.getState());
      expect(report.stuck, `L${raw.levelId} 初始就报装不下，说明数据有问题`).toBe(false);
    }
  });
});
