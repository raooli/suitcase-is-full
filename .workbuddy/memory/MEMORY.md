# 项目长期记忆 —— 《行李箱装不下啦！》

> 跨会话约定与手法；日常进展写 `YYYY-MM-DD.md`。M2（M2-1~M2-11）全收官；M3-1/M3-2 微信构建落地（首包 3.24MB 过 G2）；M3-1 真机校准拖拽 ghost 上浮清零（`56a27a0`）；M3-3 手感 ✅（iPhone 15 Pro 393pt）。

## 当前阶段
- **M4-5a 已收官（`f3c59ea`）**：25 张真图接入（propAssets 加载器 + ItemView 子节点贴图 + 等比映射），L1~L5 全真图、L6~L10 回退占位色块；素材 25/63，缺 38 张（L6 未开、L7 差 7、L8~L10 全）。
- **M4-6 已收官（`81d1e7b`）**：真机发现贴图形状与占格不符（L 型占格却是矩形图）。**用户否决硬裁，改走重绘**——14 件非矩形有图物品用「逐格置物式」提示词重绘，出图即呈多联骨牌形；`fit` 足迹遮罩只作兜底；ItemView 旋转感知映射修 90° 拉伸。`check:art` 25/25 剪影合规。
  - 出图坑（新增）：**并行 ImageGen 共享 output_dir**（后写覆盖）→ 必须串行逐张；单物体跨多格被逐格平铺（笔记本→2 本、相机带→3 段、外套→3 包）→ 提示词写「ONE single / 禁止分段」；长裙 L 形足迹用「折叠平放成 L 形」；近白填充（白布）被抠底吃掉→改彩色+描边。
  - **M4-6c 收官**：用户真机看图挑出两类——① 7 张异形件（prop_jacket / prop_04_A/B/D / prop_05_A/B/D）被 `fit` 足迹遮罩**硬切残**（AI 画得比 cells 大，遮罩按格边界切主体出直线缺口）；② 2 张（prop_pouch / prop_05_F）**复制式重复**。对策：改用 `compose` 按格分块拼版（块单独出图 → 非等比缩放进目标矩形 → alpha 混合 → 只清 bleed 溢出），7 张挖除均 ≤0.3%、剪影严格 = 足迹、无切割；2 张差异化——prop_pouch = 灰白织物袋（上块）+ 蓝拉链袋（下块）两款；prop_05_F = 4 枚不同发夹各占一格。仍须**串行**出每块 part（并行撞名覆盖，本次 prop_05_F 的 clip c 被 pouch_upper 同秒时间戳覆盖，已补生成）。
- **待回签/待办**：prop_04_D 探线、A-02 裁决（色相+描边，不加明度偏置）、UI 7 类 + 音效（M4-4/M4-5b）。

## 工程基线
- Cocos Creator 3.8.8（锁 `/Applications/Cocos/Creator/3.8.8/`）；设计 390×844 + Fit Width。
- 分层：`core/`（零 cc、Vitest）↔ `view/`（唯一 import 'cc'）；core 只从 `index.ts` 对外（R-A3）。守卫 `npm run check:arch`：R-A1 core 无 cc；R-A6 格算术只许 `BoardView.ts`+`config.ts`；R-A9 assets 只放运行时资源；R-A10 禁 `[...x]` 展开（用 `Array.from`）。
- 参数只改 `config.ts`，禁魔法数字。view 类型检查用 `tsconfig.view.json`（`onLoad` 等需 `override`）。
- 交付纪律：① `npm run check` ② `npm run preview:game` 零 Console 错误 ③ 双绿才提交、CHANGELOG 倒序一条；提交前 `git status` 避用户在途 `prop_02_*.png`。

## 首包体积（M4-3）
- 裁引擎模块（`settings/v2/packages/engine.json` 的 `includeModules`/开关）：3.236MB → **2.15MB**；M4-5a 真图接入后 = **2,253,262 B / 104 文件**，63 图齐预测 ≈**2.41MB**，远低于 3.5MB 线。坑：`physics-2d-box2d` 已 false（脚本容忍）、末项无逗号/留尾逗号致 JSON 非法 → 改完 `node -e "JSON.parse(...)"` 校验。图片压缩只省 ~15KB，无效手段。

## 出图流水线（docs/07 §5.11）
- **ImageGen 给不出透明底**：`background=transparent` 仍返回 colorType 2 无 alpha。规程：纯白平坦底生成 → **阈值抠底**（近白 min≥205 且彩度≤26，**只挖与画布边缘连通的连通域**）→ 光晕反解 unflatten → 碎块剔除（≥最大连通域 6%）→ 面积平均缩放（**预乘 alpha：分子 0–255、分母 0–1**，写错整图黑）→ 居中合版 → **16 色量化 + alpha 16 级**（不量化 36KB/张顶线；量化后 ~11.7KB 肉眼无差）。
- `tools/art-batch-proc.mjs`：`fit`（自动套遮罩兜底 + 省略 W/H 从 levels.json 推导）、`mask <itemType>`（挖非占格透明）、`guide <itemType> <outPath>`（渲染灰色足迹引导图）、`compose <itemType> 'r,c,h,w=part.png' [...]`（**按格分块拼版**，块单独出图后精确摆进占格区，从根上无切割）、`contact-sheet`。`tools/check-art.ts`：尺寸/命名/朝向/四角 α=0/覆盖率上限 + **剪影门禁**（非占格区域内部 alpha>8=blocker；占格覆盖率<2%=warning）。`art/review-pixels.py` ITEMS 表含 cells ASCII 供人工复审。
- 三条硬教训：① **投影只能在提示词里禁**（`no ground shadow`），自动去投影会吃掉 C 家族 `#E5E5E5` 织物；② **并行出图同秒撞名互相覆盖**，每张独立 `output_dir` 并立刻改稳定名；③ 家族色**写死色号**，只写「R 深」会漂出家族。

