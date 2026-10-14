#!/usr/bin/env node
/**
 * 场景构建器 —— 无 GUI 环境下 `.scene` 的**可复现**作者工具。
 *
 * ## 为什么需要它
 *
 * `05-实施计划` 1.4 节第 2 条要求「不在 VSCode 里手改 .scene」。但本项目的自动化
 * 工作流里没有 GUI 编辑器，`.scene` 又必须存在（组件要挂上去才会 onLoad）。
 * 于是把「生成场景」变成一份**可审计的声明式规格**：节点树与组件挂载写在下面
 * 的 `SCENES` 里，产物是标准 Cocos 序列化 JSON，编辑器可以正常打开与继续编辑。
 *
 * ## 边界（重要）
 *
 * - 场景只承载**结构节点 + 脚本组件**。网格格子、物品节点这类动态内容由视图
 *   在代码里创建（`new Node()`），不塞进场景——否则场景会变成另一个真相源。
 * - **一旦在 Cocos GUI 里手改过某个场景，就不要再对它运行本工具**（会覆盖）。
 *   约定：场景的真相源 = 本文件；若改用 GUI 编辑，请把本文件里对应的 spec 删掉。
 *
 * ## 事实依据（全部来自本机 3.8.8 安装包的官方模板）
 *
 * - `cc.Camera` / `cc.UITransform` / `cc.Canvas` / `cc.Widget` 的序列化字段：
 *   `templates/taxi/assets/scene/login.scene`（真实可运行的 2D UI 场景）
 * - `SceneGlobals` + AmbientInfo/ShadowsInfo/SkyboxInfo/FogInfo：
 *   `templates/hello-3d-world/assets/scene/main.scene`（3.8.8 编辑器亲写）
 * - 脚本组件的 `__type__` 是**脚本资源的压缩 UUID**（前 5 位 hex 原样 +
 *   其余 27 位 hex 每 3 位转 2 个 base64 字符 = 23 字符）。该算法已用 taxi
 *   模板里 11/11 个脚本组件反向验证通过（见 commit 信息）。
 *
 * 用法：
 *   node tools/scene-build.mjs            # 重新生成全部场景
 *   node tools/scene-build.mjs Game       # 只生成 Game.scene
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CC_RES =
  process.env.COCOS_CREATOR_RESOURCES ??
  '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources';
const TAXI = join(CC_RES, 'templates/taxi/assets/scene/login.scene');
const HELLO = join(CC_RES, 'templates/hello-3d-world/assets/scene/main.scene');

// ───────────────────────── 通用工具 ─────────────────────────

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ID_ALPHABET = BASE64;
const LAYER = { DEFAULT: 1073741824, UI_2D: 33554432 };

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * 22 字符的节点/组件实例 id（与编辑器生成同形）。
 *
 * **按路径确定性派生**，不是随机数——这样重新生成场景时，没改动的节点 id 不变，
 * `git diff` 只反映真实的结构改动（随机 id 会让每次生成都产生整文件 diff）。
 * 路径 = 场景名 + 节点路径 + 组件序号，天然唯一。
 */
function cocosId(seed) {
  const digest = createHash('sha256').update(seed).digest();
  let out = '';
  for (let i = 0; i < 22; i++) out += ID_ALPHABET[digest[i] % ID_ALPHABET.length];
  return out;
}

/**
 * 脚本资源 uuid → 场景里 `__type__` 用的压缩形式。
 * 前 5 位 hex 原样保留，其余 27 位 hex（108 bit）按 6 bit 一组转 base64 → 23 字符。
 */
