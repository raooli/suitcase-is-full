/**
 * 缩略图装框：把一件物品的**包围盒像素尺寸**等比放进一个正方形槽位里。
 *
 * 为什么放在 core 而不是留在 `TraySlot`：这是一段**纯算术**，且是"看起来对、
 * 数值错一格"的典型来源。M1-3 的首版就写错了——把"距边距离"当成了子节点坐标，
 * 结果三件物品整体偏出半个槽位（实测偏移 (+38,-38)，横向跑出卡片、纵向垂到卡片下）。
 * 这类错误在视图层没有单测兜着，只能靠截图目测，正是它溜过去的原因。
 * 提成纯函数后，居中与不溢出变成可断言的不变量（`test/thumbnail.spec.ts`）。
 *
 * 坐标口径（**两套锚点混用是这段最容易错的地方**）：
 * - 槽位节点锚点在**中心**（`UITransform` 默认 0.5,0.5）→ 返回值是**以槽位中心为原点**的落点；
 * - 缩略图节点锚点在**左上角**（`ItemView` 固定 0,1）→ 返回的 `x/y` 是"包围盒左上角"的落点，
 *   而 `width/height` 是缩放后的外框尺寸。
 *
 * 只缩不放（`scale ≤ 1`）：1 格物品在托盘里本来就比槽位小，放大会让"1 格"和"3 格"
 * 看起来一样大，玩家就失去了"这件占几格"的预判（UI Spec 5.2 要求展示真实占位轮廓）。
 */

/** 缩略图的落点与缩放。`x/y` 是左上角落点（槽位中心为原点，y 向上为正） */
export interface ThumbnailFit {
  /** 缩放倍率（恒 ≤ 1）。子节点直接 `setScale(scale, scale, 1)` */
  readonly scale: number;
  /** 左上角落点的 x（槽位中心为原点） */
  readonly x: number;
  /** 左上角落点的 y（槽位中心为原点，向上为正） */
  readonly y: number;
  /** 缩放后的外框宽（像素） */
  readonly width: number;
  /** 缩放后的外框高（像素） */
  readonly height: number;
}

/**
 * 等比缩放并居中。
 *
 * @param itemWidth  物品包围盒宽（像素）
 * @param itemHeight 物品包围盒高（像素）
 * @param side       槽位边长（像素）
 * @param padding    槽位内边距（像素，四周各留一份）
 */
export function fitThumbnail(
  itemWidth: number,
  itemHeight: number,
  side: number,
  padding: number,
): ThumbnailFit {
  const width = Math.max(itemWidth, 0);
  const height = Math.max(itemHeight, 0);
  // 可用内框；`Math.max(..., 1)` 兜住 side 比 padding 还小的退化输入（除零）
  const inner = Math.max(side - padding * 2, 1);

  const scale = Math.min(
    inner / Math.max(width, 1),
    inner / Math.max(height, 1),
    1, // 只缩不放
  );

  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  return {
    scale,
    // 水平居中：左上角在 -w/2
    x: -scaledWidth / 2,
    // 垂直居中：锚点在左上角、向下延伸，所以左上角在 +h/2
    y: scaledHeight / 2,
    width: scaledWidth,
    height: scaledHeight,
  };
}
