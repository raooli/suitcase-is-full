/**
 * 关卡进度模型单测（M2-7：首页选关 + 解锁）。
 *
 * 重点：
 * 1. 解锁门禁——第 1 关永远可进，未解锁关被挡；
 * 2. `markCleared` 解锁下一关并封顶到最后一关；
 * 3. `continueLevelId` 永远落在 [1, maxLevelId]；
 * 4. 不可变——`markCleared` 不就地改原对象；
 * 5. `coerceProgress` 对脏数据回退默认、对合法数据原样保真；
 * 6. M2-9 `setMuted`：静音态与其余持久态同存一份存档、互不覆盖（AC18）。
 */

import { describe, expect, it } from 'vitest';

import {
  coerceProgress,
  continueLevelId,
  defaultProgress,
  isCleared,
  isUnlocked,
  markCleared,
  setLearnedLevels,
  setMuted,
} from '../assets/core/progress';
import type { SaveDataV1 } from '../assets/core/model/types';

const MAX = 10;

describe('defaultProgress：首启默认值', () => {
  it('仅第 1 关解锁、无通关记录、无已学引导', () => {
    const p = defaultProgress(1000);
    expect(p.schemaVersion).toBe(1);
    expect(p.maxUnlockedLevelId).toBe(1);
    expect(p.clearedLevelIds).toEqual([]);
    expect(p.learnedLevelIds).toEqual([]);
    expect(p.muted).toBe(false);
    expect(p.updatedAt).toBe(1000);
  });
});

describe('isUnlocked：解锁门禁', () => {
  it('第 1 关永远解锁', () => {
    const p = defaultProgress(0);
    expect(isUnlocked(p, 1)).toBe(true);
  });

  it('首启时第 2 关未解锁', () => {
    const p = defaultProgress(0);
    expect(isUnlocked(p, 2)).toBe(false);
  });

  it('通关第 1 关后第 2 关解锁、第 3 关仍锁', () => {
    const p = markCleared(defaultProgress(0), 1, MAX, 1);
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(isUnlocked(p, 3)).toBe(false);
  });

  it('非整数 / 0 / 负数 / 超大都不算解锁', () => {
    const p = markCleared(defaultProgress(0), 1, MAX, 1);
    expect(isUnlocked(p, 0)).toBe(false);
    expect(isUnlocked(p, -1)).toBe(false);
    expect(isUnlocked(p, 1.5)).toBe(false);
    expect(isUnlocked(p, 999)).toBe(false);
  });
});

describe('isCleared：通关标记', () => {
  it('通关后该关标记为已通关', () => {
    const p = markCleared(defaultProgress(0), 3, MAX, 1);
    expect(isCleared(p, 3)).toBe(true);
    expect(isCleared(p, 1)).toBe(false);
  });
});

describe('markCleared：解锁下一关 + 封顶', () => {
  it('通关 N 解锁 N+1，且去重（重复通关同关不产生重复记录）', () => {
    let p = defaultProgress(0);
    p = markCleared(p, 1, MAX, 1);
    p = markCleared(p, 1, MAX, 2); // 重复
    expect(p.clearedLevelIds).toEqual([1]);
    expect(p.maxUnlockedLevelId).toBe(2);
  });

  it('多关连续通关累积解锁', () => {
    let p = defaultProgress(0);
    for (const id of [1, 2, 3, 4]) p = markCleared(p, id, MAX, id);
    expect(p.clearedLevelIds).toEqual([1, 2, 3, 4]);
    expect(p.maxUnlockedLevelId).toBe(5);
  });

  it('最后一关通关后不再解锁超出 maxLevelId 的关', () => {
    let p = defaultProgress(0);
    p = markCleared(p, MAX, MAX, 1); // 通关第 10 关
    expect(p.maxUnlockedLevelId).toBe(MAX); // 不变成 11
    expect(isUnlocked(p, MAX)).toBe(true);
    expect(isUnlocked(p, MAX + 1)).toBe(false);
  });

  it('不可变：原对象不被修改', () => {
    const original = defaultProgress(0);
    const snapshot = JSON.parse(JSON.stringify(original));
    markCleared(original, 1, MAX, 1);
    expect(original).toEqual(snapshot);
  });

  it('updatedAt 被刷新为传入的时间', () => {
    const p = markCleared(defaultProgress(0), 1, MAX, 12345);
    expect(p.updatedAt).toBe(12345);
  });
});

describe('continueLevelId：继续游戏入口', () => {
  it('首启进第 1 关', () => {
    expect(continueLevelId(defaultProgress(0), MAX)).toBe(1);
  });

  it('通关第 1 关后继续进第 2 关', () => {
    const p = markCleared(defaultProgress(0), 1, MAX, 1);
    expect(continueLevelId(p, MAX)).toBe(2);
  });

  it('通关最后一关后继续仍停在最后一关（封顶）', () => {
    const p = markCleared(defaultProgress(0), MAX, MAX, 1);
    expect(continueLevelId(p, MAX)).toBe(MAX);
  });

  it('maxLevelId <= 0 的极端输入不越界（返回 1）', () => {
    expect(continueLevelId(defaultProgress(0), 0)).toBe(1);
  });
});

