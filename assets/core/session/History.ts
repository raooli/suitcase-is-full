/**
 * 快照式撤回栈（TDD 7.3）。
 *
 * **裁决：存 `LevelState` 完整快照，不存「反向操作」。**
 *
 * 理由：反向操作要为每种 intent 写一份逆操作（放置↔取出、旋转↔逆旋转、移动↔移回），
 * 并在「托盘朝向」这类耦合上反复出错。而本项目的状态极小
 * （≤9 个 placement + ≤9 个 tray 项 + 2 个 map），一个快照就是几十个整数，
 * 存 50 步也才几千个数字。**用人力换正确性，个人开发必须这么选。**
 *
 * 因为 `LevelState` 整体不可变，这里存的「旧对象」天然免疫后续修改。
 */

import { UNDO_LIMIT } from '../config';
import type { LevelState } from '../model/types';

export class History {
  private stack: LevelState[] = [];

  constructor(private readonly limit: number = UNDO_LIMIT) {
    if (limit < 1) throw new Error('History limit must be >= 1');
  }

  /**
   * 压入一个**操作前**的快照。
   *
   * 调用时机：只在一次操作**确认会成功提交**之后压入，
   * 否则撤回会撤到一个从未存在过的状态。
   */
  push(stateBefore: LevelState): void {
    this.stack.push(stateBefore);
    // 超限时丢最旧的一条。丢最旧而不是最新的，保证「最近 N 步一定能撤回」
    while (this.stack.length > this.limit) this.stack.shift();
  }

  /** 弹出上一个快照。空栈返回 null（UI 应据此把撤回按钮置灰） */
  pop(): LevelState | null {
    return this.stack.pop() ?? null;
  }

  /** 预检：不会真正弹出。用于 UI 决定按钮是否可用 */
  peekDepth(): number {
    return this.stack.length;
  }

  get canUndo(): boolean {
    return this.stack.length > 0;
  }

  clear(): void {
    this.stack = [];
  }

  /** 调试用：导出内部快照数量与限制 */
  debugInfo(): { depth: number; limit: number } {
    return { depth: this.stack.length, limit: this.limit };
  }
}
