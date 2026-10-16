/**
 * 启动场景（M2-7）。
 *
 * 职责单一：**读存档 → 跳首页**。游戏入口统一从 Boot 走，Home / Game 都不必
 * 重复处理「存档为空」的默认分支（`storage.loadProgress` 内部已对首启 / 损坏
 * 回退默认值）。
 *
 * Boot 不渲染任何 UI（启动瞬间切换，没必要）；若日后要加 loading 画面，从这里扩。
 */

import { _decorator, Component, director } from 'cc';
import { DEBUG } from 'cc/env';

import { loadProgress } from './storage';

const { ccclass } = _decorator;

@ccclass('BootController')
export class BootController extends Component {
  override onLoad(): void {
    const progress = loadProgress();
    if (DEBUG) {
      console.log(
        `[BootController] 载入存档：最高解锁 L${progress.maxUnlockedLevelId}` +
          ` / 已通关 ${progress.clearedLevelIds.length} 关 → 进入 Home`,
      );
    }
    director.loadScene('Home');
  }
}
