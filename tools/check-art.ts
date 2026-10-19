/**
 * 美术资产校验：用关卡数据反查 `assets/resources/sprites/props/` 的交付状态。
 *
 * 用法：
 *   npx tsx tools/check-art.ts             # 报告模式（缺件只报告，退出码 0）
 *   npx tsx tools/check-art.ts --strict    # 门禁模式（缺件或尺寸不符 → 退出码 1）
 *   npx tsx tools/check-art.ts --list-missing   # 只输出缺失清单（交给美术）
 *
 * 规格来源：`04-TDD-v1.0.md` 17.2 / 17.3
 *   - 逻辑 cellSize = 48px，出图 @2x ⇒ 物理单格 = 96px
 *   - 画布 = bbox列数 × 96（宽） × bbox行数 × 96（高）
 *   - 贴图朝向 = 该 itemType 的 cells 在 rotation = 0 时的朝向
 *   - 文件名严格等于 itemType（便于 resources.load 零映射）
 *   - **透明底必须**（17.2 / A-05）
 *
 * 剪影核查（M4-6 新增，用户真机反馈「L 型占格配矩形图」的根因修复）：
 *   贴图剪影必须等于 cells 足迹——**非占格区域不得有任何不透明内容**。
 *     阻塞级：非占格区域内部（四边内缩 2px，给格边界抗锯齿留容差）存在
 *             alpha>8 像素 → 图像侵入了不属于它的格子
 *     警告级：占格区域不透明（alpha≥128）覆盖率 <2% → 主体没画进来/被切空
 *   内缩 2px 是对格交界 AA 的容差；`art-batch-proc.mjs mask/fit` 硬烘焙的图
 *   非占格内部严格为 0。历史占位型（不在 levels.json）不适用本项。
 *
 * 像素级透明底核查（M4-3 复审补入，见 CHANGELOG `8fc62a7` 后记）：
 *   B0 锚点批只人工核查过透明底；B1/B2 批次发生「均匀灰底假透明」回归
 *   （四角 alpha=255、覆盖率 100%、合成到页面底色上是灰色矩形块）而无人
 *   发现——因为本工具此前只看 IHDR 尺寸。现在对**每一张已交付**的图都查：
 *     阻塞级：colorType ≠ 6（RGBA）/ 四角 alpha ≠ 0 / 不透明覆盖率 ≥ 98%
 *             （平铺假透明签名：底色把画布填满）
 *     警告级：外缘 1px 环带有不透明像素（裁切/出血风险）/ 覆盖率 < 5%
 *             （可能是空图或抠崩了）
 *   已交付但不合格 = 失败（非 strict 也计失败）——「还在产」不怪门禁，
 *   「已交付的必须合格」。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const ROOT = process.cwd();
const CELL_PX = 96; // @2x 单格物理像素
const SPRITE_DIR = join(ROOT, 'assets/resources/sprites/props');

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const listMissingOnly = argv.includes('--list-missing');

interface ItemInfo {
  itemType: string;
  name: string;
  rows: number;
  cols: number;
  /** cells 足迹（归一化相对格坐标）——剪影核查用（M4-6） */
  cells: number[][];
  rotatable: boolean;
  levels: number[];
}

function bbox(cells: number[][]): { rows: number; cols: number } {
  const r = cells.map((c) => c[0]);
  const c = cells.map((c) => c[1]);
  return { rows: Math.max(...r) - Math.min(...r) + 1, cols: Math.max(...c) - Math.min(...c) + 1 };
}

