# 变更记录（CHANGELOG）

> 本文件按提交（commit）为单位，记录**每次改动更新了哪些代码与文件内容**。
> 用途：让任何一个人（或 AI 助手）在不知道对话历史的情况下，能从一条提交反推出「现在系统长什么样、为什么变成这样」。
>
> **维护规则（必须遵守）**
>
> 1. **每次 commit 之后立即追加一条**，倒序排列（最新的在最上面）。不允许攒着补。
> 2. 一条记录 = 一个 commit。**不要**把多个 commit 合并成一条，也不要把一个 commit 拆成多条。
> 3. `文件` 列必须写**真实改动的文件路径**，用 `git show --stat <hash>` 核对，不要凭记忆写。
> 4. `要点` 只写**这次真正改了什么**，不写背景介绍、不写未来计划（未来计划写进各文档的「待决策项」）。
> 5. 规则类变更（通关条件 / 放置合法性 / 旋转方式 / 是否可撤回）必须在 `要点` 里显式标出，并同步升级对应文档版本。
> 6. 若某次提交**推翻了本文档先前记录的结论**，在新条目里写明「推翻 `<hash>` 的某结论」，**不要**回去改旧条目——历史要留痕。
>
> 生成当前条目的命令：
>
> ```bash
> git show --stat --format="" HEAD          # 文件清单与增删行数
> git log -1 --format="%h|%ad|%s" --date=format:"%Y-%m-%d %H:%M"
> ```

---

## 提交记录（倒序）

### `bff0abe` · feat: M1-4 拖拽手势 → 意图流（DragController）+ 抓取偏移纯函数

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 11:02 |
| 完整 hash | `bff0abe`（见 `git log -1 --format=%H`） |
| 类型 | 功能（M1-4：可玩内核第 5 步 · 拖拽放置）+ 手势仲裁归位 |
| 文件 | 14 个：新增 `assets/core/geometry/drag.ts(+.meta)`、`assets/view/DragController.ts(+.meta)`、`test/drag.spec.ts`；改 `assets/core/{config.ts,index.ts,rules/placement.ts}`、`assets/view/{TraySlot.ts,TrayView.ts,GameController.ts}`、`assets/scenes/Game.scene`、`tools/{preview-check.mjs,scene-build.mjs}` |

**要点：**

- **`core/geometry/drag.ts`（新增，纯函数、零 cc，14 条单测）**：`grabOffsetForBoardCell` / `anchorForPointerCell`（互逆）/ `grabOffsetFromRatio`（托盘按 `u,v` 比例取格，含 `Number.isFinite` 守卫与边界 clamp，退化输入不产 NaN）/ `sameRC`（move 节流）。**grabOffset 语义 = 手指格 − 物品锚点，move 全程保持**，等价于「被手指压住的那一格始终跟着手指」——这是验收 T1/T2 的本质，写成"物品中心对准手指"会让抓边角的物品整体跳半格。文件只做格索引整数算术，像素换算不在这里（R-A6）。
- **`core/rules/placement.ts` 新增 `itemAtCell`**：查「这一格属于哪件已放置物品」并返回其锚点。占用关系一律走 `buildIndex`，**不另建索引**——另建一份就是第二个真相源，撤销/取出后会分叉。
- **`view/DragController.ts`（新增）**：touch 生命周期 → `grab → move* → drop|cancel|removeToTray` 的 Intent 流，只打到 `onIntent`（**M1-4 阶段是 Console 挂具**，M1-6 接线时把 `GameController` 里那一行换成 `session.dispatch` 即可，其余不动）。move 按 `sameRC` 节流到**逐格变化**才发；松手落在托盘带内 → 原本在盘上的发 `removeToTray`、原本就在托盘的发 `cancel`，否则 `drop`。不读 `LevelState`、不做合法性判定——「能不能放」是 core 的事。
- **触摸监听整体上移到覆盖整屏的 `SafeAreaRoot`（`gestureRoot`），`TraySlot`/`TrayView` 都不再注册监听**（关键修复）：Cocos 由**按下时命中的最深节点**认领整次触摸，松手点不在该节点内时派发的是 **TOUCH_CANCEL 而非 TOUCH_END**（`NodeEventProcessor._handleTouchEnd`）。槽位只有 76×76，从托盘拖到棋盘松手必然在它外面 → 拖拽永远收不到「松手」（实测：浏览器侧是干净的 `touchend`，是引擎侧转换的）。改挂整屏节点后实测收到 `TOUCH_END` 且 `drop` 正常。`onTouchCancel` 保留但**不猜落点**——猜出来的落点会让"放不下"变成"放错位置"，比取消更难查。
- **点 vs 拖的仲裁收在一处**：位移未过 `UI_DRAG_THRESHOLD_PX = 8`（设计单位，≈320px 屏 6.6 物理像素）一律不算拖拽、一个意图都不发，松手时改走新增的 `onTap` 出口（`itemId === null` = 点托盘空白 → 取消选中）。理由：点选与起拖共用同一次 touchstart，仲裁若拆到两个组件各判一次，拖完松手必然顺带选中一下。相应地 `TrayView.onSelect`/`isDragGesture`、`TraySlot.onSelect`/`letBubble` 全部移除（M1-3 那套"槽位监听 + 反向查询"的写法让位）。`onTap` 只认托盘带内的点击，点棋盘不会顺手取消选中。
- **`tools/scene-build.mjs`**：新增 `nodeRef()` + 节点注册表，支持组件属性引用**节点**（`gestureRoot` → `SafeAreaRoot`），此前只能引用组件。
- **`tools/preview-check.mjs`**：新增 `--drag x1,y1,x2,y2`（按下 → 8 段**插值** move → 松手；跳变式输入验不出节流与跟手）；navigate 后注入 `touch-action:none`（否则浏览器接管 pan 手势会派发 `touchcancel`）。坐标口径：`--tap`/`--drag` 收的是 **CSS 页面坐标**，与引擎 `getUILocation()`（= 世界坐标，y 轴自下而上）相差 844 的翻转，与设计坐标（原点在画布中心）相差 (195, 422)。
- **验收证据（`npm run check` 199/199 全绿 + `npm run preview:game` 无 Console 错误）**：
  - **T1/T2 机械确认**：同一落点（棋盘中心，手指格均为 (2,2)）下，抓物品**左半** `grabOffset=(0,0)` → 末锚点 `[2,2]`；抓**右半** `grabOffset=(0,1)` → 末锚点 `[2,1]`。两者差值恰为 grabOffset 差值 `(0,1)`，即「被手指压住的那一格始终跟着手指」。
  - 四种手势：点槽位 → `select(L01_A) → phase=Selected`；点托盘空白 → `select(null) → phase=Idle`；**4px 微动仍判点击**（无 grab/move 意图）；真拖 → `grab → move×4 → drop` 且不再发点击。
  - 坐标自洽核对：末次锚点 `[2,1]` 看起来"偏了"，实为 `snapToGrid` 是 **round** 语义（TDD 6.3），棋盘正中心 `(0,0)` 四舍五入进位到格 (2,2)，减 offset 后正是 `[2,1]`——不是 bug，此前按 floor 口算才对不上。
