# prop_05_C · 高跟鞋（一双）

| 项 | 值 |
| --- | --- |
| 关卡 | L5 |
| 家族 | N |
| 占格 / 画布 | 2×2 / 192×192 |
| 生成参数 | size=`1024x1024`, quality=high, background=transparent |
| 版本 | v1 |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。

## Object Block（逐件差异段，照抄即可）

```text
A pair of high heels standing side by side, both facing the same direction, seen from the side, the two shoes close together and evenly spaced. Leather fill warm tan #C2A28A with the slim heels and the sole in deeper brown #7A5C4F. Simple rounded blocky silhouette, two shoes only, no feet.
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
node tools/art-batch-proc.mjs fit <raw> prop_05_C 192 192 8
# 然后：npm run check:art
```

## 备注

v1 因并行出图同秒撞名被 prop_05_B 覆盖丢失，这是重出版。L5 的重色压阵件（N 家族 L≈0.40）。
