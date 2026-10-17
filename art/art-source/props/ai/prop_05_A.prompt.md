# prop_05_A · 长裙（碎花）

| 项 | 值 |
| --- | --- |
| 关卡 | L5 |
| 家族 | R 浅 |
| 占格 / 画布 | 3×3 / 288×288 |
| 生成参数 | size=`1024x1024`, quality=high, background=transparent |
| 版本 | v1 |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。

## Object Block（逐件差异段，照抄即可）

```text
A long dress laid flat and viewed from the front, symmetric wide A-line skirt with two short sleeves at the top, small waistband, scattered tiny floral dots on the fabric. Main fill light rose #FFE0E7, waistband and floral dots in deeper rose #FA91A8. Simple blocky silhouette, no hanger, no mannequin.
```

## Spec / Output

```text
Canvas exactly 288x288 pixels, single cell = 96px, @2x. The object fills the canvas edge to edge with no margin. Subject stays fully inside the shape bounding box; decorative overhang max 10%. Transparent background.
```

## 负向词

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated colors, neon, long drop shadow, outer glow, specular highlight, 3D render, photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient background, checkerboard pattern, transparency grid, textured canvas background, grid lines, border, frame, blurry, cropped subject, multiple views, 4 rotations
```

## 后处理

```bash
node tools/art-batch-proc.mjs fit <raw> prop_05_A 288 288 10
# 然后：npm run check:art
```

## 备注

一次通过。与 L6 的 prop_06_A（条纹长裙）是同名变体，靠图案 + 家族区分。
