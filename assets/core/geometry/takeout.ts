/**
 * 「取出」判定（PRD R-06b / TDD 7.3 规则 1 / UI Spec 6 节 V1.1 / O11）。
 *
 * ## 规则原文（三处文档同一口径）
 *
 * - PRD R-06b：把**已放置**物品拖到行李箱网格范围之外松手，视为「取出」。
 * - TDD 7.3：拖到**棋盘包围盒之外（外扩半格）**松手 = 取出。
 * - UI Spec 6：只要**物品中心**越过棋盘外边界，预览就必须从「非法红」切换成
 *   「取出态」——否则玩家会以为松手会失败而缩回去，这条规则就形同不存在。
 *
 * 所以判定对象是**物品中心**（不是手指），判定边界是**棋盘包围盒外扩半格**
 * （O11：外扩量定半格，试玩中若误触率高再放宽）。
 *
 * ## 为什么提成纯函数
 *
 * 与 `trayScroll.ts` / `lift.ts` 同一个理由：边界比较是"差一个像素就行为相反"
 * 的典型（贴边算取出还是算箱内微移，直接决定松手后物品去哪），而 view 层没有
 * 单测兜着。提成纯函数后，"贴边 / 外扩半格处 / 超出"三种边界变成可断言的常量
 * （`test/takeout.spec.ts`）。
 *
 * ## 坐标系与 R-A6 的关系
 *
 * 入参全是**已换算好的设计单位像素**（中心坐标、棋盘尺寸、格边长），本文件不做
 * 任何格→像素换算——那是 `BoardView` 的独家职责（R-A6）。参数名刻意用中性的
 * `unit` 而不是 `cellPx`：格边长算术只允许出现在 `BoardView.ts` 与
 * `core/config.ts`（`tools/check-arch.ts` 的 R-A6 会拦标识符级算术），
 * 本文件与格算术无关，是纯像素比较，故可入 core。
 */

/**
 * 物品中心是否已出「棋盘包围盒外扩半格」。
 *
 * 棋盘局部坐标原点 = 棋盘几何中心（与 `BoardView` 的局部坐标口径一致），
 * 所以判定是对称的绝对值比较。
 *
 * **边界语义（贴边不算出）**：外扩半格处用严格大于 `>`——恰好落在边界上算
 * 「还没出去」。理由：外扩半格本身就是防误触的缓冲带，再把边界算成"已出"
 * 等于把缓冲带吃掉一半；UI Spec 的措辞也是「**越过**外边界」。
 *
 * @param centerX   物品中心 x（棋盘局部坐标）
 * @param centerY   物品中心 y（棋盘局部坐标）
 * @param boardWidth  棋盘宽（设计单位）
 * @param boardHeight 棋盘高（设计单位）
 * @param unit      格边长（设计单位，仅用于算半格外扩量）
 */
export function isTakeoutPosition(
  centerX: number,
  centerY: number,
  boardWidth: number,
  boardHeight: number,
  unit: number,
): boolean {
  const expand = unit / 2;
  return (
    Math.abs(centerX) > boardWidth / 2 + expand || Math.abs(centerY) > boardHeight / 2 + expand
  );
}
