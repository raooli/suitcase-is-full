# prop_04_E · 口红

| 项 | 值 |
| --- | --- |
| 关卡 | L4 |
| 家族 | R 深 |
| 占格 / 画布 | 2×1 / 96×192 |
| 生成参数 | size=`1024x1536`, quality=high, background=transparent |
| 版本 | v2（前版废弃，见备注） |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。

## Object Block（逐件差异段，照抄即可）

```text
A single lipstick in its tube, standing VERTICALLY upright, tall narrow composition, cap on the upper half, body below, one simple horizontal seam between cap and body. Body fill is a MEDIUM PASTEL ROSE exactly #FA91A8 (mid-tone, LIGHT and SOFT — NOT dark maroon, NOT brown, NOT burgundy). Add one soft lighter rose highlight stripe #FFE0E7 along the upper-left of the tube. Very thin warm brown outline, about 1.5 pixels at a 96 pixel wide cell. Flat pastel fill, only one soft highlight, no dark shadow side, no gradient, no metallic shine.
```

## Spec / Output

```text
Canvas exactly 96x192 pixels, single cell = 96px, @2x. The object fills the canvas edge to edge with no margin. Subject stays fully inside the shape bounding box; decorative overhang max 10%. Transparent background.
```

## 负向词

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated colors, neon, long drop shadow, outer glow, specular highlight, 3D render, photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient background, checkerboard pattern, transparency grid, textured canvas background, grid lines, border, frame, blurry, cropped subject, multiple views, 4 rotations
```

## 后处理

```bash
node tools/art-batch-proc.mjs fit <raw> prop_04_E 96 192 8
# 然后：npm run check:art
```

## 备注

v1 按「R 深」自由发挥成深枣红 #985860(L=0.401) 掉出家族 → v2 写死色号 #FA91A8 + 负面词 dark maroon，得 #E08890(L=0.609)。
