# prop_04_C · 眼镜盒

| 项 | 值 |
| --- | --- |
| 关卡 | L4 |
| 家族 | C+R |
| 占格 / 画布 | 2×2 / 192×192 |
| 足迹布局 | `XX/X.`（X=占格，.=非占格，**必须完全透明**） |
| 生成参数 | size=`1024x1024`, quality=high, background=opaque |
| 版本 | v4（M4-6 重绘：**逐格置物式**，按足迹布局重新设计物件排布） |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。
> v1→v4 教训：抽象描述「主体占左列、右下留空」模型不遵守（实测把袋子居中画成对称梯形）；**逐格点名**（哪个格子放什么、哪个格子全空）才可靠。

## Object Block（逐件差异段，照抄即可）

```text
A still-life arrangement on a 2x2 cell grid (each cell 96x96, canvas 192x192, row-major from top-left). Top-left cell: a round hard glasses case. Top-right cell: a soft cleaning cloth pouch lying flat. Bottom-left cell: a pair of folded sunglasses standing on edge. Bottom-right cell: EMPTY background only — nothing at all. Case in off-white #E5E5E5 with pink #FA91A8 stitching; folded sunglasses with blue #BDE4F7 lenses; warm brown #7A5C4F frames and outline.
```

## Spec / Output

```text
Canvas exactly 192x192 pixels, single cell = 96px, @2x. Footprint layout (2 rows x 2 cols, row-major from top-left): XX/X. — X = occupied cell, . = cell that MUST stay completely transparent. The subject must fill every X cell; nothing may enter the . cells (no body part, no shadow, no decoration). The footprint is a polyomino: a rectangle filling the whole bounding box is wrong. Transparent background.
```

## 负向词

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated
colors, neon, long drop shadow, outer glow, specular highlight, 3D render,
photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient
background, checkerboard pattern, transparency grid, textured canvas
background, grid lines, border, frame, blurry, cropped subject, multiple
views, 4 rotations
```

## 后处理

```bash
node tools/art-batch-proc.mjs fit <raw> prop_04_C 192 192 10
# 然后：npm run check:art（剪影门禁：非占格区域内部必须透明；占格覆盖率 ≥2%）
# 再目检：占用格是否都有主体、形状是否自然（非残缺）
```

## 备注

v3 眼镜盒为圆盒矩形。v4 逐格置物：圆盒占左上格，拭镜布袋横放右上格，折扇墨镜竖放左下格，右下格全空。

---
<!-- 以下是完整拼接提示词（Style Block + 批次补充段 + Object Block + Spec + 负向词），供复现与审计 -->

## Full Prompt（assembled）

```text
Cream travel journal illustration style: soft hand-drawn feel, rounded simplified
shapes, low-saturation pastel palette, slight volume shading. Game asset icon,
centered, clean silhouette, minimal detail — the item must read as a clear
blocky shape at thumbnail size. Warm brown outline (#7A5C4F), never pure black,
outline max 2px at 2x scale. Soft light from upper-left with a short light
shadow at lower-right; no long drop shadow, no glow, no specular highlight,
no thick impasto. Transparent background, PNG-24.

Batch rules: flat sticker look, warm brown outline about 1.5px at a 96px cell,
flat pastel fills with at most one soft lighter highlight, no ground shadow,
no cast shadow. Background: plain flat pale off-white #F7F6F3, absolutely no
gradient, no vignette, no checkerboard or transparency grid, no texture.

A still-life arrangement on a 2x2 cell grid (each cell 96x96, canvas 192x192, row-major from top-left). Top-left cell: a round hard glasses case. Top-right cell: a soft cleaning cloth pouch lying flat. Bottom-left cell: a pair of folded sunglasses standing on edge. Bottom-right cell: EMPTY background only — nothing at all. Case in off-white #E5E5E5 with pink #FA91A8 stitching; folded sunglasses with blue #BDE4F7 lenses; warm brown #7A5C4F frames and outline.

Canvas exactly 192x192 pixels, single cell = 96px, @2x. Footprint layout (2 rows x 2 cols, row-major from top-left): XX/X. — X = occupied cell, . = cell that MUST stay completely transparent. The subject must fill every X cell; nothing may enter the . cells (no body part, no shadow, no decoration). The footprint is a polyomino: a rectangle filling the whole bounding box is wrong. Transparent background.

text, logo, watermark, brand name, QR code, black thick outline, saturated
colors, neon, long drop shadow, outer glow, specular highlight, 3D render,
photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient
background, checkerboard pattern, transparency grid, textured canvas
background, grid lines, border, frame, blurry, cropped subject, multiple
views, 4 rotations
```
