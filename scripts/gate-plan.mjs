#!/usr/bin/env node
/**
 * gate-plan.mjs — 「我改了这些文件，额外要跑什么」一条命令给出答案
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * AGENTS.md §2 那张「改动 → 必跑门禁」表有 40 行、好几条是几百字的事故记录，
 * 而且埋在一篇 45KB 的必读文件里。AI/人每次都得**通读全文 + 关键词匹配**
 * 才能知道自己该跑哪个探针 —— 匹配错就漏跑，漏跑就是一次「本地绿、线上炸」。
 *
 * 本脚本把「按改动路径查该跑什么」变成机器可查：
 *   · 映射真源在 `scripts/lib/gate-map.json`（glob → 命令清单）；
 *   · 人读版（含为什么/事故记录）仍在 AGENTS.md §2 —— **两边都改**，
 *     JSON 管"跑什么"，表格管"为什么"。
 *
 * 用法：
 *   node scripts/gate-plan.mjs            # 按「工作区相对 HEAD 的变更」出计划
 *   node scripts/gate-plan.mjs --json     # 机读出口（给 AI / 脚本）
 *   node scripts/gate-plan.mjs src/views/BOHAI/foo.vue   # 手动指定文件
 *
 * ⚠️ 它只是**计划**，不执行、不判定、永远 exit 0 —— `npm run verify` 仍是兜底。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');
const manual = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const map = JSON.parse(readFileSync(join(ROOT, 'scripts', 'lib', 'gate-map.json'), 'utf-8'));

/** 极简 glob：`**` 跨段、`*` 单段内。够用即可，不引依赖。 */
const globToRegExp = (glob) => {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
};
const compiled = map.entries.map((e) => ({ ...e, re: globToRegExp(e.glob) }));

const git = (args) => {
  try {
    // core.quotepath=false：否则非 ASCII 路径会被转成八进制转义（\346\234…），
    // 既没法跟 glob 匹配，输出里也没法读。
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
  } catch {
    return '';
  }
};

let files;
if (manual.length) {
  files = manual;
} else {
  files = [
    ...(git(['diff', '--name-only', 'HEAD']) || '').split('\n'),
    ...(git(['ls-files', '--others', '--exclude-standard']) || '').split('\n'),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
}

if (!files.length) {
  console.log('[gate:plan] 工作区相对 HEAD 没有变更 —— 无需额外跑什么（verify 兜底）。');
  process.exit(0);
}

const run = [];
const notes = [];
const matched = new Set();
for (const file of files) {
  for (const e of compiled) {
    if (!e.re.test(file)) continue;
    matched.add(file);
    for (const c of e.run || []) if (!run.includes(c)) run.push(c);
    if (e.note && !notes.includes(e.note)) notes.push(e.note);
    if (e.why && !notes.includes(`· ${e.why}`)) notes.push(`· ${e.why}`);
  }
}

if (JSON_OUT) {
  console.log(
    JSON.stringify({ changed: files.length, matched: [...matched], plan: run, notes }, null, 2),
  );
  process.exit(0);
}

console.log(`[gate:plan] 变更 ${files.length} 个文件，命中映射 ${matched.size} 个：`);
for (const f of [...matched].sort()) console.log(`   ${f}`);
const unmatched = files.filter((f) => !matched.has(f));
if (unmatched.length) {
  console.log(`\n   （其余 ${unmatched.length} 个文件没有专门映射 —— verify 兜底即可）`);
  for (const f of unmatched.slice(0, 8)) console.log(`      ${f}`);
  if (unmatched.length > 8) console.log(`      …另有 ${unmatched.length - 8} 个`);
}

console.log(`\n▶ 建议额外执行（${run.length} 条，按依赖顺序）：`);
if (!run.length) console.log('   （无 —— verify 兜底即可）');
for (const c of run) console.log(`   ${c}`);

if (notes.length) {
  console.log('\nℹ️ 相关口径/注意事项：');
  for (const n of notes) console.log(`   ${n}`);
}
console.log('\n⚠️ 以上只是「额外」。最终判定永远是 `npm run verify`（发布前 verify:full）。');
process.exit(0);
