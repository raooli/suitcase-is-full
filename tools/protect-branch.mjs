#!/usr/bin/env node
/**
 * 分支保护规则应用器 —— 把 `.github/branch-protection.json` 写进 GitHub 服务端。
 *
 * ## 为什么需要它
 *
 * Branch protection 存在 GitHub 的数据库里，**不在 git 仓库中**，`git push`
 * 推不上去（这是 GitHub 的设计，不是限制）。所以「把规则写成文件」不等于
 * 「规则生效了」——中间需要一次 API 调用。本脚本就是那次调用。
 *
 * 文件的价值在于：规则进版本库、可 code review、可复现、多机一致，
 * 而不是点一次 UI 就散掉了。
 *
 * ## 用法
 *
 *   npm run protect:branch              # dry-run：只打印将要提交的载荷 + curl
 *   npm run protect:branch -- --apply   # 真写（需 GITHUB_TOKEN）
 *   npm run protect:branch -- --branch main --preset strict
 *   npm run protect:branch -- --apply --yes    # 跳过交互确认
 *
 * ## 安全设计
 *
 * 1. **默认 dry-run**，必须显式 `--apply` 才写；
 * 2. `--apply` 前打印完整 diff（现状 vs 期望），要求确认；
 * 3. token 只从环境变量读，**永不写进文件、永不打进日志**；
 * 4. 幂等：规则没变就报「已是目标状态」并退出 0，不产生无谓写入。
 *
 * ## token 权限
 *
 * fine-grained PAT：仓库 Administration → Write
 * classic PAT：`repo` scope
 * 私有仓库的管理员级操作需要该仓库 admin 身份。
 */

import { readFileSync, readSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CONFIG_PATH = resolve(ROOT, '.github/branch-protection.json');

// ---------------------------------------------------------------- CLI 参数

function parseArgs(argv) {
  const out = { apply: false, branch: null, preset: null, yes: false, config: CONFIG_PATH };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--branch' || a === '-b') out.branch = argv[++i];
    else if (a === '--preset' || a === '-p') out.preset = argv[++i];
    else if (a === '--config') out.config = resolve(ROOT, argv[++i]);
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (a.startsWith('-')) die(`未知参数 ${a}（--help 看用法）`);
    else die(`意外的裸参数 ${a}（分支名请用 --branch）`);
  }
  return out;
}

function printHelp() {
  process.stdout.write(`
用法：node tools/protect-branch.mjs [选项]

  （无参数）        dry-run：打印将要提交的载荷与等价的 curl，不写任何东西
  --apply           真正写入 GitHub（需 GITHUB_TOKEN 环境变量）
  --branch, -b      只处理指定分支（默认处理配置里 branches 的全部分支）
  --preset, -p      覆盖该分支使用的预设（safe / strict / ci）
  --yes, -y         --apply 时跳过交互确认
  --config <path>   指定别的声明文件
  --help, -h        显示本帮助

示例：
  node tools/protect-branch.mjs                          # 先看看会改成什么
  node tools/protect-branch.mjs --branch main --apply    # 只改 main
  GITHUB_TOKEN=ghp_xxx node tools/protect-branch.mjs --apply
`);
}

