# art-source/props/ai — AI 生成件的「源」

## 为什么这里没有 SVG

`art/art-source/props/` 根目录的 `*.svg` 是**手绘矢量源**（`prop_01_A_phone`、`prop_01_B_wallet`、`prop_07_A_umbrella`），改图改的是路径与色号，可无损重导出。

AI 生成件**不存在这样的矢量源**：图像模型输出的是位图（实测连 alpha 通道都不给，见 `docs/07-AI-Prompts.md` §5.11）。把成品位图再矢量化一遍，得到的路径是对 16 色量化结果的**二次近似**——边缘失真、光晕半透明丢信息，体积也未必更小。这种「假源」比没有源更糟：后人照它改图，误差会累积且查不出。

所以 AI 件的源定义为：**能重新生成它的最小输入 = 提示词 + 生成参数 + 后处理命令**，即本目录下的 `<itemType>.prompt.md`。

## 文件约定

| 项 | 位置 |
| --- | --- |
| 逐件提示词（Object Block / Spec / 负向词 / 参数 / 后处理命令） | `art/art-source/props/ai/<itemType>.prompt.md` |
| 公共 Style Block | `docs/07-AI-Prompts.md` §5.1（**不在此复制**，避免两处漂移） |
| 批次补充段与负向词基线 | `docs/07-AI-Prompts.md` §5.11 |
| 生成原图留档（白底未抠，长边 512 JPEG） | `art/previews/props/<itemType>_reference.jpg` |
| 成品（透明底，已合版量化） | `assets/resources/sprites/props/<itemType>.png` |

## 原图为什么只存 512 缩略

原图是 1024×1536 级别，单张 1–2 MB，8 张即 10 MB；63 张齐会到 ~80 MB，git 仓库吃不消。而原图的用途只有两个——**人工比对**与**给模型做 image reference**，模型侧还会再降采样，512 长边完全够。（真要重出图，靠的是提示词重新生成，不是拿旧图放大。）

历史遗留的 `art/previews/props/prop_01_A_reference.png`、`prop_07_A_reference.png` 是 386×490 的 PNG，保持原样不动。
