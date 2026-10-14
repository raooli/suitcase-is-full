# 项目长期记忆 —— 《行李箱装不下啦！》

> 只记「跨会话仍然成立」的约定与手法。日常进展写 `YYYY-MM-DD.md`。

## 工程基线

- **Cocos Creator 3.8.8**（`/Applications/Cocos/Creator/3.8.8/`），锁版本；设计分辨率 **390×844 + Fit Width**（`settings/v2/packages/project.json`）。
- **分层**：`assets/core/`（零 `cc`、纯逻辑、可 Vitest）↔ `assets/view/`（唯一允许 `import 'cc'`）。core 只从 `core/index.ts` 对外（R-A3）。
- **守卫**（`npm run check:arch`，改规则要同步 `docs/06` §1.2/§1.3）：R-A1 core 无 cc；R-A3 禁深引 core 内部；R-A4 wx 只在 platform；**R-A6 格算术（`cellSize`/`cellPx`）只许出现在 `view/BoardView.ts` 与 `core/config.ts`**；R-A9 assets 只放运行时资源；**R-A10 禁 `[...x]` 展开语法**（Cocos loose 转译会降级成 `[x]`，症状是"单测全绿、引擎里数据错"，一律 `Array.from`）。
- **参数只改 `core/config.ts`**（布局/阈值/色板/明度倍率），禁止魔法数字散落。

## 交付纪律（每个任务）

1. `npm run check`（typecheck + **typecheck:view** + check:arch + verify:levels + vitest）；
2. `npm run preview:game`（= CLI 构建 Game 场景 + 无头预览，有 error 即失败）；
3. 双绿才提交；CHANGELOG 追加一条（一 commit 一条，倒序，文件用 `git show --stat` 核对）。

> **view 的类型检查（M1-7 后补，`8a81786`）**：`typecheck`（tsconfig.node.json）的 `include` **不含 `assets/view/`**，而 **Cocos 构建也不做类型检查**——M1-7 实测"view 里引用一个不存在的常量"构建照过、运行时才炸 ReferenceError（还连带五连崩）。为此新增 `tsconfig.view.json` + `npm run typecheck:view`（已编入 `check`）。两处必须显式重写：`types`（继承自 `temp/tsconfig.cocos.json` 的相对路径会以**被继承文件所在目录**为基准解析，留空会指到 `temp/temp/declarations/*`）、`target/lib` 提到 ES2020（否则连 core 一起检查时 `BigInt`/`padStart` 报假错）。视图里 `onLoad`/`onEnable`/`onDisable` 需 `override`（`noImplicitOverride`；引擎侧 TS 4.9.5 ≥ 4.3，编译期擦除不影响产物）。**预览仍不可省**：类型检查抓不到"逻辑/时序"错误。

## 引擎限制与状态机不变式（实测）

