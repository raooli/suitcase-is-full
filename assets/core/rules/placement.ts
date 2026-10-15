/**
 * 放置合法性判定与提交（TDD 6.2 / 6.5，4 节 `rules.placement`）。
 *
 * 全部是纯函数：输入 `(level, state, intent)`，输出判定结果或新 state，
 * 不持有任何状态、不产生副作用。
 */

import { clampAnchor } from '../geometry/coords';
import { bboxOf, rotateBy } from '../geometry/shape';
import type {
  InvalidReason,
  LevelSpec,
  LevelState,
  PlaceCheck,
  PlaceIntent,
  Placement,
  RC,
  Rotation,
} from '../model/types';
import { buildIndex } from './board';

/** `level.items` 里找一件物品；找不到返回 undefined（调用方转成 `unknown-item`） */
export function findItem(level: LevelSpec, itemId: string) {
  return level.items.find((it) => it.id === itemId);
}

/**
 * 棋盘上**这一格是谁的**（M1-4 起拖时的命中查询）。
 *
 * 命中结果给的是物品的**锚点**而不是"被点的那一格"——调用方要的是
 * "从哪件物品的哪个位置抓起来的"，锚点 + 手指格才能算出 `grabOffset`。
 *
 * 占用关系一律走 `buildIndex`（唯一真相），不在这里另写一遍格遍历。
 * 空格 / 障碍格 / 越界都返回 `null`。
 */
export function itemAtCell(
  level: LevelSpec,
  placements: ReadonlyMap<string, Placement>,
  row: number,
  col: number,
): { readonly itemId: string; readonly anchor: RC } | null {
  const owner = buildIndex(level, placements).ownerAt(row, col);
  if (owner < 0) return null;

  const item = level.items[owner];
  if (item === undefined) return null;
  const placement = placements.get(item.id);
  if (placement === undefined) return null;

  return { itemId: item.id, anchor: [placement.row, placement.col] as RC };
}

/**
 * 判断某个落位是否合法。判定顺序固定 **越界 → 障碍 → 重叠**（PRD R-03）。
 *
 * **关键细节——「忽略自身」：** 拖动已放置物品时，它自己的旧占位不能算碰撞。
 * 实现方式是把自身从 `placements` 里临时摘掉再重建索引，
 * 而**不是**在检测里加 `if (owner === selfId)` 特判——后者在
 * 「旋转后形状变了、旧格与新格部分重合」时会算错（TDD 6.2）。
 */
export function canPlace(level: LevelSpec, state: LevelState, intent: PlaceIntent): PlaceCheck {
  const item = findItem(level, intent.itemId);
  if (item === undefined) {
    return { ok: false, reason: 'unknown-item', cells: [] };
  }
  if (intent.rotation !== 0 && !item.rotatable) {
    return { ok: false, reason: 'not-rotatable', cells: [] };
  }

  const cells = rotateBy(item.cells, intent.rotation);

  // 摘掉自己，避免自碰撞
  const others = new Map(state.placements);
  others.delete(intent.itemId);
  const index = buildIndex(level, others);

  const { rows, cols } = level.board;
  for (const [dr, dc] of cells) {
    const r = intent.row + dr;
    const c = intent.col + dc;
    if (r < 0 || r >= rows || c < 0 || c >= cols) {
      return { ok: false, reason: 'out-of-bounds', cells };
    }
    if (index.isBlocked(r, c)) return { ok: false, reason: 'blocked', cells };
    if (!index.isFree(r, c)) return { ok: false, reason: 'overlap', cells };
  }
  return { ok: true };
}

/** 便捷判定：只要布尔值 */
export function isPlacementLegal(level: LevelSpec, state: LevelState, intent: PlaceIntent): boolean {
  return canPlace(level, state, intent).ok;
}

/**
 * 把一件物品的落位写进 state，返回**新对象**。
 *
 * - 物品在托盘中 → 从托盘移除；`trayRotations` 里对应项一并清理（朝向已由 placement 承载）
 * - 物品已在棋盘上 → 视为「移动」，直接覆盖落位
 *
 * 本函数**不**做合法性校验，调用方必须先过 `canPlace`。
 * 理由是「提交」应该是廉价的、无分支的；判定失败的处理属于会话层。
 */
