/**
 * 音效规格表（M2-9 / UI Spec 8「动画与音效」/ PRD F14 / TDD 4 platform.AudioAdapter）。
 *
 * ## 定位
 *
 * 本文件是**纯数据 + 纯函数**（零 `cc`、零 DOM）：只回答「有哪几种音效、每种长什么样」。
 * 真正发声在 `view/AudioAdapter.ts`（WebAudio 合成），本文件因此可被单测直接覆盖
 * （规格表的合理域：时长 / 频率 / 增益），也不随平台（web / 微信）分叉。
 *
 * ## 占位音效（M2-9）→ 真素材（M4-4）
 *
 * 现在没有音频文件，用**振荡器合成**做占位（与「程序化色块占位美术」同思路）。
 * M4-4 真音效进来时，`AudioAdapter` 换成 `AudioSource` 播文件即可，**`SfxKey`
 * 命名空间保持不变**——调用方（`GameController` / `HomeController`）零改动。
 *
 * ## 音效清单（UI Spec 8 原文四种，验收「可静音」）
 *
 * - `select`　 选中轻点声；
 * - `place-ok`　合法放置咔哒声；
 * - `place-fail` 非法放置柔和提示声（不刺耳，PRD 无障碍「避免关键反馈仅靠音效」）；
 * - `success`　 成功扣锁声（两声叠：扣锁 click + 上行小钟）。
 */

import type { SfxKey, SfxPulse, SfxSpec } from '../model/types';

export type { SfxKey, SfxPulse, SfxSpec };

/** 全部音效 key（顺序即文档清单顺序）。计划表允许 4～6 个，MVP 取规格点名的 4 种 */
export const SFX_KEYS: readonly SfxKey[] = ['select', 'place-ok', 'place-fail', 'success'];

/**
 * 由脉冲序列构规格；`durationMs` **推导而非手写**（= 各脉冲 `delay+duration` 的最大值），
 * 免得改某个脉冲的时长后忘了同步总长。
 */
function makeSpec(key: SfxKey, pulses: readonly SfxPulse[]): SfxSpec {
  let durationMs = 0;
  for (const p of pulses) durationMs = Math.max(durationMs, p.delayMs + p.durationMs);
  return { key, pulses, durationMs };
}

const SPECS: Readonly<Record<SfxKey, SfxSpec>> = {
  // 选中：极短上行轻点（正弦不噪，70ms 不碍快速连点）
  select: makeSpec('select', [
    { waveform: 'sine', freqFrom: 660, freqTo: 880, delayMs: 0, durationMs: 70, gain: 0.5 },
  ]),
  // 合法放置：短促下行「咔哒」（方波 + 快衰减，像扣上去的声响）
  'place-ok': makeSpec('place-ok', [
    { waveform: 'square', freqFrom: 520, freqTo: 260, delayMs: 0, durationMs: 110, gain: 0.3 },
  ]),
  // 非法放置：柔和下行提示（三角波无谐波刺感，220ms 慢起慢落）
  'place-fail': makeSpec('place-fail', [
    { waveform: 'triangle', freqFrom: 300, freqTo: 180, delayMs: 0, durationMs: 220, gain: 0.45 },
  ]),
  // 成功扣锁：先一记 click（扣锁），再上行小钟（80ms 后进入，共 ~340ms）
  success: makeSpec('success', [
    { waveform: 'square', freqFrom: 660, freqTo: 330, delayMs: 0, durationMs: 60, gain: 0.28 },
    { waveform: 'triangle', freqFrom: 523, freqTo: 1046, delayMs: 80, durationMs: 260, gain: 0.5 },
  ]),
};

/** 取某音效的合成规格。key 必在 `SFX_KEYS` 内（类型已约束） */
export function sfxSpecOf(key: SfxKey): SfxSpec {
  return SPECS[key];
}
