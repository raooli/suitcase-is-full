# 《行李箱装不下啦！》AI / WorkBuddy 提示词 V1.2

> 用途：供 WorkBuddy、Codex 或其他 AI 助手继续开发、制作美术与评审交付。规则冲突时，以 PRD 为业务基线、GDD 与关卡 JSON 为关卡事实、TDD 为技术/资源规格、UI Spec 为视觉规范。
>
> **V1.1 变更（2026-10-13）：** ① 基准图锚点由不存在的 `prop_03_D` 改为 `prop_umbrella`；② 交付路径随目录重构更新（`art/` + `assets/resources/sprites/props/`）；③ 资源键裁决为 `itemType`（`spriteKey` 降级）；④ **新增第 5 节「63 件物品出图提示词包」**（可直接复制使用）。
>
> **V1.2 变更（2026-10-17，M4-2 锚点确认后定稿）：** ① 5.2 色彩板由「令牌推导」升级为 **17 张已交付图实测取色锚定**，新增 5 色相家族系统与逐关分配规则；② 新增 5.2.1 **A-02 裁决**（M4-1 遗留：不给三基色加明度偏置，回签「色相+描边」方案，待用户回签）；③ 5.6 清单补「色相家族 / 交付状态」两列，已交付 17 件可直接作 image reference；④ 5.7 批次计划按当前进度刷新；⑤ 5.5 示例颜色与锚点 SVG 实际用色对齐。

## 1. 技术方案与开发提示词

```text
你正在开发微信小游戏《行李箱装不下啦！》MVP。请先完整阅读 docs/01-PRD-v1.0.md、docs/02-GDD-v1.0.md、docs/02-GDD-levels-v1.0.json、docs/03-UI-Spec.md、docs/04-TDD-v1.0.md 和 docs/06-架构设计-v1.0.md，再检查现有代码与测试；不要凭截图或标准解图推导规则。

技术基线：Cocos Creator 3.8.8 + TypeScript strict。assets/core 必须保持零 cc 依赖；棋盘占用只从 placements 派生；逻辑先原子提交并发事件，动画只能消费已提交状态；坐标换算只放在 BoardView；关卡数据只读自经验证 JSON。

实现顺序：先完成或复用纯 TypeScript 的放置、旋转、碰撞、撤回、取出、通关与求解逻辑及单测，再接 Cocos 渲染和触摸。先交付一关可操作 Demo 并真机验证拖拽手感，再接其余关卡。

必须实现：已放物品拖到棋盘外扩半格之外松手即取出，回原 trayOrder、保留朝向并进入撤回栈；touchCancel 只恢复操作前状态；棋盘外预览显示取出态而不是非法红色。不得自行添加倒计时、生命值、失败复活、广告、剧情或改写物品 cells。

每次改动后运行仓库既有检查；报告改动文件、验证结果与尚未实测项。未经明确授权不要改需求、关卡数据、引擎版本或架构边界，不要提交 Git commit。
```

## 2. 游戏美术素材制作提示词

### 2.1 单件物品通用模板

```text
为《行李箱装不下啦！》制作一件 2D 游戏物品插画：{物品名称}，itemType={itemType}，逻辑形状={cells/包围盒列×行}，足迹布局={cells ASCII，X=占格，.=非占格}。

严格遵循 docs/03-UI-Spec.md 的 Art Style V1.0，并同时参考两张已确认基准图：prop_01_A 手机与 prop_umbrella 长柄伞。风格为奶油旅行手账、轻手绘、圆润简化、柔和低饱和、轻微立体感；轮廓使用暖棕而非纯黑；统一左上柔光、右下短而淡的结构阴影；不得写实、不得厚涂、不得高饱和、不得长投影、外发光、文字、Logo 或品牌。

主体必须完整落在逻辑 cells 包围盒内。**剪影必须等于足迹布局：占格区域（X）要画出主体，非占格区域（.）必须完全透明**——物品占格是多联骨牌（L/T/S 等异形），异形件画成满矩形会盖住不属于它的格子（M4-6 用户真机反馈）；透明区、阴影与高光不参与碰撞；装饰性出血不得进入非占格区域。让玩家缩到 25% 时仍能看出物品占几格。不要绘制多个朝向，旋转由 Cocos Node.angle 完成。

输出 PNG-24 透明底 @2x，单格 96×96 px，画布={包围盒列×96}×{包围盒行×96} px；无白边、无裁切、无背景、无展示板。文件名 {itemType}.png。运行时路径 assets/resources/sprites/props/{itemType}.png；可编辑 SVG 源稿放 art/art-source/props/{itemType}_{语义}.svg。
```

### 2.2 双基准图一致性检查

```text
以 prop_01_A 手机和 prop_umbrella 长柄伞作为不可偏离的 Art Style V1.0 双锚点。比较待审素材的轮廓粗细、圆角程度、饱和度、明度层级、左上光源、右下短阴影、细节密度和占格可读性。逐项给出通过/不通过；任何一项不通过，只列需要修改的具体视觉参数，不要改变逻辑形状、画布尺寸或 itemType。
```

### 2.3 批量生产提示词

```text
先只生产 1 件并按 A-01～A-05 验收，通过后再继续下一件；不要一次性生成整批。全部素材按 itemType 独立出图，同名物品也不得擅自复用或改形状。每件交付透明 PNG 与可编辑 SVG；四朝向不单独出图。输出清单必须包含 itemType、物品名、cells、画布尺寸、文件名、验收状态与需人工精修项。AI 生成结果必须经过人工精修和商业使用合规确认后，才能进入最终图集。
```

## 3. 后续协作约束提示词

```text
开始前先读取相关文档、git status 和现有实现，保留用户未提交改动。只修改任务明确指定的文件；发现文档冲突时先指出来源与影响，不自行裁决核心规则。

事实优先级：PRD 第 4 节=业务规则；GDD JSON=关卡事实；TDD=实现与资源规格；架构文档=依赖边界；UI Spec=视觉与交互。不得从 Figma 示例、截图、标准解或文件名猜测关卡数据。

美术生产必须先用手机与长柄伞双基准图校准；未通过 Art Style V1.0 与 A-01～A-05 验收不得批量出图。不要伪造图片、测试结果、真机数据或合规结论。修改代码后运行既有检查；未能运行的验证要明确标注。未经要求不要安装依赖、升级引擎、提交 commit、推送远端或扩大任务范围。
```

