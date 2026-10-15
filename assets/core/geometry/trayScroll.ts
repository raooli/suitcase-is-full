/**
 * 托盘**横向滚动**的布局算术（实施计划 M2-11，UI Spec 5.2「物品数量多时横向滚动」）。
 *
 * ## 为什么提成纯函数
 *
 * 与 `lift.ts` / `thumbnail.ts` / `drag.ts` 同一个理由：这是"看起来对、数值错一点"
 * 的典型来源，而视图层没有单测兜着。滚动偏移夹取错（没夹住上限）会让托盘被拖出一
 * 条永远回不来的空白；可见性判错（用包含而不是相交）会让槽位在边缘凭空闪现/消失。
 * 提成纯函数后，"放得下时不可滚 / 滚到底恰好露出最后一件 / 边缘槽位部分可见"都变成
 * 可断言的常量（`test/trayScroll.spec.ts`）。
 *
 * ## 坐标系
 *
 * 全部工作在设计单位的**一维 x** 上（托盘是横带，只有水平滚动）：
 * - 窗口宽 `windowWidth` = 可见区（= `TrayView` 节点尺寸 = 内容宽 342）；
 * - 内容坐标：第 `index` 个槽位中心 = `traySlotCenterX(...)`，左对齐逐个排开；
 * - `offset` = 内容被向左平移的量，`content.x = -offset`；`offset ∈ [0, maxScroll]`；
 * - `offset = 0` 时第一件在窗口最左，`offset = maxScroll` 时最后一件恰好整块落入窗口右侧。
 *
 * 这与格算术无关（不碰 cellPx、不碰棋盘格），是纯像素布局，故可入 core。
 */

/**
 * 全部槽位排成一行占的**内容总宽**（含间距）。
 * `count ≤ 0` 返回 0（除零/负宽保护）。
 */
export function trayContentWidth(count: number, slotSize: number, gap: number): number {
  if (count <= 0) return 0;
  return count * slotSize + (count - 1) * gap;
}

/**
 * 可滚动的**最大偏移** = 内容总宽 − 可见窗口宽。
 * 内容放得下（总宽 ≤ 窗口）时为 0 —— 这正是 L1–L6「不可滚」的判据。
 */
export function trayMaxScroll(contentWidth: number, windowWidth: number): number {
  return Math.max(0, contentWidth - windowWidth);
}

/** 把偏移夹进 `[0, maxScroll]`。越界值（含 NaN 之外的任何数）都被夹回合法区间 */
export function trayClampScroll(offset: number, contentWidth: number, windowWidth: number): number {
  return Math.min(Math.max(offset, 0), trayMaxScroll(contentWidth, windowWidth));
}

/**
 * 第 `index` 个槽位中心在**内容坐标系**里的 x（左对齐逐个排开）。
 * 与 `TrayView.slotCenterX` 同口径，抽到 core 便于单测"排布不变量"（首件贴左沿、
 * 间距恒定、不越出窗口右沿除非溢出）。
 */
export function traySlotCenterX(index: number, slotSize: number, gap: number, windowWidth: number): number {
  return -windowWidth / 2 + slotSize / 2 + index * (slotSize + gap);
}

/**
 * 平移 `offset` 后，该槽位是否与可见窗口 `[-windowWidth/2, +windowWidth/2]` **相交**。
 *
 * 相交即可见（含部分露出）：部分露出的槽位仍可交互（手指点得到就能抓起），
 * 滚到底才整块移出窗口。用相交而非包含，是为了让槽位在边缘平滑滑出，
 * 而不是"整块在场/整块不在"地闪现。
 */
export function traySlotInWindow(centerX: number, slotSize: number, offset: number, windowWidth: number): boolean {
  const x = centerX - offset;
  const half = windowWidth / 2;
  return x + slotSize / 2 >= -half && x - slotSize / 2 <= half;
}
