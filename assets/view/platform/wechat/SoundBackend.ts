/**
 * 微信小游戏发声后端（TDD 11.3）：`wx.createInnerAudioContext` 直接播 AudioClip。
 *
 * 为什么绕开 Cocos `AudioSource`：微信小游戏没有浏览器 `AudioContext`，
 * Cocos 的音频后端在微信上行为不确定（早期 M2-9 的 WebAudio 合成直接因无
 * `AudioContext` 而静默）。TDD 11.3 明确指定用微信原生 `wx.createInnerAudioContext`，
 * 本后端直接吃 `AudioClip.nativeUrl`，每次播放新建一个 InnerAudioContext、播完即
 * 销毁，天然支持同 key 快速叠加。
 *
 * 约束（TDD 11.3）：
 * - 首次播放必须由用户手势触发——游戏里所有 `play()` 调用点都在触摸手势回调里，
 *   天然满足；
 * - 尊重系统静音开关——`AudioAdapter` 的静音闸已挡在调用方；
 * - 不抛错——`wx` 缺失 / URL 取不到 / 播放异常一律静默降级。
 *
 * `wx` 经 `globalThis` 取用，避免与任何全局类型声明冲突；非微信构建里本模块会被
 * `WECHAT` 死代码消除，不会进 Web 包。
 */
import { AudioClip } from 'cc';
import { DEBUG } from 'cc/env';

import { SFX_MASTER_GAIN } from '../../../core';
import type { SoundBackend } from '../SoundBackend';

/** 微信 `InnerAudioContext` 用到的成员（只描我们用到的子集） */
interface WxInnerAudioContext {
  src: string;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  play(): void;
  stop(): void;
  destroy(): void;
  onEnded(cb: () => void): void;
  onError(cb: (err: unknown) => void): void;
}

interface WxNamespace {
  createInnerAudioContext(): WxInnerAudioContext;
}

function getWx(): WxNamespace | undefined {
  return (globalThis as Record<string, unknown>).wx as WxNamespace | undefined;
}

export class WechatSoundBackend implements SoundBackend {
  /** 正在播放的实例，stopAll / 播完回收用 */
  private readonly active = new Set<WxInnerAudioContext>();

  play(clip: AudioClip): void {
    const wxNs = getWx();
    if (wxNs === undefined) {
      if (DEBUG) console.warn('[AudioAdapter] 微信命名空间缺失，音效静默降级');
      return;
    }
    // Cocos 在微信上把音频原生文件解到 nativeUrl；直接喂给 InnerAudioContext。
    const url = (clip as unknown as { nativeUrl?: string }).nativeUrl;
    if (!url) {
      if (DEBUG) console.warn('[AudioAdapter] AudioClip 缺少 nativeUrl，微信端音效静默降级');
      return;
    }
    try {
      const ctx = wxNs.createInnerAudioContext();
      ctx.src = url;
      ctx.volume = SFX_MASTER_GAIN;
      ctx.loop = false;
      ctx.onEnded(() => this.dispose(ctx));
      ctx.onError(() => this.dispose(ctx));
      this.active.add(ctx);
      ctx.play();
      if (DEBUG) {
        console.log(
          `[AudioAdapter] 微信端播放 ${url}（volume ${(SFX_MASTER_GAIN * 100).toFixed(0)}%）`,
        );
      }
    } catch (e) {
      if (DEBUG) console.warn('[AudioAdapter] 微信端播放异常，静默降级：', e);
    }
  }

  stopAll(): void {
    for (const ctx of this.active) {
      try {
        ctx.stop();
        ctx.destroy();
      } catch {
        /* 忽略 */
      }
    }
    this.active.clear();
  }

  private dispose(ctx: WxInnerAudioContext): void {
    if (!this.active.delete(ctx)) return;
    try {
      ctx.destroy();
    } catch {
      /* 忽略 */
    }
  }
}
