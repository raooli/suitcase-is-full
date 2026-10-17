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
 * 三条横带**中心**的 y（画布中心为原点，`+y` 向上）。
 *
 * 从上面的带高推导，不写死数字：横带高度一旦按 M3-5 的压缩阶梯调整，
 * 两条带的中心必须跟着走，否则棋盘和托盘会各飘一边。
 */
export const UI_BOARD_BAND_CENTER_Y = (UI_TRAY_HEIGHT + UI_TOOLBAR_HEIGHT - UI_HEADER_HEIGHT) / 2;
export const UI_TRAY_BAND_CENTER_Y =
  -(UI_DESIGN_HEIGHT / 2 - UI_TOOLBAR_HEIGHT - UI_TRAY_HEIGHT / 2);
/**
 * 工具栏带中心 y（画布中心为原点，+y 向上）。
 * 工具栏在最底部，紧贴屏幕下边缘：从 `-(designH/2)` 到 `-(designH/2 - toolbar)`，
 * 故中心 = `-(designH/2) + toolbar/2`。
 */
export const UI_TOOLBAR_BAND_CENTER_Y = -(UI_DESIGN_HEIGHT / 2 - UI_TOOLBAR_HEIGHT / 2);

// ───────────────────────── 工具栏（M2-2：撤回 / 旋转 / 重置 / 提示） ─────────────────────────

/**
 * 工具栏四个按钮（撤回 / 旋转 / 重置 / 提示）的布局。
 *
 * 行排布：4 个按钮 + 3 个间隙，刚好填满「内容宽 = 设计宽 − 2×安全边距 = 342」，
 * 即 `4×WIDTH + 3×GAP = 342`（72×4 + 18×3 = 288 + 54）。无需额外居中。
 * 按钮热区高度 56 高于 UI Spec 4 节 44px 硬下限，留余量。
 */
export const UI_TOOLBAR_BUTTON_WIDTH = 72;
export const UI_TOOLBAR_BUTTON_HEIGHT = 56;
export const UI_TOOLBAR_BUTTON_GAP = 18;

/** 提示高亮的自动消失时长（ms）。玩家一有状态变更会立即清除，这是兜底超时（UI Spec 152） */
export const UI_HINT_AUTO_CLEAR_MS = 3500;

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

// ───────────────────────── 托盘（UI Spec 5.2 / 组件 TraySlot） ─────────────────────────

/** 托盘带的内边距（带高 160 里留出上下呼吸） */
export const UI_TRAY_PADDING = 12;

/** 槽位基准边长。**下限 44 = 交互热区硬约束**（UI Spec 4 节） */
export const UI_TRAY_SLOT = 76;
export const UI_TRAY_SLOT_MIN = 44;

/** 槽位间距 */
export const UI_TRAY_GAP = 8;

/** 槽位卡片圆角（UI Spec 4 节圆角档位 10/18/24/32） */
export const UI_TRAY_SLOT_RADIUS = 18;

/** 槽位内边距：物品缩略图与卡片边框之间留白 */
export const UI_TRAY_SLOT_PADDING = 8;

/** 选中态描边宽度（UI Spec 6 节：点击托盘物品 → 高亮物品轮廓） */
export const UI_TRAY_SELECT_BORDER = 3;

/**
 * 「点」与「拖」的分界位移（设计单位）。
 *
 * 手指位移超过它才算拖拽，否则算点击（走 M1-3 的点选）。
 * 这条线是 M1-4 的手势仲裁：托盘的"点选"和"拖起"共用同一次 touchstart，
 * 没有阈值就会出现"想点一下却拖起来了 / 想拖却只选中了"的误判。
 *
 * 8 设计单位 ≈ 320px 屏上 6.6 物理像素，比手指抖动大、比一次有意的拖拽小。
 */
export const UI_DRAG_THRESHOLD_PX = 8;

/** 物品占位色块的描边宽度（设计单位）。依据 TDD 17.4「深色描边（2px，`color.brown`）」 */
export const UI_ITEM_BORDER_PX = 2;

