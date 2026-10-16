/**
 * 首次引导规则单测（PRD F13 / UI Spec 5.2·7·14 / GDD 3.1·3.3 / 实施计划 M2-6）。
 *
 * 重点是两条语义：
 * 1. 「已学会后本关不再弹出」≠「出现过一次就不再弹出」——**跳过不记学会**；
 * 2. 学会判据绑定 core 事件（`placement-committed` / `item-rotated`），
 *    不绑定"引导显示过"，也不把拖拽中的中间态（state-changed）算学会。
 */

import { describe, expect, it } from 'vitest';

import { GuideMemory, guideDoneEventOf, guideKindOf, guideLearnedBy } from '../assets/core/guide';

describe('guideKindOf：哪关有引导（PRD F13「实际关次以 GDD 为准」）', () => {
  it('第 1 关 = 拖拽教学、第 3 关 = 旋转教学', () => {
    expect(guideKindOf(1)).toBe('drag');
    expect(guideKindOf(3)).toBe('rotate');
  });

  it('其余关卡不弹任何引导（GDD 从第 4 关起明确不给强制引导）', () => {
    for (const id of [2, 4, 5, 6, 7, 8, 9, 10]) {
      expect(guideKindOf(id)).toBeNull();
    }
  });

  it('越界关次（0 / 负 / 超大）也不是引导关', () => {
    expect(guideKindOf(0)).toBeNull();
    expect(guideKindOf(-1)).toBeNull();
    expect(guideKindOf(999)).toBeNull();
  });
});

describe('guideDoneEventOf / guideLearnedBy：什么算「已学会」', () => {
  it('drag → 成功放入一件才算（拖起来看看不算）', () => {
    expect(guideDoneEventOf('drag')).toBe('placement-committed');
    expect(guideLearnedBy('drag', 'placement-committed')).toBe(true);
    expect(guideLearnedBy('drag', 'item-rotated')).toBe(false);
    // 拖拽过程中的中间态不是"完成"
    expect(guideLearnedBy('drag', 'state-changed')).toBe(false);
  });

  it('rotate → 成功旋转一次才算（转不动不算）', () => {
    expect(guideDoneEventOf('rotate')).toBe('item-rotated');
    expect(guideLearnedBy('rotate', 'item-rotated')).toBe(true);
    expect(guideLearnedBy('rotate', 'placement-committed')).toBe(false);
    expect(guideLearnedBy('rotate', 'rotate-blocked')).toBe(false);
  });

  it('放不下 / 取出 / 撤回 / 重置都不算学会', () => {
    for (const kind of ['drag', 'rotate'] as const) {
      expect(guideLearnedBy(kind, 'placement-rejected')).toBe(false);
      expect(guideLearnedBy(kind, 'item-returned')).toBe(false);
      expect(guideLearnedBy(kind, 'undo-applied')).toBe(false);
      expect(guideLearnedBy(kind, 'level-reset')).toBe(false);
    }
  });
});

describe('GuideMemory：本关已学会后不再弹出', () => {
  it('有引导且没学会 → 该弹；无引导的关永远不弹', () => {
    const memory = new GuideMemory();
    expect(memory.shouldShow(1)).toBe(true);
    expect(memory.shouldShow(3)).toBe(true);
    expect(memory.shouldShow(2)).toBe(false); // 第 2 关没有引导
  });

  it('学会后不再弹（同一关），且不影响别的关', () => {
    const memory = new GuideMemory();
    memory.markLearned(1);
    expect(memory.shouldShow(1)).toBe(false);
    expect(memory.isLearned(1)).toBe(true);
    expect(memory.shouldShow(3)).toBe(true); // 第 3 关的引导独立
  });

  it('语义 1：跳过（只是让引导消失）不记学会，重进本关仍再提示一次', () => {
    const memory = new GuideMemory();
    expect(memory.shouldShow(1)).toBe(true);
    // 玩家点掉了引导 → 视图只调 hide()，**不**调 markLearned
    expect(memory.isLearned(1)).toBe(false);
    expect(memory.shouldShow(1)).toBe(true);
  });

  it('markLearned 幂等', () => {
    const memory = new GuideMemory();
    memory.markLearned(3);
    memory.markLearned(3);
    expect(memory.learnedLevels()).toEqual([3]);
  });

  it('学会的是「关」而不是「引导种类」：第 1 关学会不影响第 3 关', () => {
    const memory = new GuideMemory();
    memory.markLearned(1);
    expect(memory.learnedLevels()).toEqual([1]);
    expect(memory.shouldShow(3)).toBe(true);
    memory.markLearned(3);
    expect(memory.learnedLevels()).toEqual([1, 3]);
  });

  it('存档往返（M2-8）：learnedLevels → restore 后行为一致', () => {
    const memory = new GuideMemory();
    memory.markLearned(1);
    const saved = memory.learnedLevels();

    const restored = new GuideMemory();
    restored.restore(saved);
    expect(restored.shouldShow(1)).toBe(false);
    expect(restored.shouldShow(3)).toBe(true);

    restored.reset();
    expect(restored.shouldShow(1)).toBe(true);
    expect(restored.learnedLevels()).toEqual([]);
  });
});
