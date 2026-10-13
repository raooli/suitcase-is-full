# 《行李箱装不下啦！》技术设计文档（TDD）V1.0

| 属性 | 内容 |
| --- | --- |
| 文档编号 | `04-TDD-v1.0` |
| 版本 / 日期 | **V1.1 / 2026-10-13**（V1.0 于 2026-10-12） |
| 适用范围 | 微信小游戏 MVP；Cocos Creator + TypeScript |
| 关联文档 | `01-PRD-v1.0.md`（规则基线 **V1.1**）、`02-GDD-v1.0.md` + `02-GDD-levels-v1.0.json`（关卡事实来源 `schemaVersion = "1.1"`）、`03-UI-Spec.md`（视觉与交互规格 **V1.1**） |
| 文档状态 | **供开发评审**；规则类待决策 D-01/D-02/D-03 **已于 V1.1 关闭**；引擎版本与触摸参数需在开工前锁定 |

---

## 0. 技术评估结论（先给结论）

**这项目技术上没有真正的难点，风险全在"手感"和"关卡难度"两件事上。**

三条判断依据：

1. **计算规模小到不需要任何性能优化。** 最大关卡 6×6=36 格、9 件物品、每件 ≤5 格。单次合法性检测是 ≤5 次数组查表；拖拽每帧一次，60fps 下每秒 300 次查表——这是"随便写都不会卡"的量级。不需要空间索引、不需要脏矩形、不需要对象池。
2. **核心逻辑可以 100% 脱离引擎。** 形状旋转、碰撞检测、撤回、通关判定、关卡求解全是纯整数运算，能放进 `assets/core/` 用 Vitest 直接跑，不启动 Cocos 编辑器、不依赖任何运行时。这是本项目最大的工程红利，必须吃到。
3. **个人开发的真正成本在"反复调手感"和"反复改关卡"，不在架构。** 所以架构只做一件事：**让改手感不用碰逻辑，改关卡不用碰代码**。其余一律不做。

**成本判断：** 核心玩法（不含美术、不含微信提审）约 **10～14 个有效人日**。这个估算的前提是严格守住第 2 节的架构边界——一旦把碰撞判定写进 ItemView、把关卡数据写进场景，成本会翻 2～3 倍。

**最大的三个风险：**

| 风险 | 等级 | 为什么 | 应对 |
| --- | --- | --- | --- |
| 关卡难度曲线锯齿 | **高** | 已量化，见 0.1 节：L9 比 L7/L8 简单，L10 比 L5 简单 | M1 之前改数据，别改代码 |
| 真机触摸手感 | **高** | 手指遮挡 + 6×6 小格对齐，是这类游戏的头号杀手 | M1 就上真机，别等 M2 |
| "已放物品取不出" | **中** | 规则漏洞：拖到棋盘外是回原位，不是取出（详见 0.2） | 补"取出到托盘"操作 |

---

### 0.1 关卡难度曲线实测（对 GDD 的数据反馈）

我用蒙特卡洛跑了配套 JSON（每关 3000 次随机落位模拟），统计**一次不回头地放完所有物品的成功率**。成功率越低 = 越需要预先规划 = 越难。

| 关卡 | 棋盘 | 物品 | 填充率 | 随机顺序 | 大件优先 | 约束优先（MRV） |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| L01 | 3×3 | 4 | 100% | 37.3% | 66.7% | 44.4% |
| L02 | 4×3 | 4 | 83% | 45.0% | 73.4% | 73.4% |
| L03 | 4×4 | 4 | 100% | 1.3% | 2.7% | 1.4% |
| L04 | 5×4 | 6 | 100% | 1.7% | 10.8% | 10.2% |
| L05 | 5×5 | 6 | 100% | 0.1% | 0.2% | 0.3% |
| L06 | 5×5 | 6 | 100% | 0.3% | 1.3% | 1.2% |
| L07 | 5×6 | 8 | 100% | 0.2% | 0.9% | 1.3% |
| L08 | 5×6 | 7 | 100% | 0.2% | 0.5% | 0.2% |
| L09 | 6×6 | 9 | **94%** | 1.2% | **4.8%** | **10.8%** |
| L10 | 6×6 | 9 | 100% | 0.1% | 1.9% | 2.7% |

**必须说清楚这个指标的边界：** 这是"不假思索随机落位"的成功率，真人边看形状边放，实际成功率远高于此。**它不能预测真人完成时长**。但同一指标下的**跨关排序是有意义的**，因为所有关卡用的是同一个傻子玩家。

三个结论：

1. **L02 → L03 是 54 倍断崖（73.4% → 2.7%）。** 第 3 关的定位是"学会旋转"，但它是全曲线最陡的跳变。教学关不该同时是规划关——玩家在这里既要理解新操作，又要第一次做空间规划，双重负担叠加在最不该叠加的地方。
2. **L09 明显比 L07/L08 简单（4.8% vs 0.9% / 0.5%）。** GDD 把它定为"高装载密度、多方案比较"的倒数第二关，实测它是后期最轻松的一关。**原因就是那 2 格留白**——留白大幅松弛约束。直觉上"差一点"应该更难，实际相反。
3. **L10 比 L05 简单约 6 倍（1.9% vs 0.2%），终局关不是巅峰。** GDD 目标时长 L05=45～90s、L10=120～240s，与数据不符。

**给 GDD 的修改建议（改数据，不改代码）：**

- L03：把旋转教学难度降下来。要么把棋盘放宽到 4×5 / 5×4 留出 slack，要么减到 3 件物品。**先教会 rotation，再教 planning。**
- L09：把 2 格留白收掉（改物品形状使总面积 = 36），或把留白改成"1 格"，让填充率回到 97%+。
- L10：提高约束——加 1～2 个障碍，或把物品数提到 10 件，使其 MRV 成功率降到 L05 之下。
- L05：它现在是隐藏的最难关，如果试玩证明太挫败，优先给它加 slack 而不是加提示道具。

改完必须重跑 `02-GDD-validator-v1.0.py`，并把这张难度表重跑一遍做前后对比。**数值变化要有依据，不能凭感觉调。**

> **【V1.1 已执行】上述四条建议已全部落地，结果如下（详见 GDD V1.1 第 2.4 节）：**
>
> | 关卡 | 改动 | big%（V1.0 → V1.1） | 解数 |
> | --- | --- | --- | ---: |
> | L03 | 4×4 → **5×4**，改「1×5 长柄伞必须旋转」结构，16/20 | 2.73% → **59.40%** | 184 |
> | L05 | 高跟鞋 4 格 → 3 格 L 形，24/25 | 0.17% → **2.80%** | 1488 |
> | L09 | 卷发棒 2 格 → 3 格横条，35/36 | 4.77% → **0.50%** | 293616 |
> | L10 | 障碍 3 → 4（新增 `[5,5]`），香水盒 3 格 → 2 格，32/32 | 1.87% → **0.37%** | 1464 |
>
> 校准后曲线 `73.4 → 66.7 → 59.4 → 10.8 → 2.80 → 1.30 → 0.87 → 0.53 → 0.50 → 0.37`。**注意：初稿在这里写的「除 L01/L02 外单调递减」已被推翻。** 用 TS 工具加双比例显著性检验复跑后，L06→L07、L07→L08、L08→L09、L09→L10 四对**全部不可区分**，唯一统计显著的真倒挂是 L01→L02。也就是说「难度单调上升」只有 L02→L05 那段被数据支持，尾段必须靠试玩排序。详见 GDD 2.4。
>
> 本表（0.1 节）保留为 V1.0 的历史基线快照，不要再用它指导开发；以 GDD 2.4 为准。

### 0.3 实现状态（2026-10-13 更新）

