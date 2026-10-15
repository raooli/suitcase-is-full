# 项目长期记忆 —— 《行李箱装不下啦！》

> 只记跨会话仍成立的约定与手法；日常进展写 `YYYY-MM-DD.md`。

## 工程基线
- Cocos Creator 3.8.8（锁版本，`/Applications/Cocos/Creator/3.8.8/`）；设计 390×844 + Fit Width。
- 分层：`core/`（零 `cc`、纯逻辑、Vitest）↔ `view/`（唯一允许 `import 'cc'`）。core 只从 `index.ts` 对外（R-A3）。
- 守卫（`npm run check:arch`）：R-A1 core 无 cc；R-A3 禁深引 core 内部；R-A4 wx 只在 platform；R-A6 格算术只许 `BoardView.ts`+`config.ts`；R-A9 assets 只放运行时资源；R-A10 禁 `[...x]` 展开（Cocos loose 降级成 `[x]`，一律 `Array.from`）。
- 参数只改 `config.ts`，禁魔法数字。

## 交付纪律
每任务：① `npm run check`（typecheck + typecheck:view + check:arch + verify:levels + vitest）② `npm run preview:game` 零 Console 错误 ③ 双绿才提交，CHANGELOG 倒序一条。
view 类型检查：`tsconfig.view.json` 显式重写 `types`（相对路径以被继承文件目录为基准）与 `target/lib=ES2020`；`onLoad/onEnable/onDisable` 需 `override`。预览不可省（抓逻辑/时序错）。

## 引擎限制与状态机
- 一节点一 renderable：多组绘制复用同一 Graphics 或建子节点。
- 冻结门覆盖所有写状态 handler（含 `handleDrop/handleCancel` 清理路径）；`handleMove` 不需门（`phase!=='Dragging'` 提前返）。
- 懒加载 `built` 提前 return 必须抽 `applyEvent()` 入口无条件调用（Success/Confirm/Guide 同类防 M1-7 复玩战绩不刷新）。
- `completeWinAnimation()` 幂等；`SuccessOverlay.show()` 开头 `unscheduleAllCallbacks`。
- 冻结期手势显式作废：按下 `beginGesture` 归零 + `gestureFrozen=inputFrozen()`，整段 return。

## 无 GUI 预览与取证
构建：`env -u ELECTRON_RUN_AS_NODE`、`ELECTRON_DISABLE_SANDBOX=1`；编辑器退出码恒 36，以日志 `build Task (web-mobile) Finished in` 判成功。
`preview-check.mjs`：`--scene Game`（改场景重建后必带）；`--shot` 终态；`--grep` 纯子串（不认 `|`）；`--gap/--drag-wait` 全局单值只作用于 drag 后等待。Chrome 必须 `--no-sandbox --no-zygote`（外层沙箱 SIGTRAP）。
三套坐标：`--tap/--drag`=CSS 页面坐标；`getUILocation`=世界坐标（y 自下，`uiY=844−pageY`）；设计坐标=world−(195,422)；`getLocation` 是设备像素（2×）别对设计值。
取证：像素级 PNG 解码比对格中心；时序 bug 看 DEBUG `performance.now()` 时间戳；停位移 tween 必须同时归位节点（只停动画）。CDP 投递延迟 ~34ms，压时序 `--gap 0 --drag-wait 40`。

## 触摸事件三条事实
1. 全局 `input.on(TOUCH_START)` 收不到，一律节点级 `node.on(TOUCH_*)`。
2. 触摸由按下最深节点认领；松手不在内 → 引擎改 `TOUCH_CANCEL`。监听必须挂覆盖整屏的 `SafeAreaRoot`。
3. 必须 `touch-action:none`，否则 pan 接管派 `touchcancel`。
推论：点 vs 拖仲裁只能一处（`DragController` 独占，`UI_DRAG_THRESHOLD_PX`）。

