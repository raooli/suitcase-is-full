/**
 * 关卡运行时状态机（TDD 第 7 节）。
 *
 * **`dispatch()` 是唯一的状态写入口。** view 层永远不直接改 `LevelState`——
 * 这条约束是整个「渲染层与逻辑解耦」能成立的前提。
 *
 * 本类**不引用任何引擎类型**：不 import `cc`，不碰触摸事件，不知道像素为何物。
 * 触摸 → 意图的翻译是 `view/DragController` 的事。
 */

import { ROTATE_NUDGE_RADIUS } from '../config';
import type { RC, GamePhase, Intent, LevelSpec, LevelState, Placement, Rotation } from '../model/types';
import { applyPlacement, canPlace, findItem, insertByTrayOrder, removeToTray, rotateInPlace, trayRotationOf } from '../rules/placement';
import { checkDeadend } from '../solver/deadend';
import type { DragPreview } from '../model/types';
import type { GameEvent, SessionResult } from './events';
import { History } from './History';

export interface GameSessionOptions {
  /** 注入时钟，便于单测断言 elapsedMs。默认 `Date.now` */
  readonly now?: () => number;
  /** 撤回栈上限 */
  readonly undoLimit?: number;
}

export class GameSession {
  private state: LevelState;
  private phase: GamePhase = 'Idle';
  private preview: DragPreview | null = null;
  private readonly history: History;
  private readonly now: () => number;
  private readonly startedAt: number;
  private moveCount = 0;
  /** 拖动中物品的来源，`drop` 时用来区分「放入」与「移动」 */
  private dragFrom: 'tray' | 'board' | null = null;

  constructor(
    readonly level: LevelSpec,
    options: GameSessionOptions = {},
  ) {
    this.history = new History(options.undoLimit);
    this.now = options.now ?? (() => Date.now());
    this.startedAt = this.now();
    this.state = GameSession.initialState(level);
  }

  // ───────────────────────── 读取 ─────────────────────────

