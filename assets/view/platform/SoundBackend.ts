/**
 * 发声后端接口（R-A4：平台相关代码收进 `view/platform/`）。
 *
 * `AudioAdapter` 只负责「调度 / 静音闸 / 缓存 / 跨场景常驻」，**不碰具体平台发声
 * API**；真正把 `AudioClip` 变成声音的动作交给后端。当前两类实现：
 *
 * - `web/SoundBackend`：Cocos `AudioSource.playOneShot`（Web 端 WebAudio 后端），
 *   含跨场景常驻音源节点，沿用 M4-5b 已验证行为。
 * - `wechat/SoundBackend`：TDD 11.3 指定的 `wx.createInnerAudioContext`，
 *   直接吃 `AudioClip.nativeUrl`，绕开 Cocos 音频后端在微信上的不确定行为。
 *
 * 由 `index.ts` 按 `cc/env` 的 `WECHAT` 编译期常量二选一；未命中的平台分支会被
 * 构建期死代码消除（Web 包里不会残留 `wx` 引用）。
 */
import type { AudioClip } from 'cc';

/** 一个可发声的后端：吞掉一切异常、永不抛错（音效失败不该影响玩法）。 */
export interface SoundBackend {
  /**
   * 播放一个已加载的 AudioClip。音量由后端内部套用 `SFX_MASTER_GAIN`，
   * 调用方无需关心平台差异。
   */
  play(clip: AudioClip): void;

  /** 停掉当前所有正在播放的实例（换场景 / 组件销毁收尾）。 */
  stopAll(): void;
}
