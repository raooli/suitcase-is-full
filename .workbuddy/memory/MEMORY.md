# 项目长期记忆 —— 《行李箱装不下啦！》

> 只记「跨会话仍然成立」的约定与手法。日常进展写 `YYYY-MM-DD.md`。

## 工程基线

- **Cocos Creator 3.8.8**（`/Applications/Cocos/Creator/3.8.8/`），锁版本；设计分辨率 **390×844 + Fit Width**（`settings/v2/packages/project.json`）。
- **分层**：`assets/core/`（零 `cc`、纯逻辑、可 Vitest）↔ `assets/view/`（唯一允许 `import 'cc'`）。core 只从 `core/index.ts` 对外（R-A3）。
- **守卫**（`npm run check:arch`，改规则要同步 `docs/06` §1.2/§1.3）：R-A1 core 无 cc；R-A3 禁深引 core 内部；R-A4 wx 只在 platform；**R-A6 格算术（`cellSize`/`cellPx`）只许出现在 `view/BoardView.ts` 与 `core/config.ts`**；R-A9 assets 只放运行时资源；**R-A10 禁 `[...x]` 展开语法**（Cocos loose 转译会降级成 `[x]`，症状是"单测全绿、引擎里数据错"，一律 `Array.from`）。
- **参数只改 `core/config.ts`**（布局/阈值/色板/明度倍率），禁止魔法数字散落。

## 交付纪律（每个任务）

1. `npm run check`（typecheck + check:arch + verify:levels + vitest）；
2. `npm run preview:game`（= CLI 构建 Game 场景 + 无头预览，有 error 即失败）；
3. 双绿才提交；CHANGELOG 追加一条（一 commit 一条，倒序，文件用 `git show --stat` 核对）。

> 注意：`typecheck`（tsconfig.node.json）**不含 `assets/view/`**——view 的类型错误只有"构建"这一关能抓，所以预览不可省。

## 无 GUI 预览与取证手法

- 构建/预览坑：`env -u ELECTRON_RUN_AS_NODE`、`ELECTRON_DISABLE_SANDBOX=1`；编辑器退出码恒 36（关闭期 SIGTERM），以日志 `build Task (web-mobile) Finished in` 判成功。
- `node tools/preview-check.mjs --scene Game [--shot out.png] [--grep X]`；复现现有构建可省 `--scene`。
- **像素级核对**（比目测可靠）：写个纯 stdlib PNG 解码 + 扫描线找色块中心，比对格中心（例：色块中心 149.5/359.5/569.5 ↔ 格中心 150/360/570）。
- **负向验证**：改阈值（如 `CELL_PX_MIN`）故意触发告警分支，确认它真的会报，然后回退。

## 已确认、不得擅自改的规格

- 色号 = UI Spec 4 节 Design Tokens（`UI_PALETTE`）。**派生只允许压明度、不许改色相**；改色号属改已确认设计，须过美术确认。
- P-04：格边长硬下限 **44px**（320px 屏物理口径）；短屏压缩顺序 tray → toolbar/header → margin → （最后才）降下限且需 ADR。
- TDD 17.4 占位策略：按最终包围盒尺寸绘制、2px brown 描边、真图 M4-5 替换时结构不动（`ItemView.setSpriteFrame()` 是桩）。
- 命名：`GameController`（不是 `GameScene`，避免与 `cc.Scene`/`Game.scene` 撞名）。
