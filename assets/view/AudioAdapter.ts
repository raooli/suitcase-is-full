/**
 * 音效适配器（M2-9 / TDD 4「platform.AudioAdapter：音效播放与静音」/ UI Spec 8 / PRD F14）。
 *
 * ## 定位
 *
 * - **只管发声与静音闸**，不认识玩法：调用方给一个 `SfxKey`，本类按 core
 *   `audio/sfx.ts` 的规格表合成（占位期无音频文件，见该文件头）。
 * - **不读存档**：静音态由调用方从存档灌入（`setMuted(loadProgress().muted)`），
 *   存取只经 `view/storage.ts` 一个口（M2-7 起的分层不变）。
 * - **模块级单例 `audio`**：Home / Game 两个场景共用同一个 `AudioContext`
 *   （浏览器对并发 AudioContext 数量有限制，且换场景不该断声）。
 *
 * ## 浏览器自动播放策略（TDD 11.3「首次播放必须由用户手势触发」）
 *
 * `AudioContext` 可能在 `suspended` 态建成。本类的策略：**懒创建**（第一次
 * `play()` 才建，而游戏里的每一次播放都发生在用户手势回调里——点击 / 松手），
 * 若建成后发现仍是 `suspended` 则先 `resume()` 再发声（直接往 suspended
 * context 里 schedule 的声音会被丢弃，表现是「第一次没声」）。
 *
 * ## 微信小游戏（M3 阶段）
 *
 * 微信运行时没有全局 `AudioContext`，本类会**优雅降级为永久静默**（不抛错、
 * 不每帧重试）。真机阶段按 TDD 11.3 换成 `wx.createWebAudioContext()` /
 * `wx.createInnerAudioContext()`——那要求把 wx API 收进独立的 platform 目录
 * （架构守卫 R-A4：`assets/` 内不得出现 wx API），与 M3-1 构建一起做。
 * **换成播文件后 `SfxKey` 命名空间不变，调用方零改动。**
 */

import { DEBUG } from 'cc/env';

import { SFX_ENVELOPE_ATTACK_S, SFX_MASTER_GAIN, sfxSpecOf } from '../core';
import type { SfxKey } from '../core';

export class AudioAdapter {
  private ctx: AudioContext | null = null;

  private muted = false;

  /** 环境无 WebAudio（如微信小游戏）→ 永久静默，不再重试 */
  private unavailable = false;

  /**
   * 每个 key 正在响的振荡器。**同一 key 重触发即停掉上一发**：UI 音效叠音只会
   * 变成噪音（快速连点时尤其明显），「后者打断前者」是音效设计的常规做法。
   */
  private readonly active = new Map<SfxKey, OscillatorNode[]>();

  isMuted(): boolean {
    return this.muted;
  }

  /** 静音开关。调用方负责把它同步进存档（`setMuted` + `saveProgress`） */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (DEBUG) console.log(`[AudioAdapter] 静音：${muted ? '开' : '关'}`);
  }

  /**
   * 播放一个音效。静音 / 无 WebAudio 环境时静默返回（绝不抛错——
   * 音效失败不该影响玩法，架构文档 §5「表现层降级而非崩溃」）。
   */
  play(key: SfxKey): void {
    if (this.muted) {
      if (DEBUG) console.log(`[AudioAdapter] 已静音，跳过 ${key}`);
      return;
    }
    const ctx = this.ensureContext();
    if (ctx === null) return;
    if (ctx.state === 'suspended') {
      // 等 resume 落地再发声；失败（无手势权限）就放弃这一次，不影响玩法
      void ctx.resume().then(
        () => this.emit(ctx, key),
        () => undefined,
      );
      return;
    }
    this.emit(ctx, key);
  }

  /** 停掉全部正在响的音效（换场景 / 组件销毁时收尾，避免拖到下一个场景） */
  stopAll(): void {
    for (const key of Array.from(this.active.keys())) this.stopKey(key);
  }

  // ───────────────────────── 内部 ─────────────────────────

  /** 懒创建 AudioContext；环境不支持则记 `unavailable` 并返回 null */
  private ensureContext(): AudioContext | null {
    if (this.ctx !== null || this.unavailable) return this.ctx;
    try {
      const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? w.webkitAudioContext;
      if (Ctor === undefined) throw new Error('AudioContext 不存在');
      this.ctx = new Ctor();
    } catch (e) {
      this.unavailable = true;
      console.warn('[AudioAdapter] 无 WebAudio 环境，音效降级为静默：', e);
    }
    return this.ctx;
  }

  /** 按规格表合成并发声。`ctx` 必须处于 running 态 */
  private emit(ctx: AudioContext, key: SfxKey): void {
    const spec = sfxSpecOf(key);
    const now = ctx.currentTime;

    // 同一 key 重触发即停上一发（含上一发还没播完的尾音）
    this.stopKey(key);

    const nodes: OscillatorNode[] = [];
    for (const p of spec.pulses) {
      const t0 = now + p.delayMs / 1000;
      const t1 = t0 + p.durationMs / 1000;
      const dur = p.durationMs / 1000;

      const osc = ctx.createOscillator();
      osc.type = p.waveform;
      osc.frequency.setValueAtTime(p.freqFrom, t0);
      if (p.freqTo !== p.freqFrom) {
        osc.frequency.linearRampToValueAtTime(p.freqTo, t1);
      }

      // 包络：0 → 峰值（起振，消爆音）→ 指数衰减到 0，**恰好收在 stop 时刻**。
      // 释音不设固定时长：振荡器被 `stop()` 硬切时若增益还没衰到 0，会残留一帧
      // 直流 →「噗」的爆音；让指数衰减恒收敛到 `t1` 即无切点击，衰减快慢由脉冲
      // 时长自然决定（短脉冲急促、长脉冲舒展）。起振时长按脉冲长度收敛，
      // 60ms 的扣锁 click 不会被起振吃成蚊子叫。
      const attack = Math.min(SFX_ENVELOPE_ATTACK_S, dur * 0.25);
      const peak = Math.min(Math.max(p.gain, 0), 1) * SFX_MASTER_GAIN;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t1);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1);

      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
        const list = this.active.get(key);
        if (list !== undefined) {
          const i = list.indexOf(osc);
          if (i >= 0) list.splice(i, 1);
          if (list.length === 0) this.active.delete(key);
        }
      };
      nodes.push(osc);
    }
    this.active.set(key, nodes);

    if (DEBUG) {
      console.log(
        `[AudioAdapter] 播放音效 ${key}（${spec.pulses.length} 脉冲 / ${spec.durationMs}ms` +
          ` / 总音量 ${(SFX_MASTER_GAIN * 100).toFixed(0)}%）`,
      );
    }
  }

  /** 停掉某 key 正在响的全部振荡器（onended 会负责摘链表） */
  private stopKey(key: SfxKey): void {
    const list = this.active.get(key);
    if (list === undefined) return;
    for (const osc of Array.from(list)) {
      try {
        osc.stop();
      } catch {
        // 已自然结束的振荡器再 stop 会抛 —— 忽略即可
      }
    }
    this.active.delete(key);
  }
}

/**
 * 模块级单例：Home / Game 共用（见文件头「浏览器对并发 AudioContext 有限制」）。
 * 与 `route.ts` 的单例同范式——不挂节点、不随场景重建。
 */
export const audio = new AudioAdapter();
