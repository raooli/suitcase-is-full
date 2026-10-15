/**
 * 面积守恒快检（TDD 8.4 / PRD 4.8 R-10）。
 *
 * ## 作用
 *
 * 玩家把局面走死（剩余物品在当前棋盘里无论如何都放不进）时，给一条**非阻断**
 * 轻提示（UI Spec 13：提示出现时棋盘仍可操作，故文案指向「挪一挪 / 撤回一步」）。
 * PRD 明确「不判失败」，所以这条提示**绝不**触发失败态、禁用操作或求解式无解警告。
 *
 * ## 判据：无合法落点（而非面积守恒）
 *
 * 旧实现用 `freeCells < requiredCells` 做快检，但它**与摆放进度无关**
 * （`freeCells − requiredCells = 可用格 − 物品总面积`，恒成立）。于是它只能检出
 * 「关卡本身过载（物品总面积 > 可用格）」，对**玩家摆错**毫无作用——而 10 个正式
 * 关卡全部 ≤ 满载，导致 `deadlock-warning` 在正规玩法里**永不触发**、Toast 沦为
 * 死代码（M2-4 推进时实测发现）。
 *
 * 新判据改为：**若每件剩余物品都在当前空格里找不到任何（含旋转）合法落点，则当前
 * 局面确定装不下**。这是真正反映「玩家把局面走死」的必要条件。实现上**直接复用
 * rules 层既有的 `suggestNextPlacement`**（`stuck = suggestNextPlacement(...) === null`）
 * ——「有无合法落点」的真相源只能有一处，另写一遍扫描必与工具栏 `canHint` 分叉。
 *
 * ⚠️ **仍是单向断言**：`stuck=false` 只说明「至少有一件能放下」，不代表最终装得下
 * （形状 / 邻域约束可能仍无解）。所以它**绝不**用来触发失败态或禁用操作。
 */

import { buildIndex, usableCellCount } from '../rules/board';
import { suggestNextPlacement } from '../rules/placement';
import { rotateBy } from '../geometry/shape';
import type { LevelSpec, LevelState } from '../model/types';

export interface DeadendReport {
  /** 当前局面是否**确定**装不下：任何剩余物品都找不到合法落点 */
  readonly stuck: boolean;
  /** 剩余可用格数（不含障碍） */
  readonly freeCells: number;
  /** 剩余未放置物品的总格数 */
  readonly requiredCells: number;
}

/**
 * 判定「一定装不下」（UI Spec 13 / PRD R-10 / TDD 8.4）。
 *
 * 见文件头注释：用「无合法落点」取代退化（放置无关）的面积守恒快检；
 * 该判据复用 rules 层的 `suggestNextPlacement`，不另写扫描。
 * `freeCells` / `requiredCells` 仍计算出来供调试日志与事件透传，但不作为判据。
 */
export function checkDeadend(level: LevelSpec, state: LevelState): DeadendReport {
  const index = buildIndex(level, state.placements);

  // 只统计**被物品占用**的格。障碍格本身就不在 usableCellCount 里，
  // 若把它也算成 used，可用空间会被双重扣减，导致几乎每关都误报「装不下」
  // （M1-7 修复记录）。
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

  // 空托盘（已通关）→ 不提示
  if (state.tray.length === 0) return { stuck: false, freeCells, requiredCells };

  // 关键判据：是否**还有至少一件**剩余物品能找到合法落点（含旋转）。
  // 一件都找不到 → 当前局面确定装不下。复用 rules 层 `suggestNextPlacement`
  // （返回 null 即「没有任何托盘物品放得下」），不另写一遍扫描。
  const stuck = suggestNextPlacement(level, state) === null;

  return { stuck, freeCells, requiredCells };
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