- **一个节点只能有一个 renderable 组件**（Graphics/Label/Sprite…）：给已有 Graphics 的节点再 `addComponent(Graphics)` 会被引擎**静默拒绝**（Console 一条 `Can't add renderable component…` warning，绘制内容一个不出现）。同节点要多组绘制就复用同一 Graphics（`fill()` 消费 path，可反复 `circle()+fill()`），或建子节点。
- **冻结门必须覆盖所有 intent handler，含清理路径**（M1-7 定稿补全）：`GameSession` 的 8 个写状态 handler 全部有 `isInputFrozen()` 门（`handleDrop`/`handleCancel` 这两条"无预览清理分支"是 M1-7 才补上的——它们本来就会把 phase 改回 Idle/Selected，通关动画期间放过去等于把"已通关"抹掉、输入提前解冻）；`handleMove` **不需要门**：它靠 `phase !== 'Dragging'` 提前返回、且**只重建 preview 不写 phase**。新增 intent 类型时先问：它在冻结期被放进来的话，哪条路径会写 phase/state？
- **懒加载构建（`built` 标志 + `buildOnce` 提前 return）必须把"随事件变化的文案"抽成 `applyEvent()`，在入口无条件调用**（M1-7 真缺陷，`fcb894e` 修）：`SuccessOverlay.show()` 曾在 `built===true` 时整个 return，「第 N 关」「N 步 · N.Ns」只在**首次**写入，**复玩后第二次通关仍显示首次战绩**（实测：第二次 5.9s，面板显示 15.2s；`--grep 浮层入场` 两条对照是铁证）。M2 的 `GuideOverlay`/`ConfirmDialog` 同类结构照此预防。
- **`completeWinAnimation()` 幂等**（`if (phase === 'WinAnimating')` 守卫）——所以重复调无害，但这不构成"可以重复 `scheduleOnce`"的理由：`SuccessOverlay.show()` 开头已加 `unscheduleAllCallbacks()`（`fcb894e`）。
- **冻结期手势要显式作废，不能靠残留标志**（`fcb894e`）：`DragController` 原 `onTouchStart` 的冻结分支在清 `consumedByDrag`/`pending` 之前就 return，于是冻结期的 `touchend` 拿**上一次手势残留的** `consumedByDrag` 判"点还是拖"——上次恰好是拖拽（通关必由 drop 完成）才没发出 select tap，属"碰巧正确"。现改为：按下即 `beginGesture()` 归零 + `gestureFrozen = inputFrozen()`，**整段手势**（move/end/cancel）据此显式 return——顺带覆盖"慢手势跨过 360ms 动画期、松手时已解冻"的补发风险。
- **L1 通关拖拽校准配方**（无头测试直接抄）：L1 = 3×3 / cellPx=114；解法 `A@(1,1) B@(1,0) C@(2,1) D@(0,0)`。在 0 号槽按 **(47,658)** 四件物品 `grabOffset` 全为 (0,0)；松手点取**格中心 x−10、y+10（board-local，y 向上）**⇒ **折算页面坐标 = (x−10, y−10)**（格中心处 `round(r+0.5)` 会进位到右下斜邻格）。页面坐标格中心：(81,240)(195,240)(309,240)/(81,354)(195,354)(309,354)/(81,468)(195,468)(309,468)。SuccessOverlay「再来一次」按钮 = 页面 **(195,520)**。
- **落点→格的换算式（页面坐标，M1-7 实测钉死，比抄点位可靠）**：`pointerRow = round((pageY − 183) / 114)`、`pointerCol = round((pageX − 24) / 114)`；等价：col 桶 `[-33+114c, 81+114c)`、row 桶 `[126+114r, 240+114r)`（**桶边界正好压在格里视觉中心**，所以"格中心"落点会进位到右下邻格）。**起点也可改用托盘 0 号槽中心页面 (62,658)**（左对齐、件数变化不移动；该点 offset：1×2/1×3 类 = (0,1)、2×1 类 = (0,0)）。已验证可通关的四拖：`A@(1,0)=(138,297)` `B@(1,2)=(252,297)` `C@(2,0)=(138,411)` `D@(0,0)=(138,183)`。

## 无 GUI 预览与取证手法

- 构建/预览坑：`env -u ELECTRON_RUN_AS_NODE`、`ELECTRON_DISABLE_SANDBOX=1`；编辑器退出码恒 36（关闭期 SIGTERM），以日志 `build Task (web-mobile) Finished in` 判成功。
- `node tools/preview-check.mjs --scene Game [--shot out.png] [--grep X]`；复现现有构建可省 `--scene`。
- **Chrome 必须 `--no-sandbox --no-zygote`**：本环境外层（WorkBuddy）沙箱会拦截 Chrome 启动期系统调用，使其 **SIGTRAP 崩溃**、调试端口起了即死、`Runtime.enable` 超时（实测）。关掉 Chrome 内部沙箱后正常。注意 `dangerouslyDisableSandbox` 在本环境被拒、且一次性 escalation 过期后也会失效，**别依赖它兜预览**；`--no-sandbox` 才是稳的。`HOME` 重定向对 RLZ 拦截无效（macOS Chrome 硬编码真实 Application Support）。
- **像素级核对**（比目测可靠）：写个纯 stdlib PNG 解码 + 扫描线找色块中心，比对格中心（例：色块中心 149.5/359.5/569.5 ↔ 格中心 150/360/570）。
- **负向验证**：改阈值（如 `CELL_PX_MIN`）故意触发告警分支，确认它真的会报，然后回退。
- **手势取证**：`--drag x1,y1,x2,y2`（按下 → 8 段**插值** move → 松手；跳变式输入验不出节流与跟手）。
- **三套坐标别混**：`--tap/--drag` 收 **CSS 页面坐标**；引擎 `event.getUILocation()` = **世界坐标**（y 自下而上，`uiY = 844 − pageY`）；**设计坐标**原点在画布中心（`= world − (195,422)`）。`getLocation()` 是设备像素（dsf=2 时 2×），别拿它对设计值。
- **取真实退出码**：用 `cmd > log 2>&1; echo $?`。`cmd | tail` 拿到的是 tail 的码。后台任务状态可能因沙箱拦截 Cocos 编辑器临时文件清理而显示 failed，但脚本自身 EXIT=0——以日志里的「✅ 预览无 Console 错误」+ 退出码为准。
- **「Cocos 编辑器点预览只见棋盘」= 视口纵横比问题，不是代码 bug**：设计 390×844 竖屏 + Fit Width，编辑器预览若在横屏/矮窗里跑，844 高的画布按宽度缩放后远超窗口高，**底部托盘（设计 y ≈ −166~−326）+ 工具栏被裁出视野**。无头夹具固定 390×844 就完整（截图实证棋盘 + 4 托盘物品）。**浏览器试玩**：构建 web-mobile → `cd build/web-mobile && python3 -m http.server 8123`（file:// 会被 ES module CORS 拦）→ 开 `http://localhost:8123/` → DevTools 设备模拟选竖屏 iPhone（390×844）**并开 touch 仿真**（桌面鼠标不触发 TOUCH_*，不开设备模拟拖不动）。