/** 读 PNG IHDR 拿宽高，不依赖三方库 */
function pngSize(file: string): { w: number; h: number } | null {
  try {
    const buf = readFileSync(file);
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

interface PngPixels {
  w: number;
  h: number;
  colorType: number;
  /** RGBA，每像素 4 字节 */
  data: Buffer;
}

/** 最小 PNG 解码（8bit、colorType 2/6），不依赖三方库 */
function decodePng(file: string): PngPixels | null {
  try {
    const buf = readFileSync(file);
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
    let off = 8;
    let w = 0, h = 0, colorType = 6;
    let plte: Buffer | null = null;
    let trns: Buffer | null = null;
    const idat: Buffer[] = [];
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString('ascii', off + 4, off + 8);
      const data = buf.subarray(off + 8, off + 8 + len);
      off += len + 12;
      if (type === 'IHDR') {
        w = data.readUInt32BE(0);
        h = data.readUInt32BE(4);
        colorType = data[9];
      } else if (type === 'PLTE') {
        plte = Buffer.from(data);
      } else if (type === 'tRNS') {
        trns = Buffer.from(data);
      } else if (type === 'IDAT') {
        idat.push(data);
      } else if (type === 'IEND') {
        break;
      }
    }
    // colorType 3 = 索引色（tools/art-batch-proc.mjs 的 encodeIndexedPNG 产出）。
    // 体积比真彩小 3~4 倍，**同样是合法透明 PNG**（tRNS 提供 alpha），不能当不合格。
    if (colorType !== 6 && colorType !== 2 && colorType !== 3) return null;
    if (colorType === 3 && !plte) return null;
    const ch = colorType === 6 ? 4 : colorType === 3 ? 1 : 3;
    const stride = w * ch;
    const raw = inflateSync(Buffer.concat(idat));
    const out = Buffer.alloc(w * h * 4);
    let prev = Buffer.alloc(stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[p++];
      const line = Buffer.from(raw.subarray(p, p + stride));
      p += stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? line[x - ch] : 0;
        const b = prev[x];
        const c = x >= ch ? prev[x - ch] : 0;
        let v: number;
        if (f === 0) v = line[x];
        else if (f === 1) v = line[x] + a;
        else if (f === 2) v = line[x] + b;
        else if (f === 3) v = line[x] + ((a + b) >> 1);
        else {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        line[x] = v & 0xff;
      }
      for (let x = 0; x < w; x++) {
        const o = x * ch;
        const d = (y * w + x) * 4;
        if (colorType === 3) {
          const pi = line[x];
          out[d] = plte![pi * 3];
          out[d + 1] = plte![pi * 3 + 1];
          out[d + 2] = plte![pi * 3 + 2];
          out[d + 3] = trns && pi < trns.length ? trns[pi] : 255;
        } else {
          out[d] = line[o];
          out[d + 1] = line[o + 1];
          out[d + 2] = line[o + 2];
          out[d + 3] = ch === 4 ? line[o + 3] : 255;
        }
      }
      prev = line;
    }
    return { w, h, colorType, data: out };
  } catch {
    return null;
  }
}

interface TransparencyReport {
  blockers: string[];
  warnings: string[];
  coveragePct: number;
}

/** 透明底核查：四角 alpha、外缘环带、不透明覆盖率（平铺假透明签名） */
function checkTransparency(img: PngPixels): TransparencyReport {
  const { w, h, data } = img;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (img.colorType !== 6 && img.colorType !== 3) {
    blockers.push(`无 alpha 通道（colorType ${img.colorType}）——TDD 17.2 要求透明底 PNG`);
  }
  const corners = [data[at(0, 0) + 3], data[at(w - 1, 0) + 3], data[at(0, h - 1) + 3], data[at(w - 1, h - 1) + 3]];
  if (!corners.every((a) => a === 0)) {
    blockers.push(`四角 alpha 非全 0（[${corners}]）——疑似平铺底色假透明`);
  }
  let edgeOpaque = 0;
  for (let x = 0; x < w; x++) {
    if (data[at(x, 0) + 3] > 8) edgeOpaque++;
    if (data[at(x, h - 1) + 3] > 8) edgeOpaque++;
  }
  for (let y = 0; y < h; y++) {
    if (data[at(0, y) + 3] > 8) edgeOpaque++;
    if (data[at(w - 1, y) + 3] > 8) edgeOpaque++;
  }
  if (edgeOpaque > 0) {
    warnings.push(`外缘 1px 环带 ${edgeOpaque} 个不透明像素（物体出血到画布边缘/裁切风险）`);
  }
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= 128) opaque++;
  }
  const coveragePct = (opaque / (w * h)) * 100;
  if (coveragePct >= 98) {
    blockers.push(`不透明覆盖率 ${coveragePct.toFixed(0)}% ≥ 98%——底色铺满画布的假透明签名`);
  } else if (coveragePct < 5) {
    warnings.push(`不透明覆盖率仅 ${coveragePct.toFixed(1)}%——可能是空图或抠图抠崩了`);
  }
  return { blockers, warnings, coveragePct };
}

