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
 * 已知缺口（明确留给 M2，不假装完成）：物品多于一行放得下时，超出的槽位
 * 暂时 `active = false` 并告警。UI Spec 5.2 要的是**横向滚动**，
 * 而滚动与"从托盘拖起"共享同一套手势仲裁（点 vs 拖 vs 滑），
 * 那是 M1-4 `DragController` 的活，M1-3 先不抢。
 */

import { Component, Node, UITransform, _decorator } from 'cc';
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
  findItem,
  rotateBy,
  trayRotationOf,
} from '../core';
import type { ItemSpec, LevelSpec, LevelState } from '../core';
import { ItemView } from './ItemView';
import type { ShapeSource } from './ItemView';
import { TraySlot } from './TraySlot';

const { ccclass } = _decorator;

@ccclass('TrayView')
export class TrayView extends Component {
  /**
   * 点选请求。`itemId === null` = 点了托盘空白处（UI Spec 6 节：取消高亮回 Idle）。
   * M1-6 接线后仍在——只是那时的调用方从"本组件"变成"事件分发"。
   */
  onSelect: ((itemId: string | null) => void) | null = null;

  private slots: TraySlot[] = [];

  onLoad(): void {
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(TrayView.contentWidth(), UI_TRAY_HEIGHT - UI_TRAY_PADDING * 2);
    this.node.setPosition(0, UI_TRAY_BAND_CENTER_Y, 0);

    // 点托盘空白 → 取消选中（冒泡被槽位掐断时不会走到这里）
    this.node.on(Node.EventType.TOUCH_END, this.onEmptyTouched, this);
  }

  onDestroy(): void {
    this.node.off(Node.EventType.TOUCH_END, this.onEmptyTouched, this);
  }

  /** 按 `state.tray` 重建全部槽位。MVP 不做增量 diff（与 `BoardView` 同策略） */
  render(state: LevelState, level: LevelSpec, source: ShapeSource): void {
    this.clear();

    const count = state.tray.length;
    const slotSize = TrayView.slotSizeFor(count);
    const visible = TrayView.visibleCount(slotSize);
    const cellPx = source.getCellPx();

    let index = 0;
    for (const itemId of state.tray) {
      const item = findItem(level, itemId);
      if (item === undefined) continue;

      const slot = this.createSlot(itemId, slotSize, index);
      if (index >= visible) {
        // 溢出：先不画（否则会越出托盘压到工具栏上），等 M2 的横向滚动
        slot.node.active = false;
      }
      this.mountItem(slot.node, item, state, source, cellPx);
      index++;
    }

    this.applyState(state);

    if (DEBUG) {
      const shown = Math.min(count, visible);
      console.log(
        `[TrayView] 托盘 ${count} 件（槽位 ${slotSize}px，可见 ${shown}/${count}）：` +
          this.slots.map((s) => s.describe()).join(' '),
      );
      if (count > visible) {
        console.warn(
          `[TrayView] 托盘溢出：${count} 件放不下（槽位已压到 ${slotSize}px，热区下限 ${UI_TRAY_SLOT_MIN}px）` +
            ` —— UI Spec 5.2 要求横向滚动，留给 M2（与 M1-4 拖起手势合并实现）`,
        );
      }
    }
  }

  /** 只刷新选中态（不重建节点）。点选后的常规路径走这里 */
  applyState(state: LevelState): void {
    for (const slot of this.slots) {
      slot.setVisual(slot.getItemId() === state.selectedId ? 'selected' : 'normal');
    }
  }

  /** 槽位在托盘内的中心 x：左对齐逐个排开 */
  static slotCenterX(index: number, slotSize: number): number {
    return -TrayView.contentWidth() / 2 + slotSize / 2 + index * (slotSize + UI_TRAY_GAP);
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

  /** 一行放得下几个（含间距） */
  static visibleCount(slotSize: number): number {
    return Math.floor((TrayView.contentWidth() + UI_TRAY_GAP) / (slotSize + UI_TRAY_GAP));
  }

  private static contentWidth(): number {
    return UI_DESIGN_WIDTH - UI_SAFE_MARGIN * 2;
  }

  private createSlot(itemId: string, slotSize: number, index: number): TraySlot {
    const node = new Node(`Slot_${itemId}`);
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(TrayView.slotCenterX(index, slotSize), 0, 0);

    const slot = node.addComponent(TraySlot);
    slot.init(itemId, slotSize);
    slot.onSelect = (id) => this.onSelect?.(id);
    this.slots.push(slot);
    return slot;
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
    const cells = rotateBy(item.cells, trayRotationOf(state, item.id));
    const view = node.addComponent(ItemView);
    view.init(item, cellPx, source.shapeMetrics(cells));

    const slot = slotNode.getComponent(TraySlot);
    slot?.setItem(node);
  }

  private onEmptyTouched(): void {
    this.onSelect?.(null);
  }

  private clear(): void {
    for (const slot of this.slots) {
      slot.node.removeFromParent();
      slot.node.destroy();
    }
    this.slots = [];
  }
}