- **已知未覆盖**：`DragController` 本体不进 Vitest（view 层无引擎跑不了，A-05），正确性由 `core/geometry/drag.ts` 单测 + 预览意图序列守；拖起时的**视觉跟手**（物品跟着手指动）要等 M1-5 `PreviewLayer` 才有画面可验。

### `89d0371` · feat: M1-3 托盘列表（TrayView + TraySlot）+ 缩略图居中纯函数 + 预览夹具手势/视口改造

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 02:07 |
| 完整 hash | `89d0371`（见 `git log -1 --format=%H`） |
| 类型 | 功能（M1-3：可玩内核第 4 步 · 托盘与点选）+ 预览夹具改造 |
| 文件 | 17 个：新增 `assets/view/TrayView.ts(+.meta)`、`assets/view/TraySlot.ts(+.meta)`、`assets/core/geometry/thumbnail.ts(+.meta)`、`test/thumbnail.spec.ts`、`art/art-source/props/prop_01_B_wallet.svg`；改 `assets/core/{config.ts,index.ts}`、`assets/view/{BoardView.ts,GameController.ts,ItemView.ts}`、`assets/scenes/Game.scene`、`tools/{preview-check.mjs,scene-build.mjs}`、`art/art-source/props/prop_01_A_phone.svg` |

**要点：**

- **`view/TrayView.ts` + `view/TraySlot.ts`（新增）**：托盘列表。按 `state.tray` 顺序建槽位（数据与顺序全来自 `state`，本组件不持有副本）；`onSelect` 回调 → `GameController.selectItem` → `dispatch({type:'select'})` → `applyState` **只刷选中态、不重建节点**。选中描边 `accentPink`、取消回 `border`（预览实测：触摸 `(62,668)` 命中槽位 0，`select(L01_A) → phase=Selected`）。
- **`core/geometry/thumbnail.ts`（新增，纯函数、零 cc）**：`fitThumbnail(w,h,side,padding)` 把"缩放居中"算术从视图层抽出。**背景 bug**：`TraySlot.setItem` 原把"距边距离"当中心原点坐标，物品整体偏移 (+38,−38) 设计单位（横向跑出卡缘、纵向垂到卡下）；修复后 `x=-w/2 / y=+h/2`（物品锚点左上 (0,1) 与槽位中心 (0.5,0.5) 混用，是易错点）。8 条单测覆盖居中不变量、永不溢出、只缩不放（保"占几格"预判）、等比、退化输入无 NaN；**负向验证**：临时填回旧公式 `(side-w)/2,-(side-h)/2` → 4 条断言 FAIL、差异恰 38，与像素实测 (+38,−38) 一致，证明这组单测真能拦住该 bug。
- **`TrayView` 渲染口径**：`slotSizeFor`/`visibleCount` 复用 P-04 下限 44px 热区；`mountItem` 用 `source.shapeMetrics` + `slot.setItem` 拿像素；溢出告警留给 M2。
- **`view/GameController.ts`**：新增 `trayView` 属性、`renderTray()`、`selectItem()`（走真实 dispatch + `applyState` 回画）；`debugPlaceFirstItem` 由 M1-2 的"直接建节点摆盘"改为走 `grab/move/drop` 真实意图流——托盘上线后直接建节点会造成"盘上 4 件 + 托盘 4 件"矛盾态，走 dispatch 则 `state` 与画面天然一致，也预演了 M1-6 链路；引用 `findItem`/`eventName`。
- **预览夹具 `tools/preview-check.mjs` 重构（可复用手法）**：`--shot`/`--tap`/`--tap-mouse` 由独立字段改为**按命令行顺序的 `steps` 有序动作**（`--shot a.png --tap 62,668 --shot b.png` 一次采改前/改后对照图）；视口默认 `390x844@2`（Fit Width 下画布 1:1 铺满，托盘不被截）；运行时 `cc.profiler.hideStats()` 隐藏 FPS 面板（`showFPS=false` 构建参数无效）；`Emulation.setTouchEmulationEnabled` 开触摸仿真（仅 `mobile:true` 不够）。**关键修复**：Chrome 加 `--no-sandbox`/`--no-zygote` —— 受限外层沙箱会拦截 Chrome 启动期系统调用使其 SIGTRAP 崩溃、调试端口起了即死、导致 `Runtime.enable` 超时，关掉 Chrome 内部沙箱后正常（实测 EXIT=0、无 Console 错误）。
- **验证**：`npm run check` 全绿 **185/185**（原 177 + 新增 thumbnail 8）；`npm run preview:game` 无 Console 错误（EXIT=0），`[TrayView] 托盘 3 件 … 缩略60×30@(-30,15) …` 证实居中修复；触摸 select 日志与几何 `canvas:[0,0,390,844] hasTouch:true` 核对无误。