export function applyPlacement(
  level: LevelSpec,
  state: LevelState,
  intent: PlaceIntent,
): LevelState {
  const placements = new Map(state.placements);
  placements.set(intent.itemId, {
    row: intent.row,
    col: intent.col,
    rotation: intent.rotation,
  } satisfies Placement);

  const tray = state.tray.filter((id) => id !== intent.itemId);
  const trayRotations = new Map(state.trayRotations);
  trayRotations.delete(intent.itemId);

  return {
    ...state,
    placements,
    tray,
    trayRotations,
  };
}

/**
 * 把已放置物品取出回托盘（PRD R-06b / GDD 1.2，V1.1 新增规则）。
 *
 * 语义要点：
 * 1. 回到托盘的**原 `trayOrder` 位置**，不是追加到末尾
 * 2. **保留取出时的朝向** —— 写进 `trayRotations`，调用方负责用它渲染
 * 3. 这是一次**成功操作**，由会话层计入撤回栈
 */
export function removeToTray(level: LevelSpec, state: LevelState, itemId: string): LevelState {
  const placement = state.placements.get(itemId);
  if (placement === undefined) return state; // 未放置，无变化（托盘物品拖到棋盘外属此类）

  const placements = new Map(state.placements);
  placements.delete(itemId);

  const trayRotations = new Map(state.trayRotations);
  trayRotations.set(itemId, placement.rotation);

  const tray = state.tray.includes(itemId)
    ? state.tray
    : insertByTrayOrder(level, state.tray, itemId);

  return { ...state, placements, tray, trayRotations };
}

/**
 * `itemId` 插回有序托盘时应处的**下标**（M2-5：取出目标位高亮用）。
 *
 * 从 `insertByTrayOrder` 提取的理由：TrayView 要给「取出落点」画高亮，
 * 需要知道这个下标，但**视图层不许自己重排顺序**（TrayView 纪律①：顺序只认
 * `state.tray`，本组件不再排序——一旦这里也排一次，两份真相就会分叉）。
 * 所以把"该插哪"提成 core 的纯函数，插入与查询共用同一份判据。
 */
export function trayInsertIndex(
  level: LevelSpec,
  tray: readonly string[],
  itemId: string,
): number {
  const orderOf = (id: string) => findItem(level, id)?.trayOrder ?? Number.MAX_SAFE_INTEGER;
  const target = orderOf(itemId);
  let i = 0;
  while (i < tray.length && orderOf(tray[i]) < target) i++;
  return i;
}

/** 按 `trayOrder` 把 id 插回有序托盘数组 */
export function insertByTrayOrder(
  level: LevelSpec,
  tray: readonly string[],
  itemId: string,
): string[] {
  const out = Array.from(tray);
  out.splice(trayInsertIndex(level, tray, itemId), 0, itemId);
  return out;
}

/** 托盘物品的当前朝向（无记录视为 0） */
export function trayRotationOf(state: LevelState, itemId: string): Rotation {
  return state.trayRotations.get(itemId) ?? 0;
}

// ───────────────────────── 原位旋转（TDD 6.5） ─────────────────────────

export interface RotateResult {
  readonly ok: boolean;
  /** 成功时的落位；失败时为 null，调用方必须**保持原状态不变** */
  readonly placement: Placement | null;
  /** 失败原因，用于 Toast 文案与埋点；成功时为 null */
  readonly reason: InvalidReason | 'rotate-blocked' | null;
  /** 命中的策略序号 1..4，便于调参时观察「靠哪条兜底救回来的」 */
  readonly strategy: 1 | 2 | 3 | 4;
}

/**
 * 原位旋转：改变已放置物品的朝向，尽量**保持视觉位置不跳**。
 *
 * 旋转会改变包围盒尺寸（1×3 变 3×1），若锚点固定在左上角，
 * 物品会朝右下「窜出去」。所以按以下优先级依次尝试（TDD 6.5）：
 *
 * 1. 保持**包围盒中心**不变后的位置
 * 2. 原 anchor 保持不变
 * 3. 在 ±`radius` 格邻域内搜索一个合法位置
 * 4. 都不行 → **不提交**，恢复原朝向（任何情况下不得提交非法棋盘状态，G-07/AC08）
 */
