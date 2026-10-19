/**
 * UI 插画 / 装饰图的加载（M4-5b：把 M4-4 交付的 3 张 UI 图接进游戏）。
 *
 * 与 `propAssets.ts` 是同一套范式（模块级缓存 + 在飞去重 + 负结果缓存），
 * 只是目录不同：`sprites/ui/<name>`。三张图：
 *
 * - `home-hero`      首页顶部插画（`HomeController`）
 * - `suitcase-open`  棋盘底板（`BoardView`，格子落在箱体内腔里）
 * - `suitcase-closed` 合盖（`SuitcaseLid`，庆祝序列第二段）
 *
 * 三条约束（同 propAssets 的教训）：
 * 1. 缓存 + 在飞去重：合盖 / 底板 / 首页都会在各自组件的生命周期里反复取帧，
 *    不缓存就是每次重画都重发 load；
 * 2. 负结果缓存：确认缺图记 `null`，本进程内不再重试；
 * 3. 晚到帧判节点有效性：换场景会销毁节点，回调可能随后才到——`applyUiSprite`
 *    统一在这里判 `sprite.isValid`，调用方不用各写一遍。
 */
import { Sprite, SpriteFrame, resources } from 'cc';
import { DEBUG } from 'cc/env';

/** UI 图在 resources 包里的相对目录；文件名严格 = name */
const UI_DIR = 'sprites/ui';

/** name → 帧；`null` = 已确认无图（负结果缓存） */
const frameCache = new Map<string, SpriteFrame | null>();

/** name → 在飞加载的等待者队列。同名多处引用只发一次 load */
const inflight = new Map<string, FrameCallback[]>();

/** 帧就绪回调。可能同步触发（缓存命中）或异步触发（加载完成） */
export type FrameCallback = (frame: SpriteFrame | null) => void;

/** 同步取已缓存的帧（含负结果）。没发起过加载的图返回 null */
export function cachedUiSprite(name: string): SpriteFrame | null {
  return frameCache.get(name) ?? null;
}

/** 确保某图的帧进入缓存（不在则发起加载），就绪时回调 */
export function ensureUiSprite(name: string, cb: FrameCallback): void {
  const cached = frameCache.get(name);
  if (cached !== undefined) {
    cb(cached);
    return;
  }
  const waiting = inflight.get(name);
  if (waiting !== undefined) {
    waiting.push(cb);
    return;
  }
  inflight.set(name, [cb]);
  resources.load(`${UI_DIR}/${name}/spriteFrame`, SpriteFrame, (err, frame) => {
    const got = err ? null : frame;
    frameCache.set(name, got);
    const callbacks = inflight.get(name) ?? [];
    inflight.delete(name);
    if (DEBUG) {
      console.log(`[uiAssets] ${name} → ${got === null ? '无图（保持程序化占位）' : '已载入'}`);
    }
    for (const fn of callbacks) fn(got);
  });
}

/**
 * 把 UI 图贴到 `Sprite` 上。**晚到帧在这里统一判 `sprite.isValid`**——换场景
 * 销毁节点后回调仍可能到达，对已销毁的 Sprite 赋值 spriteFrame 会抛。
 */
export function applyUiSprite(sprite: Sprite, name: string): void {
  ensureUiSprite(name, (frame) => {
    if (!sprite.isValid || frame === null) return;
    sprite.spriteFrame = frame;
  });
}

/** 开跑前批量预热（只发起不等待），供场景 onLoad 用 */
export function preloadUiSprites(names: Iterable<string>): void {
  for (const name of names) ensureUiSprite(name, () => {});
}

/** DEBUG 对账用：缓存里已有 / 确认缺失的图数 */
export function uiCacheStats(): { loaded: number; missing: number } {
  let loaded = 0;
  let missing = 0;
  for (const value of frameCache.values()) {
    if (value === null) missing += 1;
    else loaded += 1;
  }
  return { loaded, missing };
}