## Cocos 3.8.8 触摸事件的三条实测事实

1. **全局 `input.on(Input.EventType.TOUCH_START)` 在 web-mobile 构建里收不到事件**（onEnable 正常、枚举值正确、refs 都 ok，回调一次都没进）。一律用**节点级** `node.on(Node.EventType.TOUCH_*)`。
2. **整个触摸由「按下时命中的最深节点」认领**；松手点不在该节点内时，引擎把事件类型改成 **TOUCH_CANCEL 而非 TOUCH_END**（`NodeEventProcessor._handleTouchEnd`）。所以**手势监听必须挂在覆盖整屏的节点**（本项目是 `SafeAreaRoot`），子节点（槽位、托盘、棋盘）一概不挂——否则跨区域拖拽永远收不到"松手"。浏览器侧其实是干净的 `touchend`，是引擎侧转换的。
3. **必须 `touch-action: none`**（预览夹具注入；真机/发布模板也要有），否则浏览器接管 pan 手势会派发 `touchcancel`。

推论：**点 vs 拖的仲裁只能有一处**。点选与起拖共用同一次 touchstart，拆到两个组件各判一次必然"拖完松手顺带选中一下"。本项目由 `DragController` 独占（`UI_DRAG_THRESHOLD_PX` 阈值 + `onTap` 出口）。

## 已确认、不得擅自改的规格