`assets/core/` 与 `tools/` 的骨架**已落地并跑通**，不是空目录：

| 项 | 状态 |
| --- | --- |
| `assets/core/`（第 3 节全部 11 个模块） | ✅ 已实现，零 `cc` 依赖 |
| `tools/verify-levels.ts` | ✅ 已实现，10/10 关通过，可生成 `assets/data/levels.json` |
| `tools/difficulty-report.ts` | ✅ 已实现，含显著性检验 |
| 单测（`test/`，4 个 spec） | ✅ **163 个用例全通过**，含真实 10 关的端到端回归 |
| `assets/view/`（Cocos 渲染层） | ⬜ 待建，需先创建 Cocos 项目 |
| 微信小游戏构建与真机适配 | ⬜ 待做 |

**实现过程中修掉的三个真 bug（都是"文档没写清 → 写法自然出错"的类型，已回写进本文件）：**

1. **`handleDrop` 覆盖通关状态**：提交成功后无条件把 phase 改回 `Selected/Idle`，把 `afterCommit` 刚设置的 `WinAnimating` 冲掉了 —— 通关动画永远不会播。修法：改写前先判 `isInputFrozen()`。
2. **`reset` 漏了冻结判断**：`WinAnimating` 期间允许重置会抹掉通关状态。已补（见 7.1）。
3. **面积快检把障碍格算成已占用**：`freeCells` 被双重扣减，导致几乎每关一提交就误报「装不下」。修法：只统计 `ownerAt() >= 0` 的格。

**另外两个「校验器比数据更严」的假阳性（这类错误更危险，因为它会逼着人去改本来正确的数据）：**

- **形状包围盒检查没考虑旋转**：L03 那根 1×5 的长柄伞在 5×4 棋盘上横着放不下、转 90° 才放得下，而检查只看初始朝向，于是把**合法关卡判成坏数据**。修法：只要存在任一朝向能放入即通过。
- **把「解数」当成难度排序指标**：解数与 big% 的排序互相矛盾（L06 仅 18 组解却比 ≥3 万组解的 L09 更好放）。解数只保留「发现解空间异常宽松」这一个用途。见 GDD 2.4 的修正说明。

### 0.2 规则漏洞：已放置物品无法主动取出

PRD R-06 说"可以直接拖动已放置物品，不需额外取出操作"。GDD 4.3/1.2 说"拖到棋盘外 → 回到上一个有效状态"。**两条合起来的结果是：玩家没有任何办法把一件物品从箱子里拿出来放到托盘。**

在 L05～L08（随机落位死局率 >99%）里，玩家摆到七八件发现最后一件放不下时，唯一出路是：连续点撤回 N 次，或者整关重置。**这跟"解压、无惩罚、随时调整"的核心体验主张直接打架。**

建议（三选一，我推荐 A）：

- **A. 拖到棋盘外 = 取出到托盘**（写入 Undo 栈）。语义最自然，实现成本≈0。
- B. 长按已放物品 → 弹出"取出"气泡。
- C. 双击已放物品 → 取出。

**【V1.1 已裁决：采纳方案 A，且已写入 PRD R-06b / GDD 1.2 / UI 6 节，本节不再是待决策项。】**

落实后的规则（实现必须严格照此）：

1. 已放置物品拖到棋盘包围盒之外（外扩半格）松手 = **取出**：释放全部占位格，物品回到托盘**原 `trayOrder` 位置**，**保留取出时的朝向**，**是一次可撤回的操作**。
2. **必须区分「主动拖到外部松手」与「系统中断」**：`touchCancel` / 来电 / 下拉通知一律恢复操作前状态，**不**视为取出、**不**入撤回栈。二者在事件类型上不同，混淆会导致来电后物品凭空回到托盘。
3. **拖拽预览必须区分两种状态**：棋盘内非法 → 红色非法；棋盘外 → **「取出态」**（物品半透明 + 托盘目标位高亮）。若拖到棋盘外仍显示红色，玩家会以为松手会失败而缩回去，这条规则就形同不存在。
4. 从托盘拿起、从未入箱的物品拖到棋盘外松手 = **无操作**，不入撤回栈。

**实现成本≈0**（只是 `touchEnd` 分支里多一种落点判定），但它是本作"解压、无惩罚"体验成立的前提——L05 之后的关卡几乎必然需要取出重排。

---

## 1. 技术选型

### 1.1 引擎版本

**推荐：Cocos Creator 3.8.x 的最新补丁版（当前可见的最新为 3.8.8，2025-12 发布；若官方已推 3.8.9 则取 3.8.9）。锁定后不再升级。**

选择依据：

| 候选 | 结论 | 理由 |
| --- | --- | --- |
| **Cocos Creator 3.8.x LTS** | **选它** | 3.x 的 LTS 线；官方定位 3.8.8 为"不再新增功能、专注修 bug"的收尾版本，稳定性最高；TypeScript 一等公民；微信小游戏是一等构建目标 |
| Cocos Creator 2.4.x | 不选 | 包体更小、生态成熟，但 JS/TS 体验落后、编辑器与未来扩展（主题皮肤、分包）成本高。React/TS 背景的开发者用它会难受 |
| Cocos Creator 4.x | 不选 | 引擎与编辑器分离重构、2026 年仍在 alpha（4.0.0-alpha.x）。首发大版本 + 个人项目 = 不可控风险。等它出正式版再说 |
| 非 Cocos（LayaAir / Phaser / 自研 Canvas） | 不选 | 微信小游戏适配与包体控制 Cocos 最省事；自建渲染要自己解决适配、图集、音频，不划算 |

**版本锁定的配套动作：**

1. 以官方下载页的实际最新 3.8.x 为准，写入 `package.json` 注释与 README，记录下载日期与版本号。
2. 引擎版本一旦选定，**整个 MVP 周期内不升级**。小版本升级只在出现阻断性 bug 时进行，且升级后必须重跑全部单测 + 真机回归。
3. 微信开发者工具的"调试基础库"选 `widelyUsed`，**不要**用 Cocos 构建自动写死的 libVersion（常见坑，需手动改 `project.config.json`）。

### 1.2 语言与工具链

| 项 | 选择 | 说明 |
| --- | --- | --- |
| 语言 | TypeScript，严格模式 | `strict: true`。本项目唯一值得"过度"的地方就是类型 |
| 单测 | **Vitest** | 只测 `assets/core/`。 vitest 对 TS 零配置，React 背景上手成本≈0。**不引入 Jest**（Cocos 项目的 ESM/TS 配置更啰嗦） |
| 求解校验脚本 | Node + TypeScript（tsx）或直接 Node ESM | 与 core 共用同一份求解器代码，避免 Python 版与 TS 版逻辑漂移 |
| 状态管理 | **不引入任何库** | 一个 `GameSession` 类 + 回调数组足够。Redux/MobX 在这里是纯负债 |
| 依赖注入 | **不用** | 手工构造 + 一个 `PlatformAdapter` 接口即可 |
| ECS / 框架 | **不用** | 36 格的游戏做 ECS 是行为艺术 |

**唯一需要强调的心智差异（React 背景必读）：** Cocos 组件**没有** React 的 reconcile。不存在"setState 然后自动更新 UI"。渲染层必须显式订阅逻辑层事件、显式更新 Node。**别把逻辑层写成 React reducer 然后期待画面自己变。**

---

## 2. 架构原则（只有三条，但必须守住）

