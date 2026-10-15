# 行李箱装不下啦！

一款竖屏、轻量、治愈风格的**空间收纳解谜微信小游戏**。把形状各异的旅行用品拖进行李箱网格，允许旋转和反复调整，全部装入即通关。

- **引擎**：Cocos Creator **3.8.8**（锁定，MVP 周期内不升级）
- **语言**：TypeScript（`core` 纯 TS 零引擎依赖 / `view` 唯一允许 `import 'cc'`）
- **设计分辨率**：390×844 竖屏 + Fit Width
- **测试**：Vitest **233 条**（11 个文件）
- **当前阶段**：**M2 进行中**（M0 ✅ / M1 ✅ / M2-1～M2-3 ✅ / M3 待做 / M4 美术 12.7%）

---

## 文档导航

> 规格与计划的**唯一真相源**在 [`docs/`](./docs)；代码的每次改动留痕在 [`CHANGELOG.md`](./CHANGELOG.md)。

| 文档 | 回答什么 |
| --- | --- |
| [`docs/01-PRD-v1.0.md`](./docs/01-PRD-v1.0.md) | 做什么、验收标准 AC01–AC18 |
| [`docs/02-GDD-v1.0.md`](./docs/02-GDD-v1.0.md) | 玩法规则、难度校准口径 |
| [`docs/02-GDD-levels-v1.0.json`](./docs/02-GDD-levels-v1.0.json) | 10 关源数据（含 `solution` 等开发字段，**不手写**） |
| [`docs/02-GDD-validator-v1.0.py`](./docs/02-GDD-validator-v1.0.py) | 独立的关卡数据校验脚本 |
| [`docs/03-UI-Spec.md`](./docs/03-UI-Spec.md) | 视觉与交互规格、色板、触屏设计 |
| [`docs/04-TDD-v1.0.md`](./docs/04-TDD-v1.0.md) | **怎么做**：算法、接口、参数、美术规格（第 17 节）、微信适配 |
| [`docs/05-实施计划-v1.0.md`](./docs/05-实施计划-v1.0.md) | **什么时候做**：M0–M5 阶段、任务表、Go/No-Go 检查点 |
| [`docs/06-架构设计-v1.0.md`](./docs/06-架构设计-v1.0.md) | **不能怎么改**：分层、依赖规则 R-A1～R-A10、ADR |
| [`docs/07-AI-Prompts.md`](./docs/07-AI-Prompts.md) | 美术生成提示词包（63 张物品） |
| [`docs/08-G1-拖拽手感检查报告-v1.0.md`](./docs/08-G1-拖拽手感检查报告-v1.0.md) | M1.D 出口检查点结论（V1.1 已改判 Go） |
| [`CHANGELOG.md`](./CHANGELOG.md) | 每个 commit 改了哪些文件、为什么 |
| [`art/ASSET-STATUS.md`](./art/ASSET-STATUS.md) | 美术资产覆盖率与返修清单（自动生成） |

---

## 快速开始

```bash
npm install

npm run check            # ★ 提交前必跑：typecheck(core) + typecheck(view) + 架构守卫 + 关卡校验 + 单测
npm run preview:game     # ★ 无头预览：CLI 构建 Game 场景 + 真实跑一遍，Console 有 error 即失败
```

### 全部命令

| 命令 | 作用 |
| --- | --- |
| `npm run check` | **提交门禁**：typecheck + typecheck:view + check:arch + verify:levels + test |
| `npm run test` / `test:watch` | Vitest 单测（233 条） |
| `npm run typecheck` | core / tools / test 的类型检查（[tsconfig.node.json](./tsconfig.node.json)） |
| `npm run typecheck:view` | **view 层**类型检查（[tsconfig.view.json](./tsconfig.view.json)） |
| `npm run check:arch` | 架构守卫 R-A1/3/4/6/9/10（[tools/check-arch.ts](./tools/check-arch.ts)） |
| `npm run verify:levels` | 校验关卡数据并生成 `assets/data/levels.json`（[tools/verify-levels.ts](./tools/verify-levels.ts)） |
| `npm run report:difficulty` | 难度代理指标报告（[tools/difficulty-report.ts](./tools/difficulty-report.ts)） |
| `npm run check:art` / `check:art:strict` / `art:missing` | 美术覆盖率 / 尺寸朝向 / 缺失清单（[tools/check-art.ts](./tools/check-art.ts)） |
| `npm run scene:build` | 由声明式规格生成 `.scene`（[tools/scene-build.mjs](./tools/scene-build.mjs)） |
| `npm run preview:game` | 无 GUI 预览取证（[tools/preview-check.mjs](./tools/preview-check.mjs)） |