## 引擎关键限制（踩坑）
- **Sprite 三硬事实（M4-5a 实证）**：① 一节点一 renderable（`Graphics` 在 `__preload` 占 `node._uiProps.uiComp`，`onDisable` 不让位、仅 `onDestroy` 清 → 同帧禁 Graphics+加 Sprite 吃 warnID 12002 且 Sprite 不注册）。**Sprite 必须挂子节点**。② `sprite.spriteFrame` setter 按当时 sizeMode 跑 `_applySpriteSize()`：默认 TRIMMED 把节点啃成 trimmed 尺寸 → **先设 `type`/`sizeMode=CUSTOM` 再设 frame**。③ 自动图集运行时重建帧 `rect` 为图集坐标（`originalSize`/`offset` 不变）→ **trim 偏移只用 `frame.offset` 反解，禁用 `rect.x/y`**：`left=画布宽/2+offset.x−trim宽/2`、`top=画布高/2−offset.y−trim高/2`。用 rect.x/y 的节点图集切换后创建即被摆出盘外。
- **`Graphics.arc(cx,cy,r,start,end,ccw)`**：`ccw=false` 画 `[start,end]` 补集；**画标称区间一律传 `true`**。Graphics 局部坐标 y 向上，`roundRect` 的 y 是下边缘。验弧：径向剖面定性（双峰=两弧）→ 角度定量。
- tween 范式 `tween(node).to().delay().repeatForever().start()`；停 `Tween.stopAllByTarget` 且结束值恒静止位；**repeatForever 入口必须幂等**（先停旧动画，opacity tween 的 target 是 `UIOpacity` 非 node）。
- **Cocos 触摸派发给所有命中节点**：整屏挡触摸须显式 `event.propagationStopped = true`（3.8.8 无 `stopPropagation`）。全局 `input.on(TOUCH_START)` 收不到（用节点级）；松手不在内→引擎改 `TOUCH_CANCEL`（监听挂 SafeAreaRoot）；须 `touch-action:none`。

## 无头预览取证（preview-check.mjs）
- 构建：`env -u ELECTRON_RUN_AS_NODE`、`ELECTRON_DISABLE_SANDBOX=1`；编辑器退出码恒 36，以 `build Task (web-mobile) Finished in` 判成功。Chrome 须 `--no-sandbox --no-zygote`。`--grep` 纯子串；Console 段只印后 80 行；留全量日志用直接重定向 `node … > f 2>&1`（管道丢前半段）。
- **微信构建（M3-1）**：同 env + `--build "platform=wechatgame;startScene=<Boot uuid>"`，4 秒出 `build/wechatgame/`；启动场景真相在 `src/settings.json` 的 `launch.launchScene`。appid 游客号 `wx6ac3f5090a6b99c5`；`cli open --project build/wechatgame` 需 IDE 开服务端口。
- 三套坐标：`--tap/--drag`=CSS 页面；世界 y 自下（`uiY=844−pageY`）；设计=world−(195,422)。**`--shot` PNG dpr=2（780×1688）**，页面值 ×2。`getLocation` 是设备像素。设计→页面：`pageX=195+designX`、`pageY=422−designY`。
- **改 `Game.scene` 的 `levelId`（第 841 行）换关，构建偶发吃缓存跑旧关**：必须核 Console `载入 L<n>` 行确认；跑完 `git checkout -- assets/scenes/Game.scene` 还原。`--reload`=同 profile 页内重载（localStorage 保留）。
- Home 选关：3 列/100×100/gap(21,16)/GRID_TOP_Y=150 → L1 (58,272)、L2 (179,272)、L3 (300,272)、L4 (58,388)（页面）。Boot `--scene Boot`；Game 返回键 (30,60)。CDP 投递延迟 ~34ms；压时序 `--gap 0 --drag-wait 40`。

