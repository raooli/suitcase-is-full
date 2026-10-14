/**
 * 关卡包的**运行时载入**（M2-1 验收口径：「10/10 关能载入且可解」）。
 *
 * 分工：
 * - **可解**由 `npm run verify:levels` 逐关跑 solver 保证（已编入 `npm run check`）；
 * - **能载入**是本文件的活——运行时拿到的是一坨 `unknown`（`JsonAsset.json`），
 *   要经 `parseLevelBundle` 才能变成 `LevelSpec`。**每一关都试一遍**，否则会
 *   出现"第 1 关跑得好好的、第 7 关一进就白屏"。
 *
 * 为什么用**生产态** `assets/data/levels.json` 而不是 GDD 源：运行时读的就是它
 * （`tools/verify-levels.ts` 剥离开发字段后的产物），拿源数据验等于没验——
 * 开发字段被剥离后结构可能变，这里要盯的正是产物。
 */

import { describe, expect, it } from 'vitest';

import { LevelDataError, levelIdsOf, parseLevelBundle } from '../assets/core';
import type { LevelSpec } from '../assets/core';
import levelsBundle from '../assets/data/levels.json';

/** 运行时拿到的就是这种 `unknown`：Cocos `JsonAsset.json` 的类型 */
const raw: unknown = levelsBundle;

describe('levelIdsOf', () => {
  it('生产态关卡包里是 1..10 连续十关（升序、去重）', () => {
    expect(levelIdsOf(raw)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('取不到时返回空数组，不抛（调用方按"没有关卡"降级）', () => {
    expect(levelIdsOf(null)).toEqual([]);
    expect(levelIdsOf(undefined)).toEqual([]);
    expect(levelIdsOf({})).toEqual([]);
    expect(levelIdsOf({ levels: 'not-an-array' })).toEqual([]);
  });

  it('跳过形状不像关卡的条目（缺 levelId 的不算一关）', () => {
    expect(levelIdsOf({ levels: [{ levelId: 2 }, { name: 'x' }, { levelId: 1 }] })).toEqual([1, 2]);
  });
});

describe('10 关逐关载入（M2-1 验收）', () => {
  const ids = levelIdsOf(raw);

  it('包里确实有 10 关', () => {
    expect(ids).toHaveLength(10);
  });

  for (const id of ids) {
    it(`L${id} 能被 parseLevelBundle 取出且 levelId 对得上`, () => {
      const level: LevelSpec = parseLevelBundle(raw, id);
      expect(level.levelId).toBe(id);
      // 载入的最低要求：棋盘与物品都读到了，才谈得上渲染与放置
      expect(level.board.rows).toBeGreaterThan(0);
      expect(level.board.cols).toBeGreaterThan(0);
      expect(level.items.length).toBeGreaterThan(0);
    });
  }

  it('最后一关之后没有下一关（第 10 关不给空按钮）', () => {
    const last = Math.max(...ids);
    expect(last).toBe(10);
    // 越界取关必须失败——否则「下一关」按钮会把玩家送进一个不存在的关卡
    expect(() => parseLevelBundle(raw, last + 1)).toThrow(LevelDataError);
  });
});
