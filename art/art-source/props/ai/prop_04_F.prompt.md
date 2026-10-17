# prop_04_F · 护照

| 项 | 值 |
| --- | --- |
| 关卡 | L4 |
| 家族 | N 深 |
| 占格 / 画布 | 1×2 / 192×96 |
| 生成参数 | size=`1536x1024`, quality=high, background=transparent |
| 版本 | v1 |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。

## Object Block（逐件差异段，照抄即可）

```text
A passport booklet lying HORIZONTALLY (landscape, closed but with the front cover slightly lifted so a page edge shows). Cover fill deep warm leather brown #B08A6E with a small blank debossed rectangle in slightly lighter #C2A28A on the cover; the page block shows as a pale cream #F5EFE3 band along the right edge. Simple rounded rectangular silhouette, no text, no emblem.
```

## Spec / Output

```text
Canvas exactly 192x96 pixels, single cell = 96px, @2x. The object fills the canvas edge to edge with no margin. Subject stays fully inside the shape bounding box; decorative overhang max 10%. Transparent background.
```

## 负向词

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated colors, neon, long drop shadow, outer glow, specular highlight, 3D render, photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient background, checkerboard pattern, transparency grid, textured canvas background, grid lines, border, frame, blurry, cropped subject, multiple views, 4 rotations
```

## 后处理

```bash
node tools/art-batch-proc.mjs fit <raw> prop_04_F 192 96 8
# 然后：npm run check:art
```

## 备注

一次通过。L4 的重色件之一（与 prop_04_E 一起补上 L4 原本缺的重色）。