### `0f4d69d` · feat: M1-2 物品占位色块（ItemView）+ 明度阶梯（core/palette）+ P-04 压缩阶梯告警

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 00:55 |
| 完整 hash | `0f4d69d`（见 `git log -1 --format=%H`） |
| 类型 | 功能（M1-2：可玩内核第 3 步）+ 检测点补齐 |
| 文件 | 10 个：`assets/core/palette.ts(+.meta)`、`assets/view/ItemView.ts(+.meta)`、`test/palette.spec.ts`（新增）；`assets/core/{config.ts,index.ts}`、`assets/view/{BoardView.ts,GameController.ts}`、`docs/06-架构设计-v1.0.md` |

**要点：**

- **`core/palette.ts`（新增，纯函数、零 cc）**：占位取色 + 明度阶梯。基色按 `trayOrder` 轮换 `mint → blue → rose`（**直接取 UI Spec 令牌色，不另造色**），明度按**占格数**分档（2 格亮 / 3 格中 / 4+ 格深，实施计划 M1.B；倍率 `UI_TONE_FACTOR` 只等比压暗 RGB，**不动色相**——色号是已确认的设计令牌）。附 WCAG `relativeLuminance` / `contrastRatio`，使 TDD 17.6 A-02「相邻物品明度差 ≥ 1 阶梯」**可被算出来**而非靠肉眼。
- **`view/ItemView.ts`（新增）**：单物品节点。按 TDD 17.4 以**包围盒尺寸**逐格画圆角色块（换真图时布局不跳）、每格内缩 6% 让多格物品**数得出格数**（A-01 缩略图测试）、2px `color.brown` 描边（TDD 17.4 口径）、锚点固定**左上角**与 `gridToLocal` 同口径。`setSpriteFrame()` 是 M4-5 换图**接口桩**：签名定死、方法体后换，调用方不动。
- **`BoardView.shapeMetrics(cells)`（新增出口）**：给出包围盒像素尺寸 + 逐格中心偏移。`ItemView` 由此拿到**全部像素**，自己一行 `row * cellPx` 都不写——R-A6 唯一转换点因此没被 M1-2 打开第二个口子（这正是架构文档 §0 点名要防的"在 ItemView 里自己算"）。
- **P-04 压缩阶梯告警（M3-5 检测点，按评审建议补）**：`renderBoard` 时若格边长跌破下限（设计口径或 320px 屏折算口径任一命中），报出 `UI_LAYOUT_BANDS` 各档推算值：`① tray 160→128 → ② toolbar 96→72 / header 120→96 → ③ margin 24→16 → ④ 下限 44→40（须真机复测 + 单独 ADR）`。**只报告、不自适应**，短屏适配留给 M3-5。刻意放在 `DEBUG` 之外——短屏破限是**真机会发生**的问题，静默掉会一路带到提审。
- **`GameController` 增 M1-2 可视化脚手架**：`DEBUG` 下调 `solve(level)` 取一个解，把物品摆上棋盘（`gridToLocal` 定位 + `ItemView` 上色）。M1-2 的两条验收是**视觉验收**，不摆上去就只能靠数字猜；**M1-6 接线后删除**（届时由 `state.placements` 驱动）。
- **文档同步**：`docs/06` 的 R-A6 口径补上 `cellPx` 与 `shapeMetrics`（守卫正则已扩为 `cell(?:Size|Px)`，配套写明正/反向用例）、目录树加 `core/palette.ts`、§4.3 职责表把 `ItemView` 的"占位外观 + 不做坐标转换/不加载资源"与 `BoardView` 的"形状像素出口"写实。
- **验收证据（`npm run check` 177/177 全绿 + `npm run preview:game` 无 Console 错误）**：
  - 摆盘预览日志：`L01_D 1×3格=342×114px @114px #A5CEBB ｜ L01_B 2×1格=114×228px ｜ L01_A 1×2格=228×114px #BCEAD5 ｜ L01_C 1×2格=228×114px #FFE0E7`——格数、像素、色值三者自洽。
  - **像素探针核对落位**：截图水平扫描线上三行色块中心 = 149.5 / 359.5 / 569.5，格中心 = 150 / 360 / 570，**逐格吻合**（这是"1 格物品看起来是 1 格"的机械证据，不靠目测）。
  - **负向验证告警分支**：临时把 `CELL_PX_MIN` 抬到 500 后告警如期出现（各档推算 114/114/114/119/119 单调递增），验证完已回退到 44。
