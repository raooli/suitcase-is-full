/**
 * 关卡拉箱求解器：Bitset + MRV + 回溯（TDD 9.1）。
 *
 * **只在构建 / CI 跑，不在运行时跑**（除非将来做「给一个安全落位建议」的提示）。
 * 所以这里的取舍是：优先保证「结论可信 + 不卡死」，其次才是性能。
 *
 * 三条硬性口径：
 * 1. 6×6 = 36 格超过 32 位，用 `bigint` 作 bitset。36 位下 bigint 性能毫无问题。
 * 2. 节点超限返回 `'unknown'` 而**不是** `'unsolvable'` —— 二者混淆会让
 *    「求解器没算完」被误读成「这关无解」，进而误删一个正常关卡。
 * 3. 预处理把每件物品、每个朝向、每个 anchor 的 mask 全部算好，
 *    与「当前占用」无关；搜索阶段只做 `(mask & occ) === 0n` 判定。
 */

import { ENABLE_HOLE_PRUNE, SOLVER_MAX_NODES } from '../config';
import { rotationVariants } from '../geometry/shape';
import type { LevelSpec, RC, Rotation } from '../model/types';

// ───────────────────────────── 结果类型 ─────────────────────────────

export type SolveOutcome =
  /** 找到了解 */
  | 'solved'
  /** **证明**无解（搜索空间穷尽） */
  | 'unsolvable'
  /** 达到节点上限，未能判定。**不等于无解** */
  | 'unknown';

export interface SolutionPlacement {
  readonly itemId: string;
  readonly row: number;
  readonly col: number;
  readonly rotation: Rotation;
}

export interface SolveResult {
  readonly outcome: SolveOutcome;
  readonly solution: readonly SolutionPlacement[] | null;
  readonly nodes: number;
}

export interface CountResult {
  /** 完整解的数量。`capped` 为 true 时表示达到上限后停止计数 */
  readonly count: number;
  readonly capped: boolean;
  readonly nodes: number;
}

export interface SolveOptions {
  /** 强制禁止旋转。用于断言「这关必须旋转才可解」 */
  readonly allowRotation?: boolean;
  readonly maxNodes?: number;
}

export interface CountOptions extends SolveOptions {
  /** 计数上限。达到即停止并把 `capped` 置 true，避免把 6 位数解数的关卡算到天荒地老 */
  readonly solutionCap?: number;
}

// ───────────────────────────── 预处理 ─────────────────────────────

interface ItemPlan {
  readonly itemId: string;
  readonly area: number;
  /** 每个候选落位：占用 mask（bigint）+ 锚点 + 朝向 */
  readonly options: ReadonlyArray<{ mask: bigint; row: number; col: number; rotation: Rotation }>;
}

interface Prepared {
  readonly rows: number;
  readonly cols: number;
  readonly usable: bigint;
  /** 可用格总数（不含障碍），等于 usable 的 popcount */
  readonly usableCount: number;
  readonly plans: readonly ItemPlan[];
  readonly totalArea: number;
}

function prepare(level: LevelSpec, allowRotation: boolean): Prepared {
  const { rows, cols, blockedCells } = level.board;

  let blockedMask = 0n;
  for (const [r, c] of blockedCells) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) blockedMask |= 1n << BigInt(r * cols + c);
  }
  const fullMask = (1n << BigInt(rows * cols)) - 1n;
  const usable = fullMask & ~blockedMask;

  const plans: ItemPlan[] = level.items.map((item) => {
    const options: Array<{ mask: bigint; row: number; col: number; rotation: Rotation }> = [];
    for (const variant of rotationVariants(item.cells, item.rotatable && allowRotation)) {
      let maxR = 0;
      let maxC = 0;
      for (const [r, c] of variant.cells) {
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      const h = maxR + 1;
      const w = maxC + 1;
      for (let row = 0; row + h <= rows; row++) {
        for (let col = 0; col + w <= cols; col++) {
          let mask = 0n;
          let ok = true;
          for (const [dr, dc] of variant.cells) {
            const bit = 1n << BigInt((row + dr) * cols + (col + dc));
            if ((blockedMask & bit) !== 0n) {
              ok = false;
              break;
            }
            mask |= bit;
          }
          if (ok) options.push({ mask, row, col, rotation: variant.rotation });
        }
      }
    }
    return { itemId: item.id, area: item.cells.length, options };
  });

  return {
    rows,
    cols,
    usable,
    usableCount: rows * cols - blockedCells.length,
    plans,
    totalArea: plans.reduce((s, p) => s + p.area, 0),
  };
}

