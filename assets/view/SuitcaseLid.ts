/**
 * 行李箱合盖（M2-10 / UI Spec 5.3 庆祝序列第二段；M4-5b 换成真图）。
 *
 * ## 在序列里的位置
 *
 * 「最后一件物品回弹（100–180ms）→ **行李箱合盖（250–450ms）** → 星光与
 * 『整理完成！』→ 按钮可用」。本组件只负责第二段：盖板从棋盘上方滑下，略过
 * 闭合位后小幅回正（「啪」地合上那一抖），闭合时正好盖住整幅棋盘。
 * 编排在 `SuccessOverlay`（它按 `UI_WIN_*` 常量数时间），本组件不自己决定
 * 什么时候动、动多久——`close(durationMs)` 的时长由调用方给。
 *
 * ## 几何：大小问 BoardView，不自己算（R-A6）
 *
 * M2-10 首版盖板是 `Graphics` 画的圆角方块（rose 填充 + 棕色把手）；M4-5b
 * 换成 `ui/suitcase-closed` 精灵——它与开盖底板 `ui/suitcase-open` 是同一
 * 轮廓，故**尺寸直接问 `BoardView.frameSizePx()`**（= 棋盘 / 0.76），开盖与
 * 合盖同尺寸，合上时严丝合缝盖住开盖箱体。位置锚在棋盘带中心
 * （`getLayout().boardBandCenterY`，与 BoardView 同一活动布局）。每次 `close()` 都按
 * 当前棋盘重设尺寸——各关棋盘不同，建一次就会在换关后盖错大小。
 *
 * ## 层级：由 GameController 运行时注入
 *
 * 插在 `SafeAreaRoot` 子节点里、通关浮层**正下方**：合盖要盖住棋盘/物品，
 * 又不能盖住浮层遮罩（遮罩还得盖住它）。同工具栏/引导/确认框代码注入，不手改场景。
 *
 * ## 边界
 *
 * - **不拦截输入**：合盖发生在 `WinAnimating` 冻结期，手势已被
 *   `DragController.inputFrozen` + core `isInputFrozen()` 双重挡下，盖板只是
 *   一块显示的精灵，不需要（也不该）挂触摸监听；
 * - **结束值恒为闭合位**：两段式（下滑略过头 → 回正）而不是 backOut——
 *   backOut 的回挑量随距离等比放大（342px 的棋盘会挑出 30+px，像撞歪了）；
 * - `reset()` 由 `startLevel` 调（换关/重开）：停动画、藏节点，下一场演出
 *   从干净的初始态开始。
 */

import { Component, Node, Sprite, Tween, UITransform, Vec3, tween, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import { UI_WIN_LID_DIP_PX, UI_WIN_LID_START_GAP_PX } from '../core';
import { getLayout } from './layout';
import { BoardView } from './BoardView';
import { applyUiSprite } from './uiAssets';

const { ccclass, property } = _decorator;

@ccclass('SuitcaseLid')
export class SuitcaseLid extends Component {
  /** 棋盘指标出口（R-A6：盖板大小问它，不自己乘 cols×cellPx） */
  @property(BoardView)
  boardView: BoardView | null = null;

  /** 盖板精灵（`suitcase-closed`），懒建一次 */
  private sprite: Sprite | null = null;

  /** 合盖动画进行中（`isClosed` 要区分「已合上」与「正在合」） */
  private closing = false;

  override onLoad(): void {
    // 尺寸按棋盘动态给（各关不同），初始占位 0；未演出时不参与渲染与命中
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(0, 0);
    transform.setAnchorPoint(0.5, 0.5);
    this.buildSprite();
    this.node.active = false;
  }

  /**
   * 合盖。`durationMs` = 总时长（UI Spec 250–450ms，由 config 常量给定）。
   *
   * 幂等：重复调用会停掉旧动画从头滑（正常流程下一场通关只合一次盖，
   * 这是防御性保证）。
   */
  close(durationMs: number): void {
    const board = this.boardView;
    if (board === null) return;

    const size = board.boardSizePx();
    if (size.width <= 0 || size.height <= 0) {
      // 棋盘还没渲染（理论上是这样：序列在 refreshAll 之后才启动）——没得盖
      if (DEBUG) console.log('[SuitcaseLid] 棋盘尺寸为 0，跳过合盖');
      return;
    }

    // 盖板与开盖底板同尺寸（棋盘 / 0.76），合上正好盖住开盖箱体
    const frame = board.frameSizePx();
    const sprite = this.buildSprite();
    const spriteTf =
      sprite.node.getComponent(UITransform) ?? sprite.node.addComponent(UITransform);
    spriteTf.setContentSize(frame.width, frame.height);
    const selfTf = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    selfTf.setContentSize(frame.width, frame.height);

    const closedY = getLayout().boardBandCenterY;
    const startY = closedY + frame.height + UI_WIN_LID_START_GAP_PX;
    this.node.setPosition(0, startY, 0);
    this.node.active = true;

    Tween.stopAllByTarget(this.node);
    this.closing = true;
    if (DEBUG) {
      console.log(
        `[SuitcaseLid] 合盖开始（${durationMs}ms，棋盘 ${size.width}×${size.height}` +
          ` → 盖板 ${frame.width.toFixed(0)}×${frame.height.toFixed(0)}）`,
      );
    }

    const dip = UI_WIN_LID_DIP_PX;
    tween(this.node)
      // 快速下滑，略过闭合位（合盖的惯量）
      .to((durationMs * 0.8) / 1000, { position: new Vec3(0, closedY - dip, 0) }, { easing: 'sineOut' })
      // 短回正，**结束值恒为闭合位**
      .to((durationMs * 0.2) / 1000, { position: new Vec3(0, closedY, 0) }, { easing: 'sineIn' })
      .call(() => {
        this.closing = false;
        if (DEBUG) console.log('[SuitcaseLid] 合盖完成');
      })
      .start();
  }

  /** 复位（换关 / 重开）：停动画、藏节点。下一场从干净初始态开始 */
  reset(): void {
    this.closing = false;
    Tween.stopAllByTarget(this.node);
    this.node.active = false;
  }

  /** 是否已合上（动画播完且仍显示中）。DEBUG 对账 / 取证用 */
  get isClosed(): boolean {
    return this.node.active && !this.closing;
  }

  /** 懒建盖板精灵（`suitcase-closed`） */
  private buildSprite(): Sprite {
    if (this.sprite !== null && this.sprite.isValid) return this.sprite;
    const node = new Node('LidSprite');
    node.layer = this.node.layer;
    this.node.addChild(node);
    const tf = node.addComponent(UITransform);
    tf.setAnchorPoint(0.5, 0.5);
    tf.setContentSize(0, 0);
    // 先定 type/sizeMode 再贴帧（CUSTOM 才不被帧尺寸改写，见 MEMORY 引擎限制）
    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    applyUiSprite(sprite, 'suitcase-closed');
    this.sprite = sprite;
    return sprite;
  }
}
