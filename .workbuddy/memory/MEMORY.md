# 项目长期记忆 —— 《行李箱装不下啦！》

> 跨会话约定与手法；日常写 `YYYY-MM-DD.md`。M2（M2-1~M2-11）全收官；M3-1/M3-2 微信构建落地（首包 3.24MB 过 G2）；M3-1 真机校准 ghost 上浮清零；M3-3 手感 ✅（iPhone 15 Pro 393pt）；M3-5 短屏适配 ✅（`e4ae76d`，压缩阶梯接运行时）；M3 微信音频后端 ✅（`27af802`）。M4-3 复审四条已收官（`27cb1c9`+`2706255`）。

## 当前阶段
- **美术资产 63/63 已达成**（`22e04da`）：L1~L10 全部就位（L6~L8 由 `7918b4c`+`83d456a`、L9/L10 由 `22e04da`）。`check:art`：应交付 63｜已合格 63｜覆盖率 100%，PNG/`.meta` 各 63 完全配对。9 条 ⚠️「外缘 1px 环带」只在 L4/L5 老异形件（M4-6c 邻空格 1px 出血防切，@2x 0.5px，良性）。出图流水线 `tools/art-batch-proc.mjs` 已定型。
- **资源提交手法（硬教训）**：`.meta` 必须**等 Cocos 编辑器扫描生成后与 PNG 一起提交**（spriteFrame 的 alpha 剪影/顶点/UV 只能编辑器算，手造必错）。流程：放 PNG → 开编辑器 → meta 出 → `git add` PNG+meta 一次提交。健康判据：134 行 + 3 uuid + 1 `"importer": "image"`。对照：`7918b4c` 漏 meta → `83d456a` 补交（两步）。
  **改图内容必须重导入 meta**：覆盖 PNG 后若 meta mtime 不变，spriteFrame 仍按旧剪影裁切（`c254e9e` 四张残缺图即此坑）。`touch` 不触发 AssetDB；有效手法 = `osascript -e 'tell application "CocosCreator" to activate'` 激活窗口刷新。验证：解码 PNG alpha 外接矩形 == meta 的 trimX/trimY/width/height 才算一致。
- **M4-4 已收官**（`0e97260`）：UI 插画 3 张（`ui/home-hero` 560×400、`ui/suitcase-open` 780×780 **俯视开口**、`ui/suitcase-closed` 780×780 同轮廓）+ 音效 4 个 WAV（`tools/synth-sfx.py` 离线渲染）。其余 5 类组件**定案程序化**；口径「一件东西的画像→出图，会变形的容器/状态机→程序化」（docs/03 §7.2）。
- **M4-5b 已收官**（`6b5176a`+`55a879c`）：把 M4-4 的 3 图 + 4 WAV 真接入——新增 `view/uiAssets.ts` 加载器、`AudioAdapter` 由 WebAudio 合成改 `AudioSource` 播 WAV（音量 `SFX_MASTER_GAIN`=0.22）、`BoardView` 接 `suitcase-open` 底板、`SuitcaseLid` 改 `suitcase-closed` 精灵合盖、`HomeController` 顶部接 `home-hero`、`config.ts` 新增 `UI_SUITCASE_FRAME_RATIO`=0.76。不动 core 玩法。
- **待办**：终版包体复核 ✅（2026-10-22 微信包干净重建实测 **2,938,813 B / 2.94MB**，低于 G2 线 3.5MB，余量 548KB，68 PNG+4 WAV）；**M3-5 短屏适配 ✅**（`e4ae76d`）；prop_04_D 探线、A-02 裁决待回签。全 10 关视觉集成 ✅（2026-10-21：逐关换关无头取证，L1–L10 全部零 Console 错误、画面非空，截图见 `/tmp/levelshots/`）。

## 工程基线
- Cocos Creator 3.8.8（锁 `/Applications/Cocos/Creator/3.8.8/`）；设计 390×844 + Fit Width。
- 分层：`core/`（零 cc、Vitest）↔ `view/`（唯一 import 'cc'）；core 只从 `index.ts` 对外（R-A3）。守卫 `npm run check:arch`：R-A1/R-A6/R-A9/R-A10。参数只改 `config.ts`。
- 交付纪律：① `npm run check` ② `npm run preview:game` 零 Console 错误 ③ 双绿才提交、CHANGELOG 倒序一条。

