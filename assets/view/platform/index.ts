/**
 * 发声后端选择器（R-A4：平台相关代码收进 `view/platform/`）。
 *
 * 按 `cc/env` 的 `WECHAT` 编译期常量路由：
 * - 微信小游戏构建 → `WechatSoundBackend`（`wx.createInnerAudioContext`）；
 * - Web / 编辑器 / 其它 → `WebSoundBackend`（Cocos `AudioSource`）。
 *
 * `WECHAT` 是构建期替换的常量，未命中的分支会被死代码消除。
 */
import { WECHAT } from 'cc/env';

import type { SoundBackend } from './SoundBackend';
import { WebSoundBackend } from './web/SoundBackend';
import { WechatSoundBackend } from './wechat/SoundBackend';

/** 创建适合当前平台的发声后端（永不抛错） */
export function createSoundBackend(): SoundBackend {
  if (WECHAT) {
    try {
      return new WechatSoundBackend();
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[AudioAdapter] 微信后端创建失败，回退 Web：', e);
    }
  }
  return new WebSoundBackend();
}

export type { SoundBackend };