## 4. 基准图与仓库交付路径

- Figma 主文件：<https://www.figma.com/design/Wh2Cg8yFw7ph1yUxy1COe4>
- 手机基准图：<https://www.figma.com/design/Wh2Cg8yFw7ph1yUxy1COe4?node-id=15-2>
- 长柄伞基准图：<https://www.figma.com/design/Wh2Cg8yFw7ph1yUxy1COe4?node-id=15-23>（**V1.1：该节点对应 `prop_umbrella`，不是 `prop_03_D`——`prop_03_D` 在 63 个 itemType 中不存在**）
- 可编辑源稿：`art/art-source/props/<itemType>_<语义>.svg`（不进包）
- 运行时贴图：`assets/resources/sprites/props/<itemType>.png`（**必须在 resources 下才能 `resources.load`**）
- 含背景/网格/说明的参考图：`art/previews/props/<itemType>_reference.png`（不进包）

图片由人工从 Figma 导出或经确认后放入上述目录；禁止用空白图、占位图或伪造文件冒充交付。

---

## 5. 63 件物品出图提示词包（V1.1 新增，可直接复制）

> 适用于 Midjourney / SD / 即梦 / 文心一格等图像模型，或人工与外包美术。
> **流程是死的：先出 2 张基准图 → 确认锚点 → 才放量；每批 ≤10 张；先调好一张，再推进下一张。**

### 5.1 风格锚点（Style Block，每条提示词都带）

```text
Cream travel journal illustration style: soft hand-drawn feel, rounded simplified
shapes, low-saturation pastel palette, slight volume shading. Game asset icon,
centered, clean silhouette, minimal detail — the item must read as a clear
blocky shape at thumbnail size. Warm brown outline (#7A5C4F), never pure black,
outline max 2px at 2x scale. Soft light from upper-left with a short light
shadow at lower-right; no long drop shadow, no glow, no specular highlight,
no thick impasto. Transparent background, PNG-24.
```

**风格禁忌：** 粗黑描边 / 高饱和纯色（`#FF0000` 类）/ 长投影 / 外发光 / 强镜面 / 文字 Logo 品牌 / 写实材质 3D 渲染厚涂 / 带背景带网格带画板。

**通用负面提示词（直接拼在末尾）：**

```text
text, logo, watermark, brand name, QR code, black thick outline, saturated
colors, neon, long drop shadow, outer glow, specular highlight, 3D render,
photorealistic, textured canvas background, grid lines, white background,
border, frame, blurry, cropped subject, multiple views, 4 rotations
```

### 5.2 色彩板（V1.2 重写：实测锚定，填充只能从这里派生）

> **色板来源**：不是想象配色——下表由 M4-1 已交付 17 张合格图的**像素级主色聚类**得出（`tools` 侧 PNG 解码 + 16 级量化聚类，跳过透明/近白/近棕描边像素后取 top3 主色并算相对亮度）。锚点实测（2026-10-17）：
>
> | 实测对象 | 主色（占比 / 相对亮度） |
> | --- | --- |
> | `prop_01_A` 手机 | `#FFE0E7`(39%, L=0.803) / `#FB9AAE`(L=0.467) |
> | `prop_umbrella` 横伞 | `#87CBB8`(15%, L=0.513) / `#9AD6C3`(L=0.589) / `#A4DCCA`(L=0.633) |
> | `prop_02_A` 帆布袋 | `#E5E5E5`(56%, L=0.784) / `#BCEAD5`(L=0.743) |
> | `prop_04_D` 收纳袋 | `#E5E5E5`(46%) / `#C3E9D8`(L=0.748) / `#559E91`(L=0.284) |
>
> 实测揭示的结构规律（**比任何色表都重要**）：① **织物/衣物类走灰白 `#E5E5E5`**（L2/L3/L4 共 9 张），这是帆布/海绵/针织的本色，不是「偷懒的中性色」；② **伞类走 teal 深档**（L=0.51~0.63），比 mint 令牌深一整档；③ **每件 = 浅色主填充 + 一个深色 accent**（深粉 `#FA91A8` / 深 teal `#559E91` / 深灰 `#979798` 三选一）。

**5 色相家族（M4-2 定稿，填充从这里派生）：**

| 家族 | 浅档（主填充） | 深档（accent / 重色件） | 适用物件 |
| --- | --- | --- | --- |
| **C 织物** | `#E5E5E5`(L=0.784) / `#F5EFE3` / 纸板中档 `#D4CFCD`(L=0.630) | 靠 accent，不设深档（织物加深显脏） | 衣物、帆布包、围巾、针织、伞面、纸盒 |
| **R 粉** | `#FFE0E7`(L=0.803) | `#FA91A8`(L=0.434) | 手机、相机、化妆/洗漱用品、外套 |
| **M 青** | `#BCEAD5`(L=0.743) | `#87CBB8`(L=0.513) → `#559E91`(L=0.284) 两档深 | 钱包、伞、收纳、洗漱 |
| **B 蓝** | `#BDE4F7`(L=0.730) | `#8FBBD9`（**建议新色，M4-3 首批跟图确认；不接受新色则深档任务交回 M 深**） | 墨镜、香水玻璃、衬衫、电子小件 |
| **N 褐** | `#C2A28A`(L≈0.40) / `#E0AE91` | `#7A5C4F`(L=0.086) | 皮鞋、皮革制品、三脚架、木/金属件 |

**描边与阴影（全家族统一）：** 描边 `#7A5C4F` ≤2px@2x；左上柔光 + 右下短淡阴影（阴影色 = 主填充同色相降明度 10~15%，**禁用纯黑阴影**）。

**逐关分配规则（A-02 操作化，替代字面亮度口径，见 5.2.1）：**

1. 每关 ≤10 件**至少覆盖 3 个家族**；
2. 同家族同关 ≤2 件，且形状（剪影）可辨；
3. 每关**至少 1 件重色压阵**（深档件 L<0.6），防止整关浅色糊成一片；
4. 同名变体按 5.6「变体提示」分到**不同家族或不同明度档**（如 `prop_05_A` 碎花裙 R 浅 / `prop_06_A` 条纹裙 R 深）；
5. 兜底不依赖填充：2px brown 描边 + 格内缩缝 + 缩略图测试（A-01 剪影）三通道共同保证可区分。

