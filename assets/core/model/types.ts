/**
 * 全局数据模型（TDD 第 5 节）。
 *
 * 本文件属于 `assets/core/`：**禁止** import `cc`、`wx`、`localStorage`
 * 或任何平台 API。core 不知道 Cocos 存在。
 *
 * 约定：所有状态字段均为 `readonly`，任何变更都产生新对象。
 * 这让「撤回栈 = 存旧对象」的实现几乎不可能写错（TDD 7.3）。
 */

/** 逻辑网格坐标 `[row, col]`。row 向下为正，原点在左上角。 */
export type RC = readonly [row: number, col: number];

/** 顺时针 90° 的次数。0..3，不含负值与 360°。 */
export type Rotation = 0 | 1 | 2 | 3;

// ─────────────────────────── 配置态（只读，来自关卡 JSON） ───────────────────────────

export interface BoardSpec {
  readonly rows: number;
  readonly cols: number;
  /** 障碍格。MVP 唯一支持的障碍类型。 */
  readonly blockedCells: readonly RC[];
}

export interface ItemSpec {
  /** 关卡内唯一，如 `"L03_D"` */
  readonly id: string;
  /** 展示名，如 `"长柄伞"` */
  readonly name: string;
  /** 主题 / 素材映射键（预留主题皮肤扩展） */
  readonly itemType: string;
  /** 资源键。MVP 允许程序化色块 fallback */
  readonly spriteKey: string;
  /** 形状占位。**必须**已归一化（minRow=minCol=0）、已按字典序排序、4 连通 */
  readonly cells: readonly RC[];
  readonly rotatable: boolean;
  /** 托盘中的初始顺序，从 1 开始且连续 */
  readonly trayOrder: number;
}

export interface LevelSpec {
  readonly levelId: number;
  readonly title: string;
  readonly board: BoardSpec;
  /** MVP 中全部物品均为必需物品（无可选物品） */
  readonly items: readonly ItemSpec[];
}

// ─────────────────────────────── 运行时状态 ───────────────────────────────

/** 一件物品在棋盘上的落位。`(row, col)` 是**旋转后**形状的左上锚点。 */
export interface Placement {
  readonly row: number;
  readonly col: number;
  readonly rotation: Rotation;
}

/**
 * 关卡已提交状态。**不可变**。
 *
 * `placements` 是占用的唯一真相源——不额外存 occupancy，
 * 占用索引每次由 `placements` 重建（TDD 5.3）。
 */
export interface LevelState {
  readonly levelId: number;
  /** 已放入棋盘的物品，key = itemId */
  readonly placements: ReadonlyMap<string, Placement>;
  /** 未放入棋盘的物品 id，保持 trayOrder 顺序 */
  readonly tray: readonly string[];
  /** 托盘中物品的当前朝向（未放置时生效）。撤回语义依赖它 */
  readonly trayRotations: ReadonlyMap<string, Rotation>;
  /** 当前选中物品，null = 无选中 */
  readonly selectedId: string | null;
}

export type GamePhase =
  /** 无选中 */
  | 'Idle'
  /** 有选中，未拖动 */
  | 'Selected'
  /** 拖动中 */
  | 'Dragging'
  /** 通关动画，冻结输入 */
  | 'WinAnimating'
  /** 通关结算，可点下一关 */
  | 'Completed';

export interface Vec2Like {
  readonly x: number;
  readonly y: number;
}

// ─────────────────────────── 放置合法性 ───────────────────────────

export interface PlaceIntent {
  readonly itemId: string;
  readonly row: number;
  readonly col: number;
  readonly rotation: Rotation;
}

/**
 * 判定顺序固定为 **越界 → 障碍 → 重叠**（PRD R-03）。
 * 返回 `reason` 供 UI 差异化提示，也是埋点字段 `item_place_invalid.reason` 的来源。
 */
export type InvalidReason =
  | 'out-of-bounds'
  | 'blocked'
  | 'overlap'
  | 'not-rotatable'
  | 'unknown-item';

export type PlaceCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: InvalidReason; readonly cells: readonly RC[] };

// ─────────────────────── 拖拽预览（核心状态，非渲染状态） ───────────────────────

/**
 * 拖动中的预览结果。
 *
 * 注意：这里用的是**网格锚点**而不是像素坐标。
 * 像素 → 网格的转换只允许发生在 `BoardView.localToGrid()`（TDD 8.3 铁律 2），
 * 所以 view 层在派发 `grab` / `move` 意图时必须已经把指针换算成锚点。
 */
export interface DragPreview {
  readonly itemId: string;
  readonly anchor: RC;
  readonly rotation: Rotation;
  readonly check: PlaceCheck;
  /** 本次拖动来自托盘还是棋盘（决定松手时的提交语义） */
  readonly from: 'tray' | 'board';
}

// ─────────────────────────── view → core 的唯一入口 ───────────────────────────

/**
 * 玩家意图。**`GameSession.dispatch()` 是唯一的状态写入口**，
 * view 层永远不直接改 `LevelState`（TDD 7.2）。
 */
export type Intent =
  | { readonly type: 'select'; readonly itemId: string | null }
  | { readonly type: 'grab'; readonly itemId: string; readonly anchor: RC }
  | { readonly type: 'move'; readonly anchor: RC }
  | { readonly type: 'drop' }
  | { readonly type: 'cancel' }
  | { readonly type: 'rotate'; readonly itemId: string }
  | { readonly type: 'removeToTray'; readonly itemId: string }
  | { readonly type: 'undo' }
  | { readonly type: 'reset' };

// ─────────────────────────────── 存档 ───────────────────────────────

/** PRD 8.1。**不存**关内临时布局、任何个人信息。 */
export interface SaveDataV1 {
  readonly schemaVersion: 1;
  /** 1..10 */
  readonly maxUnlockedLevelId: number;
  readonly clearedLevelIds: readonly number[];
  readonly muted: boolean;
  /** 时间戳，仅调试用 */
  readonly updatedAt: number;
}
