/**
 * 真图渲染的**旋转偏移代数**（M4-6）。
 *
 * ## 解决什么问题
 *
 * 物品占格是任意多联骨牌（`cells`），可旋转物品旋转后 `ItemLayer`/`TrayView`
 * 按旋转后的包围盒重建节点，而贴图帧永远是 **rotation=0 朝向的画布**。把画布
 * 映射到节点时，内容中心相对画布中心的偏移必须跟着旋转 `turns` 个 90°
 * （顺时针），否则旋转后贴图会偏离中心——叠加「两轴分别除」还会被拉变形
 * （M4-6 修复前的实测：2×4 薄外套旋转后 0.59 vs 2.38 两轴缩放）。
 *
 * ## 坐标系（本模块的口径，别与别处混）
 *
 * **画布坐标：x 向右、y 向下**（与 PNG 像素行序一致）。屏幕顺时针旋转 90°
 * 时，指向右的向量 (1,0) 转到指向下 (0,1)，指向下 (0,1) 转到指向左 (−1,0)：
 *
 *     turns=1: (dx, dy) → (−dy, dx)
 *     turns=2: (dx, dy) → (−dx, −dy)
 *     turns=3: (dx, dy) → ( dy, −dx)
 *
 * 与 `shape.ts` 的 `rotateCW`（`(r,c) → (c,−r)`，格索引右臂→下一行）同向：
 * 格心偏移按本函数旋转后的集合，必须等于 `rotateBy(cells, turns)` 后格心
 * 偏移的集合（`test/artOffset.spec.ts` 对多种异形钉死这个不变量）。
 *
 * 调用方（`ItemView.createArtNode`）拿到旋转后的画布口径偏移后，再按
 * 「父局部 y 向上」取负换算进节点局部坐标。
 */

import type { Rotation } from '../model/types';

/** 画布口径（y 向下）的二维偏移 */
export interface Offset {
  readonly x: number;
  readonly y: number;
}

/**
 * 把画布口径（y 向下）的偏移按屏幕**顺时针**旋转 `turns` × 90°。
 * `turns` 先取模 4（负值按模归一，与 `rotateBy` 一致）。
 *
 * 取负一律写成 `0 - v` 而非 `-v`：后者在 v 为 +0 时产出 **-0**，
 * `toEqual` 区分 ±0（单测钉过），Node/渲染链路虽不敏感，但没必要留雷。
 */
export function rotatedCenterOffset(dx: number, dy: number, turns: Rotation | number): Offset {
  const t = ((turns % 4) + 4) % 4;
  switch (t) {
    case 1:
      return { x: 0 - dy, y: dx };
    case 2:
      return { x: 0 - dx, y: 0 - dy };
    case 3:
      return { x: dy, y: 0 - dx };
    default:
      return { x: dx, y: dy };
  }
}