describe('coerceProgress：脏数据容错', () => {
  it('null / 非对象 → 默认', () => {
    expect(coerceProgress(null, 5)).toEqual(defaultProgress(5));
    expect(coerceProgress('garbage', 5)).toEqual(defaultProgress(5));
  });

  it('schemaVersion 不是 1 → 默认', () => {
    expect(coerceProgress({ schemaVersion: 2, maxUnlockedLevelId: 9 }, 5)).toEqual(defaultProgress(5));
  });

  it('字段残缺 / 类型错误 → 各回退默认子值，不抛', () => {
    const p = coerceProgress({ schemaVersion: 1 }, 7);
    expect(p.maxUnlockedLevelId).toBe(1);
    expect(p.clearedLevelIds).toEqual([]);
    expect(p.muted).toBe(false);
    expect(p.updatedAt).toBe(7);
  });

  it('clearedLevelIds 混入非正整数会被过滤并排序', () => {
    const p = coerceProgress(
      { schemaVersion: 1, maxUnlockedLevelId: 5, clearedLevelIds: [3, 1, 0, -2, 2, 1] },
      7,
    );
    expect(p.clearedLevelIds).toEqual([1, 2, 3]);
  });

  it('合法的存档原样保真（含 muted / updatedAt / learnedLevelIds）', () => {
    const saved: SaveDataV1 = {
      schemaVersion: 1,
      maxUnlockedLevelId: 6,
      clearedLevelIds: [1, 2, 3, 4, 5],
      learnedLevelIds: [1, 3],
      muted: true,
      updatedAt: 999,
    };
    expect(coerceProgress(saved, 7)).toEqual(saved);
  });

  it('learnedLevelIds 混入非正整数会被过滤并排序', () => {
    const p = coerceProgress(
      { schemaVersion: 1, maxUnlockedLevelId: 5, learnedLevelIds: [3, 1, 0, -2, 1] },
      7,
    );
    expect(p.learnedLevelIds).toEqual([1, 3]);
  });
});

describe('setLearnedLevels：已学引导持久化（M2-8）', () => {
  it('去重 + 排序 + 过滤非正整数，返回新对象', () => {
    const p = setLearnedLevels(defaultProgress(0), [3, 1, 1, -2, 0, 2], 99);
    expect(p.learnedLevelIds).toEqual([1, 2, 3]);
    expect(p.updatedAt).toBe(99);
  });

  it('不可变：原对象不被修改', () => {
    const original = defaultProgress(0);
    const snapshot = JSON.parse(JSON.stringify(original));
    setLearnedLevels(original, [1], 1);
    expect(original).toEqual(snapshot);
  });

  it('非数组 / 缺省输入安全退化', () => {
    expect(setLearnedLevels(defaultProgress(0), null as never, 1).learnedLevelIds).toEqual([]);
    expect(setLearnedLevels(defaultProgress(0), undefined as never, 1).learnedLevelIds).toEqual([]);
  });

  it('与 markCleared 互不覆盖：先学引导再通关，两者都在', () => {
    let p = setLearnedLevels(defaultProgress(0), [1], 1);
    p = markCleared(p, 1, MAX, 2);
    expect(p.learnedLevelIds).toEqual([1]);
    expect(p.clearedLevelIds).toEqual([1]);
    expect(p.maxUnlockedLevelId).toBe(2);
  });

  it('markCleared 透传已学引导（不丢）', () => {
    const base = setLearnedLevels(defaultProgress(0), [1, 3], 1);
    const after = markCleared(base, 2, MAX, 2);
    expect(after.learnedLevelIds).toEqual([1, 3]);
  });
});

describe('setMuted：静音持久化写入侧（M2-9 / PRD F14 / AC18）', () => {
  it('只改 muted 一个字段，其余原样透传', () => {
    const base: SaveDataV1 = {
      schemaVersion: 1,
      maxUnlockedLevelId: 4,
      clearedLevelIds: [1, 2, 3],
      learnedLevelIds: [1],
      muted: false,
      updatedAt: 500,
    };
    const after = setMuted(base, true, 900);
    expect(after.muted).toBe(true);
    expect(after.maxUnlockedLevelId).toBe(4);
    expect(after.clearedLevelIds).toEqual([1, 2, 3]);
    expect(after.learnedLevelIds).toEqual([1]);
    expect(after.updatedAt).toBe(900);
  });

  it('不可变：原对象不被修改', () => {
    const original = defaultProgress(0);
    const snapshot = JSON.parse(JSON.stringify(original));
    setMuted(original, true, 1);
    expect(original).toEqual(snapshot);
  });

  it('与 markCleared / setLearnedLevels 互不覆盖（同一份存档三条写链）', () => {
    let p = markCleared(defaultProgress(0), 1, MAX, 1); // 通关链
    p = setLearnedLevels(p, [1], 2); // 已学引导链
    p = setMuted(p, true, 3); // 静音链
    expect(p.muted).toBe(true);
    expect(p.clearedLevelIds).toEqual([1]);
    expect(p.learnedLevelIds).toEqual([1]);
    // 反向：先静音再通关，muted 不丢
    const q = markCleared(setMuted(defaultProgress(0), true, 1), 2, MAX, 2);
    expect(q.muted).toBe(true);
    expect(q.clearedLevelIds).toEqual([2]);
  });
});