/**
 * 拖起时 ghost 的**视觉上浮**距离（设计单位）——G1-1「手指不遮挡目标格」。
 *
 * **M3-1 真机校准结论（2026-10-17，G1-D1 闭环）：24 → 0。**
 *
 * 依据（微信开发者工具真机试玩反馈）：「手指拖着移动到方格上时位移有点大，
 * 总感觉没放到正确的方格上」。根因：上浮**只改画法不改判定**——ghost 被画在
 * 落点格上方 24 设计单位，松手落的却是手指正下方的格。玩家按看到的绿色块
 * 对格，实际落点系统性偏下一格：3×3 棋盘（114px/格）偏 0.21 格，6×6 棋盘
 * （57px/格）偏 0.42 格。实测基线：ghost 中心页面 (251.8, 329.8) vs 落点格
 * (1,1) 中心 (252, 354)——差正好 24。
 *
 * 校准为 0 后「所见即所落」：ghost 与落点格像素级重合，G1-2「松手落格 =
 * 预览所示格」从概念成立变成视觉成立。当初的遮挡担忧经内容核对不成立：
 * 63 件物品最小 1×2、**没有 1 格物品**，ghost 本体始终伸过指腹；可读性由
 * 2px 描边 + 40% 半透明填充（棋盘格线透出）+ 1.05 放大补住。
 *
 * 机制保留、值可逆：若后续试玩仍报遮挡，优先做「双视觉拆分」（落点格描边
 * 画在落点处 + 物品形悬浮指上），**不要**把这个值调回非 0——非 0 上浮必然
 * 重新引入"看到的 ≠ 落下的"这类偏差（真机反馈已坐实）。
 *
 * 硬约束不变：只改画法、不改判定；不挪节点（M1-7 实测：位移 tween 不归位
 * 会留下 8px 持久偏移）。
 */
export const UI_DRAG_LIFT_PX = 0;

/**
 * 拖起时 ghost 的放大倍率。UI Spec 8 节「略微放大」——1.05 是"看得出抬起、
 * 又不至于让占位格数失真"的量；再大就会让玩家误判物品实际占几格。
 */
export const UI_DRAG_LIFT_SCALE = 1.05;

/**
 * 抬起阴影的偏移量（设计单位，右下方向）与透明度。
 *
 * 依据 UI Spec 4.1「左上柔光、右下短而淡的结构阴影；禁止长投影、外发光」——
 * 所以是**短**（3 设计单位 ≈ 半格边缘的 1/20）而**淡**（18% 棕）。
 */
export const UI_DRAG_SHADOW_OFFSET_PX = 3;

/** 抬起阴影的填充透明度（0–1）。 */
export const UI_DRAG_SHADOW_ALPHA = 0.18;

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

// ───────────────────────── Toast（M2-4：装不下非阻断提示条） ─────────────────────────

/** Toast 提示条尺寸（UI Spec HintToast：非阻断轻提示条，约 2s 自动淡出） */
export const UI_TOAST_WIDTH = 320;
export const UI_TOAST_HEIGHT = 44;
export const UI_TOAST_RADIUS = 22;

/**
 * Toast 中心 y（画布中心为原点，+y 向上）。置于顶部信息带内、棋盘之上方——
 * 棋盘带中心 `UI_BOARD_BAND_CENTER_Y = +68`、最高棋盘半高 ≈ +171（L3/L4 5×4 时约 +210），
 * 棋盘顶最高 ≈ +278；`+330` 始终在棋盘上方，不遮挡棋盘（UI Spec 13）。
 */
export const UI_TOAST_Y = 330;

// ─────────────── 首次引导层（M2-6 / PRD F13 / UI Spec 5.2·7·14） ───────────────

/**
 * 引导遮罩 alpha（0–1）。**比通关浮层（0.55）轻**：引导要让玩家看清被引导区域
 * 的上下文（棋盘格线、托盘里的物品长什么样），压太黑反而学不会。
 */
export const UI_GUIDE_MASK_ALPHA = 0.45;

/** 高亮矩形（洞）的描边宽度与圆角 */
export const UI_GUIDE_HOLE_BORDER_PX = 3;
export const UI_GUIDE_HOLE_RADIUS = 14;

/**
 * 洞相对目标矩形的外扩（px）。让描边圈在目标**外面**，不压住目标本身的边缘
 * （托盘槽位有自己的选中描边，叠在一起会糊）。
 */
export const UI_GUIDE_HOLE_PADDING = 6;

/** 手指示意：指身尺寸（程序绘制，无贴图；圆角取半宽 → 胶囊形） */
export const UI_GUIDE_FINGER_WIDTH = 26;
export const UI_GUIDE_FINGER_HEIGHT = 34;

/** 手指示意的描边宽度（棕描边，与奶油填充配成 UI Spec 的暖色系） */
export const UI_GUIDE_FINGER_BORDER_PX = 2;

/** 手指循环动画：单程滑动时长与两端停顿（ms） */
export const UI_GUIDE_FINGER_MOVE_MS = 900;
export const UI_GUIDE_FINGER_PAUSE_MS = 260;

/** 「点击」型引导（第 3 关旋转）手指的点按幅度（px） */
export const UI_GUIDE_TAP_DIP_PX = 10;

