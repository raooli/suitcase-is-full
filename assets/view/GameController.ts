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
 * M1-7 起 `level-cleared` 在这里接上 `SuccessOverlay`；M2-9 起同一张事件表
 * 还驱动音效（`AudioAdapter`：放得下 / 放不下 / 通关 / 选中）。
 *
 * 挂载点：`Game.scene` 的 `GameRoot` 节点（与官方 2D 模板 taxi 的 `GameRoot`
 * 同一形状；Scene 根节点上不带组件，这是引擎示例的既有惯例）。
 */

import { _decorator, Component, JsonAsset, Node, UITransform, director, Color, EventTouch, Graphics } from 'cc';
import { DEBUG } from 'cc/env';

import {
  GameSession,
  GuideMemory,
  LevelDataError,
  findItem,
  guideKindOf,
  guideLearnedBy,
  itemAtCell,
  levelIdsOf,
  markCleared,
  parseLevelBundle,
  rotateBy,
  setLearnedLevels,
  suggestNextPlacement,
  UI_DESIGN_HEIGHT,
  UI_DESIGN_WIDTH,
  UI_HINT_AUTO_CLEAR_MS,
  UI_HEADER_HEIGHT,
  UI_PALETTE,
  UI_SAFE_MARGIN,
  UI_TOOLBAR_BAND_CENTER_Y,
  UI_TOOLBAR_BUTTON_HEIGHT,
  UI_TOOLBAR_BUTTON_WIDTH,
  UI_TOOLBAR_HEIGHT,
  UI_WIN_BOUNCE_MS,
  UI_WIN_LID_MS,
  UI_WIN_SETTLE_MS,
} from '../core';
import type {
  BoardSpec,
  GameEvent,
  GuideKind,
  Intent,
  LevelSpec,
  LevelState,
  SaveDataV1,
  SessionResult,
} from '../core';
import { loadProgress, saveProgress } from './storage';
import { takePendingLevel } from './route';
import { audio } from './AudioAdapter';
import { BoardView } from './BoardView';
import { ConfirmDialog } from './ConfirmDialog';
import { boxRectIn, centerRectIn } from './designRect';
import type { DesignRect } from './designRect';
import { DragController } from './DragController';
import { GuideOverlay } from './GuideOverlay';
import type { GuideRequest } from './GuideOverlay';
import { ItemLayer } from './ItemLayer';
import { PreviewLayer } from './PreviewLayer';
import { preloadFrames } from './propAssets';
import { SuitcaseLid } from './SuitcaseLid';
import { SuccessOverlay } from './SuccessOverlay';
import { ToolbarView } from './ToolbarView';
import { Toast } from './Toast';
import { TrayView } from './TrayView';

const { ccclass, property } = _decorator;