---

## 在浏览器里试玩

`npm run preview:game` 是**无头取证**用的（跑完即退），不是试玩入口。交互试玩：

```bash
npm run preview:game                        # 先产出 build/web-mobile
cd build/web-mobile && python3 -m http.server 8123
# 浏览器打开 http://localhost:8123/
```

⚠️ 必须在 Chrome **设备模拟**里玩：`F12` → `Cmd+Shift+M` → 选竖屏机型（390×844）→ **开 touch 仿真**。
两个原因：① 游戏只监听 `TOUCH_*` 事件，桌面鼠标不触发，不开设备模拟**拖不动**；② 视口若为横屏/矮窗，Fit Width 会把 844 高的设计按窗口宽放大，底部托盘与工具栏会被裁出视野（**"预览只见棋盘"是这个原因，不是 bug**）。

无头取证的高级用法（截图 + 合成触摸）：

```bash
node tools/preview-check.mjs --scene Game --shot /tmp/a.png          # 构建 + 截图
node tools/preview-check.mjs --drag 62,658,138,297,/tmp/b.png       # 拖拽，第 5 段拍 ghost 中途态
node tools/preview-check.mjs --drag ... --tap 240,796               # 复合手势
node tools/preview-check.mjs --grep PreviewLayer                    # 只看匹配日志（纯子串，不认正则）
```

> 夹具视口固定 `390×844@2`，截图坐标与设计坐标 1:1。`--drag/--tap` 收 **CSS 页面坐标**；引擎 `getUILocation()` 是**世界坐标**（y 自下而上）。三套坐标别混。

---

## 目录结构

```
assets/core/              ★ 纯 TS 游戏逻辑，零 cc 依赖，100% 可单测
  index.ts                唯一对外出口（view/tools 只许从这里导）
  config.ts               全部可调参数（布局 / 阈值 / 色板 / 明度倍率）
  palette.ts              明度阶梯着色（TDD 17.4）
  geometry/
    shape.ts              归一化、旋转、包围盒、连通性
    coords.ts             网格坐标 ↔ 线性索引
    drag.ts               抓取偏移语义（抓哪格哪格跟手）
    thumbnail.ts          托盘缩略图等比适配 + 居中
    lift.ts               拖起上浮 / 放大 / 阴影（G1-1 手指遮挡补偿）
  model/                  数据模型 + 关卡配置校验
  rules/                  占用索引、放置合法性、原位旋转、提示建议
  session/
    GameSession.ts        状态机（dispatch 是唯一写入口）
    History.ts            快照式撤回栈（含朝向，R-08）
    events.ts             core → view 事件类型
  solver/                 回溯求解器（bigint bitset + MRV）、面积守恒快检
assets/view/              ★ 唯一允许 import 'cc' 的层
  GameController.ts       接线中枢：intent → dispatch → 刷新
  DragController.ts       触摸生命周期 → Intent（挂在整屏 SafeAreaRoot）
  PreviewLayer.ts         合法/非法/取出三态 ghost
  BoardView.ts            ★ 全项目唯一 RC↔像素转换点（R-A6）
  GridCellView / ItemView / ItemLayer
  TrayView / TraySlot
  ToolbarView             撤回 / 旋转 / 重置 / 提示
  ConfirmDialog / SuccessOverlay
  shake.ts                抖动 tween 范本（停 tween 必须同时归位节点）
assets/data/levels.json   生产态关卡（由 verify:levels 生成，不手写）
assets/scenes/            Boot / Game / Home（由 scene:build 生成）
assets/resources/sprites/props/   运行时贴图，文件名严格 = itemType
tools/                    关卡校验 / 难度报告 / 架构守卫 / 美术校验 / 场景生成 / 无头预览
test/                     Vitest 单测（必须在 assets 之外）
docs/                     规格与计划
art/                      SVG 源 + 评审图（不进包）
```