  /** 当前已提交状态。**只读**——返回的是不可变对象，调用方改不动它 */
  getState(): LevelState {
    return this.state;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  getPreview(): DragPreview | null {
    return this.preview;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get moves(): number {
    return this.moveCount;
  }

  /** 关卡初始状态：托盘按 `trayOrder`、朝向全 0、无选中。障碍由 `level` 承载，不在这里 */
  static initialState(level: LevelSpec): LevelState {
    const tray = Array.from(level.items)
      .sort((a, b) => a.trayOrder - b.trayOrder)
      .map((it) => it.id);
    return {
      levelId: level.levelId,
      placements: new Map<string, Placement>(),
      tray,
      trayRotations: new Map<string, Rotation>(),
      selectedId: null,
    };
  }

  // ───────────────────────── 唯一入口 ─────────────────────────

  dispatch(intent: Intent): SessionResult {
    const events: GameEvent[] = [];

    switch (intent.type) {
      case 'select':
        this.handleSelect(intent.itemId, events);
        break;
      case 'grab':
        this.handleGrab(intent.itemId, intent.anchor, events);
        break;
      case 'move':
        this.handleMove(intent.anchor);
        break;
      case 'drop':
        this.handleDrop(events);
        break;
      case 'cancel':
        this.handleCancel();
        break;
      case 'rotate':
        this.handleRotate(intent.itemId, events);
        break;
      case 'removeToTray':
        this.handleRemoveToTray(intent.itemId, events);
        break;
      case 'undo':
        this.handleUndo(events);
        break;
      case 'reset':
        this.handleReset(events);
        break;
    }

    events.unshift({ type: 'state-changed', state: this.state });
    return { state: this.state, phase: this.phase, preview: this.preview, events };
  }

  // ───────────────────────── 各意图处理 ─────────────────────────

  private handleSelect(itemId: string | null, events: GameEvent[]): void {
    if (this.isInputFrozen()) return;
    this.state = { ...this.state, selectedId: itemId };
    this.phase = itemId === null ? 'Idle' : 'Selected';
    void events;
  }

  private handleGrab(itemId: string, anchor: RC, events: GameEvent[]): void {
    if (this.isInputFrozen()) return;
    const item = findItem(this.level, itemId);
    if (item === undefined) return;

    const from: 'tray' | 'board' = this.state.placements.has(itemId) ? 'board' : 'tray';
    this.dragFrom = from;
    this.state = { ...this.state, selectedId: itemId };
    this.phase = 'Dragging';
    this.preview = this.buildPreview(itemId, anchor, from);
    void events;
  }

  private handleMove(anchor: RC): void {
    if (this.phase !== 'Dragging' || this.preview === null) return;
    this.preview = this.buildPreview(this.preview.itemId, anchor, this.preview.from);
  }

  /**
   * 松手提交。
   *
   * 三条分支：
   * - 预览非法 → **不改变状态**，只发 `placement-rejected`（PRD AC10：非法尝试不入撤回栈）
   * - 预览合法 → 提交。压入操作前快照，然后写状态
   * - 无预览（未抓到任何东西）→ 无操作
   *
   * 冻结门必须在最前面：无预览的清理分支会改写 phase（回 Idle/Selected），
   * 通关动画期间（WinAnimating）放它过去就等于把"已通关"抹掉（M1-7 实测：
   * view 侧一次异常导致拖拽状态残留，残留的 drop 意图把 phase 从 WinAnimating
   * 打回 Idle，通关态丢失）。冻结期的一切 intent 一律原样拒绝。
   */
  private handleDrop(events: GameEvent[]): void {
    if (this.isInputFrozen()) return;
    const preview = this.preview;
    if (preview === null || this.phase !== 'Dragging') {
      this.preview = null;
      this.dragFrom = null;
      this.phase = this.state.selectedId ? 'Selected' : 'Idle';
      return;
    }

    const item = findItem(this.level, preview.itemId);
    if (item === undefined) {
      this.preview = null;
      this.dragFrom = null;
      return;
    }

    if (!preview.check.ok) {
      events.push({
        type: 'placement-rejected',
        itemId: preview.itemId,
        reason: preview.check.reason,
      });
      // 非法：什么都不提交，回到"已选中"而不是"未选中"——
      // 玩家刚拖了一下没放成功，保持选中让他能直接再试或点旋转
      this.preview = null;
      this.dragFrom = null;
      this.phase = this.state.selectedId ? 'Selected' : 'Idle';
      return;
    }

    const [row, col] = preview.anchor;
    this.commitPlacement(
      { itemId: preview.itemId, row, col, rotation: preview.rotation },
      preview.from,
      events,
    );
    this.preview = null;
    this.dragFrom = null;
    // 注意：`commitPlacement` 可能已经把 phase 推到 `WinAnimating`。
    // 这里若无条件改写 phase，通关状态会被覆盖掉，通关动画就永远不播。
    if (!this.isInputFrozen()) {
      this.phase = this.state.selectedId ? 'Selected' : 'Idle';
    }
  }

  /** 取消拖动 / touchCancel：一律回退，**不**视为取出（TDD 7.3 明确禁止混淆） */
  private handleCancel(): void {
    // 同 handleDrop：清理分支也会改写 phase，冻结期必须整体拒绝
    if (this.isInputFrozen()) return;
    this.preview = null;
    this.dragFrom = null;
    this.phase = this.state.selectedId ? 'Selected' : 'Idle';
  }

  /**
   * 旋转。分两条完全不同的路径：
   * - **托盘中物品**：只改 `trayRotations`，**不计入撤回栈**（GDD 1.2 明确）
   * - **已放置物品**：走 `rotateInPlace` 的四条策略，成功才提交并计入撤回栈
   */
  private handleRotate(itemId: string, events: GameEvent[]): void {
    if (this.isInputFrozen()) return;
    const item = findItem(this.level, itemId);
    if (item === undefined) return;

    // `rotatable === false` 的物品**任何情况下**都不能转（GDD 1.2「可旋转物品
    // 每次顺时针 90°……不可旋转时按钮禁用」）。
    //
    // 原来这条检查只在"物品还在托盘里"的分支里，已放物品会漏下去走
    // `rotateInPlace` 四策略——于是不可旋转的物品"转"了一下，失败时还发
    // `rotate-blocked`（view 抖一下）。那个反馈是**误导**：抖动的意思是
    // "周围挡住了、换个地方再试"，而真相是"这东西根本不能转"。
    // M1-8 接旋转入口时实测：L1 四件物品 rotatable 全 false，点已放物品
    // 得到的是「四策略全失败」而非「不可旋转」。
    if (!item.rotatable) return;

    if (!this.state.placements.has(itemId)) {
      const next = (((trayRotationOf(this.state, itemId) + 1) % 4) as Rotation);
      const trayRotations = new Map(this.state.trayRotations);
      trayRotations.set(itemId, next);
      this.state = { ...this.state, trayRotations };
      events.push({ type: 'item-rotated', itemId, rotation: next });
      return;
    }

    const result = rotateInPlace(this.level, this.state, itemId, ROTATE_NUDGE_RADIUS);
    if (result.ok && result.placement) {
      this.history.push(this.state);
      const placements = new Map(this.state.placements);
      placements.set(itemId, result.placement);
      this.state = { ...this.state, placements };
      this.moveCount++;
      events.push({ type: 'item-rotated', itemId, rotation: result.placement.rotation });
      this.afterCommit(events);
      return;
    }

    // 策略 4：**不提交**。逻辑层必须做到"要么提交合法，要么根本没变"（G-07 / AC08）
    events.push({ type: 'rotate-blocked', itemId });
  }

  /**
   * 取出到托盘（PRD R-06b）。这是**一次成功操作**，计入撤回栈。
   *
   * **拖拽生命周期必须在这里收尾**（与 `handleDrop` / `handleCancel` 同构）：
   * 真实手势流是 `grab → move* → removeToTray`，中间没有 drop/cancel，
   * 而 grab 会把 phase 置为 `Dragging`。若这里不重置，phase 会卡在
   * `Dragging`——`handleUndo` 的 `phase === 'Dragging'` 门随之挡住取出后的
   * 撤回，R-06b 第 4 条「可单独撤回」直接失效（M2-5 实测：view 侧取出后
   * 点工具栏「撤回」无反应，查下来是这里没收尾）。
   */
  private handleRemoveToTray(itemId: string, events: GameEvent[]): void {
    if (this.isInputFrozen()) return;
    if (!this.state.placements.has(itemId)) {
      // 托盘物品拖到棋盘外 → 无变化、不入栈；生命周期照常收尾（同上）
      this.preview = null;
      this.dragFrom = null;
      this.phase = this.state.selectedId ? 'Selected' : 'Idle';
      return;
    }
    this.history.push(this.state);
    this.state = removeToTray(this.level, this.state, itemId);
    this.moveCount++;
    events.push({ type: 'item-returned', itemId });
    this.afterCommit(events);
    // 收尾放在 afterCommit 之后：与 handleDrop 同构，防 afterCommit 把 phase
    // 推到 WinAnimating 后被无条件改写（取出不会通关，但结构上保持一致）
    this.preview = null;
    this.dragFrom = null;
    if (!this.isInputFrozen()) {
      this.phase = this.state.selectedId ? 'Selected' : 'Idle';
    }
  }

  private handleUndo(events: GameEvent[]): void {
    if (this.isInputFrozen() || this.phase === 'Dragging') return;
    const previous = this.history.pop();
    if (previous === null) return;
    this.state = previous;
    this.preview = null;
    this.phase = this.state.selectedId ? 'Selected' : 'Idle';
    events.push({ type: 'undo-applied', steps: 1 });
  }

  /**
   * 重置：回初始快照 + 清空撤回栈。**不影响**存档里的解锁进度。
   *
   * 通关动画期间同样被冻结——成功浮层盖住了工具栏，此时允许重置
   * 会把"已通关"的状态抹掉，玩家会以为游戏丢了进度。
   */
  private handleReset(events: GameEvent[]): void {
    if (this.isInputFrozen()) return;
    this.state = GameSession.initialState(this.level);
    this.history.clear();
    this.preview = null;
    this.dragFrom = null;
    this.phase = 'Idle';
    this.moveCount = 0;
    events.push({ type: 'level-reset' });
  }

  // ───────────────────────── 内部工具 ─────────────────────────

  private buildPreview(itemId: string, anchor: RC, from: 'tray' | 'board'): DragPreview {
    const rotation =
      from === 'board'
        ? (this.state.placements.get(itemId)?.rotation ?? 0)
        : trayRotationOf(this.state, itemId);
    const [row, col] = anchor;
    const check = canPlace(this.level, this.state, { itemId, row, col, rotation });
    return { itemId, anchor, rotation, check, from };
  }

  /** 提交一次落位。压栈 → 写状态 → 计数 → 发事件 → 后置检查 */
  private commitPlacement(
    placement: Placement & { itemId: string },
    from: 'tray' | 'board',
    events: GameEvent[],
  ): void {
    this.history.push(this.state);
    this.state = applyPlacement(this.level, this.state, placement);
    this.moveCount++;
    events.push({
      type: 'placement-committed',
      itemId: placement.itemId,
      placement: { row: placement.row, col: placement.col, rotation: placement.rotation },
      from,
    });
    this.afterCommit(events);
  }

  /**
   * 每次成功提交后的固定后置动作：面积快检 + 通关判定。
   *
   * 通关判定用 **phase 转移**而不是"检查条件"来触发（TDD 6.6）：
   * 条件式触发在快速连点下会重复发出通关事件（PRD AC12 / G-14）。
   */
  private afterCommit(events: GameEvent[]): void {
    const deadend = checkDeadend(this.level, this.state);
    if (deadend.stuck) {
      events.push({
        type: 'deadlock-warning',
        freeCells: deadend.freeCells,
        requiredCells: deadend.requiredCells,
      });
    }

    if (this.phase === 'WinAnimating' || this.phase === 'Completed') return;
    const cleared =
      this.state.tray.length === 0 && this.state.placements.size === this.level.items.length;
    if (!cleared) return;

    this.phase = 'WinAnimating';
    this.preview = null;
    events.push({
      type: 'level-cleared',
      levelId: this.level.levelId,
      elapsedMs: this.now() - this.startedAt,
      moves: this.moveCount,
    });
  }

  private isInputFrozen(): boolean {
    return this.phase === 'WinAnimating' || this.phase === 'Completed';
  }

  /** 通关动画播完后由 view 调用，把 phase 推到 `Completed` */
  completeWinAnimation(): void {
    if (this.phase === 'WinAnimating') this.phase = 'Completed';
  }

  /** 调试用：导出内部状态摘要。注意**不要**让 view 依赖它 */
  debugSnapshot(): {
    phase: GamePhase;
    tray: readonly string[];
    placed: ReadonlyArray<{ itemId: string; placement: Placement }>;
    undoDepth: number;
    moves: number;
  } {
    return {
      phase: this.phase,
      tray: this.state.tray,
      placed: Array.from(this.state.placements.entries()).map(([itemId, placement]) => ({ itemId, placement })),
      undoDepth: this.history.peekDepth(),
      moves: this.moveCount,
    };
  }

  /** 托盘顺序工具：把 id 按 trayOrder 插回（渲染层也可直接复用） */
  static reinsert(level: LevelSpec, tray: readonly string[], itemId: string): string[] {
    return insertByTrayOrder(level, tray, itemId);
  }
}
