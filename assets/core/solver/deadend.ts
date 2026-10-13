/**
 * 面积守恒快检（TDD 8.4 / PRD 4.8 R-10）。
 *
 * 为什么需要它：L05 之后一次性放完的概率极低，玩家一定会卡住，
 * 而 PRD 明确「不判失败」。折中方案是——**只在物理上确定装不下时提示**，
 * 不做求解、不判失败。
 *
 * ⚠️ **这个检查是「充分不必要」的**：
 * `freeCells >= requiredCells` **不代表装得下**（形状可能不匹配）。
 * 所以它只能报「确定装不下」，**绝不能**报「确定装得下」，
 * 更不能用来触发任何失败态或禁用操作。
 */

import { buildIndex, usableCellCount } from '../rules/board';
import { rotateBy } from '../geometry/shape';
import type { LevelSpec, LevelState } from '../model/types';

export interface DeadendReport {
  /** 是否**确定**装不下 */
  readonly stuck: boolean;
  /** 剩余可用格数 */
  readonly freeCells: number;
  /** 剩余未放置物品的总格数 */
  readonly requiredCells: number;
}

/** O(可用格 + 物品格) 计算，36 格规模下可忽略 */
export function checkDeadend(level: LevelSpec, state: LevelState): DeadendReport {
  const index = buildIndex(level, state.placements);

  // 只统计**被物品占用**的格。障碍格本身就不在 usableCellCount 里，
  // 若把它也算成 used，可用空间会被双重扣减，导致几乎每关都误报「装不下」。
  let used = 0;
  for (let r = 0; r < level.board.rows; r++) {
    for (let c = 0; c < level.board.cols; c++) {
      if (index.ownerAt(r, c) >= 0) used++;
    }
  }
  const freeCells = usableCellCount(level) - used;

  let requiredCells = 0;
  const itemById = new Map(level.items.map((it) => [it.id, it]));
  for (const id of state.tray) {
    const item = itemById.get(id);
    if (item) requiredCells += item.cells.length;
  }

  return { stuck: freeCells < requiredCells, freeCells, requiredCells };
}

/** 只需要一个布尔的便捷重载 */
export function isDefinitelyStuck(level: LevelSpec, state: LevelState): boolean {
  return checkDeadend(level, state).stuck;
}

/**
 * 反向用途：**仅供调试与工具**，绝对不要用于游戏内逻辑。
 *
 * 它只回答「面积上够不够」，不回答「放得下吗」。
 * 起这个名字是为了让任何想在玩法里调用它的人先停一下。
 */
export function areaIsNotObviouslyInsufficientForDebugOnly(
  level: LevelSpec,
  state: LevelState,
): boolean {
  const { stuck, freeCells, requiredCells } = checkDeadend(level, state);
  if (stuck) return false;
  return freeCells >= requiredCells;
}

/** 供 UI 拼提示文案用的数字：已放置物品数 / 总物品数 */
export function progressOf(level: LevelSpec, state: LevelState): { placed: number; total: number } {
  return { placed: state.placements.size, total: level.items.length };
}

/** 棋盘上每个物品的绝对占据格（含旋转），用于渲染与调试 */
export function occupiedCellsOf(
  level: LevelSpec,
  state: LevelState,
  itemId: string,
): Array<readonly [number, number]> {
  const item = level.items.find((it) => it.id === itemId);
  const placement = state.placements.get(itemId);
  if (!item || !placement) return [];
  return rotateBy(item.cells, placement.rotation).map(
    ([dr, dc]) => [placement.row + dr, placement.col + dc] as const,
  );
}
