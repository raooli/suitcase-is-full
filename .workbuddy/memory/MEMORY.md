# 项目长期记忆 —— 《行李箱装不下啦！》

> 跨会话约定与手法；日常写 `YYYY-MM-DD.md`。M2（M2-1~M2-11）全收官；M3-1/M3-2 微信构建落地（首包 3.24MB 过 G2）；M3-1 真机校准 ghost 上浮清零；M3-3 手感 ✅（iPhone 15 Pro 393pt）。M4-3 复审四条已收官（`27cb1c9`+`2706255`）。

## 当前阶段
- **M4-3 批次出图 25/63**（`3788630` 等）：L1~L5 全齐（含 M4-6 重绘 14 件异形件呈多联骨牌形）；缺 38 张（L6 未开、L7 差 7、L8~L10 全）。出图流水线 `tools/art-batch-proc.mjs` 已定型。
- **M4-4 已收官**（`0e97260`）：UI 插画 3 张（`ui/home-hero` 560×400、`ui/suitcase-open` 780×780 **俯视开口**、`ui/suitcase-closed` 780×780 同轮廓）+ 音效 4 个 WAV（`tools/synth-sfx.py` 离线渲染）。其余 5 类组件**定案程序化**；口径「一件东西的画像→出图，会变形的容器/状态机→程序化」（docs/03 §7.2）。
- **待办**：M4-5b 接线（UI 插画 + 音频 WAV 目前是**死资源**，`AudioAdapter` 仍走 WebAudio 合成）；L6~L10 出图 38 张；prop_04_D 探线、A-02 裁决待回签。

## 工程基线
- Cocos Creator 3.8.8（锁 `/Applications/Cocos/Creator/3.8.8/`）；设计 390×844 + Fit Width。
- 分层：`core/`（零 cc、Vitest）↔ `view/`（唯一 import 'cc'）；core 只从 `index.ts` 对外（R-A3）。守卫 `npm run check:arch`：R-A1/R-A6/R-A9/R-A10。参数只改 `config.ts`。
- 交付纪律：① `npm run check` ② `npm run preview:game` 零 Console 错误 ③ 双绿才提交、CHANGELOG 倒序一条。

## 首包体积
- 裁引擎模块（`settings/v2/packages/engine.json`）：3.236MB → 2.15MB；M4-5a 真图接入后 = 2,253,262 B / 104 文件，63 图齐预测 ≈2.41MB，远低于 3.5MB 线。坑：改 JSON 后必须 `node -e "JSON.parse(...)"` 校验；图片 16 色量化 → ~11.7KB/张。

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
- 改 `Game.scene` 的 `levelId`（第 841 行）换关，构建偶吃缓存 → 必须核 Console `载入 L<n>`；跑完 `git checkout -- assets/scenes/Game.scene`。

## 交互/拖拽约定
- 场景真相源 `tools/scene-build.mjs`；注入序 toolbar→guide→dialog→toast 在 startLevel 前。
- 通关浮层：下一关粉实心(195,482)、再来一次白描边(195,540)、面板 280×340。
- 托盘 0 号槽中心 = (62,668)；grab 锚点：盘上=按下点、托盘=当前手指位；ghost 上浮=0。
- L1 四拖：A→(299,344)落(1,1)；B→(71,458)落(1,0)；C→(299,458)落(2,1)；D→(185,230)落(0,0)。

## M4 美术规格（docs/07 第 5 节 V1.2）
- 5 色相家族：C 织物 `#E5E5E5`/`#D4CFCD`、R 粉 `#FFE0E7`/`#FA91A8`、M 青 `#BCEAD5`/`#87CBB8`/`#559E91`、B 蓝 `#BDE4F7`/`#8FBBD9`、N 褐 `#C2A28A`/`#7A5C4F`。结构：浅主填充+深 accent。
- 逐关分配：≥3 家族/关、同家族 ≤2、≥1 重色（L<0.6）。UI 调色板见 docs/03 §4（bg `#FFF8EE`、accent.pink `#FA91A8`、surface.cream `#FFE7AD`、brown `#7A5C4F`、valid `#50B88A`、invalid `#E56B77`）。