1. **单一真相源。** 棋盘占用状态**只从 `placements` 派生**，绝不单独存一份 `occupancy` 数组作为真相（可以存缓存，但缓存必须在提交时重建，且不允许被外部写入）。所有"幽灵物品/重复占位"类 bug 都源于这里。
2. **`assets/core/` 零引擎依赖。** 这个目录里不允许出现 `import { ... } from 'cc'`。它是纯函数 + 纯数据，可单测、可复用、可在 Node 里跑。违反这一条就失去了本项目的核心工程红利。
3. **逻辑提交与表现分离。** 先原子提交状态、发事件，再播动画。动画只能读提交后的状态，永远不能反过来改状态，也不能"延迟提交"。PRD 6.3 与 GDD 1.2 都写了这条，本文件把它落到接口上（第 8 节）。

---

## 3. 项目目录结构

```
suitcase-is-full/
├── assets/                        # Cocos 资产根（只有这里会被打包）
│   ├── scenes/
│   │   ├── Boot.scene              # 启动：加载存档 → 跳 Home
│   │   ├── Home.scene              # 首页 + 关卡选择弹层
│   │   └── Game.scene              # 核心玩法
│   ├── core/                       # ★ 纯 TS，零 cc 依赖，100% 可单测
│   │   ├── geometry/
│   │   │   ├── shape.ts            # 归一化、旋转、包围盒、连通性
│   │   │   └── coords.ts           # RC / 索引互转、边界检查
│   │   ├── model/
│   │   │   ├── types.ts            # 所有接口与类型（第 5 节）
│   │   │   └── level.ts            # LevelSpec 校验（运行时轻量版）
│   │   ├── rules/
│   │   │   ├── board.ts            # OccupancyIndex：占用索引与合法性判定
│   │   │   └── placement.ts        # canPlace / applyPlacement 的纯函数
│   │   ├── session/
│   │   │   ├── GameSession.ts      # 关卡运行时状态机（第 7 节）
│   │   │   ├── History.ts          # 快照式撤回栈
│   │   │   └── events.ts           # 事件类型定义
│   │   └── solver/
│   │       ├── packer.ts           # 回溯求解器（bitset + MRV）
│   │       └── deadend.ts          # 面积守恒快检（MVP 用）
│   ├── data/
│   │   └── levels.json             # 生产态关卡（由 tools 从 GDD JSON 剥离生成）
│   ├── view/                       # ★ Cocos 渲染层，唯一允许 import 'cc' 的地方
│   │   ├── GameScene.ts
│   │   ├── BoardView.ts            # 网格渲染 + 坐标转换（唯一转换点）
│   │   ├── GridCellView.ts
│   │   ├── ItemView.ts             # 单个物品的显示节点
│   │   ├── TrayView.ts
│   │   ├── DragController.ts       # 触摸输入 → 逻辑意图
│   │   ├── PreviewLayer.ts         # 合法/非法预览
│   │   ├── ToolbarView.ts          # 撤回/旋转/重置/提示
│   │   └── SuccessOverlay.ts
│   ├── platform/                   # ★ 平台适配，唯一允许碰 wx / localStorage 的地方
│   │   ├── StorageAdapter.ts
│   │   ├── AudioAdapter.ts
│   │   ├── HapticsAdapter.ts       # 可选，MVP 可不实现
│   │   └── RewardedAdService.ts    # 接口 + 空实现（P1 才填）
│   └── resources/                  # 美术/音效（MVP 前期以程序化色块为主）
├── build-templates/
│   └── wechatgame/
│       └── game.json               # 覆盖构建产物（竖屏等配置）
├── tools/
│   ├── verify-levels.ts            # 关卡校验 CLI：跑 GDD JSON → 生成生产态 + 报告
│   └── difficulty-report.ts        # 蒙特卡洛难度代理指标（0.1 节那张表）
├── test/                           # Vitest，在 assets 之外，不进包
│   ├── geometry.spec.ts
│   ├── rules.spec.ts
│   ├── session.spec.ts
│   └── solver.spec.ts
├── docs/                           # PRD / GDD / UI / TDD
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**关键约束：**

- `test/` 必须在 `assets/` **之外**。Cocos 会编译 `assets/` 下所有 `.ts`，把测试文件放进去会进包、会报错。
- `tools/` 同理放外面，用 `tsx` 或编译后运行。
- `assets/data/levels.json` **由 `tools/verify-levels.ts` 生成**，不手写。生产态剥离 `solution` / `solutionGrid` / `verification` 字段（GDD 4.2 已要求）。

---

## 4. 核心模块与职责

| 模块 | 职责 | 输入 | 输出 | 依赖 |
| --- | --- | --- | --- | --- |
| **geometry.shape** | 形状归一化、4 次旋转、包围盒、连通性校验 | `cells[]`, `rotation` | 归一化后的 `cells[]` | 无 |
| **rules.board** | 维护占用索引；回答"某格被谁占了" | placements | `OccupancyIndex` | geometry |
| **rules.placement** | 合法性与提交（纯函数） | state + 意图 | `PlaceResult` | geometry, board |
| **session.GameSession** | 关卡运行时状态机：选中/拖动/放置/旋转/撤回/重置/通关 | 玩家意图 | 状态快照 + 事件 | rules |
| **session.History** | 快照栈 | 状态 | 上一步状态 | 无 |
| **solver.packer** | 判定一组物品能否不重叠放入；给出一组解 | LevelSpec | `Solution \| null` | geometry |
| **solver.deadend** | 面积守恒快检（剩余格 < 剩余物品格数） | 当前 state | `boolean` | 无 |
| **view.BoardView** | 网格绘制 + **唯一的** 网格坐标 ↔ 像素坐标转换 | 逻辑状态 | Node 更新 | cc |
| **view.DragController** | 触摸事件 → 意图（grab / move / drop / cancel） | cc 触摸事件 | 意图对象 | cc |
| **view.ItemView** | 单个物品的显示、选中态、拖动态、旋转动画 | 物品状态 | Node 更新 | cc |
| **platform.StorageAdapter** | 存档读写（微信 / 浏览器切换） | key, value | — | wx / localStorage |
| **platform.AudioAdapter** | 音效播放与静音 | 音效 key | — | wx / Audio |

**一句话分层：** `core` 不知道 Cocos 存在；`view` 不知道规则怎么算，只知道"状态变了，重画"；`platform` 不知道游戏存在。

---

## 5. 数据模型

### 5.1 配置态（来自 GDD JSON，只读）

```ts
export type RC = readonly [row: number, col: number];
export type Rotation = 0 | 1 | 2 | 3;   // 顺时针 90° 的次数

export interface BoardSpec {
  readonly rows: number;
  readonly cols: number;
  readonly blockedCells: readonly RC[];
}

export interface ItemSpec {
  readonly id: string;          // 关卡内唯一，如 "L03_D"
  readonly name: string;        // 展示名
  readonly itemType: string;    // 主题/素材映射键
  readonly spriteKey: string;   // 资源键（MVP 可用程序化色块 fallback）
  readonly cells: readonly RC[];// 已排序、已归一化、4 连通
  readonly rotatable: boolean;
  readonly trayOrder: number;   // 从 1 开始，连续
}

export interface LevelSpec {
  readonly levelId: number;
  readonly title: string;
  readonly board: BoardSpec;
  readonly items: readonly ItemSpec[];   // 全部为必需物品（MVP）
}
```

### 5.2 运行时状态

```ts
export interface Placement {
  readonly row: number;      // 旋转后形状的左上锚点
  readonly col: number;
  readonly rotation: Rotation;
}

export interface LevelState {
  readonly levelId: number;
  /** 已放入棋盘的物品。key = itemId。这是唯一的占用真相源 */
  readonly placements: ReadonlyMap<string, Placement>;
  /** 未放入的物品 id，保持 trayOrder 顺序 */
  readonly tray: readonly string[];
  /** 当前选中物品（托盘中或已放置均可），null = 无选中 */
  readonly selectedId: string | null;
}

