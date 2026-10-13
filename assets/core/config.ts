/**
 * 全部可调参数集中在这里（TDD 第 14 节 P-01 ~ P-07）。
 *
 * 带 `[PLACEHOLDER]` 的值都是「有默认值、真机调优、不阻塞开工」的参数。
 * 调参只改本文件，不要把魔法数字散落到逻辑里。
 */

// ───────────────────────── 触摸判定（TDD 6.4） ─────────────────────────

/** 超过此像素位移即认定进入拖动，且此后不再回退为点击。建议真机 A/B 8~14 */
export const DRAG_THRESHOLD_PX = 10;

/** 松开时仍处于 Pending 且耗时 <= 此值 → 判为点击（选中） */
export const TAP_MAX_MS = 250;

/** 判定为点击允许的最大位移 */
export const TAP_MAX_PX = 10;

/**
 * 手指抬升偏移，单位 = cellSize 的倍数。
 * **只作用于渲染节点，不参与 anchor 计算**——否则会出现
 * "看到的对齐位置和实际落位差半格"（TDD 6.3 最容易写错的一处）。
 */
export const FINGER_LIFT_RATIO = 0.5;

// ───────────────────────── 会话 ─────────────────────────

/** 撤回栈上限。一关最多几十次操作，50 足够，内存可忽略 */
export const UNDO_LIMIT = 50;

/** 原位旋转失败时的 Toast 时长（ms） */
export const ROTATE_BLOCKED_TOAST_MS = 1200;

/** 「装不下」非阻断提示自动淡出时长（ms） */
export const DEADLOCK_TOAST_MS = 2000;

/** 原位旋转的邻域搜索半径（格）。见 TDD 6.5 第 3 步 */
export const ROTATE_NUDGE_RADIUS = 1;

// ───────────────────────── 求解器 ─────────────────────────

/** 回溯节点上限。超限返回 `unknown` 而**不是** `false`，避免构建脚本卡死 */
export const SOLVER_MAX_NODES = 2_000_000;

/**
 * 连通空洞剪枝开关。收益大（TDD 9.1 第 4 条称可把一个数量级砍掉），
 * MVP 默认关闭，仅在构建脚本觉得慢时打开。
 */
export const ENABLE_HOLE_PRUNE = false;

/** 关卡数据的硬上限，校验用。超过就说明设计失控了 */
export const MAX_BOARD_SIDE = 8;
export const MAX_ITEMS_PER_LEVEL = 12;

// ───────────────────────── UI 布局（TDD 11.3 + UI Spec 3 节） ─────────────────────────
//
// core 只存**数据**，不认识 `cc.Size` / `cc.Color`；view 侧读这些常量再转成引擎类型。
// 集中放在这里的理由与上面的参数一致：调布局只改这一处（架构文档 3 节「禁止魔法数字」）。

/** 设计分辨率 = UI Spec 基准画布 390×844（TDD 11.3 指定，Fit Width） */
export const UI_DESIGN_WIDTH = 390;
export const UI_DESIGN_HEIGHT = 844;

/** 内容水平安全边距（UI Spec 3 节：水平至少留 20–28px） */
export const UI_SAFE_MARGIN = 24;

/** 三条横带的高度（UI Spec 3 节：顶部关卡信息 ~120 → 棋盘 → 托盘 → 底部操作） */
export const UI_HEADER_HEIGHT = 120;
export const UI_TRAY_HEIGHT = 160;
export const UI_TOOLBAR_HEIGHT = 96;

/**
 * 棋盘格边长**硬下限**（TDD P-04，V1.2 统一口径为 44px）。
 * 低于此值时优先压缩托盘/标题/留白，**不得**继续缩棋盘。
 */
export const CELL_PX_MIN = 44;

/** 美术逻辑基准格边长（TDD 17.2：48px，在 44px 下限之上留 4px 余量） */
export const CELL_PX_BASE = 48;

/** 一档横带布局：三条横带高度 + 安全边距 + 本档允许的格边长下限 */
export interface LayoutBand {
  readonly header: number;
  readonly tray: number;
  readonly toolbar: number;
  readonly margin: number;
  readonly cellMin: number;
}