export function rotateInPlace(
  level: LevelSpec,
  state: LevelState,
  itemId: string,
  radius = 1,
): RotateResult {
  const item = findItem(level, itemId);
  const current = state.placements.get(itemId);
  if (item === undefined || current === undefined) {
    return { ok: false, placement: null, reason: 'unknown-item', strategy: 4 };
  }
  if (!item.rotatable) {
    return { ok: false, placement: null, reason: 'not-rotatable', strategy: 4 };
  }

  const nextRotation = (((current.rotation + 1) % 4) as Rotation);
  const oldShape = rotateBy(item.cells, current.rotation);
  const newShape = rotateBy(item.cells, nextRotation);
  const oldBox = bboxOf(oldShape);
  const newBox = bboxOf(newShape);

  const isLegal = (row: number, col: number): PlaceCheck =>
    canPlace(level, state, { itemId, row, col, rotation: nextRotation });

  // 策略 1：保持包围盒中心
  const centerRow = current.row + oldBox.height / 2;
  const centerCol = current.col + oldBox.width / 2;
  const [candidateRow, candidateCol] = clampAnchor(
    Math.round(centerRow - newBox.height / 2),
    Math.round(centerCol - newBox.width / 2),
    level.board.rows,
    level.board.cols,
    newBox.height,
    newBox.width,
  );
  if (isLegal(candidateRow, candidateCol).ok) {
    return { ok: true, placement: { row: candidateRow, col: candidateCol, rotation: nextRotation }, reason: null, strategy: 1 };
  }

  // 策略 2：原 anchor 不动
  if (isLegal(current.row, current.col).ok) {
    return { ok: true, placement: { row: current.row, col: current.col, rotation: nextRotation }, reason: null, strategy: 2 };
  }

  // 策略 3：邻域搜索。按「离原 anchor 的切比雪夫距离」由近到远，保证结果稳定可预测
  const offsets: Array<RC> = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dr === 0 && dc === 0) continue;
      offsets.push([dr, dc] as RC);
    }
  }
  offsets.sort((a, b) => Math.max(Math.abs(a[0]), Math.abs(a[1])) - Math.max(Math.abs(b[0]), Math.abs(b[1])));
  for (const [dr, dc] of offsets) {
    const r = current.row + dr;
    const c = current.col + dc;
    if (isLegal(r, c).ok) {
      return { ok: true, placement: { row: r, col: c, rotation: nextRotation }, reason: null, strategy: 3 };
    }
  }

  // 策略 4：放弃。注意此时**不能**返回任何 placement
  return { ok: false, placement: null, reason: 'rotate-blocked', strategy: 4 };
}

// ───────────────────────── 提示（M2-2 / UI Spec 152） ─────────────────────────

/** 一条提示建议：把某件托盘物品放在某处。 */
export interface HintSuggestion {
  readonly itemId: string;
  readonly row: number;
  readonly col: number;
  readonly rotation: Rotation;
  /** 落位后的绝对占用格（已含 anchor 偏移），供棋盘高亮 */
  readonly cells: readonly RC[];
}

/**
 * 给出「下一步该放哪」的提示（UI Spec 152 的免费提示，不伪装成可用空按钮）。
 *
 * 策略：按 `state.tray` 顺序取**第一件**还能放下（存在任一合法落点）的物品，
 * 再按「行主序、左上优先」扫描棋盘第一个合法落位。
 * 不可旋转物品只试 `rotation=0`；可旋转物品试 0/1/2/3，取首个合法。
 *
 * 纯函数、零副作用；棋盘放不下任何托盘物品（含全放完却未通关的死局）返回 `null`。
 * 用「首件 + 首个落位」而非穷举最优，是为了提示稳定、可预测、且 O(格子×朝向) 足够便宜。
 */
export function suggestNextPlacement(level: LevelSpec, state: LevelState): HintSuggestion | null {
  for (const itemId of state.tray) {
    const item = findItem(level, itemId);
    if (item === undefined) continue;

    const rotations: readonly Rotation[] = item.rotatable ? [0, 1, 2, 3] : [0];
    for (const rotation of rotations) {
      const shape = rotateBy(item.cells, rotation);
      const box = bboxOf(shape);
      const maxRow = level.board.rows - box.height;
      const maxCol = level.board.cols - box.width;
      for (let row = 0; row <= maxRow; row++) {
        for (let col = 0; col <= maxCol; col++) {
          if (canPlace(level, state, { itemId, row, col, rotation }).ok) {
            const cells = shape.map(
              ([dr, dc]) => [row + dr, col + dc] as RC,
            );
            return { itemId, row, col, rotation, cells };
          }
        }
      }
    }
  }
  return null;
}
