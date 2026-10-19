/**
 * 棋盘已放置物品层（实施计划 M1-6）。
 *
 * 接管 M1-2 ~ M1-5 的脚手架（`GameController.debugMountPlaced`）：
 * 按 `state.placements` 全量渲染，**渲染只读 state 快照**（M1.A 铁律 ②：
 * 渲染只读 `getState()`，事件只用来触发表现，不用来改数据）。
 *
 * ## 为什么全量重建（MVP 不做增量 diff）
 *
 * 计划原文：「`state-changed` → BoardView + TrayView **整体重绘**（MVP 不做
 * 增量 diff）」。全量重建顺带把 M1-6 验收「无幽灵物品、无重复占位」变成
 * **机制保证**而不是运气：旧节点全部销毁后按 state 新建，结构上不可能出现
 * 同一物品两份节点、或旧位置残留。物品 ≤10 件、每件 ≤4 格，重建成本可忽略；
 * 等真有性能问题再上 diff——那时要有读数，不凭感觉。
 *
 * ## 拖拽中的排除（`setHiddenItem`）
 *
 * board 起拖时物品**仍在 `placements` 里**（`grab` 不改 state），若不排除，
 * 全量渲染会把它画在原位，而手指处还有 ghost——「幽灵物品」正是 M1-6 验收
 * 点名要消灭的东西。所以拖拽期间把被拖物品排除；松手后恢复，再由
 * `refreshAll` 按新 state 统一重建。托盘起拖的排除在 `TrayView` 同名单方法
 * （物品那时还在 `state.tray` 里，同理）。
 *
 * ## 边界
 *
 * - **不做格算术**：像素位置一律 `BoardView.gridToLocal()`（R-A6 唯一出口），
 *   与 `TrayView` 同策略。本组件因此与 `BoardView` 挂**同一节点**——
 *   物品作为 `BoardRoot` 的子节点、在格子之后创建，天然盖在格子上，
 *   不需要第二套坐标换算，也不会与 `PreviewRoot`（渲染序在最后）抢层级。
 * - **不持有玩法状态副本**：只读 dispatch 返回的 `state`。
 */

