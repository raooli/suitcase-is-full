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

### `fc4c204` · chore(ci): 补交分支保护声明式配置 + 应用脚本，并注册 npm 脚本
- 文件：`.github/branch-protection.json`（新增，三档预设 safe/strict/ci，分支 main=safe、release/*=strict、hotfix/*=safe）、`.github/BRANCH-PROTECTION.md`（新增，前提说明+用法）、`tools/protect-branch.mjs`（新增，dry-run 默认、--apply 才写、token 仅读环境变量）、`package.json`（新增 `protect:branch` 脚本）。
- 要点：上一会话已造分支保护工具但漏注册 npm 脚本且未提交；本轮补齐并整体提交。规则进版本库可 code review、可复现。**仅声明入仓，不生效**——真正生效需 `GITHUB_TOKEN`（private 仓库需 admin）跑 `npm run protect:branch -- --apply`。

### `e4ae76d` · feat(view): M3-5 短屏适配——纵向压缩阶梯接入运行时布局

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-22 14:08 |
| 文件 | `assets/core/config.ts`（+109/−55 区间）、`assets/view/layout.ts`（新增 81 行）、`assets/view/layout.ts.meta`（新增）、`assets/view/BoardView.ts`、`assets/view/BootController.ts`、`assets/view/GameController.ts`、`assets/view/SuitcaseLid.ts`、`assets/view/ToolbarView.ts`、`assets/view/TrayView.ts`、`test/layout.spec.ts`（新增 138 行 14 例）、`tools/scene-build.mjs`（仅注释） |
| 背景 | `core/config.ts` 早有 `UI_LAYOUT_BANDS` 压缩阶梯（L0–L4），但 `BoardView.availableArea()` 仍固定读 L0 带高、三横带中心是编译期常量 → 短屏（320×568 可见设计高≈692<844）会把格边长压到 P-04 的 44px 下限之下（G1-D3 / M3-5 风险）。本次把阶梯真正接入运行时。 |
| 要点 | ① **纯函数层**：新增 `maxBoardOf` / `selectLayoutBand` / `resolveLayout` 与 `ResolvedLayout` 类型；`selectLayoutBand` 逐档检查「设计格边长 + 320px 屏折算值」是否都 ≥ 该档 `cellMin`，前档够用不动后档，全不满足回退末档 L4；`resolveLayout` 用 `effectiveHeight = min(可见高, 844)` 推导三横带中心（`boardBandCenterY=(tray+toolbar−header)/2`、`toolbarBandCenterY=−(half−toolbar/2)`、`trayBandCenterY=−(half−toolbar−tray/2)`、`topBandCenterY=half−header/2`）；**删除**写死的 `UI_BOARD_BAND_CENTER_Y` / `UI_TRAY_BAND_CENTER_Y` / `UI_TOOLBAR_BAND_CENTER_Y`；新增 `UI_MAX_BOARD`（全 10 关最大 6×6）。② **运行时单例** `view/layout.ts`：`detectVisibleDesignHeight()` 优先 `view.getVisibleSizeInDesignResolution()`、退路用画布尺寸比值 `屏高×390/屏宽`、再兜底 844；模块加载即 `resolveLayout(844, UI_MAX_BOARD)` 预选型（L0 兜底），`initLayout(maxBoard)` 幂等重选型。③ **消费方接入 `getLayout()`**：`BoardView`（`availableArea` / `boardBandCenterY` / 压缩阶梯告警反推可见高 + 体检表打印活动档）、`TrayView`（尺寸+位置+`contentWidth` 用 `band.margin`）、`ToolbarView`（尺寸+位置+背景填充随带高）、`GameController`（工具栏节点、返回按钮用 `topBandCenterY` + `band.margin`、`onLoad` 早期 `initLayout(maxBoardOf(bundleLevels()))`）、`SuitcaseLid`（合盖落点用 `boardBandCenterY`）；`BootController.onLoad` 启动即 `initLayout()`，保证早于任意视图 `onLoad`。④ `tools/scene-build.mjs` 仅改占位注释（`BOARD_BAND_CENTER_Y` 降级为场景初始占位，运行期由 `resolveLayout` 覆盖）。 |
| 复验 | `npm run typecheck:view` 0 错；`npm run check:arch` 无架构违规；`npm run test` **354/354**（含新增 14 例布局单测）；`npm run preview:game`（390×844）零 Console 错误、活动布局 **L0 基准**、L1 棋盘仍 114px（无回归）；短屏 `--viewport 320x568@2` 预览零 Console 错误、活动布局 **L1 托盘 160→128**（可见设计高 692.25），截图三带（棋盘/托盘/工具栏）完整无溢出。 |

### `27af802` · feat(view): M3 微信音频后端——发声抽成平台隔离（R-A4/TDD 11.3）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-22 10:31 |
| 文件 | `assets/view/AudioAdapter.ts`（重构，−64 行）、`assets/view/platform.meta`、`assets/view/platform/SoundBackend.ts`（接口）、`assets/view/platform/index.ts`（选择器）、`assets/view/platform/web/SoundBackend.ts`、`assets/view/platform/wechat/SoundBackend.ts` 及各自 `.meta` |
| 背景 | M4-5b 后 `AudioAdapter` 直接调 Cocos `AudioSource`（Web 端 WebAudio 后端），微信端无 `wx` 分支 → 静默；M2-9 即定「M3 按 TDD 11.3 换 wx API、R-A4 收进 platform 目录」 |
| 要点 | ① 新增 `assets/view/platform/`：发声后端按 R-A4 平台隔离——`web/SoundBackend`（保留 AudioSource 行为、常驻 `SfxPlayer` 节点，复用 M4-5b 已验证逻辑）；`wechat/SoundBackend` 用 TDD 11.3 指定的 `wx.createInnerAudioContext`，吃 `AudioClip.nativeUrl`，每次播放新建实例、`onEnded`/`onError` 即 `destroy`；② `index.ts` 按 `cc/env` 的 `WECHAT` **编译期常量**路由，未命中分支死代码消除（Web 包不含 `wx` 引用）；③ `AudioAdapter` 只留调度/静音闸/缓存/跨场景，把发声动作委托给后端；`play`/`setMuted`/`stopAll`/`preload`/`isMuted` 与 5 个调用点**零改动**（M2-9 约定的 SfxKey 命名空间不变） |
| 复验 | `npm run check:arch` 无架构违规；`npm run typecheck:view` 0 错；`npm run test` 340/340；`preview:game` Web 包零 Console 错误（音频 `已载入` 日志正常）；无头 wechatgame 增量重建后 `build/wechatgame` 资源无回归（68 PNG+4 WAV、2.94MB），`createInnerAudioContext` 与 `nativeUrl` 已进微信包 JS（WECHAT=true 路由生效） |

### `ad3eb48` · fix(assets): 替换 L9/L10 四张残缺图为完整版并同步重导入 meta

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-21 16:14 |
| 文件 | `assets/resources/sprites/props/prop_09_D.png`（重写）、`prop_09_D.png.meta`、`prop_09_I.png`（重写）、`prop_09_I.png.meta`、`prop_10_C.png`（重写）、`prop_10_C.png.meta`、`prop_10_G.png`（重写）、`prop_10_G.png.meta` |
| 背景 | 此前 `c254e9e` 的 re-cut 把四张异形件的内容裁短（trim 高度从 168/171/160/122 缩到 143/136/117/149），玩家看到的是残缺图；用户已重新生成完整且按 footprint 绘制的真透明图，要求换成完整版并重新生成 meta |
| 要点 | ① 四张源图（1536×1024 真透明、按 3×2 足迹绘制）整画布等比缩放（预乘 alpha 双线性，避免暗边）到 288×192，不裁 bbox、不居中位移；② 按 levels.json 的 cells 对非占格区做 alpha 清零（足迹遮罩），保证剪影 = cells 足迹；③ 真彩 RGBA（colorType 6）编码，规避索引色透明槽位黑边问题；④ 触发 Cocos 重导入，meta 的 trim/width/height/offset/vertices/uv 由引擎按新图 alpha 包围盒重新计算（09_D 因 L 形占满包围盒 → 全画布无 trim） |
| 复验 | `npm run check:art` 63/63 全过（透明底 + 剪影契约，四张无非占格侵入）；`preview:game` 无头构建重导入成功、引擎启动且零 Console 错误 |
| 影响 | 推翻 `c254e9e` 的「四张已修复」结论：那版是把内容裁短而非还原完整，本次才是完整版；美术资产仍 63/63，包体稳定 |

### `6b5176a` · feat(view): M4-5b 把 M4-4 资源真接入游戏（UI 插画 + 音效）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-19 17:19 |
| 文件 | `assets/view/uiAssets.ts`（新）、`assets/view/uiAssets.ts.meta`（新，Cocos 资源 uuid）、`assets/view/AudioAdapter.ts`、`assets/view/BoardView.ts`、`assets/view/SuitcaseLid.ts`、`assets/view/HomeController.ts`、`assets/view/GameController.ts`、`assets/core/config.ts`、`docs/03-UI-Spec.md` |
| 背景 | M4-4 交付了 3 张 UI 插画与 4 个音效 WAV，但当时是死资源（AudioAdapter 仍走 WebAudio 合成、UI 图未被引用）；本次把两者真正接入渲染与播放，玩家看得到、听得到。不动 core 玩法逻辑 |
| 要点 | ① 新增 uiAssets.ts：模块级缓存 + 在飞去重 + 负结果缓存 + 晚到帧判 isValid 的 UI 图加载器（仿 propAssets 写法）；② AudioAdapter 由振荡器合成改为 AudioSource 播 WAV，音量取 SFX_MASTER_GAIN(0.22)、有效峰值≈0.154 与合成版一致，常驻音源节点跨场景不被硬切；③ BoardView 接 suitcase-open 底板（先 SIMPLE/CUSTOM/trim=false 再贴帧、setSiblingIndex(0) 压最底），尺寸按 UI_SUITCASE_FRAME_RATIO=0.76 包住棋盘；④ SuitcaseLid 由 Graphics 圆角方块改为 suitcase-closed 精灵合盖，盖板/底板同尺寸严丝合缝；⑤ HomeController 顶部接 home-hero（等比缩放到宽 342）；⑥ Home/Game 在 setMuted 后 preload 对应 UI 图与音频；⑦ config.ts 新增 UI_SUITCASE_FRAME_RATIO=0.76；⑧ docs/03 §7.1 接线状态 ⬜→✅ +「接线实现（M4-5b）」段 |
| 复验 | `npm run check` 全绿（typecheck + typecheck:view + check:arch + verify:levels + test 340 passed）；无头预览 Home/Game 无 Console 错误，Console 确认 home-hero / suitcase-open / suitcase-closed 三图与四 WAV 均「已载入」；截图取证 hero-band 暖粉 rgb(230,187,175) 区别于背景 rgb(253,246,236)，Game 中部带装饰边框的大区域即行李箱壳、网格在其上、层序正确 |
| 影响 | 推翻 `8c88e3b` 的「影响」结论：M4-4 资源从「死资源、等 M4-5b」变为「已接线」，UI 插画与音效现在真实生效；M4-4 状态从「资源齐、未接线」改「已接线」 |

### `8c88e3b` · docs: M4-4 记档——资源表/程序化判定/索引色坑 + 提示词与原图归档

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-19 16:02 |
| 文件 | `docs/03-UI-Spec.md`、`docs/05-实施计划-v1.0.md`、`docs/07-AI-Prompts.md`、`art/ASSET-STATUS.md`、`art/art-source/ui/ai/`（README + 3 份 prompt）、`art/previews/ui/`（3 张 512 JPEG）、`CHANGELOG.md`、`.workbuddy/memory/` |
| 背景 | `0e97260` 交付了资源，但「哪些组件该出图、哪些不该」是这次真正的判断，不写下来下次还会重复讨论；另外索引色的黑边坑只在提交信息里，容易被漏读 |
| 要点 | ① docs/03 §7.1 资源表（3 插画 + 4 音效：尺寸/格式/用途/接线状态）+「suitcase-open 为何必须俯视」+「音效电平口径」；② docs/03 §7.2 程序化判定表（5 类组件逐条写理由），口径 =「一件东西的画像→出图；会变形的容器/状态机→程序化」；③ docs/03 §8 补音效真素材说明；④ docs/05 M4-4 行改 ✅ + 交付记档块；⑤ docs/07 §5.11 补「索引色 PNG」段（fit 默认索引色 / optimize 无损重编码 / 超 256 色回落）与两条硬事实；⑥ ASSET-STATUS §1/§3/§6 更新，新增 §6.1 无损压缩（收益表 + 黑边坑）；⑦ 按既定约定归档 UI 插画的「源」（提示词）与原图 512 缩略 |
| 复验 | 文档改动不影响代码；`npm run check` 与 `check:art` 在同日 `0e97260` 已双绿 |
| 影响 | 无代码变更。M4-4 状态从「进行中」改为「资源齐、未接线」——UI/音频仍属死资源，等 M4-5b |

### `0e97260` · feat(art): M4-4 非物品资源齐活——UI 插画 3 张 + 音效 4 个 WAV + 索引色无损压缩

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-19 16:00 |
| 文件 | `assets/resources/sprites/ui/`（home-hero / suitcase-open / suitcase-closed + .meta + 目录 .meta）、`assets/resources/audio/`（4 个 WAV + .meta + 目录 .meta）、`assets/resources/sprites/props/*.png`（22 张重编码）、`tools/art-batch-proc.mjs`、`tools/check-art.ts`、`tools/synth-sfx.py` |
| 背景 | 计划表的 M4-4 是「UI 组件 7 类 + 音效 4～6，与 UI Spec V1.2 一致」，但代码侧 7 类组件全是程序化 `Graphics`，全项目**零插画、零音频文件**（音效靠 WebAudio 合成占位）。需要判断哪些该出图、哪些该保持程序化，并把真正缺的补上 |
| 要点 | ① **插画 3 张**：`home-hero`（560×400，正视开口箱 + 长裙/化妆包/围巾）、`suitcase-open`（780×780，**俯视开口**、正方形内衬）、`suitcase-closed`（780×780，**俯视合上**，与 open 同轮廓同画布）。② **音效 4 个**：按 `core/audio/sfx.ts` 的脉冲规格离线渲染 WAV（70/110/220/340ms，44100Hz·16bit·mono），归一化 0.70 峰值且**不烘焙** `SFX_MASTER_GAIN`。③ **索引色 PNG 编码**：`encodeIndexedPNG`（colorType 3 + PLTE + tRNS）+ `optimize` 子命令，props 225.4KB→152.8KB、UI 545.7KB→208.3KB。④ **`check:art` 新增 UI 段**：`UI_SPECS` 契约表校验尺寸/透明底 + 孤儿检测，解码器支持 colorType 3 |
| 决策 | 「俯视」不是审美选择：棋盘是正方形（L10 6×6 = 342×342），正视「盖子竖起」的插图没有能承载正方形网格的平面（v1 内衬 1.68:1 且暖米色底抠不出来，整张废弃）。其余 5 类组件（按钮 / 图标 / 格子 / 关卡卡 / 各种浮层）**定案保持程序化**：判定口径 =「一件东西的画像 → 出图；会变形的容器/状态机 → 程序化」 |
| 踩坑 | **索引色透明像素不能清零**。每调色板项只有一个 alpha，若让所有 α=0 共用一个 `(0,0,0,0)` 槽位，双线性采样在边缘会把实色与黑色混合 → 物体外缘描一圈黑边。改为把透明像素 RGB **吸附到最近实色**（颜色外扩/bleed），实测边缘透明像素近黑占比 0%、均值 `rgb(147,73,27)` 正是描边色，比转换前的底色晕更干净 |
| 复验 | `npm run check` 340/340；`check:art` 25/63 + UI 3/3（透明底 0 不合格）；微信包重建 **121 文件 2,497,080 字节 = 2.38MB**（含 28 PNG + 4 WAV）；`preview:game` **零 Console 错误**、4 件物品「真图已载入」正常渲染——顺带证明索引色 PNG 在引擎侧可读 |
| 影响 | 包体 2.25MB → 2.38MB（新增 UI+音效 0.28MB，被 props 索引色省下的 0.07MB 抵掉一部分）；M4-5b 才能接线（UI/音频目前是**死资源**，不加载不进内存但占包） |

### `9307dc8` · fix(art): M4-6c 裁剪残缺 + 复制式重复修复（compose 按格分块拼版）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-19 15:11 |
| 文件 | 9 张 props PNG+meta（prop_jacket、prop_04_A/B/D、prop_05_A/B/D/F、prop_pouch）、`tools/art-batch-proc.mjs`、`docs/07-AI-Prompts.md`、`.workbuddy/memory/MEMORY.md`、`.workbuddy/memory/2026-10-19.md` |
| 背景 | 用户真机复查 M4-6 重绘件，挑出两类问题：① 7 张异形件被 `fit` 足迹遮罩**硬切残**（AI 画得比 cells 大，遮罩按格边界切主体出直线缺口）；② 2 张（prop_pouch、prop_05_F）是**复制粘贴式重复**（图中同一物品被重复） |
| 要点 | ① 弃硬裁，改走 `tools/art-batch-proc.mjs` 新增的 `compose` **按格分块拼版**：把每个占格区拆成 1~2 个矩形块，每块单独出图（语义自然：帽兜+衣身、相机+腕带、裙身+衣摆…），按内容包围盒**非等比**缩放进目标矩形 + alpha 混合拼版，末道 `applyFootprintMask` 只清 bleed 溢出。逐边出血：邻占格多出血（默认 6px）衔接、邻空格只留 1px 防切主体。② 7 张裁剪件按块重出后 compose，挖除均 ≤0.3%，剪影严格 = 足迹，无切割。③ 2 张复制件差异化：prop_pouch = 灰白织物拉链袋（上块 `0,0,1,2`）+ 蓝拉链袋（下块 `1,1,1,2`）两款不同收纳袋；prop_05_F = 4 枚不同发夹（浅 mint 抓夹 / 中 teal 发条 / 深 teal 弹簧夹 / 浅 mint 蝴蝶夹）各占一格 |
| 踩坑 | `compose` 路线仍须**串行**出每块 part：并行 6 张 ImageGen（即便各自传 `output_dir`）仍全部落到同一目录且同秒时间戳互相覆盖——prop_05_F 的 clip c 被 pouch_upper 覆盖丢失，已补生成（串行单张） |
| 复验 | `npm run check` 340/340；`check:art` 9 张尺寸/透明底/剪影全过（挖除 prop_pouch 0.5% / prop_05_F 0.1% 等 ≤0.3%）；`preview:game` 构建重导入零 Console 错误 |
| 影响 | 25/63 真图剪影 = cells 足迹（无新增素材，仅重做 9 张）；`tools/art-batch-proc.mjs` 增 `guide`/`compose` 两子命令；分支保护三件套（`.github/`/`package.json`/`tools/protect-branch.mjs`）按约定未提交 |

### `f090ee5` · feat(art): M4-6 异形件重绘贴合 cells 足迹 + 旋转感知贴图

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-19 14:10 |
| 文件 | 14 张 props PNG+meta（`prop_02_A/D`、`prop_jacket`、`prop_pouch`、`prop_04_A~D`、`prop_05_A~F`）、`assets/view/ItemView.ts`、`ItemLayer.ts`、`TrayView.ts`、`assets/core/geometry/artOffset.ts`（新）+ meta、`assets/core/index.ts`、`test/artOffset.spec.ts`（新）、`tools/art-batch-proc.mjs`、`tools/check-art.ts`、`docs/03-UI-Spec.md`、`docs/04-TDD-v1.0.md`、`docs/07-AI-Prompts.md`、`art/ASSET-STATUS.md`、`art/review-pixels.py`、`art/art-source/props/ai/*.prompt.md`（14） |
| 背景 | 真机反馈：L 型占格配矩形贴图——拖拽 ghost 是 L 形、落盘真图却是填满包围盒的矩形，形状割裂。首轮硬裁遮罩被用户看图否决（主体被切残），改走**重绘贴合形状** |
| 要点 | ① 按 `levels.json` 的 `cells` 生成逐格置物提示词（明确哪格放什么、哪格必须空），14 件 AI 重绘即呈多联骨牌形；`fit` 后的足迹遮罩仅作**兜底**（越界清零，不靠它切主体）。② `ItemView.createArtNode` 旋转感知：子节点锚点 (0.5,0.5)、等比因子按奇/偶圈取 `original` 宽/高、内容偏移用图集稳定的 `frame.offset` 按圈数 CW 旋转、`setRotationFromEuler(-90°×rot)`；修可旋转件 90° 被拉扁。③ core 纯函数 `rotatedCenterOffset` + 10 项单测（与 `rotateBy` 七形×四向交叉验证）。④ check-art 剪影门禁：非占格内部（内缩 2px）有不透明像素=阻塞，占格覆盖率<2%=警告 |
| 踩坑 | 单物体跨多格（笔记本/相机带/外套/长裙）会被模型逐格平铺成多个 → 提示词须写「ONE single… 禁止分段/平铺」；长裙 L 形足迹（`..X/..X/XXX`）改用「折叠平放成 L 形」语义；近白填充（白布）会被抠底吃掉 → 改明确彩色 + 描边 |
| 复验 | `npm run check` 340/340；`check:art` 25/25 剪影合规、0 透明底不合格；L2 托盘帆布袋呈「包身 + 右上肩带」L 形、笔记本+笔；L5 选件旋转 `朝向 1`、`artEuler=(0,0,-90)`、artSize 不变（不拉伸）；各关零 Console 错误 |
| 影响 | 25/63 张真图剪影 = cells 足迹；25 张合计 **215,860 B**，63 张齐预测 ≈2.41MB < 3.5MB；分支保护三件套（`package.json`/`.github/`/`tools/protect-branch.mjs`）按约定未提交 |

### `f3c59ea` · feat(view): M4-5a 真图接线——25 张已交付物品图接入游戏（propAssets 加载器 + ItemView 子节点贴图）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-18 01:52 |
| 文件 | `assets/view/propAssets.ts`（新）+ `.meta`、`ItemView.ts`、`ItemLayer.ts`、`TrayView.ts`、`GameController.ts`、`art/review-pixels.py` |
| 要点 | ① `propAssets.ts`：`resources.load('sprites/props/<itemType>/spriteFrame')`；模块级缓存 + 在飞去重 + 负结果缓存；晚到帧由调用方判 `node.isValid`。② `ItemLayer.buildNode` / `TrayView.mountItem` 创建后 `ensureFrame` 回调换帧；`startLevel` 前 `preloadFrames` 预热。③ `ItemView.setSpriteFrame` 落地：有帧在**子节点**挂 Sprite 并关主节点 Graphics，无帧保持占位色块；`spriteFrame` 字段从「只登记」变为真贴图 |
| 踩坑（三条引擎事实，均有源码/实测依据） | ⑴ **一节点一 renderable**：`Graphics` 在 `__preload` 占住 `node._uiProps.uiComp`，`onDisable` 不让位，同帧「禁 Graphics + 加 Sprite」吃 warnID 12002 且 Sprite 不被注册 → **Sprite 必须挂子节点**。⑵ **`spriteFrame` setter 会按当时 sizeMode 跑 `_applySpriteSize`**：默认 TRIMMED 把节点啃成 trimmed 尺寸 → **必须先设 `type`/`sizeMode=CUSTOM` 再设 frame**。⑶ **自动图集运行时重建帧**：缓存里的 SpriteFrame 的 `rect` 会被换成图集页坐标（实测 `(10,12)` → `(304,14)`），用 `rect.x/y` 算 trim 位置的节点在图集切换后创建就被摆出盘外（**盘上手机整件隐形、托盘却正常——同一 bug 两种表现全凭创建时机**）→ trim 偏移改用图集稳定的 `frame.offset` 反解（`left=画布宽/2+offset.x−trim宽/2`，`top=画布高/2−offset.y−trim高/2`），四件 L1 图 meta 逐一代数验证 |
| 复验 | L1 四拖配方 E2E：手机真图落位 bbox 407×160 vs 期望 408×169（x 向误差 1px，余量为底部 AA）；托盘三件真图正常；**零 Console 错误**。L6 无图回退：6 件全部「无真图，保持占位色块」，引擎对缺失路径**无任何噪音**，零 Console 错误。`npm run check` 330/330；`check:art` 已交付 25 张全格；`preview:game` 零错误 |
| 影响 | 25/63 张真图进入游戏（L1~L5 全换真图，L6~L10 自动回退占位）；每交付一批对应关卡自动换图，63 张不必齐。微信包重建 = **2,253,262 B / 104 文件**（较 `4c49a30` 的 2,251,371 +1,891 为本次代码增量），63 张齐预测 ≈2.41MB < 3.5MB 线，G2 无需 ADR。分支保护文件（`package.json`/`.github/`/`tools/protect-branch.mjs`）按约定未提交 |

### `4c49a30` · art: 补 8 张新图的 .meta 导入件（prop_04_E/F + prop_05_A~F）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-18 00:19 |
| 文件 | `assets/resources/sprites/props/prop_04_E.png.meta`、`prop_04_F.png.meta`、`prop_05_A.png.meta` ~ `prop_05_F.png.meta`（8 个） |
| 背景 | `3788630` 批次只提交了 PNG；编辑器自 22:49 后未运行，Cocos 未导入故无 `.meta`，8 张图不在 library 里 |
| 处置 | 跑一次无头预览（`preview-check --scene Boot`）即触发导入，25 个 meta 全部生成；trim 值与像素 bbox 余量逐项吻合（`prop_05_A` trimX=58/trimY=10 ↔ 实测 L58/T10） |
| 复验 | `npm run check` 330/330；Boot 预览零 Console 错误；真微信包重建 = **2,251,371 B / 104 文件**（旧 2,149,729 + 本批图 101,642），63 张齐预测 ≈2.69MB < 3.5MB 自设线 |
| 影响 | 25 张图全部 PNG+meta 成对入库，M4-5 接线前提就绪；分支保护文件按既定约定未提交 |

### `abc298f` · art: M4-3 批次产物归档——AI 件的「源」是提示词而非 SVG + 原图 512 缩略留档

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 23:51 |
| 文件 | `art/art-source/props/ai/README.md`、`art/art-source/props/ai/prop_04_E.prompt.md`、`prop_04_F.prompt.md`、`prop_05_A.prompt.md`、`prop_05_B.prompt.md`、`prop_05_C.prompt.md`、`prop_05_D.prompt.md`、`prop_05_E.prompt.md`、`prop_05_F.prompt.md`、`art/previews/props/*_reference.jpg`（8 张）、`art/ASSET-STATUS.md`（§3）、`docs/07-AI-Prompts.md`（§5.11） |
| 背景 | 生成原图此前只落在 `/tmp`，随时会被清；丢的是「以后想重抠、想对风格」的唯一依据。用户问「这批图的 SVG 是不是也该进 `art-source/props`」 |
| 结论（不产 SVG） | AI 件**没有矢量源**：模型只出位图。把 16 色量化的成品再矢量化，得到的是对成品的**二次近似**（边缘失真、半透明光晕丢信息、体积不减），属会误导后人的假源。AI 件的源改定义为**能重新生成它的最小输入** = `ai/<itemType>.prompt.md`（Object Block + 生成参数 + 负向词 + 后处理命令 + 版本踩坑），公共 Style Block 仍只在 `docs/07` §5.1 不复制，避免两处漂移 |
| 原图归档 | `art/previews/props/<itemType>_reference.jpg`，`sips -s format jpeg -Z 512` 一条命令产出（无新增依赖）。原图 1024×1536 级、单张 1–2MB，本批 8 张 10MB；512 缩略合计 **266KB**（1/38）。全量存原图 63 张会到 ~80MB，git 吃不住，而原图只用于人工比对与 image reference，重出图靠提示词而非放大旧图 |
| 附带记档 | `prop_05_F` v3 原图右下仍有「AI生成」水印，成品里靠「碎块剔除 ≥保留最大连通域 6%」去掉 → 该步骤对后续批次不可省 |
| 目录语义 | `art-source/props/` 根目录 = 手绘件 SVG（现有 3 件）；`ai/` = AI 件提示词源；`previews/props/` = 生成原图缩略（早期 2 张 PNG 参考图保持不动） |

### `docs` · chore: M4-2 定稿——色彩板/明度阶梯/提示词包（V1.2）+ A-02 裁决 + M3-3 机型读数

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 21:20 |
| 文件 | `docs/07-AI-Prompts.md`（第 5 节 V1.2）、`docs/04-TDD-v1.0.md`（17.5/17.6）、`docs/05-实施计划-v1.0.md`（M4-2 ✅ / M3-3 ✅） |
| 背景 | M4-1 锚点已确认（17/63 合格），M4-2 到期：写色彩板 + 明度阶梯 + 提示词包，让 63 图可依据生产 |
| 色彩板 | **17 张已交付图像素级主色聚类实测**（stdlib PNG 解码 + 16 级量化，跳过透明/近白/近棕描边）：织物灰白 `#E5E5E5`(L=0.784) 为 9 张主色、伞类 teal 深档 `#87CBB8~#559E91`(L=0.51~0.63)、硬壳 rose/blue 浅档；揭示「三色轮换」模型在真图阶段已解体 → 定稿 **5 色相家族**（C 织物/R 粉/M 青/B 蓝/N 褐 × 浅深档）+ 逐关分配规则（≥3 家族/关、同家族 ≤2 件、≥1 重色） |
| A-02 裁决 | **不给三基色加明度偏置，回签「色相+描边」方案**（待用户回签）。四条依据：自然本色填充下无可加偏置的统一基色 / 改令牌连锁大 / 四通道可区分（真机 L1-L3 无投诉）/ 字面口径前提结构性不成立。操作化替代：家族分配合规 + 缩略图剪影 |
| 提示词包 | 第 5 节 V1.2：5.2 色彩板实测重写、新增 5.2.1 裁决节、5.5 示例颜色与锚点 SVG 实际用色对齐（渐变 `#C4F0DE→#5FB3A4` 等）、5.6 清单补「家族/状态」两列（63 行全分配，46 件待产品牌有着落）、5.7 批次计划按进度刷新 |
| M3-3 读数 | 用户机型 **iPhone 15 Pro**（393pt）：ghost 校准后回访「手感不错」→ 手感 ✅；cellPx 物理折算 345/172px 远超 44px 下限，393pt 纵向无短屏溢出（M3-5 预案不触发） |

### `0e5088f` · tools: 出图后处理脚本入库——art-batch-proc（抠底/缩放/合版/量化）+ art-contact-sheet

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-18 00:05 |
| 文件 | `tools/art-batch-proc.mjs`（新增）、`tools/art-contact-sheet.mjs`（新增）、`docs/07-AI-Prompts.md`（§5.11 补命令行） |
| 作用 | `fit` 一条命令完成 抠底 → 裁边 → 面积平均缩放 → 居中合版 → 16 色量化，直接写 `assets/resources/sprites/props/<itemType>.png`；`info` 报尺寸/角 alpha/bbox/覆盖率，`palette` 报主色聚类与相对亮度 |
| 护栏 | 抠底后剩余不透明 <5% 抛错不写盘（底色与主体同色 / 描边断裂）；`QN` 控调色板色数（默认 16）；`--deshadow` 默认关闭（C 家族 `#E5E5E5` 与浅灰投影不可分） |
| 为什么入库 | 原脚本只在 `/tmp`，剩余 38 张没法复现；入 `tools/` 后与 `check-art`、`art:missing` 同处一条链 |

### `docs` · docs: M4-3 批次记档——出图流水线 §5.11 + 25/63 状态回写

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 23:58 |
| 文件 | `docs/07-AI-Prompts.md`（§5.6 状态列 + §5.7 批次表 + **新增 §5.11**）、`art/ASSET-STATUS.md`（§1 总览 + **§4.3 本批记档** + §6 包体）、`CHANGELOG.md` |
| 流水线 | 新增 §5.11「实测出图流水线」：生成尺寸取最近上限 / 纯白平坦底 / 阈值抠底（只挖边缘连通的近白低饱和区）/ 光晕 unflatten / 碎块剔除 ≥6% / 面积平均缩放（预乘归一化）/ 居中合版 / 16 色量化。逐条附实测依据 |
| 提示词收紧 | 新增「批次补充段」（flat sticker look + 无地面投影 + 纯白平坦底 + 无棋盘格），**对 5.1 Style Block 是收紧不是改写**；新增负面词 `dark maroon` / `checkerboard` / `watermark` / `thin vertical slivers` |
| 踩坑记录 | ① 模型不兑现 transparent（返回 colorType 2，还把棋盘格画进像素）；② 并行出图同秒撞名覆盖（`prop_05_C` 丢失）；③ 自动去投影不可用（C 家族织物 `#E5E5E5` 与浅灰投影同色，误删 45.8 万 px）；④ 面积平均缩放的预乘归一化写错导致全黑；⑤ 36KB/张 会顶到 3.5MB 线 → 16 色量化降到 11.7KB |
| 状态 | 25/63（39.7%）；L1~L5 全齐，L6 未开；包体预测 ≈2.55MB，G2 线 3.5MB 不动 |

### `3788630` · art: M4-3 批次推进 8 张——B2 收尾（prop_04_E/F）+ L5 六件，25/63

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 23:55 |
| 文件 | `assets/resources/sprites/props/`（`prop_04_E`、`prop_04_F`、`prop_05_A~F` 共 8 张 PNG） |
| 新增 | 口红（R 深 `#E08890` L=0.609）、护照（N 深）、长裙碎花（R 浅）、旅行手提袋（C+M）、高跟鞋（N）、化妆包开盖（R 浅）、香水圆瓶（B 浅）、发饰横放三枚（M） |
| 关卡补齐 | **L4 6/6**（原先缺重色件，`prop_04_E/F` 两件深档补上）；**L5 6/6** 且家族合规（≥3 家族 / 同家族 ≤2 即 R×2 / 有重色件） |
| 体积 | 本批 291,395 → **93,377 字节**（均值 11.7KB/张），16 色调色板量化 + alpha 16 级；63 张齐预测 ≈2.55MB |
| 未提交 | 8 个 `.meta` 留给 Cocos 首次打开工程时生成（不手写 UUID） |

### `docs` · docs: M4-3 进度记档——透明底修复流程补丁 + §5.7 失实更正 + 包体二轮读数（2.15MB）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 23:10 |
| 文件 | `docs/05-实施计划-v1.0.md`（M4-3 记档块 / M3-4 行 / G2 二轮读数）、`docs/07-AI-Prompts.md`（§5.6 状态列语义 + §5.7 失实更正）、`art/ASSET-STATUS.md`（重写）、`CHANGELOG.md` |
| 透明底 | `art/ASSET-STATUS.md` 重写：17/63、缺 46、B2 差 `prop_04_E/F`；记「阻塞-1 修复 + 流程补丁」（check-art 从此查 alpha，杜绝灰底蒙混入库） |
| 失实更正 | `docs/07` §5.7 原「家族分配已校验通过」是**不实声明**——实核 L1 无重色（违反 ≥1 重色）、L2 织物 ×4 / L3 ×3 / L4 ×4（违反同家族 ≤2 件）。已改记为违规实核 + 「46 张产出后按规则重排」；§5.6 状态列补语义（`✅` 含透明底，11 张本轮修） |
| 包体 | G2 补**二轮读数 2,149,729 B = 2.15MB**（一轮 3.24MB，靠裁 11 个未用引擎模块）；63 图齐预测 ≈2.46MB，余量 1.35MB，**不改 G2 门槛、不立 ADR** |
| 遗留 | ① `prop_04_D` 抠图后 3 根斜线探出右缘（源图触边描边，待重绘或接受）；② A-02 三基色明度偏置裁决仍待用户回签 |

### `27cb1c9` · fix: M4-3 阻塞-1——11 张灰底假透明改真透明 + check-art 加透明底核查 + 裁未用引擎模块降首包到 2.15MB

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 23:07 |
| 文件 | `assets/resources/sprites/props/`（11 张 png + 对应 .meta）、`tools/check-art.ts`、`settings/v2/packages/engine.json`、`art/review-pixels.py`（新增） |
| 阻塞-1 | 已交付 17 张里 **11 张是 `#E5E5E5` 满幅灰底**（alpha 全 255、不透明覆盖率 100%），只因占位色块底色同色而在预览里「看起来透明」，接进 `ItemView` 会带一块灰方块。根因：`tools/check-art.ts` 只查尺寸/朝向，**不查 alpha** |
| 修图 | 源图仅 3 张有 SVG，其余只能抠：边缘紧容差洪水填充 + 光晕 alpha 恢复 + 共线性保护。修后四角 α=0、无内部空洞、覆盖率 100% → 28–54%；`.meta` 重生成 trim（如 `prop_02_A` trimX=34/trimY=19） |
| 流程补丁 | `check-art.ts` 新增**全量透明底核查**（四角 α 必须 0 + 覆盖率上限告警）。回归：旧灰底图报 2 阻塞 + 1 警告，修复版通过；strict 对缺 46 张仍 exit 1 |
| 包体 | 63 图齐原预测 3.557MB 会击穿 3.5MB 自设线。改裁 `engine.json` 未用模块（physics-2d / spine / spine-3.8 / dragon-bones / video / webview / tiled-map / particle-2d / mask / rich-text 等 11 个，保留 14 个在用）→ 首包 3.24MB → **2.15MB（2,149,729 B）**，余量 1.35MB |
| 验收 | `npm run check` 330/330 全绿；无头 E2E 四拖落位 + 庆祝序列（+154/+504/+889ms）零 Console 错误 |

### `56a27a0` · fix: M3-1 真机校准——拖拽 ghost 上浮 24px 清零，修复「对不上格」手感问题（G1-D1 闭环）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 20:48 |
| 文件 | `assets/core/config.ts`、`assets/core/geometry/lift.ts`、`assets/view/PreviewLayer.ts`（3 文件，+47/−21） |
| 真机反馈 | 微信开发者工具真机试玩：「手指拖动移动到方格上时位移有点大，总感觉没放到正确的方格上」 |
| 根因 | G1-1 遮挡补偿 `UI_DRAG_LIFT_PX=24` **只改画法不改判定**——ghost 画在落点格上方 24 设计单位，松手落手指正下方的格；玩家按 ghost 对格 → 落点系统偏下一格（3×3 偏 0.21 格 / 6×6 偏 0.42 格）。像素实测：修复前 ghost 中心 (251.8, 329.8) vs 落点格 (1,1) 中心 (252, 354)，差正好 24 |
| 修复 | 上浮校准为 **0**（只改 `config.ts` 数值，`lift.ts` 机制与 12 条单测不动）；复测 ghost 中心 (251.8, 353.8)，误差 0.2px——G1-2「松手落格 = 预览所示格」视觉级成立。为什么去掉上浮而非补偿判定：盘上物品起拖锚点须等于原位（M2-11 约束），两问不可兼得；63 件物品最小 1×2、无 1 格物品，遮挡担忧经内容核对不成立，可读性由描边 + 半透明填充 + 1.05 放大补住 |
| 验收 | `npm run check` 330/330；E2E 四拖落点不变 + 🎉 通关 + 庆祝序列 +0/+153/+504/+875ms + 零 Console 错误；微信包已重建（3,236,262 字节） |
| 关联 | G1 报告 V1.2（G1-D1 闭环 / G1-4 真机部分闭合）、docs/05 M3-3 ◐ 首轮记档 |

### `docs` · chore: M3-1/M3-2 落地——微信小游戏构建产物就绪 + libVersion 已 widelyUsed + G2 首包实测 3.24MB

- M3-1：编辑器 CLI `--build platform=wechatgame;startScene=Boot` 出包 `build/wechatgame/`（86 文件 / 3,236,263 字节 / portrait / 启动场景 `db://assets/scenes/Boot.scene` 已核）；web 预览同款 env（`ELECTRON_DISABLE_SANDBOX=1`、退出码 36 以 `build Task (wechatgame) Finished in` 判成功）。`cli open --project build/wechatgame` 因 IDE 服务端口未开未能自动加载，用户侧手动导入即达 M3-1 验收
- M3-2：3.8.8 构建默认即 `libVersion: widelyUsed`，全包 grep 无写死引擎版本，无需手动改
- G2 首包读数落表：3.24 MB < 3.5MB ✅（余量 0.26MB，M4-5 美术接入后需复测）；帧率待真机
- appid 为 Cocos 默认游客号 `wx6ac3f5090a6b99c5`：本地预览/真机预览可用，**不可上传发布**，提审前需换真实小游戏 appid

### `8fc62a7` · fix: M2-11 复审两条 [低]——playSparkle 幂等前置停止 + 托盘起拖锚点改按当前手指位推导

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 19:11 |
| 文件 | `assets/view/SuccessOverlay.ts`、`assets/view/DragController.ts`（2 文件，+28/−6） |
| 要点 | ① **`playSparkle()` 幂等**（M2-11 复审 [低]）：每颗星循环开头补 `Tween.stopAllByTarget(star.node)` + `stopAllByTarget(star.opacity)` 两行，与 `playEntrance` 的前置停止、`stopSparkle` 的停止逻辑**三处同构**。呼吸是 `repeatForever`，`show()` 双调不经 `hide()` 会叠两串 tween 各写一半透明度（观感：星光抽搐）；当前调用图不可达（一次通关只发一次 `level-cleared`，新会话必经 `startLevel → hide() → stopSparkle`），但防御深度不该只靠"调用图碰巧到不了" ② **托盘起拖首帧界外锚点**（同复审 [低]）：`beginDrag` 的 grab 锚点按**物品来源**分——盘上物品仍用**按下点**（= 物品原位、ghost 不跳；round(0.5) 抖动差一格的实测依据不改），托盘物品改按**当前手指位**（= 此刻松手落点）。根因：托盘按下点在托盘带内，映射过棋盘格只能得到棋盘下方的界外值（复审记录 `grab anchor=(4,−1)`），不是任何有意义的位置；更实的危害是 stale-anchor——一次大幅 move 直接越过阈值、其后没有更多 move 时，松手仍拿陈旧锚点判取出态，把本该落盘的一拖误判成 cancel 回巢。托盘带内的首帧仍会算出棋盘下方的锚点，这是诚实的：手指在托盘里本就不能落盘，`overTray` 谓词与随后每个 move 会接管，ghost 也按取出态画在手指下方 |
| 验收 | **`npm run check` 330/330**；**L1 四拖 E2E 回归**（配方与 M2-10 全序列跑逐字节相同）：Console 四条落点不变——`放入 L01_A → (1,1)` / `L01_B → (1,0)` / `L01_C → (2,1)` / `L01_D → (0,0)`（末次 `--grep 放入` 专证四条齐全）→ `🎉 通关！L1` + 进度保存；庆祝序列 `+0ms 回弹 → +154ms 合盖 → +504ms 面板与星光（合盖完成）→ +887ms 按钮解冻` 四段齐全、动画期点击无穿透、**零 Console 错误（152 行）**；解冻态截图与 M2-10 已验证版几乎一致（60056→59559 字节，差异仅面板用时文案 15.5s→14.5s 与星光呼吸相位）；C 拖 `grab anchor=(4,0)`（旧代码同手势为 (4,−1)）实证新推导生效 |
| 关联 | M2-11 托盘滚动 / M2-10 通关浮层的两处 view 层收口，**无 core 契约变更**；M2-11 对 M2-9+M2-10 的复审记录（结论 PASS、0 阻塞、2 条 [低]）随本文档同批入库 `.workbuddy/memory/2026-10-17.md` |

### `b34e438` · feat: M2-10 通关庆祝完整序列——最后一件回弹 + 行李箱合盖 + 星光面板 + 解冻按钮（UI Spec 5.3）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 18:12 |
| 文件 | `assets/core/config.ts`、`assets/core/session/events.ts`、`assets/core/session/GameSession.ts`、`assets/view/ItemLayer.ts`、`assets/view/BoardView.ts`、`assets/view/SuccessOverlay.ts`、`assets/view/SuitcaseLid.ts`（+`.meta`，新）、`assets/view/GameController.ts`、`test/session.spec.ts`、`test/win.spec.ts`（新）（11 文件，+660/−64） |
| 要点 | M1-7 只做了**最小入场**（面板淡入 + 弹跳 300ms、静态星光圆）；本提交补齐 UI Spec 5.3 完整四段序列，时长全部集中在 `core/config.ts` 新增 `UI_WIN_*` 常量组（回弹 140ms / 合盖 350ms / 面板淡入 200ms / 弹跳 220+80ms / 星光半周期 450ms 谷值 α0.45 错峰 150ms / 收敛余量 80ms），**`UI_WIN_SETTLE_MS=870` 由各段公式推导**（改任何一段自动跟着走）。① **core `events.ts`/`GameSession.ts`**：`level-cleared` 事件增 `lastItemId`（回弹目标；`afterCommit` 三处调用方传 itemId，rotate/removeToTray 两处不可能触发通关、字段不激活）② **`view/ItemLayer.ts`**：`bounceItem(itemId, durationMs)` 对最后入箱那件做 1→1.12→1 缩放回弹（先 `stopAllByTarget` 归位再 tween，结束值恒 1）③ **`view/SuitcaseLid.ts`（新）**：合盖组件，运行时代码注入 `SafeAreaRoot`、**插到通关浮层正下方**（合盖盖棋盘/物品又不盖浮层遮罩）；尺寸问 `BoardView.boardSizePx()`（R-A6 格→像素唯一出口，本次在 `BoardView` 开的新公开出口）每侧外扩 8px、**每次 `close()` 按当前棋盘重画**（L1 342×342、L3 340×425 各关不同，建一次会盖错）；rose 盖板 + 棕把手两段式 tween（0.8 时长下滑过冲 10px sineOut → 0.2 回正 sineIn，**结束值恒为闭合位**，不用 backOut——回挑量随距离等比放大，342px 棋盘会挑出 30+px）；不挂触摸（WinAnimating 冻结期）④ **`view/SuccessOverlay.ts`（重写）**：四段编排（① 回弹→② schedule 140ms 合盖→③ schedule 490ms 亮遮罩 + 面板淡入/backOut 弹跳 + 星光呼吸→④ schedule 870ms `onSettled`→`GameController` 调 `completeWinAnimation()` 推 `Completed`——**冻结解除时机在 view 手里，core 不自己数时间**）；**遮罩到合盖结束后才盖上**（此前的舞台是棋盘与盖板，提早盖等于把演出挡住）；装饰星光从面板 Graphics 上的静态圆升级为**子节点**（一节点一 renderable：第二次 addComponent 会被静默拒绝），呼吸透明度谷值 45% 不到 0（UI Spec 8「减弱频闪」）、相邻星错峰 150ms；`show()` 仍幂等 + 文案每次重刷（M1-7/P1 教训）⑤ **`view/GameController.ts`**：`buildLid()` 注入（兄弟序紧盯浮层）；`wireSuccessOverlay` 接 `onBounceLastItem`/`onCloseLid`；`afterDispatch` 暂存 `pendingWin`、**`refreshAll` 之后才启动序列**（`state-changed` 被 unshift 到事件数组最前，`level-cleared` 处理时物品层还没重画，最后一件的节点不存在、回弹会打空）；`startLevel` 增 `suitcaseLid.reset()` 换关复位 |
| 验收 | **`npm run check` 330/330**（typecheck + typecheck:view + check:arch + verify:levels + vitest 全绿；新增 `test/win.spec.ts`：庆祝时长规格自洽——回弹 100–180 / 合盖 250–450 / SETTLE_MS = 序列 + 余量公式未被手改坏 / 星光谷值 ∈ (0,1) 减频闪）；**无头预览零 Console 错误（154 行）**。**L1 四拖通关 E2E**（配方全部从托盘 0 号槽心 (62,668) 起手、落点按 grabOffset 补偿：A→(299,344)、B→(71,458)、C→(299,458)、D→(185,230)）：Console `放入 L01_A → (1,1)` / `L01_B → (1,0)` / `L01_C → (2,1)` / `L01_D → (0,0)` → `🎉 通关！L1 4 步 16.2s` + `进度已保存：L1 通关 → 最高解锁 L2`；**分段计时日志**（`performance.now()`）`庆祝序列 +0ms：回弹`（`[ItemLayer] 回弹 L01_D（140ms）`）→ `+184ms：合盖`（`[SuitcaseLid] 合盖开始（350ms，棋盘 342×342 → 盖板 358×358）`）→ `+518ms：面板与星光`（`合盖完成`）→ `+918ms：按钮解冻`（帧量化迟 28–48ms，被 80ms 收敛余量吃住，顺序零错乱）；**像素级取证**（stdlib PNG 解码、dpr=2）：两连拍（`--gap 250` + 双 `--shot`，实测截图开销 ≈63ms/张）抓到盖板**下滑中**——把手棕带 y=55..65（p≈0.47，棋盘点行分布 RRR/RRR/·RR：row2 未盖）与 y=141..151（p≈0.69，RRR/RRR/RRR 全盖），遮罩均未亮（顶带 pure rose）；**解冻态**：面板纯白底（遮罩画在浮层节点自身、面板是子节点画在其上——压暗背后、面板全亮，层级语义实证）、标题区 325 暗像素（「整理完成！」在位）、主按钮粉实心 (250,145,168)（采样避白色文字取 y=465）、次入口白底 (254,254,254)、装饰星光粉 (250,145,168)、盖板闭合残留（顶带/左缘 masked rose (182,151,147) + 把手回闭合位 y=169..180） |
| 关联 | 落地 **实施计划 M2-10**（UI Spec 5.3 序列全四段；「动画播完才解锁按钮」由 `settled` 门控 + `canLeaveToHome()` 放行 `Completed` 共同保证，M2-7 复审 `bb1fccd` 口径复用）；`lastItemId` 事件字段是 core 事件契约的小扩充（仅 `level-cleared` 携带、无消费方破坏）；合盖节点走**代码注入**不碰 `Game.scene`（避开场景缓存坑，与 Toolbar/Guide/Dialog/Toast 同范式）；**E2E 配方坑已记 MEMORY/README**：托盘槽心在页 y=**668**（`UI_TRAY_BAND_CENTER_Y=−246`），旧笔记 658 偏上 10px——单行物品无症状、**多行物品（2×1）的 `grabOffsetFromRatio` 行从 floor(0.5×2)=1 翻成 0**，同松手点落点差一整行（本轮三连拒的根因）；M4-4 换真素材时星光/盖板只换绘制后端，`UI_WIN_*` 时序常量不动 |

### `62e18ee` · fix: M2-9 复审三处——喇叭声波弧画反 / 锁徽标无锁梁 / SfxPulse 波形去 lib.dom 耦合

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 01:29 |
| 文件 | `assets/view/HomeController.ts`、`assets/core/model/types.ts`（2 文件，+22/−6） |
| 要点 | ① **喇叭「有声」态声波弧方向画反（真缺陷，M2-9 引入）**：`arc(3,0,r,-π/3,π/3,false)` 的末参 `counterclockwise=false` 在 Cocos 3.8.8 渲染的是 `[start,end]` 的**补集**——弧绕到喇叭背后画了 240°（像素级角度直方图：缺陷态 **0/232** 个弧像素落在预期 ±60° 内，角度范围 −155°~+162°）。两处弧末参改 `true` → 标准「喇叭 + 右侧双弧」② **锁徽标根本没有锁梁（真缺陷，M2-7 起就存在，前两轮审查漏抓）**：`arc(cx, bodyTop, s*0.7, π, 2π, false)` 双重错误——末参补集语义，且圆心取在锁体**下**边缘（`roundRect` 的 y 参数实为下边缘，变量名 `bodyTop` 是误导源）→ 上半圆正好埋进填充的锁体里，锁形退化成**纯圆角方块**。修法：圆心移到锁体**上**边缘（`bodyBottom + s*1.6`，变量改名 `bodyBottom` 正名）+ `arc(…, 0, π, true)` → 标准挂锁「∩ + 体」③ **`core/model/types.ts` 去 lib.dom 耦合（类型洁癖）**：`SfxPulse.waveform: OscillatorType`（浏览器专有类型）换成 core 自有联合类型 `SfxWaveform = 'sine'\|'square'\|'triangle'\|'sawtooth'`（WebAudio `OscillatorType` 去 `custom` 的子集，`AudioAdapter` 的 `osc.type = p.waveform` 直接赋值兼容）。core 的平台无关不止 R-A1 管的 `cc`——DOM 类型同样是 Web 专有耦合，M4-4 换微信音频后端时这层不必跟着改。纯类型层、无运行时影响 |
| 验收 | **`npm run check` 321/321**（typecheck + typecheck:view + check:arch + verify:levels + vitest 全绿）；**无头预览零 Console 错误**。像素级取证（stdlib PNG 解码，dpr=2）：① 喇叭——弧心环带**径向剖面双峰** r≈6（53px）/ r≈10（90px）、**角度剖面 144/144 全落 ±60°**（缺陷态 0/232）、弧心正上/正下方（90°/270°、两半径）**背面探针 0 暗像素**，裁剪图可见右侧双弧、背后干净；② 锁——L2 卡（新档只解锁 L1，L2 为锁定态）徽标锁体区 466 暗像素、**锁梁区（锁体上方）90 暗像素**，到「锁体上边缘圆心」距离均值 **4.35**（期望 4.2）、最高点局部 y=**10.0**（期望 9.0+半描边），裁剪图可见「∩ + 体」；③ Game 场景冒烟：L1 正常载入、点托盘件触发 `播放音效 select（1 脉冲 / 70ms）`——音效运行时链路不受类型改动影响 |
| 关联 | M2-9 复审（结论 PASS + 3 条 [低]）的修复轮；根因「**Cocos 3.8.8 `Graphics.arc` 的 `counterclockwise=false` = 从 start 顺时针（角度递减）扫到 end，渲染出 `[start,end]` 的补集；`true` 才是标称区间**」已记入 MEMORY 引擎限制与 README 踩坑清单——**M2-10 通关庆祝的星光/动效若用弧，一律传 `true` 并直接给标称区间**；`SfxWaveform` 属 M4-4 换真音效后端的前置洁癖（`SfxKey` 命名空间与调用方零改动） |

### `7d88d4e` · feat: M2-9 音效——AudioAdapter + 4 个占位音效 + 首页静音开关（可静音，重启保持）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-17 00:25 |
| 文件 | `assets/core/audio/sfx.ts`（+`.meta`，含目录 `assets/core/audio.meta`）、`assets/core/model/types.ts`、`assets/core/config.ts`、`assets/core/progress.ts`、`assets/core/index.ts`、`assets/view/AudioAdapter.ts`（+`.meta`）、`assets/view/HomeController.ts`、`assets/view/GameController.ts`、`test/audio.spec.ts`、`test/progress.spec.ts`（13 文件，+696/−9） |
| 要点 | ① **`core/audio/sfx.ts`（新，纯数据零 cc）**：音效规格表——UI Spec 8 点名的四种：`select` 选中轻点（正弦 660→880、70ms）/ `place-ok` 合法放置咔哒（方波 520→260、110ms）/ `place-fail` 非法放置柔和提示（三角波 300→180、220ms，**禁谐波丰富的 sawtooth**——PRD 无障碍「避免刺耳」）/ `success` 成功扣锁（**双脉冲叠**：扣锁 click 60ms + 80ms 后上行小钟 260ms，共 340ms）。规格是「脉冲序列」模型（`SfxPulse`：波形 / 扫频 / 延时 / 时长 / 相对增益），`durationMs` **由 pulses 推导**不手写，改脉冲不会忘同步总长 ② **`core/model/types.ts`**：`SfxKey`/`SfxPulse`/`SfxSpec` 入中央类型模块（避免 types.ts ↔ sfx.ts 互引）；③ **`core/config.ts`**：`SFX_MASTER_GAIN=0.22`（总音量，真素材进来只改这一处）+ `SFX_ENVELOPE_ATTACK_S=0.008`（起振消爆音；**释音不设常数**——振荡器被 `stop()` 硬切时增益未衰尽同样爆音，故指数衰减恒收敛到 stop 时刻，注释已说明）④ **`core/progress.ts`**：`setMuted` 纯函数——静音写入侧，与 `markCleared`/`setLearnedLevels` **同存一份存档三条写链**（`suitcase.progress.v1`），各自只覆盖自己字段 ⑤ **`view/AudioAdapter.ts`（新）**：WebAudio 合成适配器，**模块级单例**（Home/Game 共用一个 `AudioContext`——浏览器限制并发数量，且换场景不该断声）。**懒创建**（首次 `play()` 才建，而游戏里每次播放都在用户手势回调里，合 TDD 11.3「首次播放必须由用户手势触发」）；建成仍 `suspended` 则**先 `resume()` 再发声**（直接往 suspended ctx schedule 的声音会被丢弃，症状「第一次没声」）；**同 key 重触发即停上一发**（快速连点不叠成噪音）；无 WebAudio 环境（微信端无全局 `AudioContext`）→ **优雅降级永久静默、不抛错**（架构文档 §5 表现层降级而非崩溃；M3 真机阶段按 TDD 11.3 换 wx API，R-A4 要求收进 platform 目录，与 M3-1 构建一起做）⑥ **`view/HomeController.ts`**：首页**音效开关**（PRD 290 把「音效开关」列在首页信息里）——网格下方 pill（喇叭图形 + 「音效：开/关」**双通道**，UI Spec 无障碍不只靠图形/颜色）；点击 → `setMuted` + `saveProgress` **读改存**（M2-8 规则）+ 同步适配器 + 重绘；**开启时播一声 select 作当场确认**（关闭时自然被静音闸挡掉）⑦ **`view/GameController.ts`**：`onLoad` 灌静音态（与 guide restore 并列，早于 `startLevel`）；`afterDispatch` 事件 → 音效（`placement-committed`→`place-ok`、`placement-rejected`→`place-fail`、`level-cleared`→`success`（浮层入场**先有声后有画面**））；**选中轻点声只认 `select` 意图**（`grab` 起拖不响、取消选中不响、点已选中物品走 rotate 也不响——规格只有四种）；`onDestroy` `audio.stopAll()` 收尾（单例跨场景，长 340ms 的通关钟不该拖进下一场景） |
| 验收 | **`npm run check` 321/321**（+14：`audio.spec` 覆盖清单与 UI Spec 对齐 / 数量在计划表 4～6 / 短音效 ≤500ms / 频率增益合理域 / 非法放置禁 sawtooth / success 双脉冲构成；`progress.spec` 补 `setMuted` 不可变透传 + 三条写链互不覆盖）；**无头预览零 Console 错误**。① 开关往返：首页 `音效开` → 点 `(195,722)` → `音效开关：开 → 关（已保存）`（截图：喇叭加斜杠 + 「音效：关」）→ `--reload` → `首页：… / 音效关`（**AC18 重启保持**）→ 再点 → `音效开关：关 → 开（已保存）` + `播放音效 select`（当场确认）② 四种音效实触发：`place-ok`×4（L1 四件依次放入）/ `place-fail`×1（**L01_C 拖到 L01_A 已占格 → overlap 拒收**，与「放不下」warn 同帧）/ `success`（2 脉冲 340ms，通关浮层入场前）③ 静音路径：`静音：开` → 进 L1 放置 → `已静音，跳过 place-ok`（静音期放置不发声，玩法不受影响） |
| 关联 | 落地 **实施计划 M2-9**（`AudioAdapter` + 4～6 占位音效，验收「可静音」）；UI Spec 8 四种音效全接线；PRD F14/AC18；`SaveDataV1.muted`（M2-7 起就在 schema 里，本次接上写入侧与 UI）；M4-4 真音效进来时只换 `AudioAdapter` 的发声后端，`SfxKey` 命名空间不变、调用方零改动；无 core 契约变更，`cellSize/cellPx` 算术仍仅存在于 `BoardView.ts` + `config.ts` |

### `bb1fccd` · fix: M2-7 复审三处（浮层期返回键失效 / 当前卡标记缺失 / 已通关对勾压数字）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-16 23:37 |
| 文件 | `assets/view/GameController.ts`、`assets/view/HomeController.ts`（2 文件，+64/−12） |
| 要点 | ① **浮层期「返回首页」失效（功能性）**：原返回键用 `isFrozen()`（= `WinAnimating ∨ Completed ∨ dialogOpen`）做闸门，而 `Completed` 是**终态**（不点「下一关 / 再来一次」不离开）→ 通关浮层关闭前返回键一直被压住。**新增 `canLeaveToHome()`**：只挡 `WinAnimating`（入场动画中）与 `dialogOpen`，**放行 `Completed`**——与 SuccessOverlay「动画播完按钮才可用」同口径。`isFrozen()` **保持不变**（棋盘输入在浮层期仍冻结、防误触拖拽）——两处**故意不同口径**。连带解决 **L10**（`hasNextLevel()=false`、不显「下一关」）：原只剩「再来一次」，回首页要绕「重开 L10 → 再返回」两步；现浮层期可直接回首页。② **当前可玩卡右上角三角标记漏画（文档/实现不一致）**：`HomeController` 头注释与 `c1f26d5` 提交信息都写「粉填充 + 粗粉描边 + 右上角三角标记」，但 `drawCardFace` 的 `current` 分支只画填充 + 描边。补 `drawSelectedMark()` 用**路径填充**画 ▲（Cocos 3.8.8 `Graphics` **无 `fillTriangle`**，`moveTo→lineTo→lineTo→close→fill`）。UI Spec 5.4「不能只用颜色区分」本就由「继续」文案满足，此为第二重图形佐证。③ **已通关卡对勾压关卡数字（视觉）**：`drawCheck(g, 0, 6)` 与大号数字 Label（`yOffset=6`、`fontSize=40`）同中心 → √ 压在数字上。对勾挪到**右上角徽标位并缩小**；**三态徽标统一右上角**（已完成✓ / 当前▲ / 未解锁🔒），中央只放数字、底部放状态小字 |
| 验收 | **`npm run check` 307/307**（改动全在 view 层，无 core 契约变更）；**无头预览零 Console 错误**。L1 通关（`🎉 通关！L1 4 步 5.6s → SuccessOverlay`、浮层 up）→ 点返回 `(30,60)` → **`[GameController] 返回首页`**（修复前同坐标无日志）→ `[HomeController] 首页：最高解锁 L2 / 已通关 1 关 → 当前可玩 L2`。截图实证：浮层期返回键可用；Home 已通关卡 **✓ 在右上、不再压数字**，当前可玩卡 **▲ 已绘制**。返回闸门与关卡无关（只查 `phase`/`dialogOpen`），L1 的 `Completed` 实证即覆盖 L10 无「下一关」场景 |
| 关联 | 修复 **M2-7 用户复审**三处 [低]（其中①为功能性、影响 L10 回首页路径）；`GameController` / `HomeController`（M2-7）；`SuccessOverlay`（M1-7）按钮冻结口径；无 core 变更，`cellSize/cellPx` 算术仍仅存在于 `BoardView.ts` + `config.ts` |

### `162faac` · feat: M2-8 存档——引导记忆并入同一存档命名空间（杀进程后「已学会」保留）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-16 23:00 |
| 文件 | `assets/core/model/types.ts`、`assets/core/progress.ts`、`assets/core/guide.ts`、`assets/core/index.ts`、`assets/view/GameController.ts`、`test/progress.spec.ts`（6 文件，+121/−19） |
| 要点 | ① **存档扩成单一命名空间存全部持久态**：`SaveDataV1` 增 `learnedLevelIds`（`core/model/types.ts`）——M2-7 只存通关进度，M2-8 把 `GuideMemory` 的「已学会引导」也纳入同一份（同 key `suitcase.progress.v1`），**一次序列化整份、加字段不动存取层** ② **两条真相共用一套归一**：抽出 `cleanLevelIds`（去重 / 升序 / 滤非正整数），`coerceProgress` 的读入与新增纯函数 `setLearnedLevels` 的写入共用它，读写同一语义、杜绝两份真相互漂移；`markCleared` 经 `...p` 透传 `learnedLevelIds`（不丢） ③ **读改存接线（`view/GameController.ts`）**：`onLoad` 先 `restore(loadProgress().learnedLevelIds)` **再** `startLevel`——首关引导是否弹出由它决定，灌晚了会漏弹/错弹；学会时 `setLearnedLevels(loadProgress(), guideMemory.learnedLevels(), now)` + `saveProgress`（**先取当前全量再覆盖 learnedLevelIds**，不丢通关/解锁）；`maybeShowGuide` 加 `DEBUG` 日志「引导显示：L…」/「引导跳过：L… 已学会」，供无头取证比对 ④ **`core/guide.ts` 文件头更正**：M2-8 已接（原文「调用方无需改动」不成立——需在 `onLoad` 灌入、学会时落盘），改述 `learnedLevels()`/`restore()` 两个对接方向 |
| 验收 | **`npm run check` 307/307**（+6：`progress.spec` 覆盖 `defaultProgress.learnedLevelIds`、`coerceProgress` 对已学集合去重排序、`setLearnedLevels` 纯函数/不可变/非数组退化、`markCleared` 透传、两条链互不覆盖）；**无头预览零 Console 错误**，同一 profile 一条会话跑完整链路——全新 profile → Boot→Home → 进 L1 → `[GameController] 引导显示：L1（drag）`（截图：蒙层 + 「按住物品，拖进行李箱」+ 高亮托盘槽与落点 + 手指动画）→ **4 次拖拽通关** → `[GameController] 进度已保存：L1 通关 → 最高解锁 L2 / 已通关 1 关` → **`--reload`（模拟杀进程重开）** → `[BootController] 载入存档：最高解锁 L2 / 已通关 1 关`（截图：L1 已通关 / L2 继续）→ **再进 L1** → `[GameController] 引导跳过：L1 已学会（不弹）`（截图：无蒙层、棋盘直接可操作）——**M2-8「杀进程后进度保留」把「已学会引导」也纳入了** |
| 关联 | 落地 **实施计划 M2-8**；M2-7 的 `view/storage.ts`（适配器）零改动即承载新字段；`GuideMemory`（M2-6）自此跨重启有效；无 core 契约变更，`cellSize/cellPx` 算术仍仅存在于 `BoardView.ts` + `config.ts` |

### `c1f26d5` · feat: M2-7 首页选关（Home.scene + 关卡选择 + 进度，未解锁关卡不可进）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-16 22:28 |
| 文件 | `assets/core/progress.ts`（+`.meta`）、`assets/core/index.ts`、`assets/view/storage.ts`（+`.meta`）、`assets/view/route.ts`（+`.meta`）、`assets/view/BootController.ts`（+`.meta`）、`assets/view/HomeController.ts`（+`.meta`）、`assets/view/GameController.ts`、`assets/scenes/Boot.scene`、`assets/scenes/Home.scene`、`tools/scene-build.mjs`、`tools/preview-check.mjs`、`test/progress.spec.ts`（17 文件，+1107/−14，含 4 个新 `.ts` + `.meta`） |
| 要点 | ① **`core/progress.ts`（新）**：进度模型全走纯函数——`cleared`（已通关关卡号集合）为唯一真相，**最高解锁 = `cleared` 上界 + 1 与总关数取小**（不另存「最高解锁」字段，避免两份真相不一致）；`continueLevelId`（最新待玩关）= 最低未通关与最高解锁取小（AC：主 CTA 进最新待玩关、全通后落在末关）；`markCleared` 不可变更新 + 去重；`defaultProgress` = 仅 L1 解锁 ② **`view/storage.ts`（新）**：`sys.localStorage` 读写（Web 端即 `window.localStorage`），key `suitcase.progress.v1`；**读写双向容错**——坏 JSON / 缺字段 / 越界关卡号一律回落默认，存档损坏绝不卡死启动 ③ **`view/route.ts`（新）**：场景间传「该进哪一关」用**模块级单例**（`setPendingLevel`/`takePendingLevel`，取后即清）——`director.loadScene` 换场景时模块单例天然存活，避开「场景序列化属性要手改 JSON」的易碎路径 ④ **`view/BootController.ts`（新）**：启动场景只做一件事——`loadProgress()` → `director.loadScene('Home')` ⑤ **`view/HomeController.ts`（新）**：程序化建首页（同 `ToolbarView` 范式 `Node`+`Graphics`+`Label`，不手改场景）——标题 / 主 CTA「开始收纳」/ 10 张选关卡；卡三态 **已通关（✓ + 绿框）/ 继续（当前可玩，粉底 + 右上角实心标记——UI Spec 5.4「不只靠颜色区分」）/ 未解锁（灰 + 右上角锁角标）**；门禁在卡片 `TOUCH_END` 回调判 `isUnlocked`：**未解锁只 `shakeX` 抖动、不切场景**，已解锁才 `setPendingLevel(id)` + `director.loadScene('Game')`；全部卡片与 CTA 都 `propagationStopped=true`（M2-2 教训：Cocos 触摸派发给**所有**命中节点，"盖住"必须显式停冒泡） ⑥ **`view/GameController.ts` 接线**：`onLoad` **优先消费 `takePendingLevel()`**（有值则覆盖场景属性 `levelId`，无值仍用属性——直连 Game 调试不受影响）；`afterDispatch` 的 `level-cleared` 里 `markCleared(loadProgress(), levelId)` + `saveProgress` 落盘（`DEBUG` 打「进度已保存：…」）；左上角补「返回 Home」按钮（代码注入 `SafeAreaRoot`，与工具栏同范式） ⑦ **`tools/scene-build.mjs`**：`SCENES` 声明里给 Boot/Home 场景挂 `BootController`/`HomeController`（走已有 `script()`，`.meta` 的 uuid → `__type__` 压缩），重生成 `Boot.scene`/`Home.scene`——**继续不手改场景 JSON** ⑧ **`tools/preview-check.mjs`**：加 `--reload` 步骤（`Page.reload` 同 profile → localStorage 保留，重注入 `touch-action` 与隐藏 FPS 面板），用于验「落盘 → 重启恢复」链路 |
| 验收 | **`npm run check` 301/301**（+20：`progress.spec` 解锁门禁 / 最高解锁推导 / continue 封顶 / 不可变更新 / 去重 / 坏存档退化）；**无头预览零 Console 错误**（194 行日志），一条会话内跑完整链路——**首启** Boot→Home（`[BootController] 载入存档：最高解锁 L1`、截图：仅 L1 粉底「继续」、L2–L10 锁角标）→ **点锁卡 L2 不切场景**（截图仍在首页，锁卡只抖动）→ **点 L1** → `[GameController] 载入 L1《…》 3×3 / 4 件` → **4 次拖拽通关**（`放入 L01_A→(1,1) B→(1,0) C→(2,1) D→(0,0)` → `🎉 通关！L1 4 步 6.2s`）→ `[GameController] 进度已保存：L1 通关 → 最高解锁 L2 / 已通关 1 关` → **`--reload`** → `[BootController] 载入存档：最高解锁 L2 / 已通关 1 关 → 进入 Home`（截图：L1 **已通关✓**、L2 **继续**解锁、L3–L10 仍锁）→ **点 L2** → `[HomeController] 进入 L2` → `[GameController] 载入 L2《再装一件》 4×3 / 4 件`（截图确认 4×3 棋盘 + L2 托盘）——**AC13（重启后已完成关卡与最高解锁仍在）+ 未解锁关卡不可进 + 主 CTA/卡片进入对应关**全部实证 |
| 关联 | 落地 **PRD F01 / AC13**、**UI Spec 5.1 首页 / 5.4 关卡选择**、**实施计划 M2-7**；场景流 **Boot→Home→Game** 三段成型（`nav` 走 `director.loadScene` + `route.ts` 单例）；**M2-8 存档**的适配器雏形已由 `view/storage.ts` 铺好（`GuideMemory` 等其余状态可并入同一命名空间）；无 core 契约变更，`cellSize/cellPx` 算术仍仅存在于 `BoardView.ts` + `config.ts` |

### `aa3004b` · fix: M2-6 复审三处 [低]（引导收起漏点 / L3 文案孤字 / M2-4 遥测残留）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-16 15:04 |
| 文件 | `assets/core/config.ts`、`assets/core/index.ts`、`assets/core/session/GameSession.ts`、`assets/core/session/events.ts`、`assets/core/solver/deadend.ts`、`assets/view/GameController.ts`、`test/model.spec.ts`、`test/session.spec.ts`（8 文件，+23/−74） |
| 要点 | ① **非 dispatch 的 view 动作不收起引导**：`showHint()`（提示按钮）与 `requestReset()`（开确认框）不走 `dispatch`，故不触发 `afterDispatch` 的收起逻辑 → 引导显示时点「提示」，提示高亮被引导蒙层压暗（二者同源 `suggestNextPlacement`、无矛盾仅视觉冗余；「重置」开框同理但 L1/L3 首启 `canReset=false` 实际不可达）。两处各补 `guideOverlay?.hide()`（`hide` 幂等、`show()` 内部本就会先 `hide`）——UI Spec 14「点击后即消失」对非 dispatch 的点击同样成立 ② **L3 文案换行孤字**：`放不下？选中物品后点「旋转」换个方向` = 18 全角字 × 字号 17 = **306px > `UI_GUIDE_TEXT_WIDTH` 300** → 折 2 行、第 2 行只余「向」一字。加宽常量 **300 → 330**（24px 余量）单行容纳；drag 文案 170px 不受影响 ③ **M2-4 遥测残留清理**：`deadlock-warning` 事件的 `freeCells`/`requiredCells` 自「无合法落点」判据取代面积守恒后即**无消费方**（`Toast` 只显固定文案，全仓无 view 读这两字段）——彻底移除：`events.ts` 事件类型收敛为 `{ type: 'deadlock-warning' }`、`GameSession.afterCommit` 不再透传数字、`deadend.ts` 删除两项计算与 `DeadendReport` 字段、**连带删除唯一消费它们的死代码 `areaIsNotObviouslyInsufficientForDebugOnly`**（全仓无调用）、`core/index.ts` 移除该导出。**判据行为完全不变**（`stuck` 仍 = `suggestNextPlacement(...) === null`） |
| 验收 | **`npm run check` 281/281**（纯清理 + 常量 + 4 行 view，用例数不变）；**无头预览零 Console 错误**：L3（临时置场景 `levelId=3`，验完 `git checkout -- assets/scenes/Game.scene` 还原）引导文案**单行无孤字**（截图确认「放不下？选中物品后点『旋转』换个方向」一行排开）；`--tap 330,796` 点「提示」→ `[ToolbarView] 点击「提示」` → `[GuideOverlay] 收起` → `[BoardView] 提示高亮 3 格` + `[GameController] 提示：L03_A → (0,0) rot=0`（修复①实证：非 dispatch 点击也收起引导） |
| 关联 | 收口 **M2-6**（`2de79e0` + 文档 `899d35f`）复审提出的三条 [低]（均不阻塞）；同步 **docs/04-TDD 8.4** 节示例（面积守恒快检 → 无合法落点判据、边界说明改为「单向信号而非充分不必要」）；测试 `describe` 名「面积守恒快检」→「无合法落点判据」（判据早已替换，名字不留误导）；无 core 契约变化，`cellSize/cellPx` 算术仍仅存在于 `BoardView.ts` + `config.ts` |

### `2de79e0` · feat: M2-6 首次引导层（PRD F13：L1 拖拽教学 / L3 旋转教学，可跳过、学会后不再弹）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-16 10:00 |
| 文件 | `assets/core/config.ts`、`assets/core/guide.ts`、`assets/core/geometry/maskHoles.ts`、`assets/core/index.ts`、`assets/view/GuideOverlay.ts`、`assets/view/designRect.ts`、`assets/view/BoardView.ts`、`assets/view/TrayView.ts`、`assets/view/ToolbarView.ts`、`assets/view/GameController.ts`、`test/guide.spec.ts`、`test/maskHoles.spec.ts`（16 文件，+1160/−4，含 4 个新 `.ts` + `.meta`） |
| 要点 | ① **`GuideOverlay`（新组件）**：整屏蒙层按 core `maskBands` 挖洞 + 洞亮色描边 + 程序绘制手指循环动画（拖拽型 起点↔终点；点击型 原地按压）+ 文案 `Label`。与 `Toast` 同范式——**不注册触摸监听、不设 `propagationStopped`**，引导出现时棋盘仍可拖拽、按钮仍可点（UI Spec 14「可跳过」）；`onLoad` 置 `active=false`，`hide()` 停 tween 并**归位手指**（M1-5/M1-7 教训：`Tween.stopAllByTarget` 只停动画不动节点）② **`core/guide.ts`（新）**：`guideKindOf`（L1=`drag`/L3=`rotate`/其余无，PRD F13「实际关次以 GDD 为准」）+ `guideDoneEventOf`（drag→`placement-committed`、rotate→`item-rotated`，用 `Extract<GameEvent,...>` 取类型防事件改名静默失配）+ `GuideMemory`「**已学会**后本关不再弹出」——**语义关键**：跳过（拖动/点击让引导消失）**不记学会**，重进本关仍再提示一次；持久化留 M2-8 的 `learnedLevels()`/`restore()` 两个方向，调用方无需改 ③ **`core/geometry/maskHoles.ts`（新）**：整屏遮罩挖多洞的条带切割（纯几何，与 `trayScroll`/`lift`/`takeout` 同思路进 core 以求单测兜底）④ **`view/designRect.ts`（新）**：节点→设计坐标矩形，走 `convertToWorldSpaceAR → convertToNodeSpaceAR` **两点转换**（不依赖层级、自动带 Fit Width 缩放与 M2-11 托盘滚动偏移；手算常量相加必然在滚动/换关后错位）⑤ **三个高亮矩形出口**：`BoardView.cellsLocalBox`（格算术仍只在本文件，R-A6）、`TrayView.slotNodeOf`/`slotPixelSize`、`ToolbarView.rotateButtonNode`——一律返回**节点/局部盒**而非裸坐标，避免调用方复制第二份布局真相 ⑥ **`GameController` 接线**：代码注入 `GuideOverlay`（夹在工具栏与确认框之间：压暗工具栏、但不压在确认框/提示条上）；`startLevel` 末尾 `maybeShowGuide()`；L1 落点**复用工具栏「提示」同一纯函数 `suggestNextPlacement`**（引导与提示必须是同一答案，各算一份必然分叉）；**可跳过** = 任何非 `move` 意图收起引导，**唯 `rotate` 关的 `select` 例外**（选中是"点旋转按钮"的前置步骤，收起等于把教学掐断在半路）⑦ **清理**：删除未被引用的 `UI_GUIDE_FINGER_RADIUS`（`buildFinger` 用 `radius = halfW` 画胶囊，本就是派生量） |
| 验收 | **`npm run check` 281/281**（+23：`guide.spec` 12 例语义 + `maskHoles.spec` 11 例面积守恒/不重叠/越界夹取/并集去重/非正方屏）；**无头预览零 Console 错误**，两关端到端取证——**L1**：首启 `[GuideOverlay] 显示：drag 引导，高亮 2 处`（截图确认整屏压暗 + 托盘 0 号槽与棋盘目标格 (0,0)+(0,1) 两洞 + 手指 + 文案）→ 起拖即 `[GuideOverlay] 收起`（跳过）→ 放入 A 后 `[GameController] 引导已学会：L1（drag）→ 本关不再弹出`（截图确认引导消失、A 落于 (1,0)+(1,1)）；**L3**（临时置场景 `levelId=3`，验完 `git checkout -- assets/scenes/Game.scene` 还原）：首启 `显示：rotate 引导，高亮 1 处`（截图：旋转按钮挖洞 + 手指点按 + 文案）→ 点选 L03_A 后**无「收起」日志**（select 例外生效，截图确认引导仍在、槽位转红选中态）→ 点「旋转」后 `收起` + `旋转 L03_A → 朝向 1` + `引导已学会：L3（rotate）`（截图确认 A 由横条变竖条、引导消失） |
| 关联 | 落地 **PRD F13**（P0）/ UI Spec 5.2·7·14 / GDD 3.1·3.3 / 实施计划 M2-6；`GuideMemory` 的持久化接口为 **M2-8**（存档）预留；`maskBands` 复用了 M2-11 `trayScroll` 确立的「纯几何进 core + 中性参数名避 R-A6」手法；无 core 契约变更，`cellSize/cellPx` 算术仍仅存在于 `BoardView.ts` + `config.ts` |

### `30a0f14` · fix: 托盘滚动偏移不再被每次重建归零（M2-11×M2-5 交互缺陷）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-16 00:03 |
| 文件 | `assets/view/TrayView.ts`、`assets/view/GameController.ts`（2 文件，+42/−3） |
| 要点 | ① **缺陷（复审 M2-11 + M2-5 时实测量到，属两特性交互面）**：`TrayView.render()` 无条件 `scrollOffsetValue = 0` → **任何**状态变更（放入 / 取出 / 旋转 / 撤回）都把托盘弹回开头。L7–L10（正是 M2-11 的目标关）最坑：取出高 `trayOrder` 物品时，拖拽中 `highlightReturnTarget → ensureSlotVisible` 已把目标槽滚进窗口并高亮，**松手提交后 render 归零 → 刚回巢、且处于 selected 的物品直接滚出视野**，M2-5 的目标位反馈自相矛盾（实证：日志 `托盘 8 件（可滚 66px，窗内 7）`，截图只剩 7 件、L07_H 不见）② **`TrayView.render`：保留偏移**，交给 `applyScrollLayout` 按**新的** `maxScroll` 夹取——件数变化时自动收敛到合法区间，不需要归零兜底（`trayClampScroll` 本就保证越界值被夹回）③ **新增 `TrayView.resetScroll()`**：把"从头开始"变成**调用方显式声明**，不再搭 render 的便车 ④ **提交后保证选中件完整可见**：`render` 末尾若 `state.selectedId` 有值，`ensureSlotVisible(state.tray.indexOf(id))` 把它挪进窗口。只在此处做——`render` 发生在提交后、无进行中手势；`applyState` 刻意不做，免得拖拽中把托盘在手指底下平移（会与 DragController 的"滑托盘 vs 抓物品"互斥仲裁打架）⑤ **`GameController.startLevel`**：换关 / 重开（含「再来一次」「下一关」）显式 `resetScroll()` ⑥ **`GameController.afterDispatch`**：`level-reset`（工具栏「重置」）也归零，且**放在 `refreshAll` 之前**，让重建本身就按 0 布局（放之后会先按保留偏移建一遍再跳回开头）⑦ `TrayView` DEBUG 日志补打印**当前偏移**（滚动类问题取证用） |
| 验收 | **`npm run check` 258/258**（纯 view 改动，core 未动）；**无头预览零 Console 错误**，L7（临时置场景 `levelId=7`，验完 `git checkout --` 还原）三条路径全实证：初始 `托盘 8 件 偏移 0px` → 横向拖动 `滑托盘开始：起始 offset=0px` → 放入 H 后 `托盘 7 件（可滚 14px，**偏移 14px**）`（**保留 + 夹取**，不再归零）→ 重置 + 确定后 `托盘 8 件（可滚 66px，**偏移 0px**）`（显式归零）；取出 H 后 `偏移 66px`，截图确认 L07_H **完整可见**且带选中环（修前该件整体滚出视野）；**L1 四拖通关无回归**（`放入 L01_A→(1,1) B→(1,0) C→(2,1) D→(0,0)` → 「整理完成！第 1 关 4 步」），L1–L6 不可滚关行为零变化 |
| 关联 | 修正 **`d95a2f7`** 的「`render` 归零偏移」设计（该写法在 M2-5 落地后才暴露交互缺陷——两条特性各自单测都过，缺的是组合面）；M2-5 的 `ensureSlotVisible` / 目标位高亮自此真正可被玩家看见；无 core 契约变化，仍受 R-A6 约束（滚动算术只在 `core/geometry/trayScroll.ts`） |

### `f2bca99` · feat: M2-5 取出交互（PRD R-06b：拖出棋盘回原 trayOrder 位，可撤回）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 21:49 |
| 文件 | `assets/core/geometry/takeout.ts`(新+.meta)、`assets/core/index.ts`、`assets/core/rules/placement.ts`、`assets/core/session/GameSession.ts`、`assets/view/BoardView.ts`、`assets/view/DragController.ts`、`assets/view/GameController.ts`、`assets/view/PreviewLayer.ts`、`assets/view/TrayView.ts`、`test/takeout.spec.ts`(新)、`test/rules.spec.ts`、`test/session.spec.ts`（13 文件，+467/−37） |
| 要点 | ① **缺口**：M2-5 原有半成品——`DragController` 已会发 `removeToTray`，但判定只有「手指在托盘带内」、预览是「直接藏掉 ghost」、无目标位高亮，与 V1.1 规格（中心出界判定 + 半透明取出态 + 目标位高亮 + 禁红）差距明显 ② **取出态谓词（两条件取并集，预览与松手共用同一来源）**：`手指在托盘带内 ‖ 物品中心出棋盘外扩半格`。中心出界是 TDD 7.3 原文判定；手指进托盘带是明确意图且不受抓取偏移影响（只看中心时，抓小物品边角要拖到托盘最底部才算取出）。边界用**严格 `>`**（贴边不算出——外扩半格本身是防误触缓冲带，边界算「已出」等于吃掉一半缓冲带；UI Spec 措辞是「**越过**外边界」）。预览与松手必须同谓词（UI Spec 6：否则「规则形同不存在」）③ **core 新纯函数** `geometry/takeout.ts` `isTakeoutPosition(centerX,centerY,boardW,boardH,unit)`：`max(\|cx\|−W/2, \|cy\|−H/2) > unit/2`，与 `trayScroll.ts`/`lift.ts` 同思路把边界比较变成可断言常量；参数名中性 `unit` 避开 R-A6 正则 ④ **R-A6 出口**：view 不算格算术——`BoardView.isTakeout(cells, anchor)`（`gridToLocal` + `bboxOf` 算中心）委托 core；`DragController.outsideBoard` 回调接它，当前朝向形状由 `rotateBy(item.cells, preview.rotation)` 给出 ⑤ **预览分态**：`PreviewLayer.show(preview, takeout)` 三分支——取出态 = **半透明中立色**（`TAKEOUT_FILL_ALPHA=0.45` 白填充 + 棕描边 lineWidth=2，无虚线无红；M2-5 前是隐藏 ghost）；`onPreview` 签名加 `takeout` 参数；`emitMoveIfChanged` **锚点没变也发预览**（手指进出托盘带不改锚点，否则「预览还绿、松手却取出」）⑥ **目标位高亮**：`TraySlot` 自 M1-3 预留、从未启用的 `'drop-target'` 绿描边态首次上岗——`TrayView.highlightReturnTarget(itemId)` 用 core 新纯函数 `trayInsertIndex(level, tray, itemId)`（从 `insertByTrayOrder` 提取，**插入与查询共用同一判据**；view 不许自己排序——顺序只认 `state.tray`）算落点，`ensureSlotVisible` 保证目标槽滚入可见窗口；`clearReturnTarget` 还原普通态 ⑦ **core 真缺陷修复（真实手势流专属，R-06b 第 4 条此前失效）**：`handleRemoveToTray` 不做拖拽生命周期收尾。真实序列 `grab → move* → removeToTray` 中间没有 drop/cancel，而 grab 已把 phase 置 `Dragging` → 取出后 phase 卡死 → `handleUndo` 的 `phase==='Dragging'` 门挡住撤回。两分支补收尾（`preview=null; dragFrom=null; phase = selectedId ? 'Selected' : 'Idle'`；成功分支放 `afterCommit` 之后并加 `!isInputFrozen()` 门，与 `handleDrop` 同构）。**证据链**：旧测试里的 `dispatch({type:'cancel'}) // 清理拖动态` 正是在绕此缺陷 ⑧ **松手语义**：`onTouchEnd` 先算 `takeout = dragging && pending && isTakeoutState(preview, ui)`；takeout 时 `from==='board' ? removeToTray : cancel`（对托盘物品取出=无变化），否则 `drop`；`invalid = !takeout && lastPreview && !lastPreview.check.ok`（取出态即使 preview.check 不 ok 也不抖不红——TDD 7.3 预览分态） |
| 验收 | **`npm run check` 258/258**（+13：takeout 6 + trayInsertIndex 3 + session 回归 4——含「真实手势流 grab→removeToTray 后 phase 回 Selected 不卡 Dragging」「取出后可直接撤回，精确回到取出前位置与朝向」两条，直接锁死缺陷不复发）；**无头预览三轮零 Console 错误**：run1 托盘带规则 `--drag 62,658,252,297 --drag 252,354,252,700,shot --tap 60,796` → `ghost → 取出态`（半透明白/棕）+ `取出目标位：L01_A → tray 第 0 槽` + `removeToTray` + `phase=Selected` + 撤回精确回盘，截图确认首槽绿 drop-target、无红；run2 中心判定隔离 `--drag 252,300,252,600`（手指停在棋盘-托盘缓冲带、**不在**托盘带内）仍正确 `removeToTray`——证明中心规则独立生效（anchor(3,1) 中心恰在边界→红，贴边不算出；(4,1)→取出态）；run3 回归：托盘物品缓冲带松手零状态变化 + 四拖通关（A@(1,1) B@(1,0) C@(2,1) D@(0,0)）→ `WinAnimating` |
| 关联 | R-06b 五条子规则全部落地（释放占位 / 回原 `trayOrder` 位 / 保留取出时朝向 / 一次可撤回 / 取出后重算装不下——重算由 `afterCommit` 既有链路承担：removeToTray 成功提交后 `checkDeadend` 照常跑，stuck 转 false 无新事件，Toast 按自身 2s 淡出不残留）；UI Spec 6 的 O11 待定项中「外扩半格」取并集谓词、「目标位高亮」复用既有 drop-target 态、「滚动时落点表现」由 `ensureSlotVisible` 处理 |

### `d95a2f7` · feat: M2-11 托盘横向滚动（UI Spec 5.2，L7+ 溢出件可达）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 20:13 |
| 文件 | `assets/core/geometry/trayScroll.ts`(新+.meta)、`assets/core/index.ts`、`assets/view/TrayView.ts`、`assets/view/TraySlot.ts`、`assets/view/DragController.ts`、`test/trayScroll.spec.ts`(新)（7 文件，+396/−37） |
| 要点 | ① **缺口**：L7–L10 有 7–9 件、`slotSizeFor` 夹到 44px 后一行只放得下 6–7 个，溢出件此前 `markOverflow()` 永久隐藏 → **不可达**；UI Spec 5.2「物品数量多时横向滚动」原本不在任何 M2 任务里（`bc62279` 补进计划表为 M2-11，本条落地）② **TrayView**：全部槽位照建，改挂 `TrayContent` 子容器，靠 `scrollOffset` 平移露出不同区段；只有与可见窗口**相交**的槽位才 `active`（`TraySlot.setInWindow`）。本节点保持固定尺寸=可见窗口，`containsPoint` / `hitTest` 口径与滚动前一致；`render` 归零偏移；暴露 `canScroll` / `scrollOffset` / `setScrollOffset`；`slotCenterX` 委托 core ③ **TraySlot**：`overflow`（一次性）拆成 `inWindow`（滚动）+ `dragHidden`（拖拽排除 M1-6）两个独立显隐理由，`updateActive = inWindow && !dragHidden`；删 `markOverflow` ④ **DragController**：过阈值后按**主轴方向**仲裁"滑托盘 vs 抓物品"——托盘带内起手（`overTray(start)`）+ 水平为主（`|dx|>|dy|`）+ `canScroll()` 三条件才滚（不发任何意图、松手不当点击）；否则维持原起拖 / 点选。托盘空白处也能滑；`onTouchEnd` / `onTouchCancel` 滚动分支直接收尾；L1–L6 放得下不可滚，横向拖动行为**零变化** ⑤ **core**：新 `geometry/trayScroll.ts` 纯函数（`trayContentWidth` / `trayMaxScroll` / `trayClampScroll` / `traySlotCenterX` / `traySlotInWindow`），从 `index.ts` 导出——与 `lift.ts` 同思路，把"夹取 / 可见性"变成可断言常量 |
| 验收 | **`npm run check` 246/246**（+12 `test/trayScroll.spec.ts`）；**无头预览**：L1 四拖通关无回归（`可滚 0px`、全程无 `滑托盘`）；**L7**（临时置场景 `levelId=7` 重建，验完回退）`托盘 8 件 可滚 66px 窗内 7` → 横向拖动 `touch(100,186)→命中 L07_B` 触发 `滑托盘开始`（不抓物品）→ offset≈60 → `tap(350,186)→命中 L07_H`（原本窗外不可达的末件变为可命中）→ 前后截图可见托盘左平移、L07_A 滑出左沿、L07_H 滑入右沿，无重叠 / 空隙，**零 Console 错误** |
| 关联 | 落地 `bc62279` 补进计划的 M2-11（P2 排期缺口）；`markOverflow` 移除后 `TrayView.visibleCount` 静态方法成死代码一并删除 |

### `a8b6548` · refactor: M2-4 deadend 判据复用 suggestNextPlacement（消除与 canHint 的同谓词两实现）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 19:11 |
| 类型 | 重构（M2-4 审查采纳的 [中] 建议项；不改行为，收窄真相源） |
| 文件 | `assets/core/solver/deadend.ts`（+11/−33） |
| 要点 | ① **审查发现**：`fbe7d27` 引入的 `checkDeadend` 用本地 `hasAnyLegalPlacement` 扫描「有无合法落点」，与 rules 层 `suggestNextPlacement`（M2-2 加）**语义等价**（`hasAnyLegalPlacement(l,s) === (suggestNextPlacement(l,s) !== null)`，唯一差异是锚点遍历范围，越界锚都被 `canPlace` 拒）。两份实现算同一谓词，违背「两份真相必然分叉」——工具栏 `canHint` 与 Toast `!stuck` 是同一谓词的正反两面，一旦 `suggestNextPlacement` 算法变（旋转集/剪枝/顺序）会「提示按钮说能放、Toast 同时说装不下」，而玩家同时看得见两者 ② **改法**：`stuck = suggestNextPlacement(level, state) === null`，删本地 `hasAnyLegalPlacement` 及 deadend.ts 的 `canPlace` / `Rotation` import（`rotateBy` 仍被 `occupiedCellsOf` 用故保留）；文件头 / JSDoc 补注「复用 rules 层真相源」③ **架构**：solver→rules 已是既有边（deadend 原本就 import `canPlace`），无新依赖边；顺带因 `suggestNextPlacement` 的 bbox 剪枝略快 |
| 验收 | **`npm run check` 234/234**（语义等价，用例不变全绿）；**重跑 L1 死局** `--drag 47,658,71,230 --drag 47,658,185,344`（A@(0,0)+B@(1,1) 搁浅 C、D）→ `[Toast] 显示：剩下的空间装不下啦…` 仍正确弹出、零 Console 错误（此例 freeCells=5=requiredCells，旧面积判据会漏判，again 印证重写必要） |
| 关联 | 收窄 `fbe7d27` 的实现（**不推翻**其结论：判据语义不变，只把「另写一遍扫描」改为「复用唯一真相源」） |

### `fbe7d27` · feat: M2-4 「装不下」非阻断 Toast（deadend 判据从面积守恒改为无合法落点）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 17:35 |
| 类型 | 新功能（M2 第四个任务：UI Spec 13 / PRD R-10 / TDD 8.4 的「非阻断装不下提示」落地）+ 核心判据修复 |
| 文件 | `assets/core/solver/deadend.ts`、`assets/core/config.ts`、`assets/view/Toast.ts`(+.meta)、`assets/view/GameController.ts`、`test/model.spec.ts`（5 文件，+138/−22；另 `Toast.ts.meta` 新增） |
| 要点 | ① **核心判据修复（M2-4 推进时实测发现的关键缺陷）**：旧 `checkDeadend` 用 `freeCells < requiredCells` 做快检，但 `freeCells − requiredCells = 可用格 − 物品总面积`（放置无关恒等），只能检出「关卡本身过载」而对**玩家摆错**毫无作用；10 个正式关卡全部 ≤ 满载 → `deadlock-warning` 在正规玩法里**永不触发**、Toast 沦为死代码。新判据 `stuck = !hasAnyLegalPlacement(level, state)`：逐件（含旋转）逐格试探是否还有任何合法落点，O(物品×旋转×格) 在 36 格规模可忽略，真正反映「玩家把局面走死」② **仍是单向断言**：`stuck=false` 只说明至少一件能放下、不代表最终装得下，故绝不触发失败态/禁用操作（PRD 明确不判失败）③ **`Toast` 新组件（代码注入 SafeAreaRoot，同 SuccessOverlay 范式）**：棕底(α0.92)+奶油字 pill（`UI_TOAST_WIDTH=320`/`HEIGHT=44`/`RADIUS=22`，锚点 `y=330` 居顶不挡棋盘）；**无触摸监听、无 `propagationStopped`**（Cocos 派发到所有命中节点，`SafeAreaRoot` 始终收手势 → 提示出现时棋盘/托盘仍可拖拽，UI Spec 13）；`show(msg)` 幂等（取消上一次待淡出）、`Tween` 淡入 150ms → `DEADLOCK_TOAST_MS=2000` 后淡出 300ms；`buildOnce` 懒建、背景 `Graphics` + 子节点 `Label`（一个节点只允许一个 renderable）④ **接线**：`config.ts` 加 `UI_TOAST_*`；`GameController.buildToast` 注入 `dragController?.gestureRoot` 末尾（最顶层）、`onLoad` 在 `buildDialog` 后调用；`afterDispatch` 的 `deadlock-warning` case 由 `console.warn` 改为 `this.toastView?.show('剩下的空间装不下啦，试试挪一挪或者撤回一步')`（设计内行为、不报异常）⑤ **需求来源**：PRD R-10 / TDD 8.4 / UI Spec 13「装不下」非阻断提示，文案指向「挪一挪 / 撤回一步」 |
| 验收 | **`npm run check` 234/234**（+1：新增「面积够但碎片化装不下」回归用例，直接锁定旧面积守恒快检的盲区——证明重写后 `deadlock-warning` 会真正着火）；**`npm run preview:game` 无 Console 错误**，日志含 `[GameController] 装不下提示条已注入 SafeAreaRoot`（`Toast.onLoad` 设 `active=false` 不挡手势、不报错）。注：in-engine 视觉 pill 由一次「把棋盘走死」的手玩确认（deadlock 触发链 `afterCommit→checkDeadend→deadlock-warning→toastView.show` 已按代码路径验证，单元层已证事件会发射） |
| 推翻 | 推翻「面积守恒快检（`freeCells < requiredCells`）足以检出装不下」的旧假设——该判据与摆放进度无关、10 关永不触发，M2-4 推进时经单元回放实测发现，已改用「无合法落点」判据 |

### `f8cef5d` · fix: SuccessOverlay 整屏遮罩显式 propagationStopped 隔离输入（P1）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 15:59 |
| 文件 | `assets/view/SuccessOverlay.ts`（+16/−3） |
| 要点 | ① **P1 视觉缺陷修复**：WinAnimating 期点「重置」会穿透整屏遮罩打开 `ConfirmDialog` 盖在通关浮层上（截图铁证），且对话框存续到入场动画播完之后。状态不坏——core 冻结门（`session.isInputFrozen()` / `DragController.inputFrozen` 双保险）拒收冻结期 `reset`，仍是「已放 4 件 phase=WinAnimating」；但属视觉缺陷（且 `showHint` 同样无门，冻结期能画高亮）② **根因（新查明引擎事实）**：Cocos 把触摸派发给**所有**命中节点，"整屏节点挡住触摸"必须显式 `propagationStopped`——光有 390×844 的 `UITransform` 尺寸没用。`ConfirmDialog` / `ToolbarView` 都显式停了所以有效；`SuccessRoot` 场景里虽有全屏 `uiTransform` 但没挂监听，什么都没挡住 ③ **修法**：`onLoad` 给整屏节点挂 `TOUCH_START` / `TOUCH_END` 的 `propagationStopped`（3 行）。按钮是子节点、先被派发不受影响（见 `buildOnce` 的 Next/Replay 按钮 TOUCH_END 回调）；节点 `active=false` 时不收事件，`show()` / `hide()` 显隐即自动启停本隔离 |
| 验收 | **复跑冻结期取证（无头预览，零 Console 错误）**：L1 四拖通关 → 点「重置」(240,796) → **无任何 `[ToolbarView] 点击「重置」` 与 `[ConfirmDialog] 显示确认框` 日志**（穿透已挡住 ✅）→ 点「再来一次」(195,540) 仍生效（L1 重载 ✅）。`npm run check` **233/233** |
| 推翻 | 推翻 2026-10-15 早前（M2-3 复盘）"SuccessOverlay 整屏遮罩在命中层级挡住工具栏"的错误结论——当时未实测，本轮无头预览实证该遮罩**只画不挡**，重置能穿透它打开确认框 |

### `006306b` · fix: M2-3 ConfirmDialog 消息文案按面板宽度换行 + 端到端验收

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 14:06 |
| 文件 | `assets/view/ConfirmDialog.ts`（+4） |
| 要点 | ① **视觉缺陷修复**：`addLabel` 补 `Label.Overflow.RESIZE_HEIGHT`——默认 `NONE` 会把长文案画出面板外（实测消息 18 字 ≈324px > 面板 280px），现按宽度换行、高度自适应、锚点 0.5 保持居中；② **M2-3 端到端验收**（无头预览，零 Console 错误）：放置 → 点重置弹确认框 → 取消（截图逐字节与放置态一致，**取消不重置** ✅）→ 再重置 → 确认（托盘恢复 4 件初始顺序、棋盘清空、phase=Idle，UI Spec 149 语义 ✅）。组件本身随 `5f80c34` 提前建，本条为 M2-3 收口 |

### `5f80c34` · feat: M2-2 底部工具栏（撤回 / 旋转 / 重置 / 提示）+ M2-3 ConfirmDialog 提前建

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 11:12 |
| 类型 | 新功能（M2 第二个任务：G1-5 撤销缺口的规格归属地）+ 文档（G1 报告 G1-5 ⚠️→✅） |
| 文件 | `assets/view/ToolbarView.ts`(+.meta)、`assets/view/ConfirmDialog.ts`(+.meta)、`assets/core/rules/placement.ts`、`assets/core/index.ts`、`assets/core/config.ts`、`assets/view/GridCellView.ts`、`assets/view/BoardView.ts`、`assets/view/TraySlot.ts`、`assets/view/TrayView.ts`、`assets/view/GameController.ts`、`test/session.spec.ts`、`test/hint.spec.ts`（12 文件，+941/−15） |
| 要点 | ① **`ToolbarView`（新组件，代码注入 `SafeAreaRoot` 而不是手改场景 JSON）**：底部四按钮「撤回 / 旋转 / 重置 / 提示」。每个按钮 = Graphics 画底 + 子节点 Label（同 `SuccessOverlay` 范式）；可用态用 `UIOpacity` 控（置灰 110/255），不新增 Graphics。按钮节点 `propagationStopped = true` 隔离触摸（**Cocos 3.8.8 类型声明无 `EventTouch.stopPropagation` 方法**，只有 `propagationStopped` 标志位——已查 `cc.d.ts` 确认）。`updateState` 每次重算可用态（防 M1-7 懒加载 `built` 提前 return 吞差异）② **撤回含朝向（R-08）**：core `History` 早已存完整 `LevelState` 快照含 `rotation`，本次只补单测断言（放置 A → 连旋两次 0→1→2 → 两次 undo 精确回退 2→1→0）；view 撤回按钮直接 `dispatch({type:'undo'})` ③ **旋转仅「选中且可旋转物品」时可用**：`canRotate = selectedId != null && findItem(level, selectedId).rotatable === true`，否则置灰（UI Spec 5.2「可在已选中时点击按钮」+ 与 M1-8 双击入口刻意不对称：旋转有规格授权、非破坏性、作用于被选中对象）④ **重置走 `ConfirmDialog` 二次确认**（UI Spec 5.3：重置是破坏性操作，不能直接生效）——`requestReset` 置 `dialogOpen=true` + `show()`，`confirmReset` 才 `handleIntent({type:'reset'})`，`cancelReset` 只关弹窗。`isFrozen()` 纳入 `dialogOpen`，弹窗期间冻结一切手势（含工具栏自身）⑤ **提示是免费提示，不可伪装成可用空按钮（UI Spec 152）**：由 core 新纯函数 `suggestNextPlacement(level, state)` 驱动——按 `tray` 顺序取首件能放下（任一合法落点）的物品，不可旋转只试 rotation 0、可旋转试 0/1/2/3，行主序扫描首个合法落点，返回 `{itemId,row,col,rotation,cells}` 或 `null`；`canHint = suggestion != null`，全放完即不可用（不假装能用）。高亮由 `BoardView.showHint(cells)`（蓝填充+蓝描边）与 `TrayView.highlightHint(itemId)`（目标槽 hint 描边、选中槽保留 selected、其余 normal）呈现 ⑥ **提示高亮 auto-clear 双重保险**：`afterDispatch` 开头 `clearHint()`（任何状态变更立即清）+ `UI_HINT_AUTO_CLEAR_MS=3500` 超时兜底（`scheduleOnce` + 可取消 `hintClearCallback`）⑦ **布局与接线**：`config.ts` 加 `UI_TOOLBAR_BAND_CENTER_Y = -(UI_DESIGN_HEIGHT/2 - UI_TOOLBAR_HEIGHT/2)`（设计坐标）、按钮区 `UI_TOOLBAR_BUTTON_WIDTH=72 / HEIGHT=56 / GAP=18`（4×72+3×18=342=内容宽 390−2×24）、`UI_HINT_AUTO_CLEAR_MS=3500`；`GameController.buildToolbar` 用 `dragController?.gestureRoot`（= SafeAreaRoot）作父节点 `new Node()` + `addComponent(ToolbarView)`，`setSiblingIndex(0)` 置最底层，`onLoad` 末尾调 + `startLevel`/`afterDispatch` 末尾调 `updateToolbarState`；`buildDialog` 末尾追加置顶遮罩 ⑧ **R-08 在 core 早已满足**（History 存完整快照含 rotation），本任务只补单测；G1-5 撤销缺口由此闭合（G1 报告 V1.1 的 ⚠️→✅ 见 `docs/08`） |
| 验收 | **单测 6 条新**（新 `test/hint.spec.ts`）：未放置提示首件且落点合法；逐步放置依次提示后续；全放完返回 null（UI Spec 152 不伪装空按钮）；不可旋转只试 rotation=0；可旋转「竖放不下、横放得下」返回 rotation=1；与 `canPlace` 交叉验证。`test/session.spec.ts` 补 R-08 撤回含朝向用例。**`npm run check` 233/233**（+6）；**`npm run preview:game` 无 Console 错误**：日志含 `[GameController] 工具栏已注入 SafeAreaRoot`；点按「提示」按钮（页面 330,796）实证提示链：`[ToolbarView] 点击「提示」` → `[BoardView] 提示高亮 2 格` → `[GameController] 提示：L01_A → (0,0) rot=0`。M1 遗留缺口（G1-5）全清 |
| 推翻 | 推翻 `8bc7940`（`docs/08` V1.1）里「G1-5 撤销 ⚠️ 顺延 M2-2」的待定状态——M2-2 落地后改为 ✅（入口形式=底部工具栏四按钮，与旋转刻意不对称的原因见本条目要点③，与 `c52bbd2` 的裁定一致） |

### `beb68b1` · feat: M2-1 关卡加载（10 关可切换 + 「下一关」主按钮）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 00:42 |
| 类型 | 新功能（M2 首个任务：从"只有 L1"到"10 关可切换"） |
| 文件 | `assets/core/model/level.ts`、`assets/core/index.ts`、`assets/core/config.ts`、`assets/view/GameController.ts`、`assets/view/SuccessOverlay.ts`、`test/levels.spec.ts`（新，65 行 / 15 条）（6 文件） |
| 要点 | ① **core 新增 `levelIdsOf(raw)`**：包里有哪些关卡（`levelId` 升序、去重、跳过形状不像关卡的条目）。"有没有下一关"是**数据结构判断**，属于 core（执行纪律 #3）——view 不该自己数数组长度 ② **`GameController.startLevel(levelId)`：首启 / 再来一次 / 下一关三条路径共用一份实现**。三条路径要做的事完全一样，拆三份必然分叉——M1-7 的 `replayLevel` 就是先例，本次删掉它并入 `startLevel`。其中 **`wireDrag` 必须重挂**：`boardItemAt` 的闭包捕获了 `level`，换关不重挂会拿上一关的物品表查命中（症状是"点得到却抓不起来"）。顺带删掉 `renderTray`（与 `refreshAll` 里的托盘渲染完全重复的死代码）。`hasNextLevel()` 问 `levelIdsOf` 的最大值，不猜总数 ③ **`SuccessOverlay` 按 UI Spec 5.3 把主次调回**：主按钮「**下一关**」（粉实心 `accent.pink`）+ 次入口「**再来一次**」（白底 + 浅描边 + 次要色文字，热区仍 ≥44）。M1 只建「再来一次」并做成主按钮，是因为那时没有关卡推进机制、建「下一关」就是 UI Spec 禁止的空按钮；M2-1 接上关卡加载后按规格调回。**最后一关不显示「下一关」且不留空位**（次入口居中到主按钮位置）。面板 300 → 340 才装得下两个入口（340 = 文字区 + 48 主按钮 + 12 间距 + 44 次入口 + 30 留白） ④ **`show(event, hasNextLevel)`：按钮显隐与位置每次 `show()` 都重排**（`applyButtons`）——与 `applyEvent` 同理，懒加载的 `built` 提前 return 会静默吞掉差异，症状是"第 10 关还显示着下一关"（M1-7「复玩战绩不刷新」是同一个病） ⑤ 按钮**底与文字分层建**（文字挂子节点）：一个节点只允许一个 renderable 组件，M1-7 给面板加第二个 `Graphics` 画星光被引擎静默拒绝是同一个坑；两个按钮的构建抽成 `addButton` 一处 ⑥ **关卡加载方式保留 M1-0 的场景直挂 `JsonAsset`**，未改 `resources.load`：同步、构建期即可校验、10 关 JSON 仅几 KB。规格原文写的是 `resources.load`，这里按"不做无谓的异步化"取舍；装配逻辑（`parseLevelBundle`）与加载方式解耦，真要换随时可换 |
| 验收 | **单测 15 条**（新 `test/levels.spec.ts`）：`levelIdsOf` 返回 1..10、非对象/缺 levels 降级为空数组、跳过缺 `levelId` 的条目；**10 关逐关 `parseLevelBundle` 取出且 `levelId` 对得上**（运行时载入口径，用**生产态** `assets/data/levels.json` 而非 GDD 源——运行时读的就是它）；越界取关抛 `LevelDataError`（否则「下一关」会把玩家送进不存在的关卡）。**可解性**由 `npm run verify:levels` 逐关跑 solver 保证（已编入 `check`）。→ `npm run check` **227/227**；`npm run preview:game` 无 Console 错误。**无头预览实证切关链路**：L1 四拖通关 → 点「下一关」（页面 195,482）→ `载入 L2《再装一件》 4×3 / 4 件物品 → 下一关 L3` → `放入 L02_A → (0,0)`；**最后一关**：临时把场景 `levelId` 置 10 重建 → `载入 L10《旅行收纳大师》 6×6 / 9 件物品 → 下一关 （已是最后一关）`（验完已回退场景）。**布局量化**：面板实测 278×338（= 280×340 减描边内缩），次入口 (195,540) 点击生效（`[SuccessOverlay] 点击「再来一次」`） |
| 待定项 | 解锁门禁（未解锁关卡不可进）归 M2-7 的关卡选择页；进度持久化归 M2-8 的 `StorageAdapter`；完整庆祝动效（回弹→合盖→星光）归 M2-10 |

### `8bc7940` · feat: M1-9 G1-1 手指遮挡补偿（拖起上浮 + 放大 + 浅阴影）+ G1 报告改判 Go

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 00:19 |
| 类型 | 新功能（G1 出口检查点 G1-1 不过项的修复）+ 文档（G1 报告 V1.0 No-Go → V1.1 **Go**） |
| 文件 | `assets/core/geometry/lift.ts`（新，96 行）+ `.meta`（新）、`test/lift.spec.ts`（新，129 行 / 12 条）、`assets/core/config.ts`、`assets/core/index.ts`、`assets/view/PreviewLayer.ts`、`docs/08-G1-拖拽手感检查报告-v1.0.md`（6 文件） |
| 要点 | ① **动机**：`docs/08` V1.0 判 No-Go，唯一"规格明文要求且**零实现**"的阻塞项是 G1-1 手指遮挡——UI Spec 6 节「拖动物品时应采用『手指不遮挡目标格』的视觉偏移策略」+ 8 节「拖拽抬起：略微放大或加投影」，而 `PreviewLayer` 的 ghost 一直按手指锚点原样绘制。不修就进 M2 = 在错的手感上叠 10 关 ② **实现（只改画法，不改判定）**：拖起时把 ghost 的**绘制矩形**整体上浮 `UI_DRAG_LIFT_PX=24` + 等比放大 `UI_DRAG_LIFT_SCALE=1.05` + 右下浅阴影（`UI_DRAG_SHADOW_OFFSET_PX=3` / `UI_DRAG_SHADOW_ALPHA=0.18`，UI Spec 4.1「右下短而淡的结构阴影」）。四个常量全在 `core/config.ts`，真机校准只改数值 ③ **几何算式提成纯函数**（与 `thumbnail.ts` / `drag.ts` 同构）：`lift.ts` 出 `centerOf` / `liftAndScale` / `offsetRects`，缩放锚点取**整体包围盒中心**——取单格中心会让 1×3 物品散成三块，而 1.05 这种小倍率下肉眼几乎不可见；带 NaN / 非正倍率守卫防止污染绘制坐标 ④ **三条硬约束**（都源于已踩过的坑）：`preview.anchor` 一个字不动（否则 G1-2「松手落格 = 预览所示格」立刻破功）；**不挪节点**（M1-7 实测：位移 tween 不归位会留下 8px 持久偏移——上浮画在 Graphics 路径上，`nodePos` 全程 `(0,68)` 不变）；非法态（红虚线）与合法态（绿实心）同步抬起 ⑤ **`docs/08` 改判 Go 并定案三处处置**：G1-1 已修（✅）；G1-4 真机部分**顺延 M3-1 并登记为已知风险**（本环境无微信开发者工具，且 320px 折算 93.5px 已过 44 下限，量化风险有限）；G1-5 撤销**不给临时手势**、整体归 M2-2 底部工具栏——**与 M1-8 的旋转临时入口刻意不对称**：旋转有规格明文授权（UI Spec 5.2「可在已选中时点击按钮」）、非破坏性、作用于被选中对象；撤销则破坏性且**无重做**（core `History` 只有 `canUndo`）、且空白区手势已被交互表「点击空白 → 取消高亮」占用（双击撤销会撞车成"想取消高亮却撤了一步"）。待定项 G1-D1 改归真机校准、G1-D4 定案 M2-2、新增 G1-D5（撤销 10 步无残影 → M2-1 与连放同批） |
| 验收 | **像素级核对**（stdlib PNG 解码 + 扫描线找色块；截图 780×1688 = 2× DPR，已折算设计单位）：ghost 整体中心 `(251.75, 329.75)` ↔ 期望 `col1+col2 包围盒中心 252`、`row1 中心 354−24=330` ✅ 上浮量精确且横向不漂；宽 `227` × 高 `107` ↔ `(2×114−2×6.84)×1.05=225.0` +2px 描边、`(114−13.68)×1.05+2=107.3` ✅ 等比放大未散开。**阴影的负向对照**（单个像素值可能混进棋盘格线，故关掉重拍同点位比对）：ghost 外扩 6px 带的暗像素数——下方 `626+625`（α=0.18）↔ `6`（α=0）、右方 `352+126` ↔ `172`，上方/左方两侧开关前后完全一致 → 影子只在右下、关掉即消失；阴影色 `rgb(231,226,223)` ↔ 棕 `#7A5C4F` 18% 叠白 ✓ 与 UI Spec 4.1「右下短而淡」一致。**G1-2 复验（防这次改动破功）**：四拖通关（`--grep 放入` 实跑）落格 A(1,1) / B(1,0) / C(2,1) / D(0,0)，与 ghost 报 `→ ok` 的格四四对上，零漂移。**非法态实证**：拖拽途中 `ghost L01_A@(3,0) → out-of-bounds lift=+24 scale=1.05`，与合法态共用同一条 `liftAndScale`，不会"合法抬起、非法贴地"。`npm run check` **212/212**（+12）含 `typecheck:view`；`npm run preview:game` 无 Console 错误 |
| 推翻 | 推翻 `bfab6d3`（`docs/08` V1.0）的「总判定 No-Go」——同一份文档升级 V1.1 改判 **Go**；判据口径未放宽，G1-2/G1-3 原判不变，G1-4/G1-5 由"阻塞"改为"明确顺延 + 登记风险/缺口" |

### `bfab6d3` · docs: 新增 `docs/08-G1-拖拽手感检查报告-v1.0.md`（M1.D 出口检查点）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 |
| 类型 | 验收文档（不涉代码） |
| 文件 | `docs/08-G1-拖拽手感检查报告-v1.0.md`（新） |
| 要点 | 逐条对照 `docs/05` §M1.D 的 G1 清单与 UI Spec 判据，记录**实测读数**：**G1-1 手指遮挡 ❌**（ghost 无上浮/放大/阴影，规格要求"手指不遮挡目标格的视觉偏移策略"，未实现）；**G1-2 吸附 ✅**（ghost 报格 = 最终 placement，四拖与 13 连压力用例零漂移）；**G1-3 旋转手感 ✅**（托盘旋转缩略图 `60×30→30×60` 即时更新 + selected 高亮；已放物品朝向 1→2→3→0 四次回初态；`rotate-blocked` 抖动 8px/160ms 实证）；**G1-4 真机首验 ⚠️**（320px 折算 93.5px ≥ 44 ✅，但微信开发者工具真机未做——实施计划把微信构建放在 M3-1，与"M1 末做一次"存在排期冲突）；**G1-5 连续操作 ⚠️**（连放只验到 4 件——M1 只加载 L1；**撤销无 UI 入口**，与旋转同类的任务表缺口，core 有单测但 view 无路径）。**总判定 No-Go** |
| 待定项 | G1-D1 上浮数值（建议 24 设计单位，真机调）与"只能改画法、不能改判定"的硬约束；G1-D2 `rotateInPlace` nudge 挪位是否符合"原位旋转"预期；G1-D3 6×6 在 320px 屏的折算（待 M2-1）；G1-D4 撤销入口形式 |

### `c52bbd2` · feat: M1-8 接旋转交互入口（选中后再次点击 = 旋转）+ rotate-blocked 抖动

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-15 00:03 |
| 完整 hash | `c52bbd2` |
| 类型 | 新功能（实施计划补记的 M1-8）+ 缺陷修复（core `rotatable` 拦截漏了已放物品） |
| 文件 | `assets/view/shake.ts`（新，45 行）+ `.meta`（新）、`assets/view/GameController.ts`、`assets/view/ItemLayer.ts`、`assets/view/DragController.ts`、`assets/view/PreviewLayer.ts`、`assets/core/session/GameSession.ts`、`assets/core/config.ts`、`docs/05-实施计划-v1.0.md`、`test/session.spec.ts`（10 文件，+251/−28） |
| 要点 | ① **动机（任务表缺口）**：M1 阶段的任务表只有旋转的规则与表现，**没有任何一条任务负责"玩家怎么旋转"**——`rotate` intent 没有触发路径，AC06（旋转 4 次回初态）只在单测里成立，真机上玩家无从旋转。M1-7 复查时补记为 `M1-8`（docs/05 的 M1.B 要点 + M1.C 顺序同步）② **入口**：`DragController.emitTap` 从"只认托盘带"扩到"**托盘优先 + 棋盘已放物品**"（复用 `pickAt`，与起拖同一套命中，不会出现"点得到却抓不起来"）；`GameController.handleTap` 判语义——**再次点击已选中的物品 = `rotate`**，其余 = `select`。依据：UI Spec 6 节「Selected（托盘或已放物品）→ 点击旋转」+ GDD 1.2「点击物品选中，再点击旋转按钮」+ M1.A 表「`rotate` = 旋转按钮或双击」。**用"已选中"判定而不用双击计时器**：计时器有时间阈值竞态（慢一点就变成两次选中），"点已选中的东西"语义稳定 ③ **`rotate-blocked` 抖动**（G1-3 要"抖动反馈清晰"）：抖动实现收进新的 `view/shake.ts`，`PreviewLayer` 一并改用（原来那份是 M1-5/M1-7 两次踩坑后的版本——**停 tween 必须归位基准位**、**基准位不能取当前 position**）。`ItemLayer` 的 `nodes` 现在同时存基准位供抖动归位。该分支**不触发重绘**：core 策略 4 保证"要么提交合法、要么根本没变"，状态没变却重绘会把刚要抖的节点重建掉、抖动无声消失 ④ **core 修复**：`rotatable === false` 的物品**放到棋盘上**原本不受拦截——那条检查只写在"物品还在托盘里"的分支里，已放物品会漏下去走 `rotateInPlace` 四策略，失败时发 `rotate-blocked`（view 抖一下）。**这是误导**：抖动的意思是"周围挡住了、换个地方再试"，真相是"这东西根本不能转"（GDD 1.2「不可旋转时按钮禁用」）。L1 四件物品 `rotatable` 全 `false`，实测点已放物品得到的正是「四策略全失败」 ⑤ `config.ts` 抽出抖动幅度/时长常量（8px / 160ms） |
| 验收 | **L1 四件物品 `rotatable` 全为 false，故临时改为 true 做端到端、验完 `git checkout` 回退**：拖 A 入盘后连点（A 放下即选中，故首次点击就直接转），朝向 **1 → 2 → 3 → 0 四次回初态**（AC06）✓，日志同时打印 nudge 后的新锚点（(0,0)→(0,1)→(1,1)→(1,2)→(2,1)，`rotateInPlace` 四策略会挪位，是 core 既有行为）；构造被围住的局面 → `旋转失败：L01_A（四策略全失败，未提交）` + `[ItemLayer] 抖动 L01_A（转不动）` ✓；回退数据后 L1 真实状态 = **静默** + DEBUG「旋转无变化：L01_A（rotatable=false）」✓（修 core 前这里报的是"四策略全失败"+抖动）。回归测试「不可旋转物品放到棋盘上旋转也被忽略」：**负向验证**拆掉统一拦截后事件变成 `['state-changed','rotate-blocked']`，与 L1 实测的误导行为一致。`npm run check` **201/201**（+1）；`npm run preview:game` 无 Console 错误 |
| 推翻 | 修正 `742ce39` 之后的一个隐含假设：「`rotate-blocked` 说明转不动」——对 `rotatable === false` 的物品，真正的语义是"不能转"，两者必须分开（前者抖动、后者静默） |

### `8a81786` · chore: 加 typecheck:view 把 view 纳入 CI 类型检查

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 23:46 |
| 完整 hash | `8a81786` |
| 类型 | 工程设施（本地检查链扩容，不改运行时行为） |
| 文件 | `tsconfig.view.json`（新，48 行）、`package.json`、`assets/view/GameController.ts`、`assets/view/ItemLayer.ts`、`assets/view/PreviewLayer.ts`、`assets/view/TrayView.ts`（6 文件，+54/−5） |
| 要点 | ① **动机**：view 层此前没有任何静态检查关卡——`tsconfig.node.json` 的 `include` 只有 `assets/core/**`、`tools/**`、`test/**`，**不含 `assets/view/`**，而 Cocos 构建也**不做类型检查**。于是 M1-7 那次 `PANEL_ANIM_MS is not defined`（常量改名漏改）在 `npm run check` 全绿的情况下只在运行时炸，还连带引发五连崩（见 `742ce39` 条目）② **`tsconfig.view.json`（新）**：`extends ./temp/tsconfig.cocos.json`（Cocos 生成的基座，自带 cc 声明文件与 `experimentalDecorators`），`include: ["assets/view/**/*.ts"]`。两处**必须显式重写**的字段：`types`（继承而来的相对路径会以**被继承文件所在目录**为基准解析，留空会指到 `<root>/temp/temp/declarations/*` 而找不到 cc 声明）、`target/lib`（提到 ES2020——view 经 import 会连 core 一起检查，按基座的 ES2015 会给 `BigInt`/`padStart`/`Array.includes` 报一堆假错）③ 7 处 `onLoad`/`onEnable`/`onDisable` 补 `override` 修饰符以过 `noImplicitOverride`（DragController ×2、GameController、ItemLayer、PreviewLayer、SuccessOverlay、TrayView；其中 DragController/SuccessOverlay 两处随 `fcb894e` 一并提交）。引擎侧 TS 为 4.9.5（≥4.3 支持该修饰符，且编译期擦除，不影响构建产物）④ `package.json`：新增 `typecheck:view` 脚本并**编入 `npm run check`**（顺序在 `typecheck` 之后） |
| 验收 | **负向验证**：临时在 `SuccessOverlay.ts` import 一个不存在的常量 `UI_OVERLAY_PANEL_RADIUS_TYPO` → `npm run typecheck:view` exit 2（`TS2724: '"../core"' has no exported member named '…TYPO'`），而同一时刻旧 `npm run typecheck` exit 0、0 错误——**正是这个漏洞本身**。回退后 `npm run check` **200/200** 全绿 |
| 推翻 | 不改既有结论；补充/修正了 `742ce39` 条目里"view 的类型错误只有构建这一关能抓"的说法——现在多了一道 CI 关卡 |

