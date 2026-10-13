/**
 * 关卡校验 CLI（TDD 9.2）。
 *
 * 职责：
 * 1. 读 GDD 的关卡 JSON（含 `solution` / `solutionGrid` 等开发字段）
 * 2. 逐关校验：结构合法性、标准解合法性、可解性、L03 的旋转约束
 * 3. 剥离开发字段，输出**生产态** `assets/data/levels.json`
 * 4. 打印难度代理指标（解数），供调难度时前后对比
 *
 * 何时跑：**每次改关卡 JSON 都跑；CI / 构建前必跑，失败即阻断。**
 *
 * 用法：
 *   npx tsx tools/verify-levels.ts
 *   npx tsx tools/verify-levels.ts --source docs/02-GDD-levels-v1.0.json --out assets/data/levels.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  countSolutions,
  requiresRotation,
  solve,
  validateLevelSpec,
  validateSolution,
} from '../assets/core/index';
import type { LevelSpec, RC, Rotation, SolutionPlacement } from '../assets/core/index';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

interface Args {
  source: string;
  out: string;
  /** 需要强制旋转的关卡（PRD G-04：第 3 关的教学目标） */
  rotationRequiredLevels: number[];
  /** 单个关卡的解数统计上限，避免满填充关算到天荒地老 */
  countCap: number;
  /** 只校验、不写生产态文件 */
  checkOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    source: resolve(ROOT, 'docs/02-GDD-levels-v1.0.json'),
    out: resolve(ROOT, 'assets/data/levels.json'),
    rotationRequiredLevels: [3],
    countCap: 1_000_000,
    checkOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') args.source = resolve(ROOT, argv[++i]);
    else if (a === '--out') args.out = resolve(ROOT, argv[++i]);
    else if (a === '--check-only') args.checkOnly = true;
    else if (a === '--count-cap') args.countCap = Number(argv[++i]);
  }
  return args;
}

// ─────────────────────── GDD JSON → LevelSpec ───────────────────────

/** GDD JSON 的宽松形状。生产态不含 solution 字段，所以这里全部可选 */
interface RawLevel {
  levelId: number;
  title: string;
  board: { rows: number; cols: number; blockedCells: number[][] };
  items: Array<{
    id: string;
    itemType?: string;
    name: string;
    spriteKey?: string;
    cells: number[][];
    rotatable: boolean;
    trayOrder: number;
  }>;
  solution?: Array<{ itemId: string; row: number; col: number; rotation: number }>;
  solutionGrid?: unknown;
  verification?: unknown;
}

function toRCs(raw: number[][]): RC[] {
  return raw.map(([r, c]) => [r, c] as RC);
}

function toLevelSpec(raw: RawLevel): LevelSpec {
  return {
    levelId: raw.levelId,
    title: raw.title,
    board: {
      rows: raw.board.rows,
      cols: raw.board.cols,
      blockedCells: toRCs(raw.board.blockedCells ?? []),
    },
    items: raw.items.map((it) => ({
      id: it.id,
      name: it.name,
      itemType: it.itemType ?? 'default',
      spriteKey: it.spriteKey ?? `placeholder/${it.id}`,
      cells: toRCs(it.cells),
      rotatable: it.rotatable,
      trayOrder: it.trayOrder,
    })),
  };
}

function toSolution(raw: RawLevel): SolutionPlacement[] {
  return (raw.solution ?? []).map((p) => ({
    itemId: p.itemId,
    row: p.row,
    col: p.col,
    rotation: p.rotation as Rotation,
  }));
}

/** 剥离开发字段（GDD 4.2 要求：生产态不得携带 solution / solutionGrid / verification） */
function toProduction(raw: RawLevel) {
  return {
    levelId: raw.levelId,
    title: raw.title,
    board: raw.board,
    items: raw.items,
  };
}

// ─────────────────────────── 主流程 ───────────────────────────