## M2-2 工具栏接线（代码注入约定）
- 工具栏/对话框不手改场景 JSON：`GameController.buildToolbar` 用 `dragController?.gestureRoot`（= SafeAreaRoot）作父节点 `new Node()` + `addComponent(ToolbarView)`，`setSiblingIndex(0)` 置最底层；`buildDialog` 末尾追加（置顶遮罩）。
- 输入隔离用 `event.propagationStopped = true`（Cocos 3.8.8 类型声明**无 `EventTouch.stopPropagation` 方法**，只有 `propagationStopped` 标志位——已查 `cc.d.ts` 确认）。
- `updateToolbarState()` 每次状态变更（`startLevel` / `afterDispatch` 末尾）重算可用态：`canUndo=session.canUndo` / `canRotate=选中且 findItem(...).rotatable===true` / `canReset=state.placements.size>0` / `canHint=suggestNextPlacement(level,state)!==null`。`canHint` 全放完即 false（UI Spec 152 不伪装空按钮）。
- hint auto-clear 双重保险：`afterDispatch` 开头 `clearHint()`（任何状态变更立即清）+ `UI_HINT_AUTO_CLEAR_MS=3500` 超时兜底（`scheduleOnce` + 可取消 `hintClearCallback`）。
- 重置走 `ConfirmDialog` 二次确认：`requestReset` 置 `dialogOpen=true` + `show()`，`confirmReset` 才 `dispatch({type:'reset'})`，`cancelReset` 只关；`isFrozen()` 纳入 `dialogOpen`，弹窗期间冻结一切手势。
- 提示纯函数 `core/suggestNextPlacement(level,state)`：按 `tray` 顺序取首件能放下（任一合法落点）的物品，不可旋转只试 rotation 0、可旋转试 0/1/2/3，行主序首个合法落点，返回 `{itemId,row,col,rotation,cells}` 或 null；视图高亮由 `BoardView.showHint(cells)` + `TrayView.highlightHint(itemId)` 呈现。

## 已确认规格（不得擅自改）
- 色号 = UI Spec Design Tokens；派生只压明度不改色相。
- P-04 格边长硬下限 44px；压缩顺序 tray→toolbar/header→margin→最后降下限（需 ADR）。
- 命名 `GameController`（非 GameScene）。
- 取整语义分场景：抓取锚点用按下点；board 命中 `localToGrid`(floor)；move 锚点 `snapToGrid`(round)。
- 改状态唯一入口 = `dispatch`；重绘只由真·改状态事件触发（`state-changed` 每次 dispatch 都带，含 move，不能当触发器）。
- 提交前 `git status` 避用户在途 `prop_02_*.png`；只暂存自己文件。
- 旋转入口 = 再次点击已选中物品（M1-8）；L1/L2 `rotatable` 全 false，端到端验需临时改 L1。
- 抖动唯一实现 `view/shake.ts`（`stopShake`+`shakeX`），调用方存基准位传入。
- G1 出口：Go（docs/08 V1.1）。G1-4 真机顺延 M3-1；G1-5 撤销归 M2-2（Go 条件之一）。
- `startLevel` 是关卡载入唯一路径（首启/再来一次/下一关共用）；换关必重挂 `wireDrag`（`boardItemAt` 闭包捕获 level）。
- `levelIdsOf(raw)` 问 core 包里有哪些关；`hasNextLevel = levelId < max(ids)`。
- 通关浮层：下一关粉实心(195,482)、再来一次白描边(195,540)、面板280×340；末关不显下一关；`applyButtons` 每次 `show` 重排。
- 关卡加载：场景直挂 `JsonAsset` 不换 `resources.load`。解锁门禁(M2-7)/进度持久化(M2-8)/完整庆祝(M2-10) 未做。
- 手指遮挡补偿只改画法：anchor 不动、不挪节点、缩放锚点取整体包围盒中心（`core/geometry/lift.ts` `centerOf`）。`UI_DRAG_LIFT_PX=24`/`LIFT_SCALE=1.05`/`SHADOW_OFFSET_PX=3`/`ALPHA=0.18`。
- 撤销不给临时手势，只等 M2-2 工具栏（与旋转刻意不对称：破坏性无 redo、规格在工具栏、空白区手势已占用）。
- L1 通关坐标配方：cellPx=114；`A@(1,1) B@(1,0) C@(2,1) D@(0,0)`；页面格中心(81/195/309, 240/354/468)；落点→格 `pointerRow=round((pageY−183)/114)` `pointerCol=round((pageX−24)/114)`；托盘0号槽中心(62,658)。