### `fcb894e` · fix: M1-7 复查三处（复玩战绩不刷新 / settle 回调叠加 / 冻结期手势靠残留标志）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 23:45 |
| 完整 hash | `fcb894e` |
| 类型 | 缺陷修复（P1 真缺陷 + P2/P3 健壮性）+ 文档补记（P4） |
| 文件 | `assets/view/SuccessOverlay.ts`、`assets/view/DragController.ts`、`docs/05-实施计划-v1.0.md`（3 文件，+78/−27） |
| 要点 | ① **P1（真缺陷）复玩后战绩不刷新**：`show()` 调 `buildOnce(event)`，后者在 `built === true` 时提前 return，于是「第 N 关」「N 步 · N.Ns」两个 Label 只在**首次**构建时写入。触发路径是 M1-7 自己引入的 `replayLevel()`——同一关会发第二次 `level-cleared`，与注释里"同一关只会发一次"的心智模型冲突。**实测铁证**：第二次通关日志 `🎉 通关！L1 4 步 5.9s`，面板显示首次的 `15.2s`。**修法**：把随事件变化的文案抽成 `applyEvent(event)`，在 `show()` 里**无条件调用**；节点创建仍留在 `buildOnce()`（另把 `levelLabel` 提为字段）。**同类结构预防**：M2 的 `GuideOverlay`（首次引导）/`ConfirmDialog`（重置确认）是同样的懒加载形状，照此办理 ② **P2 settle 回调叠加**：`show()` 现在开头先 `unscheduleAllCallbacks()`——360ms 内二次 `show()` 会叠两个 settle 回调（当前因幂等 + 同关只发一次而无害，但属"碰巧正确"）③ **P3 冻结期手势靠残留标志**：`onTouchStart` 的冻结分支在 `consumedByDrag = false` / `pending = null` **之前**就 return，于是冻结期的 `touchend` 是拿**上一次手势残留的** `consumedByDrag` 判定"点还是拖"——上次恰好是拖拽（通关必由 drop 完成）所以兜住了 select tap，但这与"一条 view 异常 → 五连崩"是同一种病（靠残留状态碰巧正确）。**修法**：按下即 `beginGesture()` 归零（含 `consumedByDrag`），并记 `gestureFrozen = inputFrozen() === true`；**整段手势**（`onTouchMove`/`onTouchEnd`/`onTouchCancel`）据此显式作废。比"清标志"更进一步：通关动画只有 360ms，一个慢手势可能按下时冻结、松手时已解冻，补发意图等于在玩家刚看的结算画面上偷偷改状态 ④ **P4 计划缺口（docs/05）**：补 `M2-10` 完整庆祝动效条目（UI Spec 5.3：回弹 100–180ms → 合盖 250–450ms → 星光 → 按钮可用）——原来只在 M1-7 代码注释里声明"留 M2"，M2 表里没有对应行，容易漏；并在 M2-1 加顺带项：接上关卡加载后要把「下一关」调回**主按钮**、「再来一次」降为**次入口**，第 10 关不出现「下一关」 |
| 验收 | 无头预览合并用例：L1 四拖通关 → 点「再来一次」→ 再四拖通关，两次入场的战绩**各自刷新**（`--grep 浮层入场` 全量对照：第一次 `15.2s`、第二次 `5.8s`；截图面板显示 `4 步 · 5.9s`）→ 冻结期 5 组触摸**零处理**（连 `[DragController] touch` 日志都没有，证明在 `onTouchStart` 就被 gate 挡住，不再依赖残留标志）→ `npm run check` **200/200** → `npm run preview:game` 无 Console 错误 |
| 推翻 | 推翻 `742ce39` 中"同一关只会发一次 `level-cleared`，重复调用是安全的"这一注释所依赖的心智模型——该结论对**单次通关**成立（AC12 由 phase 保证），但漏了 replay 后再来一次 `show()` 的路径 |

