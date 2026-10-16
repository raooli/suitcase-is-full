/**
 * 节点 → 设计坐标矩形（首次引导层的高亮定位用，M2-6）。
 *
 * ## 为什么要有这个工具
 *
 * 引导层要"在某个棋盘格 / 某个托盘槽位 / 某个工具栏按钮周围挖洞高亮"，而这些
 * 东西分属三个不同的节点树（`BoardRoot` / `TrayRoot` / 代码注入的 `ToolbarView`），
 * 各自有局部坐标，且棋盘还带 Fit Width 的适配缩放。
 *
 * 不能靠"手算常量相加"定位（M2-11 的托盘还有 `scrollOffset` 会平移槽位），
 * 也不能假设它们都是 `SafeAreaRoot` 的直接子节点（层级一变就全错）。
 * 统一走引擎的 `convertToWorldSpaceAR` → `convertToNodeSpaceAR` 两点转换：
 * **不依赖层级、自动带上缩放与滚动偏移**。
 *
 * ## 口径
 *
 * 与 `core/geometry/maskHoles.ts` 一致：**左下角 + 宽高**（`Graphics.fillRect`
 * 的口径），坐标相对 `root`（= `SafeAreaRoot`）的设计坐标系（原点画布中心）。
 */

import { Node, UITransform, Vec3 } from 'cc';

/** 设计单位矩形：左下角 `(x,y)` + 宽高 */
export interface DesignRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * 以 `node` 的中心为矩形中心、给定宽高，算出它在 `root` 设计坐标系里的矩形。
 *
 * 宽高按**角点差**算（转两个点而不是"尺寸 × 缩放"），这样即使 `node` 与
 * `root` 的缩放不同（棋盘适配缩放）也对。
 *
 * @returns `null` = 任一侧没有 `UITransform`（不该发生，降级为不高亮）
 */
export function centerRectIn(
  root: Node,
  node: Node,
  width: number,
  height: number,
): DesignRect | null {
  return boxRectIn(root, node, 0, 0, width, height);
}

/**
 * `node` 局部坐标系里的一个包围盒（中心 `(cx,cy)` + 宽高）→ `root` 设计坐标矩形。
 *
 * 棋盘用它把"某一组格"换算出来（格组的中心不是棋盘节点中心，所以不能直接用
 * `centerRectIn`）。
 */
export function boxRectIn(
  root: Node,
  node: Node,
  cx: number,
  cy: number,
  width: number,
  height: number,
): DesignRect | null {
  const leftBottom = toDesignPoint(root, node, new Vec3(cx - width / 2, cy - height / 2, 0));
  const rightTop = toDesignPoint(root, node, new Vec3(cx + width / 2, cy + height / 2, 0));
  if (leftBottom === null || rightTop === null) return null;
  return {
    x: leftBottom.x,
    y: leftBottom.y,
    w: rightTop.x - leftBottom.x,
    h: rightTop.y - leftBottom.y,
  };
}

/** 局部点（`node` 坐标系）→ `root` 设计坐标系 */
export function toDesignPoint(root: Node, node: Node, local: Vec3): Vec3 | null {
  const src = node.getComponent(UITransform);
  const dst = root.getComponent(UITransform);
  if (src === null || dst === null) return null;
  return dst.convertToNodeSpaceAR(src.convertToWorldSpaceAR(local));
}
