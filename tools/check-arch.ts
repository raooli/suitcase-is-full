/**
 * 架构守卫：静态检查 `06-架构设计-v1.0.md` 第 1.2 节的依赖规则。
 *
 * 用法：npx tsx tools/check-arch.ts   （已接入 `npm run check`）
 * 退出码：0 = 无违规，1 = 有违规。
 *
 * 设计原则：
 * - 零第三方依赖，纯 Node fs，能被 tsx 直接跑。
 * - 只报错不自动修。规则变更时改本文件，并在架构文档同步。
 * - 豁免是显式的、写在代码里的，不藏在配置里。
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

/** 规则编号 → 说明，与架构文档 R-A1~R-A7 对应 */
const RULES: Record<string, string> = {
  'R-A1': "core/** 不得 import 'cc'（零引擎依赖）",
  'R-A3': 'view/ 与 tools/ 只从 core/index.ts 导入，不得深引 core 内部路径',
  'R-A4': 'platform/ 之外不得出现 wx API',
  'R-A6': 'cellSize 算术只允许出现在 BoardView.ts 与 core/config.ts',
  'R-A9': 'assets/ 下只允许运行时资源：sprites 必须在 assets/resources/ 内',
  'R-A10': 'assets/ 下禁止展开语法 [...x]（Cocos 构建的 loose 转译会把它降级成 [x]）；一律用 Array.from(x)',
};

/**
 * 深引 core 内部路径：相对导入里命中 core 的子目录即违规。
 * 覆盖 `../core/rules/board`（view 侧）与 `../assets/core/rules/board`（tools 侧）两种写法。
 * test/ 显式豁免——单测就是要打进内部单元。
 */
const DEEP_CORE = /from\s+['"](?:\.\.\/)+(?:assets\/)?core\/(?:rules|session|model|geometry|solver|config)\//;
/** 命中 core/index 或 core 目录本身 → 合法入口 */
const CORE_ENTRY = /from\s+['"](?:\.\.\/)+(?:assets\/)?core(?:\/index)?['"]/;

interface Violation {
  rule: string;
  file: string;
  line: number;
  text: string;
}

const violations: Violation[] = [];

function listFiles(dir: string, exts: string[]): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
    }
  };
  walk(abs);
  return out;
}

function rel(p: string): string {
  return relative(ROOT, p).split(sep).join('/');
}

function checkFile(absPath: string, rules: Array<{ id: string; re: RegExp; skip?: (line: string) => boolean }>) {
  const file = rel(absPath);
  if (file.endsWith('tools/check-arch.ts')) return; // 自身豁免
  const lines = readFileSync(absPath, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const { id, re, skip } of rules) {
      if (skip?.(line)) continue;
      if (re.test(line)) violations.push({ rule: id, file, line: i + 1, text: line.trim().slice(0, 120) });
    }
  });
}

// ── R-A1：core 零 cc 依赖 ────────────────────────────────────────────────
for (const f of listFiles('assets/core', ['.ts'])) {
  checkFile(f, [{ id: 'R-A1', re: /from\s+['"]cc['"]|require\(\s*['"]cc['"]\s*\)/ }]);
}

// ── R-A3：view 与 tools 不得深引 core 内部（test 豁免）────────────────────
for (const dir of ['assets/view', 'tools']) {
  for (const f of listFiles(dir, ['.ts'])) {
    checkFile(f, [
      {
        id: 'R-A3',
        re: DEEP_CORE,
        skip: (line) => CORE_ENTRY.test(line) || line.trim().startsWith('*') || line.trim().startsWith('//'),
      },
    ]);
  }
}

// ── R-A4：platform 之外不得出现 wx API ───────────────────────────────────
for (const dir of ['assets/core', 'assets/view']) {
  for (const f of listFiles(dir, ['.ts'])) {
    checkFile(f, [
      {
        id: 'R-A4',
        re: /\bwx\s*\.\s*[a-zA-Z]|from\s+['"]wx['"]|window\s*\.\s*wx/,
        skip: (line) => line.trim().startsWith('*') || line.trim().startsWith('//'),
      },
    ]);
  }
}

// ── R-A6：cellSize 算术只在 BoardView 与 config ──────────────────────────
for (const dir of ['assets/core', 'assets/view']) {
  for (const f of listFiles(dir, ['.ts'])) {
    const file = rel(f);
    if (file.endsWith('core/config.ts') || file.endsWith('view/BoardView.ts')) continue;
    checkFile(f, [
      {
        id: 'R-A6',
        re: /cellSize\s*[*\/+\-]|[*\/+\-]\s*cellSize/,
        skip: (line) => line.trim().startsWith('*') || line.trim().startsWith('//'),
      },
    ]);
  }
}

// ── R-A9：assets 下只允许运行时资源 ──────────────────────────────────────
const FORBIDDEN_IN_ASSETS = ['assets/art-source', 'assets/previews'];
for (const d of FORBIDDEN_IN_ASSETS) {
  if (existsSync(join(ROOT, d))) {
    violations.push({
      rule: 'R-A9',
      file: d,
      line: 0,
      text: `${d} 不应位于 assets/ 下（Cocos 会扫描并可能进包），应放在仓库根的 art/`,
    });
  }
}
// sprites 必须在 resources 下，否则 resources.load 拿不到
if (existsSync(join(ROOT, 'assets/sprites'))) {
  violations.push({
    rule: 'R-A9',
    file: 'assets/sprites',
    line: 0,
    text: 'sprites 需放在 assets/resources/sprites/ 下，否则无法用 resources.load 动态加载',
  });
}

// ── R-A10：禁止展开语法（引擎侧真实故障点，见架构文档 5 节）────────────────
//
// Cocos Creator 3.8.8 构建的转译是 loose 模式：`[...set]` → `[].concat(set)` → `[set]`。
// 对数组无害（等价浅拷贝），对 Set / Map 迭代器 / 生成器则**静默出错**；
// 而 Node/Vitest 里展开语法是规范的，于是症状变成"单测全绿、引擎里数据错"。
// 这一类只能从写法上根除：一律 Array.from(...)。
for (const dir of ['assets/core', 'assets/view']) {
  for (const f of listFiles(dir, ['.ts'])) {
    checkFile(f, [
      {
        id: 'R-A10',
        re: /\[\s*\.\.\.[A-Za-z_$(]/,
        skip: (line) => line.trim().startsWith('*') || line.trim().startsWith('//'),
      },
    ]);
  }
}

// ── 输出 ────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log('✅ check-arch: 无架构违规');
  process.exit(0);
}

console.error(`❌ check-arch: 发现 ${violations.length} 处架构违规\n`);
const grouped = new Map<string, Violation[]>();
for (const v of violations) {
  if (!grouped.has(v.rule)) grouped.set(v.rule, []);
  grouped.get(v.rule)!.push(v);
}
for (const [rule, list] of grouped) {
  console.error(`【${rule}】${RULES[rule]}  —— ${list.length} 处`);
  for (const v of list) {
    console.error(`   ${v.file}${v.line ? `:${v.line}` : ''}  ${v.text}`);
  }
  console.error('');
}
console.error('规则详见 docs/06-架构设计-v1.0.md 第 1.2 节。豁免需显式写进 tools/check-arch.ts 并同步文档。');
process.exit(1);
