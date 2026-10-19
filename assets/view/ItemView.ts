/**
 * 一件物品的**占位渲染**（实施计划 M1-2）。
 *
 * 边界（与 `GridCellView` 同构，别越界）：
 * - **不做 RC ↔ 像素转换**。包围盒尺寸与逐格中心偏移由 `BoardView.shapeMetrics()` 给，
 *   格边长由 `BoardView.getCellPx()` 给（参数名 `unit`），本文件只做
 *   "以单格为尺子的绘制细节"（内缩 / 圆角 / 居中）——这是 R-A6 允许的那部分。
 * - **不持有玩法状态**。是否在盘上、朝向如何，都是调用方说了算（M1-6 起由事件驱动）。
 * - **不加载资源**。色块用 `Graphics` 画（TDD T5 路线）；`setSpriteFrame()`
 *   是 M4-5a 的真图入口——有帧挂 Sprite、关 Graphics，无帧保持色块，
 *   **节点尺寸与结构不动**（换真图布局不跳）。
 *
 * 两条验收都落在这一层：
 * - 「1 格物品看起来是 1 格」→ 节点尺寸**严格等于**包围盒 `rows × cols` 个格
 *   （TDD 17.4：占位图按最终规格的包围盒绘制，换真图布局不跳）。
 * - 「相邻物品明度可区分」→ 填充色 = 基色按 trayOrder 轮换 × 按占格数分档（core/palette）。
 */

import { Color, Component, Graphics, Node, Sprite, SpriteFrame, UITransform, Vec3, _decorator } from 'cc';
import { DEBUG } from 'cc/env';

import {
  UI_ITEM_BORDER_PX,
  UI_ITEM_CELL_INSET_RATIO,
  UI_ITEM_RADIUS_RATIO,
  UI_PALETTE,
  itemFillHex,
  rotatedCenterOffset,
} from '../core';
import type { ItemSpec, RC, Rotation } from '../core';

const { ccclass } = _decorator;

/**
 * 物品像素指标的提供者（R-A6：**只有 `BoardView` 能实现**）。
 *
 * 托盘也要画物品，但它不该因此拥有第二套格→像素换算——
 * 所以这里只声明能力，由 `BoardView` 提供实现（M1-3 起托盘也走这个口子）。
 */
export interface ShapeSource {
  getCellPx(): number;
  shapeMetrics(cells: readonly RC[]): ShapeMetrics;
}

/** 形状的像素指标。`BoardView` 产出（唯一的格算术出口），`ItemView` 只消费 */
export interface ShapeMetrics {
  /** 包围盒像素尺寸 */
  readonly size: { readonly width: number; readonly height: number };
  /** 每格中心相对包围盒左上角的局部偏移，顺序与 `cells` 一致 */
  readonly centers: readonly Vec3[];
  /** 包围盒的格数（DEBUG 对账用：尺寸应等于 `rows × cols` 个格） */
  readonly rows: number;
  readonly cols: number;
}

@ccclass('ItemView')
export class ItemView extends Component {
  private itemId = '';
  private unit = 0;
  private metrics: ShapeMetrics | null = null;
  private fillHex = '#FFFFFF';
  /** 当前朝向（0..3 = 顺时针 90° 圈数）。M4-6：真图子节点要跟着它转 */
  private rotation: Rotation = 0;
  private graphics: Graphics | null = null;
  /** 已登记的真图帧（M4-5a：`propAssets` 就绪回调送进来；无图关卡恒 null） */
  private spriteFrame: SpriteFrame | null = null;
  /**
   * 真图Sprite的挂点（子节点，惰性创建）。
   *
   * 为什么不能挂主节点：引擎**一节点只准一个 renderable**——`Graphics` 在
   * `__preload` 就占了节点的 `uiComp` 位，`onDisable` 不让位，只有 `onDestroy`
   * （帧末）才清。同帧「禁 Graphics + 加 Sprite」会吃 warnID 12002 且 Sprite
   * **不被注册**（实测：四个物品全隐形）。子节点按「画布→包围盒等比映射 +
   * 旋转对齐」算尺寸/位置/朝向，见 `createArtNode`。
   */
  private artNode: Node | null = null;

  /**
   * @param item      物品规格（只读；着色取 `trayOrder` 与 `cells.length`）
   * @param unit      单格边长像素，来自 `BoardView.getCellPx()`
   * @param metrics   包围盒尺寸与逐格中心偏移，来自 `BoardView`（**当前朝向**）
   * @param rotation  当前朝向（0..3 = 顺时针 90° 圈数，与 core `rotateBy` 同口径）。
   *                   M4-5a 时不需要它（画布与包围盒同比例，怎么映射都不变形）；
   *                   M4-6 起真图子节点要按它旋转，否则旋转后两轴缩放不同被拉扁
   *                   （实测 2×4 薄外套 0.59 vs 2.38）。
   */
  init(item: ItemSpec, unit: number, metrics: ShapeMetrics, rotation: Rotation = 0): void {
    this.itemId = item.id;
    this.unit = unit;
    this.metrics = metrics;
    this.rotation = rotation;
    this.fillHex = itemFillHex(item.trayOrder, item.cells.length);

    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(metrics.size.width, metrics.size.height);
    // 锚点固定在**左上角**：与 `BoardView.gridToLocal`（格左上角口径）对齐，
    // 这样"摆放位置 = 锚点格左上角"，不用在两处各减一次半格。
    transform.setAnchorPoint(0, 1);

    this.graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.redraw();
  }

