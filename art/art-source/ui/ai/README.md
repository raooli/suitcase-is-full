# UI 插画的「源」= 提示词（2026-10-19，M4-4）

与 `../props/ai/` 同一条理由：**AI 件没有 SVG 源**。模型只出位图（实测连 alpha 都不给：请求 `background=transparent` 仍返回 colorType 2 的无 alpha RGB，还把「透明棋盘格」画进像素、右下角盖「AI生成」水印）。把成品矢量化只是对 16 色量化结果的二次近似（边缘失真、半透明光晕丢信息、体积不减），属于**会误导后人的假源**。

能重新生成这件东西的**最小输入就是提示词**，所以源落在这里：`<name>.prompt.md` 内含

- Object Block（主体描述，色号写死）
- 生成参数（`size` / `background`）
- 负向词
- 后处理命令（`art-batch-proc.mjs fit ... --no-mask --out assets/resources/sprites/ui`）
- 版本踩坑备注（哪版废了、为什么）

公共 Style Block **不复制进来**，只在 `docs/07-AI-Prompts.md` §5.1 维护一份，避免两处漂移。

原图缩略在 `art/previews/ui/<name>_reference.jpg`（长边 512 JPEG）。原图 1024×1024、单张 1–2MB，全量进 git 会撑爆仓库；512 长边对「人工比对 + image reference」足够。

| 名称 | 成品尺寸 | 说明 |
| --- | --- | --- |
| `home-hero` | 560×400 | 首页英雄图 |
| `suitcase-open` | 780×780 | 棋盘箱体（**俯视**开口） |
| `suitcase-closed` | 780×780 | 通关合盖（**俯视**合上，与 open 同轮廓） |