function die(msg) {
  process.stderr.write(`❌ ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- 工具

function parseRepoSlug(slug) {
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(slug);
  if (!m) die(`repository 字段格式应为 owner/repo，实际是 "${slug}"`);
  return { owner: m[1], repo: m[2] };
}

/** 把声明文件里的预设转成 GitHub REST API 的 protection 载荷 */
function toApiPayload(preset) {
  const payload = {
    required_status_checks: null,
    enforce_admins: preset.enforceAdmins === true,
    required_pull_request_reviews: null,
    restrictions: null,
    required_linear_history: preset.requiredLinearHistory === true,
    // 注意语义方向：这两个字段的 `enabled` 是「是否【允许】」，
    // 不是「是否启用这条保护」。写成 !== true 会把 safe 档取反成
    // "允许强推 / 允许删除"，于是规则看着有、实际把守卫全关了。
    allow_force_pushes: { enabled: preset.allowForcePushes === true },
    allow_deletions: { enabled: preset.allowDeletions === true },
    block_creations: false,
    required_conversation_resolution: { enabled: preset.requiredConversationResolution === true },
    lock_branch: preset.lockBranch === true,
    allow_fork_syncing: true,
  };

  if (preset.requiredStatusChecks) {
    payload.required_status_checks = {
      strict: preset.requiredStatusChecks.strict !== false,
      contexts: Array.from(preset.requiredStatusChecks.contexts || []),
    };
  }

  if (preset.requiredPullRequestReviews) {
    const r = preset.requiredPullRequestReviews;
    payload.required_pull_request_reviews = {
      dismissal_restriction: preset.enforceAdmins === true ? 'everyone' : 'maintainers',
      dismiss_stale_reviews: r.dismissStaleReviews === true,
      require_code_owner_reviews: r.requireCodeOwnerReviews === true,
      required_approving_review_count: r.requiredApprovingReviewCount ?? 1,
      require_last_push_approval: r.requireLastPushApproval === true,
    };
  }

  if (preset.enforcePushRestrictions === true) {
    payload.restrictions = { users: [], teams: [], apps: [] };
  }

  return payload;
}

/** 拉取服务端现状；404 = 该分支尚未开启保护 */
function fetchCurrent(slug, branch, token) {
  const url = `https://api.github.com/repos/${slug}/branches/${encodeURIComponent(branch)}/protection`;
  const out = execFileSync('curl', [
    '-sS', '-w', '\n%{http_code}',
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    url,
  ], { encoding: 'utf8' });
  const nl = out.lastIndexOf('\n');
  const body = out.slice(0, nl);
  const code = Number(out.slice(nl + 1).trim());
  if (code === 404) return { exists: false, raw: null };
  if (code !== 200) {
    // 403/401 是 token 问题，要给出可行动的信息
    const msg = (() => { try { return JSON.parse(body).message || body; } catch { return body; } })();
    die(`读取现状失败（HTTP ${code}）：${msg}\n   token 需要该仓库 admin 权限。`);
  }
  return { exists: true, raw: JSON.parse(body) };
}

/** 比较服务端现状与目标，只列出真正有差异的字段 */
function diffProtection(current, target) {
  const diffs = [];
  const cmp = (label, cur, want) => {
    const a = JSON.stringify(cur ?? null);
    const b = JSON.stringify(want ?? null);
    if (a !== b) diffs.push({ label, cur, want: want ?? null });
  };

  cmp('强制管理员遵守', current.enforce_admins?.enabled ?? null, target.enforce_admins);
  cmp('允许强推', current.allow_force_pushes?.enabled ?? false, target.allow_force_pushes);
  cmp('允许删除分支', current.allow_deletions?.enabled ?? false, target.allow_deletions);
  cmp('线性历史', current.required_linear_history?.enabled ?? false, target.required_linear_history);
  cmp('锁定分支', current.lock_branch?.enabled ?? false, target.lock_branch);
  cmp('需解决对话', current.required_conversation_resolution?.enabled ?? false, target.required_conversation_resolution);
  cmp('必需状态检查', current.required_status_checks?.contexts ?? null, target.required_status_checks);
  cmp('必需 PR 评审', current.required_pull_request_reviews
    ? (current.required_pull_request_reviews.required_approving_review_count ?? null)
    : null,
    target.required_pull_request_reviews
    ? (target.required_pull_request_reviews.required_approving_review_count)
    : null);
  return diffs;
}

/**
 * 载荷自检 —— 拦住「字段方向写反」这类静默失效。
 *
 * 为什么需要：GitHub 的 protection 载荷里，`allow_force_pushes.enabled: true`
 * 的含义是「【允许】强推」，而不是「启用强推保护」。方向取反后生成的规则
 * 看起来完全正常（字段齐全、没报错），实则把守卫全关了——而且 GitHub 不会
 * 报任何警告。所以这里在写入前自查，把"以为在保护、实际在放开"挡下来。
 *
 * 判定口径：如果配置里明确写了 allowForcePushes:false / allowDeletions:false，
 * 那载荷里对应的 enabled 必须是 false；否则判定为方向错误并中止。
 */
function selfCheckPayload(payload, preset, presetName, branch) {
  const problems = [];

  if (preset.allowForcePushes === false && payload.allow_force_pushes.enabled !== false) {
    problems.push('allow_force_pushes.enabled 应为 false（禁止强推），实际为 ' +
      payload.allow_force_pushes.enabled + '—— 方向取反会【放开】强推');
  }
  if (preset.allowDeletions === false && payload.allow_deletions.enabled !== false) {
    problems.push('allow_deletions.enabled 应为 false（禁止删除），实际为 ' +
      payload.allow_deletions.enabled + ' —— 方向取反会【放开】删除');
  }

  if (problems.length > 0) {
    process.stderr.write(
      `\n❌ 载荷自检未通过，已中止（${branch} / 预设 ${presetName}）：\n` +
      problems.map((p) => '   · ' + p).join('\n') +
      `\n   这是脚本自身的 bug，不是配置的问题。请勿绕过此检查。\n\n`,
    );
    process.exit(3);
  }
}

function applyOne(slug, branch, presetName, preset, token, yes) {
  const target = toApiPayload(preset);
  selfCheckPayload(target, preset, presetName, branch);
  const url = `https://api.github.com/repos/${slug}/branches/${encodeURIComponent(branch)}/protection`;

  process.stdout.write(`\n${'─'.repeat(66)}\n分支 ${branch}  ·  预设 ${presetName}\n${'─'.repeat(66)}\n`);

  // dry-run 也尽量展示「现状 vs 期望」；拿不到 token 就只打印期望
  let diffs = null;
  if (token) {
    const cur = fetchCurrent(slug, branch, token);
    if (!cur.exists) {
      process.stdout.write('现状：未开启任何保护（服务端返回 404）\n');
    } else {
      diffs = diffProtection(cur.raw, target);
      process.stdout.write(diffs.length === 0
        ? '现状：与目标一致，无需改动\n'
        : `现状：与目标有 ${diffs.length} 处差异\n`);
      for (const d of diffs) {
        process.stdout.write(`  · ${d.label}：${JSON.stringify(d.cur)} → ${JSON.stringify(d.want)}\n`);
      }
    }
  } else {
    process.stdout.write('现状：（未提供 token，跳过读取。下述为目标状态）\n');
  }

  const body = JSON.stringify(target);
  process.stdout.write(`\n将要 PUT 到：\n  ${url}\n\n载荷：\n`);
  process.stdout.write(JSON.stringify(target, null, 2).split('\n').map((l) => '  ' + l).join('\n'));
  process.stdout.write('\n');

  if (!token) {
    process.stdout.write(`\n等价 curl（把 <TOKEN> 换成有 admin 权限的 token）：\n\n`);
    process.stdout.write(
      `curl -sS -X PUT \\\n  -H "Authorization: Bearer <TOKEN>" \\\n` +
      `  -H "Accept: application/vnd.github+json" \\\n` +
      `  -H "X-GitHub-Api-Version: 2022-11-28" \\\n` +
      `  ${url} \\\n  -d '${body}'\n`,
    );
    process.stdout.write('\n（dry-run：未写入任何东西。加 --apply 才会真写。）\n');
    return 'dry-run';
  }

  if (!yes && !process.stdin.isTTY) {
    process.stdout.write('\n⚠️  非交互环境（stdin 非 TTY），加 --yes 确认写入，否则跳过。\n');
    return 'skipped';
  }
  if (!yes) {
    process.stdout.write('\n确认写入？(y/N) ');
    const answer = readLineFromStdin();
    if (!/^y(es)?$/i.test(answer.trim())) {
      process.stdout.write('已取消。\n');
      return 'cancelled';
    }
  }

  const out = execFileSync('curl', [
    '-sS', '-w', '\n%{http_code}', '-X', 'PUT',
    '-H', `Authorization: Bearer ${token}`,
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    url,
    '-d', body,
  ], { encoding: 'utf8' });

  const nl = out.lastIndexOf('\n');
  const code = Number(out.slice(nl + 1).trim());
  if (code !== 200) {
    const msg = (() => { try { return JSON.parse(out.slice(0, nl)).message; } catch { return out.slice(0, nl); } })();
    die(`写入失败（HTTP ${code}）：${msg}`);
  }
  process.stdout.write(`✅ ${branch} 保护规则已写入\n`);
  return 'applied';
}

function readLineFromStdin() {
  // 同步读一行；只在 TTY 交互路径调用
  const buf = Buffer.alloc(256);
  let len = 0;
  while (len < buf.length) {
    let n;
    try {
      n = readSync(0, buf, len, buf.length - len);
    } catch { break; }
    if (n === 0) break;
    len += n;
    if (buf.subarray(0, len).toString().includes('\n')) break;
  }
  return buf.subarray(0, len).toString();
}

// ---------------------------------------------------------------- main

function main() {
  const args = parseArgs(process.argv.slice(2));

  let cfg;
  try {
    cfg = JSON.parse(readFileSync(args.config, 'utf8'));
  } catch (e) {
    die(`读不到声明文件 ${args.config}：${e.message}`);
  }

  const slug = cfg.repository;
  parseRepoSlug(slug); // 仅做格式校验，提前失败比等到 curl 才报错好
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

  // 组装要处理的 (branch, presetName) 列表
  const targets = [];
  if (args.branch) {
    const name = args.preset || cfg.branches?.[args.branch] || cfg.defaultPreset;
    targets.push([args.branch, name]);
  } else {
    for (const [pattern, presetName] of Object.entries(cfg.branches || {})) {
      targets.push([pattern, presetName]);
    }
  }
  if (targets.length === 0) die('配置里没有 branches，也没给 --branch');

  process.stdout.write(`仓库 ${slug}\n配置文件 ${args.config.replace(ROOT + '/', './')}\n`);
  process.stdout.write(`模式 ${args.apply ? 'APPLY（会真的写）' : 'DRY-RUN（不写）'}\n`);
  if (args.apply && !token) {
    process.stdout.write('\n⚠️  --apply 需要 token，但环境变量 GITHUB_TOKEN / GH_TOKEN 为空。\n');
    process.stdout.write('    请先 export GITHUB_TOKEN=ghp_xxx 再跑，或去掉 --apply 先看载荷。\n');
    process.exit(2);
  }

  const results = targets.map(([pattern, presetName]) => {
    const preset = cfg.presets?.[presetName];
    if (!preset) die(`预设 "${presetName}" 不存在于配置里（可用：${Object.keys(cfg.presets || {}).join(', ')}）`);

    // GitHub 的 branch protection REST API 只接受【精确分支名】，不支持通配符
    // （那是 Repository Rulesets 的能力）。这里明确跳过并给出替代路径，
    // 避免把 404 误读成"规则没生效"。
    if (pattern.includes('*')) {
      process.stdout.write(`\n${'─'.repeat(66)}\n分支模式 ${pattern}  ·  预设 ${presetName}\n${'─'.repeat(66)}\n`);
      process.stdout.write(`⚠️  跳过："${pattern}" 含通配符。\n`);
      process.stdout.write('    branch protection 只接受精确分支名；通配符要用\n');
      process.stdout.write('    Repository Rulesets（Settings → Rules → Rulesets → New rule）。\n');
      return 'skipped-wildcard';
    }

    return applyOne(slug, pattern, presetName, preset, token, args.yes);
  });

  const applied = results.filter((r) => r === 'applied').length;
  const dry = results.filter((r) => r === 'dry-run').length;
  const wildcard = results.filter((r) => r === 'skipped-wildcard').length;

  process.stdout.write(`\n${'═'.repeat(66)}\n`);
  if (applied) process.stdout.write(`完成：${applied} 个分支已写入。\n`);
  if (dry) process.stdout.write(`完成：${dry} 个分支已打印载荷，未写入。\n`);
  if (wildcard) process.stdout.write(`跳过：${wildcard} 个通配符分支（需改用 Rulesets）。\n`);
  if (dry) {
    process.stdout.write('\n下一步：export GITHUB_TOKEN=<你的 token> 后重跑本命令并加 --apply\n');
    process.stdout.write('改完记得把 .github/branch-protection.json 一起 commit，让规则与实际一致。\n');
  }
}

main();