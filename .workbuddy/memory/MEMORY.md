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
三套坐标：`--tap/--drag`=CSS 页面坐标；`getUILocation`=世界坐标（y 自下，`uiY=844−pageY`）；设计坐标=world−(195,422)；`getLocation` 是设备像素（2×）别对设计值。设计→页面：`pageX=195+designX`、`pageY=422−designY`。**`--shot` 出来的 PNG 是 dpr=2（780×1688）**，估坐标时按页面值 ×2 换算，别按显示尺寸目测（本轮因此误判过工具栏位置）。
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
- 撤销不给临时手势，只等 M2-2 工具栏（与旋转刻意不对称：破坏性无 redo、规格在工具栏、空白区手势已占用）。M2-2 已落地：四按钮页面 x=60/150/240/330、y=796；重置走 ConfirmDialog（确定 195,470 / 取消 195,526）。**「重置」初始状态是置灰的**（无可重置内容，属 M2-2 规格）——想测重置路径必须先放一件，否则只拿到 `按钮「重置」置灰，忽略点击`（本轮为此白跑一轮预览）。
- **Cocos 触摸派发给「所有」命中节点**（不只是最深的）——"整屏节点挡住触摸"必须显式 `propagationStopped`，光有 UITransform 尺寸没用（M2-2 实测：SuccessOverlay 有 390×844 遮罩但没挂监听，WinAnimating 期工具栏照样能点、确认框直接盖在通关浮层上）。已隔开的：ConfirmDialog/ToolbarView（遮罩+按钮都停了）。
- L1 通关坐标配方：cellPx=114；`A@(1,1) B@(1,0) C@(2,1) D@(0,0)`；页面格中心(81/195/309, 240/354/468)；落点→格 `pointerRow=round((pageY−183)/114)` `pointerCol=round((pageX−24)/114)`；托盘0号槽中心(62,658)。**松手点惯例（踩坑更正）**：取「格中心 x−10、y−10（CSS 口径）」——早期笔记的「y+10」是设计坐标（向上），落到 CSS 页面坐标必须减；按 CSS y+10 会整体下移一格、后续步骤全被 canPlace 拒收（表现为"拖了没反应"，非引擎回归）。
- **L7+ 无头测试怎么 boot**： harness 无 level 参数，临时改 `assets/scenes/Game.scene` 第 841 行 `"levelId": 7`，跑完 `git checkout -- assets/scenes/Game.scene` 还原。L7 几何：托盘槽中心 CSS x=46+52i（槽44）、起手行 y≈658；棋盘格中心 CSS (52.5+57c, 240+57r)。L7–L10 才可滚（7/8/9 件 → maxScroll 14/66/118px）。
- **托盘滚动偏移语义（已定，`30a0f14` 修过一次缺陷）**：`TrayView.render()` **保留**偏移（`applyScrollLayout` 按新 `maxScroll` 夹取，件数变化自动收敛），**归零只能显式调 `resetScroll()`**——`GameController.startLevel` + `afterDispatch` 的 `level-reset`（后者放在 `refreshAll` 之前，否则日志/首帧会先按旧偏移建一遍）。render 末尾若 `state.selectedId` 非空，`ensureSlotVisible` 把它挪进窗口（**只在此处做**；`applyState` 不做，免得拖拽中把托盘在手指底下平移、与「滑托盘 vs 抓物品」仲裁打架）。修前 render 无条件归零 → L7+ 取出高 trayOrder 物品时刚回巢且 selected 的那件滚出视野（实证 `托盘 8 件（可滚 66px，窗内 7）`）。诊断这类问题的抓手：日志里 `[TrayView] 托盘 N 件（… 偏移 Xpx，窗内 M）`。
- **M2-11 托盘横向滚动**：全部槽位挂 `TrayContent` 子容器，本节点(TrayView)保持固定窗口尺寸；`scrollOffset` 平移容器、只显与窗口**相交**的槽位（`TraySlot.setInWindow`，与 `dragHidden` 合成 `active = inWindow && !dragHidden`；删了 `markOverflow`/`visibleCount`）。滚动手势在 `DragController`：过阈值后**托盘带内起手 + 水平为主(|dx|>|dy|) + canScroll()** → 滑托盘（不发意图、松手不当点击、空白处也能滑）；否则起拖/点选。托盘在底部、拖物品上棋盘是纵向为主，两手势方向天然可分；L1–L6 放得下不可滚、行为零变化。布局算术在 `core/geometry/trayScroll.ts`（纯函数 + 12 单测）。L7 取证：`--drag 100,658,40,658` 触发 `滑托盘` offset 0→60，`--tap 350,658` 命中原本窗外的 L07_H（page↔world：uiY=844−pageY，故 658→186）。
- **M2-5 取出交互**：谓词 = `手指在托盘带内 ‖ 物品中心出棋盘外扩半格`（两条件并集：中心出界是 TDD 7.3 原文；手指进托盘带是明确意图、不受抓取偏移影响）。**预览与松手共用同一谓词**（`isTakeoutState`，UI Spec 6），外扩边界严格 `>`（贴边不算出——缓冲带不被吃掉）。view 不算格算术：`BoardView.isTakeout(cells, anchor)` 是唯一出口（`gridToLocal`+`bboxOf` 算中心，委托 core `geometry/takeout.ts` `isTakeoutPosition`，中性参数名 `unit` 避 R-A6 正则）；`DragController.outsideBoard` 回调接它、形状传 `rotateBy(item.cells, preview.rotation)`。预览三分态（`PreviewLayer.show(preview, takeout)`）：取出态 = 半透明中立色（白填充 α0.45 + 棕描边，禁红禁虚线）；`emitMoveIfChanged` 锚点没变也发（手指进出托盘带不改锚点）。`onTouchEnd`：takeout → `from==='board' ? removeToTray : cancel`；`invalid = !takeout && !check.ok`。目标位高亮 = `TraySlot` 的 `drop-target` 态（M1-3 预留）经 `TrayView.highlightReturnTarget(itemId)` 启用，落点问 core `trayInsertIndex`（与 `insertByTrayOrder` 同判据，view 不自己排序），`ensureSlotVisible` 保滚入窗口。**core 缺陷（已修）**：`handleRemoveToTray` 必须做拖拽生命周期收尾（真实序列 grab→move*→removeToTray 中间无 drop/cancel，不修则 phase 卡 `Dragging`、`handleUndo` 的门挡住撤回——R-06b 第 4 条只在直接 dispatch 的单测里成立过）。
- **M2-6 首次引导层**：`GuideOverlay` 与 `Toast` 同范式（**不注册触摸监听、不 `propagationStopped`**）→ 引导出现时棋盘仍可拖拽、按钮仍可点；`onLoad` 置 `active=false`，`hide()` 停 tween 且归位手指。关次/学会判据全在 core `guide.ts`：`guideKindOf`（1→drag / 3→rotate / 其余 null）、`guideDoneEventOf`（drag→`placement-committed`、rotate→`item-rotated`）、`GuideMemory`。**两条易错语义**：① 「**已学会**后不再弹」≠「出现过一次不再弹」——跳过（拖动/点击）**不记学会**，重进本关仍再提示；② 学会绑定 core 事件而非「引导显示过」。蒙层挖洞 = core `geometry/maskHoles.ts` `maskBands`（条带切割、洞夹取、并集去重；纯几何+11 单测）；定位 = `view/designRect.ts` 的 `centerRectIn`/`boxRectIn`（`convertToWorldSpaceAR`→`convertToNodeSpaceAR` **两点转换**，不依赖层级、自动带 Fit Width 缩放与托盘滚动偏移——手算常量必然在滚动/换关后错位）。高亮矩形一律问**节点出口**：`BoardView.cellsLocalBox(cells,anchor)`（格算术唯一出口，R-A6）、`TrayView.slotNodeOf(itemId)`/`slotPixelSize()`、`ToolbarView.rotateButtonNode()`。`GameController` 注入顺序**必须在 `startLevel` 之前**：toolbar → guide → dialog → toast（引导压暗工具栏、但不压确认框/提示条）；`maybeShowGuide()` 放在 `startLevel` 末尾 `refreshAll` 之后（洞要圈的节点得先存在）。**可跳过** = `afterDispatch` 里任何非 `move` 意图收起引导，**唯 `rotate` 关的 `select` 例外**（选中是点「旋转」的前置步骤）。L1 落点**复用工具栏「提示」同一纯函数 `suggestNextPlacement`**（引导与提示必须同一答案）。取证：L1 首启即弹；L3 需临时改 `assets/scenes/Game.scene` 第 841 行 `"levelId": 3`（同 L7+ 手法，验完 `git checkout --` 还原）。