- **已知取舍（留给美术评审裁决）**：三基色里 `mint` 与 `blue` 的**相对亮度几乎相同**（0.743 / 0.730），所以"同档但不同基色"的相邻物品主要靠**色相 + 2px 描边**区分，而非明度差。若要严格满足 A-02 的字面口径，需给三基色加**明度偏置**（会让 `#FFE0E7` 派生色偏离令牌观感）——这属于改观感，按红线必须过美术确认，故本轮**不动**。
- **已知未覆盖**：`ItemView` 与 `shapeMetrics` 不进 Vitest（view 层无引擎跑不了，A-05），正确性由预览的摆盘日志 + 像素探针守；`setSpriteFrame()` 桩目前无调用方，真图路径 M4-5 才验。

### `9572052` · feat: M1-1 棋盘渲染（BoardView + GridCellView）+ 设计分辨率对齐规格

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 00:10 |
| 完整 hash | `9572052`（见 `git log -1 --format=%H`） |
| 类型 | 功能（M1-1：可玩内核第 2 步）+ 工程修正 |
| 文件 | 11 个：`assets/view/{BoardView.ts,GridCellView.ts}(+.meta)`（新增）、`assets/view/GameController.ts`、`assets/core/config.ts`、`assets/scenes/{Boot,Home,Game}.scene`、`settings/v2/packages/project.json`、`tools/scene-build.mjs` |

**要点：**

- **`BoardView` = 全项目唯一的 RC↔像素转换点（R-A6 / ADR A-07）**：`gridToLocal(row,col)`（格左上角，物品锚点用）、`localToGrid(x,y)`（`floor` 命中测试）、`snapToGrid(x,y)`（`round` 拖拽吸附，TDD 6.3 口径）、`cellCenterLocal`（预览与物品节点对齐）。格边长 `= floor(min(可用宽/cols, 可用高/rows))`，按关卡动态算、不写死；棋盘带（顶部信息/底部托盘+工具栏之间）居中。
- **`GridCellView`**：单格程序绘制（`Graphics`，TDD T5 的占位色块路线），四态 `normal / blocked / valid / invalid`——`valid/invalid` 由 M1-5 `PreviewLayer` 推给它，本组件**不做合法性判定**；障碍格除配色外画叉号（UI Spec 10.6：不依赖颜色单通道）。
- **`core/config.ts` 增 UI 节**：设计画布 390×844、安全边距、三横带高度、格边长硬下限 `CELL_PX_MIN=44`（P-04）、美术基准 48、圆角与交替背景强度、Design Tokens 色板。core 只存数据，不认识 `cc.Size`/`cc.Color`。
- **修正 M0 遗留的不一致（规则类口径变更）**：M0 场景沿用 taxi 模板的 **720×1280**，而 TDD 11.3 指定 **390×844 + Fit Width**（对齐 UI Spec 基准画布）。本次把设计分辨率写进 `settings/v2/packages/project.json` 的 `general.designResolution`，三个场景的 Canvas UITransform 一并重生成（Boot/Home 保持空 Canvas，仅 Game 加 `SafeAreaRoot → BoardRoot`）。
- **`tools/scene-build.mjs`**：新增**组件引用**支持（`refTo('BoardRoot','BoardView')` → 序列化成 `{"__id__": N}`），使"场景里两个脚本组件互相引用"也能声明式表达。
- **验收证据（`npm run check` 全绿 + `npm run preview:game` 无 Console 错误）**：
  - 坐标往返自检 **9 格 × 4 项全部无偏移**（格角点→`localToGrid`、格中心→`localToGrid`、格角点→`snapToGrid`、与 core `toIndex`→`toRC` 交叉核对）——即 M1-1 验收的"与 `toRC`/`rcKey` 双向转换无偏移"。
  - **P-04 体检表**（Fit Width 折算到 320px 屏，下限 44px）：L1 3×3=114(93.5px)、L2 4×3=114、L3/L4 5×4=85(69.7px)、L5/L6 5×5=68(55.8px)、L7/L8 5×6=57(46.8px)、**L9/L10 6×6=57(46.8px ✅)**。UI Spec 要求的六种尺寸全覆盖，10/10 关达标。
  - 预览截图：3×3 棋盘正确渲染（正方形格、交替底色、圆角描边），60fps / 11 draw call。
