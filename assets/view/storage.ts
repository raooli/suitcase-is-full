/**
 * 进度持久化（M2-7 / M2-8：存档读写）。
 *
 * ## 平台 API
 *
 * 用 `cc.sys.localStorage`（Web 端即 `window.localStorage`，Native 端由引擎映射到
 * 对应实现）。**只在 view 层碰存储**——core 的 `progress.ts` 只管纯逻辑，
 * 不认识任何平台 API（执行纪律：逻辑进 core，平台进 view）。
 *
 * ## 容错
 *
 * 读不到 / 损坏 / 旧版本 → 一律回退 `defaultProgress`（架构文档 §5：数据层降级而非
 * 崩溃）；写不进（隐私模式 / 配额满）→ 静默吞掉，游戏内仍可玩，只是不持久化。
 */

import { sys } from 'cc';

import { coerceProgress, defaultProgress } from '../core';
import type { SaveDataV1 } from '../core';

/** 存档键。版本号写进键名，未来换 schema 时旧键自然作废、不会误读。 */
export const PROGRESS_KEY = 'suitcase.progress.v1';

/** 读取进度；任何异常都回退默认值（首启 / 损坏 / 不可用均走这条路径）。 */
export function loadProgress(): SaveDataV1 {
  const now = Date.now();
  try {
    const raw = sys.localStorage.getItem(PROGRESS_KEY);
    if (raw === null || raw === '') return defaultProgress(now);
    return coerceProgress(JSON.parse(raw), now);
  } catch {
    return defaultProgress(now);
  }
}

/** 写入进度；存储不可用时静默降级（游戏仍可玩，只是下次启动进度丢失）。 */
export function saveProgress(p: SaveDataV1): void {
  try {
    sys.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // 隐私模式 / 配额满 / 平台不支持：降级静默，不阻断游戏
  }
}