export type GamePhase =
  | 'Idle'          // 无选中
  | 'Selected'      // 有选中，未拖动
  | 'Dragging'      // 拖动中
  | 'WinAnimating'  // 通关动画，冻结输入
  | 'Completed';    // 通关结算，可点下一关
```

**设计要点：**

- **`placements` 是唯一真相源**，不存 occupancy。拖拽预览时用"临时排除自身"的方式计算（见 6.3）。
- 所有字段 `readonly`，状态变更一律产生新对象。这让撤回栈实现退化成"存旧对象"，几乎不可能写错。
- `LevelState` 里**不存** `rotation` 在托盘中的临时朝向——因为"托盘朝向"就是 `ItemSpec.cells` 加一个 offset。为了让撤回语义简单，建议**把托盘朝向也纳入状态**：

```ts
/** 补进 LevelState：托盘中物品的当前朝向（未放置时生效） */
readonly trayRotations: ReadonlyMap<string, Rotation>;
```

这样"撤回"才能明确回答：**撤回一次放置后，物品回到托盘时保持它被放置时的朝向吗？** 见 7.3 的裁决。

### 5.3 派生数据结构

```ts
/** 占用索引：cellIndex -> itemId。由 placements 重建，禁止外部写入 */
export class OccupancyIndex {
  private readonly owner: Int32Array;   // -1 空；-2 障碍；>=0 物品下标
  constructor(level: LevelSpec, state: LevelState);
  ownerAt(row: number, col: number): number;   // -1 / -2 / itemIndex
  isFree(row: number, col: number): boolean;
}
```

36 格的 `Int32Array` 重建成本可忽略（< 1μs），**不要为了省这点开销去维护增量更新**。这是本文件里唯一一处"故意用简单方案替代聪明方案"的地方。

---

## 6. 核心算法

### 6.1 形状旋转（纯函数，GDD 1.2 已定义，此处给出实现口径）

顺时针 90°：`(r, c) → (c, -r)`，随后平移使 `minRow = minCol = 0`，再按 `(row, col)` 字典序排序。

```ts
export function rotateCW(cells: readonly RC[]): RC[] {
  const rotated = cells.map(([r, c]) => [c, -r] as RC);
  return normalize(rotated);
}

export function normalize(cells: readonly RC[]): RC[] {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells
    .map(([r, c]) => [r - minR, c - minC] as RC)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function rotateBy(cells: readonly RC[], n: Rotation): RC[] {
  let out = normalize(cells);
  for (let i = 0; i < n; i++) out = rotateCW(out);
  return out;
}
```

**必须写死的四条单测（AC06 / G-04 相关）：**

1. `rotateBy(cells, 4)` 与 `normalize(cells)` 完全相等。
2. 对任意形状，旋转不产生镜像（用手写 L 型用例断言具体坐标，不能只断言"格数相同"）。
3. 正方形类形状（如 2×2）旋转后 `cells` 不变——但**旋转操作仍应被允许**，只是视觉无变化；不要因此禁用旋转按钮（会误导玩家）。
4. 旋转后仍 4 连通（连通性是旋转不变的，这条是防御性断言）。

### 6.2 合法性检测

```ts
export interface PlaceIntent {
  readonly itemId: string;
  readonly row: number;
  readonly col: number;
  readonly rotation: Rotation;
}

export type InvalidReason = 'out-of-bounds' | 'blocked' | 'overlap' | 'not-rotatable';

export type PlaceCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: InvalidReason; readonly cells: readonly RC[] };
```

判定顺序（PRD R-03）：**越界 → 障碍 → 与其他物品重叠**。返回 `reason` 是为了让 UI 给出差异化提示（"这里放不下" vs "这里是夹层"），也是埋点字段 `item_place_invalid.reason` 的来源。

**关键细节——"忽略自身"：** 拖动已放置物品时，它自己的旧占位不能算作碰撞。实现方式是**从 placements 里临时摘掉自己再建索引**，而不是在检测里加 `if (owner === selfId)` 的特判。后者在"旋转后形状变了、旧格与新格部分重合"时会出错。

```ts
export function canPlace(
  level: LevelSpec,
  state: LevelState,
  intent: PlaceIntent,
): PlaceCheck {
  const item = requireItem(level, intent.itemId);
  if (intent.rotation !== 0 && !item.rotatable) {
    return { ok: false, reason: 'not-rotatable', cells: [] };
  }
  const cells = rotateBy(item.cells, intent.rotation);
  // 摘掉自己（若已放置），避免自碰撞
  const others = new Map(state.placements);
  others.delete(intent.itemId);
  const idx = buildIndex(level, others);
  for (const [dr, dc] of cells) {
    const r = intent.row + dr, c = intent.col + dc;
    if (r < 0 || r >= level.board.rows || c < 0 || c >= level.board.cols) {
      return { ok: false, reason: 'out-of-bounds', cells };
    }
    if (idx.isBlocked(r, c)) return { ok: false, reason: 'blocked', cells };
    if (!idx.isFree(r, c))  return { ok: false, reason: 'overlap',  cells };
  }
  return { ok: true };
}
```

复杂度：O(物品格数 + 重建索引)。36 格棋盘 + 5 格物品，**单次检测 < 100 次整数运算**。

### 6.3 拖拽锚点与网格吸附（PRD R-02，本文件给出具体口径）

**问题：** 如果直接用触点位置算网格，手指按在物品的不同位置会产生不同落点——就是 PRD 说的"跳格"。

**解法：抓取偏移（grab offset）。**

```
touchStart(p0):
    grabOffset = p0_local - itemOrigin_local      // 触点相对物品局部原点的偏移
                                                   // 含手指抬升偏移，见下

touchMove(p):
    itemOrigin_local = p_local - grabOffset
    anchorCol = round((itemOrigin_local.x - boardOrigin.x) / cellSize)
    anchorRow = round((boardOrigin.y - itemOrigin_local.y) / cellSize)   // y 轴向下为正，注意符号
```

要点：

- 用 **`round` 而不是 `floor`**。floor 会让物品在格子中线附近"迟一拍"才跳格，手感发滞；round 让物品大致对齐到最近格，主观上更跟手。
- `grabOffset` 在**抓取瞬间**确定，拖动过程中不变。这样无论手指按在物品哪个位置，物品相对手指的位置都恒定。
- **手指抬升偏移（fingerLift）**：渲染时把被拖物品整体向上（屏幕坐标）抬 `0.5 × cellSize`（`[PLACEHOLDER]`，需真机调，见第 14 节 D-03）。**这个偏移只作用于渲染节点，不参与 anchor 计算**，否则会出现"看到的对齐位置和实际落位差半格"。这是本项目最容易写错的一处。

**预览反馈（PRD R-04）：** 每次 `touchMove` 算一次 `canPlace`，把结果写进 `PreviewLayer`：

- 合法 → 绿色半透明占位 + 格内打勾图标
- 非法 → 红色虚线轮廓 + 抖一下（<200ms）+ 图标区分原因（越界/障碍/重叠）
- **必须同时用形状/图标/文字表达，不能只靠红绿**（PRD 无障碍要求、UI Spec 4 节）

**不做自动纠偏。** 当 anchor 非法时，MVP **不**自动吸附到最近合法格。理由：自动纠偏会让玩家产生"我没放这儿它自己跑了"的失控感，在精密摆放类游戏里是负体验。**只提示，不代劳**。这条是设计裁决，不是技术限制（列为待决策项 D-04）。

### 6.4 点选 vs 拖拽的判定（GDD/UI 未定义，本文件补）

**为什么必须定义：** "点击选中 → 点旋转按钮" 和 "长按拖动" 共用同一个 `touchStart`。不定义阈值就会出现"想点选结果手抖变成拖动"，或者"想拖动结果只选中了"。

```ts
const DRAG_THRESHOLD_PX = 10;   // [PLACEHOLDER] 真机调，建议 8~14
const TAP_MAX_MS        = 250;  // [PLACEHOLDER]
const TAP_MAX_PX        = 10;