- **自检踩到的坑（记录以免重犯）**：第一版自检拿**格中心**去测 `snapToGrid`，必然偏到下一格（中心距相邻两格角点都是半格）——`round` 语义的对象是**物品包围盒左上角**，不是格中心。已修正断言。
- **已知未覆盖**：`localToGrid`/`snapToGrid` 目前只有引擎内自检（view 不进 Vitest，A-05），没有真机触控输入验证；M1-4 接线后才有真实触摸流。

### `24bca8d` · feat: M1-0 会话引导（GameController）+ 无 GUI 预览工具链

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-13 23:54 |
| 完整 hash | `24bca8d`（见 `git log -1 --format=%H`） |
| 类型 | 功能（M1-0：可玩内核第 1 步）+ 工具链 + 修 bug |
| 文件 | 13 个：`assets/view/GameController.ts(+.meta)`（新增）、`assets/scenes/Game.scene`、`assets/core/{index.ts,model/level.ts,rules/placement.ts,session/GameSession.ts}`、`test/model.spec.ts`、`tools/{check-arch.ts,preview-check.mjs,scene-build.mjs}`、`package.json`、`docs/06-架构设计-v1.0.md` |

**要点：**

- **M1-0 会话引导**：新增 `GameController`，挂在 `Game.scene` 的 **`GameRoot` 节点**上（不是 Scene 根节点——查遍官方模板，11/11 个脚本组件都挂在子节点上，Scene 根节点 0 个组件）。`onLoad` 里 `parseLevelBundle(levelJson.json, levelId)` → `new GameSession(level)`；`DEBUG` 构建下打印 `debugSnapshot()`。装配失败**不抛到引擎层**（降级 Console 报错，避免坏数据白屏），UI 提示留到 M2-4。
- **关卡数据不内联**：直接以场景依赖引用 `assets/data/levels.json`（`cc.JsonAsset` 属性），而非实施计划 M1.B 写的「内联 JSON 副本」——副本会形成第二份真相源（A-04/R-A7）。实测该引用在构建产物中正确解析。
- **修一个只有引擎才暴露的 bug（规则类变更，务必记住）**：Cocos 3.8.8 构建的转译是 loose 模式，`[...set]` 被降级为 `[].concat(set)` → `[set]`，而 Node/Vitest 里展开语法是规范的 → 症状是**单测全绿、引擎里数据校验莫名失败**。实测症状：`trayOrder 必须从 1 开始连续，实际为 [object Set]`（L1 直接加载失败）。修法：4 处展开改 `Array.from`（`level.ts` 的 Set、`GameSession.ts` 的 Map 迭代器与 items、`placement.ts` 的 tray）；新增 **R-A10** 机械拦截（`assets/**` 禁 `[...x]`）；本文档 §1.3/§5 同步。
- **core 新增 `parseLevelBundle(raw, levelId)`**：「关卡包 → 单关」的取数与校验属逻辑，按执行纪律 #3 归 core（view 只负责递资产；M2-1 换成 `resources.load` 时这层不动）。`test/model.spec.ts` 补 5 条，含真实产物 `assets/data/levels.json` 的取数回归。
- **工具链（本环境无 GUI 编辑器，把「预览」从手点变成可复现的一条命令）**：
  - `tools/preview-check.mjs`：CDP 驱动本机 Chrome 无头加载构建产物（SwiftShader 软件 WebGL），捕获全量 Console + 页面异常 + 截图，**有 error 即 exit 1**；`--scene <Name>` 会先调 Cocos CLI 构建（自动把该场景设为 `startScene`）。本次那个 bug 就是它抓出来的。
  - `tools/scene-build.mjs`：声明式场景作者（只写结构节点 + 脚本组件；动态内容留给代码创建）。脚本组件的 `__type__` = 资源压缩 UUID（算法用 taxi 模板 11/11 反验通过），节点 id 按「场景+路径」确定性派生 → 幂等可重跑、diff 只反映真实结构改动。
  - `package.json` 新增 `preview` / `preview:game` / `scene:build`。
- **验收证据**：`npm run check` 全绿（typecheck + check:arch + verify-levels + **168/168**）；`npm run preview:game` 绿——引擎 60fps 加载 `Game.scene`，`GameController.onLoad` 执行，Console 无 error，`debugSnapshot()` 打印 `{"phase":"Idle","tray":["L01_A","L01_B","L01_C","L01_D"],"placed":[],"undoDepth":0,"moves":0}`。
- **遗留**：`Game.scene` 当前无任何可见节点（M1-0 只装配会话），预览截图为白屏 + 引擎统计浮层，属预期；`assets/view/` 的 `GameScene.ts`（架构文档 4.3）与实施计划写的 `GameController` 命名不一致，本次按实施计划 M1-0/M1.B 取 `GameController`。

### `7317041` · build: M0 工程落地 —— Cocos 3.8.8 工程合并 + 场景骨架

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-13 22:56 |
| 完整 hash | `7317041f094c43ea88cf67ae5f1a9606b6ad5db5` |
| 类型 | 工程（M0：环境与工程落地，05-实施计划第 2 节方案 A） |
| 文件 | 55 个：`.creator/default-meta.json`、`settings/v2/packages/*`（7 个）、`assets/scenes/{Boot,Home,Game}.scene(+.meta)`、40 个 `assets/**/*.meta`、`package.json`、`tsconfig.json`（新建）、`tsconfig.node.json`（原名迁）、`vitest.config.ts`、`README.md`、`.workbuddy/memory/2026-10-13.md` |

