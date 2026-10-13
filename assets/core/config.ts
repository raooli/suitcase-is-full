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