/** 面积剪枝的加强版：存在比所有剩余物品都小的连通空洞 → 一定装不下（TDD 9.1 第 4 条） */
function hasHopelessHole(p: Prepared, occ: bigint, minRemainingArea: number): boolean {
  if (!ENABLE_HOLE_PRUNE) return false;
  const free = p.usable & ~occ;
  let remaining = free;
  while (remaining !== 0n) {
    // 找到任意一个空闲位作为种子
    let seed = -1;
    for (let i = 0; i < p.rows * p.cols; i++) {
      if ((remaining & (1n << BigInt(i))) !== 0n) {
        seed = i;
        break;
      }
    }
    if (seed < 0) break;
    // BFS 展开连通块
    let region = 1n << BigInt(seed);
    const queue = [seed];
    let size = 0;
    while (queue.length > 0) {
      const idx = queue.pop()!;
      size++;
      const r = Math.floor(idx / p.cols);
      const c = idx % p.cols;
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= p.rows || nc < 0 || nc >= p.cols) continue;
        const nbit = 1n << BigInt(nr * p.cols + nc);
        if ((free & nbit) !== 0n && (region & nbit) === 0n) {
          region |= nbit;
          queue.push(nr * p.cols + nc);
        }
      }
    }
    if (size < minRemainingArea) return true;
    remaining &= ~region;
  }
  return false;
}

// ───────────────────────────── 搜索 ─────────────────────────────

interface SearchContext {
  nodes: number;
  readonly maxNodes: number;
}

/**
 * 回溯搜索。`onSolution` 返回 `true` 表示「够了，停止」。
 *
 * 采用 MRV（最小剩余值）：每步优先处理**当前合法落位最少**的物品。
 * 这比「固定顺序」快一个量级，也比「大件优先」稳——
 * 大件优先在多数关卡上快，但在满填充关卡上会退化。
 */
function search(
  p: Prepared,
  ctx: SearchContext,
  remaining: readonly ItemPlan[],
  remainingArea: number,
  occupiedCount: number,
  occ: bigint,
  current: SolutionPlacement[],
  onSolution: () => boolean,
): boolean {
  if (remaining.length === 0) return onSolution();
  // 面积剪枝：剩余物品总面积 > 剩余空格 → 这条分支必死
  if (remainingArea > p.usableCount - occupiedCount) return false;
  // 节点上限：提前收敛。返回 true 只是"停止搜索"，外层靠 nodes 数值判定 unknown
  if (ctx.nodes > ctx.maxNodes) return true;
  if (hasHopelessHole(p, occ, Math.min(...remaining.map((r) => r.area)))) return false;

  // MRV：挑合法落位最少的物品
  let bestPlan: ItemPlan | null = null;
  let bestOptions: Array<{ mask: bigint; row: number; col: number; rotation: Rotation }> = [];
  for (const plan of remaining) {
    const feasible = plan.options.filter((o) => (o.mask & occ) === 0n);
    if (feasible.length === 0) return false; // 这件塞不进去 → 这条分支死
    if (bestPlan === null || feasible.length < bestOptions.length) {
      bestPlan = plan;
      bestOptions = feasible;
    }
  }
  if (bestPlan === null) return false;

  const rest = remaining.filter((plan) => plan !== bestPlan);
  for (const option of bestOptions) {
    ctx.nodes++;
    current.push({
      itemId: bestPlan.itemId,
      row: option.row,
      col: option.col,
      rotation: option.rotation,
    });
    const stop = search(
      p,
      ctx,
      rest,
      remainingArea - bestPlan.area,
      occupiedCount + bestPlan.area,
      occ | option.mask,
      current,
      onSolution,
    );
    if (stop) return true;
    current.pop();
  }
  return false;
}

// ───────────────────────────── 对外 API ─────────────────────────────

/** 判定可解性并给出**一组**解。`outcome === 'solved'` 时 `solution` 非 null */
export function solve(level: LevelSpec, options: SolveOptions = {}): SolveResult {
  const allowRotation = options.allowRotation ?? true;
  const maxNodes = options.maxNodes ?? SOLVER_MAX_NODES;
  const p = prepare(level, allowRotation);
  const ctx: SearchContext = { nodes: 0, maxNodes };
  const solution: SolutionPlacement[] = [];

  // 只要第一个解：`solve` 的职责是"判定可解 + 给一个可用解"
  search(p, ctx, p.plans, p.totalArea, 0, 0n, solution, () => true);

  if (solution.length === p.plans.length) {
    return { outcome: 'solved', solution: solution.slice(), nodes: ctx.nodes };
  }
  if (ctx.nodes > maxNodes) {
    return { outcome: 'unknown', solution: null, nodes: ctx.nodes };
  }
  return { outcome: 'unsolvable', solution: null, nodes: ctx.nodes };
}