---

## 核心工程约定

1. **`core` 不知道 Cocos 存在。** 不 import `cc`、不碰触摸事件、不知道 `cellSize` 为何物。这是本项目最值钱的性质。
2. **`GameSession.dispatch()` 是唯一的状态写入口。** view 永远不直接改 `LevelState`。
3. **坐标转换只有一处**：[`assets/view/BoardView.ts`](./assets/view/BoardView.ts) 的 `localToGrid` / `gridToLocal` / `shapeMetrics`。其他文件出现 `cellSize` / `cellPx` 的算术即违规（R-A6）。
4. **状态一律不可变。** 撤回栈因此退化成「存旧对象」，几乎不可能写错。
5. **`test/` 与 `tools/` 必须在 `assets/` 之外**——Cocos 会编译 `assets/` 下所有 `.ts`，放进去会进包。
6. **参数只改 [`assets/core/config.ts`](./assets/core/config.ts)。** 禁止魔法数字散落。
7. **禁 `[...x]` 展开语法**（R-A10）。Cocos 的 loose 转译会把它降级成 `[x]`，症状是「单测全绿、引擎里数据错」，一律用 `Array.from`。

规则全表（R-A1～R-A10）见 [`docs/06-架构设计-v1.0.md`](./docs/06-架构设计-v1.0.md) §1.2/§1.3，由 `npm run check:arch` 静态执行。

### 交付纪律（每个任务）

1. `npm run check` 全绿；
2. `npm run preview:game` 无 Console 错误；
3. 双绿才提交；[`CHANGELOG.md`](./CHANGELOG.md) 追加一条（一 commit 一条，倒序，文件清单用 `git show --stat` 核对）。

> **Cocos 构建不做类型检查**，view 里的变量名/签名错误只有运行能抓——所以 `typecheck:view` 与预览都不能省。改完 `view/` 必须跑预览。

---

## 关卡数据工作流

源数据在 [`docs/02-GDD-levels-v1.0.json`](./docs/02-GDD-levels-v1.0.json)（含 `solution` 等开发字段），生产态由脚本生成：

```bash
npm run verify:levels     # 输出 assets/data/levels.json
```

它做四件事：① 校验结构合法性（断裂形状、未归一化坐标、重复格、`trayOrder` 连续性…）；② 校验**人类写的标准解**逐格合法；③ 用求解器**独立**判定可解性（两条路径互不依赖）；④ 断言第 3 关「必须旋转才可解」——数据改动把旋转教学改丢了会直接失败。然后剥离开发字段输出 `assets/data/levels.json`。

**改了关卡 JSON 一定要跑这个；构建前必跑，失败即阻断**（已编入 `npm run check`）。

---

## 美术资产

| 目录 | 内容 | 进包 |
| --- | --- | --- |
| [`art/art-source/props/`](./art/art-source/props) | SVG 矢量源（可编辑，允许语义后缀） | ❌ |
| [`art/previews/props/`](./art/previews/props) | PNG 评审图 | ❌ |
| [`assets/resources/sprites/props/`](./assets/resources/sprites/props) | **Cocos 实际使用的透明 PNG，文件名严格 = `itemType`** | ✅ |

**当前覆盖率 12.7%**（8/63 合格，1 张返修，54 张缺失）。M1～M3 全部用**程序化色块占位**，不阻塞；M4 接入真图时 `ItemView.setSpriteFrame()` 是桩，替换时结构不动。

硬约束：**四朝向不出图**（由 `Node.angle` 旋转实现）→ 63 张而非 252 张；尺寸、格式、透明底、命名、图集分组五项规格缺一项不算交付（TDD 第 17 节）；AI 生成图必须人工精修与合规确认。

