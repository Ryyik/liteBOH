#!/usr/bin/env node
/**
 * lint-delta.mjs — 把「lint 棘轮归因」从手工 set diff 变成一条命令
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * `npm run lint` 带 `--max-warnings 116`，是一条**全局计数**的警告棘轮：
 * 只要新代码留下一个未使用变量，它当场 exit 1，但**它不告诉你是谁加的**。
 *
 * 于是每次判红，AI 都得手工跑 `eslint . -f json`、存两份结果、写脚本做集合差 ——
 * 这恰好发生在「改了一堆中间态、正急着确认是不是自己搞红的」那一刻，
 * 是整条修复循环里最不该有摩擦的地方。
 *
 * 本脚本把这一步变成：**告诉你新增了哪一条、在哪个文件哪一行、以及离上限还有几格。**
 *
 * ── 做法（两条设计约束）─────────────────────────────────────────────
 * 1. **不碰你的工作区**。「HEAD」那一侧是把 `git show HEAD:<path>` 的内容喂给
 *    `eslint --stdin --stdin-filename <原相对路径>` 得到的 —— 走 stdin 而不是
 *    临时检出，是因为这样 ESLint 仍按**真实路径**匹配 flat config 的 `files` 规则，
 *    而**完全不需要 checkout / stash**。与并行会话同工作区时这点是硬要求
 *    （`git stash` 会把别人未提交的改动一起动掉，本仓库出过这类事故）。
 * 2. **并发**。每个 `eslint --stdin` 都是一次冷启动（本仓实测约 5~8s，要加载 vue 插件
 *    与 TS parser）。串行跑 40 个文件要 5 分钟以上 —— 那还不如手工 set diff。
 *    所以基线侧按 `CONCURRENCY` 并发；同时**默认只给「当前仍有警告」的文件做基线**
 *    （没有警告的文件不可能贡献"新增"），要连"消除"也完整统计时加 `--full`。
 *
 * 用法：
 *   node scripts/lint-delta.mjs              # 变更文件 vs HEAD 的警告差集（推荐）
 *   node scripts/lint-delta.mjs --full       # 基线侧不做剪枝（更全，更慢）
 *   node scripts/lint-delta.mjs --all        # 只看当前全量警告，按文件聚合
 *   node scripts/lint-delta.mjs --quiet      # 只打结论行
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ESLINT = join(ROOT, 'node_modules', '.bin', 'eslint');
const ALL = process.argv.includes('--all');
const FULL = process.argv.includes('--full');
const QUIET = process.argv.includes('--quiet');

/** 并发度：本机实测 6 个冷启动并行仍明显快于串行，再高收益递减。 */
const CONCURRENCY = 6;

// 与 eslint.config.js 的 files 口径一致；只管这几类，免得对 .md/.json 空跑。
const LINTABLE = /\.(js|mjs|cjs|vue|ts|tsx)$/;

const say = (...a) => {
  if (!QUIET) console.log(...a);
};

/** 异步跑一条命令，拿 stdout/stderr/status —— 并发需要异步，不能用 spawnSync。 */
const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ status: null, stdout, stderr: String(err) }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    if (opts.input != null) {
      child.stdin.end(opts.input);
      return;
    }
    child.stdin.end();
  });

/** 有上限的并发映射：保持结果顺序。 */
const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
};

if (!existsSync(ESLINT)) {
  console.error('❌ 找不到 ./node_modules/.bin/eslint —— 先 npm ci');
  process.exit(2);
}

/** 从 package.json 的 lint 脚本里读棘轮上限 —— 不写第二份数字。 */
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const limit = Number((pkg.scripts?.lint || '').match(/--max-warnings\s+(\d+)/)?.[1] ?? NaN);

const IGNORED_MSG = /^File ignored/;
/** 归一：按「文件 + 规则 + 原文」聚合，行号参与展示但不参与匹配（行号会漂）。 */
const keyOf = (file, m) => `${file}\u0000${m.ruleId || '(parse)'}\u0000${(m.message || '').trim()}`;

const collect = (aggregate, file, results) => {
  for (const res of Array.isArray(results) ? results : [results]) {
    for (const m of res.messages || []) {
      if (m.ruleId == null && IGNORED_MSG.test(m.message || '')) continue;
      const k = keyOf(file, m);
      if (!aggregate.has(k)) {
        aggregate.set(k, { file, rule: m.ruleId, message: m.message, line: m.line, n: 0 });
      }
      aggregate.get(k).n += 1;
    }
  }
};

const parseJson = (text) => {
  try {
    return JSON.parse(text || '[]');
  } catch {
    return null; // 解析失败由调用处决定怎么报
  }
};

// ── 「现在」一侧：一次全量，口径与 `npm run lint` 完全相同 ──────────────
say('[lint:delta] 跑全量 eslint（约 25s）…');
const cur = await run(ESLINT, ['.', '-f', 'json']);
if (cur.status === null || !cur.stdout) {
  console.error(`❌ eslint 未产出 JSON：${cur.stderr}`);
  process.exit(2);
}
const curResults = parseJson(cur.stdout);
if (!curResults) {
  console.error('❌ eslint JSON 解析失败');
  process.exit(2);
}

const curByKey = new Map();
let curTotal = 0;
for (const r of curResults) {
  const rel = r.filePath.replace(`${ROOT}/`, '');
  collect(curByKey, rel, r);
}
for (const v of curByKey.values()) curTotal += v.n;

const filesWithWarnings = new Set([...curByKey.values()].map((v) => v.file));
say(
  `[lint:delta] 当前全仓 ${curTotal} 条` +
    (Number.isNaN(limit) ? '' : ` / 上限 ${limit}`) +
    `（分布在 ${filesWithWarnings.size} 个文件）\n`,
);