> 已交付 17 件的逐关家族分配见 5.6 清单「家族」列，剩余 46 件的分配已排定（同表），**M4-3 按表执行，不自由发挥**。

验收唯一方式：**缩略图测试**——把界面缩到 25%，看剪影能否读出占格数。

### 5.2.1 A-02 裁决（M4-1 遗留项，2026-10-17 M4-2 定稿）

> 背景：TDD 17.6 的 A-02 字面口径「同图集内任意两件相邻物品颜色明度差 ≥1 阶梯」，M1-2 已裁决「字面口径在占位阶段结构性不可满足，真图阶段随 M4-1 基准图确认一并裁决是否给三基色加明度偏置」。

**裁决：不给三基色加明度偏置——回签「色相 + 描边」方案（状态：待用户回签）。**

依据（全部有实测或既有裁决支撑）：

1. **「三基色轮换」模型在真图阶段已解体。** 17 件实测显示填充按物件自然本色走（织物灰白 / 伞青 / 手机粉），不存在一个统一的「三基色」可供加偏置；强行加偏置等于让雨伞不青、让织物不灰，破坏 Art Style V1.0 的自然联想。
2. **加偏置 = 修改 UI Spec 已确认令牌**（M1-2 裁决边界：改色号须过美术确认），连锁影响占位色块、进度条、全部 UI 表面，收益仅是字面口径好看。
3. **可区分性实际由四通道完成，亮度只是其一**：色相 + 2px brown 描边 + 剪影（A-01）+ 每件深色 accent。17 件已交付图同屏验证无投诉（真机 L1/L2/L3 全关卡已玩）。
4. **字面口径的前提不成立**：棋盘上谁挨谁由玩家摆放决定，且同形同色场景由 5.6「同名变体提示」结构性处理（不同家族/不同档）。

**替代验收（M4-3 起执行）**：按 5.2 逐关分配规则（≥3 家族/关、同家族 ≤2 件、≥1 重色）+ 缩略图测试；A-02 的判定从「亮度差」改为「同关家族分配合规 + 缩略图剪影可辨」。

### 5.3 提示词四段结构

| 段 | 内容 | 是否固定 |
| --- | --- | --- |
| 1 Style Block | 5.1 节全文 | 固定 |
| 2 Object Block | 物件描述 + 朝向 + 差异化变体（见 5.5） | 逐张不同 |
| 3 Spec Block | 见下方模板，替换 `{W}` `{H}` | 按形状模板化 |
| 4 Output Block | 交付要求 + 负面提示词 | 固定 |

**Spec Block 模板：**

```text
Canvas exactly {W}x{H} pixels, single cell = 96px, @2x. The subject must fill
the OCCUPIED cells of the footprint ({cells ASCII}: X = occupied, . = must stay
empty). Cells marked "." must be completely transparent — the footprint is a
polyomino (L/T/S shapes exist); a rectangle that fills the whole bounding box
covers cells the item does not occupy and is rejected. Decorative overhang
(umbrella handle, strap) stays inside occupied cells. Transparent background.
```

**Output Block：**

```text
Deliver: (1) transparent PNG-24 at the exact canvas size; (2) the same artwork
on a solid cream background #FFF8EE for review only. No text, no watermark.
```

### 5.4 十二条硬规则

1. 透明底 PNG-24，禁止白底假透明、白边
2. 画布 = 包围盒列×96 × 行×96，四周无留白
3. 单格 96px = @2x，禁止 @1x/@4x（@4x 会让 63 张内存涨到约 22MB）
4. **朝向 = cells 在 rotation=0 时的朝向，不按物件常识**（手机在数据里是横向）
5. **剪影 = cells 足迹**：占格区域画出主体，非占格区域完全透明（异形件禁画满矩形——M4-6 起由 `check:art` 剪影门禁 + `art-batch-proc fit/mask` 强制挖除双保险）
6. 四朝向不出图，旋转由引擎实现
7. 描边 `#7A5C4F`，≤2px@2x，禁纯黑粗描边
8. 填充从 5.2 色板派生，低饱和
9. 左上柔光 + 右下短淡阴影，禁长投影/外发光/镜面
10. 无文字、Logo、品牌、单格下不可读的纹理
11. 缩到 25% 仍能读出占格数
12. 相邻物品必须有可辨明度差

### 5.5 完整示例（可复制）

**`prop_01_A` 手机（1×2 横，不可旋转，画布 192×96）：**

```text
Cream travel journal illustration style: soft hand-drawn feel, rounded
simplified shapes, low-saturation pastel palette, slight volume shading.
Game asset icon, centered, clean silhouette, minimal detail — the item must
read as a clear blocky shape at thumbnail size. Warm brown outline
(#7A5C4F), never pure black, outline max 2px at 2x scale. Soft light from
upper-left with a short light shadow at lower-right; no long drop shadow,
no glow, no specular highlight, no thick impasto. Transparent background,
PNG-24.

A closed smartphone drawn HORIZONTALLY (lying flat, landscape orientation),
screen side up, 1 row tall and 2 columns wide. Rounded corners. Rose #FFE0E7
body with warm brown #7A5C4F outline (2px); cream #FFF8EE screen inset; thin
#FA91A8 inner bezel and matching small camera dot; one subtle white
reflection line at 85% opacity. Two grid cells wide, one cell tall.

Canvas exactly 192x96 pixels, single cell = 96px, @2x. The subject must fill
the OCCUPIED cells of the footprint (1x2 horizontal, both cells occupied).
Cells outside the footprint must be completely transparent. Transparent
background.

Deliver: (1) transparent PNG-24 at the exact canvas size; (2) the same
artwork on a solid cream background #FFF8EE for review only. No text, no
watermark.

text, logo, watermark, brand name, QR code, black thick outline, saturated
colors, neon, long drop shadow, outer glow, specular highlight, 3D render,
photorealistic, textured canvas background, grid lines, white background,
border, frame, blurry, cropped subject, multiple views, 4 rotations
```

**`prop_umbrella` 长柄伞（1×5 横，画布 480×96）：** 同上 Style Block，Object Block 换为：

