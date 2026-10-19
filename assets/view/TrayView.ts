/**
 * 未装入物品的**托盘**（实施计划 M1-3，UI Spec 5.2）。
 *
 * 三条纪律：
 * 1. **顺序只认 `state.tray`**（core 已按 `trayOrder` 排好），本组件不再排序——
 *    一旦这里也排一次，两份真相就会在撤销/取出后分叉。
 * 2. **不持有选中状态**：`selected` 只是渲染态，真相是 `state.selectedId`。
 *    点选只负责把意图交给外部（`onSelect` → `dispatch({type:'select'})`），
 *    然后由 `applyState()` 把结果画出来。
 * 3. **不做格算术**：物品按棋盘口径画好，这里只整体缩放（见 `TraySlot.setItem`）。
 *
 * ## 触摸监听不在本组件（M1-4 起）
 *
 * M1-3 时点选监听挂在槽位上，M1-4 拖起一上手就撞墙：Cocos 由**按下时命中的最深
 * 节点**认领整次触摸，松手点不在该节点内时派发的是 **TOUCH_CANCEL 而非 TOUCH_END**。
 * 槽位只有 76×76，从托盘拖到棋盘松手必然在它外面 → 拖拽永远收不到"松手"。
 *
 * 所以监听整体交给挂在覆盖整屏 `SafeAreaRoot` 上的 `DragController`，
 * "点 vs 拖"的仲裁也一并收在那里（本组件只保留 `hitTest` 供它查询命中）。
 *
 * ## 横向滚动（M2-11，UI Spec 5.2「物品数量多时横向滚动」）
 *
 * 物品多到一行放不下时（L7–L10 有 7–9 件、槽位夹到 `UI_TRAY_SLOT_MIN=44px` 后
 * 只显 6 个），全部槽位仍**照建**，改挂在 `TrayContent` 子容器上，靠 `scrollOffset`
 * 平移露出不同区段；只有与可见窗口**相交**的槽位才 `active`（`TraySlot.setInWindow`，
 * 取代 M1-3 的 `markOverflow`——溢出件不再永久隐藏，而是滚出来够到）。
 *
 * 滚动手势（滑 vs 抓物品）由 `DragController` 按**主轴方向**仲裁：托盘在底部、
 * 把物品拖上棋盘是纵向为主、横向是滑托盘，两者天然可分。本组件自己不挂任何触摸
 * 监听（沿用 M1-4 的决定），只提供 `setScrollOffset` / `canScroll` / `scrollOffset`
 * 供它驱动。布局算术（夹取 / 可见性 / 排布）在 core 的 `geometry/trayScroll.ts`。
 *
 * ## 取出目标位高亮（M2-5，PRD R-06b / UI Spec 7 节）
 *
 * 把已放物品拖向托盘时，`DragController` 判定进入「取出态」后会调
 * `highlightReturnTarget(itemId)`：按 core `trayInsertIndex`（与 `removeToTray`
 * 同源的插入判据）算出这件物品回托盘后的落点槽位，染成 `drop-target`
 * （`TraySlot` 自 M1-3 起就留着这个视觉态，此前无人使用）。拖拽结束由
 * `clearReturnTarget()` 还原。
 */

import { Component, Node, UITransform, Vec3, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_DESIGN_WIDTH,
  UI_SAFE_MARGIN,
  UI_TRAY_GAP,
  UI_TRAY_PADDING,
  UI_TRAY_SLOT,
  UI_TRAY_SLOT_MIN,
  UI_TRAY_HEIGHT,
  UI_TRAY_BAND_CENTER_Y,
  bboxOf,
  findItem,
  rotateBy,
  trayClampScroll,
  trayContentWidth,
  trayMaxScroll,
  trayRotationOf,
  trayInsertIndex,
  traySlotCenterX,
  traySlotInWindow,
} from '../core';
import type { ItemSpec, LevelSpec, LevelState } from '../core';
import { ItemView } from './ItemView';
import type { ShapeSource } from './ItemView';
import { ensureFrame } from './propAssets';
import { TraySlot } from './TraySlot';

const { ccclass } = _decorator;

/** 托盘命中结果（M1-4 起拖用）。`rows/cols` 是物品的**格数** */
export interface TrayHit {
  readonly itemId: string;
  /** 缩略图节点：把按下点换算进它的局部坐标，才能知道"压住了哪一格" */
  readonly node: Node;
  readonly rows: number;
  readonly cols: number;
}

