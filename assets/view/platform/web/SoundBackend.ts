/**
 * Web 发声后端：Cocos `AudioSource.playOneShot`（复用 Web 端 WebAudio 后端）。
 *
 * 行为与 M4-5b 的 `AudioAdapter` 原实现一致——常驻音源节点（persistRoot）跨场景
 * 不被硬切，正在响的尾音不会因换关而断。这里只是把那段逻辑从 `AudioAdapter`
 * 搬出来，归到平台目录（R-A4）。
 */
import { AudioClip, AudioSource, Node, director } from 'cc';
import { DEBUG } from 'cc/env';

import { SFX_MASTER_GAIN } from '../../../core';
import type { SoundBackend } from '../SoundBackend';

export class WebSoundBackend implements SoundBackend {
  /** 常驻发声节点上的 AudioSource（懒创建） */
  private source: AudioSource | null = null;

  /** 环境无法建音源（无场景 / 无音频系统）→ 本后端永久静默 */
  private unavailable = false;

  play(clip: AudioClip): void {
    const source = this.ensureSource();
    if (source === null || !source.isValid) return;
    source.playOneShot(clip, 1);
    if (DEBUG) {
      console.log(
        `[AudioAdapter] 播放音效（Web AudioSource / volume ${(SFX_MASTER_GAIN * 100).toFixed(0)}%）`,
      );
    }
  }

  stopAll(): void {
    const source = this.source;
    if (source !== null && source.isValid) {
      try {
        source.stop();
      } catch {
        /* 未在播放时 stop 可能抛 —— 忽略 */
      }
    }
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
        console.log(
          `[AudioAdapter] 音源就绪（AudioSource / volume ${(SFX_MASTER_GAIN * 100).toFixed(0)}%）`,
        );
      }
      return source;
    } catch (e) {
      this.unavailable = true;
      console.warn('[AudioAdapter] 无法创建音频源，音效降级为静默：', e);
      return null;
    }
  }
}
