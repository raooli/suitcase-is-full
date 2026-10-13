# 行李箱装不下啦！

一款竖屏、轻量、治愈风格的空间收纳解谜微信小游戏。把形状各异的旅行用品拖进行李箱网格，允许旋转和反复调整，全部装入即通关。

## 当前进度

| 阶段 | 状态 |
| --- | --- |
| PRD / GDD / UI Spec / TDD | ✅ V1.2 已完成，见 `docs/` |
| 关卡数据（10 关，含标准解） | ✅ 已交付并通过可解性与难度校准 |
| `assets/core/`（纯 TS 游戏逻辑） | ✅ 骨架已就绪，163 个单测全通过 |
| **引擎版本锁定** | ✅ **Creator 3.8.8** 已装并锁定（`package.json` 的 `engineVersion`） |
| **美术风格锚点与资源规格** | ⬜ **待办**，未完成前不批量出图，见 TDD 第 17 节 |
| `assets/view/`（Cocos 渲染层） | ⬜ 待建（需先创建 Cocos 项目） |
| 微信小游戏构建与真机适配 | ⬜ 待做 |

**下一步：见 [`docs/05-实施计划-v1.0.md`](./docs/05-实施计划-v1.0.md)**（阶段划分 M0–M5、任务表、工作量级别、Go/No-Go 检查点、Cocos 与 VSCode 分工）。

## 文档导航

| 文档 | 回答什么 |
| --- | --- |
| `docs/01-PRD-v1.0.md` | 做什么、验收标准 AC01–AC18 |
| `docs/02-GDD-v1.0.md` + `02-GDD-levels-v1.0.json` | 玩法规则、10 关数据与标准解 |
| `docs/03-UI-Spec.md` | 视觉与交互规格 |
| `docs/04-TDD-v1.0.md` | **怎么做**：算法、接口、参数、微信适配 |
| `docs/05-实施计划-v1.0.md` | **什么时候做**：阶段、排期、检查点 |
| `docs/06-架构设计-v1.0.md` | **不能怎么改**：分层、依赖规则 7 条、目录格式、命名规范、ADR |

## 引擎版本锁定

| 项 | 值 |
| --- | --- |
| 引擎 | Cocos Creator **3.8.8**（LTS 收尾线），2026-10-13 核验 |
| 核验来源 | 官网下载页最新条目为 3.8.8；本机 Dashboard `~/.Cocos/profiles/products.json` → `latest_version: "3.8.8"` |
| 安装包 | `https://download.cocos.com/CocosCreator/v3.8.8/CocosCreator-v3.8.8-mac-121518.zip` |
| 安装状态 | ✅ **已装**：`/Applications/Cocos/Creator/3.8.8/CocosCreator.app`（`CFBundleShortVersionString = 3.8.8`） |
| 下载日期 | 2026-10-13 |
| 微信基础库 | 构建后手动改 `project.config.json` 的 `libVersion` 为 `widelyUsed` |
| 升级策略 | 锁定后 MVP 周期内不升级；仅阻断性 bug 才升，且须重跑全部单测 + 真机回归 |

> 选 3.8.x 而非 COCOS 4 的理由：COCOS 4 已于 2026-01 开源（MIT），但其**微信小游戏适配为「逐步发布」**，本项目唯一目标平台就是微信小游戏，不宜做首发验证者。详见 `docs/04-TDD-v1.0.md` 第 1.1 节。

## 美术资产

| 目录 | 内容 | 进包 |
| --- | --- | --- |
| `art/art-source/props/` | SVG 矢量源（可编辑，允许语义后缀） | ❌ |
| `art/previews/props/` | PNG 评审图 | ❌ |
| `assets/resources/sprites/props/` | **Cocos 实际用的透明 PNG，文件名严格 = itemType** | ✅ |

| 命令 | 作用 |
| --- | --- |
| `npm run check:art` | 覆盖率 / 缺失 / 尺寸朝向不符（当前 0/63 合格） |
| `npm run art:missing` | 导出缺失清单，可直接交美术 |
| `npm run check:arch` | 架构守卫：7 条依赖规则静态检查 |