---

## 已知风险与待决策项

- **G1-4 真机首验顺延 M3-1**：320px 折算 `cellPx` 93.5px ≥ 44 下限已过，但拖起上浮 24 / 放大 1.05 / 阴影 3 三个手感常量是按设计单位推的初值，**没过真实指腹与 DPR**。真机校准只改数值不改代码。
- **托盘横向滚动未排期**：L7–L10 有 7–9 件但只有 6 槽可见 → 1–3 件不可达。UI Spec 要求「数量多时横向滚动」，但 `docs/05` 的 M2 任务表里没有对应条目，**需在玩到 L7 之前补进计划**。
- **短屏纵向溢出**（M3-5）：320×568 在 Fit Width 下可用设计高 ≈692 < 844，三横带放不下；压缩阶梯见 [`docs/05-实施计划-v1.0.md`](./docs/05-实施计划-v1.0.md) M3-5 备注，最后才允许降 `CELL_PX_MIN`（需 ADR）。
- **待决策项**见 [`docs/04-TDD-v1.0.md`](./docs/04-TDD-v1.0.md) 第 14 节。D-01/02/03 已在 V1.1 关闭；剩余 D-04（非法 anchor 是否自动吸附）、D-05（重置是否可撤回）为交互细节，不阻塞。

---

## 已知的、不要踩的坑

这些都是本项目**真踩过**的，不是理论罗列。

- **`touchCancel` 必须处理，且绝不能当成「取出」。** 微信里来电话、下拉通知栏都会触发 CANCEL；二者在事件类型上不同，混淆会导致来电后物品凭空回托盘。
- **手势监听必须挂在覆盖整屏的节点**（本项目是 `SafeAreaRoot`）。Cocos 把整个触摸交给「按下时命中的最深节点」，松手点不在该节点内时引擎派发 **`TOUCH_CANCEL` 而非 `TOUCH_END`**——挂在 76×76 的槽位上，跨区域拖拽永远收不到「松手」。
- **同一节点只能挂一个 renderable 组件**（Graphics / Label / Sprite…）。给已有 Graphics 的节点再 `addComponent` 会被引擎**静默拒绝**（只打一条 warning，绘制内容一个不出现）。要画多组就复用同一 Graphics，或建子节点。
- **停位移 tween 必须同时归位节点。** `Tween.stopAllByTarget` 只停动画，节点会留在中断帧的偏移上（范本见 [`assets/view/shake.ts`](./assets/view/shake.ts)）。
- **Cocos 把触摸派发给所有命中节点**，「整屏节点挡住触摸」必须显式 `propagationStopped`——光有 390×844 的 `UITransform` 没用。
- **取整语义分场景，别「统一」**：抓取锚点用按下点算（与 `grabOffset` 同源）、board 命中用 `localToGrid`（floor）、move 锚点用 `snapToGrid`（round）。三处不同是有意的。
- **旋转只加 view 层临时入口（选中后再次点击），撤销不给。** 撤销是破坏性操作且 MVP 无 redo，规格位置在底部工具栏（M2-2 已落地）；双击/长按空白会与「取消高亮」抢同一次触摸。
- **蒙特卡洛脚本里 `rng` 只能建一次。** 每次试验内部重建同种子的发生器，会让 N 次试验退化成同一次重复 N 遍，扫出来的 0%/100% 全是假数据。
- **`.scene` 的真相源是 [`tools/scene-build.mjs`](./tools/scene-build.mjs)**，不是 GUI 编辑器。一旦在 GUI 里手改过场景就别再跑它（会覆盖）；改动脚本 `.meta` 后必须重跑生成脚本再开编辑器，否则编辑器按 `__type__` 找不到类 → `Script attached to '%s' is missing or invalid.`（4600）。

> 更完整的踩坑记录与取证手法见项目记忆 [`.workbuddy/memory/MEMORY.md`](./.workbuddy/memory/MEMORY.md)。