import { Component, Node, Tween, Vec3, tween, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import { findItem, rotateBy, UI_WIN_BOUNCE_SCALE } from '../core';
import type { ItemSpec, LevelSpec, LevelState, Placement } from '../core';
import { BoardView } from './BoardView';
import { ItemView } from './ItemView';
import { ensureFrame } from './propAssets';
import { shakeX } from './shake';

const { ccclass, property } = _decorator;

/** 渲染出来的一个物品：节点 + 它的**基准位**（抖完要回到这里，见 `shake.ts`） */
interface ItemNode {
  node: Node;
  base: Vec3;
}

@ccclass('ItemLayer')
export class ItemLayer extends Component {
  /** 棋盘指标出口（R-A6：格 → 像素只从这里拿）。与 BoardView 挂同一节点 */
  @property(BoardView)
  boardView: BoardView | null = null;

  private level: LevelSpec | null = null;
  /** 拖拽中要排除的物品（board 起拖时它还在 placements 里，见文件头） */
  private hiddenItem: string | null = null;
  /** itemId → 节点 + 基准位。只装当前渲染出来的，`clear()` 时整体销毁 */
  private nodes: Map<string, ItemNode> = new Map();

  /** 由 `GameController` 装配时调一次。`level` 只读（查物品形状） */
  init(level: LevelSpec): void {
    this.level = level;
  }

  /**
   * 按 `state.placements` 全量重绘。**先清后建**——这是"无幽灵"的机制，
   * 不是图省事。
   */
  render(state: LevelState): void {
    this.clear();

    const board = this.boardView;
    const level = this.level;
    if (board === null || level === null) return;

    for (const [itemId, placement] of state.placements) {
      if (itemId === this.hiddenItem) continue;
      const item = findItem(level, itemId);
      if (item === undefined) continue;
      const node = this.buildNode(item, placement, board);
      this.nodes.set(itemId, { node, base: node.position.clone() });
    }
  }

  /**
   * 「转不动」的抖动（`rotate-blocked`，UI Spec 6 节 / G1-3 要的负反馈）。
   *
   * 只可能发生在**已放物品**上：core 里托盘物品的旋转要么成功（`trayRotations`
   * 只是记朝向，永远放得下），要么物品 `rotatable === false` 被静默拒收——
   * 两条都不发 `rotate-blocked`。
   */
  shakeItem(itemId: string): void {
    const entry = this.nodes.get(itemId);
    if (entry === undefined) return;
    if (DEBUG) console.log(`[ItemLayer] 抖动 ${itemId}（转不动）`);
    shakeX(entry.node, entry.base);
  }

  /**
   * 通关庆祝①「回弹」（M2-10 / UI Spec 5.3）：最后入箱的物品缩一下再归位。
   *
   * **只做缩放不做位移**：缩放的静止态就是 1，任何被打断的场景都不会留下
   * 持久偏移（位移 tween 会——M1-7 实测教训）。幅度问 config
   * （`UI_WIN_BOUNCE_SCALE`），时长由调用方给（序列编排在 `SuccessOverlay`）。
   *
   * 找不到节点就安静返回：庆祝是表现层，不该为它抛错打断通关流程。
   */
  bounceItem(itemId: string, durationMs: number): void {
    const entry = this.nodes.get(itemId);
    if (entry === undefined) return;
    if (DEBUG) console.log(`[ItemLayer] 回弹 ${itemId}（${durationMs}ms）`);
    const node = entry.node;
    // 幂等：停掉可能在飞的旧动画，并从 1 起（残留的中间倍率会让峰值算不准）
    Tween.stopAllByTarget(node);
    node.setScale(1, 1, 1);
    const peak = UI_WIN_BOUNCE_SCALE;
    const half = durationMs / 2 / 1000;
    tween(node)
      .to(half, { scale: new Vec3(peak, peak, 1) }, { easing: 'sineOut' })
      .to(half, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
      .start();
  }

  /**
   * 拖拽中排除 / 恢复某件。只切 `active`，**不重绘**——松手后由
   * `GameController.refreshAll` 按新 state 统一重建，这里不做局部 diff。
   */
  setHiddenItem(itemId: string | null): void {
    if (this.hiddenItem === itemId) return;
    this.hiddenItem = itemId;
    for (const [id, entry] of this.nodes) {
      entry.node.active = id !== this.hiddenItem;
    }
    if (DEBUG && itemId !== null) {
      console.log(`[ItemLayer] 拖拽中排除 ${itemId}（原位不再画，防幽灵）`);
    }
  }

  /** 当前显示中的节点数（DEBUG 对账 / 压力用例断言用） */
  get visibleCount(): number {
    let count = 0;
    for (const [, entry] of this.nodes) {
      if (entry.node.active) count++;
    }
    return count;
  }

  private buildNode(item: ItemSpec, placement: Placement, board: BoardView): Node {
    const cells = rotateBy(item.cells, placement.rotation);
    const node = new Node(`Item_${item.id}`);
    // 与格子同层：后创建的盖在上面（Graphics 同层按创建序叠）
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(board.gridToLocal(placement.row, placement.col));

    const view = node.addComponent(ItemView);
    // M4-6：rotation 透传——真图子节点要按当前朝向旋转（贴图帧永远是 0 朝向画布）
    view.init(item, board.getCellPx(), board.shapeMetrics(cells), placement.rotation);
    // M4-5a：真图（异步就绪；缓存已热则同步换上）。回调里判 node.isValid——
    // 晚到的帧可能撞上下一次全量重建（本层 clear() 已销毁旧节点）。
    ensureFrame(item.itemType, (frame) => {
      if (frame === null || !node.isValid) return;
      view.setSpriteFrame(frame);
    });
    return node;
  }

  private clear(): void {
    for (const entry of this.nodes.values()) {
      // 抖动可能被重建打断：先停掉，避免 tween 指向已销毁的节点
      Tween.stopAllByTarget(entry.node);
      entry.node.removeFromParent();
      entry.node.destroy();
    }
    this.nodes.clear();
  }

  override onDestroy(): void {
    this.clear();
  }
}
