/**
 * 会话状态机单测（TDD 第 7 节）。
 *
 * 覆盖 V1.1 新增的三条规则，也是本次文档升级的落点：
 * - R-06b：拖到棋盘外 = 取出到托盘，进撤回栈
 * - R-09：撤回保留朝向，不重置
 * - R-10：面积守恒单向提示
 * 外加一条硬约束：touchCancel 与「取出」必须是两条不同的路径。
 */

import { describe, expect, it } from 'vitest';

import type { LevelSpec } from '../assets/core/model/types';
import { GameSession } from '../assets/core/session/GameSession';
import type { GameEvent } from '../assets/core/session/events';

// ─────────────────────── 测试关卡 ───────────────────────

/** 2×3，放一个 1×3 + 一个 2×2。用于触发「面积守恒」提示 */
const stuckLevel: LevelSpec = {
  levelId: 1,
  title: 'stuck',
  board: { rows: 2, cols: 3, blockedCells: [] },
  items: [
    { id: 'X', name: '1x3', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: true, trayOrder: 1 },
    { id: 'Y', name: 'O4', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], rotatable: true, trayOrder: 2 },
  ],
};

/** 1×3 + 两个 1×3 中的一件。用于通关 */
const winLevel: LevelSpec = {
  levelId: 2,
  title: 'win',
  board: { rows: 1, cols: 3, blockedCells: [] },
  items: [
    { id: 'X', name: '1x3', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: true, trayOrder: 1 },
  ],
};

/**
 * 3×4 带一个障碍。用于取出 / 撤回 / 旋转的常规路径。
 *
 * 刻意放**三件**物品且只放到两件就停下——如果夹具只有两件，
 * 放完两件就通关了，`WinAnimating` 会把输入冻结，
 * 后续的撤回 / 旋转断言就全在测"冻结"而不是它们声称要测的东西。
 */
const roomyLevel: LevelSpec = {
  levelId: 3,
  title: 'roomy',
  board: { rows: 3, cols: 4, blockedCells: [[2, 3]] },
  items: [
    { id: 'A', name: 'L3', itemType: 't', spriteKey: 'k', cells: [[0, 0], [1, 0], [1, 1]], rotatable: true, trayOrder: 1 },
    { id: 'B', name: '1x2', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 2 },
    { id: 'C', name: '1x2b', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: false, trayOrder: 3 },
  ],
};

/** 2×2 塞两件 1×2 + 一件 1×1：两件放下后仍有一件在托盘，保持可操作 */
const tightLevel: LevelSpec = {
  levelId: 4,
  title: 'tight2x2',
  board: { rows: 2, cols: 2, blockedCells: [] },
  items: [
    { id: 'P', name: 'a', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 1 },
    { id: 'Q', name: 'b', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 2 },
    { id: 'R', name: 'c', itemType: 't', spriteKey: 'k', cells: [[0, 0]], rotatable: false, trayOrder: 3 },
  ],
};

function types(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type);
}

function findEvent<T extends GameEvent['type']>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }> | undefined {
  return events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
}

// ─────────────────────── 初始状态 ───────────────────────

describe('GameSession：初始状态', () => {
  it('托盘按 trayOrder 排列，无放置、无选中', () => {
    const session = new GameSession(roomyLevel);
    const state = session.getState();
    expect(state.tray).toEqual(['A', 'B', 'C']);
    expect(state.placements.size).toBe(0);
    expect(state.selectedId).toBeNull();
    expect(state.trayRotations.size).toBe(0);
    expect(session.getPhase()).toBe('Idle');
  });

  it('trayOrder 乱序的输入也会被排好', () => {
    const shuffled: LevelSpec = {
      ...roomyLevel,
      items: [...roomyLevel.items].reverse(),
    };
    expect(new GameSession(shuffled).getState().tray).toEqual(['A', 'B', 'C']);
  });
});

// ─────────────────────── 放置：成功 / 失败 ───────────────────────