/** 引导文案：字号、行高、可用宽度 */
export const UI_GUIDE_TEXT_SIZE = 17;
export const UI_GUIDE_TEXT_LINE_HEIGHT = 22;
export const UI_GUIDE_TEXT_WIDTH = 330;

/**
 * 文案中心 y。放在棋盘**上方**的信息带：棋盘带中心 +68，L3/L4（5 行）棋盘半高
 * 约 +214 → 棋盘顶 ≈ +282，所以 `+285` 始终在棋盘之上、Toast（+330）之下，
 * 与两者都不叠，也不遮挡被引导的棋盘 / 托盘 / 工具栏。
 */
export const UI_GUIDE_TEXT_Y = 285;

/**
 * 引导文案（UI Spec 14「可跳过」：只说"怎么做"，不写"点击继续"这类阻断措辞，
 * 也不放按钮——玩家**拖动或点击**即消失）。
 *
 * - 第 1 关：GDD 3.1「长按任一物品并拖到箱子里」。
 * - 第 3 关：GDD 3.3「转个方向试试？选中后点击一次顺时针旋转即可放下」。
 */
export const UI_GUIDE_TEXT = {
  drag: '按住物品，拖进行李箱',
  rotate: '放不下？选中物品后点「旋转」换个方向',
} as const;

// ───────────────────────── 通关浮层（UI Spec 5.3） ─────────────────────────

/**
 * 通关浮层遮罩 alpha（0–1）。整屏盖住棋盘/托盘，背景误触由
 * `WinAnimating`/`Completed` 的输入冻结兜底（双保险，UI Spec 5.3 要求）。
 */
export const UI_OVERLAY_MASK_ALPHA = 0.55;

/** 浮层面板尺寸与圆角（UI Spec 4 节圆角档位取 24） */
export const UI_OVERLAY_PANEL_WIDTH = 280;
/**
 * 面板高度（M2-1 从 300 加到 340）：UI Spec 5.3 规定通关浮层是**「下一关」主按钮
 * + 「再来一次」次入口**两个入口，300 装不下两个按钮（会压到面板外或被裁）。
 * 340 = 文字区（上 170）+ 主按钮 48 + 间距 12 + 次入口 44 + 下留白 30。
 */
export const UI_OVERLAY_PANEL_HEIGHT = 340;
export const UI_OVERLAY_PANEL_RADIUS = 24;

/** 主按钮「下一关」尺寸（UI Spec 4 节交互热区下限 44 之上留余量） */
export const UI_OVERLAY_BUTTON_WIDTH = 200;
export const UI_OVERLAY_BUTTON_HEIGHT = 48;

/**
 * 次入口「再来一次」尺寸。比主按钮矮 4px 以体现主次，但**不低于 44**——
 * UI Spec 4 节的交互热区硬下限（P-04 亦同口径：格边长 44px 下限）。
 */
export const UI_OVERLAY_BUTTON_SECONDARY_HEIGHT = 44;

// ─────────────── 通关庆祝序列（M2-10 / UI Spec 5.3） ───────────────
//
// UI Spec 5.3 原文：「最后一件物品回弹（100–180ms）→ 行李箱合盖（250–450ms）
// → 轻微星光与『整理完成！』→ 下一关按钮可用」。四段各自的时长集中在这里，
// 序列总时长由末尾的 `UI_WIN_SETTLE_MS` **推导**（改任何一段自动跟着走）。

/** ① 回弹：最后一件物品入箱后的缩放回弹。取规格区间 100–180ms 的中段 */
export const UI_WIN_BOUNCE_MS = 140;

/**
 * 回弹的缩放峰值（1 → 1.12 → 1）。
 *
 * 只做**缩放**不做位移：位移 tween 若被打断会留下持久偏移（M1-7 实测教训），
 * 而缩放的静止态就是 1，天然可恢复。幅度「看得出锁进去了、又不至于让占位
 * 格数失真」——再大玩家会误判这件占几格。
 */
export const UI_WIN_BOUNCE_SCALE = 1.12;

/** ② 合盖：行李箱盖板下滑总时长。取规格区间 250–450ms 的中段 */
export const UI_WIN_LID_MS = 350;

/** 盖板比棋盘每侧宽出的像素——视觉上「盖住」而不是「对齐」 */
export const UI_WIN_LID_OVERHANG_PX = 8;

/** 盖板起始位在闭合位之上额外的间距（完全跳出棋盘上方，不与物品叠） */
export const UI_WIN_LID_START_GAP_PX = 24;