### `742ce39` · feat: M1-7 通关判定接线 + SuccessOverlay 通关浮层（WinAnimating 输入冻结）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 22:47 |
| 完整 hash | `742ce39`（见 `git log -1 --format=%H`） |
| 类型 | 新功能（实施计划 M1-7：通关判定 + `SuccessOverlay`）+ 缺陷修复（core 冻结门漏洞） |
| 文件 | `assets/view/SuccessOverlay.ts`（新，331 行）、`assets/view/SuccessOverlay.ts.meta`（新）、`assets/view/GameController.ts`、`assets/core/session/GameSession.ts`、`assets/core/config.ts`、`assets/scenes/Game.scene`、`tools/scene-build.mjs`、`test/session.spec.ts`（8 文件，+563/−14） |
| 要点 | ① **SuccessOverlay（新组件）**：`level-cleared` 事件 → 懒加载构建（节点初始 `active=false`）遮罩 + 白圆角面板 + 「整理完成！」/「第 N 关」/「N 步 · N.Ns」战绩 + 装饰星光 + 「再来一次」按钮；入场动画 = UIOpacity 淡入 200ms + 面板 scale 0.8→1.06→1 弹跳（220+80ms），360ms 收敛后经 `onSettled` 回调调 `session.completeWinAnimation()` 把 phase 推到 `Completed`——**冻结的解除时机在 view 手里**（core 不自己数时间）；`settled` 之前按钮不响应。**「下一关」不建按钮**：M1 没有关卡推进机制（M2-1 才做关卡加载），建不做事的按钮 = UI Spec 明令禁止的空按钮；留 `onNextLevel` 扩展点。全项目第一处 `Label` 文本，默认系统字体中文可渲染已实证 ② **GameController 接线**：`afterDispatch` case `level-cleared` → `show()`；`onReplay` → `replayLevel()` 换同关新 `GameSession` + 重画棋盘 + init 三层 + `refreshAll` + 隐藏浮层——**不走 `dispatch({type:'reset'})`**（reset 在 WinAnimating/Completed 被 `isInputFrozen` 故意冻结，防浮层盖住工具栏时误重置抹掉通关态；浮层自身按钮是明确意图，另走换会话），并重挂 `wireDrag`（其 `boardItemAt` 闭包捕获旧 `level`，换关卡时不重挂会用旧关物品表查命中）③ **core 缺陷修复**：`handleDrop`/`handleCancel` 补冻结门。两者的"无预览清理分支"本来就会改写 phase（回 Idle/Selected）——`handleSelect`/`handleGrab`/`handleRotate`/`handleRemoveToTray`/`handleUndo`/`handleReset` 六处都有门，唯独漏了这两条**清理路径**（提交路径 196-198 行有防护，清理路径没有）。后果：通关动画期间任何残留的 drop/cancel 意图都会把 phase 从 WinAnimating 打回 Idle/Selected，"已通关"状态被抹掉、输入提前解冻 ④ `tools/scene-build.mjs`：`SuccessRoot`（UITransform 390×844 + SuccessOverlay）作 SafeAreaRoot **最后一个**子节点（渲染序最上 = 盖住棋盘/托盘/预览层），GameController 接 `successOverlay` 引用；`config.ts` 追加 6 项浮层布局常量（遮罩 alpha 0.55 / 面板 280×300 圆角 24 / 按钮 200×48） |
| 验收 | 无头预览合并用例一次通过：L1 四拖通关（`L01_A→(1,1)`、`L01_B→(1,0)`、`L01_C→(2,1)`、`L01_D→(0,0)` 铺满 3×3，`grabOffset=(0,0)`）→ `🎉 通关！L1 4 步 15.5s → SuccessOverlay` + 浮层截图（遮罩/面板/中文/战绩/星光/按钮俱全）→ **WinAnimating 冻结期拖拽零意图**（只有原生触摸事件，无 `→ intent`）→ 点「再来一次」→ `再来一次：L1 新会话` + `重绘：tray=[L01_A..D] 已放 0 件 phase=Idle` + 截图（空棋盘满托盘）→ 复活后再拖 A 仍精确落 (1,1)。回归测试：`WinAnimating 期间残留的 drop / cancel 不得改写 phase`（负向验证——拆掉 `handleDrop` 冻结门后该用例以 `expected 'Selected' to be 'WinAnimating'` 失败，与线上事故症状一致）。`npm run check` **200/200**，`npm run preview:game` 无 Console 错误 |
| 推翻 | 推翻 `6cefd4a` 之后无——但本提交揭示了 core 的一处既有缺口：M1-0 起 `dispatch()` 的冻结覆盖从来不全（六处有门、两处清理路径没有），此前未暴露只因没有"通关后仍有意图打进 core"的路径。M1-7 补全并加回归测试钉死 |