## 短屏适配（M3-5，`e4ae76d`）
- **架构**：`core/config.ts` 出纯函数 `maxBoardOf` / `selectLayoutBand` / `resolveLayout`（+`ResolvedLayout`、`UI_LAYOUT_BANDS` L0–L4、`UI_MAX_BOARD`=6×6）；`view/layout.ts` 是**运行时单例**（`detectVisibleDesignHeight()` → `initLayout(maxBoard)` → `getLayout()`），BootController/GameController 的 `onLoad` 早期初始化，保证早于任意视图 onLoad。
- **选型规则**：逐档查「设计格边长 + 320px 折算值」是否都 ≥ 该档 `cellMin`（前档够用不动后档），全不满足回退末档 L4（cellMin=40，须真机复测+ADR）。可见设计高 `effectiveHeight=min(可见高,844)`：长屏封顶 844 走 L0，短屏用实际高触发压缩。
- **三横带中心不再写死**：旧 `UI_BOARD/TRAY/TOOLBAR_BAND_CENTER_Y` 已删；中心由 `resolveLayout` 按带高 + `±effectiveHeight/2` 推导（`boardBandCenterY=(tray+toolbar−header)/2`、`toolbarBandCenterY=−(half−toolbar/2)`、`trayBandCenterY=−(half−toolbar−tray/2)`、`topBandCenterY=half−header/2`）。改带高时中心自动跟随。
- **实测**：390×844 → L0（棋盘 3×3=114px 无回归）；320×568 → 可见设计高 692.25 → **L1（托盘 160→128）**，两档均零 Console 错误、版面三带完整无溢出。
- **坑**：`view` 的 `screen` TS 类型不可靠 → `(view as {getVisibleSizeInDesignResolution?:...}).…?.()` 显式收窄 + try/catch，退路才是 `screen` 比值。布局单测 `test/layout.spec.ts` 14 例（含 L0 中心与原常量一致的回归断言）。

## 首包体积
- 裁引擎模块（`settings/v2/packages/engine.json`）：3.236MB → 2.15MB；M4-5a 真图接入后 = 2,253,262 B / 104 文件，63 图齐预测 ≈2.41MB，远低于 3.5MB 线。坑：改 JSON 后必须 `node -e "JSON.parse(...)"` 校验；图片 16 色量化 → ~11.7KB/张。
- **实测（2026-10-22 干净 wechatgame 重建）**：**2,938,813 B / 2.94MB**（十进制，对齐 G2 口径），G2 线 3.5MB，**余量 548KB** ✅。分项：cocos-js 1487KB / assets 1198KB / web-adapter 88KB / src 28KB。235 文件（68 PNG 含 63 道具+3UI+logo+slogan、4 WAV）。

## 出图流水线（docs/07 §5.11，`tools/art-batch-proc.mjs`）
- ImageGen 给不出透明底（transparent 仍 colorType 2 无 alpha）→ 规程：纯白底生成 → 阈值抠底（近白 min≥205 且彩度≤26，只挖与画布边缘连通域）→ 光晕反解 unflatten → 碎块剔除（≥最大连通域 6%）→ 面积平均缩放（预乘 alpha：分子 0–255、分母 0–1）→ 居中合版 → 16 色量化 + alpha 16 级。
- 子命令：`fit <file> <itemType> <W> <H> [margin]`、`mask`、`guide`、`compose <itemType> 'r,c,h,w=part.png' [...]`（按格分块拼版，异形件无切割）、`contact-sheet`、`info`、`palette`。
- 三条硬教训：① 投影只能在提示词里禁（`no ground shadow`）；② 并行出图同秒撞名覆盖 → 每张独立 output_dir + 立刻改稳定名；③ 家族色写死色号，只写「R 深」会漂出家族。
- AI 件**不产 SVG**（模型只出位图）：源 = `art/art-source/props/ai/<itemType>.prompt.md`；原图留档 `art/previews/props/<itemType>_reference.jpg`（512 长边 JPEG，sips）。UI 插画同规则，落在 `art-source/ui/ai/` + `art/previews/ui/`。
- **索引色 PNG（`encodeIndexedPNG`，M4-4）**：`fit` 写盘自动优先 colorType 3 + PLTE + tRNS（1 字节/像素；超 256 色回落真彩，`--rgba` 强制真彩）；已交付图用 `optimize <文件|目录>` 无损重编码。实测 props −32%、`suitcase-closed` −65%。
  **坑（必须记住）**：索引色每个调色板项只有一个 alpha。让所有 α=0 共用 `(0,0,0,0)` 槽位 → 透明区 RGB 全黑 → 双线性采样把实色和黑混合，**物体外缘描一圈黑边**。必须把透明像素 RGB **吸附到最近实色**（bleed）。验证法：统计「紧邻实色的透明像素」近黑占比，应为 0%。
  `check-art.ts` 解码器已支持 colorType 3，否则索引色图会被误判「非 RGBA」全阻塞。

