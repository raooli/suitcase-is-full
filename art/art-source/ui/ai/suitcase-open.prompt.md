# `ui/suitcase-open` 棋盘箱体（俯视开口）

## 为什么必须是俯视

游戏是 2D 俯视装箱，棋盘是**正方形**（L10 的 6×6 = 342×342 设计像素）。正视「盖子竖起」的插图没有任何平面能承载正方形网格——第一版就是那么出的，内衬是 1.68:1 的扁长方形，格子放进去左右会空出一大片，且底色是暖米色（`rgb(238,229,211)`）与箱体同色系，抠图抠不掉（覆盖率 89.8%）。整张废弃。

## 关键约束（缺一条就会返工）

1. **正方形内衬**：不写死「SQUARE，宽 = 高」，模型默认画成旅行箱的扁长方形。
2. **纯白底**，且「NOT cream / NOT beige / NOT torn paper edges」。写 `background=opaque` + 在提示词里点明纯白，比指望 `background=transparent` 可靠。
3. **盖子沿上缘平放成一条薄带**（约 12% 高），不要立起来——立起来就挡掉内衬上半部分。
4. 禁 `cast shadow / ground shadow`：贴纸风没有投影，有投影就会在深色背景上浮一层。

## 提示词

```
Cream travel journal illustration style: soft hand-drawn feel, rounded simplified shapes,
low-saturation pastel palette, slight volume shading. Flat sticker look, clean silhouette,
minimal detail. Warm brown outline (#7A5C4F), never pure black.

VIEW: TOP-DOWN, straight overhead, looking down INTO an open empty suitcase.

CRITICAL GEOMETRY: the suitcase is a SQUARE (1:1) — its width equals its height. The open
interior is a large SQUARE cavity, exactly as tall as it is wide, centered, occupying about
78% of the frame. Do NOT make it a wide rectangle. The lid is folded open and lies flat along
the TOP edge as a thin band about 12% of the frame height, leaving the square interior fully
visible and unobstructed.

Two small round clasps on the bottom rim. The interior lining is plain flat pale cream
(#F5EFE3), completely empty, no seam line, no divider. The shell is warm cream (#FFE7AD) with
#7A5C4F outline. Symmetrical, tidy, cozy mood.

BACKGROUND RULE (most important): the entire background around the suitcase is plain flat
PURE WHITE #FFFFFF, completely empty. NOT cream, NOT beige, NOT tinted, NOT gradient,
NOT textured, NOT torn paper edges.

Canvas exactly 1:1 square. The suitcase fills the frame edge to edge with a small even margin.

Deliver: PNG. Absolutely no text, no watermark, no logo, no signature.

wide rectangle, landscape suitcase shape, rectangular interior, perspective view, front view,
lid raised vertically, 3D render, photorealistic, cast shadow, ground shadow, long drop shadow,
outer glow, specular highlight, cream background, beige background, tinted background, gradient
background, vignette, checkerboard pattern, transparency grid, torn paper edge, textured canvas
background, grid lines, border, frame, blurry, items inside the suitcase, clothes, clutter,
multiple suitcases, black thick outline, neon, saturated colors
```

生成参数：`size=1024x1024`、`background=opaque`、`quality=high`。

## 后处理

```bash
QN=16 node tools/art-batch-proc.mjs fit <raw.png> suitcase-open 780 780 6 \
  --no-mask --out assets/resources/sprites/ui
```

- `--no-mask`：足迹遮罩是给物品用的，UI 插画不适用。
- `QN=16`：16 色与 24 色肉眼无差，索引色编码后 99.1KB（24 色约 135KB）。
- 抠底输出 `边缘连通挖除 528513px / 光晕恢复 2566px / 剔除碎块 501px / 残留主体 49.5%`。

## 版本记录

| 版本 | 结果 |
| --- | --- |
| v1 | 正视、盖子竖起。内衬 1.68:1 + 暖米色底抠不掉（覆盖率 89.8%）→ **废弃** |
| v2 | 俯视对了，但内衬仍是扁长方形（1.68:1）→ 废弃（正方形网格放不进去） |
| v3 | 内衬方了、纯白底、抠底干净、残 49.5% → **采用** |