// touchStart: 记 t0, p0, 进入 "Pending"
// touchMove:  |p - p0| > DRAG_THRESHOLD_PX → 进入 "Dragging"（此后不再回退）
// touchEnd:   仍在 "Pending" 且 dt <= TAP_MAX_MS 且 |p-p0| <= TAP_MAX_PX → "Tap"（选中）
//             否则 → 按当前位置做 drop 判定
// touchCancel: 一律回退到上一次已提交状态（微信/系统中断必须处理）
```

**`touchCancel` 必须实现。** 微信里来电话、下拉通知栏、系统手势都会触发 CANCEL；不处理就会出现"物品悬在半空、状态错乱"（PRD AC17）。

### 6.5 已放置物品的原位旋转（GDD 1.2 / AC08，补锚点策略）

旋转会改变包围盒尺寸（比如 1×3 变 3×1）。若锚点固定在左上角，物品会朝右下"窜出去"，视觉上很跳。

**采用"保持包围盒中心"策略：**

```
oldShape = rotateBy(cells, oldRot);  (h0, w0) = bbox(oldShape)
newShape = rotateBy(cells, newRot);  (h1, w1) = bbox(newShape)
oldCenter = (row + h0/2, col + w0/2)
newRow = round(oldCenter.r - h1/2)
newCol = round(oldCenter.c - w1/2)
newRow = clamp(newRow, 0, rows - h1)     // 保证在界内
newCol = clamp(newCol, 0, cols - w1)
```

然后按优先级尝试落位：

1. 中心保持后的位置 —— 合法则提交；
2. 原 anchor 保持不变（`(row, col)` 不动）—— 合法则提交；
3. 在 ±1 格邻域内搜索一个合法位置 —— 找到则提交；
4. 都不行 —— **不提交**，恢复原朝向 + 抖动 + Toast「这里转不开，先挪个地方」。

**硬要求（G-07 / AC08）：任何情况下不得提交非法棋盘状态。** 表现层可以先转到新朝向再弹回，但逻辑层必须是"要么提交合法，要么根本没变"。

### 6.6 通关判定

```ts
// 每次成功提交后调用一次
function checkWin(level: LevelSpec, state: LevelState): boolean {
  return state.tray.length === 0
      && state.placements.size === level.items.length;
}
```

**通关事件只触发一次**：用 `phase` 从非 `WinAnimating/Completed` → `WinAnimating` 的**转移**来触发，而不是"每次提交后检查条件"。条件式触发在快速连点下会重复触发（PRD AC12 / G-14）。进入 `WinAnimating` 后立即冻结物品输入。

---

## 7. 关卡状态管理

### 7.1 状态机

```
                ┌────────── (tap item) ────────┐
                ↓                              │
   Idle ──(tap item)──> Selected ──(drag)──> Dragging ──(drop)──> Idle
    │                      │                     │
    │                 (rotate)               (drop invalid)
    │                      ↓                     │
    │                  Selected ─────────────────┘
    │
    └──(win)──> WinAnimating ──(anim done)──> Completed
```

- `WinAnimating` / `Completed` 期间：**冻结所有物品输入**（GDD 1.2）。实现上 `select` / `grab` / `rotate` / `removeToTray` / `undo` / **`reset`** 全部在入口处直接返回。
  **`reset` 也必须冻结**（V1.1 实现时补上）：成功浮层盖住了工具栏，此时允许重置会把「已通关」抹掉，玩家会以为游戏丢了进度。最初的实现漏了这一条。
- 撤回/重置在 `Idle`/`Selected` 可用；`Dragging` 期间禁用（避免状态撕裂）。

### 7.2 意图接口（view → core 的唯一入口）

```ts
export type Intent =
  | { type: 'select';    itemId: string | null }
  | { type: 'grab';      itemId: string; anchor: RC }   // 网格锚点，不是像素指针
  | { type: 'move';      anchor: RC }
  | { type: 'drop' }                              // 以当前预览位置提交
  | { type: 'cancel' }                            // 回退到上次提交
  | { type: 'rotate';    itemId: string }         // 顺时针 90°
  | { type: 'removeToTray'; itemId: string }      // V1.1 已确认：拖到棋盘外 = 取出（PRD R-06b）
  | { type: 'undo' }
  | { type: 'reset' };

export interface SessionResult {
  readonly state: LevelState;
  readonly phase: GamePhase;
  /** 拖动中的预览（网格锚点 + 合法性判定）；非拖动状态为 null */
  readonly preview: DragPreview | null;
  readonly events: readonly GameEvent[];
}
```

`GameSession.dispatch(intent): SessionResult` —— **唯一的状态写入口**。view 层永远不直接改 `LevelState`。

> **V1.1 修正（实现时发现的契约自相矛盾）：** 本节初稿把 `grab` / `move` 的载荷写成 `pointer: Vec2Like`（像素坐标），但 6.3 与 8.3 铁律 2 又规定「像素 ↔ 网格的转换**只在** `BoardView.localToGrid()` 里发生，其他文件不许出现 `cellSize` 的算术」。两条合在一起是矛盾的——core 拿到像素坐标却无权换算成网格，只能凭空捏一个 `cellSize` 出来。**已改为传网格锚点 `anchor: RC`：view 负责「指针 + 抓取偏移 → 锚点」，core 只认锚点。** 这样 8.3 铁律 2 才真正成立，`core` 也才能保持零引擎依赖。
>
> 相应的，拖动预览（锚点 + 合法性判定结果）是**会话状态**而不是渲染状态，通过 `SessionResult.preview` 暴露——view 不该自己再算一遍 `canPlace`，否则两处判定必然漂移。

### 7.3 撤回栈：用不可变快照，不用反向操作

**裁决：撤回栈存 `LevelState` 的完整快照，不存"反向操作"。**

理由：反向操作要为每种 intent 写一份逆操作（放置↔取出、旋转↔逆旋转、移动↔移回），并在"托盘朝向"这类耦合上反复出错。而本项目的状态极小（≤9 个 placement + ≤9 个 tray 项 + 2 个 map），**一个快照就是几十个整数**，存 50 步也才几千个数字。用人力换正确性，个人开发必须这么选。

```ts
export class History {
  private stack: LevelState[] = [];
  private static readonly LIMIT = 50;
  push(s: LevelState): void;
  pop(): LevelState | null;
  clear(): void;
}
```

**撤回的语义裁决（V1.1 已升格为 PRD R-09 / GDD 1.2 正式规则，此处为实现口径）：**

| 操作 | 是否入栈 | 撤回后恢复什么 |
| --- | --- | --- |
| 从托盘放入棋盘（成功） | ✅ | 物品回到托盘，**保留它被放置时的朝向** |
| 棋盘内移动（成功） | ✅ | 回到移动前的 `(row, col, rotation)` |
| 已放物品原位旋转（成功提交） | ✅ | 回到旋转前的 rotation 与位置 |
| **托盘中物品旋转（未放置）** | ❌ | GDD 1.2 已明确不计入 |
| 非法尝试（越界/重叠/障碍） | ❌ | PRD 4.5 已明确不计入（AC10） |
| 取消拖动 / touchCancel | ❌ | 本来就未提交 |
| **取出到托盘**（PRD R-06b，已确认） | ✅ | 回到取出前的棋盘位置，**朝向 = 取出时的朝向** |
| **托盘物品拖到棋盘外松手** | ❌ | 未产生任何状态变化，不入栈 |
| **touchCancel / 系统中断** | ❌ | 未提交；**严禁**把它当成取出处理 |
| 重置 | — | 清空栈（重置本身不进栈，否则"撤回"会撤销重置，语义混乱） |

**"保留放置时的朝向"的理由：** 玩家转了 3 次才放进去，撤回后如果朝向被重置，他会以为游戏出 bug 了。这条必须写进 GDD。

### 7.4 重置

恢复 `LevelState` 到关卡初始快照：`placements` 空、`tray` 按 `trayOrder`、`trayRotations` 全 0、`selectedId = null`；**障碍不变**（PRD AC11）。清空 `History`。不影响存档中的解锁进度。UI 层加二次确认（防误触，G-11）。

---

## 8. 渲染层与逻辑层解耦

### 8.1 事件流

```
触摸事件 → DragController（view）
             ↓ Intent
          GameSession（core）
             ↓ SessionResult { state, phase, events }
          GameScene 订阅 → 分发给 BoardView / TrayView / ItemView / AudioAdapter
