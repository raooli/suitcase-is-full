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
      } else if (type === 'IDAT') {
        idat.push(data);
      } else if (type === 'IEND') {
        break;
      }
    }
    if (colorType !== 6 && colorType !== 2) return null;
    const ch = colorType === 6 ? 4 : 3;
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
        out[d] = line[o];
        out[d + 1] = line[o + 1];
        out[d + 2] = line[o + 2];
        out[d + 3] = ch === 4 ? line[o + 3] : 255;
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
  if (img.colorType !== 6) {
    blockers.push(`非 RGBA（colorType ${img.colorType}）——TDD 17.2 要求透明底 PNG-24`);
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
      items.set(it.itemType, { itemType: it.itemType, name: it.name, rows, cols, rotatable: it.rotatable, levels: [lv.levelId] });
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
  if (tr.blockers.length > 0) {
    broken.push({ ...it, file, blockers: tr.blockers, warnings: tr.warnings, coveragePct: tr.coveragePct });
  } else {
    ok.push(it);
    if (tr.warnings.length > 0 && !listMissingOnly) {
      console.log(`  ⚠️ ${it.itemType}：${tr.warnings.join('；')}`);
    }
  }
}

const orphan = onDisk.filter((f) => !items.has(f.replace(/\.png$/, '')));

if (listMissingOnly) {
  console.log('itemType | 名称 | 形状(行x列) | 可旋转 | 期望画布(px) | 出现关卡');
  for (const m of [...missing, ...wrongSize]) {
    console.log(`${m.itemType} | ${m.name} | ${m.rows}x${m.cols} | ${m.rotatable ? '是' : '否'} | ${m.cols * CELL_PX}x${m.rows * CELL_PX} | L${m.levels.join(',L')}`);
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
  console.log(`\n透明底不合格（${broken.length}，已交付但违反 TDD 17.2 / A-05）：`);
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

// 已交付但不合格（透明底/尺寸）永远失败；缺失只在 strict 模式失败
const bad = wrongSize.length + orphan.length + broken.length + (strict ? missing.length : 0);
if (bad > 0) {
  console.log(`\n❌ 有 ${bad} 项需要处理${strict ? '（strict 模式：缺失也计入失败）' : ''}`);
  process.exit(1);
}
console.log(strict ? '\n✅ 全部 63 张就位且符合规格（含透明底）' : '\n✅ 已交付部分均符合规格（含透明底；缺失项不计入失败）');
process.exit(0);