@ccclass('TrayView')
export class TrayView extends Component {
  private slots: TraySlot[] = [];
  /** 最近一次 `applyState` 的状态（提示高亮清除后据此还原选中/普通态） */
  private lastState: LevelState | null = null;
  /** 最近一次 `render` 的关卡（M2-5：算取出目标位要查 `trayOrder`） */
  private lastLevel: LevelSpec | null = null;

  /** 横向滚动偏移（设计单位，∈[0, maxScroll]）。容器 `content.x = −offset`（M2-11） */
  private scrollOffsetValue = 0;
  /** 全部槽位的滚动容器；本节点（TrayView）保持固定尺寸 = 可见窗口（见 onLoad） */
  private contentNode: Node | null = null;
  /** 最近一次 render 的槽位边长与件数（可见性 / 滚动范围据此重算） */
  private slotSize = UI_TRAY_SLOT;
  private itemCount = 0;

  override onLoad(): void {
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(TrayView.contentWidth(), UI_TRAY_HEIGHT - UI_TRAY_PADDING * 2);
    this.node.setPosition(0, UI_TRAY_BAND_CENTER_Y, 0);
    // 滚动容器先建好：它固定为"可见窗口"，槽位全挂它下面，靠 x 平移露出不同区段。
    // 本节点自身不动 → `containsPoint` / `hitTest` 的窗口口径与滚动前完全一致
    this.ensureContentNode();
  }

  /** 按 `state.tray` 重建全部槽位。MVP 不做增量 diff（与 `BoardView` 同策略） */
  render(state: LevelState, level: LevelSpec, source: ShapeSource): void {
    this.clear();
    this.ensureContentNode();

    this.lastLevel = level;
    const count = state.tray.length;
    const slotSize = TrayView.slotSizeFor(count);
    this.slotSize = slotSize;
    this.itemCount = count;
    const cellPx = source.getCellPx();

    let index = 0;
    for (const itemId of state.tray) {
      const item = findItem(level, itemId);
      if (item === undefined) continue;

      const slot = this.createSlot(itemId, slotSize, index);
      this.mountItem(slot.node, item, state, source, cellPx);
      index++;
    }

    // 状态变更会整体重建：**保留**滚动偏移，再按可见窗口算每槽显隐（M2-11）。
    // 这里若归零，每次放入 / 取出 / 旋转 / 撤回都会把托盘弹回开头——L7+ 最坑：
    // 取出高 `trayOrder` 物品时，拖拽中 `ensureSlotVisible` 已把目标槽挪进窗口并
    // 高亮，提交后归零等于把刚回巢（且 selected）的物品又滚出视野、反馈自相矛盾。
    // 偏移由 `applyScrollLayout` 按新的 `maxScroll` 夹取，件数变化时自动收敛到
    // 合法区间；真正"从头开始"只有换关 / 重开，走 `resetScroll()`。
    // 溢出件不再永久隐藏——建全部、靠滚动露出来够到（取代 M1-3 的 markOverflow）
    this.applyScrollLayout();

    // 提交后重建：当前若有选中件（典型是刚从棋盘取回的那件），把它挪进窗口。
    // 偏移被夹到新 `maxScroll` 后，界外件可能只露半截——"刚回巢且高亮"的物品
    // 必须完整可见，否则 M2-5 的取出目标位高亮等于没给反馈。
    // 只在这里做（render = 提交后、无进行中手势）；`applyState` 不做，免得
    // 拖拽中把托盘在手指底下平移。
    const selectedId = state.selectedId;
    if (selectedId !== null) {
      const at = state.tray.indexOf(selectedId);
      if (at >= 0) this.ensureSlotVisible(at);
    }

    this.applyState(state);

    if (DEBUG) {
      const max = this.maxScroll();
      const inWindow = this.slots.filter((s) => s.node.active).length;
      console.log(
        `[TrayView] 托盘 ${count} 件（槽位 ${slotSize}px，可滚 ${max}px，` +
          `偏移 ${this.scrollOffsetValue}px，窗内 ${inWindow}）：` +
          this.slots.map((s) => s.describe()).join(' '),
      );
      if (max > 0) {
        console.log(`[TrayView] 横向滚动就绪：${count} 件超出可见区 ${max}px，左右滑托盘露出其余（UI Spec 5.2）`);
      }
    }
  }

