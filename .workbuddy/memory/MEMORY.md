# 项目长期记忆 —— 《行李箱装不下啦！》

> 跨会话约定与手法；日常进展写 `YYYY-MM-DD.md`。M2（M2-1~M2-11）已全部收官；M2-11 复审两条 [低] 已修复（`8fc62a7`）。M3-1/M3-2 微信构建已落地（首包 3.24MB 过 G2）；M3-1 真机校准：拖拽 ghost 上浮清零（`56a27a0`）；M3-3 手感 ✅（机型 iPhone 15 Pro 393pt）。**M4-2 定稿**：色彩板/明度阶梯/提示词包 V1.2（实测锚定 5 色相家族 + 63 件逐关分配 + A-02 裁决待回签）。素材 25/63（L1~L5 全齐）；**出图链路已定型**：`tools/art-batch-proc.mjs`（纯白底→阈值抠底→面积平均缩放→居中合版→16 色量化）+ `tools/art-contact-sheet.mjs` + `check:art`，规程见 docs/07 §5.11。缺 38 张（L6 未开、L7 差 7、L8~L10 全部）；prop_04_D 探线与 A-02 回签待用户裁决；UI 7 类 + 音效 + 代码接线未动（M4-4/M4-5）。

## 工程基线
- Cocos Creator 3.8.8（锁版本 `/Applications/Cocos/Creator/3.8.8/`）；设计 390×844 + Fit Width。
- 分层：`core/`（零 cc、Vitest）↔ `view/`（唯一可 import 'cc'）；core 只从 `index.ts` 对外（R-A3）。守卫 `npm run check:arch`：R-A1 core 无 cc；R-A6 格算术只许 `BoardView.ts`+`config.ts`；R-A9 assets 只放运行时资源；R-A10 禁 `[...x]` 展开（一律 `Array.from`）。
- 参数只改 `config.ts`，禁魔法数字。
- 交付纪律：① `npm run check` ② `npm run preview:game` 零 Console 错误 ③ 双绿才提交、CHANGELOG 倒序一条；提交前 `git status` 避用户在途 `prop_02_*.png`。view 类型检查用 `tsconfig.view.json`（显式 types、ES2020）；`onLoad` 等需 `override`。

- **首包体积靠裁引擎模块**（M4-3）：`settings/v2/packages/engine.json` 的 `includeModules`/模块开关砍零引用模块（physics-2d、spine、spine-3.8、dragon-bones、video、webview、tiled-map、particle-2d、mask、rich-text…），3.236MB → **2,149,729 B = 2.15MB**，63 图齐预测 ≈2.46MB（远低于 3.5MB 线）。坑：`physics-2d-box2d` 已是 false（脚本要容忍匹配）、末项无逗号、删倒数第二项留尾逗号致 JSON 非法 → 改完必须 `node -e "JSON.parse(...)"` 校验。图片压缩（PLTE 优化等）只省 ~15KB，**不是有效手段**。
- **美术验收必须查 alpha**（M4-3 阻塞-1 根因）：`npm run check:art` 原只验尺寸/命名/朝向，不验透明底 → 11 张 `#E5E5E5` 满幅灰底图蒙混入库（占位色块底色同色，预览里看不出）。现已加「四角 α=0 + 覆盖率上限」。抠图手法（只有 3 张有 SVG 源）：边缘紧容差洪水填充（容差 8）+ 光晕 α 恢复（按灰度反推，不二值化）+ 共线性保护；修后覆盖率 28–54%。
- **出图流水线（M4-3 批次起，docs/07 §5.11）**：本机 ImageGen **给不出透明底**——`background=transparent` 仍返回 colorType 2 无 alpha RGB，甚至把棋盘格画进像素。规程：纯白平坦底生成 → **阈值抠底**（近白 min≥205 且彩度≤26，**只挖与画布边缘连通的连通域**；渐变底上全局容差洪水填充必失效）→ 光晕反解 unflatten → 碎块剔除（≥最大连通域 6%）→ 面积平均缩放（**预乘 alpha：分子 0–255、分母必须 0–1**，写错整图变黑）→ 居中合版 → **16 色量化 + alpha 16 级**（不量化 36KB/张会顶 3.5MB 线；量化后 11.7KB，肉眼无差）。三条硬教训：① **投影只能在提示词里禁**（`no ground shadow`），自动去投影会把 C 家族 `#E5E5E5` 织物当投影吃掉；② **并行出图同秒撞名互相覆盖**，每张必须独立 `output_dir` 并立刻改稳定名；③ 家族色必须**写死色号**，只写「R 深」会漂成深枣红掉出家族。

