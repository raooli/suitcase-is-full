/**
 * 音效适配器（M2-9 首版合成 / M4-5b 换成播文件）。
 *
 * ## 定位
 *
 * - **只管发声与静音闸**，不认识玩法：调用方给一个 `SfxKey`，本类播放
 *   `assets/resources/audio/<key>` 对应的音频文件（M4-4 离线渲染的 WAV）。
 * - **`SfxKey` 命名空间与 `play` / `setMuted` / `stopAll` API 零改动**：
 *   M2-9 用 WebAudio 振荡器合成，M4-5b 换成 `AudioSource.playOneShot` 播文件，
 *   五个调用点（首页开关、Game 的四类事件）一行都不用改。
 * - **不读存档**：静音态由调用方从存档灌入，存取只经 `view/storage.ts`。
 *
 * ## 电平口径
 *
 * WAV 已归一化到 0.70 峰值、**未烘焙** `SFX_MASTER_GAIN(0.22)`。所以播放时把
 * `AudioSource.volume` 设成 0.22 → 有效峰值 ≈ 0.154，与合成版听感一致；
 * 若 volume=1 直放会响约 6 倍。
 *
 * ## 音源节点（跨场景常驻）
 *
 * 模块级单例 `audio` 不挂节点（与 `route.ts` 同范式）。真正发声的 `AudioSource`
 * 懒创建在一个 `SfxPlayer` 节点上，并 `addPersistRootNode` 常驻——换关 / 回首页
 * 时这个节点不被销毁，正在响的尾音不会被硬切，下一场景继续用同一个音源。
 *
 * ## 加载
 *
 * 首次 `play` 某 key 时若音频还没进缓存，会边加载边记「载完就播」；`preload()`
 * 在场景 `onLoad` 里把这 4 个文件提前载进缓存，消除首次播放的加载延迟。
 * 加载失败（缺文件 / 平台不支持）→ 记 `null` 静默降级，绝不抛错——音效失败
 * 不该影响玩法（架构文档 §5「表现层降级而非崩溃」）。
 */

import { AudioClip, AudioSource, Node, director, resources } from 'cc';
import { DEBUG } from 'cc/env';

import { SFX_KEYS, SFX_MASTER_GAIN } from '../core';
import type { SfxKey } from '../core';

/** 音频文件在 resources 包里的相对目录；文件名严格 = SfxKey */
const AUDIO_DIR = 'audio';

export class AudioAdapter {
  /** 常驻发声节点上的 AudioSource（懒创建） */
  private source: AudioSource | null = null;

  private muted = false;

  /** 环境无法建音源（无场景 / 无音频系统）→ 永久静默，不再重试 */
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
    const source = this.ensureSource();
    if (source === null) return;

    const cached = this.clips.get(key);
    if (cached !== undefined) {
      if (cached === null) {
        if (DEBUG) console.log(`[AudioAdapter] ${key} 无音频文件，静默`);
        return;
      }
      this.fire(source, key, cached);
      return;
    }
    // 还没载入：记下「载完播一次」，并（若尚未发起）发起加载
    this.pendingPlay.add(key);
    this.load(key);
  }

  /** 停掉当前播放（换场景 / 组件销毁时收尾）。一次性音效以短促为主，尽力而为 */
  stopAll(): void {
    const source = this.source;
    if (source !== null && source.isValid) {
      try {
        source.stop();
      } catch {
        // 未在播放时 stop 可能抛 —— 忽略
      }
    }
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
        const source = this.ensureSource();
        if (source !== null) this.fire(source, key, got);
      }
    });
  }

  /** 懒创建常驻音源节点；环境不支持则记 `unavailable` 并返回 null */
  private ensureSource(): AudioSource | null {
    if (this.unavailable) return null;
    if (this.source !== null && this.source.isValid && this.source.node.isValid) {
      return this.source;
    }
    try {
      const scene = director.getScene();
      if (scene === null) throw new Error('当前无场景');
      const node = new Node('SfxPlayer');
      scene.addChild(node);
      // 跨场景常驻：换关 / 回首页时音源节点不被销毁。某些平台若不允许常驻，
      // 退化为「当前场景内有效」，下一次 play 时按 isValid 重建——不致命。
      try {
        director.addPersistRootNode(node);
      } catch {
        /* 忽略：退化为场景内有效 */
      }
      const source = node.addComponent(AudioSource);
      source.playOnAwake = false;
      source.loop = false;
      source.volume = SFX_MASTER_GAIN;
      this.source = source;
      if (DEBUG) {
        console.log(`[AudioAdapter] 音源就绪（AudioSource / volume ${(SFX_MASTER_GAIN * 100).toFixed(0)}%）`);
      }
      return source;
    } catch (e) {
      this.unavailable = true;
      console.warn('[AudioAdapter] 无法创建音频源，音效降级为静默：', e);
      return null;
    }
  }

  /** 真正发声。音量由 `source.volume`(=SFX_MASTER_GAIN) 决定，playOneShot 叠加 */
  private fire(source: AudioSource, key: SfxKey, clip: AudioClip): void {
    if (!source.isValid) return;
    source.playOneShot(clip, 1);
    if (DEBUG) {
      console.log(
        `[AudioAdapter] 播放音效 ${key}（volume ${(SFX_MASTER_GAIN * 100).toFixed(0)}%）`,
      );
    }
  }
}

/**
 * 模块级单例：Home / Game 共用（音源节点以 persistRoot 跨场景常驻，
 * 静音态与正在响的尾音都不会因换场景而断）。与 `route.ts` 的单例同范式。
 */
export const audio = new AudioAdapter();
