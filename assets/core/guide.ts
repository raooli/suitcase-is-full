/**
 * 首次引导规则（PRD F13 / UI Spec 5.2·7·14 / GDD 3.1·3.3 / 实施计划 M2-6）。
 *
 * ## 规格原文（四处文档同一口径）
 *
 * - PRD F13（P0）：基础引导 = 第 1 关拖动提示、第 3 关旋转提示（"实际关次以
 *   GDD 为准"）。
 * - UI Spec 5.2：第 1 关首次进入展示「拖动物品入箱」的手指示意 + 蒙层高亮，
 *   第 3 关首次进入展示「点击旋转按钮」引导；由 `GuideOverlay` 实现，**仅作用于
 *   提示层级、不拦截棋盘核心交互**，**已学会后本关不再重复弹出**，引导出现时
 *   棋盘仍可被拖拽。
 * - UI Spec 7 / 14：首次引导**可跳过**——玩家拖动或点击后即消失，本关不重复弹出。
 * - GDD 3.1：L1「开局显示一次指引：长按任一物品并拖到箱子里，建议先突出
 *   `L01_A` 以及它在标准解中的目标位置」；GDD 3.3：L3「优先引导 `L03_D`……
 *   转个方向试试？选中后点击一次顺时针旋转即可放下」。
 *
 * ## 两条容易做错的语义（本文件的存在理由）
 *
 * 1. **「已学会后本关不再弹出」≠「出现过一次就不再弹出」。** 规格写的是前者。
 *    所以"跳过"（玩家拖动 / 点击让引导消失）**不记学会**，重进本关仍会再提示一次；
 *    只有玩家真正做到了被教的动作才算学会。若按后者实现，玩家手一抖点掉引导
 *    就永远失去了这次教学。
 * 2. **学会判据必须绑定事件、不能绑定"引导显示过"。** `placement-committed` /
 *    `item-rotated` 是 core 已提交的事实，用它判学会才不会与"预览 / 拖拽中"
 *    这类中间态混淆（拖拽时预览是绿的但还没提交，不算学会）。
 *
 * ## 为什么进 core
 *
 * "哪关有引导""什么算学会"是**规则**，不是画法；view 层没有单测兜底，而这两条
 * 判据写错的表现是"该教的时候不教 / 不该弹的时候反复弹"，只有跑起来才发现。
 * 进 core 后成为可断言的常量（`test/guide.spec.ts`）。
 *
 * ## 持久化（M2-8 再接）
 *
 * `GuideMemory` 目前只存活在内存里（进程内有效）。M2-8 的 `StorageAdapter` 落地后，
 * 用 `learnedLevels()` / `restore()` 两个方向接上即可，调用方（`GameController`）
 * 无需改动。
 */

import type { GameEvent } from './session/events';

/** 引导种类 */
export type GuideKind = 'drag' | 'rotate';

/**
 * 能判定"已学会"的事件类型。
 *
 * 用 `Extract` 从 `GameEvent` 里取，而不是手写字符串联合——将来事件改名时
 * 这里会编译报错，不会静默失配。
 */
export type GuideDoneEvent = Extract<
  GameEvent,
  { readonly type: 'placement-committed' | 'item-rotated' }
>['type'];

/**
 * 这一关有没有首次引导，有则是哪种。
 *
 * 关次来自 GDD 3.1（第 1 关 = 纯拖拽教学）与 3.3（第 3 关 = 首次旋转），
 * 与 PRD F13 的「实际关次以 GDD 为准」一致。**其余关卡不弹任何引导**
 * （GDD 从第 4 关起明确"不强制教学弹窗 / 不给新的强制引导"）。
 */
export function guideKindOf(levelId: number): GuideKind | null {
  if (levelId === 1) return 'drag';
  if (levelId === 3) return 'rotate';
  return null;
}

/**
 * 判定该引导"已学会"的事件类型（UI Spec 7「已学会后本关不再弹出」）。
 *
 * - `drag`：成功放入一件（`placement-committed`）。拖起来看看不算——玩家可能
 *   只是试探，还没真的完成"把物品拖进箱子"。
 * - `rotate`：成功旋转一次（`item-rotated`）。`rotate-blocked`（转不动）不算。
 */
export function guideDoneEventOf(kind: GuideKind): GuideDoneEvent {
  return kind === 'drag' ? 'placement-committed' : 'item-rotated';
}

/** 这个事件是否代表该引导已学会（供 view 遍历事件表时逐条问） */
export function guideLearnedBy(kind: GuideKind, eventType: GameEvent['type']): boolean {
  return guideDoneEventOf(kind) === eventType;
}

/**
 * 引导记忆：记住哪些关已经学会（UI Spec「本关已学会后不再弹出」）。
 *
 * 只记 `levelId`，不记"显示过几次"——见文件头语义 1。
 */
export class GuideMemory {
  private learned = new Set<number>();

  /** 这一关现在该不该弹引导（有关引导且还没学会） */
  shouldShow(levelId: number): boolean {
    return guideKindOf(levelId) !== null && !this.learned.has(levelId);
  }

  /** 标记已学会。幂等（重复标记无副作用） */
  markLearned(levelId: number): void {
    this.learned.add(levelId);
  }

  isLearned(levelId: number): boolean {
    return this.learned.has(levelId);
  }

  /** 已学会的关卡（供 M2-8 存档序列化） */
  learnedLevels(): number[] {
    return Array.from(this.learned).sort((a, b) => a - b);
  }

  /** 从存档恢复（M2-8）。升序无关的任意顺序都接受 */
  restore(levels: readonly number[]): void {
    this.learned.clear();
    for (const levelId of levels) this.learned.add(levelId);
  }

  /** 清空（"重置进度"用） */
  reset(): void {
    this.learned.clear();
  }
}
