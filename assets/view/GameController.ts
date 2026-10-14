/**
 * Game 场景的会话引导（实施计划 M1-0）。
 *
 * 职责边界（架构文档 4.3）：**只做装配**——把关卡资产变成 `GameSession`，
 * 再把它交给后续的 BoardView / TrayView / DragController / ItemLayer /
 * PreviewLayer 订阅。本组件不含任何玩法规则，也不做任何渲染。
 *
 * M1-6 起本组件还是**单向数据流的接线总闸**（实施计划 M1.A）：
 * 所有改变状态的请求都收敛到 `handleIntent()` → `session.dispatch()`，
 * 返回的事件数组决定"刷什么、表现什么"——view 不直接改任何 core 状态。
 *
 * 挂载点：`Game.scene` 的 `GameRoot` 节点（与官方 2D 模板 taxi 的 `GameRoot`
 * 同一形状；Scene 根节点上不带组件，这是引擎示例的既有惯例）。
 */

import { _decorator, Component, JsonAsset } from 'cc';
import { DEBUG } from 'cc/env';

import { GameSession, LevelDataError, itemAtCell, parseLevelBundle } from '../core';
import type {
  BoardSpec,
  Intent,
  LevelSpec,
  LevelState,
  SessionResult,
} from '../core';
import { BoardView } from './BoardView';
import { DragController } from './DragController';
import { ItemLayer } from './ItemLayer';
import { PreviewLayer } from './PreviewLayer';
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

  /** 棋盘渲染器。装配成功后由本组件把棋盘规格推给它 */
  @property(BoardView)
  boardView: BoardView | null = null;

  /** 托盘渲染器（M1-3）。物品像素指标仍然从 `boardView` 取（R-A6 唯一出口） */
  @property(TrayView)
  trayView: TrayView | null = null;

  /** 拖拽手势 → 意图（M1-4）。本组件只负责给它接上"意图往哪送" */
  @property(DragController)
  dragController: DragController | null = null;

  /** 拖拽预览层（M1-5）：合法/非法/取出 三态 ghost */
  @property(PreviewLayer)
  previewLayer: PreviewLayer | null = null;

  /** 棋盘已放置物品层（M1-6）：按 `state.placements` 全量渲染，与 BoardView 同节点 */
  @property(ItemLayer)
  itemLayer: ItemLayer | null = null;

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

    // 预览层（M1-5）需要查物品形状，给它同一关的 level（只读）
    this.previewLayer?.init(level);
    // 物品层（M1-6）同理；初绘按初始 state（托盘全满、棋盘空的常态）
    this.itemLayer?.init(level);
    this.itemLayer?.render(this.gameSession.getState());

    if (DEBUG) {
      console.log(
        `[GameController] 会话就绪：L${level.levelId}《${level.title}》` +
          ` ${level.board.rows}×${level.board.cols} / ${level.items.length} 件物品`,
      );
      BoardView.logSizingTable(this.bundleLevels());
    }

    // 托盘（M1-3）：顺序与可见性都来自 `state`
    this.renderTray(level);
    this.wireDrag(level);
  }

  /**
   * 拖拽接线（M1-4 起建、M1-6 接真）。
   *
   * **M1-6 起全部接真**：
   * - `onIntent` → `handleIntent` → `session.dispatch`（唯一的改状态入口）；
   * - `previewSource` → `session.getPreview()`（drag 期间由 session 维护，
   *   view 不再用 `canPlace` 复刻一份——两份真相必然分叉）；
   * - `inputFrozen` → 通关动画期间冻结手势（M1-7 生效；core 的
   *   `isInputFrozen()` 是第二道防线）。
   *
   * 棋盘命中由 `core.itemAtCell` 从 `state.placements` 现算，
   * 本组件不缓存"哪格是谁的"。
   */
  private wireDrag(level: LevelSpec): void {
    const drag = this.dragController;
    if (drag === null) return;

    drag.onIntent = (intent) => this.handleIntent(intent);

    drag.inputFrozen = () => this.isFrozen();

    drag.boardItemAt = (row, col) => {
      const session = this.gameSession;
      if (session === null) return null;
      return itemAtCell(level, session.getState().placements, row, col);
    };

    // 预览只从 session 读（M1-5 的 canPlace 挂具已删）：grab/move 的 dispatch
    // 在 onIntent 里同步跑完，session 的 preview 就是最新的
    drag.previewSource = () => this.gameSession?.getPreview() ?? null;
    drag.onPreview = (preview, overTray) => this.previewLayer?.show(preview, overTray);
    drag.onPreviewEnd = (invalid) => this.previewLayer?.endPreview(invalid);

    // 点击出口：托盘的点选也由 DragController 判（点 vs 拖共用手势，
    // 仲裁必须只此一处），本组件把它并进同一入口
    drag.onTap = (itemId) => this.handleIntent({ type: 'select', itemId });
  }

  // ───────────────────────── 单向数据流总闸（M1-6） ─────────────────────────

  /**
   * **一切改变状态的请求的唯一入口**（M1.A 铁律 ①：view 不直接改 core 状态）。
   *
   * `dispatch` 是原子提交：状态变更与事件在同一次调用里返回，本方法据此
   * **一次性**完成视图维护，禁止在单个事件回调里二次改状态（实施计划 M1-6 注）。
   */
  private handleIntent(intent: Intent): void {
    const session = this.gameSession;
    if (session === null) return;

    const result = session.dispatch(intent);
    this.afterDispatch(intent, result);
  }

  /**
   * dispatch 之后：① 维护拖拽生命周期视图（防幽灵）→ ② 刷选中态 →
   * ③ 按事件决定重绘与表现。
   *
   * ③ 只对**真·改状态**的事件触发 `refreshAll`（placement-committed /
   * item-returned / undo-applied / level-reset / item-rotated / rotate-blocked）。
   * `state-changed` 每次 dispatch 都会带（`move` 也带），拿它当触发器会让
   * 每移一格全盘重建——计划原文点名要避免的。
   */
  private afterDispatch(intent: Intent, result: SessionResult): void {
    // ① 拖拽生命周期：被拖物品在两个视图里都排除；松手/取消/取出后恢复。
    //    grab 用 `result.phase === 'Dragging'` 判断 session 是否收下这次起拖
    //    （冻结期会被拒），不靠猜。
    if (intent.type === 'grab') {
      if (result.phase === 'Dragging') this.setDraggingItem(intent.itemId);
    } else if (
      intent.type === 'drop' ||
      intent.type === 'cancel' ||
      intent.type === 'removeToTray'
    ) {
      this.setDraggingItem(null);
    }

    // ② 选中态（select / grab 会改 selectedId）。只刷高亮不重建节点
    if (intent.type === 'select' || intent.type === 'grab') {
      this.trayView?.applyState(result.state);
    }

    // ③ 事件 → 表现
    let refresh = false;
    for (const event of result.events) {
      switch (event.type) {
        case 'state-changed':
          break; // 信号本身不触发重画（见方法注释）
        case 'placement-committed':
          refresh = true;
          if (DEBUG) {
            console.log(
              `[GameController] ${event.from === 'tray' ? '放入' : '移动'} ${event.itemId}` +
                ` → (${event.placement.row},${event.placement.col}) rot=${event.placement.rotation}`,
            );
          }
          break;
        case 'placement-rejected':
          // M1：Console（回弹动画由 PreviewLayer 的 ghost 抖动承担）；
          // M2-4 的 Toast 挂点就是这个 case
          console.warn(
            `[GameController] 放不下：${event.itemId}（${event.reason}）——状态未变、不入撤回栈`,
          );
          break;
        case 'item-returned':
        case 'undo-applied':
        case 'level-reset':
          refresh = true;
          break;
        case 'item-rotated':
          refresh = true;
          break;
        case 'rotate-blocked':
          refresh = true;
          console.warn(`[GameController] 旋转失败：${event.itemId}（四策略全失败，未提交）`);
          break;
        case 'deadlock-warning':
          // M1 仅 Console.warn（实施计划原文）；M2-4 换 Toast
          console.warn(
            `[GameController] 面积快检：一定装不下（剩余 ${event.freeCells} 格 /` +
              ` 还需 ${event.requiredCells} 格）`,
          );
          break;
        case 'level-cleared':
          // M1-7 接 SuccessOverlay；M1-6 先落日志 + 输入已由 phase 冻结
          console.log(
            `[GameController] 🎉 通关！L${event.levelId} ${event.moves} 步` +
              ` ${(event.elapsedMs / 1000).toFixed(1)}s（M1-7 接 SuccessOverlay）`,
          );
          break;
      }
    }

    if (refresh) this.refreshAll(result.state, result.phase);
  }

  /**
   * 整体重绘（MVP 不做增量 diff，与 `TrayView.render` 同策略）：
   * ItemLayer + TrayView 都按 state 快照重建，"无幽灵、无重复占位"是机制保证。
   */
  private refreshAll(state: LevelState, phase: string): void {
    const session = this.gameSession;
    const board = this.boardView;
    if (session === null || board === null) return;

    this.itemLayer?.render(state);
    this.trayView?.render(state, session.level, board);

    if (DEBUG) {
      const placed = Array.from(state.placements.keys()).join(',') || '(空)';
      console.log(
        `[GameController] 重绘：tray=[${state.tray.join(',') || '(空)'}]` +
          ` 已放 ${state.placements.size} 件 [${placed}] phase=${phase}`,
      );
    }
  }

  /** 拖拽中排除 / 恢复被拖物品（两个视图同步，防幽灵） */
  private setDraggingItem(itemId: string | null): void {
    this.itemLayer?.setHiddenItem(itemId);
    this.trayView?.setHiddenItem(itemId);
  }

  /** 手势层冻结查询：通关动画期间一切输入停摆（core 的 isInputFrozen 同口径） */
  private isFrozen(): boolean {
    const phase = this.gameSession?.getPhase();
    return phase === 'WinAnimating' || phase === 'Completed';
  }

  /**
   * 托盘渲染（M1-3）。
   *
   * 数据只从 `session.getState()` 拿，本组件不持有"托盘里有什么"的副本。
   * 点选**不在**这里接线：M1-4 起托盘不再自带触摸监听，点击由 `DragController`
   * 判（见 `wireDrag`），并进 `handleIntent` 同一入口。
   */
  private renderTray(level: LevelSpec): void {
    const session = this.gameSession;
    const tray = this.trayView;
    if (session === null || tray === null || this.boardView === null) return;

    tray.render(session.getState(), level, this.boardView);
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
