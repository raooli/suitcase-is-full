/**
 * 蒙层挖洞（首次引导的「压暗四周、高亮目标」，UI Spec 5.2 / 7 / 实施计划 M2-6）。
 *
 * ## 要解决的问题
 *
 * 引导层要做的是"整屏压暗 + 在目标处留洞"，目标可能有**多个**（第 1 关要同时
 * 高亮托盘里的 `L01_A` 和棋盘上的目标格）。Cocos 的 `Graphics` 没有 even-odd
 * 填充规则，画不出"带洞的路径"，只能把遮罩切成若干实心矩形来画——本文件就是把
 * 「整屏 减 若干矩形洞」算成一组可直接 `fillRect` 的矩形。
 *
 * ## 算法（水平条带切割）
 *
 * 1. 把所有洞按 y 边界（上下沿）把屏幕切成若干**水平条带**；
 * 2. 每条带内，收集"纵向覆盖整条带"的洞，按它们的 x 边界把条带切成若干块；
 * 3. 逐块取中点判断：中点落在某个洞里 → 这块是洞，不画；否则画。
 *
 * 用"取中点判断"而不是"解析地推导剩余区间"，是因为后者在洞重叠 / 洞贴边时会
 * 长出一批边界分支，而前者对任意布局都只有一处判断，正确性靠单测覆盖布局来保证。
 *
 * ## 为什么进 core
 *
 * 与 `trayScroll.ts` / `lift.ts` / `takeout.ts` 同一个理由：这是纯几何算术，
 * 写错的表现是"洞画歪一格、遮罩漏一条缝"，肉眼不易发现而 view 层没有单测。
 * 进 core 后布局变成可断言的矩形表（`test/maskHoles.spec.ts`）。
 *
 * ## 坐标系
 *
 * 设计单位、**左下角 + 宽高**（与 `Graphics.fillRect` 同一口径）：屏幕矩形是
 * `{ x: -width/2, y: -height/2, w: width, h: height }`。本文件与格算术无关
 * （R-A6），入参都已是像素矩形。
 */

/** 设计单位矩形：左下角 `(x,y)` + 宽高 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 浮点容差：去重与"是否覆盖"判定都留一点余量，避免边界划出零宽块 */
const EPS = 1e-6;

/** 屏幕矩形（以中心为原点的设计坐标系 → 左下角口径） */
export function screenRect(width: number, height: number): Rect {
  return { x: -width / 2, y: -height / 2, w: width, h: height };
}

/**
 * 把「整屏遮罩挖掉 `holes`」切成一组可绘制的实心矩形。
 *
 * - 洞会先被夹取到屏幕内；完全在屏幕外或零面积的洞被忽略（不产生额外切分）；
 * - 洞重叠 / 相邻 / 贴边都安全（重叠时中点判定自然让那块不画）；
 * - 无洞时返回**一块整屏矩形**。
 */
export function maskBands(width: number, height: number, holes: readonly Rect[]): Rect[] {
  const screen = screenRect(width, height);
  const clipped: Rect[] = [];
  for (const hole of holes) {
    const c = clipRect(hole, screen);
    if (c !== null && c.w > EPS && c.h > EPS) clipped.push(c);
  }

  const ys = cutPoints(screen.y, screen.y + screen.h, clipped.map((r) => [r.y, r.y + r.h]));
  const bands: Rect[] = [];

  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (y1 - y0 <= EPS) continue;

    // 纵向覆盖整条带的洞（条带本来就是按洞的 y 边界切出来的，所以要么全覆盖、
    // 要么完全不覆盖，不存在"半个洞"）
    const spanning = clipped.filter((r) => r.y <= y0 + EPS && r.y + r.h >= y1 - EPS);
    const xs = cutPoints(screen.x, screen.x + screen.w, spanning.map((r) => [r.x, r.x + r.w]));

    for (let j = 0; j + 1 < xs.length; j++) {
      const x0 = xs[j];
      const x1 = xs[j + 1];
      if (x1 - x0 <= EPS) continue;

      const midX = (x0 + x1) / 2;
      const isHole = spanning.some((r) => midX >= r.x - EPS && midX <= r.x + r.w + EPS);
      if (isHole) continue;

      bands.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }

  return bands;
}

/** 把 `[min,max]` 按给定切点切成升序去重的一组边界值 */
function cutPoints(min: number, max: number, pairs: readonly (readonly [number, number])[]): number[] {
  const points = [min, max];
  for (const [a, b] of pairs) {
    if (a > min + EPS && a < max - EPS) points.push(a);
    if (b > min + EPS && b < max - EPS) points.push(b);
  }
  points.sort((p, q) => p - q);

  // 去重（相邻差 < EPS 视为同一点）
  const out: number[] = [];
  for (const p of points) {
    if (out.length === 0 || p - out[out.length - 1] > EPS) out.push(p);
  }
  return out;
}

/** 矩形求交（不交返回 null） */
function clipRect(rect: Rect, bounds: Rect): Rect | null {
  const x0 = Math.max(rect.x, bounds.x);
  const y0 = Math.max(rect.y, bounds.y);
  const x1 = Math.min(rect.x + rect.w, bounds.x + bounds.w);
  const y1 = Math.min(rect.y + rect.h, bounds.y + bounds.h);
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