  /**
   * M4-5a 真图入口：**有帧在子节点挂 Sprite、关主节点 Graphics；无帧保持占位色块**。
   *
   * 由 `propAssets.ensureFrame` 的回调调用（同步 = 缓存已热，异步 = 加载
   * 刚完成）。对 `null` 是幂等空操作——缺图关卡（L6~L10）每次重建节点都会
   * 调到，不能有副作用。
   *
   * 换图**不动结构**（M1-2 立下的验收）：
   * - 主节点尺寸由 `init()` 按包围盒定死，这里不碰主节点 UITransform；
   * - Sprite 走**子节点**（主节点的 renderable 位被 Graphics 占着，引擎禁止
   *   一位两 renderable，见 `artNode` 注释）；
   * - 子节点尺寸/位置按「画布→包围盒等比映射 + 旋转对齐」算（见
   *   `createArtNode`），`SizeMode.CUSTOM` 下贴图 1:1 适配子节点——trim
   *   边距保留、不变形；画布纵横比 = 占格纵横比（每格 96px 的 cols×rows
   *   画布对 cols×rows 格节点），映射即等比。
   */
  setSpriteFrame(frame: SpriteFrame | null): void {
    this.spriteFrame = frame;
    if (frame === null) return;

    if (this.graphics !== null) this.graphics.enabled = false;
    const art = this.artNode ?? this.createArtNode(frame);
    const sprite = art.getComponent(Sprite) ?? art.addComponent(Sprite);
    // **必须先设 type/sizeMode 再设 spriteFrame**：frame 的 setter 内部会跑
    // `_applySpriteSize()`，按**当时**的 sizeMode 决定是否改节点尺寸——默认
    // TRIMMED 会把节点啃成 trimmed 像素尺寸（实测：228×114 → 172×71，美术
    // 缩水还贴在左上）。CUSTOM(0) 下 `_applySpriteSize` 两个分支都不进，
    // 子节点尺寸这才保得住。
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    if (DEBUG) {
      const t = art.getComponent(UITransform);
      console.log(
        `[ItemView] ${this.itemId} setSpriteFrame: rect=${frame.rect.width}x${frame.rect.height}@(${frame.rect.x},${frame.rect.y})` +
          ` offset=(${frame.offset.x},${frame.offset.y}) original=${frame.originalSize.width}x${frame.originalSize.height}` +
          ` rot=${this.rotation} artSize=${t?.contentSize.width}x${t?.contentSize.height}` +
          ` artPos=(${art.position.x},${art.position.y},${art.position.z})` +
          ` artEuler=(${art.eulerAngles.x},${art.eulerAngles.y},${art.eulerAngles.z})` +
          ` nodePos=(${this.node.position.x},${this.node.position.y},${this.node.position.z})` +
          ` spriteEnabled=${sprite.enabled} spriteType=${sprite.type} sizeMode=${sprite.sizeMode}`,
      );
    }
  }

