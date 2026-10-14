/**
 * Game 场景的会话引导（实施计划 M1-0）。
 *
 * 职责边界（架构文档 4.3）：**只做装配**——把关卡资产变成 `GameSession`，
 * 再把它交给后续的 BoardView / TrayView / DragController 订阅。
 * 本组件不含任何玩法规则，也不做任何渲染。
 *
 * 挂载点：`Game.scene` 的 `GameRoot` 节点（与官方 2D 模板 taxi 的 `GameRoot`
 * 同一形状；Scene 根节点上不带组件，这是引擎示例的既有惯例）。
 */

import { _decorator, Component, JsonAsset, Node } from 'cc';
import { DEBUG } from 'cc/env';

import {
  GameSession,
  LevelDataError,
  eventName,
  findItem,
  itemAtCell,
  parseLevelBundle,
  rotateBy,
  solve,
} from '../core';
import type { BoardSpec, LevelSpec } from '../core';
import { BoardView } from './BoardView';
import { DragController } from './DragController';
import { ItemView } from './ItemView';
import { TrayView } from './TrayView';

const { ccclass, property } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
  /**
   * 关卡数据资产 = `assets/data/levels.json`（`tools/verify-levels.ts` 的产物）。
   *
   * M1 阶段直接把它作为场景依赖引用；M2-1 换成 `resources.load('data/levels')`
   * 后，本字段与加载方式一起替换，`GameSession` 的装配逻辑不动。
   */
  @property(JsonAsset)
  levelJson: JsonAsset | null = null;

  /** 进哪一关（即 `LevelSpec.levelId`，1-based） */
  @property
  levelId = 1;

  /** 棋盘渲染器。装配成功后由本组件把棋盘规格推给它（M1-6 起改为事件驱动） */
  @property(BoardView)
  boardView: BoardView | null = null;

  /** 托盘渲染器（M1-3）。物品像素指标仍然从 `boardView` 取（R-A6 唯一出口） */
  @property(TrayView)
  trayView: TrayView | null = null;

  /** 拖拽手势 → 意图（M1-4）。本组件只负责给它接上"意图往哪送" */
  @property(DragController)
  dragController: DragController | null = null;

  private gameSession: GameSession | null = null;

  /** 会话句柄。装配失败（关卡数据有问题）时为 `null`，调用方必须判空 */
  get session(): GameSession | null {
    return this.gameSession;
  }

  onLoad(): void {
    this.gameSession = this.createSession();
    if (this.gameSession === null) return;

    const level = this.gameSession.level;
    this.boardView?.renderBoard(level.board);

    if (DEBUG) {
      const snapshot = this.gameSession.debugSnapshot();
      console.log(
        `[GameController] 会话就绪：L${level.levelId}《${level.title}》` +
          ` ${level.board.rows}×${level.board.cols} / ${level.items.length} 件物品`,
      );
      console.log('[GameController] debugSnapshot() =', JSON.stringify(snapshot));
      BoardView.logSizingTable(this.bundleLevels());
      this.debugPlaceFirstItem(level);
    }

    // 托盘（M1-3）：顺序与可见性都来自 `state`，所以必须在上面的预演之后建
    this.renderTray(level);
    this.wireDrag(level);
  }

  /**
   * 拖拽接线（M1-4）。
   *
   * **意图出口现在是 Console 挂具**，不是 `dispatch`——实施计划 M1-4 注：
   * M1-6 未完成前先人工比对意图序列是否正确，接线时把下面这一行换成
   * `session.dispatch(intent)` 即可（本方法其余部分不动）。
   *
   * 棋盘命中由 `core.itemAtCell` 从 `state.placements` 现算，
   * 本组件不缓存"哪格是谁的"。
   */
  private wireDrag(level: LevelSpec): void {
    const drag = this.dragController;
    if (drag === null) return;

    drag.onIntent = (intent) => {
      console.log(`[GameController] 意图（M1-4 挂具，未接线）：${JSON.stringify(intent)}`);
    };

    drag.boardItemAt = (row, col) => {
      const session = this.gameSession;
      if (session === null) return null;
      return itemAtCell(level, session.getState().placements, row, col);
    };

    // 点击出口：托盘的点选现在也由 DragController 判（点 vs 拖共用手势，
    // 仲裁必须只此一处），本组件只负责把它接到 select 意图上
    drag.onTap = (itemId) => this.selectItem(itemId);
  }

  /**
   * 托盘渲染（M1-3）。
   *
   * 数据只从 `session.getState()` 拿，本组件不持有"托盘里有什么"的副本。
   * 点选**不在**这里接线：M1-4 起托盘不再自带触摸监听，点击由 `DragController`
   * 判（见 `wireDrag`），本组件只认那条出口。
   */
  private renderTray(level: LevelSpec): void {
    const session = this.gameSession;
    const tray = this.trayView;
    if (session === null || tray === null || this.boardView === null) return;

    tray.render(session.getState(), level, this.boardView);
  }

  /**
   * 点选 → `dispatch({type:'select'})` → 把结果画回来。
   *
   * 这是 M1-6 单向数据流的**最小样板**：view 只发意图、只按结果重画，
   * 绝不自己改 `selectedId`。`applyState()` 只刷选中态，不重建节点。
   */
  private selectItem(itemId: string | null): void {
    const session = this.gameSession;
    if (session === null) return;

    const result = session.dispatch({ type: 'select', itemId });
    this.trayView?.applyState(result.state);

    if (DEBUG) {
      console.log(
        `[GameController] select(${itemId ?? 'null'}) → phase=${result.phase}` +
          ` selected=${result.state.selectedId ?? 'null'}`,
      );
    }
  }

  /**
   * **临时脚手架（M1-6 接线后删除）**：按求解器的解，把**第一件**走真实意图流放上棋盘。
   *
   * M1-2 时这里是"直接建节点摆盘"，M1-3 改成走 `dispatch`：托盘上线后，
   * 直接建节点会造成"盘上有 4 件、托盘里还有 4 件"的矛盾态，一眼就穿帮。
   * 走 dispatch 则 `state` 与画面天然一致，也顺手把 M1-6 那条链路预演了一遍。
   *
   * 只放一件是有意的：留几件在托盘里，M1-3 的"顺序 / 选中 / 取消"才有东西可验。
   */
  private debugPlaceFirstItem(level: LevelSpec): void {
    const session = this.gameSession;
    const board = this.boardView;
    if (session === null || board === null) return;

    const result = solve(level);
    if (result.outcome !== 'solved' || result.solution === null) {
      console.warn(`[GameController] 求解器未给出解（${result.outcome}），跳过摆盘预演`);
      return;
    }
    const first = result.solution[0];
    if (first === undefined) return;

    session.dispatch({ type: 'grab', itemId: first.itemId, anchor: [first.row, first.col] });
    session.dispatch({ type: 'move', anchor: [first.row, first.col] });
    const dropped = session.dispatch({ type: 'drop' });

    console.log(
      `[GameController] M1-3 预演：dispatch 放入 ${first.itemId} @(${first.row},${first.col})` +
        ` → 事件 ${dropped.events.map((e) => eventName(e)).join(',') || '(无)'}`,
    );
    this.debugMountPlaced(level);
  }

  /**
   * 把 `state.placements` 里的物品画到棋盘上（**脚手架**，M1-6 由 `ItemLayer` 接管）。
   *
   * 与 M1-2 版的区别：数据源是 `state` 而不是求解器的解——
   * 这样"画出来的"和"逻辑上的"永远是一份，不会各说各话。
   */
  private debugMountPlaced(level: LevelSpec): void {
    const session = this.gameSession;
    const board = this.boardView;
    if (session === null || board === null) return;

    const state = session.getState();
    const placed: string[] = [];
    for (const [itemId, placement] of state.placements) {
      const item = findItem(level, itemId);
      if (item === undefined) continue;

      const cells = rotateBy(item.cells, placement.rotation);
      const node = new Node(`Item_${itemId}`);
      node.layer = board.node.layer;
      // 挂在棋盘节点下：位置直接用 `BoardView` 的局部坐标，不做二次换算
      board.node.addChild(node);
      node.setPosition(board.gridToLocal(placement.row, placement.col));

      const view = node.addComponent(ItemView);
      view.init(item, board.getCellPx(), board.shapeMetrics(cells));
      placed.push(view.describe());
    }
    if (placed.length > 0) {
      console.log(`[GameController] 棋盘已放 ${placed.length} 件：${placed.join(' ｜ ')}`);
    }
  }

  /**
   * 关卡包里的全部关卡（**仅供 DEBUG 体检用**）。
   *
   * 这里只做一次结构读取：解析与校验的真相源始终是 core 的 `parseLevelBundle`，
   * 本方法不承担任何校验职责，取不到就返回空数组。
   */
  private bundleLevels(): readonly { levelId: number; board: BoardSpec }[] {
    const raw = this.levelJson?.json as { levels?: unknown } | undefined;
    return Array.isArray(raw?.levels) ? (raw.levels as { levelId: number; board: BoardSpec }[]) : [];
  }

  /**
   * 装配会话。**失败不抛到引擎层**——view 侧一律降级（架构文档 §5 错误处理），
   * 否则一个坏数据就让整个场景白屏。降级信息先走 Console，
   * UI 提示（Toast）在 M2-4 接上后替换掉这里的 `console.error`。
   */
  private createSession(): GameSession | null {
    const raw: unknown = this.levelJson?.json;
    if (raw === undefined || raw === null) {
      console.error(
        '[GameController] 没有关卡数据：请在 GameRoot 节点的 levelJson 上指定 assets/data/levels.json',
      );
      return null;
    }

    let level: LevelSpec;
    try {
      level = parseLevelBundle(raw, this.levelId);
    } catch (error) {
      if (error instanceof LevelDataError) {
        console.error(`[GameController] ${error.message}`, error.problems);
        return null;
      }
      throw error;
    }

    return new GameSession(level);
  }
}