interface SilhouetteReport {
  blockers: string[];
  warnings: string[];
}

/**
 * 剪影核查（M4-6）：贴图剪影必须等于 cells 足迹。
 *
 * 背景：物品占格是任意多联骨牌（levels.json 的 cells），但旧美术契约只要求
 * 「主体落在包围盒内」，异形件（L/T/S…）因此拿到填满包围盒的矩形图，盖住
 * 了不属于它的格子——用户真机反馈「拖拽时是长方形、落盘变另一种形状」。
 *
 * - 阻塞级：**非占格**区域内部（四边内缩 2px）存在 alpha>8 像素。
 *   内缩 2px 只给格交界处的抗锯齿留容差；`art-batch-proc.mjs mask/fit`
 *   硬烘焙的图，非占格内部严格为 0。
 * - 警告级：**占格**区域不透明（alpha≥128）覆盖率 <2%——主体没画进来，
 *   或遮罩把主体切空了。
 */
function checkSilhouette(img: PngPixels, cells: number[][]): SilhouetteReport {
  const { w, h, data } = img;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const rs = cells.map((c) => c[0]);
  const cs = cells.map((c) => c[1]);
  const rows = Math.max(...rs) - Math.min(...rs) + 1;
  const cols = Math.max(...cs) - Math.min(...cs) + 1;
  const occ = new Set(cells.map(([r, c]) => `${r},${c}`));
  const blockers: string[] = [];
  const warnings: string[] = [];
  const INSET = 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * CELL_PX + INSET, x1 = Math.min((c + 1) * CELL_PX - INSET, w);
      const y0 = r * CELL_PX + INSET, y1 = Math.min((r + 1) * CELL_PX - INSET, h);
      let visible = 0, solid = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const a = data[at(x, y) + 3];
          if (a > 8) visible++;
          if (a >= 128) solid++;
        }
      }
      const area = Math.max(0, (x1 - x0) * (y1 - y0));
      if (!occ.has(`${r},${c}`) && visible > 0) {
        blockers.push(
          `格(${r},${c}) 是非占格区域却有 ${visible} 个可见像素——图像侵入不属于它的格子（剪影必须等于 cells 足迹）`,
        );
      }
      if (occ.has(`${r},${c}`) && area > 0 && solid / area < 0.02) {
        warnings.push(`格(${r},${c}) 是占格区域但实体覆盖率仅 ${((solid / area) * 100).toFixed(1)}%——主体没画进来或被切空`);
      }
    }
  }
  return { blockers, warnings };
}

/** cells → ASCII 布局（X=占格，.=非占格），供缺失清单交给美术照形状画 */
function cellsAscii(cells: number[][]): string {
  const rs = cells.map((c) => c[0]);
  const cs = cells.map((c) => c[1]);
  const rows = Math.max(...rs) - Math.min(...rs) + 1;
  const cols = Math.max(...cs) - Math.min(...cs) + 1;
  const occ = new Set(cells.map(([r, c]) => `${r},${c}`));
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) s += occ.has(`${r},${c}`) ? 'X' : '.';
    lines.push(s);
  }
  return lines.join('/');
}

const data = JSON.parse(readFileSync(join(ROOT, 'assets/data/levels.json'), 'utf8'));
const levels = data.levels ?? data;
const items = new Map<string, ItemInfo>();
for (const lv of levels) {
  for (const it of lv.items) {
    const { rows, cols } = bbox(it.cells);
    const exist = items.get(it.itemType);
    if (exist) {
      if (!exist.levels.includes(lv.levelId)) exist.levels.push(lv.levelId);
    } else {
      items.set(it.itemType, {
        itemType: it.itemType,
        name: it.name,
        rows,
        cols,
        cells: it.cells.map((c: number[]) => [c[0], c[1]]),
        rotatable: it.rotatable,
        levels: [lv.levelId],
      });
    }
  }
}

const onDisk = existsSync(SPRITE_DIR) ? readdirSync(SPRITE_DIR).filter((f) => f.endsWith('.png')) : [];
const onDiskSet = new Set(onDisk);