### `6cefd4a` · fix: PreviewLayer 停抖动后归位节点（非法松手 160ms 内连抓会留下 8px 偏移）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 17:43 |
| 完整 hash | `6cefd4a`（见 `git log -1 --format=%H`） |
| 类型 | 缺陷修复（M1-6 交付时记录的潜在小 bug：PreviewLayer 抖动被打断后的节点残留偏移） |
| 文件 | `assets/view/PreviewLayer.ts`、`tools/preview-check.mjs`（2 文件，+65/−9） |
| 要点 | ① `show()`/`endPreview()` 原来只 `Tween.stopAllByTarget(this.node)` 不重置 `node.position`：抖动是位移 tween（±8px/160ms），被打断时节点留在中断帧偏移上，而 ghost 按本节点局部坐标绘制 → 整场 ghost 跟着偏；`shakeAndClear` 又以当前位置为基准，偏移被下一次抖动"继承"、越叠越偏。**修复**：`onLoad` 存 `basePosition`，新增 `stopShake()`（停 tween + 归位），`show()`/`endPreview()` 改走它；`shakeAndClear` 基准位改取 `basePosition` ② `preview-check.mjs` 新增 `--gap`（拖拽后等待，默认 600ms）与 `--drag-wait`（touchStart 后等多久发首个 move，默认 120ms）两个时序旋钮——合成输入管线有 ~34ms 投递延迟，默认节奏够不到 160ms 抖动窗口；DEBUG 日志加 `performance.now()` 时间戳（ghost/抖动起播/抖动播完/原生触摸事件）供时序取证 |
| 验收 | 机械证据（同一手势序列同一时序，唯一差别是修复）：修复前抖动开始后 91ms 连抓 → `nodePos=(2.78,68)`；修复后同样 91ms 中断 → `nodePos=(0,68)`。回归：默认时序下非法松手抖动仍完整播完（174ms，帧量化后）；`npm run check` 199/199，`npm run preview:game` 无 Console 错误 |
| 推翻 | 无 |