## 引擎关键限制
- Sprite 三事实：① 一节点一 renderable（Graphics 占 `_uiProps.uiComp`，Sprite 必须挂子节点）；② `spriteFrame` setter 按 sizeMode 跑 `_applySpriteSize`，先设 `type`/`sizeMode=CUSTOM` 再设 frame；③ 自动图集运行时重建 `rect` → trim 偏移只用 `frame.offset` 反解（`left=画布宽/2+offset.x−trim宽/2`、`top=画布高/2−offset.y−trim高/2`），禁 rect.x/y。
- `Graphics.arc(cx,cy,r,s,e,ccw)`：`ccw=false` 画补集，画标称区间传 `true`。局部 y 向上，`roundRect` 的 y 是下边缘。
- tween 范式 + repeatForever 入口幂等（先 stopAllByTarget）；Cocos 触摸派发给所有命中节点 → 整屏挡触摸须 `event.propagationStopped=true`；全局 input.on(TOUCH_START) 收不到，用节点级。

## 无头预览取证（tools/preview-check.mjs）
- 构建 env：`ELECTRON_RUN_AS_NODE`、`ELECTRON_DISABLE_SANDBOX=1`；退出码恒 36，以 `build Task (web-mobile) Finished in` 判成功；Chrome `--no-sandbox --no-zygote`。`--reload` 同 profile 页内重载。
- 三套坐标：页面 CSS / 世界（y 自下，uiY=844−pageY）/ 设计（world−(195,422)，页面=design+(195,422)）。`--shot` PNG dpr=2（780×1688）。
- 改 `Game.scene` 的 `levelId`（第 841 行）换关：必须用 **Node 写文件**替换该行（`sed -i ''` 在 bash 脚本里会把替换式当成文件名而失败，导致场景没改、所有关都截到同一关）；增量构建 ~30s 即吃到改动，无需清缓存。核验靠 `preview-check` 退出码 0 **且** Console `载入 L<n>` 与目标关匹配（防偶发吃缓存）。跑完 `git checkout -- assets/scenes/Game.scene` 复位。截图分辨率 780×1688（dpr=2）。

## 微信小游戏构建（wechatgame）— 关键坑
- **增量重建会吃旧缓存 → 空包**：2026-10-22 用户 GUI 手动重建后，`build/wechatgame` 只有 8 个 `.js`、**0 张 PNG**（`resources/index.js` 605B 空壳），游戏导入后无图。根因：**复用旧的 `resources` bundle 缓存**（旧包早于 63 图加入），新资源没编译进 bundle。
  **修复/必做**：重建前**务必先删除 `build/wechatgame`**（干净目录）再构建；增量构建不可靠。**对照实验已证实**：`packAutoAtlas=true` + 全新目录 → 68 PNG ✅；`packAutoAtlas=true` + 旧目录 → 0 PNG ❌。所以**根因是旧缓存，不是 auto-atlas**——清空输出目录即可，auto-atlas 开关无妨。