  /** 只刷新选中态（不重建节点）。点选后的常规路径走这里 */
  applyState(state: LevelState): void {
    this.lastState = state;
    for (const slot of this.slots) {
      slot.setVisual(slot.getItemId() === state.selectedId ? 'selected' : 'normal');
    }
  }

  /**
   * 提示高亮：把某件托盘物品所在的槽位染成 `hint` 态（蓝色描边）。
   * 与 `BoardView.showHint` 配合，提示「这件该放到那几格」。
   * 非目标但处于选中的槽位保留选中态（提示不抹掉选中高亮）。
   */
  highlightHint(itemId: string): void {
    const selectedId = this.lastState?.selectedId ?? null;
    for (const slot of this.slots) {
      const id = slot.getItemId();
      if (id === itemId) slot.setVisual('hint');
      else if (id === selectedId) slot.setVisual('selected');
      else slot.setVisual('normal');
    }
  }

  /**
   * 清除提示高亮，还原到提示前的选中/普通态（依据 `lastState`）。
   * 不靠重建节点——否则会丢掉当前缩略图。
   */
  clearHint(): void {
    if (this.lastState !== null) this.applyState(this.lastState);
  }

  // ───────────────────────── 取出目标位高亮（M2-5） ─────────────────────────

  /**
   * 取出拖拽时的**目标位高亮**（UI Spec 7 节 TraySlot「取出目标位高亮」：
   * 高亮目标空位，让玩家能预期落点）。
   *
   * 落点下标问 core 的 `trayInsertIndex`（与 `removeToTray` 的插入判据同源）——
   * **本组件不自己重排顺序**（纪律①：顺序只认 `state.tray`，这里再排一次，
   * 两份真相就会在撤销/取出后分叉）。
   *
   * 追加到末尾（下标 = 托盘长度）时高亮**末槽**：落点在它右边，视觉上
   * "排在最后"仍然读得出来。目标槽滚出窗外（L7+ 可滚托盘）时先把窗口挪过去
   * ——高亮一个看不见的槽位等于没有反馈；拖拽进行中不存在滚动手势
   * （`DragController` 仲裁互斥），这次平移不会和玩家操作打架。
   */
  highlightReturnTarget(itemId: string): void {
    const level = this.lastLevel;
    const state = this.lastState;
    if (level === null || state === null) return;

    const index = trayInsertIndex(level, state.tray, itemId);
    this.ensureSlotVisible(index);

    const target = Math.min(index, Math.max(this.slots.length - 1, 0));
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const id = slot.getItemId();
      if (i === target) slot.setVisual('drop-target');
      else if (id === state.selectedId) slot.setVisual('selected');
      else slot.setVisual('normal');
    }