## 引擎关键限制（踩过的坑）
- **`Graphics.arc(cx,cy,r,start,end,ccw)`：`ccw=false` 画的是 `[start,end]` 补集**（`false`=从 start 顺时针角度递减扫过去，扫出另一半）；**`true` 才是标称区间**。要画弧一律传 `true` 给标称区间。M2-9 两处踩坑（喇叭声波弧、锁徽标锁梁圆心在下边缘）。验弧用像素级角度直方图：**先径向剖面定性**（双峰=两弧，填充体会污染），再角度定量；探针盒心放弧圆正上/正下方。Graphics 局部坐标 **y 向上**，`roundRect` 的 y 是**下**边缘。
- 一节点一 renderable：多组绘制复用同一 Graphics 或建子节点。
- tween 范式 `tween(node).to().delay().repeatForever().start()`；停动画 `Tween.stopAllByTarget` 且**结束值恒为静止位**。**repeatForever 入口必须幂等**：开头先停旧动画（target 是节点/组件各一行——opacity tween 的 target 是 `UIOpacity` 不是 node），`SuccessOverlay` 的 playEntrance/playSparkle/stopSparkle 三处同构（M2-11 复审补上 playSparkle）。
- `completeWinAnimation()` 幂等；`SuccessOverlay.show()` 开头 `unscheduleAllCallbacks`。
- 懒加载 `built` 提前 return 必须抽 `applyEvent()` 无条件入口（防复玩不刷新）。
- **Cocos 触摸派发给「所有」命中节点**：整屏节点挡触摸必须显式 `event.propagationStopped = true`（3.8.8 无 `stopPropagation` 方法，只有标志位）。触摸三事实：全局 `input.on(TOUCH_START)` 收不到（用节点级）；触摸由最深节点认领、松手不在内→引擎改 `TOUCH_CANCEL`（监听挂覆盖整屏的 SafeAreaRoot）；必须 `touch-action:none`。

## 无头预览与取证（preview-check.mjs）- 构建：`env -u ELECTRON_RUN_AS_NODE`、`ELECTRON_DISABLE_SANDBOX=1`；编辑器退出码恒 36，以 `build Task (web-mobile) Finished in` 判成功。Chrome 须 `--no-sandbox --no-zygote`。`--grep` 纯子串；`--gap/--drag-wait` 全局单值只作用于 drag 后等待；Console 段只印后 80 行。
- **微信小游戏构建（M3-1）**：同款 env + `--build "platform=wechatgame;startScene=<Boot uuid>"`，4 秒出 `build/wechatgame/`；启动场景真相在 `src/settings.json` 的 `launch.launchScene`（startScene 参数不是来源）；3.8.8 默认 `libVersion: widelyUsed`（M3-2 自动满足）；appid 是游客号 `wx6ac3f5090a6b99c5`（可预览不可上传）；`cli open --project build/wechatgame`（`/Applications/wechatwebdevtools.app/Contents/MacOS/cli`）需先在 IDE 安全设置开服务端口。
- 三套坐标：`--tap/--drag`=CSS 页面；世界坐标 y 自下（`uiY=844−pageY`）；设计=world−(195,422)。**`--shot` PNG 是 dpr=2（780×1688）**，页面值 ×2 换算。`getLocation` 是设备像素别对设计值。
- 设计→页面：`pageX=195+designX`、`pageY=422−designY`。
- **改 `Game.scene` 的 `levelId` 换关（第 841 行），构建偶发吃缓存跑旧关**：必须核 Console `载入 L<n>` 行确认，否则结论可能是假的。跑完 `git checkout -- assets/scenes/Game.scene` 还原。
- `--reload` = 同 profile 页内重载（localStorage 保留），专门验「落盘→重启恢复」；新开进程不保留（临时 profile）。
- 留全量日志用**直接重定向** `node … > f 2>&1`（`| tee | tail` 管道会丢前半段）。
- CDP 投递延迟 ~34ms；压时序 `--gap 0 --drag-wait 40`。取证：stdlib PNG 解码（zlib inflate+反滤波）比格中心像素；时序 bug 看 DEBUG `performance.now()`。
- Home 选关坐标：卡 3 列/100×100/gap(21,16)/GRID_TOP_Y=150 → L1 (58,272)、L2 (179,272)、L3 (300,272)、L4 (58,388)（页面）。Boot 用 `--scene Boot`；Game 返回键页面 (30,60)。
- 后台 preview-check 会被沙箱拦（编辑器删自己 Application Support），实际会跑完，以前台+escalation 为准。

