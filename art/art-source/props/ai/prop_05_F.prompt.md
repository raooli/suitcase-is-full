# prop_05_F · 发饰（三枚）

| 项 | 值 |
| --- | --- |
| 关卡 | L5 |
| 家族 | M |
| 占格 / 画布 | 3×2 / 192×288 |
| 生成参数 | size=`1024x1536`, quality=high, background=opaque |
| 版本 | v3（前版废弃，见备注） |

> 完整提示词 = [docs/07 §5.1 Style Block] + [§5.11 批次补充段] + [本文 Object Block] + [Spec]；负向词见文末。
> Style Block 与批次补充段不在此重复，避免两处漂移。

## Object Block（逐件差异段，照抄即可）

```text
Three hair clips laid HORIZONTALLY (each clip is a wide short rounded rectangle, about four times wider than tall), stacked one above the other in three even rows with equal gaps, all the same width, together filling the full frame width. Clips fill soft pastel mint #BCEAD5; each clip has one thin vertical slot line and a small circular hinge in deeper mint #87CBB8. Flat, symmetric, simple blocky silhouette.
```

## Spec / Output

```text
Canvas exactly 192x288 pixels, single cell = 96px, @2x. The three clips together fill the canvas edge to edge with no margin. Subject stays fully inside the shape bounding box; decorative overhang max 10%.
```

## 负向词

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated colors, neon, long drop shadow, outer glow, specular highlight, 3D render, photorealistic, dark maroon, heavy shading, gradient mesh, vignette, gradient background, checkerboard pattern, transparency grid, textured canvas background, grid lines, border, frame, blurry, cropped subject, multiple views, 4 rotations, thin vertical slivers, tall narrow strips
```

## 后处理

```bash
node tools/art-batch-proc.mjs fit <raw> prop_05_F 192 288 10
# 然后：npm run check:art
```

## 备注

重出 3 版才合格。v1「三枚发夹」被画成三根细竖条，填不满 3×2 格；v2 整片薄荷绿背景与主体同色，抠底无解，且右下带平台水印；v3 改纯白底（background=opaque）+ 明确「横放、宽约为高的四倍」后通过。

**v3 原图右下仍有「AI生成」水印**（见 `art/previews/props/prop_05_F_reference.jpg`），成品里是靠「碎块剔除：只保留 ≥ 最大连通域 6%」去掉的。该步骤因此不可省——后续批次出图后若发现角落有残留文字块，先看这一步是否被跳过。
