/**
 * 拖拽预览层（实施计划 M1-5）。
 *
 * ## 三态 ghost（合法 / 非法 / 取出）
 *
 * - **合法**（`preview.check.ok === true`）→ 半透明绿色实心块 + 实线描边，落在
 *   `preview.anchor` 处，告诉玩家"松手就放这儿"。
 * - **非法**（`ok === false`）→ 红色**虚线**轮廓（无填充）。**不靠颜色单通道**：
 *   合法是实心块、非法是空心虚线，形状本身就能区分（TDD 17.5 无障碍要求）。
 *   且不自动纠偏（TDD 6.3 裁决 D-04）：只提示，不代劳。
 * - **取出**（手指在托盘带内）→ ghost 隐藏。这一态由 `DragController.overTray`
 *   判定（几何事实，不是碰撞），本层只据此决定画不画。
 *
 * ## 边界
 *
 * - **view 不自查碰撞**（M1-5 验收口径）：合法性 100% 来自 `preview.check`，
 *   本组件从不调 `canPlace`。M1-5 阶段 `preview` 由 `GameController` 的挂具构造
 *   （用 `canPlace` 算 check），M1-6 一接线就换成 `session.getPreview()`，
 *   本组件一行不动——因为 `DragPreview` 形状不变。
 * - **不做格→像素算术**：`gridToLocal` / `shapeMetrics` / `getCellPx` 全从
 *   `BoardView` 拿（R-A6 唯一出口），本文件只做"以单格为尺子的绘制细节"
 *   （内缩 / 圆角 / 虚线），与 `ItemView` 同构。
 * - **不持有玩法状态**：`level` 只是用来查物品形状（只读），不读 `placements`。
 *
 * ## 松手回弹（P-05：120–180ms）
 *
 * 非法松手时 ghost 抖一下再消失（`tween` 位移 ±8px、160ms），作为"放不下"的
 * 视觉反馈。**这是 M1-5 的最小回弹**：完整的"物品飞回原位"动画要等 M1-6 的
 * `ItemLayer`（被拖物品本体那时才有节点可飞）。
 *
 * 抖动**允许被打断**（非法松手后 160ms 内又抓了一次）：`show()`/`endPreview()`
 * 一律走 `stopShake()`——停 tween 并把节点放回 `basePosition`。只停不归位的
 * 话节点会留在 ±8px 上，ghost 整场跟着偏（M1-7 实测复现并修复）。
 */

import { Color, Component, Graphics, Node, UITransform, Vec3, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_ITEM_CELL_INSET_RATIO,
  UI_ITEM_RADIUS_RATIO,
  UI_PALETTE,
  findItem,
  rotateBy,
} from '../core';
import type { DragPreview, LevelSpec } from '../core';
import { BoardView } from './BoardView';
import { shakeX, stopShake } from './shake';

const { ccclass, property } = _decorator;

/** 合法态填充透明度（0–1） */
const VALID_FILL_ALPHA = 0.4;
/** 非法态描边透明度 */
const INVALID_STROKE_ALPHA = 0.85;

@ccclass('PreviewLayer')
export class PreviewLayer extends Component {
  @property(BoardView)
  boardView: BoardView | null = null;

  private level: LevelSpec | null = null;
  private graphics: Graphics | null = null;
  /** 当前显示的预览（`endPreview` 据此判断要不要抖一下） */
  private current: DragPreview | null = null;
  /**
   * 本节点的**基准位**（onLoad 时场景给的位置：与 BoardRoot 同位，ghost 才能用
   * board 局部坐标画）。停抖动时必须回到它——见 `stopShake`。
   */
  private basePosition: Vec3 = new Vec3();

  override onLoad(): void {
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    // 尺寸只是占位：Graphics 不被 UITransform 裁剪，越界 ghost（非法出界）照样画得出来
    transform.setAnchorPoint(0.5, 0.5);
    this.graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.basePosition = this.node.position.clone();
  }

  /** 由 `GameController` 在装配时调一次，告诉它要查哪一关的物品形状 */
  init(level: LevelSpec): void {
    this.level = level;
  }

  /**
   * 显示预览。`preview === null` 或 `overTray === true` → 隐藏（取出态 / 无拖拽）。
   *
   * `overTray` 是「手指在托盘带内」的几何判定，由 `DragController` 给——
   * 本组件不碰 `TrayView` 的命中，只据此决定画不画。
   */
  show(preview: DragPreview | null, overTray: boolean): void {
    this.stopShake();
    if (preview === null || overTray) {
      if (DEBUG) {
        console.log(`[PreviewLayer] ghost 隐藏（${overTray ? '取出态：手指在托盘带内' : '无预览'}）`);
      }
      this.clear();
      this.current = null;
      return;
    }
    this.current = preview;
    this.drawGhost(preview);
  }

  /**
   * 松手收尾。`invalid === true` → 非法松手，抖一下再清；否则直接清。
   *
   * 合法松手 / 取出 / 主动取消 都走 `invalid === false`（不抖）——
   * 抖动专属"放不下"的负反馈，别滥用。
   */
  endPreview(invalid: boolean): void {
    this.stopShake();
    if (DEBUG) console.log(`[PreviewLayer] endPreview invalid=${invalid} → ${invalid ? '抖动后清' : '直接清'}`);
    if (invalid && this.current !== null) {
      this.shakeAndClear();
    } else {
      this.clear();
    }
    this.current = null;
  }