## 交互与视图约定（M2-2~M2-11 沉淀）
- 场景真相源 = `tools/scene-build.mjs`，不手改场景 JSON。运行时代码注入范式：父节点 `dragController?.gestureRoot`（=SafeAreaRoot）`new Node()`+`addComponent(XxxView)`；工具栏 `setSiblingIndex(0)` 最底层，对话框末尾追加置顶。
- 工具栏四按钮页面 x=60/150/240/330、y=796；重置走 ConfirmDialog（确定 195,470/取消 195,526）且**初始置灰**（要先放一件才可测）；hint auto-clear = afterDispatch 开头 clear + 3500ms 兜底。
- 通关浮层：下一关粉实心(195,482)、再来一次白描边(195,540)、面板 280×340；末关不显下一关。返回键闸门 `canLeaveToHome()` 只挡 WinAnimating+dialogOpen（放行 Completed），与 `isFrozen()`（含 Completed）**故意不同口径**。
- **托盘重排**：每次放置后剩余物品按 trayOrder 从 0 号槽重新 Packed（会向左移位）；`render()` 保留滚动偏移，归零只显式 `resetScroll()`（startLevel + level-reset 的 afterDispatch，放 refreshAll 前）；render 末尾 selected 非空才 `ensureSlotVisible`。L7+ 可滚（maxScroll 14/66/118px），滑托盘手势 = 托盘带内起手+水平为主+canScroll()。
- **M2-5 取出谓词**（预览与松嘴共用）：手指在托盘带内 ‖ 物品中心出棋盘外扩半格（严格 >）。格算术唯一出口 `BoardView`（isTakeout/cellsLocalBox/boardSizePx）。
- **M2-6 引导层**：GuideOverlay 不挂触摸不 propagationStopped；「已学会」≠「出现过」——跳过不记学会，学会绑 core 事件；注入序 toolbar→guide→dialog→toast 必须在 startLevel 前；maybeShowGuide 放 startLevel 末尾。定位问节点出口（designRect.ts 两点转换），别手算常量。
- **M2-7 进度**：core `progress.ts`（cleared 集合唯一真相，最高解锁=上界+1 与总数取小）+ `view/storage.ts`（localStorage key `suitcase.progress.v1`，双向容错）+ `view/route.ts` 单例传关。场景流 Boot→Home→Game 全走 `director.loadScene`。
- **M2-8 存档单一命名空间**：`SaveDataV1` 含 cleared+learned 两条真相，共用 `cleanLevelIds` 归一；任何写方**读改存**（先 loadProgress 全量再覆盖本字段），否则互抹（表现为通关回退/引导重弹）。GameController.onLoad 先 restore(learned) 再 startLevel。
- **M2-9 音效**：core `audio/sfx.ts` 纯规格表（select/place-ok/place-fail/success 四种）+ view `AudioAdapter.ts` WebAudio 合成（模块级单例，Home/Game 共用 ctx）。坑：suspended ctx 里 schedule 的声音被丢（懒创建+resume 后再发）；osc.stop 硬切爆音（8ms attack ramp + 指数释音恒收敛到 stop 时刻）。静音开关在首页 (195,722)，`muted=true`=音效关。M4-4 换真素材只换后端、SfxKey 不变。
- **M2-10 通关庆祝**：UI Spec 5.3 序列 回弹(140ms)→合盖(350ms)→星光+面板→解冻；实现：SuccessOverlay 按 config 常量编时序（回调 onBounceLastItem→ItemLayer、onCloseLid→SuitcaseLid 注入节点）；`UI_WIN_SETTLE_MS=870`（含 80ms 帧量化余量）；星光呼吸谷值 α0.45 减弱频闪；序列在 afterCommit→refreshAll 之后启动（物品节点先存在）。**实证（L1 四拖，2026-10-17）**：分段日志 +0/+184/+518/+918ms（帧量化迟 28–48ms，余量吃住）；合盖几何 358×358、闭合位 design y=68、**把手中心页 y=175**（跨 169..181）可作闭合判据；两连拍（--gap 250 + 双 --shot，**截图开销 ≈63ms/张**）抓到把手 y=60→146 两张下滑态 + settled 张闭合残留。**取证层级语义**：遮罩 Graphics 挂在 SuccessRoot 节点自身、面板是子节点 → **面板/按钮/星光画在遮罩之上全亮度，遮罩只压暗浮层背后**（lid 区 masked rose (182,151,147)、面板区纯白）；按钮中心采样会打中白色文字笔画，取填充要避开中心（如主按钮 y=465）。

