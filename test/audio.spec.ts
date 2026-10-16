/**
 * 音效规格表单测（M2-9 / UI Spec 8「动画与音效」/ PRD F14）。
 *
 * `core/audio/sfx.ts` 是**纯数据**（零 cc / 零 DOM），所以规格的合理域可以在此
 * 直接断言——真发声在 `view/AudioAdapter.ts`（WebAudio，无头环境难验声音本身，
 * 其调用链由无头预览的 Console 日志取证）。
 *
 * 重点：
 * 1. 清单 = UI Spec 8 点名的四种（选中 / 合法放置 / 非法放置 / 成功扣锁），
 *    数量落在计划表允许的 4～6；
 * 2. 每个 key 都有规格、脉冲非空、总时长由脉冲推导；
 * 3. 占位音效的「性格」约束：全是短音效（≤500ms）、频率在人声/提示音区间、
 *    增益不超 1（适配器再乘 SFX_MASTER_GAIN，双保险防爆音）；
 * 4. 「非法放置柔和」不许用方波类谐波丰富的波形——刺耳违反 UI Spec 原文。
 */

import { describe, expect, it } from 'vitest';

import { SFX_KEYS, sfxSpecOf } from '../assets/core/audio/sfx';
import { SFX_MASTER_GAIN } from '../assets/core/config';
import type { SfxKey, SfxPulse } from '../assets/core/model/types';

/** UI Spec 8 原文四种（顺序即文档顺序） */
const SPEC_KEYS: readonly SfxKey[] = ['select', 'place-ok', 'place-fail', 'success'];
/** 计划表允许的占位音效数量区间 */
const PLAN_MIN = 4;
const PLAN_MAX = 6;
/** 「短音效」硬顶（TDD 11.2：4～6 个短音效，总预算 < 200KB） */
const MAX_DURATION_MS = 500;
const MIN_FREQ = 80;
const MAX_FREQ = 4000;

describe('SFX_KEYS：清单与 UI Spec 8 对齐', () => {
  it('恰为规格点名的四种', () => {
    expect(Array.from(SFX_KEYS)).toEqual(Array.from(SPEC_KEYS));
  });

  it('数量落在计划表的 4～6 区间', () => {
    expect(SFX_KEYS.length).toBeGreaterThanOrEqual(PLAN_MIN);
    expect(SFX_KEYS.length).toBeLessThanOrEqual(PLAN_MAX);
  });
});

describe('sfxSpecOf：每个 key 都有可合成规格', () => {
  it('pulses 非空（没有空规格的音效）', () => {
    for (const key of SFX_KEYS) {
      expect(sfxSpecOf(key).pulses.length).toBeGreaterThan(0);
    }
  });

  it('总时长由脉冲推导（delay + duration 的最大值）', () => {
    for (const key of SFX_KEYS) {
      const spec = sfxSpecOf(key);
      const derived = spec.pulses.reduce((m, p) => Math.max(m, p.delayMs + p.durationMs), 0);
      expect(spec.durationMs).toBe(derived);
      expect(spec.durationMs).toBeGreaterThan(0);
    }
  });

  it('全是短音效（≤ 500ms），不拖操作节奏', () => {
    for (const key of SFX_KEYS) {
      expect(sfxSpecOf(key).durationMs).toBeLessThanOrEqual(MAX_DURATION_MS);
    }
  });

  it('选中是「轻点」：最短的一档（≤ 150ms）', () => {
    expect(sfxSpecOf('select').durationMs).toBeLessThanOrEqual(150);
  });
});

describe('脉冲参数合理域', () => {
  const allPulses: readonly SfxPulse[] = SFX_KEYS.flatMap((k) => Array.from(sfxSpecOf(k).pulses));

  it('每个脉冲的时长 / 频率 / 增益都在可合成区间', () => {
    for (const p of allPulses) {
      expect(p.durationMs).toBeGreaterThan(0);
      expect(p.delayMs).toBeGreaterThanOrEqual(0);
      expect(p.freqFrom).toBeGreaterThanOrEqual(MIN_FREQ);
      expect(p.freqTo).toBeGreaterThanOrEqual(MIN_FREQ);
      expect(p.freqFrom).toBeLessThanOrEqual(MAX_FREQ);
      expect(p.freqTo).toBeLessThanOrEqual(MAX_FREQ);
      expect(p.gain).toBeGreaterThan(0);
      expect(p.gain).toBeLessThanOrEqual(1);
    }
  });

  it('波形只用振荡器原生四种', () => {
    for (const p of allPulses) {
      expect(['sine', 'square', 'sawtooth', 'triangle']).toContain(p.waveform);
    }
  });

  it('非法放置「柔和」：禁用谐波丰富的 sawtooth', () => {
    for (const p of sfxSpecOf('place-fail').pulses) {
      expect(p.waveform).not.toBe('sawtooth');
    }
  });

  it('总音量有主增益兜底（单脉冲 gain × SFX_MASTER_GAIN ≤ 1，不爆音）', () => {
    expect(SFX_MASTER_GAIN).toBeGreaterThan(0);
    expect(SFX_MASTER_GAIN).toBeLessThanOrEqual(1);
    for (const p of allPulses) {
      expect(p.gain * SFX_MASTER_GAIN).toBeLessThanOrEqual(1);
    }
  });
});

describe('成功扣锁声的构成', () => {
  it('多脉冲叠成（扣锁 click + 上行小钟），且钟在 click 之后', () => {
    const spec = sfxSpecOf('success');
    expect(spec.pulses.length).toBeGreaterThanOrEqual(2);
    const [first, second] = spec.pulses;
    expect(second.delayMs).toBeGreaterThan(first.delayMs);
    // 上行：钟的结束频率高于起始（「亮起来」的听感）
    expect(second.freqTo).toBeGreaterThan(second.freqFrom);
  });
});