**要点：**

- **Cocos 工程合并（同目录，方案 A）**：仓库从普通目录变为 Cocos Creator 3.8.8 可识别工程。`.creator/` 与 `settings/` 以本机 3.8.8 官方模板 `templates/empty-2d` 为蓝本；`package.json` 增加 Cocos 字段（`creator.version=3.8.8`、`type="2d"`、`uuid=9375810b-…`），npm 侧 `version`/`devDependencies`/`scripts` 不变。
- **`type` 字段冲突裁决**：npm 的 `"type":"module"` 与 Cocos 的工程类型字段同名，取 `"2d"`——仓库无 `.js` 文件，实测 tsx 在该设置下 `import.meta.url`（`tools/verify-levels.ts` 等 3 处使用）正常工作；编辑器 `openProject` 只读 `creator?.version || version`，不读 npm `version`。
- **tsconfig 拆分**：原 `tsconfig.json` → `tsconfig.node.json`（`typecheck`/vitest 用，include 不变）；新建 Cocos 版 `tsconfig.json`（`extends ./temp/tsconfig.cocos.json`，由编辑器首次打开生成，`strict:true` 不降级）。`typecheck` 脚本改指 `tsconfig.node.json`。
- **三个空 2D 场景**：`assets/scenes/{Boot,Home,Game}.scene`，结构 = Camera + Canvas(UITransform 720×1280 + Canvas + Widget 满屏) + UICamera + SceneGlobals（ambient/shadows/skybox/fog）。序列化格式以官方模板实证：节点/组件结构抄 `templates/taxi` 真实场景，SceneGlobals 取 `templates/hello-3d-world`（3.8.8 编辑器亲写，无 octree 字段）；**SkyboxInfo 的 `_envmap` 置 null**（模板原值引用其自有 HDR 贴图，照抄会产生悬空引用告警）。
- **39 个 `.meta` 入库**：由 Cocos CLI 首次资源扫描生成并提交（资源 UUID，架构文档 2.2 节要求）。`.gitignore` 复核无需改动（`.creator/`、`settings/`、`*.meta` 均不被忽略；`temp/ library/ build/ profiles/` 已忽略）。
- **README**：进度表补「Cocos 工程落地（M0）」行，修正 `assets/view/` 过时描述（「需先创建 Cocos 项目」→「M1，工程已就绪」）；引擎版本锁定栏（M0-2）经 PlistBuddy 核验 `CFBundleShortVersionString=3.8.8` 早已回填完整，未改动。

**验证证据：**

- Cocos CLI 构建 `platform=web-mobile` **成功**：编辑器完整初始化 → 全量资源导入（0 缺失告警）→ 打包完成；`launchScene=db://assets/scenes/Boot.scene`，3 个场景 JSON 全部进入 `build/web-mobile/assets/main/import/`。
- `npm run check` **全绿**：typecheck（tsconfig.node.json）+ check:arch + verify:levels + **163/163** 单测。
- M0-4 架构守卫复核：正向 `npm run check:arch` 通过；负向探针（`from 'cc'` / 深引 `../core/rules/board` / `wx.setStorageSync` / `3 * cellSize`）4 条规则全部拦截后已删除。

> ⚠️ **遗留未验证项**：「空场景能出画面」仅验证到构建产物层级（导入 0 告警 + 场景入包 + 启动场景正确），**未经 Cocos 编辑器 GUI 预览/真机渲染确认**。建议用户首次打开工程时点一次预览确认（场景结构抄自官方实证模板，风险低）。另：编辑器进程退出码恒为 36（关闭期 worker 收到 SIGTERM），非构建失败，属本机 CLI 环境的固有行为。

---

### `ab589c1` · docs: UI设计文件更新

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-13 16:14 |
| 完整 hash | `ab589c1f574f08614f7b7ced24c11bf1483acf08` |
| 类型 | 文档（UI 规范升 V1.2） |
| 文件 | `docs/03-UI-Spec.md`（+31/-?）、`docs/02-GDD-v1.0.md`（同步 397 行）、`.workbuddy/memory/2026-10-13.md` |

**要点：**

- `03-UI-Spec.md` 升 **V1.2**（文件标题仍写作 `V1.0`，版本号以文首「版本：**1.2**」为准）：
  - 第 3 节补全棋盘尺寸枚举，纳入 3×3（第 1 关）与 4×3（第 2 关），并新增**最小 `cellSize` 建议 ≥ 36px** 及窄屏降级策略。
  - 第 4 节调深 `color.text.secondary`（→`#6F646A`）与 `color.brown`（→`#7A5C4F`），满足 WCAG AA（`#FFF8EE` 底色上 ≥ 4.5:1）。
  - 第 5.2 节新增**首次引导层**（`GuideOverlay`），对应 PRD F13，第 1 / 3 关首次进入触发。
  - 第 6 节补全「已放物品选中 / 原位旋转」状态、明确撤回含朝向、修正重置入口位置、新增取消选中路径。
  - 第 7 节组件清单新增 `GuideOverlay` 与 `ConfirmDialog`。