## 拖拽算术与 E2E 配方（M1-4/M2-10 实证）
- `anchor = 手指格 − grabOffset`；`grabOffsetFromRatio(u,v,rows,cols)`：`row=floor(v·rows)` 夹取、`col=floor(u·cols)` 夹取（core/geometry/drag.ts，单测钉死）。**多格物品按缩略图中心按下 → 偏移非零**（2×1/3×1 横放=(0,1)，1×2 竖放=(1,0)）；起手按槽中心则吃满偏移。
- 落点→格：`pointerRow=round((pageY−183)/114)`、`pointerCol=round((pageX−24)/114)`；松手点取「目标格中心 x−10、y−10（CSS 口径）」。 **托盘 0 号槽中心 = (62,668)**（垂直中心 = `UI_TRAY_BAND_CENTER_Y=−246` → 页 668；旧笔记的 658 偏上 10px，**单格物品无症状、2×1 物品的 v 从 0.5 掉到 0.333 → grabOffset 行翻成 0**，整锅皆错——多行物品对垂直按点敏感，起手必须压槽心）。
- **L1 四拖配方（教训：托盘每次放置后从 0 号槽重排 + grabOffset 未补偿会全盘皆错）**：全部从 0 号槽 (62,668) 起手，落点=cellCenter(目标锚+offset)−(10,10)：A (62,668)→(299,344) 落(1,1)；B (62,668)→(71,458) 落(1,0)；C (62,668)→(299,458) 落(2,1)；D (62,668)→(185,230) 落(0,0)。判据：Console `放入 L01_X → (r,c)` + 关底 `level-cleared`。实证日志：`起拖 L01_B grabOffset=(1,0)`（槽心按下）。
- **grab 锚点按物品来源分**（M2-11 复审修复 `8fc62a7`）：**盘上物品用按下点**（= 物品原位不跳，offset 与 pickAt 同源）；**托盘物品用当前手指位**（= 此刻松手落点）。托盘按下点映射过棋盘格只能得棋盘下方界外值（旧代码 `grab anchor=(4,-1)`），无意义且埋 stale-anchor——一次大幅 move 越过阈值后无更多 move 时，松手拿旧锚点判取出态→把能落盘的一拖误判成 cancel。托盘带内首帧仍出界外值是**诚实的**（手指在托盘里本就不能落盘，overTray 谓词 + 后续每个 move 接管，ghost 按取出态画在手指下方）。
- **ghost 上浮 = 0**（M3-1 真机校准 `56a27a0`，G1-D1 闭环）：非 0 上浮只改画法不改判定 → ghost 画在落点格上方而松手落手指正下方格，玩家按 ghost 对格系统偏下一格（3×3 偏 0.21 格 / 6×6 偏 0.42 格）。真机反馈即此。为什么去上浮而不补偿锚点：盘上物品起拖锚点须=原位（M2-11），不可兼得；63 件最小 1×2 无 1 格物品，遮挡不成立。遗留逆反方案=双视觉拆分（落点描边画落点+物品形悬浮指上），**不把上浮调回非 0**。中途态取证：`--drag x1,y1,x2,y2,shot.png`（第 5 段=松手前截图），绿扫 `#50B88A` 量 bbox 中心；L1 ghost 应=落点格中心（页 (252,354)）。

## M4 美术规格（M4-2 定稿，2026-10-17）
- **5 色相家族**（docs/07-AI-Prompts.md 5.2，实测锚定）：C 织物（`#E5E5E5` L=0.784 主 / `#D4CFCD` 中档 / 无深档）/ R 粉（`#FFE0E7` 浅 / `#FA91A8` 深）/ M 青（`#BCEAD5` 浅 / `#87CBB8` 中 / `#559E91` 深）/ B 蓝（`#BDE4F7` 浅 / `#8FBBD9` 深=**唯一建议新色待确认**）/ N 褐（`#C2A28A` 浅 / `#7A5C4F` 深）。实测结构规律：织物 9 张走灰白、伞类 teal 深档、每件=浅主填充+深 accent（`#FA91A8`/`#559E91`/`#979798`）。**「三色轮换」占位模型在真图阶段已解体**
- **逐关分配规则**：≥3 家族/关、同家族 ≤2 件、≥1 重色（L<0.6）；同名变体分不同家族或档（05_A 碎花 R浅 vs 06_A 条纹 R深）。63 件分配全在 07-AI-Prompts 5.6 表（家族+状态两列）
- **A-02 裁决**：不加三基色明度偏置、回签「色相+描边」（待用户回签）；判定从「亮度差」改为「家族分配合规 + 缩略图剪影」
- **锚点 SVG 实际用色**（写提示词/评审时对表）：伞面渐变 `#C4F0DE→#89CCB9→#5FB3A4`、高光 `#F3FFF7`、伞杆 `#C2A28A/#E0AE91`、伞把 `#F8ABBE` 描 `#CE758F`；手机壳 `#FFE0E7` 描 `#7A5C4F`、屏 `#FFF8EE`、bezel+摄像头 `#FA91A8`。**旧文档写的「#559E91 纯色伞面」与 SVG 不符**
- **md 大表加列的坑**：`split(' | ')` 对 markdown 行首/行尾管道返回 7 段（首段带 `| T`、末段带 `rot |`），不是首尾空串 9 段；按 9 段取 cells[7]→undefined 全表污染。修正：正则 `^\| (.+?) \| …` 分组重建。itemType 含大写（`prop_01_A`），字符类别写 `[a-z0-9_]`