const missing: ItemInfo[] = [];
const wrongSize: Array<ItemInfo & { file: string; w: number; h: number; ew: number; eh: number }> = [];
const broken: Array<ItemInfo & { file: string; blockers: string[]; warnings: string[]; coveragePct: number }> = [];
const ok: ItemInfo[] = [];

for (const it of items.values()) {
  const file = `${it.itemType}.png`;
  if (!onDiskSet.has(file)) {
    missing.push(it);
    continue;
  }
  const path = join(SPRITE_DIR, file);
  const size = pngSize(path);
  const ew = it.cols * CELL_PX;
  const eh = it.rows * CELL_PX;
  if (!size) {
    wrongSize.push({ ...it, file, w: 0, h: 0, ew, eh });
    continue;
  }
  if (size.w !== ew || size.h !== eh) {
    wrongSize.push({ ...it, file, w: size.w, h: size.h, ew, eh });
    continue;
  }
  const img = decodePng(path);
  if (!img) {
    broken.push({ ...it, file, blockers: ['PNG 解码失败（非 8bit RGBA/RGB？）'], warnings: [], coveragePct: 0 });
    continue;
  }
  const tr = checkTransparency(img);
  const sil = checkSilhouette(img, it.cells);
  const blockers = [...tr.blockers, ...sil.blockers];
  const warnings = [...tr.warnings, ...sil.warnings];
  if (blockers.length > 0) {
    broken.push({ ...it, file, blockers, warnings, coveragePct: tr.coveragePct });
  } else {
    ok.push(it);
    if (warnings.length > 0 && !listMissingOnly) {
      console.log(`  ⚠️ ${it.itemType}：${warnings.join('；')}`);
    }
  }
}

const orphan = onDisk.filter((f) => !items.has(f.replace(/\.png$/, '')));

if (listMissingOnly) {
  console.log('itemType | 名称 | 形状(行x列) | cells布局 | 可旋转 | 期望画布(px) | 出现关卡');
  for (const m of [...missing, ...wrongSize]) {
    console.log(
      `${m.itemType} | ${m.name} | ${m.rows}x${m.cols} | ${cellsAscii(m.cells)} | ${m.rotatable ? '是' : '否'} | ${m.cols * CELL_PX}x${m.rows * CELL_PX} | L${m.levels.join(',L')}`,
    );
  }
  process.exit(0);
}

const total = items.size;
console.log(`美术资产校验（规格：@2x 单格 ${CELL_PX}px，文件名 = itemType，透明底必须）`);
console.log(`  应交付：${total} 张 ｜ 已合格：${ok.length} ｜ 尺寸不符：${wrongSize.length} ｜ 透明底不合格：${broken.length} ｜ 缺失：${missing.length}`);
console.log(`  覆盖率：${((ok.length / total) * 100).toFixed(1)}%`);

if (missing.length) {
  console.log(`\n缺失（${missing.length}）：`);
  for (const m of missing.slice(0, 20)) {
    console.log(`  ⬜ ${m.itemType}  ${m.name}  ${m.rows}x${m.cols}  期望 ${m.cols * CELL_PX}x${m.rows * CELL_PX}px  L${m.levels.join(',L')}`);
  }
  if (missing.length > 20) console.log(`  … 其余 ${missing.length - 20} 张见 --list-missing`);
}

if (wrongSize.length) {
  console.log(`\n尺寸/朝向不符（${wrongSize.length}）：`);
  for (const w of wrongSize) {
    const rotated = w.w === w.eh && w.h === w.ew;
    console.log(
      `  ⚠️ ${w.itemType}  ${w.name}  实际 ${w.w}x${w.h}  期望 ${w.ew}x${w.eh}` +
        (rotated ? '   ← 疑似朝向反了（转 90° 即正确）' : ''),
    );
  }
}

if (broken.length) {
  console.log(`\n透明底/剪影不合格（${broken.length}，已交付但违反 TDD 17.2 / A-05 / M4-6 剪影契约）：`);
  for (const b of broken) {
    console.log(`  ❌ ${b.itemType}  覆盖率 ${b.coveragePct.toFixed(0)}%`);
    for (const bl of b.blockers) console.log(`       - ${bl}`);
    for (const wn of b.warnings) console.log(`       ~ ${wn}`);
  }
}

