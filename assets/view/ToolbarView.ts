/**
 * 底部工具栏（M2-2，UI Spec 5.2）：撤回 / 旋转 / 重置 / 提示 四个按钮。
 *
 * ## 这是 G1-5 缺口的归属地
 *
 * 撤销在 M1 被**刻意不给临时手势**（M1-9 定案），明确"等 M2-2 工具栏"——
 * 因为撤销是破坏性且无重做、规格位置在底部工具栏、空白区手势已被「点空白取消
 * 高亮」占用，临时手势会与这些撞车。本组件就是那个落点。
 *
 * ## 四个按钮的可用态（每次 `updateState` 重算）
 *
 * - **撤回**：`session.canUndo`（撤回栈非空）。
 * - **旋转**：当前**选中**了某件且它 `rotatable`（UI Spec 113：只在选中/拖动物品
 *   时有效，否则置灰）。注意：本按钮旋转的是"已选中物品"，与 M1-8「再次点击
 *   已选中物品 = 旋转」是同一动作的两个入口（UI Spec 6 节「旋转按钮或双击」）。
 * - **重置**：棋盘上已有物品（有可重置的进度）才可用。
 * - **提示**：core 的 `suggestNextPlacement` 能给出下一步落点时才可用——
 *   这同时满足 UI Spec 152「提示未实现不得伪装成可用空按钮」（托盘空了 / 无解
 *   时直接置灰，而不是一个点了没反应的高亮按钮）。
 *
 * ## 输入隔离（与 `SafeAreaRoot` 上的 `DragController` 共存）
 *
 * 按钮与背景都 `stopPropagation`：工具栏在屏幕最底部，若不隔离，点按钮的触摸会
 * 冒泡到 `SafeAreaRoot` 被当成一次「拖拽手势的起点」。隔离靠两道：① 工具栏背景
 * 带吸收落在空白处的触摸；② 按钮自身吸收并响应点击。确认框（M2-3，本任务一并
 * 创建）的遮罩同理。
 */

import { Color, Component, EventTouch, Graphics, Label, Node, UIOpacity, UITransform, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_DESIGN_WIDTH,
  UI_PALETTE,
  UI_SAFE_MARGIN,
  UI_TOOLBAR_BUTTON_GAP,
  UI_TOOLBAR_BUTTON_HEIGHT,
  UI_TOOLBAR_BUTTON_WIDTH,
} from '../core';
import { getLayout } from './layout';

const { ccclass } = _decorator;

/** 工具栏四个按钮的可用态快照（由 `GameController.updateToolbarState` 算出） */
export interface ToolbarState {
  readonly canUndo: boolean;
  readonly canRotate: boolean;
  readonly canReset: boolean;
  readonly canHint: boolean;
}

interface ToolbarButton {
  readonly node: Node;
  readonly opacity: UIOpacity;
  enabled: boolean;
}

@ccclass('ToolbarView')
export class ToolbarView extends Component {
  /** 撤回（dispatch `{type:'undo'}`） */
  onUndo: (() => void) | null = null;
  /** 旋转当前选中物品（dispatch `{type:'rotate', itemId}`） */
  onRotate: (() => void) | null = null;
  /** 重置（先弹 ConfirmDialog，确认后才 dispatch `{type:'reset'}`） */
  onReset: (() => void) | null = null;
  /** 提示（core `suggestNextPlacement` 高亮下一步落点） */
  onHint: (() => void) | null = null;

  private built = false;
  private buttons = new Map<string, ToolbarButton>();

  override onLoad(): void {
    const layout = getLayout();
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(UI_DESIGN_WIDTH, layout.band.toolbar);
    // 工具栏带在最底部（屏幕下边缘），中心 y 由活动布局推导（M3-5 压缩阶梯联动）
    this.node.setPosition(0, layout.toolbarBandCenterY, 0);
  }

  /**
   * 显示工具栏（首次调用顺带懒加载构建）。`GameController` 在装配时调一次。
   */
  show(): void {
    this.buildOnce();
    this.node.active = true;
  }

  /**
   * 「旋转」按钮节点（第 3 关引导要圈出它，M2-6 / GDD 3.3）。
   *
   * 返回**节点**而不是常量坐标：按钮位置由 `buildOnce` 按 config 的按钮宽与间距
   * 排出来，让调用方另算一遍就是第二份布局真相（两份必然分叉）。
   * 按钮是懒建的，`show()` / `updateState()` 之前返回 `null`。
   */
  rotateButtonNode(): Node | null {
    return this.buttons.get('rotate')?.node ?? null;
  }

  /**
   * 重算四个按钮的可用态。**每次状态变更都要调**（选中变化、撤回栈变化、进度
   * 变化都会改可用态）——不是懒加载的 `built` 提前 return 能吞掉的（M1-7 教训）。
   */
  updateState(state: ToolbarState): void {
    this.buildOnce();
    this.applyEnabled('undo', state.canUndo);
    this.applyEnabled('rotate', state.canRotate);
    this.applyEnabled('reset', state.canReset);
    this.applyEnabled('hint', state.canHint);
  }

  private applyEnabled(id: string, enabled: boolean): void {
    const btn = this.buttons.get(id);
    if (btn === undefined) return;
    btn.enabled = enabled;
    // 置灰：降到 ~43% 透明度。用 UIOpacity 而非改色——色号是已确认设计令牌
    btn.opacity.opacity = enabled ? 255 : 110;
  }