### `96ca176` · feat: M1-6 意图接线 dispatch（状态驱动视图刷新）+ ItemLayer 防幽灵

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 14:58 |
| 完整 hash | `96ca176`（见 `git log -1 --format=%H`） |
| 类型 | 功能（M1-6：可玩内核第 7 步 · 意图接线与状态驱动刷新） |
| 文件 | `assets/view/ItemLayer.ts`（新）+ `.meta`（新）、`assets/view/DragController.ts`、`assets/view/GameController.ts`、`assets/view/TraySlot.ts`、`assets/view/TrayView.ts`、`assets/scenes/Game.scene`、`tools/scene-build.mjs`（8 文件，+400/−173） |
| 要点 | ① 新增 `ItemLayer`（挂 BoardRoot 与 BoardView 同节点）：按 `state.placements` **全量重绘、先清后建**，「无幽灵物品、无重复占位」成为机制保证；拖拽中 `setHiddenItem` 排除被拖物品（`grab` 不改 state，不排除就会原位再画一份 + 手指处 ghost 两份并存）；格→像素全走 `BoardView`（R-A6）② `DragController` 挂具全接真：`onIntent → handleIntent → session.dispatch`（唯一改状态入口）；`previewProvider` 挂具 → `previewSource` 直读 `session.getPreview()`（view 不再用 `canPlace` 复刻合法性——两份真相必然分叉）；新增 `inputFrozen`（通关动画期冻结手势，M1-7 生效）；`onTap` 并进同一入口 ③ `GameController.afterDispatch` 单向数据流总闸：只对**真·改状态**事件触发 `refreshAll`（`placement-committed/item-returned/undo-applied/level-reset/item-rotated/rotate-blocked`）——`state-changed` 每次 dispatch 都带（`move` 也带），拿它当触发器会每移一格全盘重建；`placement-rejected/deadlock-warning` 走 Console（M2-4 Toast 挂点）；`level-cleared` 落日志（M1-7 接 SuccessOverlay）；删启动时 `debugSnapshot` 行 ④ `TraySlot/TrayView` 加 `setHiddenItem`（托盘起拖时那件还在 `state.tray`，同理排除）；`render` 改用 `markOverflow` 记录溢出态，与拖拽排除分开（否则恢复显示会把缩小的溢出 slot 放出来）⑤ `scene-build.mjs`：BoardRoot 增挂 ItemLayer，GameController 接 `itemLayer` |
| 验收 | 无头预览 13 连快速拖拽压力用例：12 次状态转移全部正确（放入↔取出完美交替），第 4 次 L01_B 落到已占格被正确拒绝（`放不下：overlap，状态未变、不入撤回栈` + ghost 抖动后清），状态零错乱；拖拽全程「拖拽中排除」日志在、无幽灵；终态截图证实 L01_A@(1,0)/L01_B@(0,2) 各就各位、托盘正确减至 2 件；`npm run check` 199/199，`npm run preview:game` 无 Console 错误 |
| 推翻 | 无 |

