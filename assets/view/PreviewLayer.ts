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
 * - **取出**（`takeout === true`：手指在托盘带内，或物品中心出棋盘外扩半格）→
 *   物品**半透明**中立色实心块（白填充 + 棕描边），跟随手指；与 `TrayView` 的
 *   取出目标位高亮配合。**禁止红色非法**（UI Spec 6：拖到棋盘外还显示红，
 *   玩家会以为松手失败而缩回去，这条规则就形同不存在）。
 *
 *   M1-5 时这一态是"直接隐藏 ghost"——V1.1 取出规格（PRD R-06b）落地后改为
 *   半透明：「藏掉」不等于「半透明」，玩家看不到自己在拖什么，就谈不上
 *   "预期落点"。三态因此全部靠**形状 + 颜色双通道**区分：实心绿 / 空心红虚线 /
 *   半透明白。
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
 * ## 手指遮挡补偿（G1-1）—— M3-1 真机校准后上浮改为 0
 *
 * 拖起时 ghost 曾整体上浮 `UI_DRAG_LIFT_PX` + 轻微放大 `UI_DRAG_LIFT_SCALE` +
 * 右下浅阴影（UI Spec 6 节「手指不遮挡目标格的视觉偏移策略」）。**M3-1 真机
 * 试玩（2026-10-17，G1-D1）把这个值校准为 0**：上浮只改画法不改判定，ghost
 * 被画在落点格上方 24 设计单位而松手落手指正下方的格——玩家按绿色块对格，
 * 落点系统性偏下一格（6×6 棋盘上 0.42 格），反馈原话「总感觉没放到正确的
 * 方格上」。校准后 ghost 与落点格像素级重合，「松手落格 = 预览所示格」
 * （G1-2）从概念成立变成**视觉成立**。遮挡担忧经内容核对不成立：63 件物品
 * 最小 1×2，ghost 本体始终伸过指腹；描边 + 半透明填充 + 1.05 放大补住可读性。
 * 完整依据与逆反方案见 `config.ts` 的 `UI_DRAG_LIFT_PX` 注释。
 *
 * **三条硬约束（不变）**：
 * 1. **只改画法，不改判定**——落点仍由手指位置经 `snapToGrid` 算出，`preview.anchor`
 *    一个字都不动，上浮为 0 后画出来的格就是 anchor 的格；
 * 2. **不挪本节点**——M1-7 实测过，位移 tween 不归位会留下 8px 持久偏移（见 `stopShake`）；
 * 3. 缩放锚点取**整体包围盒中心**（`core/geometry/lift.ts`），取单格中心会让多格物品散开。
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
  UI_DRAG_LIFT_PX,
  UI_DRAG_LIFT_SCALE,
  UI_DRAG_SHADOW_ALPHA,
  UI_DRAG_SHADOW_OFFSET_PX,
  UI_ITEM_CELL_INSET_RATIO,
  UI_ITEM_RADIUS_RATIO,
  UI_PALETTE,
  findItem,
  liftAndScale,
  offsetRects,
  rotateBy,
} from '../core';
import type { DragPreview, LevelSpec, Rect } from '../core';
import { BoardView } from './BoardView';
import { shakeX, stopShake } from './shake';

const { ccclass, property } = _decorator;

/** 合法态填充透明度（0–1） */
const VALID_FILL_ALPHA = 0.4;
/** 非法态描边透明度 */
const INVALID_STROKE_ALPHA = 0.85;
/** 取出态填充透明度（M2-5：物品半透明，中立色——不是红也不是绿） */
const TAKEOUT_FILL_ALPHA = 0.45;