```text
A closed long-handled umbrella lying HORIZONTALLY as a 1-row, 5-column
strip. Slim body, small curved wooden handle at one end, fabric suggested by
a vertical gradient only: #C4F0DE top → #89CCB9 middle → #5FB3A4 bottom, with
one cream #F3FFF7 highlight stripe along the shaft and a tiny pink #F8ABBE
handle tip. Shaft in warm light brown #C2A28A / #E0AE91. The strip must stay
perfectly straight — this item occupies five grid cells in a row.
```
Spec Block 用 `480x96`，其余段不变。

**`prop_07_A` 长柄伞（5×1 竖，画布 96×480）：** Object Block 换为：

```text
A closed long-handled umbrella standing VERTICALLY as a 5-row, 1-column
strip. Same colors and handle design as the horizontal version, but the
object is tall and narrow, filling five cells in a single column.
```
Spec Block 用 `96x480`，其余段不变。

### 5.6 63 件物品清单（Object Block 素材）

> 形状列为 **行×列**，画布 = 列×96 × 行×96。`布局`列（V1.3 新增）= **cells 足迹 ASCII**（X=占格，.=非占格）——**非占格区域必须完全透明**：物品占格是多联骨牌，异形件画成满矩形会盖住不属于它的格子（M4-6 用户真机反馈「L 型占格配矩形图」）；出图后由 `art-batch-proc.mjs fit` 自动挖除非占格，`npm run check:art` 剪影门禁验收。`rot` = 数据是否允许旋转（不影响出图张数）。
> **同名不同 itemType 必须按「变体提示」画出可区分差异。**
> **`家族`列（V1.2 新增）= 5.2 色相家族分配，M4-3 按表执行**；`状态`列：✅ = 已交付且合格（**含透明底与剪影**——其中 11 张于 2026-10-17 经描边抠图修复「均匀灰底假透明」回归，14 张异形件于 2026-10-19 经 M4-6 足迹遮罩烘焙，过程见 `art/ASSET-STATUS.md` §2/§6），可直接作 image reference；⬜ = 待产（当前 **25 ✅ / 38 ⬜**，2026-10-17 23:4x 批次推进 8 张）。

