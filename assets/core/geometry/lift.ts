/**
 * 拖起时的**视觉补偿**（上浮 + 轻微放大 + 阴影偏移）——G1-1「手指不遮挡目标格」。
 *
 * ## 为什么提成纯函数
 *
 * 与 `thumbnail.ts` / `drag.ts` 同一个理由：这是"看起来对、数值错一点"的典型来源，
 * 而视图层没有单测兜着。缩放锚点取错（取到单格中心而不是整体包围盒中心）的症状是
 * **多格物品被拆散**——每格各自放大、格与格之间裂开缝，肉眼要很仔细才看得出。
 * 提成纯函数后，"整体等比缩放、格缝只按比例变化、单纯上浮不改宽度"都变成可断言的
 * 不变量（`test/lift.spec.ts`）。
 *
 * ## 硬约束：只改画法，不改判定
 *
 * 上浮与放大**只能作用在绘制矩形上**。落点判定仍由手指位置经 `snapToGrid` 算出
 * （M1-5 定的三处取整语义原封不动），`preview.anchor` 一个字都不能动。
 * 否则 G1-2「松手落格 = 预览所示格」立刻破功——这也是**不挪节点**的原因：
 * M1-7 实测过，位移 tween 不归位会留下 8px 持久偏移（见 `PreviewLayer.stopShake`）。
 *
 * ## 坐标系
 *
 * 本模块工作在 **board 局部坐标**：y 向上为正（与 `BoardView.gridToLocal` 一致）。
 * 所以"上浮"是 `+liftPx`，"阴影落到右下"是 `(+dx, -dy)`。
 */

/** 一个绘制矩形。`x/y` 是**左下角**（Cocos `Graphics.roundRect` 的口径），y 向上为正 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 二维点 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * 一组矩形的**整体包围盒中心**——等比缩放的锚点。
 *
 * 必须取整体而不是逐格自己的中心：逐格各自缩放会让格缝按倍率被拉开，
 * 一件 3 格物品会散成三块。`liftAndScale` 内部就用它。
 *
 * 空数组返回原点（调用方传入的必然非空，这只是除零保护）。
 */
export function centerOf(rects: readonly Rect[]): Point {
  if (rects.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * 绕**整体包围盒中心**等比缩放，再整体上浮。
 *
 * - `scale`：1 = 不放大。非法值（非有限 / ≤ 0）退化为 1，避免锚点被污染成 NaN；
 * - `liftPx`：向上为正。非法值退化为 0。
 *
 * 不变量（单测钉死）：
 * 1. `scale=1, liftPx=0` → 原样返回；
 * 2. 缩放**不移动**包围盒中心（只改尺寸）；
 * 3. 上浮**只改 y**，宽度/高度/水平位置不变；
 * 4. 格缝按倍率同比例变化——原本不重叠的矩形，缩放后仍不重叠（不会裂开、也不会糊在一起）。
 */
export function liftAndScale(rects: readonly Rect[], scale: number, liftPx: number): Rect[] {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const lift = Number.isFinite(liftPx) ? liftPx : 0;
  const c = centerOf(rects);
  return rects.map((r) => ({
    x: c.x + (r.x - c.x) * s,
    y: c.y + (r.y - c.y) * s + lift,
    w: r.w * s,
    h: r.h * s,
  }));
}

/**
 * 整体平移一组矩形（阴影用）。
 *
 * UI Spec 4.1「左上柔光、右下短而淡的结构阴影」→ 光源在左上，影子落右下，
 * 所以正 `dx` 配**负** `dy`（y 向上为正）。
 */
export function offsetRects(rects: readonly Rect[], dx: number, dy: number): Rect[] {
  const ox = Number.isFinite(dx) ? dx : 0;
  const oy = Number.isFinite(dy) ? dy : 0;
  return rects.map((r) => ({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h }));
}
