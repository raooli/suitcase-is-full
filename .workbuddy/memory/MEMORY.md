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
- **Chrome 必须 `--no-sandbox --no-zygote`**：本环境外层（WorkBuddy）沙箱会拦截 Chrome 启动期系统调用，使其 **SIGTRAP 崩溃**、调试端口起了即死、`Runtime.enable` 超时（实测）。关掉 Chrome 内部沙箱后正常。注意 `dangerouslyDisableSandbox` 在本环境被拒、且一次性 escalation 过期后也会失效，**别依赖它兜预览**；`--no-sandbox` 才是稳的。`HOME` 重定向对 RLZ 拦截无效（macOS Chrome 硬编码真实 Application Support）。
- **像素级核对**（比目测可靠）：写个纯 stdlib PNG 解码 + 扫描线找色块中心，比对格中心（例：色块中心 149.5/359.5/569.5 ↔ 格中心 150/360/570）。
- **负向验证**：改阈值（如 `CELL_PX_MIN`）故意触发告警分支，确认它真的会报，然后回退。
- **手势取证**：`--drag x1,y1,x2,y2`（按下 → 8 段**插值** move → 松手；跳变式输入验不出节流与跟手）。
- **三套坐标别混**：`--tap/--drag` 收 **CSS 页面坐标**；引擎 `event.getUILocation()` = **世界坐标**（y 自下而上，`uiY = 844 − pageY`）；**设计坐标**原点在画布中心（`= world − (195,422)`）。`getLocation()` 是设备像素（dsf=2 时 2×），别拿它对设计值。
- **取真实退出码**：用 `cmd > log 2>&1; echo $?`。`cmd | tail` 拿到的是 tail 的码。后台任务状态可能因沙箱拦截 Cocos 编辑器临时文件清理而显示 failed，但脚本自身 EXIT=0——以日志里的「✅ 预览无 Console 错误」+ 退出码为准。
- **「Cocos 编辑器点预览只见棋盘」= 视口纵横比问题，不是代码 bug**：设计 390×844 竖屏 + Fit Width，编辑器预览若在横屏/矮窗里跑，844 高的画布按宽度缩放后远超窗口高，**底部托盘（设计 y ≈ −166~−326）+ 工具栏被裁出视野**。无头夹具固定 390×844 就完整（截图实证棋盘 + 4 托盘物品）。**浏览器试玩**：构建 web-mobile → `cd build/web-mobile && python3 -m http.server 8123`（file:// 会被 ES module CORS 拦）→ 开 `http://localhost:8123/` → DevTools 设备模拟选竖屏 iPhone（390×844）**并开 touch 仿真**（桌面鼠标不触发 TOUCH_*，不开设备模拟拖不动）。

## Cocos 3.8.8 触摸事件的三条实测事实

1. **全局 `input.on(Input.EventType.TOUCH_START)` 在 web-mobile 构建里收不到事件**（onEnable 正常、枚举值正确、refs 都 ok，回调一次都没进）。一律用**节点级** `node.on(Node.EventType.TOUCH_*)`。
2. **整个触摸由「按下时命中的最深节点」认领**；松手点不在该节点内时，引擎把事件类型改成 **TOUCH_CANCEL 而非 TOUCH_END**（`NodeEventProcessor._handleTouchEnd`）。所以**手势监听必须挂在覆盖整屏的节点**（本项目是 `SafeAreaRoot`），子节点（槽位、托盘、棋盘）一概不挂——否则跨区域拖拽永远收不到"松手"。浏览器侧其实是干净的 `touchend`，是引擎侧转换的。
3. **必须 `touch-action: none`**（预览夹具注入；真机/发布模板也要有），否则浏览器接管 pan 手势会派发 `touchcancel`。

推论：**点 vs 拖的仲裁只能有一处**。点选与起拖共用同一次 touchstart，拆到两个组件各判一次必然"拖完松手顺带选中一下"。本项目由 `DragController` 独占（`UI_DRAG_THRESHOLD_PX` 阈值 + `onTap` 出口）。

## 已确认、不得擅自改的规格

- 色号 = UI Spec 4 节 Design Tokens（`UI_PALETTE`）。**派生只允许压明度、不许改色相**；改色号属改已确认设计，须过美术确认。
- P-04：格边长硬下限 **44px**（320px 屏物理口径）；短屏压缩顺序 tray → toolbar/header → margin → （最后才）降下限且需 ADR。
- TDD 17.4 占位策略：按最终包围盒尺寸绘制、2px brown 描边、真图 M4-5 替换时结构不动（`ItemView.setSpriteFrame()` 是桩）。
- 命名：`GameController`（不是 `GameScene`，避免与 `cc.Scene`/`Game.scene` 撞名）。
- **取整语义分场景**（M1-5 实测）：**抓取锚点用按下点算**（与 `grabOffset` 同源，否则格中心 round 不稳会跳到 `[0,-1]`）；**board 命中用 `localToGrid`（floor）**（格中心的点不能 round 进位到右下斜邻格，否则按物品中心抓不起来）；**move 锚点用 `snapToGrid`（round）**（TDD 6.3 裁决）。三处不同是有意的，别"统一"成同一个。
- **Console 取证只看最后 80 行**（`preview-check.mjs` 的 `slice(-80)`）：长手势序列会被截断，靠 `--grep <子串>` 过滤看全量（注意 `--grep` **只打印匹配行**，不过滤时只留尾部；且是**纯子串**匹配、不认 `|` 正则——写 `a|b` 会 0 命中，用单关键词）。`--drag` 第 5 段截图是 touchEnd **前**的中途态；拍终态用独立 `--shot` step。
- **改状态唯一入口 = `dispatch`**（M1-6 定型）：view 一律 `onIntent → GameController.handleIntent → session.dispatch`；重绘只由**真·改状态**事件触发（`state-changed` 每次 dispatch 都带，含 move，拿它当触发器会每移一格全盘重建）。`grab` 不改 state，故拖拽中被拖物品要 `setHiddenItem` 双视图排除（ItemLayer/TrayView）防"原位一份 + ghost 一份"。