| itemType | 中文名 | 英文对象描述 | 变体提示 | 形状 | 布局 | 画布 px | 家族 | 状态 | rot |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prop_01_A` | 手机 | closed smartphone, horizontal | 横放，粉边 | 1×2 | XX | 192×96 | R | ✅ | 否 |
| `prop_01_B` | 钱包 | bi-fold wallet | 竖放短款 | 2×1 | X/X | 96×192 | M | ✅ | 否 |
| `prop_01_C` | 墨镜 | folded sunglasses | 横放折起 | 1×2 | XX | 192×96 | B | ✅ | 否 |
| `prop_01_D` | 折叠雨伞 | compact folded umbrella | 横放短折叠 | 1×3 | XXX | 288×96 | M+R | ✅ | 否 |
| `prop_02_A` | 帆布袋 | canvas tote bag | 方鼓形，双提手 | 2×2 | XX/X. | 192×192 | C | ✅ | 否 |
| `prop_02_B` | 雨伞 | closed umbrella, short | 竖放 | 2×1 | X/X | 96×192 | C+B | ✅ | 否 |
| `prop_02_C` | 耳机 | over-ear headphones | 竖放，耳罩朝前 | 2×1 | X/X | 96×192 | C+R | ✅ | 否 |
| `prop_02_D` | 旅行手账 | travel notebook with band | 方本，绑带 | 2×2 | X./XX | 192×192 | C+B | ✅ | 否 |
| `prop_04_A` | 薄外套 | light jacket, folded flat | 横长折叠 | 2×4 | XXXX/...X | 384×192 | C+M | ✅ | 是 |
| `prop_04_B` | 旅行相机 | compact travel camera | 横放，带腕带 | 3×2 | XX/.X/.X | 192×288 | C+R+B | ✅ | 是 |
| `prop_04_C` | 眼镜盒 | round hard glasses case | 圆盒横放 | 2×2 | XX/X. | 192×192 | C+R | ✅ | 是 |
| `prop_04_D` | 收纳袋 | mesh organizer pouch | 网纱半透明 | 2×3 | X../XXX | 288×192 | C+M | ✅ | 是 |
| `prop_04_E` | 口红 | lipstick bullet in tube | 竖放单支 | 2×1 | X/X | 96×192 | R 深 | ✅ | 是 |
| `prop_04_F` | 护照 | passport booklet | 横放，微开 | 1×2 | XX | 192×96 | N 深 | ✅ | 是 |
| `prop_05_A` | 长裙 | long dress | 碎花图案 | 3×3 | ..X/..X/XXX | 288×288 | R 浅 | ✅ | 是 |
| `prop_05_B` | 旅行手提袋 | travel handbag | 横长，提手在两侧 | 2×3 | XXX/XX. | 288×192 | C | ✅ | 是 |
| `prop_05_C` | 高跟鞋 | pair of high heels | 一双横并 | 2×2 | X./XX | 192×192 | N | ✅ | 是 |
| `prop_05_D` | 化妆包 | makeup bag, open with brush | 开盖露笔刷 | 2×3 | .X./XXX | 288×192 | R 浅 | ✅ | 是 |
| `prop_05_E` | 香水 | round perfume bottle | 圆瓶，宽肩 | 2×2 | XX/X. | 192×192 | B 浅 | ✅ | 是 |
| `prop_05_F` | 发饰 | hair clip set | 横放三枚发夹 | 3×2 | XX/.X/.X | 192×288 | M | ✅ | 是 |
| `prop_06_A` | 长裙 | long dress | 条纹图案（区别于 prop_05_A） | 3×3 | X../X../XXX | 288×288 | R 深 | ⬜ | 是 |
| `prop_06_B` | 手提袋 | handbag, upright | 竖立，单提手 | 3×2 | X./XX/XX | 192×288 | N | ⬜ | 是 |
| `prop_06_C` | 高跟鞋 | single stiletto pump | 单只竖放 | 2×3 | XXX/X.. | 288×192 | N | ⬜ | 是 |
| `prop_06_D` | 防晒套装 | sunscreen kit | 瓶+盒组合 | 2×2 | X./XX | 192×192 | B 浅 | ⬜ | 是 |
| `prop_06_E` | 香水 | tall perfume bottle | 高瓶窄肩（区别于 prop_05_E） | 2×2 | XX/.X | 192×192 | B 深 | ⬜ | 是 |
| `prop_06_F` | 旅行收纳袋 | slim travel organizer strip | 横长扁条 | 1×3 | XXX | 288×96 | M 深 | ⬜ | 是 |
| `prop_07_A` | 长柄伞 | closed long umbrella, vertical | 竖放（与 prop_umbrella 同款异向） | 5×1 | X/X/X/X/X | 96×480 | M 深 | ✅ | 是 |
| `prop_07_B` | 三脚架 | mini tripod, legs folded | 竖放细长 | 4×1 | X/X/X/X | 96×384 | N | ⬜ | 是 |
| `prop_07_C` | 针织衫 | knit sweater, folded stack | 叠放三件 | 3×3 | XXX/..X/..X | 288×288 | C | ⬜ | 是 |
| `prop_07_D` | 方形收纳袋 | square pouch with zip | 方正拉链袋 | 2×2 | XX/XX | 192×192 | M 浅 | ⬜ | 是 |
| `prop_07_E` | 折叠围巾 | folded scarf, square | 方折围巾 | 2×2 | .X/XX | 192×192 | R 浅 | ⬜ | 是 |
| `prop_07_F` | 相机 | retro instant camera | 复古拍立得 | 2×2 | XX/XX | 192×192 | B 浅 | ⬜ | 是 |
| `prop_07_G` | 鞋盒 | shoe box | 长盒，带盖缝 | 2×2 | XX/X. | 192×192 | C 中 | ⬜ | 是 |
| `prop_07_H` | 护照 | passport booklet, standing | 竖立（区别于 prop_04_F） | 2×1 | X/X | 96×192 | N 深 | ⬜ | 是 |
| `prop_08_A` | 旅行外套 | travel coat, folded vertical | 竖长折叠 | 3×1 | X/X/X | 96×288 | C | ⬜ | 是 |
| `prop_08_B` | 护肤包 | skincare pouch | 圆角软袋 | 2×2 | X./XX | 192×192 | M 浅 | ⬜ | 是 |
| `prop_08_C` | 折叠衣物 | folded clothes stack | 叠放 T 恤两件 | 2×3 | ..X/XXX | 288×192 | C | ⬜ | 是 |
| `prop_08_D` | 针织衫 | knit sweater, folded flat | 平折一件 | 2×2 | XX/X. | 192×192 | R 浅 | ⬜ | 是 |
| `prop_08_E` | 收纳盒 | storage box, open lid | 开盖方盒 | 2×2 | XX/X. | 192×192 | B 浅 | ⬜ | 是 |
| `prop_08_F` | 洗漱包 | hanging toiletry kit | 挂式，带挂钩 | 2×3 | XX./XXX | 288×192 | R 深 | ⬜ | 是 |
| `prop_08_G` | 相机包 | soft camera bag | 软包圆角 | 2×2 | XX/XX | 192×192 | N | ⬜ | 是 |
| `prop_09_A` | 旅行套装 | travel kit set | 三件套组合 | 3×3 | X../X../XXX | 288×288 | C | ⬜ | 是 |
| `prop_09_B` | 化妆包 | zipped makeup pouch | 拉链扁平袋 | 2×2 | XX/XX | 192×192 | R 浅 | ⬜ | 是 |
| `prop_09_C` | 衬衫 | shirt, folded | 横放折领 | 3×2 | X./X./XX | 192×288 | B 浅 | ⬜ | 是 |
| `prop_09_D` | 连衣裙 | summer dress | 竖长裙摆 | 2×3 | XXX/X.. | 288×192 | M 浅 | ⬜ | 是 |
| `prop_09_E` | 卷发棒 | curling iron | 横放细长 | 1×3 | XXX | 288×96 | N 深 | ⬜ | 是 |
| `prop_09_F` | 鞋袋 | shoe bag with drawstring | 竖长束口袋 | 3×2 | .X/.X/XX | 192×288 | C 中 | ⬜ | 是 |
| `prop_09_G` | 护肤包 | toiletry kit pouch | 方盒硬挺（区别于 prop_08_B） | 2×2 | XX/.X | 192×192 | B 深 | ⬜ | 是 |
| `prop_09_H` | 相机 | compact mirrorless camera | 现代微单 | 2×2 | XX/XX | 192×192 | N 深 | ⬜ | 是 |
| `prop_09_I` | 洗漱包 | travel wash bag | 方桶形（区别于 prop_08_F） | 2×3 | .X./XXX | 288×192 | M 深 | ⬜ | 是 |
| `prop_10_A` | 旅行外套 | coat on hanger | 横长挂衣 | 4×2 | X./X./X./XX | 192×384 | C | ⬜ | 是 |
| `prop_10_B` | 相机包 | hard-shell camera case | 硬壳方盒 | 2×2 | XX/XX | 192×192 | N 深 | ⬜ | 是 |
| `prop_10_C` | 针织衫 | knit sweater, hanging | 挂起垂坠 | 2×3 | X../XXX | 288×192 | R 浅 | ⬜ | 是 |
| `prop_10_D` | 旅行鞋 | pair of travel shoes | 一双鞋并排 | 2×3 | XXX/..X | 288×192 | C | ⬜ | 是 |
| `prop_10_E` | 护肤包 | cosmetic bag | 圆筒形（区别于另两款） | 2×2 | XX/XX | 192×192 | R 深 | ⬜ | 是 |
| `prop_10_F` | 香水盒 | square perfume box | 方盒横放 | 1×2 | XX | 192×96 | B | ⬜ | 是 |
| `prop_10_G` | 长围巾 | wool scarf, folded | 厚折围巾 | 2×3 | ..X/XXX | 288×192 | M 浅 | ⬜ | 是 |
| `prop_10_H` | 眼镜盒 | slim glasses sleeve | 扁长套 | 2×1 | X/X | 96×192 | N | ⬜ | 是 |
| `prop_10_I` | 登机牌夹 | boarding pass holder | 竖长票夹 | 3×1 | X/X/X | 96×288 | B 深 | ⬜ | 是 |
| `prop_jacket` | 折叠外套 | folding jacket | 折起成方块 | 2×3 | X../XXX | 288×192 | C+R | ✅ | 是 |
| `prop_pouch` | 收纳袋 | zip pouch | 通用拉链袋 | 2×3 | XX./.XX | 288×192 | C+B | ✅ | 是 |
| `prop_scarf` | 长围巾 | knitted long scarf strip | 横长条针织 | 1×3 | XXX | 288×96 | C+M | ✅ | 是 |
| `prop_umbrella` | 长柄伞 | closed long umbrella, horizontal | 横放（与 prop_07_A 同款异向） | 1×5 | XXXXX | 480×96 | M 深 | ✅ | 是 |

**重名区分速查：**

| 名称 | itemType | 区分方式 |
| --- | --- | --- |
| 长裙 | `prop_05_A` / `prop_06_A` | 碎花 vs 条纹 |
| 高跟鞋 | `prop_05_C` / `prop_06_C` | 一双并排 vs 单只竖放 |
| 香水/香水盒 | `prop_05_E` / `prop_06_E` / `prop_10_F` | 圆瓶 / 高瓶 / 方盒 |
| 护照 | `prop_04_F` / `prop_07_H` | 横放微开 vs 竖立 |
| 相机 | `prop_07_F` / `prop_09_H` | 拍立得复古 vs 现代微单 |
| 相机包 | `prop_08_G` / `prop_10_B` | 软包 vs 硬壳 |
| 针织衫 | `prop_07_C` / `prop_08_D` / `prop_10_C` | 叠三件 / 平折一件 / 挂起 |
| 护肤包 | `prop_08_B` / `prop_09_G` / `prop_10_E` | 软袋 / 方盒 / 圆筒 |
| 化妆包 | `prop_05_D` / `prop_09_B` | 开盖露笔刷 / 拉链扁平 |
| 洗漱包 | `prop_08_F` / `prop_09_I` | 挂式 / 方桶形 |
| 旅行外套 | `prop_08_A` / `prop_10_A` / `prop_jacket` | 竖长折 / 横长挂衣 / 折方块 |
| 眼镜盒 | `prop_04_C` / `prop_10_H` | 圆盒 / 扁长套 |
| 长围巾 | `prop_scarf` / `prop_10_G` | 横长条针织 / 厚折 |
| 收纳袋 | `prop_04_D` / `prop_pouch` | 网纱 / 通用拉链 |
| 长柄伞 | `prop_umbrella` / `prop_07_A` | 横 / 竖（同款异向） |

### 5.7 批次计划（每批 ≤10 张；V1.2 按当前进度刷新）

| 批次 | 物品 | 张数 | 状态 |
| --- | --- | --- | --- |
| B0 锚点 | `prop_01_A`、`prop_umbrella` | 2 | ✅ 已交付且合格 |
| B1 | L1 四件 + `prop_02_A/B/C/D` | 8 | ✅ 已交付且合格（10-17 灰底假透明回归已修复，见 5.7 下方记档） |
| B2 | `prop_scarf`、`prop_jacket`、`prop_pouch`、L4 六件 | 9 | ✅ 9/9（`prop_04_E/F` 于 10-17 补齐） |
| B3 | L5、L6 全部 | 12 | ◐ 6/12（L5 六件已交付；L6 待产） |
| B4 | L7 全部 | 8 | ◐ 1/8（`prop_07_A` 已交付） |
| B5 | L8、L9 全部 | 16 | ⬜ 待产（拆 8+8 跑） |
| B6 | L10 全部 | 9 | ⬜ 待产 |
| B7 | UI 组件（见 5.9） | 7 类 | ⬜ 待产，与物品图分开跑 |

> 每批开跑前对照 5.6「家族」列做同关分配合规检查（≥3 家族/关、同家族 ≤2 件、≥1 重色）。
>
> **⚠️ V1.2 声明更正（2026-10-17 M4-3 复审）**：V1.2 初版在此声称「已交付 17 张的家族分配已按此校验通过」——**失实，已删除**。逐关实核（按 5.6 家族列 + `art/review-pixels.py` 实测主色）结果：
>
> | 关卡 | 家族分布（含 accent 计入） | ≥3 家族 | 同家族 ≤2 | ≥1 重色件 | 结论 |
> | --- | --- | --- | --- | --- | --- |
> | L1 | R×2、M×2、B×1 | ✓ | ✓ | ✗ 四件全浅档 | ❌ 部分违规 |
> | L2 | C×4、B×2、R×1 | ✓ | ❌ C×4 | ✗ | ❌ 违规 |
> | L3 | C×3、M×2、R×1、B×1 | ✓ | ❌ C×3 | ✓（umbrella 深档） | ❌ 违规 |
> | L4 | C×4、M×2、R×2、B×1 | ✓ | ❌ C×4 | ✗ | ❌ 违规 |
>
> **背景与处置**：这 17 张产出时（10-13～10-16）5.2 家族规则尚未定稿（V1.2 才锚定），违规是历史批次未按规则分配所致，**不是画面事故**（真机试玩 L1~L3 无可辨性投诉，A-02 已裁决「色相+描边」方案）。L5~L10 待产分配（5.6 表）按规则构造，合规。**不阻塞 M4-3 放量**；补救选项（把 L2/L3/L4 部分 C 家族件改绘成 R/B/N 深档，或对 L1/L2/L4 补重色件）列入 M4-6 候选，需美术回执后执行。

### 5.8 必须人工精修的 6 处（不能交给模型收尾）

| # | 位置 | 判定标准 |
| --- | --- | --- |
| 1 | 文字 / Logo / 水印残留 | 放大 400% 逐块查，出现即重画该区域 |
| 2 | 白边 / 灰边（假透明） | 在 `#FFF8EE` 底上叠放，边缘出现亮环即返工 |
| 3 | 光源方向 | 所有物品高光在左上、阴影在右下，不一致的旋转/翻转处理 |
| 4 | 1 格物品可读性 | 缩到 25% 看，读不出是什么就加细节（不许加文字） |
| 5 | 越界与出血 | 主体超出包围盒 → 重画；出血 >10% → 裁掉 |
| 6 | 同名变体辨识度 | 同批两件同名物品并排放，1 秒内说不出区别 → 加强变体 |