### `3c5448f` · feat: M1-5 拖拽预览层（PreviewLayer）三态 ghost + 非法回弹

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-10-14 12:25 |
| 完整 hash | `3c5448f`（见 `git log -1 --format=%H`） |
| 类型 | 功能（M1-5：可玩内核第 6 步 · 拖拽预览层）+ DragController 锚点抖动修复 |
| 文件 | 7 个：新增 `assets/view/PreviewLayer.ts(+.meta)`；改 `assets/view/{DragController.ts,GameController.ts}`、`assets/scenes/Game.scene`、`tools/{preview-check.mjs,scene-build.mjs}` |

**要点：**

- **`view/PreviewLayer.ts`（新增）**：拖拽预览层，三态 ghost。
  - **合法**（`preview.check.ok === true`）→ 半透明绿色实心块 + 实线描边（`UI_PALETTE.valid`，填充 alpha 0.4）。
  - **非法**（`ok === false`）→ 红色**虚线**轮廓、无填充（`UI_PALETTE.invalid`）。**不单靠颜色**：合法是实心块、非法是空心虚线，形状本身就能区分（TDD 17.5 无障碍要求）；且不自动纠偏（TDD 6.3 裁决 D-04）——只提示不代劳。
  - **取出**（手指在托盘带内）→ ghost 隐藏。这一态由 `DragController.overTray` 几何判定（不是碰撞），本层只据此决定画不画。
  - **view 不自查碰撞**（M1-5 验收口径）：合法性 100% 来自 `preview.check`，本组件从不调 `canPlace`。M1-5 阶段 `preview` 由 `GameController` 的挂具构造（用 `canPlace` 算 check），**M1-6 一接线就换成 `session.getPreview()`，本组件一行不动**——因为 `DragPreview` 形状不变。
  - **不做格→像素算术**（R-A6）：`gridToLocal` / `shapeMetrics` / `getCellPx` 全从 `BoardView` 拿（唯一出口），本文件只做"以单格为尺子的绘制细节"（内缩/圆角/虚线），与 `ItemView` 同构。
  - **非法松手抖动回弹**（P-05 区间 120–180ms 取 160ms）：ghost 左右抖 ±8px 再消失，作为"放不下"的负反馈。合法/取出/主动取消都不抖（抖动专属"放不下"）。完整的"物品飞回原位"动画要等 M1-6 的 `ItemLayer`（那时才有节点可飞）。