/**
 * 合盖越过闭合位后回弹的幅度（px）——「啪」地合上那一抖。
 *
 * 两段式（快速下滑略过头 → 短回正）而不是 backOut 一次性缓动：backOut 的
 * 回挑量随距离等比放大（342px 的棋盘会挑出 30+px，像撞歪了），固定小幅度
 * 才像合盖的惯量。**结束值恒为闭合位**，不留下持久偏移。
 */
export const UI_WIN_LID_DIP_PX = 10;

/** 盖板体的圆角（UI Spec 4.1「圆润简化」；比 overhang 大，角上会露出一点点棋盘角） */
export const UI_WIN_LID_RADIUS = 14;

/** 盖板把手（棕色小圆角块，贴在盖板顶边中央，下滑时领头） */
export const UI_WIN_LID_HANDLE_WIDTH = 48;
export const UI_WIN_LID_HANDLE_HEIGHT = 12;

/** ③ 浮层面板淡入时长（ms）。遮罩**不**淡入（立即盖上，避免半透明期闪出底板） */
export const UI_WIN_PANEL_FADE_MS = 200;

/** 面板弹跳两段（M1-7 既有手感）：0.8 → 1.06（backOut）→ 1.0 */
export const UI_WIN_PANEL_GROW_MS = 220;
export const UI_WIN_PANEL_SNAP_MS = 80;
export const UI_WIN_PANEL_START_SCALE = 0.8;
export const UI_WIN_PANEL_PEAK_SCALE = 1.06;

/**
 * ④ 星光呼吸：单程半周期与最低透明度。
 *
 * 「轻微星光、**减弱频闪**」（UI Spec 8）：透明度只呼吸到 45% 不到 0，
 * 周期 900ms——看得出是活的，又不至于像警示灯。
 */
export const UI_WIN_TWINKLE_HALF_MS = 450;
export const UI_WIN_TWINKLE_MIN_ALPHA = 0.45;

/** 星光缩放呼吸的谷值（峰值恒 1）与相邻星光的错峰（避免四颗同时喘） */
export const UI_WIN_TWINKLE_SCALE_MIN = 0.85;
export const UI_WIN_TWINKLE_STAGGER_MS = 150;

/**
 * 收敛余量（ms）：帧量化会把 tween 拖长（M1-5 实测 160ms 的抖动跑了 174ms，
 * 约 +9%），按钮解冻必须**晚于**所有画面结束——早一点就是「动画中误触」。
 */
export const UI_WIN_SETTLE_MARGIN_MS = 80;

/**
 * 序列总时长（ms）= 回弹 + 合盖 + max(面板淡入, 面板弹跳) + 余量。
 *
 * `SuccessOverlay` 的 `scheduleOnce` 解冻回调用它；改上面任何一段时长，
 * 这里自动跟着走，但要复核余量仍够覆盖帧量化。
 */
export const UI_WIN_SETTLE_MS =
  UI_WIN_BOUNCE_MS +
  UI_WIN_LID_MS +
  Math.max(UI_WIN_PANEL_FADE_MS, UI_WIN_PANEL_GROW_MS + UI_WIN_PANEL_SNAP_MS) +
  UI_WIN_SETTLE_MARGIN_MS;

/**
 * 负反馈抖动（「放不下」「转不动」共用）：横向位移幅度与总时长。
 *
 * 时长取 UI Spec P-05 回弹区间的中段（160ms）——短到不打断操作节奏，
 * 长到看得清。改这两个值要复核 `SuccessOverlay` 的 `SETTLE_MS` 之类
 * 依赖动画时长的门控。
 */
export const UI_SHAKE_OFFSET_PX = 8;
export const UI_SHAKE_DURATION_MS = 160;

// ───────────────────────── 音效（M2-9 / UI Spec 8 / PRD F14） ─────────────────────────

/**
 * 音效总音量（0..1）。
 *
 * 占位音效一律**轻柔**（GDD「音效柔和」）：单个脉冲的 `gain` 再乘它。真素材
 * （M4-4）进来后如果整体偏响，只改这一处即可。
 */
export const SFX_MASTER_GAIN = 0.22;

/**
 * 包络起音时长（秒）：音量从 0 线性拉到峰值。**不能为 0**——直接从满刻度起振
 * 会有「噗」的爆音（ADC click），8ms 人耳听不出延迟但足够消爆音。
 *
 * 释音**不设固定时长**：`AudioAdapter` 让指数衰减恒收敛到振荡器的 `stop()`
 * 时刻（硬切时增益未衰尽同样会爆音），衰减快慢由脉冲时长自然决定。
 */
export const SFX_ENVELOPE_ATTACK_S = 0.008;
