/**
 * 占位色块的取色与**明度阶梯**（TDD 17.5 + UI Spec 4 节 Design Tokens）。
 *
 * 为什么单独成文件而不是塞进 view：
 * 1. 色板既要给 view 用，也要给单测用——TDD 17.6 的 A-02「任意两件相邻物品明度差
 *    ≥ 1 个阶梯」只能靠**算亮度**验收，靠看截图判不了，所以它必须是纯函数；
 * 2. 纯函数、零 `cc` 依赖，才能待在 `core/`（R-A1）——这是本项目最值钱的工程属性。
 *
 * 只做两件事：**轮换色相**（保证顺序相邻的两件不同色）+ **按占格数分档**
 * （保证大件更沉、小件更亮）。色号本身不动——那是已确认的设计令牌。
 */

import { UI_PALETTE, UI_TONE_FACTOR } from './config';

/** 明度档位。`light` 亮 / `mid` 中 / `deep` 深 */
export type ToneLevel = 'light' | 'mid' | 'deep';

/** 三基色轮换顺序（UI Spec L3 物品浅：mint → blue → rose） */
const TONE_BASE: readonly string[] = [
  UI_PALETTE.surfaceMint,
  UI_PALETTE.surfaceBlue,
  UI_PALETTE.surfaceRose,
];

/** 分档阈值：≤2 格亮、3 格中、≥4 格深（实施计划 M1.B） */
export const TONE_MID_CELLS = 3;
export const TONE_DEEP_CELLS = 4;

/**
 * 占格数 → 明度档。
 *
 * 为什么按格数分而不是按 trayOrder 分：占格数是**物品固有属性**，
 * 不随关卡顺序变，玩家扫一眼就能建立"大件偏深"的稳定预期。
 */
export function toneLevelFor(cellCount: number): ToneLevel {
  if (cellCount <= TONE_MID_CELLS - 1) return 'light';
  if (cellCount <= TONE_DEEP_CELLS - 1) return 'mid';
  return 'deep';
}

export function toneFactorFor(level: ToneLevel): number {
  return UI_TONE_FACTOR[level];
}

/**
 * 基色索引：按 `trayOrder`（1-based）轮换。
 * 托盘与棋盘上的顺序都来自 trayOrder，所以它能保证**顺序相邻的两件不同色相**。
 */
export function toneBaseIndexFor(trayOrder: number): number {
  const index = (trayOrder - 1) % TONE_BASE.length;
  return index < 0 ? index + TONE_BASE.length : index;
}

export function toneBaseHex(trayOrder: number): string {
  return TONE_BASE[toneBaseIndexFor(trayOrder)];
}

/** 一件物品的占位填充色 = 基色（按 trayOrder 轮换）× 明度档（按占格数） */
export function itemFillHex(trayOrder: number, cellCount: number): string {
  return shadeHex(toneBaseHex(trayOrder), toneFactorFor(toneLevelFor(cellCount)));
}

// ───────────────────────── 颜色工具（纯函数） ─────────────────────────

/** `#RRGGBB` → `[r, g, b]`（0..255）。只支持 6 位，色板里的色值都是这个格式 */
export function rgbOf(hex: string): readonly [number, number, number] {
  const text = hex.trim().replace(/^#/, '');
  if (text.length !== 6) return [0, 0, 0];
  const value = Number.parseInt(text, 16);
  if (Number.isNaN(value)) return [0, 0, 0];
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function toHex(r: number, g: number, b: number): string {
  const part = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/**
 * RGB 等比缩放——**压明度、保色相**（不做 HSL 变换，浅色区间两者差别极小）。
 * 只用于占位色块：真图有自己的色，不需要这层。
 */
export function shadeHex(hex: string, factor: number): string {
  const [r, g, b] = rgbOf(hex);
  return toHex(r * factor, g * factor, b * factor);
}

/** sRGB 通道线性化（WCAG 2.1 定义） */
function linearChannel(value255: number): number {
  const s = value255 / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** 相对亮度（WCAG 2.1）：0 = 纯黑，1 = 纯白。明度阶梯的验收口径 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/** 对比度（WCAG 2.1）。UI Spec 4 节要求承载信息的文字在 `bg` 上 ≥ 4.5:1 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