- `02-GDD-v1.0.md` 同步大范围调整（主要为表格与条目对齐，规则未变）。

> ⚠️ **遗留不一致（本次未处理）**：PRD 与 TDD 的「配套文档」栏仍把 UI Spec 标为 **V1.1**，实际已是 V1.2。见 `docs/04-TDD-v1.0.md` 第 0.4 节问题清单 P-3。

---

### `eeef46a` · feat(core): 纯 TS 游戏逻辑骨架 + 关卡校验/难度工具链

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-13 15:37 |
| 完整 hash | `eeef46a5c28b5f1ab79d3c79d4ebd1559d87611c` |
| 类型 | 功能（代码实现，最大一次提交） |
| 文件 | `assets/core/**`（13 个 .ts）、`assets/data/levels.json`（生成物）、`tools/**`（2 个）、`test/**`（5 个）、`package.json`、`package-lock.json`、`tsconfig.json`、`vitest.config.ts`、`README.md` |

**新增 `assets/core/`（11 个模块，零 `cc` 依赖）：**

| 文件 | 职责 |
| --- | --- |
| `config.ts` | 全部可调参数集中处（触摸阈值、撤回上限、求解器上限…），禁止魔法数字散落 |
| `geometry/shape.ts` | 归一化、4 向旋转、包围盒、4 连通校验、朝向去重 |
| `geometry/coords.ts` | 网格坐标 ↔ 线性索引、边界与锚点 clamp |
| `model/types.ts` | 全部数据模型（只读、不可变） |
| `model/level.ts` | 关卡配置校验：断裂形状 / 未归一化坐标 / 重复格 / `trayOrder` 连续性 |
| `rules/board.ts` | `OccupancyIndex`，由 `placements` 每次重建，不做增量维护 |
| `rules/placement.ts` | `canPlace`（越界→障碍→重叠）、`applyPlacement`、`removeToTray`、`rotateInPlace`（包围盒中心 → 原锚点 → 邻域搜索 → 放弃） |
| `session/GameSession.ts` | `dispatch` 是**唯一**状态写入口；phase **转移式**通关判定 |
| `session/History.ts` | 快照式撤回栈（存旧对象，不写反向操作） |
| `session/events.ts` | core → view 事件类型 + 埋点事件名 |
| `solver/packer.ts` | 回溯求解器：bigint bitset + MRV + 面积剪枝；节点超限返回 `unknown` 而非 `unsolvable` |
| `solver/deadend.ts` | 面积守恒快检（单向、非阻断、充分不必要） |
| `index.ts` | 统一导出 |

**新增 `tools/`：**

- `verify-levels.ts`：结构 + 标准解 + 独立求解 + L03 旋转断言 → 生成生产态 `assets/data/levels.json`
- `difficulty-report.ts`：big% / 解数 / 双比例显著性检验

**新增 `test/`（5 个 spec，163 个用例全部通过）：**

- 逐关结构校验、标准解逐格合法、求解器独立判定可解
- **L03 禁旋无解断言**——把 GDD 的人工断言变成 CI 断言
- L01 / L02 禁旋可解（保证玩家在学会旋转前不会被卡）
- 用每关标准解走一遍 `GameSession`，断言**恰好触发一次**通关

**实现中修掉的真 bug（均为「文档没写清 → 写法自然出错」类型）：**

1. `handleDrop` 提交后无条件改写 `phase`，把 `afterCommit` 刚设置的 `WinAnimating` 冲掉 → 通关动画永不播放。修法：改写前先判 `isInputFrozen()`。
2. `reset` 漏了 `WinAnimating` 冻结判断 → 会抹掉已通关状态。
3. `checkDeadend` 把障碍格算成已占用，`freeCells` 被双重扣减 → 几乎每关一提交就误报「装不下」。
4. 关卡校验的**形状包围盒检查没考虑旋转**，把 L03 的 1×5 长柄伞判成「大于棋盘」而拒绝合法关卡 → 改为「存在任一朝向可放即通过」。

**其他：**

- `assets/data/levels.json` 由工具生成，已剥离 `solution` / `solutionGrid` / `verification`
- `README.md` 重写：目录结构、5 条核心工程约定、开发命令、关卡数据工作流、已知的坑

---

### `e5bdd8a` · docs: 修正难度校准口径与意图契约（推翻两处初稿结论）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-13 15:36 |
| 完整 hash | `e5bdd8ad95cb99153c6f5d837aaf9092894efa9b` |
| 类型 | 文档（口径修正） |
| 文件 | `docs/02-GDD-v1.0.md`（+47/-16）、`docs/04-TDD-v1.0.md`（+40）、`docs/01-PRD-v1.0.md`（+5）、`.gitignore`（+5） |

**要点：**