- **无头构建可用**（与 web-mobile 同机制）：`CREATOR` + `--project . --build "platform=wechatgame;debug=false;startScene=<Boot.uuid>;orientation=portrait;appid=wx6ac3f5090a6b99c5;separateEngine=false;packAutoAtlas=false;inlineEnum=true"`；env 同 preview（`ELECTRON_DISABLE_SANDBOX=1`、删 `ELECTRON_RUN_AS_NODE`）。成功判据日志 `build Task (wechatgame) Finished in`，退出码 36 正常。stderr 里 Cocos 删自己缓存被沙箱拦属误报、非致命。
- **两个新坑（2026-10-22 下午）**：① `--build` 的 `buildPath=build/xxx` **被忽略**——Cocos 始终写构建档默认输出目录（即 `build/wechatgame`），所以想用全新目录强制全量编译行不通；② 受沙箱**批量删除守卫**限制（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`，阈值 50 文件），`rm -rf build/wechatgame`（无论 shell 还是 Node `fs.rmSync`）都会被拦。综合结论：对已是「干净 2.94MB 构建」的 `build/wechatgame` 做**增量重建**即可（重编译改动的 TS、resources bundle 保持正确）；只有当初包彻底坏掉（如旧缓存空包）才需 GUI 内 Clean 构建或放行删除守卫。增量重建仅 ~4s（脚本包重编）。
- 资源落点：Cocos 3.8.8 把 sprite 像素放 `assets/resources/native/<uuid>.png`、元数据放 `assets/resources/import/<uuid>.json`，`resources/index.js` 仅 605B 引导壳（不要误判为「空包」）。
- **appid 仍为 Cocos 游客号 `wx6ac3f5090a6b99c5`**：本地/真机预览可用，**提审前必须换成真实小游戏 appid**（微信公众平台注册）。

## 微信音频后端（M3 / R-A4，TDD 11.3）— 2026-10-22 落地
- **背景**：M4-5b 后 `AudioAdapter` 走 Cocos `AudioSource`（Web 端 WebAudio 后端），**微信端无 `wx` 分支 → 静默**（M2-9 即定「M3 按 TDD 11.3 换 wx API，R-A4 收进 platform 目录」）。
- **做法（R-A4 平台隔离）**：新增 `assets/view/platform/` —— `SoundBackend.ts`（接口）+ `web/SoundBackend.ts`（Cocos `AudioSource.playOneShot`，保留 M4-5b 已验证行为、常驻 `SfxPlayer` 节点）+ `wechat/SoundBackend.ts`（`wx.createInnerAudioContext`，吃 `AudioClip.nativeUrl`，每次播放新建、播完 `onEnded`/`onError` 即 `destroy`）+ `index.ts` 按 `cc/env` 的 `WECHAT` **编译期常量**路由（未命中分支死代码消除，Web 包不含 `wx`）。`AudioAdapter` 把「调度/静音闸/缓存/跨场景」与「发声」解耦，公共 API（`play`/`setMuted`/`stopAll`/`preload`/`isMuted`）与 5 个调用点**零改动**。
- **验证**：`check:arch`（无违规）+ `typecheck:view`（0 错）+ `test`（340/340）+ `preview:game`（Web 包零 Console 错误，音频 `已载入` 日志正常）；无头 wechatgame 增量重建后 `build/wechatgame` = 235 文件 / 2.94MB / 68 PNG+4 WAV 无回归，且 `createInnerAudioContext` 与 `nativeUrl` **已进入微信包 JS**（证明 WECHAT=true 路由生效）。
- **未能在此环境验证**：真机实际出声（无 `wx` 运行时）。`wx.createInnerAudioContext` 直吃 `nativeUrl` 是 TDD 11.3 标准做法，已加 `DEBUG` 日志打印 URL 便于真机排查；真机「首次播放须用户手势」已满足（所有 `play()` 都在触摸回调里）。提审前需在真机冒烟。

## 交互/拖拽约定
- 场景真相源 `tools/scene-build.mjs`；注入序 toolbar→guide→dialog→toast 在 startLevel 前。
- 通关浮层：下一关粉实心(195,482)、再来一次白描边(195,540)、面板 280×340。
- 托盘 0 号槽中心 = (62,668)；grab 锚点：盘上=按下点、托盘=当前手指位；ghost 上浮=0。
- L1 四拖：A→(299,344)落(1,1)；B→(71,458)落(1,0)；C→(299,458)落(2,1)；D→(185,230)落(0,0)。

## M4 美术规格（docs/07 第 5 节 V1.2）
- 5 色相家族：C 织物 `#E5E5E5`/`#D4CFCD`、R 粉 `#FFE0E7`/`#FA91A8`、M 青 `#BCEAD5`/`#87CBB8`/`#559E91`、B 蓝 `#BDE4F7`/`#8FBBD9`、N 褐 `#C2A28A`/`#7A5C4F`。结构：浅主填充+深 accent。
- 逐关分配：≥3 家族/关、同家族 ≤2、≥1 重色（L<0.6）。UI 调色板见 docs/03 §4（bg `#FFF8EE`、accent.pink `#FA91A8`、surface.cream `#FFE7AD`、brown `#7A5C4F`、valid `#50B88A`、invalid `#E56B77`）。
