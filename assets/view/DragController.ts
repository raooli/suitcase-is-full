/**
 * 拖拽手势 → 意图流（实施计划 M1-4）。
 *
 * ## 本组件做什么 / 不做什么
 *
 * **做**：把一次触摸生命周期（`start → move → end/cancel`）翻译成 Intent 序列
 * `grab → move* → drop|cancel|removeToTray`，交给 `onIntent`。
 *
 * **不做**：
 * - 不碰 `GameSession`、不读 `LevelState`、不改任何状态（M1-6 起由调用方接到
 *   `session.dispatch`，但那是 `onIntent` 回调里的事，本组件仍不持有会话）；
 * - 不做格算术——像素→格一律走 `BoardView.snapToGrid()`（R-A6 / TDD 8.3 铁律 2）；
 * - 不做合法性判定——"能不能放"是 core 的事，这里只报"手指想放哪"。
 *
 * ## grabOffset 语义（本组件的命门）
 *
 * 抓取那一刻记下 `offset = 手指格 - 物品锚点`，整个 move 保持不变，
 * 于是 `anchor = 手指格 - offset`（算术在 `core/geometry/drag.ts`，有单测）。
 * 效果是**被手指压住的那一格始终跟着手指**——这是 T1/T2 的本质，
 * 写成"物品中心对准手指"会让抓边角的物品整体跳半格。
 *
 * ## 点 vs 拖的手势仲裁
 *
 * 托盘的"点选"（M1-3）和"拖起"（本任务）共用同一次 touchstart，所以位移没超过
 * `UI_DRAG_THRESHOLD_PX` 一律**不算拖拽**（一个意图都不发），改为在松手时走
 * `onTap`。**仲裁只此一处**——若拆到两个组件各判一次，拖完松手会顺带选中一下，
 * 而"点选"和"起拖"共用 touchstart 决定了这种双发必然发生。
 *
 * M2-11 起多出第三种手势：**托盘横向滚动**（滑）。三者仍共用同一次 touchstart、
 * 仲裁仍只此一处：过阈值后按**主轴方向**分——水平为主、在托盘带内起手且托盘可滚
 * → 滑托盘（一个意图都不发）；否则维持原来的"起拖 / 点选"。托盘在底部、把物品
 * 拖上棋盘天然是纵向为主，故"滑"与"抓"方向不冲突。
 *
 * M2-5 起多出第四种**收尾语义**：取出（PRD R-06b）。起拖之后松手发什么意图，
 * 由「取出态」谓词决定（`isTakeoutState`：手指在托盘带内 **或** 物品中心出
 * 棋盘外扩半格）——盘上物品发 `removeToTray`（入撤回栈），托盘物品发 `cancel`
 * （无操作回巢），其余发 `drop`。**预览与松手共用同一个谓词**：玩家看着
 * 取出态松手就必须取出，否则"预览切换"这条规则形同不存在（UI Spec 6 原话）。
 *
 * 同理，触摸监听也只挂在本组件的 `gestureRoot` 上（`TraySlot`/`TrayView` 都不挂）：
 * 谁认领触摸，谁就得在松手时还能被手指命中，否则引擎给的是 `TOUCH_CANCEL`
 * （见 `gestureRoot` 的注释）。
 */

import { Component, EventTouch, Node, UITransform, Vec3, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_DRAG_THRESHOLD_PX,
  anchorForPointerCell,
  grabOffsetForBoardCell,
  grabOffsetFromRatio,
  sameRC,
} from '../core';
import type { DragPreview, Intent, RC } from '../core';
import { BoardView } from './BoardView';
import type { TrayHit } from './TrayView';
import { TrayView } from './TrayView';

const { ccclass, property } = _decorator;

/** 起拖前的候选：已确定抓的是哪件、偏移多少，但还没过阈值 */
interface PendingGrab {
  readonly itemId: string;
  readonly offset: RC;
  readonly from: 'tray' | 'board';
}

@ccclass('DragController')
export class DragController extends Component {
  @property(BoardView)
  boardView: BoardView | null = null;

  @property(TrayView)
  trayView: TrayView | null = null;