/**
 * 统计**完整解的总数**（TDD 0.1 的难度代理指标之一：解越少越难）。
 *
 * 这是完全确定性的指标——没有随机数，没有种子，同一个关卡跑一万次结果一样。
 * 所以它比蒙特卡洛更适合用来给关卡排序。
 */
export function countSolutions(level: LevelSpec, options: CountOptions = {}): CountResult {
  const allowRotation = options.allowRotation ?? true;
  const maxNodes = options.maxNodes ?? SOLVER_MAX_NODES;
  const cap = options.solutionCap ?? Number.MAX_SAFE_INTEGER;
  const p = prepare(level, allowRotation);
  const ctx: SearchContext = { nodes: 0, maxNodes };

  let count = 0;
  let capped = false;
  search(p, ctx, p.plans, p.totalArea, 0, 0n, [], () => {
    count++;
    if (count >= cap) {
      capped = true;
      return true;
    }
    return false;
  });
  if (ctx.nodes > maxNodes) capped = true;
  return { count, capped, nodes: ctx.nodes };
}

/**
 * 断言「这关必须旋转才可解」。
 *
 * 用来守住 L03 的教学目标：如果哪天有人改数据把「不旋转也能过」改出来了，
 * 这个断言会在构建期直接报错，而不是等到试玩时才发现旋转教学丢了。
 */
export function requiresRotation(level: LevelSpec): boolean {
  const withRotation = solve(level, { allowRotation: true });
  if (withRotation.outcome !== 'solved') return false; // 有旋转都无解 → 谈不上"必须旋转"
  const withoutRotation = solve(level, { allowRotation: false });
  return withoutRotation.outcome === 'unsolvable';
}

// ───────────────────────── 校验标准解 ─────────────────────────

export interface SolutionValidation {
  readonly valid: boolean;
  readonly problems: readonly string[];
}

/**
 * 独立校验一份**给定的**标准解（来自 GDD JSON 的 `solution` 字段）。
 *
 * 注意这与 `solve()` 是两条独立路径：`solve()` 自己找解，
 * 本函数检查「人类写的解」是否合法。两条路径都通过，才说明数据可信。
 */
export function validateSolution(
  level: LevelSpec,
  solution: readonly SolutionPlacement[],
): SolutionValidation {
  const problems: string[] = [];
  const { rows, cols } = level.board;
  const blocked = new Set(level.board.blockedCells.map(([r, c]) => `${r},${c}`));
  const occupied = new Set<string>();
  const seen = new Set<string>();
  const itemById = new Map(level.items.map((it) => [it.id, it]));

  for (const place of solution) {
    const item = itemById.get(place.itemId);
    if (!item) {
      problems.push(`解中包含未知物品 ${place.itemId}`);
      continue;
    }
    if (seen.has(place.itemId)) {
      problems.push(`物品 ${place.itemId} 在解中出现多次`);
      continue;
    }
    seen.add(place.itemId);

    if (place.rotation !== 0 && !item.rotatable) {
      problems.push(`物品 ${place.itemId} 不可旋转，但解指定了 rotation=${place.rotation}`);
      continue;
    }
    const shape = rotationVariants(item.cells, true).find((v) => v.rotation === place.rotation);
    if (!shape) {
      problems.push(`物品 ${place.itemId} 不存在 rotation=${place.rotation} 的朝向`);
      continue;
    }
    for (const [dr, dc] of shape.cells) {
      const r = place.row + dr;
      const c = place.col + dc;
      const key = `${r},${c}`;
      if (r < 0 || r >= rows || c < 0 || c >= cols) {
        problems.push(`物品 ${place.itemId} 越界于 (${r},${c})`);
        continue;
      }
      if (blocked.has(key)) {
        problems.push(`物品 ${place.itemId} 压在障碍格 (${r},${c})`);
        continue;
      }
      if (occupied.has(key)) {
        problems.push(`物品 ${place.itemId} 与他物重叠于 (${r},${c})`);
        continue;
      }
      occupied.add(key);
    }
  }

  const missing = level.items.filter((it) => !seen.has(it.id)).map((it) => it.id);
  if (missing.length > 0) problems.push(`解未覆盖全部物品，缺少：${missing.join(', ')}`);

  return { valid: problems.length === 0, problems };
}