describe('GameSession：drop 提交', () => {
  it('合法落位提交成功并发出 placement-committed(from=tray)', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    const result = session.dispatch({ type: 'drop' });

    const committed = findEvent(result.events, 'placement-committed');
    expect(committed?.from).toBe('tray');
    expect(result.state.placements.get('A')).toEqual({ row: 0, col: 0, rotation: 0 });
    expect(result.state.tray).toEqual(['B', 'C']);
    expect(session.moves).toBe(1);
  });

  it('非法落位**不改变状态**，只发 placement-rejected（PRD AC10）', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [2, 2] }); // 会压到 (2,3) 障碍
    const before = session.getState();
    const result = session.dispatch({ type: 'drop' });

    const rejected = findEvent(result.events, 'placement-rejected');
    expect(rejected).toBeDefined();
    expect(result.state).toBe(before);
    expect(result.state.placements.size).toBe(0);
    expect(session.moves).toBe(0);
  });

  it('非法尝试不进入撤回栈', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [9, 9] });
    session.dispatch({ type: 'drop' });
    expect(session.canUndo).toBe(false);
  });

  it('非法落位后保持选中，玩家可以直接重试', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [9, 9] });
    session.dispatch({ type: 'drop' });
    expect(session.getState().selectedId).toBe('A');
    expect(session.getPhase()).toBe('Selected');
  });

  it('棋盘内移动发出 from=board', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 1] });
    const result = session.dispatch({ type: 'drop' });
    expect(findEvent(result.events, 'placement-committed')?.from).toBe('board');
    expect(result.state.placements.get('A')).toMatchObject({ row: 0, col: 1 });
  });

  it('拖动覆盖自身原占位不算冲突（"忽略自身"）', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    // 抓起来后原地松手应当合法
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    const result = session.dispatch({ type: 'drop' });
    expect(findEvent(result.events, 'placement-rejected')).toBeUndefined();
  });
});

// ─────────────────────── 预览 ───────────────────────

describe('GameSession：拖拽预览', () => {
  it('grab 后 preview 携带合法性判定，move 会更新它', () => {
    const session = new GameSession(roomyLevel);
    const grabbed = session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    expect(grabbed.preview?.check.ok).toBe(true);
    expect(session.getPhase()).toBe('Dragging');

    const moved = session.dispatch({ type: 'move', anchor: [9, 9] });
    expect(moved.preview?.check.ok).toBe(false);
  });

  it('非拖动状态下的 move 被忽略', () => {
    const session = new GameSession(roomyLevel);
    const result = session.dispatch({ type: 'move', anchor: [0, 0] });
    expect(result.preview).toBeNull();
    expect(session.getPhase()).toBe('Idle');
  });
});

// ─────────────────────── 取消 vs 取出（必须区分） ───────────────────────

describe('GameSession：cancel 与 removeToTray 是两条不同路径', () => {
  it('cancel 回退，不产生 item-returned，不入撤回栈', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    const afterPlace = session.getState();
    const undoDepthBefore = session.debugSnapshot().undoDepth;

    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 1] });
    const result = session.dispatch({ type: 'cancel' });

    // 注意：grab 本身会把 selectedId 写进 state，所以不与 afterPlace 做引用相等比较；
    // 该比较的是"棋盘布局一格都没动，撤回栈也没长"。
    expect([...result.state.placements.entries()]).toEqual([...afterPlace.placements.entries()]);
    expect(result.state.placements.get('A')).toEqual({ row: 0, col: 0, rotation: 0 });
    expect(findEvent(result.events, 'item-returned')).toBeUndefined();
    expect(session.debugSnapshot().undoDepth).toBe(undoDepthBefore);
    expect(session.getPhase()).toBe('Selected');
  });

  it('removeToTray 取出到托盘并发 item-returned，可撤回', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });

    const result = session.dispatch({ type: 'removeToTray', itemId: 'A' });
    expect(findEvent(result.events, 'item-returned')).toBeDefined();
    expect(result.state.placements.size).toBe(0);
    expect(result.state.tray).toEqual(['A', 'B', 'C']); // 回到原 trayOrder 位置
  });

  it('取出后朝向被保留（PRD R-06b）', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'rotate', itemId: 'A' }); // 棋盘内旋转
    const rotated = session.getState().placements.get('A')!.rotation;

    session.dispatch({ type: 'cancel' }); // 清理拖动态
    const result = session.dispatch({ type: 'removeToTray', itemId: 'A' });
    expect(result.state.trayRotations.get('A')).toBe(rotated);
  });

  it('取出未放置的物品是无操作、不入栈', () => {
    const session = new GameSession(roomyLevel);
    const result = session.dispatch({ type: 'removeToTray', itemId: 'A' });
    expect(findEvent(result.events, 'item-returned')).toBeUndefined();
    expect(session.canUndo).toBe(false);
  });
});

// ─────────────────────── 撤回语义（V1.1 R-09） ───────────────────────

