/**
 * 场景间传参的模块级单例（M2-7：Home → Game 带「要进哪一关」）。
 *
 * ## 为什么不用场景序列化属性
 *
 * Cocos 的场景切换（`director.loadScene`）没有干净的「带参数跳转」入口，若把
 * `levelId` 塞进场景 JSON 的组件属性，就得手改序列化字段——而本项目的铁律是
 * 「不在 GUI 手改 .scene、由 `tools/scene-build.mjs` 生成」（见该工具头注释）。
 * 所以用一个**模块级单例**在切换前暂存、切换后取出即清，简单且可审计。
 *
 * 模块级变量在打包后的运行期是单例（同一次 app 生命周期内跨场景共享），
 * Home 写入、Game 取出，时序天然成立。
 */

/** 待进入的关卡 id；`null` = 没指定（由 Game 自行按默认 / 存档决定）。 */
let pendingLevel: number | null = null;

/** 设定下次进入 Game 时要载入的关卡（切换场景前调用） */
export function setPendingLevel(levelId: number | null): void {
  pendingLevel = levelId;
}

/**
 * 取出待进入的关卡并**清空**（一次性消费，避免「回去再进 Game 还带着旧值」）。
 * 没有设定时返回 `null`。
 */
export function takePendingLevel(): number | null {
  const level = pendingLevel;
  pendingLevel = null;
  return level;
}
