# prop_05_B · 旅行手提袋

| 项 | 值 |
| --- | --- |
| 关卡 | L5 |
| 家族 | C + M |
| 占格 / 画布 | 2×3 / 288×192 |
| 生成参数 | size=`1536x1024`, quality=high, background=transparent |
| 版本 | v1 |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。

## Object Block（逐件差异段，照抄即可）

```text
A travel handbag lying HORIZONTALLY, viewed from the front, with two short handles looped at the left and right ends. Body fill canvas grey #E5E5E5 with a light mint #BCEAD5 trim band along the bottom seam; canvas texture suggested by two straight seam lines only. Simple rounded rectangular silhouette.
```

## Spec / Output

```text
Canvas exactly 288x192 pixels, single cell = 96px, @2x. The object fills the canvas edge to edge with no margin. Subject stays fully inside the shape bounding box; decorative overhang max 10%. Transparent background.
```

## 负向词

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated colors, neon, long drop shadow, outer glow, specular highlight, 3D render, photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient background, checkerboard pattern, transparency grid, textured canvas background, grid lines, border, frame, blurry, cropped subject, multiple views, 4 rotations
```

## 后处理

```bash
node tools/art-batch-proc.mjs fit <raw> prop_05_B 288 192 10
# 然后：npm run check:art
```

## 备注

后处理踩坑：开启自动去投影时，C 家族织物 #E5E5E5 与浅灰投影颜色不可分，包体被误删 45.8 万 px（薄荷镶边一起没）。故 --deshadow 默认关闭，投影只在提示词侧禁。