- **推翻** `c34433e` 的「解数可用于难度排序」：解数与 big% 的排序互相矛盾（L06 仅 18 组解却比 ≥3 万组解的 L09 更好放）。解数降级为「只用于扫解空间结构性异常」。
- **推翻** `c34433e` 的「除 L01/L02 外单调递减」：加双比例显著性检验后，L06→L07 / L07→L08 / L08→L09 / L09→L10 四对**全部不可区分**；唯一统计显著的真倒挂是 L01→L02（5.27% vs 2·SE 2.37%）。即「难度单调上升」只有 L02→L05 段被数据支持，**尾段必须靠试玩排序**。
- 明确尾段不要靠加大 N 解决：0.4% 附近要压 SE 需 N≈10 万，且该指标在极低区间已失真。
- `TDD 7.2` 意图契约修正：`grab` / `move` 载荷由 `pointer: Vec2Like` 改为 **`anchor: RC`**。原因：初稿要求传像素坐标，但 6.3 / 8.3 又规定像素↔网格转换只能在 `BoardView.localToGrid()` 发生——core 拿到像素却无权换算，只能凭空捏一个 `cellSize`。`SessionResult` 增加 `preview: DragPreview | null`。
- `TDD 7.1`：补明 `reset` 在 `WinAnimating` 期间也必须冻结。
- `TDD 8.2`：事件表补 `rotate-blocked`。
- `PRD 14.1`：把「big% 为唯一难度排序口径 + 判定倒挂必须做显著性检验」写成已确定项。

---

### `c34433e` · docs: PRD/GDD/UI/TDD 升 V1.1（取出规则 + 难度校准）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-13 14:58 |
| 完整 hash | `c34433ec56f8d289fc121bdc09f6af800d6691e0` |
| 类型 | 文档（**规则变更** + 关卡数据 V1.1） |
| 文件 | `docs/01-PRD-v1.0.md`、`docs/02-GDD-v1.0.md`、`docs/02-GDD-levels-v1.0.json`、`docs/02-GDD-validator-v1.0.py`、`docs/03-UI-Spec.md`、`docs/04-TDD-v1.0.md`（新增）、`.gitignore`（新增）、`.DS_Store`（取消跟踪） |

**要点：**

- **新增 `docs/04-TDD-v1.0.md`**（技术设计文档，922 行）。
- **规则变更（核心，用户已拍板）：**
  - PRD **R-06b 取出**：已放置物品拖到网格外松手 = 取出到托盘，计入撤回栈
  - PRD **R-09 撤回语义**：回滚到操作前的完整快照，**朝向不重置**为 `cells` 初始朝向
  - PRD **4.8 / R-10**：新增「装不下」面积守恒**非阻断**提示
  - 明确 `touchCancel` / 系统中断**严禁**当作取出处理
- **关卡数据 V1.1**（`schemaVersion = "1.1"`，标准解全部重算）：

  | 关卡 | 改动 | big% |
  | --- | --- | ---: |
  | L03 | 4×4 满填充 → 5×4 + 1×5 长柄伞（禁旋仍无解，旋转教学保留） | 2.73% → 59.40% |
  | L05 | 高跟鞋 4 格 → 3 格 L 形 | 0.17% → 2.80% |
  | L09 | 卷发棒 1×2 → 1×3（34/36 → 35/36） | 4.77% → 0.50% |
  | L10 | 障碍 3 → 4 并配平香水盒 | 1.87% → 0.37% |

- `02-GDD-validator-v1.0.py` 支持 `schemaVersion 1.1`，新增禁旋可解断言与难度代理输出；校验 **10/10 PASS**。
- 新增 `.gitignore`，取消跟踪 `.DS_Store`。

---

### `f872055` · docs: 上传PRD/GDD

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-12 17:06 |
| 完整 hash | `f872055ee832f5746b6b4207d9d70f36332913a4` |
| 类型 | 文档（初始交付） |
| 文件 | `docs/01-PRD-v1.0.md`（+434）、`docs/02-GDD-v1.0.md`（+516）、`docs/02-GDD-levels-v1.0.json`（+2308）、`docs/02-GDD-validator-v1.0.py`（+163）、`docs/03-UI-Spec.md`（+165）、`.DS_Store` |

**要点：**

- 首次交付产品需求文档、游戏设计文档（含 10 关详细设计与标准解）、机器可读关卡 JSON、Python 独立校验器、UI/UX 设计规范初版。
- 规则基线：竖屏网格装箱、拖拽、90° 旋转、撤回、重置；无剧情 / 无倒计时 / 无生命值 / 无强制广告。

---

### `e214c41` · Initial commit

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-12 15:35 |
| 完整 hash | `e214c41de0412d018700e8bd438f2477291e3b9b` |
| 类型 | 初始化 |
| 文件 | `README.md`（+1） |

**要点：** 创建仓库与占位 README。

---

## 待追加（本次会话·尚未提交）

以下为**工作区已改动但还没 commit** 的内容，提交时请把本段替换成正式条目，并移到上方倒序列表。

| 文件 | 改动性质 |
| --- | --- |
| `CHANGELOG.md` | 新增：本文件 |
| `docs/01-PRD-v1.0.md` | 升 V1.2：配套文档版本对齐、触控热区口径统一、美术规模风险、引擎版本结论 |
| `docs/02-GDD-v1.0.md` | 升 V1.2：新增物品命名与形状一致性规范、itemType/spriteKey 规范、美术映射契约、G-24/G-25 |
| `docs/04-TDD-v1.0.md` | 升 V1.2：引擎版本结论更新（3.8.9 / COCOS 4）、架构评审结论 0.4、资源规格、口径修正 |
| `README.md` | 记录引擎版本锁定（T-01 落地）、指向 CHANGELOG |