  /**
   * 手势监听挂在哪一层。必须是**覆盖整屏**的节点（场景里接 `SafeAreaRoot`）。
   *
   * 为什么不能挂在 Board/Tray 上：Cocos 在"手指移出认领触摸的那个节点"时派发的是
   * **TOUCH_CANCEL 而不是 TOUCH_END**（本轮实测：从托盘拖向棋盘，中途收到
   * TOUCH_CANCEL，END 一次都没来）。而拖拽天然要跨越托盘与棋盘两个区域，
   * 所以监听必须落在手指永远出不去的那层。
   */
  @property(Node)
  gestureRoot: Node | null = null;

  /**
   * 意图出口。**M1-6 起由 `GameController` 接到 `session.dispatch`**——
   * 事件分发（重绘 / 回弹 / Toast 挂点）在调用方的 `handleIntent` 里做，
   * 本组件只负责把"手指想干什么"翻译成意图。
   *
   * 之所以留成回调而不是在这里直接 dispatch：本组件因此不需要知道会话的存在，
   * 意图的去向（真 dispatch / 测试挂具 / 录制回放）是调用方一行的事。
   */
  onIntent: ((intent: Intent) => void) | null = null;

  /**
   * 棋盘命中查询：这一格属于哪件已放置的物品（给回它的**锚点**）。
   * 由 `GameController` 注入（读 `session.getState().placements` + core 的 `itemAtCell`），
   * 本组件不持有状态副本。
   */
  boardItemAt: ((row: number, col: number) => { readonly itemId: string; readonly anchor: RC } | null) | null = null;

  /**
   * **点击**出口（本次触摸没过阈值 → 不是拖拽）。参数是命中的托盘物品 id，
   * 点在托盘空白处则是 `null`（UI Spec 6 节：取消高亮回 Idle）。
   *
   * 只在"手指落在托盘带内"时才发——点在棋盘上不该顺手取消选中，
   * 那是 M1-5/M1-6 的事，现在不越界。
   */
  onTap: ((itemId: string | null) => void) | null = null;

  /**
   * **当前预览的读取口（M1-5 是 `previewProvider` 挂具，M1-6 起接
   * `session.getPreview()`）**。grab/move 的意图已同步 dispatch 进 session
   * （`onIntent` 在 `emitPreview` 之前跑），所以这里读到的一定是最新预览。
   *
   * 之所以是回调而不是直接读 session：本组件因此不持有 `GameSession`，
   * 换数据源（挂具 → session）是调用方一行的事。
   */
  previewSource: (() => DragPreview | null) | null = null;

  /**
   * 输入冻结查询（M1-6 接，M1-7 通关动画期间真正生效）。
   * 返回 true 时本组件连 `pending` 都不建——手势层立刻冻结，
   * 不依赖 core 的 `isInputFrozen()` 兜底（那是第二道防线，两者都要有）。
   */
  inputFrozen: (() => boolean) | null = null;

  /**
   * 取出判定（M2-5，PRD R-06b / TDD 7.3 / O11）：被拖物品的**中心**是否已出
   * 「棋盘包围盒外扩半格」。由 `GameController` 接 `BoardView.isTakeout`——
   * 格→像素换算是 BoardView 的独家职责（R-A6），本组件不做格算术。
   *
   * 与「手指在托盘带内」一起合成**取出态**（见 `isTakeoutState`）。两者取
   * 并集而不是只用中心：
   * - 中心出界是规格原文的判定（「物品中心越过棋盘外边界」）；
   * - 手指进托盘带是玩家"拖回托盘"的明确意图，且**不受抓取偏移影响**——
   *   抓小物品边角时中心会滞后于手指约一格，只看中心的话玩家得把物品拖到
   *   托盘最底部才能取出，那是反直觉的。
   */
  outsideBoard: ((preview: DragPreview) => boolean) | null = null;

  /**
   * 预览显示出口：锚点变化**或手指位置变化**时调（后者也会改变取出态——
   * 进/出托盘带不改变锚点）。第二个参数 `takeout === true` = **取出态**
   * （UI Spec 6：物品半透明 + 托盘目标位高亮，禁止红色非法）。
   */
  onPreview: ((preview: DragPreview | null, takeout: boolean) => void) | null = null;