## 交互视图约定（M2 沉淀）
- 场景真相源 = `tools/scene-build.mjs`。注入范式：父 `dragController?.gestureRoot`(=SafeAreaRoot) `new Node()`+`addComponent(XxxView)`；工具栏 `setSiblingIndex(0)` 最底层，对话框末尾置顶。
- 工具栏四按钮 x=60/150/240/330、y=796；重置走 ConfirmDialog（确定 195,470/取消 195,526）初始置灰；hint auto-clear = afterDispatch 开头 clear + 3500ms 兜底。
- 通关浮层：下一关粉实心(195,482)、再来一次白描边(195,540)、面板 280×340；末关不显下一关。返回键闸门 `canLeaveToHome()` 只挡 WinAnimating+dialogOpen（放行 Completed），与 `isFrozen()`（含 Completed）口径不同。
- **托盘重排**：每次放置后剩余物品按 trayOrder 从 0 号槽重排（左移）；`render()` 保留滚动偏移，归零只显式 `resetScroll()`（startLevel+level-reset 的 afterDispatch，放 refreshAll 前）；L7+ 可滚（maxScroll 14/66/118px）。
- **M2-5 取出谓词**：手指在托盘带内 ‖ 物品中心出棋盘外扩半格（严格 >）。格算术唯一出口 `BoardView`。
- **M2-6 引导层**：GuideOverlay 不挂触摸不 propagationStopped；「已学会」≠「出现过」（学会绑 core 事件）；注入序 toolbar→guide→dialog→toast 在 startLevel 前；maybeShowGuide 放 startLevel 末尾。
- **M2-7/8 进度存档**：core `progress.ts`（cleared 唯一真相）+ `view/storage.ts`（localStorage `suitcase.progress.v1`）+ `view/route.ts` 单例传关。Boot→Home→Game 走 `director.loadScene`。`SaveDataV1` 含 cleared+learned，任何写方**读改存**（先 loadProgress 全量再覆盖本字段），否则互抹。GameController.onLoad 先 restore(learned) 再 startLevel。
- **M2-9 音效**：core `audio/sfx.ts`（select/place-ok/place-fail/success）+ view `AudioAdapter.ts` WebAudio 合成（模块级单例）。suspended ctx 丢声（懒创建+resume 后再发）；osc.stop 硬切爆音（8ms attack ramp + 指数释音）。静音开关首页 (195,722)。
- **M2-10 通关庆祝**：序列 回弹(140ms)→合盖(350ms)→星光+面板→解冻；`UI_WIN_SETTLE_MS=870`；星光呼吸谷值 α0.45。合盖几何 358×358、闭合位 design y=68、把手中心页 y=175。

## 拖拽算术与 E2E 配方
- `anchor = 手指格 − grabOffset`；`grabOffsetFromRatio(u,v,rows,cols)`：`row=floor(v·rows)`、`col=floor(u·cols)`（core/geometry/drag.ts 单测钉死）。多格物品按缩略图中心按下→偏移非零；起手按槽中心则吃满偏移。
- 落点→格：`pointerRow=round((pageY−183)/114)`、`pointerCol=round((pageX−24)/114)`；松手点取目标格中心 x−10、y−10（CSS）。
- **托盘 0 号槽中心 = (62,668)**（垂直中心 `UI_TRAY_BAND_CENTER_Y=−246`→页 668；旧 658 偏上 10px，多行物品 grabOffset 行翻 0 全错）。
- **L1 四拖配方**：全从 (62,668) 起手，落点=cellCenter(锚+offset)−(10,10)：A→(299,344)落(1,1)；B→(71,458)落(1,0)；C→(299,458)落(2,1)；D→(185,230)落(0,0)。判据 Console `放入 L01_X → (r,c)` + `level-cleared`。
- **grab 锚点按来源分**：盘上物品用按下点（原位不跳）；托盘物品用当前手指位（松手落点）。
- **ghost 上浮=0**（M3-1 校准）：非 0 上浮只改画法不改判定→玩家对格偏下（3×3 偏 0.21 格/6×6 偏 0.42 格）。不调回非 0。

## M4 美术规格（M4-2 定稿）
- **5 色相家族**（docs/07-AI-Prompts 5.2）：C 织物（`#E5E5E5`/`#D4CFCD`）/ R 粉（`#FFE0E7`/`#FA91A8`）/ M 青（`#BCEAD5`/`#87CBB8`/`#559E91`）/ B 蓝（`#BDE4F7`/`#8FBBD9` 待确认新色）/ N 褐（`#C2A28A`/`#7A5C4F`）。结构规律：织物灰白、伞类 teal 深档、每件=浅主填充+深 accent（`#FA91A8`/`#559E91`/`#979798`）。
- 逐关分配：≥3 家族/关、同家族 ≤2 件、≥1 重色（L<0.6）；同名变体分不同家族或档。63 件分配全在 07-AI-Prompts 5.6 表。
- 锚点 SVG 实际用色（对表）：伞面渐变 `#C4F0DE→#89CCB9→#5FB3A4`、高光 `#F3FFF7`、伞杆 `#C2A28A/#E0AE91`、伞把 `#F8ABBE` 描 `#CE758F`；手机壳 `#FFE0E7` 描 `#7A5C4F`、屏 `#FFF8EE`、bezel+摄像头 `#FA91A8`。（旧文档「#559E91 纯色伞面」与 SVG 不符）
- md 大表加列坑：`split(' | ')` 首尾管道返回 7 段非 9 段；按 9 段取 cells→undefined 全表污染。修正用正则分组；itemType 含大写字符类别写 `[a-z0-9_]`。