状态与出图规格见 [`art/ASSET-STATUS.md`](./art/ASSET-STATUS.md)。

## 变更记录

每次 commit 更新了哪些代码与文件内容，见 [`CHANGELOG.md`](./CHANGELOG.md)。**每次提交后必须追加一条**，格式见该文件顶部。

## 目录结构

```
assets/core/              ★ 纯 TS 游戏逻辑，零 cc 依赖，100% 可单测
  config.ts               全部可调参数（触摸阈值、撤回上限、求解器上限…）
  geometry/shape.ts       归一化、旋转、包围盒、连通性
  geometry/coords.ts      网格坐标 ↔ 线性索引
  model/types.ts          全部数据模型
  model/level.ts          关卡配置校验
  rules/board.ts          占用索引
  rules/placement.ts      合法性判定、提交、取出、原位旋转
  session/GameSession.ts  关卡状态机（dispatch 是唯一写入口）
  session/History.ts      快照式撤回栈
  session/events.ts       core → view 事件类型
  solver/packer.ts        回溯求解器（bigint bitset + MRV）
  solver/deadend.ts       面积守恒快检
assets/data/levels.json   生产态关卡（由 tools 生成，不手写）
tools/                    关卡校验 / 难度报告 CLI
test/                     Vitest 单测（必须在 assets 之外）
docs/                     PRD / GDD / UI Spec / TDD
```

## 核心工程约定

1. **`core` 不知道 Cocos 存在。** 不 import `cc`，不碰触摸事件，不知道 `cellSize` 为何物。这是本项目最值钱的性质，别丢。
2. **`GameSession.dispatch()` 是唯一的状态写入口。** view 层永远不直接改 `LevelState`。
3. **坐标转换只有一处**：`view/BoardView.localToGrid()` / `gridToLocal()`。其他任何文件都不许出现 `cellSize` 的算术。
4. **状态一律不可变。** 撤回栈因此退化成「存旧对象」，几乎不可能写错。
5. **`test/` 和 `tools/` 必须在 `assets/` 之外**——Cocos 会编译 `assets/` 下所有 `.ts`，放进去会进包。

## 开发命令

```bash
npm install

npm run test               # 跑单测（含真实 10 关的回归测试）
npm run test:watch         # 监听模式
npm run typecheck          # 类型检查
npm run verify:levels      # 校验关卡数据并生成 assets/data/levels.json
npm run report:difficulty  # 难度代理指标报告
npm run check              # 上面三项串起来跑 —— 提交前跑这个
```

## 关卡数据工作流

关卡数据以 `docs/02-GDD-levels-v1.0.json` 为准（含 `solution` 等开发字段）。
生产态由脚本生成：

```bash
npm run verify:levels
```

它会做四件事：

1. 校验结构合法性（断裂形状、未归一化坐标、重复格、trayOrder 连续性…）
2. 校验**人类写的标准解**逐格合法
3. 用求解器**独立**判定可解性（两条路径互不依赖）
4. 断言第 3 关「必须旋转才可解」——数据改动把旋转教学改丢了会直接失败

然后剥离开发字段，输出 `assets/data/levels.json`。

**改了关卡 JSON 一定要跑这个；构建前必跑，失败即阻断。**

## 待决策项

见 `docs/04-TDD-v1.0.md` 第 14 节。D-01/D-02/D-03 已在 V1.1 关闭；剩余 D-04（非法 anchor 是否自动吸附）、D-05（重置是否可撤回）为交互细节，不阻塞开工。

## 已知的、不要踩的坑

- **`touchCancel` 必须处理。** 微信里来电话、下拉通知栏都会触发 CANCEL；不处理会出现"物品悬在半空"。而且它**绝不能被当成「取出」**——二者在事件类型上不同，混淆会导致来电后物品凭空回托盘。
- **手指抬升偏移只作用于渲染节点，不参与 anchor 计算。** 否则会出现"看到的对齐位置和实际落位差半格"。
- **蒙特卡洛脚本里 `rng` 只能建一次。** 在每次试验内部重建同种子的发生器，会让 N 次试验退化成同一次重复 N 遍，扫出来的 0%/100% 全是假数据。（本项目真踩过。）