  /**
   * 松手收尾出口。`invalid === true` = 非法松手（放不下），`PreviewLayer` 据此
   * 抖一下 ghost 再清；其余情况（合法 / 取出 / 取消）直接清。
   */
  onPreviewEnd: ((invalid: boolean) => void) | null = null;

  private pending: PendingGrab | null = null;
  private dragging = false;
  private lastAnchor: RC | null = null;
  private startX = 0;
  private startY = 0;
  /** 本次触摸是否已被判成拖拽（点/拖互斥的唯一依据） */
  private consumedByDrag = false;
  /**
   * 本次手势是否起始于输入冻结期。
   *
   * 冻结判定**只在按下这一刻**做一次，之后整段手势（move/end/cancel）都据此
   * 作废——即便中途解冻也按"这次按下不作数"处理。通关动画只有 360ms，一个
   * 慢手势完全可能按下时冻结、松手时已解冻：那时补发意图等于在玩家刚看到的
   * 结算画面上偷偷改状态。
   */
  private gestureFrozen = false;
  /** 最近一次喂给 `onPreview` 的预览（松手时据此判要不要抖） */
  private lastPreview: DragPreview | null = null;
  /**
   * 横向滚动中（M2-11）：本段手势已定性为"滑托盘"——不发任何意图、松手不算点击。
   * 与 `dragging`（抓物品）互斥，任一为真另一个必为假。
   */
  private scrolling = false;
  /** 滚动起始：按下点的 x 与该刻托盘偏移（据此算增量平移） */
  private scrollStartX = 0;
  private scrollStartOffset = 0;

  /**
   * 监听挂在 `gestureRoot`（覆盖整屏的 SafeAreaRoot）上。
   *
   * 两条实测约束共同决定了这个位置：
   * - 全局 `input.on(Input.EventType.TOUCH_START)` 在 3.8.8 web-mobile 构建里
   *   **收不到事件**（onEnable 正常、枚举值正确，但回调一次都没进）；
   * - 节点级监听在手指移出该节点时会收到 TOUCH_CANCEL 而非 TOUCH_END。
   *
   * 所以取"覆盖整屏的节点 + 节点级监听"：手指出不去，就不会被 cancel 打断。
   */
  override onEnable(): void {
    for (const node of this.listenerNodes()) {
      node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
      node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
      node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
      node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }
    if (DEBUG) {
      const root = this.gestureRoot;
      const transform = root?.getComponent(UITransform) ?? null;
      const size = transform === null ? null : transform.contentSize;
      console.log(
        `[DragController] 手势监听已挂在 ${root?.name ?? 'null'}` +
          `（${size === null ? '无 UITransform' : `${Math.round(size.width)}×${Math.round(size.height)}`}）` +
          ` boardView=${this.boardView === null ? 'null' : 'ok'}` +
          ` trayView=${this.trayView === null ? 'null' : 'ok'}`,
      );
    }
  }

  override onDisable(): void {
    for (const node of this.listenerNodes()) {
      node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
      node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
      node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
      node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }
  }

  private listenerNodes(): Node[] {
    if (this.gestureRoot !== null) return [this.gestureRoot];
    console.error(
      '[DragController] 未接 gestureRoot（应为覆盖整屏的 SafeAreaRoot）：' +
        '手势监听无处可挂，拖拽不可用',
    );
    return [];
  }

