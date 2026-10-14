/**
 * 关卡配置的运行时轻量校验（TDD 3 节 `model/level.ts`）。
 *
 * 定位：**挡住坏数据，不做重活**。可解性、难度、标准解合法性都在
 * `solver/packer.ts` 与 `tools/verify-levels.ts` 里做，这里只回答
 * 「这份 JSON 是不是结构上就不成立」。
 *
 * 加载失败时的行为由调用方决定：游戏内应降级到「关卡数据错误」提示，
 * 构建脚本应直接失败退出。
 */

import { MAX_BOARD_SIDE, MAX_ITEMS_PER_LEVEL } from '../config';
import { cellsToKey, hasDuplicates, isConnected, normalize, rotateBy } from '../geometry/shape';
import type { BoardSpec, ItemSpec, LevelSpec, RC } from './types';

export class LevelDataError extends Error {
  constructor(
    message: string,
    readonly problems: readonly string[],
  ) {
    super(message);
    this.name = 'LevelDataError';
  }
}

/** 逐项检查关卡配置。返回空数组表示通过 */
export function validateLevelSpec(level: LevelSpec): string[] {
  const problems: string[] = [];

  if (!Number.isInteger(level.levelId) || level.levelId < 1) {
    problems.push(`levelId 必须为正整数，实际为 ${level.levelId}`);
  }
  if (typeof level.title !== 'string' || level.title.length === 0) {
    problems.push('title 不能为空');
  }

  problems.push(...validateBoard(level.board));
  problems.push(...validateItems(level.board, level.items));

  // 面积守恒的静态前提：物品总面积不能超过可用格
  const usable = level.board.rows * level.board.cols - level.board.blockedCells.length;
  const totalArea = level.items.reduce((s, it) => s + it.cells.length, 0);
  if (totalArea > usable) {
    problems.push(`物品总面积 ${totalArea} 超过棋盘可用格 ${usable}，这关一定装不下`);
  }

  return problems;
}

function validateBoard(board: BoardSpec): string[] {
  const problems: string[] = [];
  for (const [name, value] of [
    ['rows', board.rows],
    ['cols', board.cols],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_BOARD_SIDE) {
      problems.push(`board.${name} 必须为 1..${MAX_BOARD_SIDE} 的整数，实际为 ${value}`);
    }
  }
  if (problems.length > 0) return problems;

  const seen = new Set<string>();
  for (const [r, c] of board.blockedCells) {
    if (!Number.isInteger(r) || !Number.isInteger(c)) {
      problems.push(`障碍坐标必须为整数：(${r}, ${c})`);
      continue;
    }
    if (r < 0 || r >= board.rows || c < 0 || c >= board.cols) {
      problems.push(`障碍格 (${r}, ${c}) 越界`);
      continue;
    }
    const key = cellsToKey([[r, c]]);
    if (seen.has(key)) {
      problems.push(`障碍格 (${r}, ${c}) 重复`);
      continue;
    }
    seen.add(key);
  }
  if (seen.size === board.rows * board.cols) {
    problems.push('棋盘全部为障碍格，没有任何可用空间');
  }
  return problems;
}

function validateItems(board: BoardSpec, items: readonly ItemSpec[]): string[] {
  const problems: string[] = [];

  if (items.length === 0) {
    problems.push('关卡至少要有一件物品');
    return problems;
  }
  if (items.length > MAX_ITEMS_PER_LEVEL) {
    problems.push(`物品数 ${items.length} 超过上限 ${MAX_ITEMS_PER_LEVEL}`);
  }

  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const item of items) {
    if (ids.has(item.id)) problems.push(`物品 id 重复：${item.id}`);
    ids.add(item.id);

    if (item.cells.length === 0) {
      problems.push(`物品 ${item.id} 没有任何格子`);
      continue;
    }
    if (hasDuplicates(item.cells)) {
      problems.push(`物品 ${item.id} 的形状有重复格`);
    }
    if (!isConnected(item.cells)) {
      // 断裂形状会让"包围盒内全为自身格"的假设失效，必须在加载期挡住
      problems.push(`物品 ${item.id} 的形状不是 4 连通（断裂形状不被支持）`);
    }

    const normalized = normalize(item.cells);
    if (cellsToKey(normalized) !== cellsToKey(item.cells)) {
      problems.push(
        `物品 ${item.id} 的 cells 未归一化或未排序，应为 ${cellsToKey(normalized)}`,
      );
    }

    // 形状必须能塞进棋盘。**必须考虑旋转**——例如 L03 那根 1×5 的长柄伞
    // 在 5×4 的棋盘上横着放不下，转 90° 成 5×1 才放得下。
    // 只看初始朝向会把合法的关卡判成坏数据。
    const fitRotations = item.rotatable ? [0, 1, 2, 3] : [0];
    const anyFits = fitRotations.some((rotation) => {
      const shape = rotateBy(item.cells, rotation);
      const box = bboxOfSafe(shape);
      return box.height <= board.rows && box.width <= board.cols;
    });
    if (!anyFits) {
      const box = bboxOfSafe(normalized);
      problems.push(
        `物品 ${item.id}（包围盒 ${box.height}×${box.width}，rotatable=${item.rotatable}）` +
          `在所有朝向下都放不进 ${board.rows}×${board.cols} 的棋盘`,
      );
    }

    if (orders.has(item.trayOrder)) problems.push(`trayOrder 重复：${item.trayOrder}`);
    orders.add(item.trayOrder);
  }

  if (orders.size !== items.length) {
    problems.push('trayOrder 不唯一');
  } else {
    // 注意：这里必须用 Array.from，**不能写 [...orders]**。
    // Cocos Creator 3.8.8 构建的转译是 loose 模式，`[...set]` 会被降级成
    // `[].concat(set)` → `[set]`（Set 被当成单个元素），而 Node/Vitest 里是正确的。
    // 症状是"单测全绿、引擎里数据校验莫名失败"。详见 06-架构设计 第 5 节 R-A10。
    const sorted = Array.from(orders).sort((a, b) => a - b);
    const expected = items.map((_, i) => i + 1);
    if (sorted.join(',') !== expected.join(',')) {
      problems.push(`trayOrder 必须从 1 开始连续，实际为 ${sorted.join(',')}`);
    }
  }

  return problems;
}