  // ───────────────────────── 懒加载构建 ─────────────────────────

  private buildOnce(): void {
    if (this.built) return;
    this.built = true;

    // 工具栏背景带：① 视觉上与棋盘/托盘分隔；② 吸收落在按钮空隙的触摸，
    // 不再冒泡给 SafeAreaRoot 的 DragController（输入隔离）
    const bg = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    bg.clear();
    bg.fillColor = Color.fromHEX(new Color(), UI_PALETTE.bg);
    const toolbarH = getLayout().band.toolbar;
    bg.fillRect(-UI_DESIGN_WIDTH / 2, -toolbarH / 2, UI_DESIGN_WIDTH, toolbarH);
    // 顶部一条分隔线
    bg.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
    bg.lineWidth = 2;
    bg.moveTo(-UI_DESIGN_WIDTH / 2, -toolbarH / 2);
    bg.lineTo(UI_DESIGN_WIDTH / 2, -toolbarH / 2);
    bg.stroke();
    this.node.on(Node.EventType.TOUCH_START, (e: EventTouch) => e.propagationStopped = true, this);
    this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => e.propagationStopped = true, this);

    const defs: Array<{ id: string; label: string }> = [
      { id: 'undo', label: '撤回' },
      { id: 'rotate', label: '旋转' },
      { id: 'reset', label: '重置' },
      { id: 'hint', label: '提示' },
    ];
    const totalW = defs.length * UI_TOOLBAR_BUTTON_WIDTH + (defs.length - 1) * UI_TOOLBAR_BUTTON_GAP;
    const startX = -totalW / 2 + UI_TOOLBAR_BUTTON_WIDTH / 2;
    defs.forEach((def, i) => {
      const x = startX + i * (UI_TOOLBAR_BUTTON_WIDTH + UI_TOOLBAR_BUTTON_GAP);
      const btn = this.createButton(def.id, def.label, x);
      // 按钮自身吸收触摸（不冒泡到背景带 / SafeAreaRoot），并在可用时响应
      btn.node.on(Node.EventType.TOUCH_START, (e: EventTouch) => e.propagationStopped = true, this);
      btn.node.on(
        Node.EventType.TOUCH_END,
        (e: EventTouch) => {
          e.propagationStopped = true;
          if (!btn.enabled) {
            if (DEBUG) console.log(`[ToolbarView] 按钮「${def.label}」置灰，忽略点击`);
            return;
          }
          this.fire(def.id);
        },
        this,
      );
      this.buttons.set(def.id, btn);
    });
  }

  /** 按钮点击分发（避免用 `keyof` 索引回调，保持类型清晰） */
  private fire(id: string): void {
    if (DEBUG) {
      const label = { undo: '撤回', rotate: '旋转', reset: '重置', hint: '提示' }[id] ?? id;
      console.log(`[ToolbarView] 点击「${label}」`);
    }
    switch (id) {
      case 'undo':
        this.onUndo?.();
        break;
      case 'rotate':
        this.onRotate?.();
        break;
      case 'reset':
        this.onReset?.();
        break;
      case 'hint':
        this.onHint?.();
        break;
    }
  }

  /** 建一个按钮节点：Graphics 画底 + 子节点 Label 文字（一节点一 renderable） */
  private createButton(id: string, label: string, x: number): ToolbarButton {
    const node = new Node(`Tool_${id}`);
    node.layer = this.node.layer;
    this.node.addChild(node);
    node.setPosition(x, 0, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(UI_TOOLBAR_BUTTON_WIDTH, UI_TOOLBAR_BUTTON_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);

    const g = node.addComponent(Graphics);
    const halfW = UI_TOOLBAR_BUTTON_WIDTH / 2;
    const halfH = UI_TOOLBAR_BUTTON_HEIGHT / 2;
    const radius = 14;
    const box = () =>
      g.roundRect(-halfW, -halfH, UI_TOOLBAR_BUTTON_WIDTH, UI_TOOLBAR_BUTTON_HEIGHT, radius);
    g.fillColor = Color.fromHEX(new Color(), UI_PALETTE.surfaceWhite);
    box();
    g.fill();
    g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.border);
    g.lineWidth = 2;
    box();
    g.stroke();

    const labelNode = new Node('Label');
    labelNode.layer = node.layer;
    node.addChild(labelNode);
    const lt = labelNode.addComponent(UITransform);
    lt.setContentSize(UI_TOOLBAR_BUTTON_WIDTH - 8, UI_TOOLBAR_BUTTON_HEIGHT);
    lt.setAnchorPoint(0.5, 0.5);
    const lbl = labelNode.addComponent(Label);
    lbl.string = label;
    lbl.fontSize = 22;
    lbl.lineHeight = 26;
    lbl.color = Color.fromHEX(new Color(), UI_PALETTE.textPrimary);
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;

    // UIOpacity 控可用态（不是 renderable 组件，和 Graphics 同节点安全）
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 255;
    return { node, opacity, enabled: true };
  }

  /** DEBUG 对账：四个按钮的可用态 */
  get debugState(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const [id, btn] of this.buttons) out[id] = btn.enabled;
    return out;
  }
}