  /** 手势仲裁结果：本次触摸是否已被判成拖拽（供外部查询，如 M1-5 预览层） */
  get consumedAsDrag(): boolean {
    return this.consumedByDrag;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  // ───────────────────────── 触摸生命周期 ─────────────────────────

  private onTouchStart(event: EventTouch): void {
    // 归零先行：这些标志跨手势存活，不清就让本次手势拿上一次的结论做判断。
    // 冻结分支也必须走这里——不能靠"上一次拖拽留下的 consumedByDrag=true"
    // 去挡冻结期 touchend 的 select tap（那是碰巧正确，不是设计）
    this.beginGesture();

    // 通关动画期间冻结一切输入（M1-7 的 SuccessOverlay 播出时）
    this.gestureFrozen = this.inputFrozen?.() === true;
    if (this.gestureFrozen) return;

    const ui = event.getUILocation();
    this.startX = ui.x;
    this.startY = ui.y;

    this.pending = this.pickAt(ui.x, ui.y);

    if (DEBUG) {
      console.log(
        `[DragController] touch (${Math.round(ui.x)},${Math.round(ui.y)})` +
          ` → ${this.pending === null ? '未命中任何物品' : `命中 ${this.pending.itemId}（${this.pending.from}）`}`,
      );
    }
  }

  private beginGesture(): void {
    this.consumedByDrag = false;
    this.pending = null;
    this.dragging = false;
    this.lastAnchor = null;
    this.lastPreview = null;
    this.gestureFrozen = false;
    this.scrolling = false;
    this.scrollStartX = 0;
    this.scrollStartOffset = 0;
  }

  private onTouchMove(event: EventTouch): void {
    if (this.gestureFrozen) return;

    const ui = event.getUILocation();

    // 已在横向滚动中（M2-11）：只更新托盘偏移，一个意图都不发
    if (this.scrolling) {
      this.applyScroll(ui.x);
      return;
    }

    const dx = ui.x - this.startX;
    const dy = ui.y - this.startY;

    // 阈值仲裁：没过阈值就还是"点击"，一个意图都不发
    if (!this.dragging) {
      if (Math.hypot(dx, dy) < UI_DRAG_THRESHOLD_PX) return;
      // 滑托盘 vs 抓物品（M2-11）：过阈值后按主轴方向分。放在 pending 判定之前，
      // 托盘空白处也能滑（手机上滑一排卡片不看卡片本身）。见文件头"点/拖/滑仲裁"
      if (this.tryBeginScroll(dx, dy, ui.x)) return;
      if (this.pending === null) return;
      this.beginDrag(ui.x, ui.y);
    }

    if (!this.dragging || this.pending === null) return;
    this.emitMoveIfChanged(ui.x, ui.y);
  }

  private onTouchEnd(event: EventTouch): void {
    // 冻结期起的手势：一个意图都不发（见 `gestureFrozen` 的说明）
    if (this.gestureFrozen) {
      this.reset();
      return;
    }

    // 滑托盘收尾（M2-11）：滚动不产生任何意图，也不该被当成一次点击
    if (this.scrolling) {
      this.reset();
      return;
    }

    const ui = event.getUILocation();
    // 取出态（M2-5）：松手位置 + 当前预览一起判。预览与松手共用同一谓词，
    // 保证"预览显示的态就是松手的结果"（UI Spec 6）
    const takeout =
      this.dragging &&
      this.pending !== null &&
      this.isTakeoutState(this.previewSource?.() ?? null, ui.x, ui.y);

    if (this.dragging && this.pending !== null) {
      if (takeout) {
        // 拖出棋盘：盘上物品 → 取出（PRD R-06b，入撤回栈、保留朝向）；
        // 托盘物品 → 无操作回巢（PRD 4.4 表：不产生状态变化、不入栈、无动画）
        this.emit(
          this.pending.from === 'board'
            ? { type: 'removeToTray', itemId: this.pending.itemId }
            : { type: 'cancel' },
        );
      } else {
        // 盘内（含外扩半格缓冲带）：合法 → 落位；非法 → core 拒收并回弹
        this.emit({ type: 'drop' });
      }
    } else if (!this.consumedByDrag) {
      // 没过阈值 → 这是一次点击，不是拖拽
      this.emitTap(ui.x, ui.y);
    }
    // 预览收尾：非法松手（盘内且放不下）才抖一下；取出 / 取消 / 合法 / 纯点击都直接清
    const invalid = !takeout && this.lastPreview !== null && !this.lastPreview.check.ok;
    this.onPreviewEnd?.(invalid);
    this.reset();
  }

  /**
   * 引擎在"松手点不在认领触摸的节点内"时派发的是 `TOUCH_CANCEL`。
   * 挂在覆盖整屏的 `gestureRoot` 上之后这不该发生；真发生了就老实报 `cancel`——
   * **不猜测落点**（猜出来的落点会让"放不下"变成"放错位置"，比取消更难查）。
   */
  private onTouchCancel(): void {
    if (this.gestureFrozen) return;
    // 滑托盘被 cancel：没有物品在拖，直接收尾（不发 cancel 意图、不当点击）
    if (this.scrolling) {
      this.reset();
      return;
    }
    if (DEBUG) console.warn('[DragController] 收到 TOUCH_CANCEL：本次拖拽按取消处理');
    if (this.dragging) this.emit({ type: 'cancel' });
    this.onPreviewEnd?.(false);
    this.reset();
  }

  /**
   * 点击 → `onTap`。命中范围：**托盘优先、其次棋盘上的已放物品**（M1-8）。
   *
   * 复用 `pickAt`（与起拖同一套命中逻辑），这样"点已放物品选中它"和
   * "从棋盘抓起它"用的是同一个判定，不会出现"点得到却抓不起来"。
   *
   * 没点到任何物品时，只有**托盘带内**才算「取消选中」；点棋盘空白 / 页头 /
   * 工具栏一律不响应——沿用 M1-4 的决定：避免点棋盘顺手把选中弄丢
   * （UI Spec 允许点空白取消，但真机上"手滑点空白丢选中"比"选中退不掉"更烦）。
   */
  private emitTap(uiX: number, uiY: number): void {
    const pending = this.pickAt(uiX, uiY);
    if (pending !== null) {
      if (DEBUG) console.log(`[DragController] 点击 → 命中 ${pending.itemId}（${pending.from}）`);
      this.onTap?.(pending.itemId);
      return;
    }
    if (!this.overTray(uiX, uiY)) return;
    if (DEBUG) console.log('[DragController] 点击托盘空白 → 取消选中');
    this.onTap?.(null);
  }

  // ───────────────────────── 抓取与落点 ─────────────────────────

  /** 按下点 → 抓的是哪件物品、偏移多少。托盘优先（托盘在棋盘之外，不重叠） */
  private pickAt(uiX: number, uiY: number): PendingGrab | null {
    const world = new Vec3(uiX, uiY, 0);

    const trayHit = this.trayView?.hitTest(world) ?? null;
    if (trayHit !== null) {
      const offset = this.offsetInThumbnail(trayHit, world);
      return { itemId: trayHit.itemId, offset, from: 'tray' };
    }

    const board = this.boardView;
    if (board === null) return null;
    const local = this.toBoardLocal(uiX, uiY);
    if (local === null) return null;

    // 棋盘外（页头/工具栏）不算命中
    const transform = board.node.getComponent(UITransform);
    if (transform === null) return null;
    const size = transform.contentSize;
    if (Math.abs(local.x) > size.width / 2 || Math.abs(local.y) > size.height / 2) return null;

    const cell = board.localToGrid(local.x, local.y);
    const hit = this.boardItemAt?.(cell[0], cell[1]) ?? null;
    if (hit === null) return null;

    // offset 用 snapToGrid（round）而不是命中格：两者在格中心会差出一格，
    // 若用命中格算 offset，grab 后锚点 = snap(手指) - offset ≠ 原锚点，
    // 物品还没动 ghost 就先跳一格。用 snap 格则 grab 那一刻锚点恰好 = 原锚点，
    // "点哪抓哪、原地不跳"；命中判定用 floor 是 TDD 8.3 铁律 2 的本意
    //（"这一格有什么"是命中语义，snap 是锚点语义，两个口径各管各的）。
    const snapCell = board.snapToGrid(local.x, local.y);
    return {
      itemId: hit.itemId,
      offset: grabOffsetForBoardCell(hit.anchor, snapCell),
      from: 'board',
    };
  }

  /**
   * 托盘缩略图内的按下位置 → 格偏移。
   *
   * 物品节点的锚点在**左上角**且 `y` 向下为负，所以 `u = x/w`、`v = -y/h`。
   * 这里只用节点自己的 contentSize 取比例，**不是格算术**（没有 cellPx），
   * 缩略图被整体缩放过也不影响——`convertToNodeSpaceAR` 已经把缩放除掉了。
   */
  private offsetInThumbnail(hit: TrayHit, world: Vec3): RC {
    const transform = hit.node.getComponent(UITransform);
    if (transform === null) return [0, 0] as RC;

    const size = transform.contentSize;
    if (size.width <= 0 || size.height <= 0) return [0, 0] as RC;

    const local = transform.convertToNodeSpaceAR(world);
    return grabOffsetFromRatio(local.x / size.width, -local.y / size.height, hit.rows, hit.cols);
  }

  // ───────────────────────── 托盘横向滚动（M2-11） ─────────────────────────

  /**
   * 过阈值后尝试把本段手势定性为"滑托盘"。返回 `true` = 已进入滚动（调用方应直接
   * return，不再起拖、不发任何意图）。
   *
   * 三个条件同时满足才滚：
   * 1. 按下点在**托盘带内**（`overTray(startX, startY)`）——棋盘上的横向拖动仍是
   *    "抓已放物品"，不滚托盘；
   * 2. 位移以**水平为主**（`|dx| > |dy|`）——托盘在底部、把物品拖上棋盘是纵向为主，
   *    两个手势方向天然可分；
   * 3. 托盘**确有可滚范围**（`canScroll()`）——L1–L6 放得下，横向拖动仍按老规矩
   *    抓物品，行为零变化。
   */
  private tryBeginScroll(dx: number, dy: number, uiX: number): boolean {
    if (!this.overTray(this.startX, this.startY)) return false;
    if (Math.abs(dx) <= Math.abs(dy)) return false;
    if (this.trayView?.canScroll() !== true) return false;

    this.scrolling = true;
    // 与起拖同义：本段手势已定性，松手不再走 emitTap（不会误选中/取消选中）
    this.consumedByDrag = true;
    this.scrollStartX = this.startX;
    this.scrollStartOffset = this.trayView?.scrollOffset ?? 0;
    this.applyScroll(uiX);

    if (DEBUG) console.log(`[DragController] 滑托盘开始：起始 offset=${this.scrollStartOffset}px`);
    return true;
  }

  /**
   * 按手指水平位移平移托盘。手指左移（`dx<0`）露出后面的物品 → offset 增大
   * （容器 `content.x = -offset`）；越界由 `TrayView.setScrollOffset` 夹取。
   */
  private applyScroll(uiX: number): void {
    const tray = this.trayView;
    if (tray === null) return;
    tray.setScrollOffset(this.scrollStartOffset - (uiX - this.scrollStartX));
  }

  /** 过了阈值：正式起拖，发出 `grab` */
  private beginDrag(uiX: number, uiY: number): void {
    const pending = this.pending;
    if (pending === null) return;

    this.dragging = true;
    this.consumedByDrag = true;

    // grab 锚点的算法按**物品来源**分（托盘分支为 M2-11 复审补齐）：
    //
    // - **盘上物品**用**按下点**算，与 pickAt 算 offset 的位置同源：
    //   offset = snap(按下) − A，故 anchor = snap(按下) − offset = A（物品原位），
    //   不跳。若改用阈值跨越那一刻的 move 点，按下与跨越两个 snap 在格中心附近
    //   会因 round(0.5) 抖动差出一格，于是 ghost 一开始就错位（实测：抓 L01_D
    //   中心，grab 锚点跑到 [0,−1] 而非原位 [0,0]）。
    // - **托盘物品**没有盘上原位要保，按**当前手指位**算——语义统一成「此刻
    //   松手落在哪」。按下点在托盘带内，映射过棋盘格只能得到棋盘下方的界外值
    //   （M2-11 复审记录的 `grab anchor=(4,−1)`）：那不是任何有意义的位置；
    //   更实的危害是「一次大幅 move 直接越过阈值、其后没有更多 move」时，松手
    //   仍拿这个陈旧锚点判取出态，把本该落盘的一拖误判成取消（托盘物品发
    //   cancel 回巢）。托盘带内的首帧仍会算出棋盘下方的锚点——这是诚实的：
    //   手指在托盘里本就不能落盘，取出态谓词（overTray）与随后每个 move 会
    //   接管，ghost 也按取出态画在手指下方（PreviewLayer 口径）。
    const fromTray = pending.from === 'tray';
    const anchor = this.anchorAt(fromTray ? uiX : this.startX, fromTray ? uiY : this.startY, pending.offset);
    this.lastAnchor = anchor;
    this.emit({ type: 'grab', itemId: pending.itemId, anchor });
    this.emitPreview(uiX, uiY);

    if (DEBUG) {
      console.log(
        `[DragController] 起拖 ${pending.itemId}（来自 ${pending.from}）` +
          ` grabOffset=(${pending.offset[0]},${pending.offset[1]}) → grab anchor=(${anchor[0]},${anchor[1]})`,
      );
    }
  }

  /** 逐格变化才发 `move`（实施计划：move 节流到逐格变化时），避免每帧刷状态 */
  private emitMoveIfChanged(uiX: number, uiY: number): void {
    const pending = this.pending;
    if (pending === null || this.lastAnchor === null) return;

    const anchor = this.anchorAt(uiX, uiY, pending.offset);
    if (sameRC(anchor, this.lastAnchor)) {
      // 锚点没变**也要刷预览**：取出态还看「手指是否进了托盘带」，那与锚点无关
      // （拖着小物品往下走，锚点可以一格不变而手指已滑进托盘）。不刷就会出
      // 「预览还是绿色、松手却取出」的预期违背——UI Spec 6 点名要避免的
      this.emitPreview(uiX, uiY);
      return;
    }

    this.lastAnchor = anchor;
    this.emit({ type: 'move', anchor });
    this.emitPreview(uiX, uiY);
  }

  /** 手指位置 → 物品锚点。棋盘外的手指也会算出界外锚点（交给 core 判非法） */
  private anchorAt(uiX: number, uiY: number, offset: RC): RC {
    const local = this.toBoardLocal(uiX, uiY);
    const board = this.boardView;
    if (local === null || board === null) return anchorForPointerCell([0, 0], offset);
    return anchorForPointerCell(board.snapToGrid(local.x, local.y), offset);
  }

  private toBoardLocal(uiX: number, uiY: number): Vec3 | null {
    const board = this.boardView;
    if (board === null) return null;
    const transform = board.node.getComponent(UITransform);
    if (transform === null) return null;
    return transform.convertToNodeSpaceAR(new Vec3(uiX, uiY, 0));
  }

  private overTray(uiX: number, uiY: number): boolean {
    return this.trayView?.containsPoint(new Vec3(uiX, uiY, 0)) ?? false;
  }

  private emit(intent: Intent): void {
    if (DEBUG) console.log(`[DragController] → intent ${JSON.stringify(intent)}`);
    this.onIntent?.(intent);
  }

  /**
   * 喂预览给 `PreviewLayer`：从 `previewSource` 读当前预览（M1-6 起是
   * `session.getPreview()`——grab/move 的 dispatch 已在 `emit` 里同步完成），
   * 连同「是否取出态」一起发出。grab / 每次 move 各调一次（锚点没变的 move
   * 也调——手指进出托盘带不改变锚点，但会改变取出态）。
   */
  private emitPreview(uiX: number, uiY: number): void {
    const pending = this.pending;
    const anchor = this.lastAnchor;
    if (pending === null || anchor === null) return;
    const preview = this.previewSource?.() ?? null;
    this.lastPreview = preview;
    this.onPreview?.(preview, this.isTakeoutState(preview, uiX, uiY));
  }

  /**
   * **取出态**谓词（M2-5）：手指在托盘带内 **或** 物品中心出棋盘外扩半格。
   *
   * 预览（`emitPreview`）与松手（`onTouchEnd`）共用这一个谓词——两处判据
   * 一旦分叉，就会出现"预览显示绿色能放、松手却取出"或反过来，玩家对规则
   * 的信任一次就没了（UI Spec 6：否则这条规则形同不存在）。
   *
   * `preview === null`（没抓到东西）时只有手指位置还能判——但那种情况下
   * 调用方本就不在拖拽中，谓词结果不影响任何意图。
   */
  private isTakeoutState(preview: DragPreview | null, uiX: number, uiY: number): boolean {
    if (this.overTray(uiX, uiY)) return true;
    if (preview === null) return false;
    return this.outsideBoard?.(preview) === true;
  }

  private reset(): void {
    this.pending = null;
    this.dragging = false;
    this.lastAnchor = null;
    this.lastPreview = null;
    this.scrolling = false;
    this.scrollStartX = 0;
    this.scrollStartOffset = 0;
  }
}