- 色号 = UI Spec 4 节 Design Tokens（`UI_PALETTE`）。**派生只允许压明度、不许改色相**；改色号属改已确认设计，须过美术确认。
- P-04：格边长硬下限 **44px**（320px 屏物理口径）；短屏压缩顺序 tray → toolbar/header → margin → （最后才）降下限且需 ADR。
- TDD 17.4 占位策略：按最终包围盒尺寸绘制、2px brown 描边、真图 M4-5 替换时结构不动（`ItemView.setSpriteFrame()` 是桩）。
- 命名：`GameController`（不是 `GameScene`，避免与 `cc.Scene`/`Game.scene` 撞名）。
- **取整语义分场景**（M1-5 实测）：**抓取锚点用按下点算**（与 `grabOffset` 同源，否则格中心 round 不稳会跳到 `[0,-1]`）；**board 命中用 `localToGrid`（floor）**（格中心的点不能 round 进位到右下斜邻格，否则按物品中心抓不起来）；**move 锚点用 `snapToGrid`（round）**（TDD 6.3 裁决）。三处不同是有意的，别"统一"成同一个。
- **Console 取证只看最后 80 行**（`preview-check.mjs` 的 `slice(-80)`）：长手势序列会被截断，靠 `--grep <子串>` 过滤看全量（注意 `--grep` **只打印匹配行**，不过滤时只留尾部；且是**纯子串**匹配、不认 `|` 正则——写 `a|b` 会 0 命中，用单关键词）。`--drag` 第 5 段截图是 touchEnd **前**的中途态；拍终态用独立 `--shot` step。
- **时序取证（复现"动画没播完就连抓"类 bug）**：合成输入管线（CDP → 浏览器 → 引擎）有 **~34ms 投递延迟**，默认 `--drag` 节奏（touchStart 后等 120ms、拖拽间隔 600ms）够不到 160ms 的回弹窗口。压时序用 `--gap 0 --drag-wait 40`（拖拽后等待 / touchStart 后等多久发首个 move）。**`--gap`/`--drag-wait` 是全局单值、不是逐步参数**（`parseArgs` 最后赋值生效，且只作用于 drag 之后的等待；`--tap` 后无等待）——写成 `--gap 700 … --gap 0` 会让**所有** drag 都用 0，症状是"点击紧跟拖拽 75ms 后发生、撞在入场动画里被忽略"（实测踩过）。DEBUG 日志带 `performance.now()` 时间戳（ghost、抖动起播/播完、原生触摸事件），时序类 bug 全靠它对表。**停位移 tween 必须同时归位节点**（`Tween.stopAllByTarget` 只停动画，节点留在中断帧偏移上）——`PreviewLayer.stopShake` 是范本。
- **改状态唯一入口 = `dispatch`**（M1-6 定型）：view 一律 `onIntent → GameController.handleIntent → session.dispatch`；重绘只由**真·改状态**事件触发（`state-changed` 每次 dispatch 都带，含 move，拿它当触发器会每移一格全盘重建）。`grab` 不改 state，故拖拽中被拖物品要 `setHiddenItem` 双视图排除（ItemLayer/TrayView）防"原位一份 + ghost 一份"。
- **提交前先 `git status`**：仓库可能有其他协作者（如用户本人）的在途改动（如 prop_02_*.png 素材更换），`git add -A` 会一并卷入。只暂存自己的文件；误入了用 `git reset --soft HEAD~1` + `git restore --staged <路径>` 拆分，工作区改动不受影响。
- **旋转入口 = 「再次点击已选中的物品」**（M1-8 定，`c52bbd2`）：M1 无工具栏（旋转按钮是 M2-2），按 M1.A 表「rotate = 旋转按钮或双击」取双击语义，但**用"已选中"判定而非计时器**（计时器有时间阈值竞态）。`DragController.emitTap` 复用 `pickAt`（托盘优先 + 棋盘已放物品），语义由 `GameController.handleTap` 判。**L1/L2 物品 `rotatable` 全 false**（教学关设计），旋转只能在 L3+ 端到端验；要验就把 `assets/data/levels.json` 的 L1 临时改成 true（形状/棋盘不变、已验证坐标全复用），验完 `git checkout` 回退。
- **抖动的唯一实现 = `view/shake.ts`**（M1-8 抽出，`stopShake` + `shakeX`）：调用方必须存**基准位**并传进来（不能取当前 position——被中断的抖动会把偏移继承下去）；`PreviewLayer` / `ItemLayer` 都用它。`rotate-blocked` 分支**不要 refresh**（状态未变，重绘会把刚要抖的节点重建掉）。
- **G1 出口检查点结论：Go**（报告 `docs/08` **V1.1**；V1.0 曾判 No-Go，M1-9 修复后改判，判据口径未放宽）：G1-1 手指遮挡 ✅（M1-9 实现）；G1-2 吸附 ✅；G1-3 旋转手感 ✅；G1-4 真机**顺延 M3-1 + 登记为已知风险**（320px 折算 93.5px ✅ 过 44 下限，微信开发者工具本环境没有；三个手感常量已集中，真机只改数值）；G1-5 撤销**不给临时手势**、整体归 M2-2。
- **手指遮挡补偿 = 只改画法，三条硬约束**（M1-9 定，`UI_DRAG_LIFT_PX=24` / `UI_DRAG_LIFT_SCALE=1.05` / `UI_DRAG_SHADOW_OFFSET_PX=3` / `ALPHA=0.18`，全在 `config.ts`）：① `preview.anchor` 一个字不动（落点仍按手指位置 `snapToGrid` 算，否则 G1-2 立刻破功）② **不挪节点**——上浮画在 `Graphics` 的矩形上，`nodePos` 全程不变（M1-7 的 tween 不归位教训）③ 缩放锚点取**整体包围盒中心**（`core/geometry/lift.ts` 的 `centerOf`；取单格中心会让 1×3 物品散成三块，而 1.05 这种小倍率下**肉眼看不见**，只有算才知道）。非法态（红虚线）与合法态同步抬起。
- **撤销入口的裁定：M1 不给临时手势，只等 M2-2 工具栏**（M1-9 定案，**别再倒回去自创**）。与 M1-8 旋转临时入口**刻意不对称**，理由三条：① 旋转有规格明文授权（UI Spec 5.2「可在已选中时点击按钮」）+ 作用于被选中对象（点它自己）；撤销的规格位置是**底部工具栏**（UI Spec 5.2），没有对应手势 ② 旋转四次回初态、非破坏性；撤销**破坏性且无重做**（core `History` 只有 `canUndo`，没有 redo），误触无救济 ③ 空白区手势已被交互表占用（「点击空白 → 取消高亮回 Idle」），双击/长按撤销会撞车成"想取消高亮却撤了一步"；且 M2-2 必然替换掉临时手势（第二套肌肉记忆）。**撤销的 view 侧残影风险低**：`undo-applied` 走的是与 `placement-committed`/`item-returned` 完全相同的 `refreshAll → ItemLayer 全量重绘` 路径。