function compressUuid(uuid) {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error(`uuid 形状不对：${uuid}`);
  const bits = [...hex.slice(5)].map((c) => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  let tail = '';
  for (let i = 0; i < bits.length; i += 6) tail += BASE64[parseInt(bits.slice(i, i + 6), 2)];
  return hex.slice(0, 5) + tail;
}

/** 确定性 uuid（场景自身的 `_id` 用），形状与编辑器生成的 uuid4 一致 */
function deterministicUuid(seed) {
  const h = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 从 `assets/**` 下的资源 meta 里取 uuid */
function assetUuid(relPath) {
  const metaPath = join(ROOT, `${relPath}.meta`);
  if (!existsSync(metaPath)) {
    throw new Error(`缺少 ${relPath}.meta —— 先在 Cocos 里打开一次工程让它导入资源`);
  }
  return readJson(metaPath).uuid;
}

/** 脚本组件的 `__type__` */
function scriptType(relPath) {
  return compressUuid(assetUuid(relPath));
}

/** 资源引用（组件属性里的 `{"__uuid__": ...}`） */
function assetRef(relPath, expectedType) {
  return { __uuid__: assetUuid(relPath), __expectedType__: expectedType };
}

/** cc 基础类型的字面量 */
const vec3 = (x, y, z) => ({ __type__: 'cc.Vec3', x, y, z });
const VEC3_ONE = vec3(1, 1, 1);
const VEC3_ZERO = vec3(0, 0, 0);
const QUAT_IDENTITY = { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 };

// ───────────────────────── 官方模板：引擎亲写的组件序列化 ─────────────────────────

if (!existsSync(TAXI) || !existsSync(HELLO)) {
  console.error(`❌ 找不到 Cocos 官方模板：${CC_RES}\n   可用环境变量 COCOS_CREATOR_RESOURCES 指定 Resources 目录`);
  process.exit(2);
}

const taxi = readJson(TAXI);
const hello = readJson(HELLO);

/** 取 taxi 场景里「挂在名为 nodeName 的节点上、类型为 type 的组件」，并校验形状 */
function taxiComponent(index, type, nodeName) {
  const obj = taxi[index];
  if (!obj || obj.__type__ !== type) throw new Error(`taxi[${index}] 不是 ${type}`);
  const owner = taxi[obj.node.__id__];
  if (owner?._name !== nodeName) throw new Error(`taxi[${index}] 挂在 ${owner?._name} 上，期望 ${nodeName}`);
  return obj;
}

const T = {
  camera: taxiComponent(9, 'cc.Camera', 'Camera'),
  uiCamera: taxiComponent(137, 'cc.Camera', 'UICamera_Canvas'),
  uiTransform: taxiComponent(138, 'cc.UITransform', 'Canvas'),
  canvas: taxiComponent(139, 'cc.Canvas', 'Canvas'),
  widget: taxiComponent(141, 'cc.Widget', 'Canvas'),
};

/** SceneGlobals 四件套（hello-3d-world 里由 3.8.8 编辑器写出） */
const GLOBALS = { globals: hello[173], ambient: hello[174], shadows: hello[175], skybox: hello[176], fog: hello[177] };

// ───────────────────────── 组件工厂 ─────────────────────────

const clone = (o) => JSON.parse(JSON.stringify(o));

/** 引擎内置组件：拿模板对象改 node / _id；`size` 覆盖 UITransform 的初始尺寸 */
function builtin(kind, size) {
  return { kind, template: clone(T[kind]), size };
}

/** 自定义脚本组件 */
function script(className, props = {}) {
  return { script: className, props };
}

/** 组件引用（如 BoardView 属性指向同一场景里另一个脚本组件），构建末尾统一解析 */
function refTo(nodeName, className) {
  return { __ref__: `${nodeName}/${className}` };
}

/** 节点引用（如 DragController 的 gestureRoot 指向 SafeAreaRoot），构建末尾统一解析 */
function nodeRef(nodeName) {
  return { __refNode__: nodeName };
}

// ───────────────────────── 场景装配 ─────────────────────────

/** 设计分辨率 = UI Spec 基准画布 390×844（TDD 11.3 指定，Fit Width） */
const DESIGN = { width: 390, height: 844 };
/** 与 core/config.ts 的 UI 布局常量保持一致（这里只用来定初始尺寸，运行时由脚本改） */
const LAYOUT = { safeMargin: 24, header: 120, tray: 160, toolbar: 96 };

function buildScene(sceneName, rootNodes) {
  const objs = [];

  objs.push({
    __type__: 'cc.SceneAsset',
    _name: '',
    _objFlags: 0,
    _native: '',
    scene: { __id__: 1 },
  });

  objs.push({
    __type__: 'cc.Scene',
    _name: sceneName,
    _objFlags: 0,
    _parent: null,
    _children: [],
    _active: true,
    _components: [],
    _prefab: null,
    autoReleaseAssets: false,
    _globals: null, // 回填
    _id: deterministicUuid(`scene:${sceneName}`),
  });

  const scriptRegistry = new Map();
  const nodeRegistry = new Map();
  const pendingRefs = [];
  const pendingNodeRefs = [];

  const pushComponent = (spec, nodeIndex, seed, nodeName) => {
    let comp;
    if (spec.kind) {
      comp = clone(spec.template);
      if (spec.kind === 'uiTransform') {
        comp._contentSize = {
          __type__: 'cc.Size',
          width: spec.size?.[0] ?? DESIGN.width,
          height: spec.size?.[1] ?? DESIGN.height,
        };
      }
      comp.node = { __id__: nodeIndex };
      comp._id = cocosId(`${seed}.${spec.kind}`);
    } else {
      comp = {
        __type__: scriptType(`assets/view/${spec.script}.ts`),
        _name: '',
        _objFlags: 0,
        node: { __id__: nodeIndex },
        _enabled: true,
        __prefab: null,
        ...spec.props,
        _id: cocosId(`${seed}.${spec.script}`),
      };
      scriptRegistry.set(`${nodeName}/${spec.script}`, objs.length);
      for (const [key, value] of Object.entries(spec.props ?? {})) {
        if (value === null || typeof value !== 'object') continue;
        if ('__ref__' in value) pendingRefs.push({ comp, key, target: value.__ref__ });
        else if ('__refNode__' in value) pendingNodeRefs.push({ comp, key, name: value.__refNode__ });
      }
    }
    objs.push(comp);
    return objs.length - 1;
  };

  const pushNode = (spec, parentIndex, seed) => {
    objs.push({
      __type__: 'cc.Node',
      _name: spec.name,
      _objFlags: 0,
      _parent: { __id__: parentIndex },
      _children: [],
      _active: true,
      _components: [],
      _prefab: null,
      _lpos: vec3(...(spec.pos ?? [0, 0, 0])),
      _lrot: QUAT_IDENTITY,
      _lscale: VEC3_ONE,
      _layer: spec.layer ?? LAYER.DEFAULT,
      _euler: VEC3_ZERO,
      _id: cocosId(`${seed}/${spec.name}`),
    });
    const nodeIndex = objs.length - 1;
    nodeRegistry.set(spec.name, nodeIndex);
    objs[parentIndex]._children.push({ __id__: nodeIndex });

    const canvasIndexes = [];
    for (const comp of spec.components ?? []) {
      const ci = pushComponent(comp, nodeIndex, `${seed}/${spec.name}`, spec.name);
      objs[nodeIndex]._components.push({ __id__: ci });
      if (comp.kind === 'canvas') canvasIndexes.push(ci);
    }
    for (const child of spec.children ?? []) pushNode(child, nodeIndex, `${seed}/${spec.name}`);

    // cc.Canvas 必须指向自己节点下的 UICamera 组件（taxi 实测结构）
    for (const ci of canvasIndexes) {
      const childCameras = objs[nodeIndex]._children.flatMap(({ __id__: childId }) =>
        objs[childId]._components
          .map(({ __id__: compId }) => objs[compId])
          .filter((comp) => comp.__type__ === 'cc.Camera'),
      );
      if (childCameras.length === 0) throw new Error(`${spec.name} 上的 cc.Canvas 找不到 UICamera`);
      const cameraCompId = objs.indexOf(childCameras[0]);
      objs[ci]._cameraComponent = { __id__: cameraCompId };
    }
    return nodeIndex;
  };

  for (const node of rootNodes) pushNode(node, 1, `scene:${sceneName}`);

  // 解析组件引用（必须等整棵树都建完）
  for (const { comp, key, target } of pendingRefs) {
    const index = scriptRegistry.get(target);
    if (index === undefined) throw new Error(`组件引用找不到目标：${target}`);
    comp[key] = { __id__: index };
  }

  // 解析节点引用
  for (const { comp, key, name } of pendingNodeRefs) {
    const index = nodeRegistry.get(name);
    if (index === undefined) throw new Error(`节点引用找不到目标：${name}`);
    comp[key] = { __id__: index };
  }

  // SceneGlobals 放最后，回填 _globals 引用
  const start = objs.length;
  objs.push(clone(GLOBALS.globals), clone(GLOBALS.ambient), clone(GLOBALS.shadows), clone(GLOBALS.skybox), clone(GLOBALS.fog));
  objs[start].ambient = { __id__: start + 1 };
  objs[start].shadows = { __id__: start + 2 };
  objs[start]._skybox = { __id__: start + 3 };
  objs[start].fog = { __id__: start + 4 };
  // SkyboxInfo 指向的是 hello 模板自带的 HDR 贴图，照抄会带出悬空引用（构建期报
  // 「Asset used by node is missing」），2D 工程用不到天空盒 → 置空并禁用。
  objs[start + 3]._envmap = null;
  objs[start + 3]._enabled = false;
  objs[1]._globals = { __id__: start };

  return objs;
}

// ───────────────────────── 场景规格 ─────────────────────────

const BOARD_AREA = {
  width: DESIGN.width - LAYOUT.safeMargin * 2,
  height: DESIGN.height - LAYOUT.header - LAYOUT.tray - LAYOUT.toolbar,
};

const cameraNode = () => ({
  name: 'Camera',
  pos: [0, 0, 1000],
  components: [builtin('camera')],
});

/** 内容根：UI Spec 9 节要求 Canvas → SafeAreaRoot → Header/Board/Tray/Toolbar/Overlay */
const safeAreaRootNode = (children = []) => ({
  name: 'SafeAreaRoot',
  layer: LAYER.UI_2D,
  components: [builtin('uiTransform'), builtin('widget')],
  children,
});

/** Canvas 下的内容挂载点；不同场景给不同的子树（Boot/Home 目前还没有内容） */
const canvasNode = (contentRoots = []) => ({
  name: 'Canvas',
  layer: LAYER.UI_2D,
  pos: [DESIGN.width / 2, DESIGN.height / 2, 0],
  components: [builtin('uiTransform'), builtin('canvas'), builtin('widget')],
  children: [
    {
      name: 'UICamera_Canvas',
      pos: [0, 0, 1000],
      components: [builtin('uiCamera')],
    },
    ...contentRoots,
  ],
});

const boardRootNode = () => ({
  // M1-1：棋盘。初始尺寸只是编辑器里的占位，运行时由 BoardView 按关卡动态算
  // M1-6：ItemLayer 与 BoardView 挂同一节点——物品是 BoardRoot 的子节点、
  // 在格子之后创建，天然盖在格子上，且位置直接用 gridToLocal 的 board-local
  // 坐标，不需要第二套换算（R-A6 唯一出口）
  name: 'BoardRoot',
  layer: LAYER.UI_2D,
  components: [
    builtin('uiTransform', [BOARD_AREA.width, BOARD_AREA.height]),
    script('BoardView'),
    script('ItemLayer', { boardView: refTo('BoardRoot', 'BoardView') }),
  ],
});

const trayRootNode = () => ({
  // M1-3：托盘。位置与尺寸同样由 TrayView 在运行时按 config 常量定（与 BoardView 同口径）
  name: 'TrayRoot',
  layer: LAYER.UI_2D,
  components: [
    builtin('uiTransform', [BOARD_AREA.width, LAYOUT.tray - 24]),
    script('TrayView'),
  ],
});

/** 棋盘带中心 y（设计坐标，与 core/config 的 UI_BOARD_BAND_CENTER_Y 同口径） */
const BOARD_BAND_CENTER_Y = (LAYOUT.tray + LAYOUT.toolbar - LAYOUT.header) / 2;

/**
 * M1-5：预览层。挂在棋盘带中心（与 BoardRoot 同位置），Graphics 直接画在 board-local
 * 坐标系里（gridToLocal 给的就是 board-local）。作为 SafeAreaRoot 的子节点、排在
 * BoardRoot 之后，渲染在棋盘格之上。
 */
const previewRootNode = () => ({
  name: 'PreviewRoot',
  layer: LAYER.UI_2D,
  pos: [0, BOARD_BAND_CENTER_Y, 0],
  components: [
    builtin('uiTransform', [BOARD_AREA.width, BOARD_AREA.height]),
    script('PreviewLayer', { boardView: refTo('BoardRoot', 'BoardView') }),
  ],
});

/**
 * M1-7：通关浮层。覆盖整屏（390×844，原点即画布中心），排在 SafeAreaRoot
 * 子节点**最后**——渲染序在最后 = 盖在棋盘/托盘/预览层之上。节点初始
 * active=false（SuccessOverlay.onLoad 里设），未通关时不参与渲染与命中。
 */
const successRootNode = () => ({
  name: 'SuccessRoot',
  layer: LAYER.UI_2D,
  components: [
    builtin('uiTransform', [DESIGN.width, DESIGN.height]),
    script('SuccessOverlay'),
  ],
});

const SCENES = {
  'Boot.scene': {
    sceneName: 'Boot',
    nodes: [cameraNode(), canvasNode()],
  },
  'Home.scene': {
    sceneName: 'Home',
    nodes: [cameraNode(), canvasNode()],
  },
  'Game.scene': {
    sceneName: 'Game',
    nodes: [
      cameraNode(),
      canvasNode([safeAreaRootNode([boardRootNode(), trayRootNode(), previewRootNode(), successRootNode()])]),
      {
        // M1-0：会话引导。与官方 taxi 模板的 GameRoot 同形状（Scene 根节点不带组件）
        // M1-4：拖拽手势也挂在这里——它只用全局 input，不需要自己的节点位置，
        // 但必须在场景里存在才会 onEnable 注册监听。
        name: 'GameRoot',
        components: [
          script('DragController', {
            boardView: refTo('BoardRoot', 'BoardView'),
            trayView: refTo('TrayRoot', 'TrayView'),
            // 手势根节点 = 覆盖整屏的 SafeAreaRoot：手指必须在整次拖拽里都"在"它上面，
            // 否则 Cocos 会在手指移出节点时派发 TOUCH_CANCEL 而不是 TOUCH_END（M1-4 实测）
            gestureRoot: nodeRef('SafeAreaRoot'),
          }),
          script('GameController', {
            levelId: 1,
            levelJson: assetRef('assets/data/levels.json', 'cc.JsonAsset'),
            boardView: refTo('BoardRoot', 'BoardView'),
            trayView: refTo('TrayRoot', 'TrayView'),
            dragController: refTo('GameRoot', 'DragController'),
            previewLayer: refTo('PreviewRoot', 'PreviewLayer'),
            itemLayer: refTo('BoardRoot', 'ItemLayer'),
            successOverlay: refTo('SuccessRoot', 'SuccessOverlay'),
          }),
        ],
      },
    ],
  },
};

// ───────────────────────── main ─────────────────────────

const wanted = process.argv.slice(2).map((name) => (name.endsWith('.scene') ? name : `${name}.scene`));
const names = wanted.length > 0 ? wanted : Object.keys(SCENES);

for (const name of names) {
  const spec = SCENES[name];
  if (!spec) {
    console.error(`❌ 没有名为 ${name} 的场景规格（可选：${Object.keys(SCENES).join(', ')}）`);
    process.exit(2);
  }
  const objs = buildScene(spec.sceneName, spec.nodes);
  const out = join(ROOT, 'assets/scenes', name);
  writeFileSync(out, JSON.stringify(objs, null, 1));
  console.log(`✅ ${name} ← ${spec.nodes.map((n) => n.name).join(' + ')}（${objs.length} 个对象）`);
}
