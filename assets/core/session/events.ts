/**
 * core → view 的事件类型（TDD 8.2）。
 *
 * `GameSession.dispatch()` 返回的事件数组是 view 层唯一的「发生了什么」来源。
 * 事件是**描述性的**（描述已发生的事实），不是命令式的——view 决定怎么表现。
 */

import type { GamePhase, InvalidReason, LevelState, Placement, Rotation } from '../model/types';

export type GameEvent =
  /** 每次 dispatch 后都会带上的「状态已变」信号，view 据此整体重画 */
  | { readonly type: 'state-changed'; readonly state: LevelState }
  /** 一次成功提交。托盘放入与棋盘内移动共用此事件，`from` 区分 */
  | {
      readonly type: 'placement-committed';
      readonly itemId: string;
      readonly placement: Placement;
      readonly from: 'tray' | 'board';
    }
  /** 一次失败尝试。**不改变状态、不入撤回栈**（PRD AC10） */
  | { readonly type: 'placement-rejected'; readonly itemId: string; readonly reason: InvalidReason }
  /** 朝向已改变（托盘或棋盘内均会发出） */
  | { readonly type: 'item-rotated'; readonly itemId: string; readonly rotation: Rotation }
  /** 原位旋转四条策略全部失败，本次旋转**未提交**（TDD 6.5 策略 4） */
  | { readonly type: 'rotate-blocked'; readonly itemId: string }
  /** 物品被取出回托盘（PRD R-06b） */
  | { readonly type: 'item-returned'; readonly itemId: string }
  | { readonly type: 'undo-applied'; readonly steps: number }
  | { readonly type: 'level-reset' }
  | {
      readonly type: 'level-cleared';
      readonly levelId: number;
      readonly elapsedMs: number;
      readonly moves: number;
    }
  /** 确定「装不下」（棋盘里已无任何合法落点）。**单向断言、非阻断**（PRD R-10 / TDD 8.4） */
  | { readonly type: 'deadlock-warning' };

/** `dispatch()` 的返回值。**唯一**的状态读出口 */
export interface SessionResult {
  readonly state: LevelState;
  readonly phase: GamePhase;
  /** 拖动中的预览；非拖动状态为 null */
  readonly preview: import('../model/types').DragPreview | null;
  readonly events: readonly GameEvent[];
}

/** 埋点用的稳定事件名。不要直接用中文文案做 key */
export function eventName(event: GameEvent): string {
  switch (event.type) {
    case 'state-changed':
      return 'state_changed';
    case 'placement-committed':
      return event.from === 'tray' ? 'item_placed' : 'item_moved';
    case 'placement-rejected':
      return 'item_place_invalid';
    case 'item-rotated':
      return 'item_rotated';
    case 'rotate-blocked':
      return 'item_rotate_blocked';
    case 'item-returned':
      return 'item_removed_to_tray';
    case 'undo-applied':
      return 'undo_applied';
    case 'level-reset':
      return 'level_reset';
    case 'level-cleared':
      return 'level_cleared';
    case 'deadlock-warning':
      return 'deadlock_warning';
  }
}
