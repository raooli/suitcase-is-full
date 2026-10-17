# prop_05_E · 香水（圆瓶）

| 项 | 值 |
| --- | --- |
| 关卡 | L5 |
| 家族 | B 浅 |
| 占格 / 画布 | 2×2 / 192×192 |
| 生成参数 | size=`1024x1024`, quality=high, background=transparent |
| 版本 | v1 |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。

## Object Block（逐件差异段，照抄即可）

```text
A round-shouldered perfume bottle with a short wide neck and a small rectangular cap, symmetric and centered, standing upright. Glass body fill light blue #BDE4F7 with one soft lighter highlight band on the left, cap in deeper blue #8FBBD9. Flat pastel glass, no sparkle, no liquid line, no label.
```

## Spec / Output

```text
Canvas exactly 192x192 pixels, single cell = 96px, @2x. The object fills the canvas edge to edge with no margin. Subject stays fully inside the shape bounding box; decorative overhang max 10%. Transparent background.
```

## 负向词

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated colors, neon, long drop shadow, outer glow, specular highlight, 3D render, photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient background, checkerboard pattern, transparency grid, textured canvas background, grid lines, border, frame, blurry, cropped subject, multiple views, 4 rotations
```

## 后处理

```bash
node tools/art-batch-proc.mjs fit <raw> prop_05_E 192 192 8
# 然后：npm run check:art
```

## 备注

一次通过。与 L6 的 prop_06_C（高瓶香水）是同名变体，靠瓶型区分。