function bboxOfSafe(cells: readonly RC[]): { height: number; width: number } {
  let maxR = 0;
  let maxC = 0;
  for (const [r, c] of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { height: maxR + 1, width: maxC + 1 };
}

/** 校验并在失败时抛出。用于"数据有问题就该崩"的构建脚本与测试 */
export function parseLevelSpec(level: LevelSpec): LevelSpec {
  const problems = validateLevelSpec(level);
  if (problems.length > 0) {
    throw new LevelDataError(
      `关卡 L${level.levelId} 数据不合法（${problems.length} 个问题）`,
      problems,
    );
  }
  return level;
}

// ───────────────────────── 关卡包（多关容器） ─────────────────────────

/** `assets/data/levels.json` 的运行时形状。真正的校验在 `parseLevelBundle` 里做 */
export interface LevelBundle {
  readonly levels: readonly LevelSpec[];
}

function looksLikeLevel(value: unknown): value is LevelSpec {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { levelId?: unknown }).levelId === 'number'
  );
}

/**
 * 从关卡包里取出指定关卡并校验。
 *
 * 分这层的原因：`levels.json` 是 `tools/verify-levels.ts` 的产物，运行时拿到的是
 * 一坨 `unknown`。**「包 → 单关」是取数与校验，属于 core**（执行纪律 #3：
 * 逻辑进 core，表现进 view）——view 只负责把资产递进来，不自己拆 JSON 结构。
 *
 * 三处失败都抛 `LevelDataError`（包结构不对 / 没有这一关 / 这一关本身不合法），
 * 调用方（view）降级为 UI 提示，构建脚本直接失败退出。
 */
export function parseLevelBundle(raw: unknown, levelId: number): LevelSpec {
  if (typeof raw !== 'object' || raw === null) {
    throw new LevelDataError('关卡包不是对象', ['期望形如 { schemaVersion, levels: [...] } 的对象']);
  }

  const levels = (raw as { levels?: unknown }).levels;
  if (!Array.isArray(levels)) {
    throw new LevelDataError('关卡包缺少 levels 数组', ['levels 字段必须存在且为数组']);
  }

  const hit = levels.find((candidate) => looksLikeLevel(candidate) && candidate.levelId === levelId);
  if (hit === undefined) {
    const present = levels.filter(looksLikeLevel).map((l) => l.levelId);
    throw new LevelDataError(
      `关卡包里没有 L${levelId}`,
      [`包内已有 levelId：${present.length > 0 ? present.join(', ') : '（无）'}`],
    );
  }

  return parseLevelSpec(hit);
}

/**
 * 关卡包里有哪些关卡（`levelId` 升序、去重、只收形状像关卡的条目）。
 *
 * 用途（M2-1）：
 * 1. **「下一关」是否存在**——最后一关（当前是第 10 关）没有下一关，不能显示
 *    一个点不动的按钮（UI Spec：禁止空按钮）。判断"有没有下一关"是**逻辑**，
 *    不该由 view 自己数数组长度；
 * 2. **运行时载入体检**——M2-1 的验收是「10/10 关能载入且可解」，需要对包里
 *    每一关逐个 `parseLevelBundle` 试一遍，而"有哪些关"要先问它。
 *
 * 与 `parseLevelBundle` 同一层的原因相同：view 不自己拆 JSON 结构
 * （执行纪律 #3）。取不到就返回空数组——调用方按"没有关卡"降级，
 * 不把包结构问题抛到引擎层。
 */
export function levelIdsOf(raw: unknown): number[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const levels = (raw as { levels?: unknown }).levels;
  if (!Array.isArray(levels)) return [];

  const ids = new Set<number>();
  for (const candidate of levels) {
    if (looksLikeLevel(candidate)) ids.add(candidate.levelId);
  }
  return Array.from(ids).sort((a, b) => a - b);
}

