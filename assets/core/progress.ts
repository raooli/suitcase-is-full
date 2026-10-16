/**
 * 关卡进度模型（M2-7：首页选关 + 解锁；与 M2-8 存档强耦合）。
 *
 * 全部为**纯函数 + 不可变数据**：输入 `SaveDataV1` 返回新的 `SaveDataV1`，
 * 不就地修改。这样存档读写的容错（脏数据回退默认值）也能复用 `coerceProgress`，
 * 且逻辑可单测、与平台无关（core 不认识 `cc` / `localStorage`）。
 *
 * 解锁规则（PRD F01 / UI Spec 5.4）：
 * - 第 1 关永远解锁（首次进入第 1 关）；
 * - 通关第 N 关 → 解锁第 N+1 关（封顶到第 `maxLevelId` 关，最后一关通关不再解锁新关）；
 * - 「当前可玩」= `maxUnlockedLevelId`（继续游戏入口进的就是它）。
 */

import type { SaveDataV1 } from './model/types';

/** 新存档默认值：`maxUnlockedLevelId = 1`（首关即解锁）、无通关记录、无已学引导、未静音。 */
export function defaultProgress(now: number): SaveDataV1 {
  return {
    schemaVersion: 1,
    maxUnlockedLevelId: 1,
    clearedLevelIds: [],
    learnedLevelIds: [],
    muted: false,
    updatedAt: now,
  };
}

/**
 * 把"关卡号数组"规整成合法的升序去重数组（M2-7 通关集合 / M2-8 已学引导集合共用）。
 *
 * 过滤非正整数（0 / 负数 / 小数 / 非数字），去重，升序排序。非法输入（非数组）
 * 一律回退空数组——`coerceProgress` 与 `setLearnedLevels` 都靠它兜底脏数据。
 */
function cleanLevelIds(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr.filter(
        (x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 1,
      ),
    ),
  ).sort((a, b) => a - b);
}

/**
 * 把任意（可能损坏的）值规整成合法的 `SaveDataV1`。
 *
 * 用途：存档读入时的容错——`localStorage` 里可能是旧版本、被篡改、或单纯 JSON
 * 损坏。任何字段不合法都回退到 `defaultProgress`，**绝不抛错**（架构文档 §5：
 * 数据层降级而非崩溃）。
 */
export function coerceProgress(value: unknown, now: number): SaveDataV1 {
  if (typeof value !== 'object' || value === null) return defaultProgress(now);
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) return defaultProgress(now);

  const maxUnlockedLevelId =
    typeof v.maxUnlockedLevelId === 'number' &&
    Number.isInteger(v.maxUnlockedLevelId) &&
    v.maxUnlockedLevelId >= 1
      ? v.maxUnlockedLevelId
      : 1;

  const clearedLevelIds = cleanLevelIds(v.clearedLevelIds);
  const learnedLevelIds = cleanLevelIds(v.learnedLevelIds);
  const muted = typeof v.muted === 'boolean' ? v.muted : false;

  return {
    schemaVersion: 1,
    maxUnlockedLevelId,
    clearedLevelIds,
    learnedLevelIds,
    muted,
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : now,
  };
}

/** 某关是否已被通关 */
export function isCleared(p: SaveDataV1, levelId: number): boolean {
  return p.clearedLevelIds.includes(levelId);
}

/**
 * 某关是否已解锁（可进入）。
 *
 * 第 1 关永远解锁；解锁上限 = `maxUnlockedLevelId`（通关 N 解锁 N+1 累积而来）。
 * 只判下界，上界由调用方（`continueLevelId` / `markCleared`）负责封顶。
 */
export function isUnlocked(p: SaveDataV1, levelId: number): boolean {
  return Number.isInteger(levelId) && levelId >= 1 && levelId <= p.maxUnlockedLevelId;
}

/**
 * 标记某关通关，返回**新**进度（不可变）。
 *
 * - 写入 `clearedLevelIds`（去重，排序）；
 * - 解锁下一关：`maxUnlockedLevelId = max(原值, levelId+1)`，并封顶到 `maxLevelId`
 *   （最后一关通关后不再解锁不存在的关）。
 */
export function markCleared(p: SaveDataV1, levelId: number, maxLevelId: number, now: number): SaveDataV1 {
  const base = Array.from(p.clearedLevelIds);
  if (!base.includes(levelId)) {
    base.push(levelId);
    base.sort((a, b) => a - b);
  }
  const cap = Math.max(maxLevelId, 1);
  const maxUnlockedLevelId = Math.min(Math.max(p.maxUnlockedLevelId, levelId + 1), cap);
  return {
    ...p,
    maxUnlockedLevelId,
    clearedLevelIds: base,
    updatedAt: now,
  };
}

/**
 * 「继续游戏」要进的关卡 = 当前最高已解锁关，封顶到 `maxLevelId`。
 *
 * 首次（默认进度）→ 第 1 关；通关到第 N 关后 → 第 N+1 关（未通关前仍可重玩前面的关）。
 */
export function continueLevelId(p: SaveDataV1, maxLevelId: number): number {
  const cap = Math.max(maxLevelId, 1);
  return Math.min(Math.max(p.maxUnlockedLevelId, 1), cap);
}

/**
 * 记录已学会首次引导的关卡（M2-8：与进度同命名空间持久化）。
 *
 * 返回**新**进度（不可变），`learnedLevelIds` 经 `cleanLevelIds` 去重 + 排序、
 * 过滤非正整数。调用方（`GameController`）传入 `guideMemory.learnedLevels()` 即可，
 * 写入与读入（存档 → `restore`）共用同一数组语义，杜绝两份真相互相漂移。
 */
export function setLearnedLevels(
  p: SaveDataV1,
  levels: readonly number[],
  now: number,
): SaveDataV1 {
  return {
    ...p,
    learnedLevelIds: cleanLevelIds(levels),
    updatedAt: now,
  };
}

/**
 * 设置静音开关（M2-9：PRD F14「可静音」/ AC18「关闭音效后重新启动保持」）。
 *
 * 返回**新**进度（不可变）。`muted` 与通关/解锁/已学引导同存于
 * `suitcase.progress.v1`，写方照例先 `loadProgress()` 读改存（M2-8 规则），
 * 只覆盖自己这一个字段。
 */
export function setMuted(p: SaveDataV1, muted: boolean, now: number): SaveDataV1 {
  return {
    ...p,
    muted,
    updatedAt: now,
  };
}