describe('GameSession：撤回', () => {
  it('撤回一次放置后物品回到托盘，且保留被放置时的朝向', () => {
    const session = new GameSession(roomyLevel);
    // 先在托盘里转 2 次 → 朝向 2
    session.dispatch({ type: 'rotate', itemId: 'B' });
    session.dispatch({ type: 'rotate', itemId: 'B' });
    expect(session.getState().trayRotations.get('B')).toBe(2);

    // 直接拖动托盘物品时用的是托盘朝向，这里手动用 grab 之后 drop
    session.dispatch({ type: 'grab', itemId: 'B', anchor: [0, 2] });
    session.dispatch({ type: 'drop' });
    expect(session.getState().placements.get('B')).toMatchObject({ rotation: 2 });

    session.dispatch({ type: 'undo' });
    const state = session.getState();
    expect(state.placements.has('B')).toBe(false);
    // 关键断言：朝向是 2，不是被重置成 0
    expect(state.trayRotations.get('B')).toBe(2);
    expect(state.tray).toEqual(['A', 'B', 'C']);
  });

  it('托盘中旋转**不计入**撤回栈（GDD 1.2）', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'rotate', itemId: 'A' });
    session.dispatch({ type: 'rotate', itemId: 'A' });
    expect(session.canUndo).toBe(false);
  });

  it('棋盘内旋转计入撤回栈，撤回后朝向回退', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'rotate', itemId: 'A' });
    const afterRotate = session.getState().placements.get('A')!.rotation;
    expect(afterRotate).not.toBe(0);

    session.dispatch({ type: 'undo' });
    expect(session.getState().placements.get('A')!.rotation).toBe(0);
  });

  it('连续撤回可以一路退回初始状态', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'grab', itemId: 'B', anchor: [1, 2] });
    session.dispatch({ type: 'drop' });

    session.dispatch({ type: 'undo' });
    session.dispatch({ type: 'undo' });
    const state = session.getState();
    expect(state.placements.size).toBe(0);
    expect(state.tray).toEqual(['A', 'B', 'C']);
    expect(session.canUndo).toBe(false);
  });

  it('空栈时撤回无操作也不抛异常', () => {
    const session = new GameSession(roomyLevel);
    const result = session.dispatch({ type: 'undo' });
    expect(findEvent(result.events, 'undo-applied')).toBeUndefined();
  });

  it('拖动中禁用撤回，避免状态撕裂', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 1] });
    const result = session.dispatch({ type: 'undo' });
    expect(findEvent(result.events, 'undo-applied')).toBeUndefined();
    expect(session.getPhase()).toBe('Dragging');
  });
});

// ─────────────────────── 重置 ───────────────────────

describe('GameSession：重置', () => {
  it('回到初始状态并清空撤回栈', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'rotate', itemId: 'B' });

    const result = session.dispatch({ type: 'reset' });
    expect(findEvent(result.events, 'level-reset')).toBeDefined();
    expect(result.state.placements.size).toBe(0);
    expect(result.state.tray).toEqual(['A', 'B', 'C']);
    expect(result.state.trayRotations.size).toBe(0);
    expect(session.canUndo).toBe(false);
    expect(session.getPhase()).toBe('Idle');
  });

  it('重置本身不进撤回栈（否则"撤回"会撤销重置）', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'reset' });
    const result = session.dispatch({ type: 'undo' });
    expect(findEvent(result.events, 'undo-applied')).toBeUndefined();
  });
});

// ─────────────────────── 通关 ───────────────────────