function main(): number {
  const args = parseArgs(process.argv.slice(2));

  console.log(`读取关卡数据：${args.source}`);
  const payload = JSON.parse(readFileSync(args.source, 'utf8')) as {
    schemaVersion: string;
    levels: RawLevel[];
  };
  console.log(`schemaVersion = ${payload.schemaVersion}，共 ${payload.levels.length} 关\n`);

  const failures: string[] = [];
  const report: ReportRow[] = [];

  for (const raw of payload.levels) {
    const level = toLevelSpec(raw);
    const tag = `L${String(level.levelId).padStart(2, '0')}`;

    // 1) 结构校验
    const problems = validateLevelSpec(level);
    if (problems.length > 0) {
      failures.push(...problems.map((p) => `${tag} 结构: ${p}`));
      continue;
    }

    // 2) 标准解校验（人类写的解）
    const solution = toSolution(raw);
    if (solution.length > 0) {
      const check = validateSolution(level, solution);
      if (!check.valid) {
        failures.push(...check.problems.map((p) => `${tag} 标准解: ${p}`));
      }
    }

    // 3) 求解器独立判定（与标准解是两条独立路径）
    const solved = solve(level);
    if (solved.outcome !== 'solved') {
      failures.push(
        `${tag} 求解器判定为 ${solved.outcome}` +
          (solved.outcome === 'unknown' ? '（节点超限，请提高 --count-cap 或检查数据）' : ''),
      );
    }

    // 4) 旋转约束
    const needsRotation = requiresRotation(level);
    if (args.rotationRequiredLevels.includes(level.levelId) && !needsRotation) {
      failures.push(`${tag} 要求"必须旋转才可解"，但求解器发现不旋转也能过（旋转教学丢失）`);
    }

    // 5) 难度代理：完整解总数
    const counted = countSolutions(level, { solutionCap: args.countCap });

    const used = level.items.reduce((s, it) => s + it.cells.length, 0);
    const usable = level.board.rows * level.board.cols - level.board.blockedCells.length;
    report.push({
      levelId: level.levelId,
      title: level.title,
      rows: level.board.rows,
      cols: level.board.cols,
      items: level.items.length,
      blocked: level.board.blockedCells.length,
      used,
      usable,
      solutions: counted.count,
      solutionsCapped: counted.capped,
      nodes: counted.nodes,
      needsRotation,
    });
  }

  printReport(report);
  printSolutionSpaceNote(report, args.countCap);

  if (failures.length > 0) {
    console.error(`\n✗ 校验失败，共 ${failures.length} 个问题：`);
    for (const f of failures) console.error(`  · ${f}`);
    return 1;
  }

  console.log(`\n✓ 全部 ${payload.levels.length} 关通过校验`);

  if (!args.checkOnly) {
    const production = {
      schemaVersion: '1.0',
      generatedBy: 'tools/verify-levels.ts',
      sourceSchemaVersion: payload.schemaVersion,
      levels: payload.levels.map(toProduction),
    };
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(production, null, 2)}\n`, 'utf8');
    console.log(`  已生成生产态关卡：${args.out}`);
  }

  return 0;
}

interface ReportRow {
  levelId: number;
  title: string;
  rows: number;
  cols: number;
  items: number;
  blocked: number;
  used: number;
  usable: number;
  solutions: number;
  solutionsCapped: boolean;
  nodes: number;
  needsRotation: boolean;
}

function printReport(rows: readonly ReportRow[]): void {
  console.log('关卡  标题              棋盘   物品 障碍  装载/可用  解数        旋转');
  for (const r of rows) {
    const cell = `${String(r.used).padStart(2)}/${String(r.usable).padEnd(2)}`;
    const sol = r.solutionsCapped ? `>=${r.solutions}` : String(r.solutions);
    console.log(
      `L${String(r.levelId).padStart(2, '0')}   ${padRight(r.title, 16)}  ${r.rows}×${r.cols}  ` +
        `${String(r.items).padStart(3)} ${String(r.blocked).padStart(4)}  ${padRight(cell, 10)} ` +
        `${padRight(sol, 11)} ${r.needsRotation ? '必须' : '—'}`,
    );
  }
}

/**
 * 解空间大小报告。
 *
 * ⚠️ **解数不是难度的单调函数。** 实测：L06 只有 18 组解却比 L09（≥3 万组解）"更容易"，
 * 因为解数衡量的是"合法终局有多少个"，而难度取决于"玩家能不能找到其中之一"。
 * 所以这里**只做结构性异常提示**，不做难度排序——排序是 `difficulty-report.ts`
 * 里 big% 的职责，且必须配显著性检验。
 *
 * 另外解数受节点预算限制，输出里凡是带 `>=` 的都是**下界**，不是精确值。
 */
function printSolutionSpaceNote(rows: readonly ReportRow[], nodeBudget: number): void {
  console.log(`\n解空间大小（节点预算 ${nodeBudget.toLocaleString()} 次；带 >= 的是下界）：`);
  const cappedCount = rows.filter((r) => r.solutionsCapped).length;
  if (cappedCount > 0) {
    console.log(`  · ${cappedCount} 关在预算内未数完，其解数是下界`);
  }

  // 结构性异常：解数与相邻关相差一个数量级以上
  const outliers: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const hi = Math.max(a.solutions, b.solutions);
    const lo = Math.min(a.solutions, b.solutions);
    if (lo > 0 && hi / lo >= 10) {
      outliers.push(
        `L${a.levelId}(${a.solutions}) 与 L${b.levelId}(${b.solutions}) 相差 ${(hi / lo).toFixed(0)} 倍`,
      );
    }
  }
  if (outliers.length === 0) {
    console.log('  ✓ 相邻关卡解空间大小没有数量级差异');
  } else {
    for (const o of outliers) console.log(`  · ${o} —— 值得看一眼，但**不**等于难度异常`);
  }
  console.log('  注意：解数 ≠ 难度。难度排序请跑 `npm run report:difficulty`（big% + 显著性检验）。');
}

function padRight(s: string, n: number): string {
  // 中文按 2 个宽度算，避免表格错位
  let width = 0;
  for (const ch of s) width += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return s + ' '.repeat(Math.max(n - width, 1));
}

process.exit(main());