**交付前最后一道：**

```bash
npm run check:art          # 覆盖率 / 尺寸 / 朝向 / 孤儿文件
npm run check:art:strict   # 63 张齐全且合格才 exit 0（M4 收尾门禁）
```

### 5.9 UI 组件提示词（B7）

```text
Cream travel journal UI asset: soft hand-drawn feel, rounded corners, low
saturation palette from #FFF8EE background, #FFE0E7/#BCEAD5/#BDE4F7 surfaces,
#7A5C4F warm brown outline max 2px, #FA91A8 pink accent for primary actions.
Flat with slight volume. Transparent background, PNG-24.
```

| 组件 | 尺寸建议 | 要点 |
| --- | --- | --- |
| PrimaryButton | 9-slice 可用底图 | 默认/按下/禁用三态；圆角 18px；热区 ≥44px |
| ToolButton ×3 | 88×88（含热区） | 撤回/旋转/提示图标，线宽 3px@2x |
| SuitcaseFrame | 按屏宽，分层 | 空/游戏中/合盖三态；内棋盘预留缩放 |
| LevelTile | 128×128 | 已完成/当前/锁定三态；圆角 24px |
| SuccessOverlay | 半透明遮罩 + 元素 | 遮罩 `#433B40` 30%，禁背景误触 |
| GuideOverlay | 全屏蒙层 + 手势 | 手指示意 + 蒙层高亮，不拦截拖拽 |
| ConfirmDialog | 560×320 | 轻确认，确认/取消双按钮 |

