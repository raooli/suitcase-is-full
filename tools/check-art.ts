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
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
const ok: ItemInfo[] = [];

for (const it of items.values()) {
  const file = `${it.itemType}.png`;
  if (!onDiskSet.has(file)) {
    missing.push(it);
    continue;
  }
  const size = pngSize(join(SPRITE_DIR, file));
  const ew = it.cols * CELL_PX;
  const eh = it.rows * CELL_PX;
  if (!size) {
    wrongSize.push({ ...it, file, w: 0, h: 0, ew, eh });
  } else if (size.w !== ew || size.h !== eh) {
    wrongSize.push({ ...it, file, w: size.w, h: size.h, ew, eh });
  } else {
    ok.push(it);
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
console.log(`美术资产校验（规格：@2x 单格 ${CELL_PX}px，文件名 = itemType）`);
console.log(`  应交付：${total} 张 ｜ 已合格：${ok.length} ｜ 尺寸不符：${wrongSize.length} ｜ 缺失：${missing.length}`);
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

if (orphan.length) {
  console.log(`\n孤儿文件（数据里没有对应 itemType，${orphan.length}）：`);
  for (const o of orphan) console.log(`  ❓ ${o}`);
}

const bad = wrongSize.length + orphan.length + (strict ? missing.length : 0);
if (bad > 0) {
  console.log(`\n❌ 有 ${bad} 项需要处理${strict ? '（strict 模式：缺失也计入失败）' : ''}`);
  process.exit(1);
}
console.log(strict ? '\n✅ 全部 63 张就位且符合规格' : '\n✅ 已交付部分均符合规格（缺失项不计入失败）');
process.exit(0);
