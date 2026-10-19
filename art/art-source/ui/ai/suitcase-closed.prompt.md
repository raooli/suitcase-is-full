# `ui/suitcase-closed` 通关合盖终态

## 为什么必须与 `suitcase-open` 同轮廓

合盖动画（M2-10 已实现：回弹 140ms → 合盖 350ms → 星光+面板）在 M4-5b 会把程序化 `SuitcaseLid` 换成这张图。**两张图必须同画布、同轮廓、同中心**，才能用同一矩形做交叉淡出/位移动画而不跳位。所以：

- 画布都是 **780×780**
- 都处理到 `margin=6`（内容顶到 6px 边）
- 都是俯视、正方形箱体

## 提示词

```
Cream travel journal illustration style: soft hand-drawn feel, rounded simplified shapes,
low-saturation pastel palette, slight volume shading. Flat sticker look, clean silhouette,
minimal detail. Warm brown outline (#7A5C4F), never pure black.

VIEW: TOP-DOWN, straight overhead, a CLOSED suitcase seen from above. The suitcase is a
SQUARE (1:1) rounded rectangle — width equals height, same footprint as an open square
suitcase. The visible face is the closed lid: a flat plain surface of warm cream (#FFE7AD)
with a slightly lighter inset square panel (#FFEED0). Two small round clasps sit centered on
the BOTTOM rim; one short rounded handle tab sits centered on the TOP rim, pointing up and
outside the body. A thin brown outline and one thin seam line around the lid. Symmetrical,
tidy, cozy mood.

BACKGROUND RULE (most important): the entire background around the suitcase is plain flat
PURE WHITE #FFFFFF, completely empty. NOT cream, NOT beige, NOT tinted, NOT gradient,
NOT textured, NOT torn paper edges.

Canvas exactly 1:1 square. The suitcase fills the frame edge to edge with a small even margin.

Deliver: PNG. Absolutely no text, no watermark, no logo, no signature.

perspective view, 3D render, photorealistic, cast shadow, ground shadow, long drop shadow,
outer glow, specular highlight, cream background, beige background, tinted background,
gradient background, vignette, checkerboard pattern, transparency grid, torn paper edge,
textured canvas background, grid lines, border, frame, blurry, open suitcase, items, clothes,
clutter, multiple suitcases, black thick outline, neon, saturated colors, wide rectangle
```

生成参数：`size=1024x1024`、`background=opaque`、`quality=high`。

## 后处理

```bash
QN=16 node tools/art-batch-proc.mjs fit <raw.png> suitcase-closed 780 780 6 \
  --no-mask --out assets/resources/sprites/ui
```

抠底读数：`边缘连通挖除 413283px / 光晕恢复 2350px / 剔除碎块 70px / 残留主体 60.6%`，输出 79.3KB。

## 版本记录

| 版本 | 结果 |
| --- | --- |
| v1 | 正视（侧面）合箱 + 地面投影，420×340。要换成正视 lid 就得让棋盘立体化，与 open 的俯视不匹配；投影也要单独处理 → 废弃 |
| v3 | 俯视、正方形、无投影、纯白底 → **采用** |
