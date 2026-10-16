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
- **`Graphics.arc(cx,cy,r,start,end,ccw)` 里 `ccw=false` 画的是 `[start,end]` 的补集**（干净背景探针实测：`arc(…,0,90°,false)` 渲染出 `[90°,360°]`；`true` 才渲染标称 `[0°,90°]`）。即 **`false` = 从 start 顺时针（角度递减）扫到 end**，扫过去的是另一半。M2-9 两处踩坑：喇叭声波弧（`-60..60,false` → 绕到喇叭背后画了 240°，修法传 `true`）、锁徽标锁梁（`arc(π,2π,false)` 圆心还在锁体**下**边缘 → 上半圆埋进锁体看不见、锁形退化成圆角方块，修法：圆心移到锁体上边缘 + `0..π,true`）。**要画弧一律传 `true` 并直接给标称区间**；验弧用像素级角度直方图（扫环带算 `atan2`）——**先径向剖面定性**（双峰=两弧，不做填充体掩蔽会被体像素污染失真），**再角度剖面定量**；「背面探针」盒心放弧圆**正上/正下方**（弧心系 dx≈0、dy=±r），盒放宽会吃到 ±60° 端点像素误报「补集复发」。另：Graphics 局部坐标 **y 向上**，`roundRect` 的 y 是**下**边缘（别按 Top 命名）。
- 冻结门覆盖所有写状态 handler（含 `handleDrop/handleCancel` 清理路径）；`handleMove` 不需门（`phase!=='Dragging'` 提前返）。
- 懒加载 `built` 提前 return 必须抽 `applyEvent()` 入口无条件调用（Success/Confirm/Guide 同类防 M1-7 复玩战绩不刷新）。
- `completeWinAnimation()` 幂等；`SuccessOverlay.show()` 开头 `unscheduleAllCallbacks`。
- 冻结期手势显式作废：按下 `beginGesture` 归零 + `gestureFrozen=inputFrozen()`，整段 return。

