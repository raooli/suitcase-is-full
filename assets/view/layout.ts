/**
 * 运行时布局单例（M3-5 短屏适配）。
 *
 * `core/config.ts` 只出**纯函数**（`selectLayoutBand` / `resolveLayout` / `maxBoardOf`），
 * 本文件负责把「真实设备的可见设计高」接进来，并缓存成全局唯一的活动布局，
 * 供 `BoardView` / `TrayView` / `ToolbarView` / `GameController` / `SuitcaseLid` 读取。
 *
 * ## 为什么是单例
 * 横带高度是**全局**布局属性（托盘/工具栏跨关不变），且必须在任何视图 `onLoad`
 * 之前定档——否则短屏下 `TrayView` 等会在 `onLoad` 里读到一个错误的 L0 高度。
 * 因此：① 模块加载即按设备高预选型（L0 兜底）；② `BootController` / `GameController`
 * 的 `onLoad` 早期再用真实最大棋盘重选型（幂等，结果通常一致）。
 *
 * ## 可见设计高怎么来
 * Cocos **Fit Width**：设计宽 390 恒等于屏宽，可见设计高 = `屏高 × 390 / 屏宽`。
 * 长屏（可见高 ≥ 844）封顶 844，多余高度靠信箱黑边吸收，不放大布局；
 * 短屏（< 844）用实际可见高，触发压缩阶梯。
 */

import { screen, view } from 'cc';

import {
  resolveLayout,
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_MAX_BOARD,
  type ResolvedLayout,
} from '../core';

/**
 * 探测可见设计高（设计单位）。取不到设备尺寸时回退设计画布 844（= L0，preview/test 安全）。
 *
 * 优先用 `view.getVisibleSizeInDesignResolution()`——它直接给「可见区域在设计分辨率下的尺寸」，
 * Fit Width 下其 `height` 就是可见设计高（320×568 → ≈692 < 844），无需自己算比例。
 * 个别环境没有该 API 时，退路用画布尺寸比值 `屏高 × 390 / 屏宽`（量纲无关）。
 */
export function detectVisibleDesignHeight(): number {
  try {
    const vis = (view as { getVisibleSizeInDesignResolution?: () => { width: number; height: number } | null }).getVisibleSizeInDesignResolution?.();
    if (vis != null && typeof vis.height === 'number' && vis.height > 0) {
      return vis.height;
    }
  } catch {
    // 忽略：走下面的 screen 退路
  }
  const scr = screen as { width?: number; height?: number; windowSize?: { width: number; height: number } };
  const w = scr?.width ?? scr?.windowSize?.width;
  const h = scr?.height ?? scr?.windowSize?.height;
  if (typeof w === 'number' && typeof h === 'number' && w > 0) {
    return (h * UI_DESIGN_WIDTH) / w;
  }
  return UI_DESIGN_HEIGHT;
}

let active: ResolvedLayout = resolveLayout(UI_DESIGN_HEIGHT, UI_MAX_BOARD);

/**
 * 按设备可见高 + 最大棋盘定型（写进单例）。`maxBoard` 默认 `UI_MAX_BOARD`（6×6），
 * `GameController` 会用 `maxBoardOf(bundleLevels())` 重选型，幂等。
 */
export function initLayout(
  maxBoard: { rows: number; cols: number } = UI_MAX_BOARD,
): ResolvedLayout {
  active = resolveLayout(detectVisibleDesignHeight(), maxBoard);
  return active;
}

/** 读取当前活动布局（未显式 init 时也返回有效的 L0 兜底） */
export function getLayout(): ResolvedLayout {
  return active;
}

/** 仅供单测：清回 L0 默认，避免用例间串档 */
export function resetLayoutForTest(): void {
  active = resolveLayout(UI_DESIGN_HEIGHT, UI_MAX_BOARD);
}

/** 仅供单测 / 调试：直接注入一个布局（绕过设备探测） */
export function setLayoutForTest(layout: ResolvedLayout): void {
  active = layout;
}