  /**
   * 停掉进行中的抖动，并把节点放回基准位。
   *
   * 为什么必须归位：抖动是**位移 tween**，`Tween.stopAllByTarget` 只停动画，
   * 节点会留在被打断那一帧的 ±8px 偏移上——而 ghost 是按本节点局部坐标画的，
   * 偏移会整场跟着偏。更糟的是 `shakeAndClear` 若以**当前**位置为基准，偏移
   * 会被下一次抖动"继承"、越叠越偏。
   *
   * 触发条件苛刻（非法松手后约 160ms 内连抓），但一旦触发就是持久视觉偏移。
   * M1-7 期实测复现：抖动开始后 91ms 起下一次拖拽，节点被留在 +2.78px。
   */
  private stopShake(): void {
    // 与 ItemLayer 共用一份实现：只停不归位会让节点留在 ±8px 上
    stopShake(this.node, this.basePosition);
  }

  // ───────────────────────── 绘制 ─────────────────────────

  private drawGhost(preview: DragPreview): void {
    const g = this.graphics;
    const board = this.boardView;
    const level = this.level;
    if (g === null || board === null || level === null) return;

    const item = findItem(level, preview.itemId);
    if (item === undefined) {
      this.clear();
      return;
    }

    const cells = rotateBy(item.cells, preview.rotation);
    const metrics = board.shapeMetrics(cells);
    const unit = board.getCellPx();
    const corner = board.gridToLocal(preview.anchor[0], preview.anchor[1]);

    // 与 ItemView 同构的绘制参数（R-A6：unit 来自 BoardView，本文件只做绘制细节）
    const inset = unit * UI_ITEM_CELL_INSET_RATIO;
    const side = unit - inset * 2;
    const radius = Math.min(side * UI_ITEM_RADIUS_RATIO, side / 2);

    g.clear();

    if (preview.check.ok) {
      // 合法：半透明实心块 + 实线描边
      const fill = Color.fromHEX(new Color(), UI_PALETTE.valid);
      fill.a = Math.round(255 * VALID_FILL_ALPHA);
      g.fillColor = fill;
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.valid);
      g.lineWidth = 2;
      for (const center of metrics.centers) {
        const x = corner.x + center.x - side / 2;
        const y = corner.y + center.y - side / 2;
        g.roundRect(x, y, side, side, radius);
        g.fill();
        g.roundRect(x, y, side, side, radius);
        g.stroke();
      }
    } else {
      // 非法：红色虚线轮廓（无填充）。与合法态形状区分：实心 vs 空心、实线 vs 虚线
      const stroke = Color.fromHEX(new Color(), UI_PALETTE.invalid);
      stroke.a = Math.round(255 * INVALID_STROKE_ALPHA);
      g.strokeColor = stroke;
      g.lineWidth = 3;
      for (const center of metrics.centers) {
        const x = corner.x + center.x - side / 2;
        const y = corner.y + center.y - side / 2;
        this.dashRect(g, x, y, side, side, 7, 5);
      }
      g.stroke();
    }

    if (DEBUG) {
      const reason = preview.check.ok ? 'ok' : preview.check.reason;
      const p = this.node.position;
      console.log(
        `[PreviewLayer] ghost ${preview.itemId}@(${preview.anchor[0]},${preview.anchor[1]})` +
          ` rot=${preview.rotation} → ${reason}` +
          ` nodePos=(${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100})` +
          ` t=${Math.round(performance.now())}`,
      );
    }
  }

  /**
   * 沿矩形四条边画虚线（moveTo/lineTo 切段）。`Graphics` 一条 path 上可以有
   * 多个子路径，最后统一 `stroke()`，所以这里只往当前 path 里塞线段、不调 stroke。
   */
  private dashRect(g: Graphics, x: number, y: number, w: number, h: number, dash: number, gap: number): void {
    const edges: ReadonlyArray<{ readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }> = [
      { x1: x, y1: y, x2: x + w, y2: y }, // 下
      { x1: x + w, y1: y, x2: x + w, y2: y + h }, // 右
      { x1: x, y1: y + h, x2: x + w, y2: y + h }, // 上
      { x1: x, y1: y, x2: x, y2: y + h }, // 左
    ];
    for (const e of edges) {
      const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      if (len <= 0) continue;
      const dx = (e.x2 - e.x1) / len;
      const dy = (e.y2 - e.y1) / len;
      let t = 0;
      while (t < len) {
        const segEnd = Math.min(t + dash, len);
        g.moveTo(e.x1 + dx * t, e.y1 + dy * t);
        g.lineTo(e.x1 + dx * segEnd, e.y1 + dy * segEnd);
        t += dash + gap;
      }
    }
  }

  private clear(): void {
    this.graphics?.clear();
  }

  /** 非法松手：左右抖一下再清空（P-05 回弹区间） */
  private shakeAndClear(): void {
    // 基准位取 onLoad 存的，**不取当前 position**：当前可能已被上一次被打断的
    // 抖动带偏（见 stopShake），拿它当基准会把偏移继承下去
    const base = this.basePosition;
    if (DEBUG) {
      console.log(
        `[PreviewLayer] 抖动开始 t=${Math.round(performance.now())}` +
          ` base=(${base.x},${base.y})`,
      );
    }
    shakeX(this.node, base, () => {
      if (DEBUG) console.log(`[PreviewLayer] 抖动播完 t=${Math.round(performance.now())}`);
      this.clear();
    });
  }
}
