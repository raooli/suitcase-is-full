/**
 * 位移抖动的**唯一实现**（M1-8 抽出，供 `PreviewLayer` / `ItemLayer` 共用）。
 *
 * ## 为什么不是各自实现一份
 *
 * 抖动的正确性全在两个容易漏的点上（M1-5 / M1-7 各踩一次）：
 *
 * 1. **停动画必须同时归位**：`Tween.stopAllByTarget` 只停动画、**不动节点**，
 *    节点会留在被打断那一帧的 ±8px 偏移上。PreviewLayer 因此出现过"非法松手后
 *    160ms 内连抓 → 整场 ghost 都偏 8px"。
 * 2. **基准位不能取"当前 position"**：当前可能已被上一次被打断的抖动带偏，
 *    拿它当基准会把偏移**继承**下去、越抖越偏。所以基准位由调用方保存
 *    （节点创建时的位置），本模块只接收、不猜。
 *
 * 复制这两段逻辑到第三个地方是迟早要出事，所以收在这里。
 */

import { Node, Tween, Vec3, tween } from 'cc';

import { UI_SHAKE_DURATION_MS, UI_SHAKE_OFFSET_PX } from '../core';

/** 停掉进行中的抖动，并把节点放回基准位（幂等，可无条件先调） */
export function stopShake(node: Node, base: Vec3): void {
  Tween.stopAllByTarget(node);
  node.setPosition(base.x, base.y, base.z);
}

/**
 * 横向抖一下（右 → 左 → 回中），播完调 `onDone`。
 *
 * 三段时长 1/4 : 1/2 : 1/4，与 UI Spec P-05「回弹」的手感一致——
 * 出去快、回来稳。
 */
export function shakeX(node: Node, base: Vec3, onDone: (() => void) | null = null): void {
  stopShake(node, base);
  const quarter = UI_SHAKE_DURATION_MS / 4000; // ms →「四分之一段」的秒数
  tween(node)
    .to(quarter, { position: new Vec3(base.x + UI_SHAKE_OFFSET_PX, base.y, base.z) })
    .to(quarter * 2, { position: new Vec3(base.x - UI_SHAKE_OFFSET_PX, base.y, base.z) })
    .to(quarter, { position: new Vec3(base.x, base.y, base.z) })
    .call(() => {
      if (onDone !== null) onDone();
    })
    .start();
}