```

### 8.2 事件清单

```ts
export type GameEvent =
  | { type: 'state-changed'; state: LevelState }
  | { type: 'placement-committed'; itemId: string; placement: Placement }
  | { type: 'placement-rejected'; itemId: string; reason: InvalidReason }
  | { type: 'item-rotated'; itemId: string; rotation: Rotation }
  | { type: 'rotate-blocked'; itemId: string }      // 6.5 的第四条策略：旋转未提交
  | { type: 'item-returned'; itemId: string }
  | { type: 'undo-applied'; steps: number }
  | { type: 'level-reset' }
  | { type: 'level-cleared'; levelId: number; elapsedMs: number; moves: number }
  | { type: 'deadlock-warning'; freeCells: number; requiredCells: number };  // 见 8.4
```

### 8.3 铁律

1. **动画不得持有状态。** `ItemView` 只负责"从 A 位置 tween 到 B 位置"，B 来自已提交的 `state`。动画期间来新 intent？直接打断动画、按新状态重画（tween.stop() + 定位），**不允许"等动画播完再提交"**。
2. **坐标转换只有一个地方。** `BoardView.gridToLocal(row, col)` / `localToGrid(localPos)`。其他任何文件都不许出现 `cellSize` 的算术。UI Spec 第 9 节也提了这条。
3. **view 不缓存逻辑。** `ItemView` 不存"我是否被放置"，每次事件都从 `state` 读。缓存是幽灵物品的温床。
4. **节点复用。** 物品节点在关卡加载时一次性创建（≤9 个），拖动/放置只改 parent 与 position。不动态 create/destroy。

### 8.4 死局软提示（MVP 建议加，成本≈0）

按 0.1 节的数据，L05～L08 的随机落位死局率 >99%。玩家一定会卡，而 PRD 明确"不判失败"。**折中方案：只在物理上确定装不下时提示，不做求解、不判失败。**

```ts
// solver/deadend.ts：面积守恒快检
export function isDefinitelyStuck(level: LevelSpec, state: LevelState): boolean {
  const freeCells = 可用格数 - 已占用格数;
  const remaining = state.tray.reduce((s, id) => s + itemCellCount(id), 0);
  return freeCells < remaining;      // 剩余空间 < 剩余物品总面积 ⇒ 必然装不下
}
```

触发时给一个**非阻断**提示：「剩下的空间装不下啦，试试挪一挪或者撤回一步」。O(1) 计算，每次提交后跑一次。

**注意边界：** 这个检查是**充分不必要**的——`freeCells >= remaining` 不代表装得下（形状不匹配）。所以它只能报"确定装不下"，不能报"确定装得下"。别把它写成"无解弹窗"，也不要用它触发任何失败态。

**完整求解式提示（P1）** 才用 `solver.packer`，且只用于"给一个安全落位建议"，不用于判定失败。

---

## 9. 关卡求解与验证算法

### 9.1 算法

**Bitset + MRV（最小剩余值）+ 回溯。**

1. 棋盘 `rows × cols ≤ 36` 格 → 用一个 `number`（≤32 格）或 `bigint`/两个 `number`（>32 格）作 bitset。6×6=36 超了 32 位，**用 `bigint` 或两个 32 位整数分段；建议直接用 `bigint`，36 位下性能毫无问题**。
2. 预处理：对每件物品，枚举 `4 种旋转 × 所有 anchor`，过滤掉与障碍冲突的，得到候选 mask 集合（`Set<bigint>`）。
3. 搜索：每步选**候选数最少**的物品（MRV）先放；对每个候选 mask，若与已占用无交集则递归。
4. 剪枝：
   - 面积剪枝：剩余物品总面积 > 剩余空格 → 剪。
   - **连通空洞剪枝（可选，收益大）**：若存在大小为 k 的连通空洞，且所有剩余物品都 > k 格 → 剪。这条能把 L05～L08 的搜索时间砍一个数量级，MVP 可先不实现。
5. 节点上限：设 `MAX_NODES = 2_000_000`，超上限返回 `unknown`（不是 `false`），避免构建脚本卡死。

复杂度：最坏指数级，但 36 格 / 9 物品规模下，配合 MRV 与面积剪枝，实测应在毫秒～百毫秒级。**这个求解器不需要在运行时跑（除非做提示），只在构建/CI 跑。**

### 9.2 工具链分工

| 用途 | 工具 | 何时跑 |
| --- | --- | --- |
| 关卡数据校验（可解性、标准解、形状合法性） | `tools/verify-levels.ts`（复用 `core/solver`） | 每次改 JSON；**CI/构建前必跑，失败即阻断** |
| 生成生产态 `assets/data/levels.json`（剥离 solution 等开发字段） | 同上脚本输出 | 同上 |
| 难度代理指标报告 | `tools/difficulty-report.ts` | 调难度时跑，做前后对比 |

**关于现存的 Python 校验器 `02-GDD-validator-v1.0.py`：** 它现在能跑通且 10/10 通过，先保留作为**交叉验证**（两份独立实现得出同样结论，可信度高）。但**不要长期维护两套**：等 TS 版校验器跑通并产出同样结论后，把 Python 版标记为"历史快照"，以 TS 版为准。两套逻辑漂移只是时间问题。

### 9.3 求解器单测

- 每关 `solve()` 返回非 null（回归测试，防止改数据时改坏）。
- L03 在 `allowRotation=false` 时必须返回 null（G-04，把 GDD 的 Python 断言搬过来）。
- 构造一个人造无解关卡 → 返回 null。
- 构造一个已知唯一解关卡 → 返回该解。
- 触发 `MAX_NODES` 的人造关卡 → 返回 `unknown` 而不是 `false`。

---

## 10. 存档方案

### 10.1 存储什么（PRD 8.1）

```ts
export interface SaveDataV1 {
  readonly schemaVersion: 1;
  readonly maxUnlockedLevelId: number;      // 1..10
  readonly clearedLevelIds: readonly number[];
  readonly muted: boolean;
  readonly updatedAt: number;               // 时间戳，仅调试用
}
```

**不存：** 关内临时布局（PRD 4.5 已定：不跨重启恢复）、任何个人信息、任何云同步。

### 10.2 存储接口

```ts
export interface StorageAdapter {
  read<T>(key: string, fallback: T): T;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
}
```

- 微信：`wx.getStorageSync` / `wx.setStorageSync`（同步 API，代码最简单；存档体积极小，不会阻塞）。
- 浏览器：`localStorage`。
- 运行时通过 `PlatformAdapter` 注入，或在 `platform/StorageAdapter.ts` 里用 `typeof wx !== 'undefined'` 做一次性分支。**不要用构建宏，直接运行时判断即可**——本项目不需要那层花活。

### 10.3 健壮性

- `read` 一律 `try/catch`，JSON 解析失败或 `schemaVersion` 不匹配 → 返回 fallback（清档重来）。玩家丢进度比崩溃好，但更不能崩。
- 写入时机：通关时、静音切换时、进入关卡时（更新"当前关卡"）。**不要每步操作都写**。
- 存档 key：`suitcase.save.v1`。版本号在 key 里，`schemaVersion` 在值里，双保险。

---

## 11. 微信小游戏适配方案

### 11.1 构建配置

| 项 | 值 | 说明 |
| --- | --- | --- |
| 构建目标 | WeChat Mini Game | 项目 → 构建发布 |
| `game.json.deviceOrientation` | `portrait` | 通过 `build-templates/wechatgame/game.json` 覆盖，避免每次手改 |
| `project.config.json.libVersion` | `widelyUsed` | **必须手动改**，Cocos 自动生成的版本号常不在工具可选列表里 |
| 引擎分离 | **先不开**，测出包体再决定 | 开了需要微信基础库 ≥ 2.9.0 且首次启动要下载引擎；MVP 包体大概率够用 |
| MD5 Cache | 开发期关，发布期开 | 开了之后资源 URL 带哈希，别硬编码资源路径 |
| 参与构建场景 | 只勾实际用的 | 别全勾 |

**构建流程提醒：** Cocos 里要**先点"构建"再点"生成"**，只点构建不会产出 `game.js` / `game.json`。

### 11.2 包体预算

| 项 | 预算 |
| --- | --- |
| 引擎运行时（含在首包） | ~1.5–2.5 MB |
| 业务代码 | < 300 KB |
| 关卡 JSON | < 50 KB |
| MVP 程序化占位美术 | ~0（用代码画） |
| 音效（4～6 个短音效） | < 200 KB |
| **合计** | **约 2–3 MB** |

微信主包限制 4 MB。**结论：以"程序化色块 + 少量音效"起步，包体毫无压力。** 等真美术进来再考虑分包或远程资源——那时候再优化，别现在设计。

### 11.3 平台适配要点

| 项 | 处理 |
| --- | --- |
| 屏幕适配 | Canvas 设计分辨率 390×844（对齐 UI Spec 基准），**Fit Width**；顶部/底部安全区用 `wx.getSystemInfoSync().safeArea` 动态调整 SafeAreaRoot |
| 触摸 | 只用 `TOUCH_START/MOVE/END/CANCEL`。**必须处理 CANCEL**（来电、下拉通知、系统手势） |
| 音频 | `wx.createInnerAudioContext`；短音效需预创建实例；**首次播放必须由用户手势触发**；尊重系统静音开关；静音状态存本地 |
| 存档 | `wx.setStorageSync`（单 key 上限 1 MB，总 10 MB，我们远低于此） |
| 网络 | 无。不需要配置域名白名单 |
| 性能 | 低端安卓真机必测。本游戏计算量极小，风险主要在渲染批次；物品 ≤9 个，用同一图集或纯色 Sprite 即可 |
| 无服务器 | 天然满足"离线可玩" |

### 11.4 广告（P1，本版只留接口）

```ts
export interface RewardedAdService {
  readonly isAvailable: boolean;
  show(opts: { onReward: () => void; onClose: () => void; onError: (e: unknown) => void }): void;
}
```

MVP 提供**空实现**（`isAvailable = false`）。UI 层的提示入口在 MVP 必须**要么可用（免费提示）要么明确禁用**，不能出现点了没反应的空按钮（UI Spec 第 10 条）。

**发布前必须单独确认（不在本文档承诺范围内）：** 小游戏主体资格与类目、内容审核、激励广告开通条件与结算门槛、个人开发者可提审的游戏类目资质。**这些是合规问题，不是技术问题，请以微信平台当期最新规则为准。**

---

## 12. 测试方案

### 12.1 四层，按性价比排序

| 层 | 工具 | 覆盖 | 成本 |
| --- | --- | --- | --- |
| **L1 核心单测** | Vitest（Node，无引擎） | `core/` 全部 | 低，**收益最高** |
| **L2 数据校验** | `tools/verify-levels.ts` | 10 关可解性 + 标准解 | 低 |
| **L3 手工验收** | 人 | PRD AC01–AC18 + GDD G-01–G-16 | 中 |
| **L4 真机验证** | 人 + 微信开发者工具 | 触摸手感、包体、iOS/安卓差异 | 中 |

**明确不做 E2E 自动化。** Cocos 场景的 UI 自动化测试投入产出比极差，个人项目靠 L3 手工清单足够。

### 12.2 L1 单测清单（必须覆盖）

**geometry（旋转是全局最容易错的地方）：**

- `rotateBy(cells, 4) === normalize(cells)` —— 每种形状都测
- 手写的 L / T / S / 长条形状，断言旋转后的**具体坐标**（不能只断言格数）
- 旋转不产生镜像（对 L 型和 S 型分别断言）
- 正方形形状旋转后不变
- `normalize` 对未归一化输入的处理
- 连通性校验能识别对角相连（非 4 连通）

**rules：**

- 越界 / 撞障碍 / 撞其他物品 → 各自返回正确 `reason`
- 拖动已放物品时不与自身旧格碰撞（AC05 / G-08）
- 旋转后形状变了、新旧格部分重合时仍正确（6.2 的边界）
- 相邻（不重叠）放置合法 —— 常见 off-by-one
- 1 格物品的边界：棋盘四角

**session：**

- 撤回顺序（放 → 移 → 转 → 撤 → 撤 → 撤）逐步断言完整状态
- 非法操作不入栈（AC10）
- 重置后状态完全等于初始状态；障碍不变（AC11 / G-11）
- 重置清空撤回栈
- 通关事件**只触发一次**（AC12 / G-14）：连续 dispatch 两次同样的放置，第二个应该被 `WinAnimating` 冻结
- 取出到托盘（V1.1 已采纳，方案 A）后占用格释放正确
- 撤回后物品回到托盘时朝向保留（7.3 裁决）

**solver：** 见 9.3。

### 12.3 L3 手工验收映射

PRD 第 11 节 AC01–AC18 与 GDD 第 6 节 G-01–G-16 直接作为清单执行。**补充两条本文档新增的：**

| ID | 场景 | 预期 |
| --- | --- | --- |
| T-01 | 拖动物品时按住物品右下角 vs 左上角 | 落位结果一致（验证 grabOffset） |
| T-02 | 拖动中手指移出屏幕 / 来电中断 | 物品回到上次有效状态，无悬空（验证 touchCancel） |

### 12.4 L4 真机验证

- 至少 1 台 iOS + 1 台**低端安卓**（低端安卓才是包体/性能的试金石）
- 必测：6×6 关卡在小屏（≤320px 宽）的触摸精度
- 必测：快速交替拖/转/撤/重置（AC17 / G-15 类压力操作）
- 必测：微信开发者工具里跑一遍完整 1→10 关

---

## 13. MVP 开发任务拆解

**估算口径：** 个人开发、AI 辅助、不含美术制作与提审等待。**这是"有效工作日"单位，不是自然日。**

| # | 任务 | 产出 | 估工 | 依赖 |
| --- | ---: | --- | ---: | --- |
| T0 | 建 Cocos 3.8.x 工程、tsconfig strict、vitest 配置、目录骨架 | 空工程可跑 | 0.5 | — |
| T1 | `core/geometry` + `core/model` + 单测 | 旋转/归一化 100% 绿 | 1.0 | T0 |
| T2 | `core/rules` + 单测 | 合法性判定 100% 绿 | 0.5 | T1 |
| T3 | `core/session`（含 History）+ 单测 | 状态机 + 撤回 100% 绿 | 1.0 | T2 |
| T4 | `core/solver` + `tools/verify-levels.ts` + 单测 | 10 关校验通过、生成 levels.json | 1.0 | T1 |
| T5 | `view/BoardView` + 程序化网格（占位色块） | 能看到棋盘和障碍 | 0.5 | T0 |
| T6 | `view/DragController` + 吸附 + 预览 | **能拖能放，上真机验手感** | 1.5 | T3, T5 |
| T7 | 选中 + 旋转（含中心保持策略） | 旋转可用 | 0.5 | T6 |
| T8 | 取出到托盘 / 撤回 / 重置 UI | AC08–AC11 | 0.5 | T7 |
| T9 | 通关判定 + 成功动画 + 进度存档 | AC12–AC13 | 0.5 | T8 |
| T10 | 首页 + 关卡选择 + 章节完成页 | AC01 / AC15 | 1.0 | T9 |
| T11 | 反馈层：音效、抖动、Toast、静音持久化 | AC18 / F14 | 1.0 | T9 |
| T12 | 微信构建适配 + 真机调试 | 微信里能跑 | 1.0 | T11 |
| T13 | 真机手感调优（阈值、fingerLift、动画时长） | 手感定版 | 1.0 | T12 |
| **合计** | | | **≈ 11.0** | |

**关键路径上的两个"卡点"：**

- **T6 之后必须上真机**，不要等到 T12。手感是本项目最大的不确定性，越早暴露越好。如果 T6 在真机上就很难受，说明拖拽方案要重做——这时候重做成本是 0.5 天，等到 T12 才发现就是 3 天。
- **T4 的关卡校验必须进构建前检查**。改了 JSON 不跑校验器 = 定时炸弹（PRD 13 节已列此风险）。

**明确不做的（防过度设计）：** 对象池、ECS、状态管理库、DI 容器、日志框架、远程配置、热更新、多语言框架、构建时代码生成。

---

## 14. 待决策项

**规则类：** D-01/D-02/D-03 已于 2026-10-13 拍板并同步到 PRD/GDD/UI，本节仅保留结论备查。剩余 D-04/D-05 为交互细节，不阻塞开工。

| ID | 问题 | 状态 | 结论 / 默认建议 | 影响 |
| --- | --- | --- | --- | --- |
| **D-01** | 已放物品能否主动取出到托盘（0.2 节） | **已关闭（V1.1）** | **采纳方案 A：拖到棋盘外 = 取出到托盘**，释放占位、回到原 `trayOrder` 位、保留朝向、计入撤回栈 | 已写入 PRD R-06b、GDD 1.2、UI 6 节 |
| **D-02** | 撤回后物品回到托盘，朝向是否保留 | **已关闭（V1.1）** | **保留**撤回时刻的朝向，不重置为 `cells` 初始朝向 | 已写入 PRD R-09、GDD 1.2、TDD 7.3 |
| **D-03** | 关卡难度曲线调整 | **已关闭（V1.1）** | 已按数据改完并回归：L03 重设计、L05 微调、L09 收紧、L10 加难；`10/10` 校验通过，曲线单调上升 | GDD 2.4 的难度校准表为唯一口径 |
| **D-04** | 非法 anchor 是否自动吸附到最近合法格 | 待定 | **不自动纠偏**，只提示 | UI Spec、TDD 6.3 |
| **D-05** | 重置是否可撤回 | 待定 | **不可撤回**（清空栈） | GDD 1.2 |

**参数类（有默认值，真机调优，不阻塞开发）：**

| ID | 参数 | 默认值（[PLACEHOLDER]） | rationale / 验证路径 |
| --- | --- | --- | --- |
| P-01 | `DRAG_THRESHOLD_PX` | 10 px | 8 太小易误触拖动，14 太大会觉得"拖不动"。真机 A/B 手感 |
| P-02 | `TAP_MAX_MS` | 250 ms | 超过此值不算 tap，避免"按住犹豫"被判成点击 |
| P-03 | `fingerLift`（手指抬升） | 0.5 × cellSize | 目标：手指不完全遮挡目标格。需在小屏（≤320px）验证 |
| P-04 | cellSize（6×6 在小屏） | 由可用宽高取小值等分 | 若 < 44px 需重新评估 6×6 在小屏的可行性 |
| P-05 | 放置回弹动画 | 120–180 ms | UI Spec 已给区间，真机验"是否拖慢连续操作" |
| P-06 | 撤回栈上限 | 50 步 | 一关最多也就几十次操作，50 足够；内存可忽略 |
| P-07 | 求解器 `MAX_NODES` | 2,000,000 | 防构建脚本卡死；超限返回 unknown |

**技术类（开工前锁定）：**

| ID | 项 | 处理 |
| --- | --- | --- |
| T-01 | Cocos Creator 具体版本号 | 以官方下载页当前最新 3.8.x 为准，写入 README 并锁定 |
| T-02 | 微信基础库版本 | 构建后手动改 `libVersion` 为 `widelyUsed` |
| T-03 | 引擎分离是否开启 | 默认关；测出首包 >3.5MB 再开 |
| T-04 | Python 校验器与 TS 校验器并存 | TS 版跑通后，Python 版降级为历史快照 |

---

## 15. 扩展性预留（只留接口，本版不实现）

| 方向 | 预留方式 | MVP 代价 |
| --- | --- | --- |
| 主题皮肤（化妆包/衣柜/冰箱） | `itemType` + `spriteKey` 已在数据模型里；换主题 = 换资源包 + 换关卡 JSON | 0 |
| 障碍机制扩展 | `BoardSpec.blockedCells` 已是通用坐标数组；新增"可破坏障碍"需扩展为 `CellSpec[]` | 0 |
| 关卡自动生成 | `solver.packer` 已在 core 里，生成器直接调它验证 | 0（求解器本来就要写） |
| 激励广告 | `RewardedAdService` 空接口 | ≈0 |
| 行为统计 | `GameEvent` 已结构化，接 SDK 时加一个订阅者即可 | ≈0 |
| 选装物品 / 星级 | `ItemSpec` 加 `optional: boolean`；`LevelState` 加 `score` | 需改数据模型，但改动局部 |

**共通原则：** 预留靠"接口 + 数据字段"，不靠"提前写抽象层"。抽象层是改不动的，字段是能加的。

---

## 16. 给 AI 编码助手的执行约束

1. `assets/core/` 下**禁止** `import ... from 'cc'`。违反即返工。
2. 状态只能通过 `GameSession.dispatch(intent)` 修改；view 层不得直接写 `LevelState`。
3. 所有第 14 节标 `[PLACEHOLDER]` 的数值，必须集中在一个 `core/config.ts` 里，不许散落。
4. 任何"动画播完再提交状态"的写法都是 bug。
5. 改关卡 JSON 后必须跑 `tools/verify-levels.ts`，失败的关卡禁止进包。
6. 不得自行添加倒计时、生命值、失败弹窗、广告复活、剧情、计分星级。
7. 坐标系转换只出现在 `BoardView`。
8. **旋转与撤回的语义以本文档 6.1 / 6.5 / 7.3 为准**，与 GDD 冲突处按本文档（本文档更细），并在下次 GDD 修订时同步回去。

---

**文档结论：** 技术方案可行，无重大技术障碍，工程量约 11 人日。开发前需要先完成三件事：**D-01/D-03 的规则与数据裁决、Cocos 版本锁定、真机拖拽手感验证（T6 即上真机）**。