if (ALL) {
  const byFile = new Map();
  for (const [k, v] of curByKey) {
    const f = k.split('\u0000')[0];
    byFile.set(f, (byFile.get(f) || 0) + v.n);
  }
  console.log(`[lint:delta] 全部警告按文件聚合（共 ${byFile.size} 个文件）：`);
  for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${f}`);
  }
  process.exit(0);
}

// ── 变更文件清单（含未跟踪的新文件）────────────────────────────────────
const [diffOut, othersOut] = await Promise.all([
  run('git', ['diff', '--name-only', 'HEAD']),
  run('git', ['ls-files', '--others', '--exclude-standard']),
]);
const allChanged = [...(diffOut.stdout || '').split('\n'), ...(othersOut.stdout || '').split('\n')]
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((f) => LINTABLE.test(f));

const changed = new Set(allChanged);
if (!changed.size) {
  console.log('[lint:delta] 没有变更过的可 lint 文件 —— 无需归因。');
  process.exit(0);
}

// 剪枝：当前零警告的文件不可能贡献"新增"。
// （它仍可能贡献"消除"，但那要 `--full` 才统计 —— 见文件头第 2 条约束。）
const targets = FULL ? [...changed] : [...changed].filter((f) => filesWithWarnings.has(f));
say(
  `[lint:delta] 变更文件 ${changed.size} 个` +
    (FULL ? '（--full：全部取基线）' : `，其中 ${targets.length} 个当前有警告，逐个取 HEAD 基线…`),
);

const baseline = new Map();
const newFiles = [];
const failed = [];
const heads = await mapLimit(targets, CONCURRENCY, async (rel) => ({
  rel,
  show: await run('git', ['show', `HEAD:${rel}`]),
}));

await mapLimit(heads, CONCURRENCY, async ({ rel, show }) => {
  if (show.status !== 0) {
    newFiles.push(rel); // HEAD 里没有 ⇒ 新增文件，基线为空
    return;
  }
  const r = await run(
    ESLINT,
    ['--stdin', '--stdin-filename', rel, '-f', 'json', '--no-warn-ignored'],
    { input: show.stdout },
  );
  const parsed = parseJson(r.stdout);
  if (!parsed) {
    failed.push(rel);
    return;
  }
  collect(baseline, rel, parsed);
});

// ── 差集 ──────────────────────────────────────────────────────────────
const added = [];
const removed = [];
for (const [k, v] of curByKey) {
  const had = baseline.get(k) || 0;
  if (v.n > had) added.push({ ...v, delta: v.n - had });
}
for (const [k, had] of baseline) {
  const [file, rule] = k.split('\u0000');
  const now = curByKey.get(k)?.n || 0;
  if (had > now) removed.push({ file, rule, delta: had - now });
}

const addedN = added.reduce((a, x) => a + x.delta, 0);
const removedN = removed.reduce((a, x) => a + x.delta, 0);
const net = addedN - removedN;

// ── 输出 ──────────────────────────────────────────────────────────────
console.log('─'.repeat(72));
console.log(
  `[lint:delta] 变更 ${changed.size} 个文件（新增 ${newFiles.length} 个）· ` +
    `新增警告 ${addedN} · 消除 ${removedN} · 净 ${net >= 0 ? '+' : ''}${net}` +
    (FULL ? '' : '（消除侧只统计「当前仍有警告」的文件，要完整口径加 --full）'),
);

if (added.length) {
  console.log('\n✚ 新增（这些就是把你判红的候选）：');
  for (const a of added.sort((x, y) => y.delta - x.delta)) {
    console.log(`   +${a.delta}  ${a.file}${a.line ? `:${a.line}` : ''}  ${a.rule}`);
    console.log(`        ${a.message}`);
  }
} else {
  console.log('\n（本次改动没有新增任何 lint 警告）');
}

if (removed.length) {
  console.log('\n− 已消除（顺手把棘轮下调，是纯收益）：');
  for (const r of removed.sort((x, y) => y.delta - x.delta)) {
    console.log(`   -${r.delta}  ${r.file}  ${r.rule}`);
  }
}

if (failed.length) {
  console.warn(`\n⚠️ ${failed.length} 个文件的基线解析失败（已跳过，可能低估"新增"）：`);
  for (const f of failed) console.warn(`   ${f}`);
}
if (newFiles.length) {
  console.log(`\nℹ️ 其中 ${newFiles.length} 个是新增文件（基线为空，其全部警告都算"新增"）：`);
  for (const f of newFiles.slice(0, 10)) console.log(`   ${f}`);
  if (newFiles.length > 10) console.log(`   …另有 ${newFiles.length - 10} 个`);
}

if (!Number.isNaN(limit)) {
  const headroom = limit - curTotal;
  console.log('');
  if (headroom < 0) {
    console.log(`棘轮：${curTotal} / ${limit}  ❌ 已超 ${-headroom} 条 —— 必须清理；`);
    console.log(`     清完把 package.json 里的 --max-warnings 改到实际值（现应写 ${curTotal}）。`);
  } else if (headroom === 0) {
    console.log(`棘轮：${curTotal} / ${limit}  ⚠️ 恰好卡满：任何一条新警告都会当场 exit 1。`);
  } else {
    console.log(`棘轮：${curTotal} / ${limit}（余量 ${headroom}）`);
  }
  if (removedN > 0 && headroom >= 0) {
    console.log(
      `提示：本次净消除 ${removedN} 条，可把 --max-warnings 下调到 ${limit - removedN}。`,
    );
  }
}
process.exit(0);
