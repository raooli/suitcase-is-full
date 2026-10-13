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