if (orphan.length) {
  console.log(`\n孤儿文件（数据里没有对应 itemType，${orphan.length}）：`);
  for (const o of orphan) console.log(`  ❓ ${o}`);
}

// ─────────────────────── UI 插画（M4-4） ───────────────────────
//
// 为什么 UI 资源也要进校验：M4-3 的「灰底假透明」正是因为没有 alpha 检查，
// 11 张满幅 #E5E5E5 图靠「与占位色块同色」蒙混了很久。UI 插画是**整屏**素材，
// 一旦带底色就会盖住整个棋盘，比物品图更致命——所以这里同样强制透明底。
//
// 尺寸是**契约**而非随手值：M4-5 接线时按这些像素直接摆位，改尺寸必须同步改
// 这里的表和 docs/03 §7 的说明，避免「图换了、位置全偏」。

const UI_DIR = join(ROOT, 'assets/resources/sprites/ui');

interface UiSpec {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly use: string;
}

const UI_SPECS: readonly UiSpec[] = [
  { name: 'home-hero', w: 560, h: 400, use: '首页英雄图' },
  { name: 'suitcase-open', w: 780, h: 780, use: '棋盘箱体（俯视开口，内衬留给棋盘）' },
  { name: 'suitcase-closed', w: 780, h: 780, use: '通关合盖（俯视合上，与 open 同轮廓）' },
];

const uiProblems: string[] = [];
const uiOks: string[] = [];
const uiOnDisk = existsSync(UI_DIR) ? readdirSync(UI_DIR).filter((f) => f.endsWith('.png')) : [];
const uiKnown = new Set(UI_SPECS.map((s) => `${s.name}.png`));

for (const spec of UI_SPECS) {
  const file = join(UI_DIR, `${spec.name}.png`);
  if (!existsSync(file)) {
    uiProblems.push(`⬜ ${spec.name}  缺失（期望 ${spec.w}x${spec.h}，${spec.use}）`);
    continue;
  }
  const size = pngSize(file);
  if (!size) {
    uiProblems.push(`❌ ${spec.name}  不是可解析的 PNG`);
    continue;
  }
  if (size.w !== spec.w || size.h !== spec.h) {
    uiProblems.push(`❌ ${spec.name}  尺寸 ${size.w}x${size.h} ≠ 契约 ${spec.w}x${spec.h}`);
    continue;
  }
  const img = decodePng(file);
  if (!img) {
    uiProblems.push(`❌ ${spec.name}  像素解码失败`);
    continue;
  }
  const tr = checkTransparency(img);
  if (tr.blockers.length) {
    uiProblems.push(`❌ ${spec.name}  覆盖率 ${tr.coveragePct.toFixed(0)}%：${tr.blockers.join('；')}`);
  } else {
    uiOks.push(`${spec.name}（${size.w}x${size.h}，覆盖率 ${tr.coveragePct.toFixed(0)}%）`);
    for (const wn of tr.warnings) console.log(`  ⚠️ ui/${spec.name}：${wn}`);
  }
}

const uiOrphan = uiOnDisk.filter((f) => !uiKnown.has(f));
for (const o of uiOrphan) uiProblems.push(`❓ ui/${o}  不在 UI_SPECS 契约表里`);

console.log(`\nUI 插画（${uiOks.length}/${UI_SPECS.length} 合格，规格见 UI_SPECS）`);
for (const s of uiOks) console.log(`  ✅ ${s}`);
for (const p of uiProblems) console.log(`  ${p}`);

// 已交付但不合格（透明底/尺寸）永远失败；缺失只在 strict 模式失败
const bad = wrongSize.length + orphan.length + broken.length + uiProblems.length + (strict ? missing.length : 0);

if (bad > 0) {
  console.log(`\n❌ 有 ${bad} 项需要处理${strict ? '（strict 模式：缺失也计入失败）' : ''}`);
  process.exit(1);
}
console.log(strict ? '\n✅ 全部 63 张就位且符合规格（含透明底与剪影）' : '\n✅ 已交付部分均符合规格（含透明底与剪影；缺失项不计入失败）');
process.exit(0);
