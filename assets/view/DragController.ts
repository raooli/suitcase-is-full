/**
 * 拖拽手势 → 意图流（实施计划 M1-4）。
 *
 * ## 本组件做什么 / 不做什么
 *
 * **做**：把一次触摸生命周期（`start → move → end/cancel`）翻译成 Intent 序列
 * `grab → move* → drop|cancel|removeToTray`，交给 `onIntent`。
 *
 * **不做**：
 * - 不碰 `GameSession`、不读 `LevelState`、不改任何状态（M1-6 才由调用方接到 dispatch）；
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
import type { Intent, RC } from '../core';
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
   * 意图出口。**M1-4 阶段由 `GameController` 接到 Console 挂具**（实施计划 M1-4 注：
   * 接线前先人工比对意图序列），M1-6 一接线就换成 `session.dispatch`。
   *
   * 之所以留成回调而不是在这里直接 dispatch：本组件因此不需要知道会话的存在，
   * 换接线方式是调用方一行的事。
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

  private pending: PendingGrab | null = null;
  private dragging = false;
  private lastAnchor: RC | null = null;
  private startX = 0;
  private startY = 0;
  /** 本次触摸是否已被判成拖拽（点/拖互斥的唯一依据） */
  private consumedByDrag = false;

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
  onEnable(): void {
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

  onDisable(): void {
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
    this.consumedByDrag = false;
    this.pending = null;
    this.dragging = false;
    this.lastAnchor = null;

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

  private onTouchMove(event: EventTouch): void {
    if (this.pending === null && !this.dragging) return;

    const ui = event.getUILocation();

    // 阈值仲裁：没过阈值就还是"点击"，一个意图都不发
    if (!this.dragging) {
      const dx = ui.x - this.startX;
      const dy = ui.y - this.startY;
      if (Math.hypot(dx, dy) < UI_DRAG_THRESHOLD_PX) return;
      this.beginDrag(ui.x, ui.y);
    }

    if (!this.dragging || this.pending === null) return;
    this.emitMoveIfChanged(ui.x, ui.y);
  }

  private onTouchEnd(event: EventTouch): void {
    const ui = event.getUILocation();
    if (this.dragging && this.pending !== null) {
      // 松手位置决定语义：拖回托盘 → 取出（原本在盘上的）/ 放弃（原本就在托盘）
      if (this.overTray(ui.x, ui.y)) {
        this.emit(
          this.pending.from === 'board'
            ? { type: 'removeToTray', itemId: this.pending.itemId }
            : { type: 'cancel' },
        );
      } else {
        this.emit({ type: 'drop' });
      }
    } else if (!this.consumedByDrag) {
      // 没过阈值 → 这是一次点击，不是拖拽
      this.emitTap(ui.x, ui.y);
    }
    this.reset();
  }

  /**
   * 引擎在"松手点不在认领触摸的节点内"时派发的是 `TOUCH_CANCEL`。
   * 挂在覆盖整屏的 `gestureRoot` 上之后这不该发生；真发生了就老实报 `cancel`——
   * **不猜测落点**（猜出来的落点会让"放不下"变成"放错位置"，比取消更难查）。
   */
  private onTouchCancel(): void {
    if (DEBUG) console.warn('[DragController] 收到 TOUCH_CANCEL：本次拖拽按取消处理');
    if (this.dragging) this.emit({ type: 'cancel' });
    this.reset();
  }

  /** 点击 → `onTap`。只认托盘带内的点击，避免点棋盘顺手取消了选中 */
  private emitTap(uiX: number, uiY: number): void {
    if (!this.overTray(uiX, uiY)) return;
    const hit = this.trayView?.hitTest(new Vec3(uiX, uiY, 0)) ?? null;
    if (DEBUG) console.log(`[DragController] 点击托盘 → ${hit?.itemId ?? '空白处'}`);
    this.onTap?.(hit === null ? null : hit.itemId);
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

    const cell = board.snapToGrid(local.x, local.y);
    const hit = this.boardItemAt?.(cell[0], cell[1]) ?? null;
    if (hit === null) return null;

    return {
      itemId: hit.itemId,
      offset: grabOffsetForBoardCell(hit.anchor, cell),
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

  /** 过了阈值：正式起拖，发出 `grab` */
  private beginDrag(uiX: number, uiY: number): void {
    const pending = this.pending;
    if (pending === null) return;

    this.dragging = true;
    this.consumedByDrag = true;

    const anchor = this.anchorAt(uiX, uiY, pending.offset);
    this.lastAnchor = anchor;
    this.emit({ type: 'grab', itemId: pending.itemId, anchor });

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
    if (sameRC(anchor, this.lastAnchor)) return;

    this.lastAnchor = anchor;
    this.emit({ type: 'move', anchor });
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

  private reset(): void {
    this.pending = null;
    this.dragging = false;
    this.lastAnchor = null;
  }
}