## 无 GUI 预览与取证
构建：`env -u ELECTRON_RUN_AS_NODE`、`ELECTRON_DISABLE_SANDBOX=1`；编辑器退出码恒 36，以日志 `build Task (web-mobile) Finished in` 判成功。
`preview-check.mjs`：`--scene Game`（改场景重建后必带）；`--shot` 终态；`--grep` 纯子串（不认 `|`）；`--gap/--drag-wait` 全局单值只作用于 drag 后等待。Chrome 必须 `--no-sandbox --no-zygote`（外层沙箱 SIGTRAP）。
三套坐标：`--tap/--drag`=CSS 页面坐标；`getUILocation`=世界坐标（y 自下，`uiY=844−pageY`）；设计坐标=world−(195,422)；`getLocation` 是设备像素（2×）别对设计值。设计→页面：`pageX=195+designX`、`pageY=422−designY`。**`--shot` 出来的 PNG 是 dpr=2（780×1688）**，估坐标时按页面值 ×2 换算，别按显示尺寸目测（本轮因此误判过工具栏位置）。
取证：像素级 PNG 解码比对格中心；时序 bug 看 DEBUG `performance.now()` 时间戳；停位移 tween 必须同时归位节点（只停动画）。CDP 投递延迟 ~34ms，压时序 `--gap 0 --drag-wait 40`。
**改 `Game.scene` 的 `levelId` 换关做 E2E 时，构建偶发吃缓存跑旧关**（实测一次 L2 跑到 L1、截图与 L1 一模一样）。判据：必须核 Console 的 `载入 L<n>` 行（或重跑一次）确认改动生效，否则结论可能是假的。**别只靠 `--scene` 就信构建吃到新场景。**
**`--reload` 是同 profile 页内重载（localStorage 保留），专门验「落盘→重启恢复」**：跨重启的持久化只能靠它，**新开一次 `node preview-check.mjs` 进程不会保留**（每次用临时 profile）。另：`node … 2>&1 | tee f | tail` 的管道会丢前半段日志（实测文件只留后 97 行），要留全量用**直接重定向 `node … > f 2>&1`**。
**Home 选关 E2E 坐标**（`pageX=195+designX`、`pageY=422−designY`）：卡片 3 列 / 100×100 / gap(21,16) / `GRID_TOP_Y=150` → **L1 卡 (58,272)**、L2 (179,272)、L3 (300,272)、L4 (58,388)。Boot 场景用 `--scene Boot`。Game 左上角返回按钮页面 **(30,60)**。

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
- 关卡加载：场景直挂 `JsonAsset` 不换 `resources.load`。**解锁门禁 + 进度持久化已在 M2-7 落地**（`core/progress.ts` + `view/storage.ts`）；**M2-8 已把 `GuideMemory` 并入同一存档命名空间**（见下 M2-8 条）；**M2-9 音效已落地**（见下 M2-9 条，`muted` 写侧 + 首页开关 + WebAudio 合成）；完整庆祝(M2-10) 未做。
- 手指遮挡补偿只改画法：anchor 不动、不挪节点、缩放锚点取整体包围盒中心（`core/geometry/lift.ts` `centerOf`）。`UI_DRAG_LIFT_PX=24`/`LIFT_SCALE=1.05`/`SHADOW_OFFSET_PX=3`/`ALPHA=0.18`。
- 撤销不给临时手势，只等 M2-2 工具栏（与旋转刻意不对称：破坏性无 redo、规格在工具栏、空白区手势已占用）。M2-2 已落地：四按钮页面 x=60/150/240/330、y=796；重置走 ConfirmDialog（确定 195,470 / 取消 195,526）。**「重置」初始状态是置灰的**（无可重置内容，属 M2-2 规格）——想测重置路径必须先放一件，否则只拿到 `按钮「重置」置灰，忽略点击`（本轮为此白跑一轮预览）。
- **Cocos 触摸派发给「所有」命中节点**（不只是最深的）——"整屏节点挡住触摸"必须显式 `propagationStopped`，光有 UITransform 尺寸没用（M2-2 实测：SuccessOverlay 有 390×844 遮罩但没挂监听，WinAnimating 期工具栏照样能点、确认框直接盖在通关浮层上）。已隔开的：ConfirmDialog/ToolbarView（遮罩+按钮都停了）。
- L1 通关坐标配方：cellPx=114；`A@(1,1) B@(1,0) C@(2,1) D@(0,0)`；页面格中心(81/195/309, 240/354/468)；落点→格 `pointerRow=round((pageY−183)/114)` `pointerCol=round((pageX−24)/114)`；托盘0号槽中心(62,658)。**松手点惯例（踩坑更正）**：取「格中心 x−10、y−10（CSS 口径）」——早期笔记的「y+10」是设计坐标（向上），落到 CSS 页面坐标必须减；按 CSS y+10 会整体下移一格、后续步骤全被 canPlace 拒收（表现为"拖了没反应"，非引擎回归）。
- **L7+ 无头测试怎么 boot**： harness 无 level 参数，临时改 `assets/scenes/Game.scene` 第 841 行 `"levelId": 7`，跑完 `git checkout -- assets/scenes/Game.scene` 还原。L7 几何：托盘槽中心 CSS x=46+52i（槽44）、起手行 y≈658；棋盘格中心 CSS (52.5+57c, 240+57r)。L7–L10 才可滚（7/8/9 件 → maxScroll 14/66/118px）。
- **托盘滚动偏移语义（已定，`30a0f14` 修过一次缺陷）**：`TrayView.render()` **保留**偏移（`applyScrollLayout` 按新 `maxScroll` 夹取，件数变化自动收敛），**归零只能显式调 `resetScroll()`**——`GameController.startLevel` + `afterDispatch` 的 `level-reset`（后者放在 `refreshAll` 之前，否则日志/首帧会先按旧偏移建一遍）。render 末尾若 `state.selectedId` 非空，`ensureSlotVisible` 把它挪进窗口（**只在此处做**；`applyState` 不做，免得拖拽中把托盘在手指底下平移、与「滑托盘 vs 抓物品」仲裁打架）。修前 render 无条件归零 → L7+ 取出高 trayOrder 物品时刚回巢且 selected 的那件滚出视野（实证 `托盘 8 件（可滚 66px，窗内 7）`）。诊断这类问题的抓手：日志里 `[TrayView] 托盘 N 件（… 偏移 Xpx，窗内 M）`。
- **M2-11 托盘横向滚动**：全部槽位挂 `TrayContent` 子容器，本节点(TrayView)保持固定窗口尺寸；`scrollOffset` 平移容器、只显与窗口**相交**的槽位（`TraySlot.setInWindow`，与 `dragHidden` 合成 `active = inWindow && !dragHidden`；删了 `markOverflow`/`visibleCount`）。滚动手势在 `DragController`：过阈值后**托盘带内起手 + 水平为主(|dx|>|dy|) + canScroll()** → 滑托盘（不发意图、松手不当点击、空白处也能滑）；否则起拖/点选。托盘在底部、拖物品上棋盘是纵向为主，两手势方向天然可分；L1–L6 放得下不可滚、行为零变化。布局算术在 `core/geometry/trayScroll.ts`（纯函数 + 12 单测）。L7 取证：`--drag 100,658,40,658` 触发 `滑托盘` offset 0→60，`--tap 350,658` 命中原本窗外的 L07_H（page↔world：uiY=844−pageY，故 658→186）。
- **M2-5 取出交互**：谓词 = `手指在托盘带内 ‖ 物品中心出棋盘外扩半格`（两条件并集：中心出界是 TDD 7.3 原文；手指进托盘带是明确意图、不受抓取偏移影响）。**预览与松手共用同一谓词**（`isTakeoutState`，UI Spec 6），外扩边界严格 `>`（贴边不算出——缓冲带不被吃掉）。view 不算格算术：`BoardView.isTakeout(cells, anchor)` 是唯一出口（`gridToLocal`+`bboxOf` 算中心，委托 core `geometry/takeout.ts` `isTakeoutPosition`，中性参数名 `unit` 避 R-A6 正则）；`DragController.outsideBoard` 回调接它、形状传 `rotateBy(item.cells, preview.rotation)`。预览三分态（`PreviewLayer.show(preview, takeout)`）：取出态 = 半透明中立色（白填充 α0.45 + 棕描边，禁红禁虚线）；`emitMoveIfChanged` 锚点没变也发（手指进出托盘带不改锚点）。`onTouchEnd`：takeout → `from==='board' ? removeToTray : cancel`；`invalid = !takeout && !check.ok`。目标位高亮 = `TraySlot` 的 `drop-target` 态（M1-3 预留）经 `TrayView.highlightReturnTarget(itemId)` 启用，落点问 core `trayInsertIndex`（与 `insertByTrayOrder` 同判据，view 不自己排序），`ensureSlotVisible` 保滚入窗口。**core 缺陷（已修）**：`handleRemoveToTray` 必须做拖拽生命周期收尾（真实序列 grab→move*→removeToTray 中间无 drop/cancel，不修则 phase 卡 `Dragging`、`handleUndo` 的门挡住撤回——R-06b 第 4 条只在直接 dispatch 的单测里成立过）。
- **M2-6 首次引导层**：`GuideOverlay` 与 `Toast` 同范式（**不注册触摸监听、不 `propagationStopped`**）→ 引导出现时棋盘仍可拖拽、按钮仍可点；`onLoad` 置 `active=false`，`hide()` 停 tween 且归位手指。关次/学会判据全在 core `guide.ts`：`guideKindOf`（1→drag / 3→rotate / 其余 null）、`guideDoneEventOf`（drag→`placement-committed`、rotate→`item-rotated`）、`GuideMemory`。**两条易错语义**：① 「**已学会**后不再弹」≠「出现过一次不再弹」——跳过（拖动/点击）**不记学会**，重进本关仍再提示；② 学会绑定 core 事件而非「引导显示过」。蒙层挖洞 = core `geometry/maskHoles.ts` `maskBands`（条带切割、洞夹取、并集去重；纯几何+11 单测）；定位 = `view/designRect.ts` 的 `centerRectIn`/`boxRectIn`（`convertToWorldSpaceAR`→`convertToNodeSpaceAR` **两点转换**，不依赖层级、自动带 Fit Width 缩放与托盘滚动偏移——手算常量必然在滚动/换关后错位）。高亮矩形一律问**节点出口**：`BoardView.cellsLocalBox(cells,anchor)`（格算术唯一出口，R-A6）、`TrayView.slotNodeOf(itemId)`/`slotPixelSize()`、`ToolbarView.rotateButtonNode()`。`GameController` 注入顺序**必须在 `startLevel` 之前**：toolbar → guide → dialog → toast（引导压暗工具栏、但不压确认框/提示条）；`maybeShowGuide()` 放在 `startLevel` 末尾 `refreshAll` 之后（洞要圈的节点得先存在）。**可跳过** = `afterDispatch` 里任何非 `move` 意图收起引导，**唯 `rotate` 关的 `select` 例外**（选中是点「旋转」的前置步骤）。L1 落点**复用工具栏「提示」同一纯函数 `suggestNextPlacement`**（引导与提示必须同一答案）。取证：L1 首启即弹；L3 需临时改 `assets/scenes/Game.scene` 第 841 行 `"levelId": 3`（同 L7+ 手法，验完 `git checkout --` 还原）。**`aa3004b` 复审修复**：① **非 dispatch 的 view 动作也要收起引导**——`showHint()`/`requestReset()` 各补 `guideOverlay?.hide()`（它们不走 `afterDispatch`，否则点「提示」时提示高亮被引导蒙层压暗）；② `UI_GUIDE_TEXT_WIDTH`=**330**（rotate 文案 18 全角字 ×字号 17 = 306px，旧值 300 会折出孤字「向」；drag 文案 170px 不受影响）；③ `deadlock-warning` 事件**不再带** `freeCells`/`requiredCells`（M2-4 旧面积判据残留、无消费方，已删事件字段 + `afterCommit` 透传 + `DeadendReport` 字段 + 死代码 `areaIsNotObviouslyInsufficientForDebugOnly`；判据行为不变，仍 `stuck = suggestNextPlacement(...)===null`）。
- **M2-8 存档=单一命名空间存全部持久态（`162faac`）**：`SaveDataV1` 增 `learnedLevelIds`（与 `clearedLevelIds` 同源同判），**两条真相共用 `cleanLevelIds`**（去重/升序/滤非正整数）——`coerceProgress`（读入）与纯函数 `setLearnedLevels`（写入）同一套归一，防漂移；`markCleared` 经 `...p` 透传不丢。存取层 `view/storage.ts` **零改动**（整份 JSON 序列化，加字段不动）。**接线**：`GameController.onLoad` 先 `restore(loadProgress().learnedLevelIds)` **再** `startLevel`（首关引导是否弹出由它决定，灌晚会漏弹/错弹）；学会时 `setLearnedLevels(loadProgress(), guideMemory.learnedLevels(), now)`+`saveProgress`——**读改存（先取全量再覆盖本字段），任何写方都必须这样**，否则后写方抹掉另一方（表现为「通关记录回退」/「引导又弹」）。`maybeShowGuide` 加了 DEBUG 日志「引导显示：L…」/「引导跳过：L… 已学会」。`guide.ts` 文件头已更正（原「调用方无需改动」不成立）。
- **M2-9 音效（`7d88d4e`）**：两层——**core `audio/sfx.ts` 纯数据规格表**（UI Spec 8 四种：`select` 选中轻点 70ms / `place-ok` 合法放置咔哒 110ms / `place-fail` 非法放置柔和（三角波，禁 sawtooth）220ms / `success` 扣锁双脉冲 click+上行小钟 340ms；脉冲序列模型，`durationMs` 推导）+ **view `AudioAdapter.ts` WebAudio 合成**（模块级单例 `audio`，Home/Game 共用一个 `AudioContext`）。占位期无音频文件（同「程序化色块」思路），M4-4 真素材只换发声后端、`SfxKey` 不变。**WebAudio 两坑**：① `suspended` 的 ctx 里 schedule 的声音被丢弃（症状「第一次没声」）→ 懒创建 + `resume()` 落地后再发声（游戏每次播放都在手势回调里，合 TDD 11.3）；② `osc.stop()` 硬切时增益未衰尽残留直流爆音 → 起振 8ms linear ramp（config `SFX_ENVELOPE_ATTACK_S`）+ 释音指数衰减**恒收敛到 stop 时刻**（故 config 无释音常数）。同 key 重触发即停上一发防叠音；无 WebAudio 环境（微信端）优雅降级静默不抛错（M3 换 wx API，R-A4 要求收进 platform）。**静音开关在首页**（PRD 290，pill 页面 **(195,722)** = design y−300）：喇叭图形 + 「音效：开/关」双通道；点击 → `setMuted`(core 纯函数) + `saveProgress` 读改存 + 同步适配器；**开启时播 select 作当场确认**。`muted=true` = **音效关**（文案映射 `muted ? '关' : '开'`——曾标反，日志骗人）。**Game 接线**：`placement-committed`→place-ok、`placement-rejected`→place-fail、`level-cleared`→success（先声后画面）、`select` 意图（itemId 非空）→select；`grab`/deselect/rotate 都不响（规格只有四种）；`onDestroy`→`audio.stopAll()`。取证：`--grep "音效"` 看全量（Console 段只印后 80 行）；L1 拒收配方 = **把同形物品拖到同一落点**（L01_C→299,344 盖 L01_A → overlap → place-fail）；`--mute-audio` 的无头 Chrome 仍跑 AudioContext（null sink），DEBUG 日志可作证据。
- **M2-7 场景流与进度（`c1f26d5`）**：三段 **Boot（读存档）→ Home（选关）→ Game（玩）**，导航一律 `director.loadScene`。**进度模型在 core `progress.ts`**：`cleared`（已通关集合）是唯一真相，**最高解锁 = `cleared` 上界 + 1 与总关数取小**（不另存字段，避免两份真相不一致），`continueLevelId` = 最低未通关与最高解锁取小（主 CTA 进最新待玩关、全通落末关），`defaultProgress` = 仅 L1 解锁。**持久化 `view/storage.ts`**：`sys.localStorage`（Web 端=window.localStorage），key `suitcase.progress.v1`，读写**双向容错**（坏 JSON/缺字段/越界关卡号 → 回落默认，存档损坏不卡启动）。**场景间传关 `view/route.ts` 模块级单例**（`setPendingLevel`/`takePendingLevel` 取后即清）——`loadScene` 换场景时单例天然存活，**别用场景序列化属性**（要手改 JSON，易碎）。`BootController` 只做 `loadProgress()`→`loadScene('Home')`。**`HomeController`**：程序化建首页（同 ToolbarView 范式）；卡三态 已通关✓/继续(粉底+右上角实心标记，UI Spec「不只靠颜色区分」)/未解锁(锁角标)—锁角标放右上角，别画正中（会压关卡号）；门禁在卡片 `TOUCH_END` 判 `isUnlocked`，**未解锁只 `shakeX` 抖动不进**，全部卡片/CTA `propagationStopped=true`。**`GameController`**：`onLoad` **优先消费 `takePendingLevel()`**（有值覆盖场景属性 `levelId`，无值仍用属性→直连 Game 调试可用）；`level-cleared` 里 `markCleared(loadProgress(), levelId)`+`saveProgress`；左上角「返回 Home」按钮代码注入 `SafeAreaRoot`。**控制器挂载**：扩展 `tools/scene-build.mjs` 的 `SCENES`（走 `script()`）+ `node tools/scene-build.mjs Boot Home` 重生成，**不手改场景 JSON**。**Home 页坐标**：卡 1/2/3 中心 CSS **(74,272)/(195,272)/(316,272)**，第二行起 y≈422；L1 通关 4 拖松手点 `A→299,344 B→71,458 C→299,458 D→185,230`（松手点要按**抓取偏移**修正，多格物品按缩略图中心起手偏移非零）。**`preview-check.mjs` 已加 `--reload`**（同 profile 保留 localStorage，验「落盘→重启恢复」）。**`bb1fccd` 复审修复**：① **返回键闸门与 `isFrozen()` 分开**——新增 `canLeaveToHome()`（只挡 `WinAnimating`+`dialogOpen`，**放行 `Completed`**，与 SuccessOverlay「动画播完按钮才可用」同口径）；`isFrozen()` 仍含 `Completed`（棋盘输入浮层期冻结、防误触拖拽）——**两处故意不同口径**。原返回键误用 `isFrozen()` → `Completed` 是终态，浮层期返回键被一直压住、L10（无「下一关」）回首页要绕两步。② **三态徽标统一右上角**（已完成✓ / 当前▲ / 未解锁🔒，锚点 `halfW-15,halfH-15` 落在圆角弧心内），中央只放大号数字；当前卡三角标记用**路径填充**（`moveTo→lineTo→lineTo→close→fill`，Cocos 3.8.8 `Graphics` 无 `fillTriangle`）。
