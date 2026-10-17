/**
 * 真图资源加载（M4-5a：把已交付的 25 张物品图接进游戏）。
 *
 * 与「程序化色块占位」的关系：**有真图用真图，没真图用色块**——
 * `ItemView` 的 Graphics 占位渲染原地保留，本模块只负责把已交付的
 * `sprites/props/<itemType>` spriteFrame 送到 `setSpriteFrame()`。
 * 所以 63 张图不必齐就能接线：每交付一批，对应关卡自动换真图。
 *
 * 三条设计约束（都有实测教训背景）：
 *
 * 1. **模块级缓存 + 在飞去重**：`ItemLayer` / `TrayView` 每次 `refreshAll`
 *    全量重建节点（M1-6「无幽灵」机制），不做缓存的话一次拖拽就是十几次
 *    load。负结果（确认无图）也缓存——否则 L6~L10 每建一个节点就重试一次
 *    不存在的路径。
 * 2. **晚到帧要判节点有效性**：关卡切换会销毁旧节点，而在飞加载的回调可能
 *    随后才到；对已销毁节点设 spriteFrame 会抛。所以本模块把「节点还有没有
 *    效」的判断留给调用方（它才知道节点生命周期）。
 * 3. **缺失不重试**：确认无图即记 `null`，本进程内不再尝试。
 */
import { SpriteFrame, resources } from 'cc';
import { DEBUG } from 'cc/env';

/**
 * props 目录在 resources 包里的相对路径。文件名严格 = itemType（A-04：
 * 一 itemType 一图，四朝向靠 Node.angle 转，不出四张图）。
 */
const PROP_DIR = 'sprites/props';

/** itemType → 帧；`null` = 已确认无图（负结果缓存，防重复尝试） */
const frameCache = new Map<string, SpriteFrame | null>();

/** itemType → 在飞加载的等待者队列。同件多个节点只发一次 load */
const inflight = new Map<string, FrameCallback[]>();

/** 帧就绪回调。可能同步触发（缓存命中）或异步触发（加载完成） */
export type FrameCallback = (frame: SpriteFrame | null) => void;

/**
 * 同步取已缓存的帧（含负结果）。**没发起过加载的件返回 null**——
 * 需要「保证在缓存里」的语义用 `ensureFrame`。
 */
export function cachedFrame(itemType: string): SpriteFrame | null {
  return frameCache.get(itemType) ?? null;
}

/**
 * 确保某件的帧进入缓存（不在则发起加载），就绪时回调。
 *
 * 回调可能**同步**（缓存命中）或**异步**（在飞加载完成）触发；异步路径下
 * 节点可能已被重建销毁，调用方必须先判 `node.isValid` 再贴帧。
 */
export function ensureFrame(itemType: string, cb: FrameCallback): void {
  const cached = frameCache.get(itemType);
  if (cached !== undefined) {
    cb(cached);
    return;
  }
  const waiting = inflight.get(itemType);
  if (waiting !== undefined) {
    waiting.push(cb);
    return;
  }
  inflight.set(itemType, [cb]);
  resources.load(`${PROP_DIR}/${itemType}/spriteFrame`, SpriteFrame, (err, frame) => {
    const got = err ? null : frame;
    frameCache.set(itemType, got);
    const callbacks = inflight.get(itemType) ?? [];
    inflight.delete(itemType);
    if (DEBUG) {
      console.log(
        `[propAssets] ${itemType} → ${got === null ? '无真图，保持占位色块' : '真图已载入'}`,
      );
    }
    for (const fn of callbacks) fn(got);
  });
}

/**
 * 关卡开跑前批量预热。**只发起不等待**——节点由 `refreshAll` 同步创建，
 * 首关第一批节点可能赶上在飞加载（占位→真图一两帧内换）；预热只为
 * 「第二次进关零等待」。
 */
export function preloadFrames(itemTypes: Iterable<string>): void {
  for (const itemType of itemTypes) ensureFrame(itemType, () => {});
}

/** DEBUG 对账用：缓存里已有 / 确认缺失的件数 */
export function cacheStats(): { loaded: number; missing: number } {
  let loaded = 0;
  let missing = 0;
  for (const value of frameCache.values()) {
    if (value === null) missing += 1;
    else loaded += 1;
  }
  return { loaded, missing };
}
