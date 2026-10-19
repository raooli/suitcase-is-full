# `ui/home-hero` 首页英雄图

首页顶部的主视觉：一只开口行李箱，里面露出三件物品（长裙 / 化妆包 / 围巾）。这张是**正视**——与 `suitcase-open` 的俯视不同，原因是不需要承载网格，正视更能传达「装好行李准备出发」的情绪。

## 提示词

```
Cream travel journal illustration style: soft hand-drawn feel, rounded simplified shapes,
low-saturation pastel palette, slight volume shading. Flat sticker look, clean silhouette,
minimal detail. Warm brown outline (#7A5C4F), never pure black, outline max 2px at 2x scale.
Soft light from upper-left with a short light shadow at lower-right; no long drop shadow,
no glow, no specular highlight, no thick impasto.

Subject: an OPEN suitcase standing upright with its lid raised up, slightly turned toward the
viewer, a few clothing items peeking out and resting on the open rim — one folded light-rose
dress (#FFE0E7 with #FA91A8 waistband), one small rounded cosmetic pouch (#BCEAD5 mint with a
#87CBB8 zipper), and a loosely looped scarf (#C2A28A tan). The suitcase shell is warm cream
(#FFE7AD) with #7A5C4F outline and two small round clasps; its interior lining is a soft pale
cream. Charming, tidy, cozy travel mood. Centered composition, the whole subject fills the
frame with no large empty margins.

Background: plain flat pale off-white #F7F6F3, absolutely no gradient, no vignette,
no checkerboard or transparency grid, no texture, no watermark, no text.

Deliver: PNG. No text, no watermark, no logo, no signature.

black thick outline, neon, saturated colors, dark maroon, long drop shadow, outer glow,
specular highlight, 3D render, photorealistic, gradient mesh, vignette, checkerboard pattern,
transparency grid, textured canvas background, grid lines, border, frame, blurry, multiple
suitcases, crowded mess
```

生成参数：`size=1024x768`、`background=transparent`（实际仍返回无 alpha 的 RGB，靠后处理抠底）。

## 后处理

```bash
QN=16 node tools/art-batch-proc.mjs fit <raw.png> home-hero 560 400 12 \
  --no-mask --out assets/resources/sprites/ui
```

抠底读数：`边缘连通挖除 548301px / 光晕恢复 2403px / 剔除碎块 6446px（968 个连通域）/ 残留主体 29.5%`，输出 29.9KB。

> 注意 `剔除碎块 6446px`——模型在右下角盖了「AI生成」水印，靠碎块剔除（≥ 最大连通域 6%）去掉。**这一步不可省**，出图后先看角落有没有文字块。

## 版本记录

| 版本 | 结果 |
| --- | --- |
| v1 | 内容与风格一次通过，无需重出 |