/**
 * 短屏纵向压缩阶梯（实施计划 M3-5 注，对应风险「320×568 类短屏可见设计高 ≈692 < 844」）。
 *
 * 规则：**按顺序逐档让出棋盘空间，前一档够用就不动下一档**。
 * 前三档只压缩非棋盘区域（托盘 → 工具栏/顶栏 → 留白），棋盘格边长不受损；
 * 最后一档才触及 P-04 的硬下限，属于「牺牲可点击性换能看见」，必须真机复测命中率并单独记 ADR。
 */
export const UI_LAYOUT_BANDS: readonly { readonly name: string; readonly band: LayoutBand }[] = [
  {
    name: 'L0 基准',
    band: {
      header: UI_HEADER_HEIGHT,
      tray: UI_TRAY_HEIGHT,
      toolbar: UI_TOOLBAR_HEIGHT,
      margin: UI_SAFE_MARGIN,
      cellMin: CELL_PX_MIN,
    },
  },
  {
    name: 'L1 托盘 160→128',
    band: {
      header: UI_HEADER_HEIGHT,
      tray: 128,
      toolbar: UI_TOOLBAR_HEIGHT,
      margin: UI_SAFE_MARGIN,
      cellMin: CELL_PX_MIN,
    },
  },
  {
    name: 'L2 + 工具栏 96→72、顶栏 120→96',
    band: {
      header: 96,
      tray: 128,
      toolbar: 72,
      margin: UI_SAFE_MARGIN,
      cellMin: CELL_PX_MIN,
    },
  },
  {
    name: 'L3 + 安全边距 24→16',
    band: { header: 96, tray: 128, toolbar: 72, margin: 16, cellMin: CELL_PX_MIN },
  },
  {
    name: 'L4 下限 44→40（须真机复测 + 单独 ADR）',
    band: { header: 96, tray: 128, toolbar: 72, margin: 16, cellMin: 40 },
  },
];

/**
 * 格子命中测试的浮点容差：`gridToLocal` 得到的是格角点，原样喂回 `localToGrid`
 * 时正好落在格边界上，没有容差会被 `floor` 判到前一格。
 */
export const GRID_EPSILON = 1e-6;

/** 格子圆角占边长的比例（UI Spec 4 节圆角档位 10/18/24/32 在单格尺度上的折算） */
export const UI_CELL_RADIUS_RATIO = 0.12;

/** 交替格背景的叠加强度（UI Spec 5.2「单元格有微弱的交替背景」） */
export const UI_CELL_ALT_ALPHA = 90;

/** 物品占位色块的描边宽度（设计单位）。依据 TDD 17.4「深色描边（2px，`color.brown`）」 */
export const UI_ITEM_BORDER_PX = 2;

/**
 * 占位色块每格的内缩比例（占格边长）。
 *
 * 留出这道缝是为了让多格物品**数得出格数**（TDD 17.6 A-01 缩略图测试：
 * 缩到 25% 仍要能分辨每件物品占几格）；全贴满会糊成一个大方块。
 */
export const UI_ITEM_CELL_INSET_RATIO = 0.06;

/** 占位色块圆角占格边长的比例（UI Spec 4.1「圆润简化」） */
export const UI_ITEM_RADIUS_RATIO = 0.18;

/**
 * 占位色块的明度阶梯倍率（TDD 17.5 明度阶梯 + 实施计划 M1.B：2 格亮、3 格中、4+ 格深）。
 *
 * 只把基色 RGB 等比压暗、**不改色相**：色号本身是已确认的设计令牌，
 * 改它等于改设计，必须走美术确认；而"同基色跨档"的深浅是程序化占位的自由度。
 * 三档实测相对亮度约 0.74 / 0.62 / 0.40（单测 `palette.spec.ts` 有断言）。
 */
export const UI_TONE_FACTOR = { light: 1, mid: 0.88, deep: 0.76 } as const;

/** 主题色（UI Spec 4 节 Design Tokens）。view 侧用 `Color.fromHEX` 转成引擎颜色 */
export const UI_PALETTE = {
  bg: '#FFF8EE',
  textPrimary: '#433B40',
  textSecondary: '#6F646A',
  accentPink: '#FA91A8',
  surfaceRose: '#FFE0E7',
  surfaceCream: '#FFE7AD',
  surfaceMint: '#BCEAD5',
  surfaceBlue: '#BDE4F7',
  surfaceWhite: '#FFFFFF',
  brown: '#7A5C4F',
  border: '#E8CFBC',
  valid: '#50B88A',
  invalid: '#E56B77',
} as const;