/** `level-cleared` 事件形状（M2-10 庆祝序列的暂存态用） */
type LevelClearedEvent = Extract<GameEvent, { type: 'level-cleared' }>;

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

  /**
   * 行李箱合盖（M2-10 庆祝序列第二段）。运行时代码注入 SafeAreaRoot，
   * 插在通关浮层**正下方**（盖住棋盘、不盖浮层）。大小问 `boardView`。
   */
  private suitcaseLid: SuitcaseLid | null = null;

  /** 底部工具栏（M2-2）：撤回 / 旋转 / 重置 / 提示。运行时代码注入 SafeAreaRoot */
  private toolbarView: ToolbarView | null = null;

  /** 重置二次确认框（M2-3）：运行时代码注入 SafeAreaRoot，置于最顶层 */
  private confirmDialog: ConfirmDialog | null = null;

  /** 「装不下」非阻断提示条（M2-4）：运行时代码注入 SafeAreaRoot，置于最顶层 */
  private toastView: Toast | null = null;

  /** 首次引导层（M2-6）：运行时代码注入 SafeAreaRoot，夹在工具栏与确认框之间 */
  private guideOverlay: GuideOverlay | null = null;

  /**
   * 引导记忆：「本关已学会后不再弹出」（UI Spec 7）。
   *
   * M2-8 起与进度同命名空间持久化：① `onLoad` 用 `loadProgress().learnedLevelIds`
   * 经 `restore()` 灌入（杀进程后「已学会」仍在）；② 学会时 `setLearnedLevels`
   * + `saveProgress` 落盘。`GuideMemory` 仍只在内存里跑逻辑，`learnedLevels()` /
   * `restore()` 是它与存档的两个对接方向。
   */
  private guideMemory = new GuideMemory();

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
    this.wireSuccessOverlay();
    // M2-2 工具栏 / M2-6 引导层 / M2-3 确认框 / M2-4 提示条：运行时代码注入
    // SafeAreaRoot（场景 JSON 的 `__type__` 编码易碎，故不手改场景，改由代码
    // 建节点 + addComponent）。
    //
    // **必须在 `startLevel` 之前建好**：首关的首次引导由 `startLevel` 触发，
    // 那时得有挂载点（M2-6 之前这几行在 startLevel 之后，引导层一加就会踩到）。
    // 层序 = 工具栏 → 引导 → 确认框 → 提示条（后者盖住前者；引导要压暗工具栏，
    // 但确认框与提示条都不该被压暗）。
    this.buildToolbar();
    this.buildGuide();
    this.buildDialog();
    this.buildToast();
    this.buildBackButton();
    // M2-10 合盖放在浮层之后建：它的兄弟序要紧盯浮层（见 buildLid）
    this.buildLid();

    // M2-7：若从首页带「要进哪一关」进来（route 模块单例），覆盖场景属性里的
    // levelId；没有（直接预览 Game 场景 / 旧链路）则按场景属性默认（首关）。
    const pending = takePendingLevel();
    if (pending !== null) this.levelId = pending;

    // M2-8：把存档里的「已学会引导」灌进内存记忆，必须在 `startLevel` 之前——
    // 首关首次引导是否弹出由它决定，灌晚了会漏弹或错弹。
    this.guideMemory.restore(loadProgress().learnedLevelIds);

    // M2-9：静音态从存档灌入音效适配器（AC18 重启保持；Home 的开关写的同一字段）。
    // 与 guide restore 并列：两者都是「存档 → 本场景运行态」的恢复，早于 startLevel。
    audio.setMuted(loadProgress().muted);

    // 装配与"换一关"是同一条路径（M2-1）：首启就是载入第 `levelId` 关
    this.startLevel(this.levelId);
  }

  /**
   * 离开 Game 场景（返回首页 / 进下一关）时的收尾（M2-9）。
   *
   * `audio` 是跨场景单例，正在响的音效（最长 340ms 的通关钟）不该拖到下一个
   * 场景的耳朵里；单例的静音态与 AudioContext 本身保留（不重建）。
   */
  protected override onDestroy(): void {
    audio.stopAll();
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
    // M4-5a：预热本关物品的真图（只发起不等待——首关首批节点可能赶上在飞
    // 加载，晚到的帧由 ItemLayer/TrayView 的 ensureFrame 回调补上，
    // 见 propAssets.ts 文件头「晚到帧」条）
    preloadFrames(level.items.map((item) => item.itemType));
    this.refreshAll(session.getState(), session.getPhase());
    this.successOverlay?.hide();
    // M2-10：合盖层复位（停动画、藏节点）——上一场的盖板不能留到这一场
    this.suitcaseLid?.reset();
    // 工具栏可用态随关卡刷新（首关 / 换关后重算）
    this.updateToolbarState();
    // 首次引导（M2-6）：**放在 refreshAll 之后**——引导要圈住托盘槽位与棋盘格，
    // 那两个节点得先存在。换关 / 重开都走这里，学会过或无关引导的关会自己收起。
    this.maybeShowGuide();

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
    // M2-10：庆祝序列前两段的动作转给对应的视图组件（序列的编排与计时仍在
    // SuccessOverlay——它按 config 的 UI_WIN_* 常量数时间，这里只出"手"）
    overlay.onBounceLastItem = (itemId) => {
      this.itemLayer?.bounceItem(itemId, UI_WIN_BOUNCE_MS);
    };
    overlay.onCloseLid = () => {
      this.suitcaseLid?.close(UI_WIN_LID_MS);
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

    // M2-6：引导**可跳过**——玩家一动手就收起（UI Spec 14），但**不记学会**：
    // 规格写的是"已学会后不再弹出"，手一抖点掉引导不该让人永久失去这次教学。
    //
    // 两个刻意的例外：
    // - `move`：拖拽途中的连续事件，收起会让引导在第一帧就闪没（drop 之前必然
    //   有 grab，那时已经收过）；
    // - 第 3 关（rotate）的 `select`：**选中是"点旋转按钮"的前置步骤**，这时
    //   收起等于把教学掐断在半路——UI Spec 14 的"点击后即消失"指的是点了被教
    //   的那个东西。拖动 / 旋转 / 放入照常收起。
    if (this.guideOverlay?.isShowing === true && intent.type !== 'move') {
      const keepingForRotateStep = guideKindOf(this.levelId) === 'rotate' && intent.type === 'select';
      if (!keepingForRotateStep) this.guideOverlay.hide();
    }

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
    /** M2-10：通关事件暂存。序列在 refreshAll 之后启动（见 celebrateWin） */
    let pendingWin: LevelClearedEvent | null = null;
    for (const event of result.events) {
      switch (event.type) {
        case 'state-changed':
          break; // 信号本身不触发重画（见方法注释）
        case 'placement-committed':
          refresh = true;
          // M2-9：合法放置咔哒声（UI Spec 8）
          audio.play('place-ok');
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
          // M2-9：非法放置柔和提示声（UI Spec 8「不刺耳」）
          audio.play('place-fail');
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
          // M2-7 / M2-8：通关即落盘进度（解锁下一关 + 记录已通关），封顶到本包
          // 最后一关，避免越界解锁不存在的关。中途返回不记通关，故只在这里写。
          {
            const ids = levelIdsOf(this.levelJson?.json);
            const maxLevelId = ids.length ? Math.max(...ids) : event.levelId;
            const after = markCleared(loadProgress(), event.levelId, maxLevelId, Date.now());
            saveProgress(after);
            if (DEBUG) {
              console.log(
                `[GameController] 进度已保存：L${event.levelId} 通关 → 最高解锁 L${after.maxUnlockedLevelId}` +
                  ` / 已通关 ${after.clearedLevelIds.length} 关`,
              );
            }
          }
          // M2-9：成功扣锁声（UI Spec 8）。放在浮层入场之前——先有声、后有画面
          audio.play('success');
          // M2-10：**不在这里启动庆祝**——暂存，等 refreshAll 之后才 show()
          // （state-changed 被 unshift 到事件数组最前，此刻物品层还没重画，
          // 最后一件物品的节点不存在，回弹会打空。见 celebrateWin）
          pendingWin = event;
          break;
      }
    }

    // M2-9：选中轻点声（UI Spec 8）。**只认 `select` 意图**——`grab` 起拖不响
    // （那一下的反馈留给松手时的 place-ok），取消选中（itemId=null）也不响；
    // 「点已选中物品 = 旋转」走的是 rotate 意图，同样不响（规格只有四种音效）。
    if (intent.type === 'select' && intent.itemId !== null) {
      audio.play('select');
    }

    // M2-6：学会判定（UI Spec 7「本关已学会后不再弹出」）。判据问 core
    // （`guideDoneEventOf`：第 1 关 = 成功放入一件，第 3 关 = 成功旋转一次），
    // view 不自己解释事件含义。
    const guideKind = guideKindOf(this.levelId);
    if (guideKind !== null) {
      const learned = result.events.some((event) => guideLearnedBy(guideKind, event.type));
      if (learned && !this.guideMemory.isLearned(this.levelId)) {
        this.guideMemory.markLearned(this.levelId);
        this.guideOverlay?.hide();
        // M2-8：落地盘，与进度同命名空间（key `suitcase.progress.v1`）。
        // 读改存：先取当前全量存档再覆盖 learnedLevelIds，避免丢通关/解锁记录。
        saveProgress(setLearnedLevels(loadProgress(), this.guideMemory.learnedLevels(), Date.now()));
        if (DEBUG) {
          console.log(
            `[GameController] 引导已学会：L${this.levelId}（${guideKind}）→ 本关不再弹出`,
          );
        }
      }
    }

    // 归零放在 refreshAll **之前**：让重建本身就按 0 布局（不然会先按保留的旧偏移
    // 建一遍再跳回开头，日志/首帧都对不上）。此刻动作只改一个偏移字段，旧槽位随
    // 重建被清掉，不产生浪费的可见中间态。
    if (resetTrayScroll) this.trayView?.resetScroll();
    if (refresh) this.refreshAll(result.state, result.phase);

    // M2-10：庆祝序列在 refreshAll **之后**启动。state-changed 被 unshift 到
    // 事件数组最前，level-cleared 分支跑的时候物品层还是旧渲染——最后一件
    // 物品的节点要等这次重画才存在，提前 show() 会让回弹打空（庆祝第一段
    // 没画面），而日志/状态都是对的，只能靠截图对比发现。
    if (pendingWin !== null) this.celebrateWin(pendingWin);

    // 任何状态变更都可能改写工具栏可用态（撤回栈 / 选中 / 进度 / 提示可行性）
    this.updateToolbarState();
  }

  /**
   * 启动通关庆祝序列（M2-10 / UI Spec 5.3：回弹 → 合盖 → 星光面板 → 解冻）。
   *
   * 序列的编排与计时在 `SuccessOverlay`（按 `UI_WIN_*` 常量走），本方法只负责
   * 在对的时机调它：`refreshAll` 之后（物品节点已存在）。音效已在
   * `level-cleared` 分支先响过（M2-9「先声后画面」）。
   */
  private celebrateWin(event: LevelClearedEvent): void {
    if (DEBUG) {
      console.log(
        `[GameController] 庆祝序列启动：回弹 ${event.lastItemId}` +
          ` → 合盖 → 浮层（${UI_WIN_SETTLE_MS}ms 后按钮解冻）`,
      );
    }
    this.successOverlay?.show(event, this.hasNextLevel());
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
   * 「返回首页」按钮的可用闸门（M2-7 复审修正）。
   *
   * 只挡 `WinAnimating`（通关入场动画中）与 `dialogOpen`（确认框），**放行 `Completed`**。
   * 与 SuccessOverlay「动画播完、按钮才可用」同口径：浮层 settled、其自身按钮可用时，
   * 返回按钮也该可用。否则 `Completed` 是终态（不点「下一关 / 再来一次」不离开），
   * 返回键会被浮层一直压住；L10（`hasNextLevel()=false`、不显「下一关」）更只剩「再来
   * 一次」，回首页要绕「重开 L10 → 再返回」两步。
   *
   * 注意与 `isFrozen()` **故意不同**：后者仍含 `Completed`——棋盘输入在浮层期要继续
   * 冻结（防误触拖拽），只是「离开本关」这个明确意图不该被一起挡掉。
   */
  private canLeaveToHome(): boolean {
    const phase = this.gameSession?.getPhase();
    return phase !== 'WinAnimating' && !this.dialogOpen;
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

  /**
   * 返回首页按钮（M2-7：首页选关 ↔ 游戏互通）。
   *
   * 代码注入 SafeAreaRoot（与工具栏同范式），置于左上角信息带。点击 → 跳回首页。
   * 中途返回不写通关进度（只在 `level-cleared` 落盘）。
   *
   * **冻结口径（M2-7 复审修正）**：走 `canLeaveToHome()`——只挡 `WinAnimating` 与
   * `dialogOpen`，**放行 `Completed`**（与 SuccessOverlay「动画播完按钮才可用」同口径）。
   * 这样通关浮层期也能直接回首页，L10（无「下一关」）不再需要绕「再来一次」两步。
   */
  private buildBackButton(): void {
    const root = this.dragController?.gestureRoot ?? this.node;
    const node = new Node('BackButton');
    node.layer = root.layer;
    root.addChild(node);
    node.setPosition(
      -UI_DESIGN_WIDTH / 2 + UI_SAFE_MARGIN + 22,
      UI_DESIGN_HEIGHT / 2 - UI_HEADER_HEIGHT / 2,
      0,
    );

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(44, 44);
    transform.setAnchorPoint(0.5, 0.5);

    const g = node.addComponent(Graphics);
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceWhite);
    g.roundRect(-22, -22, 44, 44, 12);
    g.fill();
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
    g.lineWidth = 2;
    g.roundRect(-22, -22, 44, 44, 12);
    g.stroke();
    // 返回箭头（向左的「‹」）
    g.lineWidth = 3;
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.textPrimary);
    g.moveTo(6, -8);
    g.lineTo(-6, 0);
    g.lineTo(6, 8);
    g.stroke();

    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => (e.propagationStopped = true), this);
    node.on(
      Node.EventType.TOUCH_END,
      (e: EventTouch) => {
        e.propagationStopped = true;
        // M2-7 复审：放行 Completed（通关浮层 settled 后可直接回首页，L10 也有出口），
        // 仍挡 WinAnimating（入场动画中）与 dialogOpen（确认框）。见 canLeaveToHome。
        if (!this.canLeaveToHome()) return;
        if (DEBUG) console.log('[GameController] 返回首页');
        director.loadScene('Home');
      },
      this,
    );
  }

  // ───────────────────────── M2-10 行李箱合盖（代码注入 SafeAreaRoot） ─────────────────────────

  /**
   * 创建合盖节点并挂到 `SafeAreaRoot`，插在通关浮层**正下方**。
   *
   * 层序要求：盖板要盖住棋盘/托盘/预览（同辈里排在它们之后），又不能盖住
   * 浮层遮罩（遮罩还得盖住它）——所以锚定浮层节点的兄弟序，往上插一位。
   * 与工具栏/引导/确认框同范式代码注入，不手改场景 JSON。
   *
   * 盖板**不挂任何触摸监听**：合盖只发生在 `WinAnimating` 冻结期，输入已被
   * 双重挡下（`DragController.inputFrozen` + core `isInputFrozen`）。
   */
  private buildLid(): void {
    const root = this.dragController?.gestureRoot ?? this.node;
    const node = new Node('SuitcaseLid');
    node.layer = root.layer;
    root.addChild(node);

    // 插到浮层正下方：以浮层节点的当前兄弟序为锚（onLoad 里 buildLid 跑在
    // 所有注入之后，此时序稳定）。取不到浮层（场景没挂 SuccessOverlay）时
    // 退到末尾——那种配置下庆祝序列本来也跑不起来，层序错只是不挡遮罩。
    const overlayIndex = this.successOverlay?.node.getSiblingIndex();
    node.setSiblingIndex(overlayIndex ?? root.children.length);

    const lid = node.addComponent(SuitcaseLid);
    lid.boardView = this.boardView;
    this.suitcaseLid = lid;

    if (DEBUG) console.log('[GameController] 合盖层已注入 SafeAreaRoot（浮层之下）');
  }

  // ───────────────────────── M2-6 首次引导（代码注入 SafeAreaRoot） ─────────────────────────

  /**
   * 创建引导层节点并挂到 `SafeAreaRoot`，夹在工具栏与确认框之间。
   *
   * 与 `buildToast` 同构：**不注册任何触摸监听、不 `propagationStopped`**
   * （见 `GuideOverlay.ts` 头部约束）——引导层是整屏遮罩，一旦吃掉事件，
   * "引导出现时棋盘仍可被拖拽 / 玩家拖动或点击即跳过"（UI Spec 5.2·14）就废了。
   * 节点初始 `active=false`（`GuideOverlay.onLoad`）。
   */
  private buildGuide(): void {
    const root = this.dragController?.gestureRoot ?? this.node;
    const node = new Node('GuideOverlay');
    node.layer = root.layer;
    root.addChild(node); // 追加在工具栏之后、确认框与提示条之前
    this.guideOverlay = node.addComponent(GuideOverlay);
    if (DEBUG) console.log('[GameController] 首次引导层已注入 SafeAreaRoot');
  }

  /**
   * 载入关卡后决定弹不弹引导（M2-6）。
   *
   * 三条出口：① 这一关没有引导 / ② 已学会 → **收起**（换关到无关卡时必须显式
   * 收，否则上一关的引导会残留到下一关）；③ 该弹 → 组装洞与手指路径后显示。
   */
  private maybeShowGuide(): void {
    const overlay = this.guideOverlay;
    const session = this.gameSession;
    if (overlay === null || session === null) return;

    const levelId = session.level.levelId;
    const kind = guideKindOf(levelId);
    if (kind === null || !this.guideMemory.shouldShow(levelId)) {
      if (DEBUG && kind !== null) {
        // 有关引导但已学会：取证用（首进该关应看到「引导显示」，重启后再进应看到「引导跳过」）
        console.log(`[GameController] 引导跳过：L${levelId} 已学会（不弹）`);
      }
      overlay.hide();
      return;
    }

    const request = this.buildGuideRequest(kind, session);
    if (request === null) {
      overlay.hide();
      return;
    }
    if (DEBUG) console.log(`[GameController] 引导显示：L${levelId}（${kind}）`);
    overlay.show(request);
  }

  /**
   * 组装一次引导请求：要挖洞高亮哪些区域、手指从哪走到哪。
   *
   * - **拖拽型（第 1 关）**：高亮"托盘里的下一件"+"它该去的格子"，手指演示
   *   这条路径（GDD 3.1）。落点**不查硬编码的标准解**，而是复用工具栏「提示」
   *   用的同一个纯函数 `suggestNextPlacement`——引导与提示必须是同一个答案，
   *   各算一份就会出现"引导指这格、提示指那格"。
   * - **点击型（第 3 关）**：只高亮「旋转」按钮，手指在按钮上做点按循环
   *   （UI Spec 5.2「第 3 关首次进入展示点击旋转按钮引导」）。GDD 3.3 的
   *   "优先引导 `L03_D`"是内容层面的意图（那件长柄伞必须转才能放），视觉引导
   *   按 UI Spec 指向按钮。
   *
   * @returns `null` = 定位不到目标（缺节点 / 没有可用落点）→ 调用方收起引导，
   *   降级而不报错（引导是锦上添花，绝不能因为定位失败挡住开局）。
   */
  private buildGuideRequest(kind: GuideKind, session: GameSession): GuideRequest | null {
    const root = this.dragController?.gestureRoot ?? this.node;
    const holes: DesignRect[] = [];

    if (kind === 'rotate') {
      const button = this.toolbarView?.rotateButtonNode() ?? null;
      if (button === null) return null;
      const rect = centerRectIn(
        root,
        button,
        UI_TOOLBAR_BUTTON_WIDTH,
        UI_TOOLBAR_BUTTON_HEIGHT,
      );
      if (rect === null) return null;
      holes.push(rect);
      return { kind, holes, from: null, to: [rect.x + rect.w / 2, rect.y + rect.h / 2] };
    }

    // 拖拽型：托盘里的下一件 + 它该去的格子
    const state = session.getState();
    const hint = suggestNextPlacement(session.level, state);
    const tray = this.trayView;
    const board = this.boardView;
    if (hint === null || tray === null || board === null) return null;

    const slot = tray.slotNodeOf(hint.itemId);
    const slotSize = tray.slotPixelSize();
    const trayRect = slot === null ? null : centerRectIn(root, slot, slotSize, slotSize);

    const box = board.cellsLocalBox(hint.cells, [hint.row, hint.col]);
    const boardRect = boxRectIn(root, board.node, box.cx, box.cy, box.w, box.h);

    if (trayRect !== null) holes.push(trayRect);
    if (boardRect !== null) holes.push(boardRect);
    if (holes.length === 0) return null;

    // 手指：托盘槽位中心 → 棋盘目标格中心（任一缺失就退化为"只画洞不画手指"）
    const from: [number, number] | null =
      trayRect === null ? null : [trayRect.x + trayRect.w / 2, trayRect.y + trayRect.h / 2];
    const to: [number, number] | null =
      boardRect === null ? null : [boardRect.x + boardRect.w / 2, boardRect.y + boardRect.h / 2];

    return { kind, holes, from, to };
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
    this.guideOverlay?.hide(); // 开确认框前收起引导（与 showHint 同处理：非 dispatch 的 view 动作也收起引导）
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
    // 引导出现时点「提示」= 玩家已动手（UI Spec 14「点击后即消失」）→ 收起引导，
    // 避免提示高亮被引导蒙层压暗（二者同源、仅视觉冗余，M2-6 收尾修复）
    this.guideOverlay?.hide();
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