/** 圆角：占短边比例，且不超过短边一半（短边退化时不会变成胶囊） */
function radiusOf(r: Rect): number {
  const short = Math.min(r.w, r.h);
  return Math.min(short * UI_ITEM_RADIUS_RATIO, short / 2);
}

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
   * 显示预览。`preview === null` → 隐藏（无拖拽）。
   *
   * `takeout === true` = **取出态**（M2-5：手指在托盘带内或物品中心出棋盘
   * 外扩半格，由 `DragController.isTakeoutState` 判定）：画半透明中立色，
   * **不画红**。本组件不碰 `TrayView` 的命中、也不算几何，只据此决定画什么。
   */
  show(preview: DragPreview | null, takeout: boolean): void {
    this.stopShake();
    if (preview === null) {
      if (DEBUG) console.log('[PreviewLayer] ghost 隐藏（无预览）');
      this.clear();
      this.current = null;
      return;
    }
    this.current = preview;
    this.drawGhost(preview, takeout);
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

  private drawGhost(preview: DragPreview, takeout: boolean): void {
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

    // 逐格矩形（未补偿）。`metrics.centers` 相对包围盒左上角，corner 也是左上角口径
    const base: Rect[] = metrics.centers.map((center) => ({
      x: corner.x + center.x - side / 2,
      y: corner.y + center.y - side / 2,
      w: side,
      h: side,
    }));

    // 视觉补偿（G1-1）：缩放 + 上浮，两个量都在 config.ts。M3-1 真机校准后
    // 上浮 = 0（见 UI_DRAG_LIFT_PX 注释：非 0 上浮让 ghost 与落点格错位一整格的
    // 零头，玩家按 ghost 对格会系统偏下一格）——现在画出来的格就是 anchor 的格，
    // 「松手落格 = 预览所示格」视觉级成立；1.05 放大保留（"看得出抬起"）。
    // 判定一个字没动（落点仍由手指位置算），节点也不挪（M1-7 实测：位移 tween
    // 不归位会留下持久偏移，见 stopShake）。
    const lifted = liftAndScale(base, UI_DRAG_LIFT_SCALE, UI_DRAG_LIFT_PX);
    // 阴影落右下（y 向上为正 → 向下是负）。UI Spec 4.1「右下短而淡」
    const shadow = offsetRects(lifted, UI_DRAG_SHADOW_OFFSET_PX, -UI_DRAG_SHADOW_OFFSET_PX);

    g.clear();

    // 1) 抬起阴影：先画，压在 ghost 下面
    const shadowColor = Color.fromHEX(new Color(), UI_PALETTE.brown);
    shadowColor.a = Math.round(255 * UI_DRAG_SHADOW_ALPHA);
    g.fillColor = shadowColor;
    for (const r of shadow) {
      g.roundRect(r.x, r.y, r.w, r.h, radiusOf(r));
      g.fill();
    }

    if (takeout) {
      // 取出态（M2-5）：半透明中立色实心块 + 棕色细实线。**没有红色**——
      // UI Spec 6：拖到棋盘外还显示非法红，玩家会以为松手失败而缩回去。
      // 与合法（实心绿）/ 非法（空心红虚线）双通道可分
      const fill = Color.fromHEX(new Color(), UI_PALETTE.surfaceWhite);
      fill.a = Math.round(255 * TAKEOUT_FILL_ALPHA);
      g.fillColor = fill;
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.brown);
      g.lineWidth = 2;
      for (const r of lifted) {
        g.roundRect(r.x, r.y, r.w, r.h, radiusOf(r));
        g.fill();
        g.roundRect(r.x, r.y, r.w, r.h, radiusOf(r));
        g.stroke();
      }
    } else if (preview.check.ok) {
      // 合法：半透明实心块 + 实线描边
      const fill = Color.fromHEX(new Color(), UI_PALETTE.valid);
      fill.a = Math.round(255 * VALID_FILL_ALPHA);
      g.fillColor = fill;
      g.strokeColor = Color.fromHEX(new Color(), UI_PALETTE.valid);
      g.lineWidth = 2;
      for (const r of lifted) {
        g.roundRect(r.x, r.y, r.w, r.h, radiusOf(r));
        g.fill();
        g.roundRect(r.x, r.y, r.w, r.h, radiusOf(r));
        g.stroke();
      }
    } else {
      // 非法：红色虚线轮廓（无填充）。与合法态形状区分：实心 vs 空心、实线 vs 虚线
      const stroke = Color.fromHEX(new Color(), UI_PALETTE.invalid);
      stroke.a = Math.round(255 * INVALID_STROKE_ALPHA);
      g.strokeColor = stroke;
      g.lineWidth = 3;
      for (const r of lifted) {
        this.dashRect(g, r.x, r.y, r.w, r.h, 7, 5);
      }
      g.stroke();
    }

    if (DEBUG) {
      const reason = takeout ? '取出态' : preview.check.ok ? 'ok' : preview.check.reason;
      const p = this.node.position;
      console.log(
        `[PreviewLayer] ghost ${preview.itemId}@(${preview.anchor[0]},${preview.anchor[1]})` +
          ` rot=${preview.rotation} → ${reason}` +
          // 上浮量打印出来供取证对表（M3-1 真机校准为 0：ghost 与 anchor 格
          // 像素级重合，量它等于量落点格）
          ` lift=+${UI_DRAG_LIFT_PX} scale=${UI_DRAG_LIFT_SCALE}` +
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