    if (DEBUG) {
      const at = index < this.slots.length ? `第 ${index} 槽` : '末尾（高亮末槽）';
      console.log(`[TrayView] 取出目标位：${itemId} → tray ${at}`);
    }
  }

  /** 清除取出目标位高亮，还原到选中/普通态（与 `clearHint` 同构） */
  clearReturnTarget(): void {
    if (this.lastState !== null) this.applyState(this.lastState);
  }

  /**
   * 把第 `index` 个槽位挪进可见窗口（M2-5 取出高亮的前置）。
   * 已在窗内则不动（幂等）；下标越界（追加位的右侧）安全返回。
   */
  private ensureSlotVisible(index: number): void {
    if (index < 0 || index >= this.slots.length) return;
    const centerX = TrayView.slotCenterX(index, this.slotSize);
    const half = TrayView.contentWidth() / 2;
    const slotHalf = this.slotSize / 2;
    // 窗口坐标 = 内容坐标 − offset；右越界增大 offset（内容左移），左越界减小
    let target = this.scrollOffsetValue;
    if (centerX - target + slotHalf > half) target = centerX + slotHalf - half;
    else if (centerX - target - slotHalf < -half) target = centerX - slotHalf + half;
    if (target !== this.scrollOffsetValue) this.setScrollOffset(target);
  }

  /**
   * 拖拽中排除 / 恢复某件（M1-6）。
   *
   * 从托盘起拖时物品**仍在 `state.tray` 里**（`grab` 不改 state），槽位不排除
   * 就是"托盘里还有一件、手指上还有 ghost"的幽灵态。排除只切显隐、不重建
   * （松手后由 `GameController.refreshAll` 按新 state 整体重画）。
   */
  setHiddenItem(itemId: string | null): void {
    for (const slot of this.slots) {
      slot.setHidden(slot.getItemId() === itemId);
    }
  }

  /**
   * 槽位节点（引导层定位高亮洞用，M2-6）。
   *
   * 返回**节点**而不是坐标：槽位挂在 `TrayContent` 上，M2-11 的横向滚动会平移
   * 容器，节点的世界位置天然带着当前 `scrollOffset`；自己按静态布局算会算错
   * （滚过之后高亮圈会停在错误的位置）。
   */
  slotNodeOf(itemId: string): Node | null {
    for (const slot of this.slots) {
      if (slot.getItemId() === itemId) return slot.node;
    }
    return null;
  }

  /** 当前槽位边长（M2-11 会按件数夹取，故要问当前值而不是常量） */
  slotPixelSize(): number {
    return this.slotSize;
  }

  /** 槽位在内容坐标系里的中心 x：左对齐逐个排开（算术在 core `traySlotCenterX`） */
  static slotCenterX(index: number, slotSize: number): number {
    return traySlotCenterX(index, slotSize, UI_TRAY_GAP, TrayView.contentWidth());
  }

  /**
   * 槽位边长：先按件数**均分**，再夹在 `[44, 76]`。
   * 下限 44 = 交互热区硬约束（UI Spec 4 节），宁可溢出也不缩到点不中。
   */
  static slotSizeFor(count: number): number {
    if (count <= 0) return UI_TRAY_SLOT;
    const even = (TrayView.contentWidth() - UI_TRAY_GAP * (count - 1)) / count;
    return Math.max(UI_TRAY_SLOT_MIN, Math.min(UI_TRAY_SLOT, Math.floor(even)));
  }

  private static contentWidth(): number {
    return UI_DESIGN_WIDTH - UI_SAFE_MARGIN * 2;
  }

  // ───────────────────────── 横向滚动（M2-11） ─────────────────────────

  /** 滚动容器（懒建）。所有槽位挂它下面；本节点自身保持固定窗口尺寸、不参与平移 */
  private ensureContentNode(): Node {
    if (this.contentNode === null) {
      const content = new Node('TrayContent');
      content.layer = this.node.layer;
      this.node.addChild(content);
      this.contentNode = content;
    }
    return this.contentNode;
  }

  /** 内容总宽（全部槽位 + 间距） */
  private contentTotalWidth(): number {
    return trayContentWidth(this.itemCount, this.slotSize, UI_TRAY_GAP);
  }

  /** 当前滚动偏移（设计单位，只读） */
  get scrollOffset(): number {
    return this.scrollOffsetValue;
  }

  /** 可滚动的最大偏移。内容放得下时为 0（= 不可滚，L1–L6 即此） */
  maxScroll(): number {
    return trayMaxScroll(this.contentTotalWidth(), TrayView.contentWidth());
  }

  /** 是否可横向滚动（供 `DragController` 判"滑托盘"还是"抓物品"） */
  canScroll(): boolean {
    return this.maxScroll() > 0;
  }

  /**
   * 设置滚动偏移（由 `DragController` 的手势驱动）。自动夹取、平移容器、
   * 并按可见窗口重算每槽显隐。越界值被夹回 `[0, maxScroll]`。
   */
  setScrollOffset(offset: number): void {
    this.scrollOffsetValue = offset;
    this.applyScrollLayout();
  }

  /**
   * 滚动偏移归零（**换关 / 重开**用，见 `render` 的注释）。
   *
   * `render()` 刻意保留偏移（否则每次状态变更都把托盘弹回开头），所以"从头
   * 开始"这件事必须由调用方显式声明，而不是搭 render 的便车。
   */
  resetScroll(): void {
    this.setScrollOffset(0);
  }

  /** 夹取偏移 → 平移容器 → 逐槽显隐。`setScrollOffset` / `render` 共用 */
  private applyScrollLayout(): void {
    const clamped = trayClampScroll(this.scrollOffsetValue, this.contentTotalWidth(), TrayView.contentWidth());
    this.scrollOffsetValue = clamped;

    const content = this.contentNode;
    if (content !== null) content.setPosition(-clamped, 0, 0);

    // 只有与可见窗口相交的槽位才 active（可渲染 + 可命中）；滚出窗外的整块藏起。
    // 拖拽排除态由 TraySlot 与 inWindow 合成，不会被这里覆盖（见 TraySlot.updateActive）
    for (let i = 0; i < this.slots.length; i++) {
      const centerX = TrayView.slotCenterX(i, this.slotSize);
      this.slots[i].setInWindow(traySlotInWindow(centerX, this.slotSize, clamped, TrayView.contentWidth()));
    }
  }

  private createSlot(itemId: string, slotSize: number, index: number): TraySlot {
    const node = new Node(`Slot_${itemId}`);
    node.layer = this.node.layer;
    // 挂到滚动容器（而非本节点）：本节点是固定可见窗口，槽位随容器一起平移（M2-11）
    this.ensureContentNode().addChild(node);
    node.setPosition(TrayView.slotCenterX(index, slotSize), 0, 0);

    // 槽位不带触摸监听：命中查询统一走 `hitTest()`，由 DragController 调用
    // （原因见文件头"触摸监听不在本组件"，以及 `TraySlot` 里同名的那段注释）
    const slot = node.addComponent(TraySlot);
    slot.init(itemId, slotSize);
    this.slots.push(slot);
    return slot;
  }

  /**
   * 世界坐标命中了哪个槽位（M1-4 起拖）。只用槽位自身的 `UITransform` 做
   * 矩形判定，**不碰格算术**——拿到的是"哪件物品 + 它几行几列"，
   * 至于"压住了哪一格"由 `DragController` 换算。
   */
  hitTest(worldPos: Vec3): TrayHit | null {
    for (const slot of this.slots) {
      if (!slot.node.active) continue;
      const transform = slot.node.getComponent(UITransform);
      if (transform === null) continue;

      const size = transform.contentSize;
      const local = transform.convertToNodeSpaceAR(worldPos);
      if (Math.abs(local.x) > size.width / 2 || Math.abs(local.y) > size.height / 2) continue;

      const itemNode = slot.getItemNode();
      if (itemNode === null) continue;
      const shape = slot.getShape();
      return { itemId: slot.getItemId(), node: itemNode, rows: shape.rows, cols: shape.cols };
    }
    return null;
  }

  /**
   * 世界坐标是否落在托盘带内（M2-5 取出态判定的两个条件之一：
   * 「手指在托盘带内」= 玩家拖回托盘的明确意图；另一个条件是物品中心出棋盘
   * 外扩半格，由 `DragController.outsideBoard` 经 `BoardView.isTakeout` 判定）。
   */
  containsPoint(worldPos: Vec3): boolean {
    const transform = this.node.getComponent(UITransform);
    if (transform === null) return false;

    const size = transform.contentSize;
    const local = transform.convertToNodeSpaceAR(worldPos);
    return Math.abs(local.x) <= size.width / 2 && Math.abs(local.y) <= size.height / 2;
  }

  private mountItem(
    slotNode: Node,
    item: ItemSpec,
    state: LevelState,
    source: ShapeSource,
    cellPx: number,
  ): void {
    const node = new Node(`Item_${item.id}`);
    node.layer = this.node.layer;
    slotNode.addChild(node);

    // 托盘里也要反映当前朝向（`state.trayRotations`）——旋转是 M2-2 的事，
    // 但读取口径现在就对齐，免得到时"托盘看着是横的、放下去变竖的"。
    const rotation = trayRotationOf(state, item.id);
    const cells = rotateBy(item.cells, rotation);
    const view = node.addComponent(ItemView);
    // M4-6：rotation 透传——真图子节点要按当前朝向旋转（贴图帧永远是 0 朝向画布）
    view.init(item, cellPx, source.shapeMetrics(cells), rotation);
    // M4-5a：真图（异步就绪；缓存已热则同步换上）。回调里判 node.isValid——
    // 托盘每次 render 也全量重建（与 ItemLayer 同机制），晚到的帧可能已无主。
    ensureFrame(item.itemType, (frame) => {
      if (frame === null || !node.isValid) return;
      view.setSpriteFrame(frame);
    });

    const box = bboxOf(cells);
    const slot = slotNode.getComponent(TraySlot);
    slot?.setItem(node, box.height, box.width);
  }

  private clear(): void {
    for (const slot of this.slots) {
      slot.node.removeFromParent();
      slot.node.destroy();
    }
    this.slots = [];
  }
}