  /**
   * 建真图子节点：**画布 → 包围盒等比映射 + 旋转对齐**（M4-6 重写）。
   *
   * 引擎的 sizeMode 都会把 trimmed 内容拉伸去填节点（CUSTOM 填满、TRIMMED
   * 改节点尺寸），trim 边距大的件会被拉变形（实测：长裙 trimmed 172×268
   * 填进 288×288 → 横向多拉 56%）。所以自己算：显示尺寸 = trimmed 尺寸 ×
   * 等比因子（画布与包围盒同为 cols×rows 比例），CUSTOM 下 1:1 填满子节点，
   * trim 边距原样保留。
   *
   * ## trim 偏移为什么必须用 `frame.offset` 反解（M4-5a 实测教训）
   *
   * **不能直接用 `frame.rect.x/y`**：项目的自动图集会在运行时重建，把缓存里
   * SpriteFrame 的 texture 和 rect 换成图集页坐标——DEBUG 实证同一帧对象的
   * rect 从画布坐标 `(10,12)` 变成图集坐标 `(304,14)`。用 rect.x/y 算位置的
   * 节点，在图集切换**之后**创建就会被摆到盘子外（手机 art 被放到 x=361，
   * 而节点才 228 宽 → 整件隐形）。图集切换前碰巧创建的节点（托盘首批）
   * 反而正常——**同一个 bug 两种表现，全凭创建时机**。
   *
   * `offset` 是「trimmed 内容中心相对原图画布中心」的量（y 向上），图集
   * 前后不变（否则引擎自己的 TRIMMED 贴图也会跳）。本方法不反解左上角，
   * 直接用这个中心偏移（换算到画布 y 向下口径就是 `(offset.x, −offset.y)`），
   * 已用四件 L1 图的 meta（trimX/trimY/offsetX/offsetY）逐一代数验证。
   *
   * ## 旋转对齐（M4-6）
   *
   * 可旋转物品旋转后，`ItemLayer`/`TrayView` 按旋转后的包围盒**重建本节点**
   * （`render()` 全量重建），而贴图帧永远是 rotation=0 朝向的画布。所以：
   * - 子节点锚点 **(0.5, 0.5)**，绕自身中心旋转，不按左上角摆；
   * - 内容中心偏移按物品圈数 CW 旋转（core `rotatedCenterOffset`，与
   *   `rotateBy` 同向——七形×四向单测钉死）；
   * - 子节点 `rotation.z = −90° × rotation`：Cocos 局部 y 向上，+z 在屏幕上
   *   是逆时针；图画要顺时针才与 cells 的 `rotateCW`（右臂→下一行）一致；
   * - **旋转保心**：包围盒中心旋转前后是同一点，所以子节点中心 = 包围盒
   *   中心 + 旋转后的内容偏移，与朝向无关。
   */
  private createArtNode(frame: SpriteFrame): Node {
    const child = new Node('Art');
    child.layer = this.node.layer;
    this.node.addChild(child);

    const parent = this.node.getComponent(UITransform);
    const transform = child.addComponent(UITransform);
    const rect = frame.rect;
    const original = frame.originalSize;
    // 等比因子：画布与基础包围盒同为 cols×rows 比例。偶数圈父节点就是基础
    // 包围盒（宽/原宽）；奇数圈父节点宽 = 画布高（宽/原高）——两种口算出来
    // 是同一个值（同比），只是别拿错维度（M4-6 修复前正是两轴各除各的）。
    const odd = this.rotation % 2 === 1;
    const scale =
      original.width > 0 && parent !== null
        ? parent.contentSize.width / (odd ? original.height : original.width)
        : 1;
    transform.setContentSize(rect.width * scale, rect.height * scale);
    transform.setAnchorPoint(0.5, 0.5);
    // 内容中心相对画布中心的偏移（画布 y 向下）→ 随物品 CW 旋转
    const off = rotatedCenterOffset(frame.offset.x, -frame.offset.y, this.rotation);
    // 子节点中心（父局部，y 向上）：包围盒中心 + 旋转后偏移（y 向下→向上取负）
    const parentW = parent !== null ? parent.contentSize.width : original.width;
    const parentH = parent !== null ? parent.contentSize.height : original.height;
    child.setPosition(parentW / 2 + off.x * scale, -(parentH / 2 + off.y * scale));
    // setRotationFromEuler 单位是度（引擎内部 Quat.fromEuler 乘 halfToRad）
    child.setRotationFromEuler(0, 0, -90 * this.rotation);
    this.artNode = child;
    return child;
  }

  /** 已登记的贴图（无图关卡恒为 null）。M1-3 起托盘/棋盘节点靠 `getItemId()` 反查 */
  getSpriteFrame(): SpriteFrame | null {
    return this.spriteFrame;
  }

  getItemId(): string {
    return this.itemId;
  }

  /**
   * DEBUG 对账用：把「逻辑格数 / 包围盒像素 / 单格边长」三个数摆在一起，
   * 「1 格物品看起来是 1 格」就是靠这三个数自洽看出来的
   * （例如 1×2 格、单格 57px 时，节点应为 114×57px）。
   */
  describe(): string {
    const metrics = this.metrics;
    if (metrics === null) return `${this.itemId}(未初始化)`;
    return (
      `${this.itemId} ${metrics.rows}×${metrics.cols}格=${metrics.size.width}×${metrics.size.height}px` +
      ` @${this.unit}px ${this.fillHex}`
    );
  }

  private redraw(): void {
    const g = this.graphics;
    const metrics = this.metrics;
    if (g === null || metrics === null) return;

    // 每格留一道内缩缝：多格物品才**数得出格数**（TDD 17.6 A-01 缩略图测试）
    const inset = this.unit * UI_ITEM_CELL_INSET_RATIO;
    const side = this.unit - inset * 2;
    const radius = Math.min(side * UI_ITEM_RADIUS_RATIO, side / 2);

    const fill = Color.fromHEX(new Color(), this.fillHex);
    const stroke = Color.fromHEX(new Color(), UI_PALETTE.brown);

    g.clear();
    for (const center of metrics.centers) {
      const x = center.x - side / 2;
      const y = center.y - side / 2;
      g.fillColor = fill;
      g.roundRect(x, y, side, side, radius);
      g.fill();
      g.strokeColor = stroke;
      g.lineWidth = UI_ITEM_BORDER_PX;
      g.roundRect(x, y, side, side, radius);
      g.stroke();
    }
  }
}
