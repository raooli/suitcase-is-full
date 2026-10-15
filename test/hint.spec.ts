/**
 * 提示纯函数 `suggestNextPlacement` 单测（M2-2 / UI Spec 152 免费提示）。
 *
 * 验证：
 * - 未放置时给出第一件托盘物品的首个合法落点；
 * - 逐步放置后依次提示后续物品；
 * - 全部放完后返回 null（不伪装成可用空按钮）；
 * - 给出的落点本身一定合法（`canPlace` 通过）；
 * - 不可旋转物品只试 rotation=0；
 * - 可旋转物品在「竖着放不下、横着放得下」时返回 rotation=1。
 */

import { describe, expect, it } from 'vitest';

import { canPlace, suggestNextPlacement } from '../assets/core';
import type { LevelSpec } from '../assets/core/model/types';
import { GameSession } from '../assets/core/session/GameSession';

/** 3×4 空棋盘，三件物品，含一件不可旋转 */
const hintLevel: LevelSpec = {
  levelId: 1,
  title: 'hint',
  board: { rows: 3, cols: 4, blockedCells: [] },
  items: [
    { id: 'A', name: 'L3', itemType: 't', spriteKey: 'k', cells: [[0, 0], [1, 0], [1, 1]], rotatable: true, trayOrder: 1 },
    { id: 'B', name: '1x2', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 2 },
    { id: 'C', name: 'fix', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: false, trayOrder: 3 },
  ],
};

/** 首件不可旋转 */
const nonRotLevel: LevelSpec = {
  levelId: 2,
  title: 'nonrot',
  board: { rows: 3, cols: 3, blockedCells: [] },
  items: [
    { id: 'F', name: 'fix', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1], [0, 2]], rotatable: false, trayOrder: 1 },
    { id: 'G', name: '1x2', itemType: 't', spriteKey: 'k', cells: [[0, 0], [0, 1]], rotatable: true, trayOrder: 2 },
  ],
};

/** 1×3 棋盘 + 一件竖向 3×1 物品（rotation=0 放不下，rotation=1 才放得下） */
const rotFitLevel: LevelSpec = {
  levelId: 3,
  title: 'rotfit',
  board: { rows: 1, cols: 3, blockedCells: [] },
  items: [
    { id: 'V', name: 'vertical', itemType: 't', spriteKey: 'k', cells: [[0, 0], [1, 0], [2, 0]], rotatable: true, trayOrder: 1 },
  ],
};

function place(session: GameSession, itemId: string, row: number, col: number): void {
  session.dispatch({ type: 'grab', itemId, anchor: [row, col] });
  session.dispatch({ type: 'drop' });
}

describe('suggestNextPlacement', () => {
  it('未放置时提示第一件托盘物品，且落点合法', () => {
    const state = GameSession.initialState(hintLevel);
    const sug = suggestNextPlacement(hintLevel, state);
    expect(sug).not.toBeNull();
    expect(sug!.itemId).toBe('A');
    expect(sug!.cells.length).toBe(3);
    expect(
      canPlace(hintLevel, state, { itemId: sug!.itemId, row: sug!.row, col: sug!.col, rotation: sug!.rotation }).ok,
    ).toBe(true);
  });

  it('逐步放置后依次提示后续物品', () => {
    const session = new GameSession(hintLevel);
    const sug0 = suggestNextPlacement(hintLevel, session.getState());
    expect(sug0!.itemId).toBe('A');
    place(session, sug0!.itemId, sug0!.row, sug0!.col);

    const sug1 = suggestNextPlacement(hintLevel, session.getState());
    expect(sug1!.itemId).toBe('B');

    place(session, sug1!.itemId, sug1!.row, sug1!.col);
    const sug2 = suggestNextPlacement(hintLevel, session.getState());
    expect(sug2!.itemId).toBe('C');

    place(session, sug2!.itemId, sug2!.row, sug2!.col);
    expect(suggestNextPlacement(hintLevel, session.getState())).toBeNull();
  });

  it('全部放完后返回 null（UI Spec 152：不得伪装成可用空按钮）', () => {
    const session = new GameSession(hintLevel);
    for (const id of ['A', 'B', 'C']) {
      const sug = suggestNextPlacement(hintLevel, session.getState());
      expect(sug).not.toBeNull();
      place(session, sug!.itemId, sug!.row, sug!.col);
    }
    expect(session.getState().tray.length).toBe(0);
    expect(suggestNextPlacement(hintLevel, session.getState())).toBeNull();
  });

  it('不可旋转物品只试 rotation=0', () => {
    const state = GameSession.initialState(nonRotLevel);
    const sug = suggestNextPlacement(nonRotLevel, state);
    expect(sug!.itemId).toBe('F');
    expect(sug!.rotation).toBe(0);
  });

  it('可旋转物品在「竖放不下、横放得下」时返回 rotation=1', () => {
    const state = GameSession.initialState(rotFitLevel);
    const sug = suggestNextPlacement(rotFitLevel, state);
    expect(sug!.itemId).toBe('V');
    expect(sug!.rotation).toBe(1);
    expect(canPlace(rotFitLevel, state, { itemId: 'V', row: sug!.row, col: sug!.col, rotation: 1 }).ok).toBe(true);
  });
});
