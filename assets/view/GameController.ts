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
 * M1-7 起 `level-cleared` 在这里接上 `SuccessOverlay`。
 *
 * 挂载点：`Game.scene` 的 `GameRoot` 节点（与官方 2D 模板 taxi 的 `GameRoot`
 * 同一形状；Scene 根节点上不带组件，这是引擎示例的既有惯例）。
 */

import { _decorator, Component, JsonAsset, Node, UITransform } from 'cc';
import { DEBUG } from 'cc/env';

import {
  GameSession,
  LevelDataError,
  findItem,
  itemAtCell,
  levelIdsOf,
  parseLevelBundle,
  rotateBy,
  suggestNextPlacement,
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_HINT_AUTO_CLEAR_MS,
  UI_TOOLBAR_BAND_CENTER_Y,
  UI_TOOLBAR_HEIGHT,
} from '../core';
import type {
  BoardSpec,
  Intent,
  LevelSpec,
  LevelState,
  SessionResult,
} from '../core';
import { BoardView } from './BoardView';
import { ConfirmDialog } from './ConfirmDialog';
import { DragController } from './DragController';
import { ItemLayer } from './ItemLayer';
import { PreviewLayer } from './PreviewLayer';
import { SuccessOverlay } from './SuccessOverlay';
import { ToolbarView } from './ToolbarView';
import { Toast } from './Toast';
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

  /** 通关浮层（M1-7）：`level-cleared` 时入场，播完调 `completeWinAnimation` */
  @property(SuccessOverlay)
  successOverlay: SuccessOverlay | null = null;

  /** 底部工具栏（M2-2）：撤回 / 旋转 / 重置 / 提示。运行时代码注入 SafeAreaRoot */
  private toolbarView: ToolbarView | null = null;

  /** 重置二次确认框（M2-3）：运行时代码注入 SafeAreaRoot，置于最顶层 */
  private confirmDialog: ConfirmDialog | null = null;

  /** 「装不下」非阻断提示条（M2-4）：运行时代码注入 SafeAreaRoot，置于最顶层 */
  private toastView: Toast | null = null;

  /** 确认框是否打开（期间冻结拖拽手势，双保险） */
  private dialogOpen = false;

  /** 提示高亮自动清除的待执行回调（用于取消上一次的超时） */
  private hintClearCallback: (() => void) | null = null;

  private gameSession: GameSession | null = null;

  /** 会话句柄。装配失败（关卡数据有问题）时为 `null`，调用方必须判空 */
  get session(): GameSession | null {
    return this.gameSession;
  }

  override onLoad(): void {
    if (DEBUG) {
      // 尺寸体检表：逐关打印 cellSize 折算（G1-D3 要盯它在 320px 屏是否过 44 下限）
      BoardView.logSizingTable(this.bundleLevels());
    }
    // 装配与"换一关"是同一条路径（M2-1）：首启就是载入第 `levelId` 关
    this.startLevel(this.levelId);
    this.wireSuccessOverlay();
    // M2-2 工具栏 + M2-3 重置确认框：运行时代码注入 SafeAreaRoot（场景 JSON 的
    // `__type__` 编码易碎，故不手改场景，改由代码建节点 + addComponent）
    this.buildToolbar();
    this.buildDialog();
    this.buildToast();
  }

  /**
   * 载入指定关卡并整体重建视图（M2-1）。**首启 / 再来一次 / 下一关 三条路径共用**——
   * 三条路径要做的事完全一样，拆成三份必然分叉（M1-7 的 replay 就是先例）。
   *
   * 步骤：`levelId` 落库 → 换 `GameSession` → 重画棋盘格 → init 两个只读层 →
   * 重挂 `wireDrag` → 全量刷新 → 收起浮层。
   *
   * 两处容易漏的：
   * - **`wireDrag` 必须重挂**：`boardItemAt` 的闭包捕获了 `level`，换关不重挂
   *   会拿上一关的物品表去查这一关的命中（点得到但抓不起来）；
   * - **`renderBoard` / `ItemLayer.render` 都先清后建**，重复调用安全（M1-1 起如此）。
   *
   * 换关走**新 `GameSession`** 而不是 `dispatch({type:'reset'})`：reset 在
   * `WinAnimating` / `Completed` 被 `isInputFrozen()` 故意冻结（防玩家被浮层误导
   * 误触工具栏抹掉通关态），而浮层按钮是明确意图，另走换会话更干净。
   */
  private startLevel(levelId: number): void {
    this.levelId = levelId;
    this.gameSession = this.createSession();
    const session = this.gameSession;
    if (session === null) return;

    const level = session.level;
    this.boardView?.renderBoard(level.board);
    // 预览层（M1-5）/ 物品层（M1-6）只查物品形状，给它们同一关的 level（只读）
    this.previewLayer?.init(level);
    this.itemLayer?.init(level);
    this.wireDrag(level);
    // 换关 / 重开才把托盘滚回开头：**`render` 保留偏移**（每次状态变更重建都归零
    // 会让 L7+ 刚取回的物品滚出视野），所以归零必须由这里显式声明
    this.trayView?.resetScroll();
    this.refreshAll(session.getState(), session.getPhase());
    this.successOverlay?.hide();
    // 工具栏可用态随关卡刷新（首关 / 换关后重算）
    this.updateToolbarState();

    if (DEBUG) {
      const next = this.hasNextLevel() ? `L${levelId + 1}` : '（已是最后一关）';
      console.log(
        `[GameController] 载入 L${level.levelId}《${level.title}》` +
          ` ${level.board.rows}×${level.board.cols} / ${level.items.length} 件物品` +
          ` → 下一关 ${next}`,
      );
    }
  }

  /**
   * 有没有下一关（UI Spec 5.3：最后一关不显示「下一关」，也不留空按钮）。
   *
   * 问 core 的 `levelIdsOf()`，不在 view 里数数组长度——"包里有哪些关"是数据
   * 结构判断，属于 core（执行纪律 #3：逻辑进 core，表现进 view）。
   */
  private hasNextLevel(): boolean {
    const ids = levelIdsOf(this.levelJson?.json);
    if (ids.length === 0) return false;
    return this.levelId < Math.max(...ids);
  }

  /**
   * 通关浮层接线（M1-7）。
   *
   * - `onSettled`：入场动画播完 → `completeWinAnimation()` 把 phase 从
   *   `WinAnimating` 推到 `Completed`。**冻结的解除时机由 view 决定**
   *   （动画播了多久只有 view 知道），core 不自己数时间；
   * - `onReplay`：换一个同关卡的新会话（不走 `dispatch({type:'reset'})`——
   *   reset 在 `Completed` 期被 isInputFrozen 故意冻结，那是防"浮层盖住
   *   工具栏时误重置抹掉通关态"的；浮层自身按钮是明确意图，另走换会话）。
   */
  private wireSuccessOverlay(): void {
    const overlay = this.successOverlay;
    if (overlay === null) return;

    overlay.onSettled = () => {
      this.gameSession?.completeWinAnimation();
    };
    overlay.onReplay = () => {
      this.startLevel(this.levelId);
    };
    overlay.onNextLevel = () => {
      // 双保险：最后一关不显示这个按钮，所以这里正常情况下不会发生；
      // 真发生了也不能把玩家送进不存在的关卡（`parseLevelBundle` 会抛）
      if (!this.hasNextLevel()) return;
      this.startLevel(this.levelId + 1);
    };
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

    // 取出判定（M2-5，PRD R-06b）：物品中心是否出「棋盘外扩半格」。
    // 格→像素换算走 BoardView.isTakeout（R-A6 唯一出口），形状按**当前朝向**
    // 算（旋转改变包围盒，中心随之移动）；`from === 'tray' 也是取出态`的
    // 另一半由 DragController 的「手指在托盘带内」补上（见 isTakeoutState）
    drag.outsideBoard = (preview) => {
      const session = this.gameSession;
      const board = this.boardView;
      if (session === null || board === null) return false;
      const item = findItem(session.level, preview.itemId);
      if (item === undefined) return false;
      return board.isTakeout(rotateBy(item.cells, preview.rotation), preview.anchor);
    };

    drag.onPreview = (preview, takeout) => {
      this.previewLayer?.show(preview, takeout);
      // 取出态：高亮托盘目标位（UI Spec 7「取出目标位高亮」）；离开则还原
      if (takeout && preview !== null) this.trayView?.highlightReturnTarget(preview.itemId);
      else this.trayView?.clearReturnTarget();
    };
    drag.onPreviewEnd = (invalid) => {
      this.previewLayer?.endPreview(invalid);
      // 取消 / 取出的收尾都可能不触发重绘（cancel 无状态变化），
      // 目标位高亮在这里统一清，不依赖 refreshAll
      this.trayView?.clearReturnTarget();
    };

    // 点击出口：点 vs 拖共用手势、仲裁必须只此一处（DragController 判），
    // 本组件只决定"点到物品"意味着 select 还是 rotate
    drag.onTap = (itemId) => this.handleTap(itemId);
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
   * 点击（「点还是拖」已由 `DragController` 仲裁完才到这里，本组件不重判）。
   *
   * **再次点击已选中的物品 = 旋转**：UI Spec 6 节「Selected（托盘或已放物品）
   * → 点击旋转」+ GDD 1.2「点击物品选中，再点击旋转按钮」。M1 没有工具栏
   * （M2-2 才有旋转按钮），于是把**第二次点击**当那个按钮——也正是实施计划
   * M1.A 表里写的「`rotate` = 旋转按钮或双击」。
   *
   * 用"已选中"判定而**不是**双击计时器：计时器有时间阈值竞态（慢一点就变成
   * 两次选中），而"点已选中的东西"语义稳定、可解释。
   */
  private handleTap(itemId: string | null): void {
    const session = this.gameSession;
    if (session === null) return;

    const selected = session.getState().selectedId;
    if (itemId !== null && itemId === selected) {
      this.handleIntent({ type: 'rotate', itemId });
      return;
    }
    this.handleIntent({ type: 'select', itemId });
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
    // 任何状态变更都清掉提示高亮（提示是临时态，不该残留到下一步操作）
    this.clearHint();

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

    // ③ 「点了旋转但什么都没发生」= 该物品 `rotatable === false`（core 静默
    //    拒收，不发事件）。GDD 1.2 的做法是「不可旋转时按钮禁用」，M1 没有
    //    按钮，所以只留一条 DEBUG 线——真机手感验收（G1）要能把它和
    //    "转不动（四策略全失败）"区分开
    if (intent.type === 'rotate') {
      const happened = result.events.some(
        (event) => event.type === 'item-rotated' || event.type === 'rotate-blocked',
      );
      if (!happened && DEBUG) {
        console.log(
          `[GameController] 旋转无变化：${intent.itemId}（该物品 rotatable=false，按规格不可旋转）`,
        );
      }
    }

    // ④ 事件 → 表现
    let refresh = false;
    let resetTrayScroll = false;
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
          refresh = true;
          break;
        case 'level-reset':
          // 「重置」= 回到本关初始状态，托盘也一并回到开头（`render` 刻意保留偏移，
          // 见 TrayView.render 注释；归零是这里的显式意图）
          refresh = true;
          resetTrayScroll = true;
          break;
        case 'item-rotated':
          refresh = true;
          if (DEBUG) {
            // 位置也要打：原位旋转可能被 nudge 挪锚点（四策略之一），
            // 只看朝向对不上"我点的那格怎么没反应"
            const at = result.state.placements.get(event.itemId);
            console.log(
              `[GameController] 旋转 ${event.itemId} → 朝向 ${event.rotation}` +
                (at === undefined ? '' : ` 现位于 (${at.row},${at.col})`),
            );
          }
          break;
        case 'rotate-blocked':
          // **不重绘**：core 策略 4 保证「要么提交合法、要么根本没变」，状态没
          // 变就重绘等于把刚要抖的节点重建掉（抖动会无声消失）。这次的唯一
          // 反馈就是抖一下（UI Spec 6 / G1-3）
          console.warn(`[GameController] 旋转失败：${event.itemId}（四策略全失败，未提交）`);
          this.itemLayer?.shakeItem(event.itemId);
          break;
        case 'deadlock-warning':
          // M2-4：非阻断 Toast（UI Spec 13「提示出现时棋盘仍可操作」，文案指向
          // 「挪一挪 / 撤回一步」，**绝不**触发失败态或禁用操作）。这是设计内行为，
          // 不是异常，故不在此 console.error / warn。
          this.toastView?.show('剩下的空间装不下啦，试试挪一挪或者撤回一步');
          break;
        case 'level-cleared':
          // M1-7：进通关浮层。输入此刻已由 phase（WinAnimating）冻结，
          // 浮层播完再经 onSettled → completeWinAnimation 解冻
          console.log(
            `[GameController] 🎉 通关！L${event.levelId} ${event.moves} 步` +
              ` ${(event.elapsedMs / 1000).toFixed(1)}s → SuccessOverlay`,
          );
          this.successOverlay?.show(event, this.hasNextLevel());
          break;
      }
    }

    // 归零放在 refreshAll **之前**：让重建本身就按 0 布局（不然会先按保留的旧偏移
    // 建一遍再跳回开头，日志/首帧都对不上）。此刻动作只改一个偏移字段，旧槽位随
    // 重建被清掉，不产生浪费的可见中间态。
    if (resetTrayScroll) this.trayView?.resetScroll();
    if (refresh) this.refreshAll(result.state, result.phase);

    // 任何状态变更都可能改写工具栏可用态（撤回栈 / 选中 / 进度 / 提示可行性）
    this.updateToolbarState();
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

  /** 手势层冻结查询：通关动画 / 确认框期间一切输入停摆（core 的 isInputFrozen 同口径） */
  private isFrozen(): boolean {
    const phase = this.gameSession?.getPhase();
    return phase === 'WinAnimating' || phase === 'Completed' || this.dialogOpen;
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

  // ───────────────────────── M2-2 工具栏（代码注入 SafeAreaRoot） ─────────────────────────

  /**
   * 创建工具栏节点并挂到 `SafeAreaRoot`（覆盖整屏的手势根，来自 `DragController`），
   * 置于最底层（棋盘/托盘/预览/成功层之下，确认框之上）。接好四个按钮回调后显示。
   *
   * 不手改场景 JSON（`__type__` 编码易碎），改由代码建节点 + `addComponent`，
   * 与 `SuccessOverlay` 的「代码建 UI」范式一致。
   */
  private buildToolbar(): void {
    const root = this.dragController?.gestureRoot ?? this.node;
    const node = new Node('ToolbarView');
    node.layer = root.layer;
    root.addChild(node);
    node.setSiblingIndex(0); // 最底层：不遮挡棋盘/托盘/成功浮层

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(UI_DESIGN_WIDTH, UI_TOOLBAR_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);
    node.setPosition(0, UI_TOOLBAR_BAND_CENTER_Y, 0);

    const toolbar = node.addComponent(ToolbarView);
    toolbar.onUndo = () => this.handleIntent({ type: 'undo' });
    toolbar.onRotate = () => {
      const sel = this.gameSession?.getState().selectedId;
      if (sel != null) this.handleIntent({ type: 'rotate', itemId: sel });
    };
    toolbar.onReset = () => this.requestReset();
    toolbar.onHint = () => this.showHint();
    toolbar.show();
    this.toolbarView = toolbar;

    if (DEBUG) console.log('[GameController] 工具栏已注入 SafeAreaRoot');
    // 初始可用态（首关装配已完成，session 已建）
    this.updateToolbarState();
  }

  /**
   * 创建重置确认框节点并挂到 `SafeAreaRoot`，置于最顶层（遮罩盖住一切）。
   * 仅接回调，平时 `active=false` 不挡输入。
   */
  private buildDialog(): void {
    const root = this.dragController?.gestureRoot ?? this.node;
    const node = new Node('ConfirmDialog');
    node.layer = root.layer;
    root.addChild(node); // 末尾追加 → 最顶层（盖住成功浮层与工具栏）

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(UI_DESIGN_WIDTH, UI_DESIGN_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);

    const dialog = node.addComponent(ConfirmDialog);
    dialog.onConfirm = () => this.confirmReset();
    dialog.onCancel = () => this.cancelReset();
    this.confirmDialog = dialog;
  }

  /**
   * 创建「装不下」非阻断提示条节点并挂到 `SafeAreaRoot`，置于最顶层。
   *
   * 与 `buildDialog` 同构但**刻意不注册任何触摸监听、不 `propagationStopped`**
   * （见 `Toast.ts` 头部约束）：Cocos 把触摸派发给所有命中节点，整屏手势根
   * `SafeAreaRoot` 始终会收到事件，所以提示条出现的瞬间棋盘 / 托盘仍可拖拽
   * （UI Spec 13「提示出现时棋盘仍可操作」）。节点初始 `active=false`
   * （`Toast.onLoad`），`show()` 时才浮现。
   */
  private buildToast(): void {
    const root = this.dragController?.gestureRoot ?? this.node;
    const node = new Node('Toast');
    node.layer = root.layer;
    root.addChild(node); // 末尾追加 → 最顶层（盖住成功浮层与确认框，且不挡手势）
    this.toastView = node.addComponent(Toast);
    if (DEBUG) console.log('[GameController] 装不下提示条已注入 SafeAreaRoot');
  }

  /** 重算工具栏四个按钮的可用态（由当前 session 状态推出） */
  private updateToolbarState(): void {
    const session = this.gameSession;
    const toolbar = this.toolbarView;
    if (session === null || toolbar === null) return;

    const state = session.getState();
    const selectedId = state.selectedId;
    const selectedRotatable =
      selectedId !== null && findItem(session.level, selectedId)?.rotatable === true;
    const hintAvailable = suggestNextPlacement(session.level, state) !== null;

    toolbar.updateState({
      canUndo: session.canUndo,
      canRotate: selectedRotatable,
      canReset: state.placements.size > 0,
      canHint: hintAvailable,
    });
  }

  /** 工具栏「重置」→ 弹确认框（UI Spec 149：二次确认） */
  private requestReset(): void {
    this.dialogOpen = true;
    this.confirmDialog?.show();
  }

  private confirmReset(): void {
    this.dialogOpen = false;
    this.confirmDialog?.hide();
    // reset 在 WinAnimating/Completed 期被会话冻结（防误触抹掉通关态）；此处是
    // 正常游玩中的明确意图，正常走 dispatch
    this.handleIntent({ type: 'reset' });
  }

  private cancelReset(): void {
    this.dialogOpen = false;
    this.confirmDialog?.hide();
  }

  /** 工具栏「提示」→ 用 core 的 `suggestNextPlacement` 高亮下一步落点（UI Spec 152 免费提示） */
  private showHint(): void {
    const session = this.gameSession;
    if (session === null) return;
    const suggestion = suggestNextPlacement(session.level, session.getState());
    if (suggestion === null) return;

    this.boardView?.showHint(suggestion.cells);
    this.trayView?.highlightHint(suggestion.itemId);
    if (DEBUG) {
      console.log(
        `[GameController] 提示：${suggestion.itemId} → (${suggestion.row},${suggestion.col})` +
          ` rot=${suggestion.rotation}`,
      );
    }

    // 兜底自动清除（玩家一有状态变更也会在 afterDispatch 立即清除）
    if (this.hintClearCallback !== null) this.unschedule(this.hintClearCallback);
    this.hintClearCallback = () => this.clearHint();
    this.scheduleOnce(this.hintClearCallback, UI_HINT_AUTO_CLEAR_MS / 1000);
  }

  /** 清除提示高亮（棋盘格 + 托盘槽位），并取消待执行的自动清除超时 */
  private clearHint(): void {
    this.boardView?.clearHint();
    this.trayView?.clearHint();
    if (this.hintClearCallback !== null) {
      this.unschedule(this.hintClearCallback);
      this.hintClearCallback = null;
    }
  }
}
