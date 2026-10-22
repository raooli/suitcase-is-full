/**
 * 音效适配器（M2-9 首版合成 / M4-5b 换成播文件）。
 *
 * ## 定位
 *
 * - **只管发声与静音闸**，不认识玩法：调用方给一个 `SfxKey`，本类播放
 *   `assets/resources/audio/<key>` 对应的音频文件（M4-4 离线渲染的 WAV）。
 * - **`SfxKey` 命名空间与 `play` / `setMuted` / `stopAll` API 零改动**：
 *   M2-9 用 WebAudio 振荡器合成，M4-5b 换成 `AudioSource.playOneShot` 播文件，
 *   五个调用点（首页开关、Game 的四类事件）一行都不用改。M3（微信小游戏）再把
 *   发声后端按 R-A4 抽进 `view/platform/`：`WebSoundBackend`（AudioSource）与
 *   `WechatSoundBackend`（`wx.createInnerAudioContext`，TDD 11.3）由 `cc/env`
 *   的 `WECHAT` 编译期常量二选一，本类只做调度，不碰平台 API。
 * - **不读存档**：静音态由调用方从存档灌入，存取只经 `view/storage.ts`。
 *
 * ## 电平口径
 *
 * WAV 已归一化到 0.70 峰值、**未烘焙** `SFX_MASTER_GAIN(0.22)`。播放时由后端把
 * `volume` 套成 0.22 → 有效峰值 ≈ 0.154，与合成版听感一致；若直放会响约 6 倍。
 *
 * ## 发声后端（平台隔离，R-A4）
 *
 * 模块级单例 `audio` 不挂节点（与 `route.ts` 同范式）。真正发声交给
 * `createSoundBackend()` 选出的后端；Web 后端把 `AudioSource` 挂在 `SfxPlayer`
 * 常驻节点上（换关不被硬切），微信后端直接吃 `AudioClip.nativeUrl`。
 *
 * ## 加载
 *
 * 首次 `play` 某 key 时若音频还没进缓存，会边加载边记「载完就播」；`preload()`
 * 在场景 `onLoad` 里把这 4 个文件提前载进缓存，消除首次播放的加载延迟。
 * 加载失败（缺文件 / 平台不支持）→ 记 `null` 静默降级，绝不抛错——音效失败
 * 不该影响玩法（架构文档 §5「表现层降级而非崩溃」）。
 */

import { AudioClip, resources } from 'cc';
import { DEBUG } from 'cc/env';

import { SFX_KEYS } from '../core';
import type { SfxKey } from '../core';
import { createSoundBackend } from './platform';
import type { SoundBackend } from './platform';

/** 音频文件在 resources 包里的相对目录；文件名严格 = SfxKey */
const AUDIO_DIR = 'audio';

export class AudioAdapter {
  /** 当前平台的发声后端（懒创建） */
  private backend: SoundBackend | null = null;

  private muted = false;

  /** 后端无法创建（环境不支持）→ 永久静默，不再重试 */
  private unavailable = false;

  /** key → AudioClip；`null` = 已确认无文件（负结果缓存） */
  private readonly clips = new Map<SfxKey, AudioClip | null>();

  /** 正在加载的 key（防并发重复 load） */
  private readonly inflight = new Set<SfxKey>();

  /** 加载中就已经请求「载完播一次」的 key */
  private readonly pendingPlay = new Set<SfxKey>();

  isMuted(): boolean {
    return this.muted;
  }

  /** 静音开关。调用方负责把它同步进存档（`setMuted` + `saveProgress`） */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (DEBUG) console.log(`[AudioAdapter] 静音：${muted ? '开' : '关'}`);
  }

  /** 预热全部音效文件（不发声，只把 AudioClip 载进缓存） */
  preload(): void {
    for (const key of SFX_KEYS) this.load(key);
  }

  /**
   * 播放一个音效。静音 / 无音频环境时静默返回（绝不抛错——音效失败不该
   * 影响玩法，架构文档 §5「表现层降级而非崩溃」）。
   */
  play(key: SfxKey): void {
    if (this.muted) {
      if (DEBUG) console.log(`[AudioAdapter] 已静音，跳过 ${key}`);
      return;
    }
    const backend = this.ensureBackend();
    if (backend === null) return;

    const cached = this.clips.get(key);
    if (cached !== undefined) {
      if (cached === null) {
        if (DEBUG) console.log(`[AudioAdapter] ${key} 无音频文件，静默`);
        return;
      }
      backend.play(cached);
      return;
    }
    // 还没载入：记下「载完播一次」，并（若尚未发起）发起加载
    this.pendingPlay.add(key);
    this.load(key);
  }

  /** 停掉当前播放（换场景 / 组件销毁时收尾）。一次性音效以短促为主，尽力而为 */
  stopAll(): void {
    this.backend?.stopAll();
  }

  // ───────────────────────── 内部 ─────────────────────────

  /** 载入某 key 的音频文件（已缓存 / 在飞 / 不可用则跳过） */
  private load(key: SfxKey): void {
    if (this.unavailable) return;
    if (this.clips.has(key) || this.inflight.has(key)) return;
    this.inflight.add(key);
    resources.load(`${AUDIO_DIR}/${key}`, AudioClip, (err, clip) => {
      this.inflight.delete(key);
      const got = err ? null : (clip ?? null);
      this.clips.set(key, got);
      if (DEBUG) {
        console.log(
          `[AudioAdapter] ${key} → ${got === null ? '无音频文件，静默降级' : '音频已载入'}`,
        );
      }
      // 加载期间有 play 请求 → 载完补播一次
      if (got !== null && this.pendingPlay.delete(key)) {
        const backend = this.ensureBackend();
        if (backend !== null) backend.play(got);
      }
    });
  }

  /** 懒创建适合当前平台的发声后端；环境不支持则记 `unavailable` 并返回 null */
  private ensureBackend(): SoundBackend | null {
    if (this.unavailable) return null;
    if (this.backend !== null) return this.backend;
    try {
      this.backend = createSoundBackend();
      if (DEBUG) console.log('[AudioAdapter] 发声后端已创建');
      return this.backend;
    } catch (e) {
      this.unavailable = true;
      console.warn('[AudioAdapter] 无法创建音频后端，音效降级为静默：', e);
      return null;
    }
  }
}

/**
 * 模块级单例：Home / Game 共用（Web 后端的音源节点以 persistRoot 跨场景常驻，
 * 静音态与正在响的尾音都不会因换场景而断）。与 `route.ts` 的单例同范式。
 */
export const audio = new AudioAdapter();