> UI 组件优先复用 9-slice 与程序绘制，**不要为每个按钮出一张整图**。

### 5.10 出图参数建议（不确定处以模型官方文档为准）

| 参数 | 建议 |
| --- | --- |
| 尺寸 | 按 5.6 画布值；模型上限不足时用最近上限再缩放，缩放后**必须**重新跑 check-art |
| 比例 | 严格按画布比例（1:2、2:1、1:5…），比例错 = 朝向错 |
| 透明底 | 优先模型原生 alpha；否则出纯色底后**用工具去底**，不许手工涂抹（白边主来源） |
| 参考图 | 已确认的锚点图作为 image reference，这是保持 63 张一致性的关键 |
| 批量 | 每批 ≤10 张，一批翻车损失可控 |

> **模型能力边界需人工确认、不臆断：** 是否支持精确画布尺寸、是否支持 alpha 输出、是否支持参考图——以所用模型当前版本文档为准。支持不了的项目改用「出纯色底 + 工具去底 + 人工裁边」。

### 5.11 实测出图流水线（2026-10-17 批次起，B2 收尾 + B3 前六张验证）

> 结论先行：**本机图像模型给不出真透明底**（请求 `background=transparent` 仍返回 colorType 2 的无 alpha RGB，甚至把「透明棋盘格」直接画进像素）。因此流水线固定为「文本生成 → 阈值抠底 → 裁边 → 面积平均缩放 → 居中合版 → **足迹遮罩**（M4-6 新增）→ 量化 → check-art」。

**脚本（已在仓库，剩余 38 张直接复用）**：

```bash
# 1) 生成：ImageGen，提示词 = 5.1 Style Block + 5.11 批次补充段 + 5.6 的 Object Block + Spec/Output
#    （Object Block 必须带 5.6 表的「布局」列；异形件按 X/. 布局描述主体位置）
# 2) 后处理：抠底 + 缩放到画布 + **足迹遮罩（自动，从 levels.json 推导）** + 量化，一条命令写进 sprites/props/
#    W/H 省略时自动按足迹包围盒推导；--no-mask 可跳过遮罩（仅调试用）
node tools/art-batch-proc.mjs fit <raw.png> <itemType> <W> <H> 10
# 3) 验规格（尺寸/命名/朝向/透明底/**剪影 = cells 足迹**）
npm run check:art
# 4) 观感比对（奶油底接触表，2~3x）
node tools/art-contact-sheet.mjs <out.png> 3 <新图.png> <参考锚点.png> ...

# 按格分块拼版（M4-6c 裁剪残缺修复）：每块单独出图后精确摆进占格区，**从根上不存在切割**
# 块规格 r,c,h,w = 占格左上角行/列 + 块高/宽（格数）；每块一张 part 图（cream 底，compose 内自动抠底）
node tools/art-batch-proc.mjs compose <itemType> 'r,c,h,w=part.png' [...] [--bleed 6] [--tol 30] [--out <path>]
# 渲染灰色足迹引导图（可选，给 image-to-image 用）
node tools/art-batch-proc.mjs guide <itemType> <outPath> [--scale 2] [--bg r,g,b] [--fill r,g,b]
```

> **M4-6 追溯修复（已交付图补挖遮罩）**：对已写盘的 PNG 补烘焙足迹遮罩（不动其余像素），
> `node tools/art-batch-proc.mjs mask <itemType>`（`--dry-run` 只看挖除量不写盘）。
> 14 张异形件（prop_02_A/D、prop_jacket、prop_pouch、prop_04_A~F、prop_05_A~F）已于
> 2026-10-19 烘焙，挖除量 5.2%~23.5%，`check:art` 剪影门禁全过。

> **M4-6c 拼版修复（裁剪残缺 / 复制式重复）**：用户真机看图后挑出两类问题——① 7 张异形件（prop_jacket、prop_04_A/B/D、prop_05_A/B/D）被 `fit` 的足迹遮罩**硬切残**（AI 把物品画得比 cells 大，遮罩按格边界切掉主体，出现直线缺口）；② 2 张（prop_pouch、prop_05_F）是**复制粘贴式重复**（图中同一物品被重复，不像独立物件）。
> 根因：单物体重绘路线下，AI 无法稳定把单一物体比例对齐多联骨牌，硬遮罩必然切残；提示词又容易把「一套物品」画成同一件的复制。
> 对策：`tools/art-batch-proc.mjs` 新增 `guide`（渲染灰色足迹引导图）与 `compose`（**按格分块拼版**）两个子命令。`compose` 把每个占格区拆成 1~2 个矩形块，每块单独出图（语义自然：帽兜+衣身、相机+腕带、裙身+衣摆…），按内容包围盒**非等比**缩放进目标矩形并 alpha 混合拼版，最后 `applyFootprintMask` 只清 bleed 溢出——**从根上不存在切割**。逐边出血：邻边整列/整行是占格 → 多出血（默认 6px）让两块无缝衔接；邻接空格 → 只留 1px 防切主体。
> 结果：7 张残缺件按块重出后 compose，挖除均 ≤0.3%（剪影严格 = 足迹，物品完整）；2 张重复件改为差异化——prop_pouch = 灰白织物拉链袋（上块 `0,0,1,2`）+ 蓝拉链袋（下块 `1,1,1,2`）两款不同收纳袋；prop_05_F = 4 枚不同发夹（浅 mint 抓夹 / 中 teal 发条 / 深 teal 弹簧夹 / 浅 mint 蝴蝶夹）各占一格。
> 注意：每块 part 仍需**串行** ImageGen（并行会撞名覆盖，见下方「并行出图的坑」）；每块一张独立 `output_dir`。

