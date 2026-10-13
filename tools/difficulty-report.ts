/**
 * 难度代理指标报告（TDD 9.2）。
 *
 * 两个指标，都是**离线代理**，不是玩家实测：
 * 1. `解数`：完整解的总数（越少越难）。完全确定性，适合同一关卡的前后对比。
 * 2. `big%`：大件优先 + 随机落位、「一次不回头放完」的成功率。需要随机数，噪声大。
 *
 * ⚠️ 用蒙特卡洛时**必须**注意：`rng` 要在整轮试验外建一次，不能在每次试验里重建。
 * 否则 N 次试验会退化成同一次重复 N 遍，扫出来的 0%/100% 全是假数据。
 * （这个坑本项目真踩过，见 2026-10-13 的记忆记录。）
 *
 * 用法：
 *   npx tsx tools/difficulty-report.ts
 *   npx tsx tools/difficulty-report.ts --trials 3000
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { countSolutions, solve } from '../assets/core/index';
import type { LevelSpec, RC, Rotation } from '../assets/core/index';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

interface RawLevel {
  levelId: number;
  title: string;
  board: { rows: number; cols: number; blockedCells: number[][] };
  items: Array<{
    id: string;
    name: string;
    itemType?: string;
    spriteKey?: string;
    cells: number[][];
    rotatable: boolean;
    trayOrder: number;
  }>;
}

function toSpec(raw: RawLevel): LevelSpec {
  return {
    levelId: raw.levelId,
    title: raw.title,
    board: {
      rows: raw.board.rows,
      cols: raw.board.cols,
      blockedCells: raw.board.blockedCells.map(([r, c]) => [r, c] as RC),
    },
    items: raw.items.map((it) => ({
      id: it.id,
      name: it.name,
      itemType: it.itemType ?? 'default',
      spriteKey: it.spriteKey ?? 'k',
      cells: it.cells.map(([r, c]) => [r, c] as RC),
      rotatable: it.rotatable,
      trayOrder: it.trayOrder,
    })),
  };
}

/** 与 core 无关的轻量随机放位模拟。故意独立实现，避免"用被验证者验证自己" */
function simulateOnce(level: LevelSpec, rng: () => number): boolean {
  const { rows, cols, blockedCells } = level.board;
  const blocked = new Set(blockedCells.map(([r, c]) => `${r},${c}`));
  const occupied = new Set<string>();
  const itemById = new Map(level.items.map((it) => [it.id, it]));

  // 大件优先：按格数降序，同格数保持 trayOrder 稳定序
  const order = [...level.items].sort(
    (a, b) => b.cells.length - a.cells.length || a.trayOrder - b.trayOrder,
  );

  for (const item of order) {
    const rotations: Rotation[] = item.rotatable ? [0, 1, 2, 3] : [0];
    const options: Array<{ row: number; col: number; rotation: Rotation }> = [];
    for (const rotation of rotations) {
      const shape = rotateShape(item.cells, rotation);
      let maxR = 0;
      let maxC = 0;
      for (const [r, c] of shape) {
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      for (let row = 0; row + maxR < rows; row++) {
        for (let col = 0; col + maxC < cols; col++) {
          let ok = true;
          for (const [dr, dc] of shape) {
            const r = row + dr;
            const c = col + dc;
            if (r < 0 || r >= rows || c < 0 || c >= cols) { ok = false; break; }
            const key = `${r},${c}`;
            if (blocked.has(key) || occupied.has(key)) { ok = false; break; }
          }
          if (ok) options.push({ row, col, rotation });
        }
      }
    }
    if (options.length === 0) return false;
    const pick = options[Math.floor(rng() * options.length)]!;
    const shape = rotateShape(item.cells, pick.rotation);
    for (const [dr, dc] of shape) occupied.add(`${pick.row + dr},${pick.col + dc}`);
  }
  void itemById;
  return true;
}

function rotateShape(cells: readonly RC[], rotation: Rotation): RC[] {
  let shape = cells.map(([r, c]) => [r, c] as RC);
  for (let i = 0; i < rotation; i++) {
    shape = shape.map(([r, c]) => [c, -r] as RC);
    let minR = Infinity;
    let minC = Infinity;
    for (const [r, c] of shape) {
      if (r < minR) minR = r;
      if (c < minC) minC = c;
    }
    shape = shape.map(([r, c]) => [r - minR, c - minC] as RC).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  return shape;
}

/** 确定性 PRNG（mulberry32）。**注意调用方必须只建一次** */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main(): void {
  const trialsArg = process.argv.indexOf('--trials');
  const trials = trialsArg >= 0 ? Number(process.argv[trialsArg + 1]) : 2000;

  const source = resolve(ROOT, 'docs/02-GDD-levels-v1.0.json');
  const payload = JSON.parse(readFileSync(source, 'utf8')) as {
    schemaVersion: string;
    levels: RawLevel[];
  };
  const levels = payload.levels.map(toSpec);

  console.log(`难度代理指标报告（schemaVersion=${payload.schemaVersion}，N=${trials}）`);
  console.log('警告：以下均为离线代理指标，**不是**玩家实测难度。\n');

  const rows: Array<{ levelId: number; title: string; big: number; hits: number; solutions: number; capped: boolean; nodes: number }> = [];
  for (const level of levels) {
    // ★ rng 在循环外只建一次，整轮共用
    const rng = makeRng(20261012);
    let ok = 0;
    for (let i = 0; i < trials; i++) if (simulateOnce(level, rng)) ok++;

    const counted = countSolutions(level, { solutionCap: 1_000_000 });
    const solved = solve(level);
    rows.push({
      levelId: level.levelId,
      title: level.title,
      big: ok / trials,
      hits: ok,
      solutions: counted.count,
      capped: counted.capped,
      nodes: solved.nodes,
    });
  }

  console.log('关卡  标题              填充率  big%（越高越简单）  命中/总    解数        首次求解节点');
  for (const level of levels) {
    const row = rows.find((r) => r.levelId === level.levelId)!;
    const usable = level.board.rows * level.board.cols - level.board.blockedCells.length;
    const used = level.items.reduce((s, it) => s + it.cells.length, 0);
    const fill = `${used}/${usable}`;
    const sol = row.capped ? `>=${row.solutions}` : String(row.solutions);
    console.log(
      `L${String(level.levelId).padStart(2, '0')}   ${padRight(level.title, 16)}  ${padRight(fill, 7)} ` +
        `${padRight(`${(row.big * 100).toFixed(2)}%`, 18)} ${padRight(`${row.hits}/${trials}`, 10)} ` +
        `${padRight(sol, 11)} ${row.nodes}`,
    );
  }

  // ── 单调性检查：必须做双比例显著性检验，否则会把噪声当倒挂 ──
  console.log('\n单调性（big% 应逐关下降；big% 越小越难）：');
  console.log('  判定规则：|p_i − p_{i+1}| > 2·SE_diff 才算真倒挂，否则记「不可区分」。');
  console.log('  理由：0.1%~1% 区间里 N=3000 只有 3~30 次命中，直接比大小会把噪声当成倒挂。');
  let realInversions = 0;
  let indistinguishable = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const seA = Math.sqrt((a.big * (1 - a.big)) / trials);
    const seB = Math.sqrt((b.big * (1 - b.big)) / trials);
    const seDiff = Math.sqrt(seA * seA + seB * seB);
    const diff = Math.abs(a.big - b.big);
    const distinguishable = diff > 2 * seDiff;
    const inverted = b.big > a.big;
    const label = `L${a.levelId}(${(a.big * 100).toFixed(2)}%) → L${b.levelId}(${(b.big * 100).toFixed(2)}%)`;
    if (!distinguishable) {
      indistinguishable++;
      console.log(`  · 不可区分（差值 ${(diff * 100).toFixed(2)}% < 2SE ${(2 * seDiff * 100).toFixed(2)}%）：${label}`);
    } else if (inverted) {
      realInversions++;
      console.log(`  ⚠ 真倒挂：${label}  （差值 ${(diff * 100).toFixed(2)}% > 2SE ${(2 * seDiff * 100).toFixed(2)}%）`);
    }
  }
  if (realInversions === 0) console.log('  ✓ 无统计显著的倒挂');
  console.log(
    `\n小结：${realInversions} 处真倒挂，${indistinguishable} 对相邻关卡在本样本量下不可区分。`,
  );
  console.log('      不可区分不等于不难——只说明要加大 N 或改用确定性指标才能排序。');
}

function padRight(s: string, n: number): string {
  let width = 0;
  for (const ch of s) width += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return s + ' '.repeat(Math.max(n - width, 1));
}

main();