describe('GameSession：通关判定', () => {
  it('最后一件必需物品入箱后触发 level-cleared', () => {
    const session = new GameSession(winLevel);
    session.dispatch({ type: 'grab', itemId: 'X', anchor: [0, 0] });
    const result = session.dispatch({ type: 'drop' });

    const cleared = findEvent(result.events, 'level-cleared');
    expect(cleared).toBeDefined();
    expect(cleared?.levelId).toBe(2);
    expect(result.phase).toBe('WinAnimating');
  });

  it('通关事件只触发一次（用 phase 转移而不是条件判断）', () => {
    const session = new GameSession(winLevel);
    session.dispatch({ type: 'grab', itemId: 'X', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });

    let extra = 0;
    for (let i = 0; i < 5; i++) {
      const r = session.dispatch({ type: 'drop' });
      if (findEvent(r.events, 'level-cleared')) extra++;
    }
    expect(extra).toBe(0);
  });

  it('WinAnimating 期间输入被冻结', () => {
    const session = new GameSession(winLevel);
    session.dispatch({ type: 'grab', itemId: 'X', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    const before = session.getState();

    session.dispatch({ type: 'removeToTray', itemId: 'X' });
    session.dispatch({ type: 'reset' });
    session.dispatch({ type: 'select', itemId: null });
    expect(session.getState()).toBe(before);
  });

  it('动画结束后进入 Completed', () => {
    const session = new GameSession(winLevel);
    session.dispatch({ type: 'grab', itemId: 'X', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.completeWinAnimation();
    expect(session.getPhase()).toBe('Completed');
  });

  it('未全部放入时不触发通关', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    const result = session.dispatch({ type: 'drop' });
    expect(findEvent(result.events, 'level-cleared')).toBeUndefined();
  });
});

// ─────────────────────── 面积守恒提示（R-10） ───────────────────────

describe('GameSession：装不下提示（单向外加非阻断）', () => {
  it('剩余空间不足时发出 deadlock-warning', () => {
    // 2×3=6 格；放 1×3 后剩 3 格，但还有 2×2=4 格的物品
    const session = new GameSession(stuckLevel);
    session.dispatch({ type: 'grab', itemId: 'X', anchor: [0, 0] });
    const result = session.dispatch({ type: 'drop' });

    const warning = findEvent(result.events, 'deadlock-warning');
    expect(warning).toBeDefined();
    expect(warning?.freeCells).toBe(3);
    expect(warning?.requiredCells).toBe(4);
  });

  it('提示**不**阻断操作，也不判失败', () => {
    const session = new GameSession(stuckLevel);
    session.dispatch({ type: 'grab', itemId: 'X', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    // 仍然可以继续操作
    const result = session.dispatch({ type: 'removeToTray', itemId: 'X' });
    expect(findEvent(result.events, 'item-returned')).toBeDefined();
    expect(session.getPhase()).not.toBe('Completed');
  });

  it('空间充足时不发提示（且不能反向承诺"装得下"）', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    const result = session.dispatch({ type: 'drop' });
    expect(findEvent(result.events, 'deadlock-warning')).toBeUndefined();
  });
});

// ─────────────────────── 旋转 ───────────────────────

describe('GameSession：旋转', () => {
  it('托盘旋转只改朝向，不改 placements', () => {
    const session = new GameSession(roomyLevel);
    const result = session.dispatch({ type: 'rotate', itemId: 'A' });
    const rotated = findEvent(result.events, 'item-rotated');
    expect(rotated?.rotation).toBe(1);
    expect(result.state.placements.size).toBe(0);
    expect(result.state.tray).toEqual(['A', 'B', 'C']);
  });

  it('托盘旋转 4 次回到 0', () => {
    const session = new GameSession(roomyLevel);
    for (let i = 0; i < 4; i++) session.dispatch({ type: 'rotate', itemId: 'A' });
    expect(session.getState().trayRotations.get('A')).toBe(0);
  });

  it('不可旋转物品在托盘中旋转被忽略', () => {
    const level: LevelSpec = {
      ...roomyLevel,
      items: [{ ...roomyLevel.items[0], rotatable: false }, roomyLevel.items[1], roomyLevel.items[2]],
    };
    const session = new GameSession(level);
    const result = session.dispatch({ type: 'rotate', itemId: 'A' });
    expect(findEvent(result.events, 'item-rotated')).toBeUndefined();
  });

  it('原位旋转失败时发出 rotate-blocked 且状态完全不变', () => {
    const session = new GameSession(tightLevel);
    session.dispatch({ type: 'grab', itemId: 'P', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'grab', itemId: 'Q', anchor: [1, 0] });
    session.dispatch({ type: 'drop' });
    // 此时 P、Q 各占一行满填，R 还在托盘 —— 关卡未通关，输入未被冻结
    expect(session.getPhase()).not.toBe('WinAnimating');

    const before = session.getState();
    const result = session.dispatch({ type: 'rotate', itemId: 'P' });

    expect(findEvent(result.events, 'rotate-blocked')).toBeDefined();
    expect(result.state).toBe(before); // 引用相等 = 一个字段都没动
  });
});

// ─────────────────────── 事件契约 ───────────────────────

describe('GameSession：事件契约', () => {
  it('每次 dispatch 都以 state-changed 打头，方便 view 统一重画', () => {
    const session = new GameSession(roomyLevel);
    const result = session.dispatch({ type: 'select', itemId: 'A' });
    expect(result.events[0].type).toBe('state-changed');
  });

  it('已提交状态不会被后续操作就地改写（撤回栈依赖这一点）', () => {
    const session = new GameSession(roomyLevel);
    session.dispatch({ type: 'grab', itemId: 'A', anchor: [0, 0] });
    session.dispatch({ type: 'drop' });
    const snapshot = session.getState();

    // 再做几次操作，早期快照必须原封不动
    session.dispatch({ type: 'grab', itemId: 'B', anchor: [1, 2] });
    session.dispatch({ type: 'drop' });
    session.dispatch({ type: 'rotate', itemId: 'A' });

    expect([...snapshot.placements.keys()]).toEqual(['A']);
    expect(snapshot.placements.get('A')).toEqual({ row: 0, col: 0, rotation: 0 });
    expect(snapshot.tray).toEqual(['B', 'C']);
  });
});