| 环节 | 做法 | 为什么（实测依据） |
| --- | --- | --- |
| 生成尺寸 | 取与画布比例最接近的模型上限（1:2→1024×1536、3:2→1536×1024、1:1→1024×1024），绝不直接要 96/288 这类小尺寸 | 模型不接受精确小画布；按最近上限出图再缩放，缩放后必须重跑 `check:art` |
| 背景 | 提示词明确「纯白平坦背景 + 无渐变 / 无暗角 / 无棋盘格 / 无纹理」 | 两批实测背景都是 255→231 的渐变近白；写「白底」反而稳定 |
| 抠底 | **阈值 + 边缘连通**：近白（min 通道 ≥205）且低饱和（max−min ≤26）的像素中，**只挖与画布边缘连通的那一片** | 渐变背景用全局容差洪水填不动（首次只挖掉 4 万/157 万 px）；物体内部被棕色描边围住的高光/白屏不会被挖 |
| 光晕 | 邻接被挖区的实色像素按 `p = a·fg + (1−a)·bg` 反解 alpha 并 unflatten | 白底抠图必留 1~2px 灰边，不反解会在缩略图上显脏 |
| 碎块 | 只保留 ≥ 最大连通域 6% 的成分 | 模型偶尔把水印（「AI生成…」）画在角落，会撑偏包围盒 |
| 投影 | **提示词侧禁止**（`no ground shadow, no cast shadow`）；后处理不做自动去投影 | C 家族织物就是 `#E5E5E5`（彩度 0、L=0.898），与浅灰投影颜色上不可分——实测自动去投影把 `prop_05_B` 包体误删 45.8 万 px |
| 缩放 | 面积平均（box filter，预乘 alpha 后归一化） | 1024→96 是 10:1 的缩小，双线性会出锯齿；`预乘分子用 0–255、分母用 0–1` 会让整图变黑（踩过） |
| 合版 | 等比缩到「画布 − 2×margin」内后**居中**，margin 8~10 | 居中必须基于抠图后的真实包围盒；残留碎块会让物体整体偏到一边 |
| 足迹遮罩（M4-6） | 合版后、量化前：按 levels.json 的 cells 把**非占格区域** alpha 置 0（硬切，格边界即像素边界） | 异形件（37/63 非矩形）的 AI 图天然填满包围盒，不挖就会盖住不属于它的格子——用户真机反馈「拖拽时长方形、落盘变 other shape」；量化建调色板只收 alpha>8 像素，被挖像素不进调色板 |
| 量化 | **16 色调色板（median cut）+ alpha 16 级**，`QN` 可调 | 面积平均缩放保留 AI 的柔和渐变、颜色种类暴增：不量化 36KB/张，63 张会顶到 3.5MB；16 色后 11.7KB/张，肉眼无差 |

**并行出图的坑（必踩）**：同一批并行调用的文件名由「提示词前缀 + 秒级时间戳」拼成，**同秒会互相覆盖**（本次 `prop_05_C` 被 `prop_05_B` 覆盖后丢失）。对策：每张给独立 `output_dir`，出图后立刻改成稳定名。

**提示词批次补充段（每张都带，放在 Style Block 之后）：**

```text
Batch rules: flat sticker look, warm brown outline about 1.5px at a 96px cell,
flat pastel fills with at most one soft lighter highlight, no ground shadow,
no cast shadow. Background: plain flat pale off-white #F7F6F3, absolutely no
gradient, no vignette, no checkerboard or transparency grid, no texture.
```

> 该段是对 5.1 Style Block 的**收紧而非改写**（Style Block 逐字保留）。收紧原因见上表：`slight volume shading` 会被模型放大成 3D 厚涂、`short light shadow` 会被画成地面投影，两批实测都出现过。新增负面词：`dark maroon`（首张口红被画成深枣红，L=0.401，掉出 R 家族）、`checkerboard / transparency grid`、`watermark / signature`、`thin vertical slivers`。

**已确认的家族色实测（供后续批次对表）**：R 深实测落在 `#E08890`(L=0.609)~`#F890A8`(L=0.658)，**不是** `#FA91A8` 的暗色版；N 家族 `#C2A28A` 在文档的线性亮度口径下 L≈0.40，天然充当「重色压阵」件——L5 的 `prop_05_C` 即靠它满足规则 3。

**产出物归档（每批次收尾必做）**：原图默认落在 `/tmp`，不归档就会丢，且丢的是「以后想重抠 / 想对风格」的唯一依据。

| 产物 | 落点 | 做法 |
| --- | --- | --- |
| 逐件提示词（Object Block + 生成参数 + 后处理命令 + 踩坑备注） | `art/art-source/props/ai/<itemType>.prompt.md` | 照 `ai/README.md` 的模板写；公共 Style Block **不复制**，只写差异段 |
| 生成原图（白底未抠） | `art/previews/props/<itemType>_reference.jpg` | `sips -s format jpeg -Z 512 <raw.png> --out <target>`（长边 512；原图 1–2MB/张，全量存会到 ~80MB） |
| 成品（透明底） | `assets/resources/sprites/props/<itemType>.png` | `art-batch-proc.mjs fit` 已直接写入 |

> **不产 SVG**：AI 件没有矢量源，硬把成品矢量化只是对 16 色量化结果的二次近似（边缘失真、光晕丢失、体积不减），属于会误导后人的假源。可重新生成的最小输入是提示词，已落在 `ai/*.prompt.md`。手绘件（`prop_01_A/B`、`prop_07_A`）的 SVG 仍在 `art-source/props/` 根目录。