- **`view/DragController.ts`（改）**：接预览——新增 `onPreview` 回调（拖拽中喂预览）+ `buildPreview` 回调（构造 `DragPreview`，M1-5 由 GameController 挂具用 `canPlace` 算 check，M1-6 换 `session.getPreview()`）；`grab`/`move` 后喂预览，松手按语义调 `endPreview`（`drop`→合法则清/非法则抖，`cancel`→清，`removeToTray`→清）。
- **修复 `beginDrag` 锚点抖动**：grab 锚点改用**按下点**算（与 offset 同源），而非过阈值时的 move 点。之前格中心附近 `snapToGrid`（round）不稳定，会让 grab 锚点跳到 `[0,-1]` 而 ghost 一开始就画错位。**board 抓取改用 `localToGrid`（floor）**，避免 `snapToGrid`（round）把格中心的点命中到右下斜邻格（按物品中心根本抓不起来）；**move 锚点仍用 `snapToGrid`（TDD 6.3 裁决不变）**。
- **`view/GameController.ts`（改）**：加 `previewLayer` @property；`buildPreview` 挂具用 `canPlace` 算 check 构造 `DragPreview`；接三路预览回调（`onPreview`/松手合法/松手非法）。
- **`tools/scene-build.mjs`**：新增 `PreviewRoot` 节点 + `PreviewLayer` 组件（`boardView` 引 `BoardRoot`），`GameController` 接 `previewLayer`。
- **`tools/preview-check.mjs`**：`--drag` 第 5 段可选截图路径（`x1,y1,x2,y2,out.png`，在 touchEnd 前拍），用于验 ghost 中途态。
- **验收证据（`npm run check` 199/199 全绿 + `npm run preview:game` 无 Console 错误）**：
  - **三态**：合法拖拽 → ghost 显示 `ok`（截图见半透明绿实心块）；非法拖拽 → ghost 显示 `out-of-bounds`（截图见红虚线轮廓）；拖回托盘 → ghost 隐藏（取出态）。
  - **非法回弹**：非法位置松手 → `endPreview invalid=true → 抖动后清`。
  - **T1/T2 角点不变量复验通过**（确保 beginDrag 改动没回退 M1-4）：同一落点 (195,354)，抓左半 `offset=(0,0)` → 末锚 `[2,2]`；抓右半 `offset=(0,1)` → 末锚 `[2,1]`，差值恰为 offset 差值。

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
