#!/usr/bin/env node
/**
 * check-ratchet-summary.mjs — 棘轮总账
 *
 * 为什么需要它：本仓库的存量债由 4 个棘轮分别锁死，但它们散在各自的脚本与
 * JSON 基线里 —— 「债务在减少还是增加」没有一个地方能一眼看到。
 * 这个脚本把它们汇总成一张表，作为 `verify` 的最后一步打印。
 *
 * ── 设计要点 ────────────────────────────────────────────────────────
 * 1. **不复制计数逻辑**。汇总器若自己再数一遍，就成了第二份真源 —— 迟早和
 *    真正的门禁给出不同的数。所以它只调各棘轮的 `--json` 机读出口拿数。
 * 2. **只报数、不判定、不改退出码**。判定是各棘轮自己的职责；汇总器永远 exit 0，
 *    否则「总账」会变成第 5 个门禁，出问题时反而分不清是谁红的。
 * 3. 离线算不出的（anon-execute 要 Management API token）只读基线并标注原因，
 *    不留一个看起来像 0 的假数字。
 *
 * 用法：node scripts/check-ratchet-summary.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/** 可离线求值的棘轮：跑它自己的脚本、读 `--json` 机读出口 */
const COMPUTABLE = [
  { script: 'scripts/check-important-budget.mjs', desc: '!important 总量' },
  { script: 'scripts/check-dark-tokens.mjs', desc: '暗色裸色值' },
  { script: 'scripts/check-layering.mjs', desc: 'UI 层直连数据层出口' },
];

/** 离线算不出的：只读基线，并说明为什么拿不到现值 */
const OFFLINE = [
  {
    file: 'scripts/anon-execute-baseline.json',
    desc: '匿名可执行函数',
    why: '需 Management API token，离线读不到现值（npm run security:anon-check 可查）',
  },
];

const rows = [];

for (const { script, desc } of COMPUTABLE) {
  const r = spawnSync('node', [script, '--json'], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  const line = (r.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .pop();
  if (!line) {
    rows.push({
      name: script.replace(/^scripts\/check-|\.mjs$/g, ''),
      desc,
      current: null,
      baseline: null,
    });
    continue;
  }
  try {
    const j = JSON.parse(line);
    rows.push({
      name: j.ratchet,
      desc,
      current: j.current,
      baseline: j.baseline,
      unit: j.unit || '',
    });
  } catch {
    rows.push({ name: script, desc, current: null, baseline: null });
  }
}

for (const { file, desc, why } of OFFLINE) {
  const abs = join(ROOT, file);
  if (!existsSync(abs)) continue;
  const b = JSON.parse(readFileSync(abs, 'utf-8'));
  rows.push({
    name: file.split('/').pop().replace('-baseline.json', ''),
    desc,
    current: null,
    baseline: b.total,
    note: why,
  });
}

// ── 输出 ────────────────────────────────────────────────────────────
const pad = (s, n) =>
  String(s) +
  ' '.repeat(
    Math.max(0, n - [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 2 : 1), 0)),
  );

console.log('[棘轮总账] 存量债只许下降；抬基线必须走 --update 并在 commit message 交代理由');
console.log('');

const NAME_W = 20;
const NUM_W = 16;
console.log(`  ${pad('棘轮', NAME_W)}${pad('当前 / 基线', NUM_W)}状态`);
for (const r of rows) {
  const name = pad(r.name, NAME_W);
  if (r.current == null) {
    console.log(`  ${name}${pad(`— / ${r.baseline}`, NUM_W)}⬜ ${r.note || '离线不可测'}`);
    continue;
  }
  const diff = r.baseline - r.current;
  const status =
    diff > 0
      ? `↓ 已削减 ${diff}（记得 --update 下调基线）`
      : diff === 0
        ? '持平'
        : `⚠️ 超出 ${-diff}`;
  console.log(`  ${name}${pad(`${r.current} / ${r.baseline}`, NUM_W)}${status}`);
}

const measured = rows.filter((r) => r.current != null);
const sumCur = measured.reduce((a, r) => a + r.current, 0);
const sumBase = measured.reduce((a, r) => a + r.baseline, 0);
console.log('');
console.log(
  `  可离线求值的 ${measured.length} 个棘轮合计：当前 ${sumCur} / 基线 ${sumBase}` +
    (sumBase - sumCur > 0 ? `（已削减 ${sumBase - sumCur}）` : ''),
);
console.log(`  另有 ${rows.length - measured.length} 个棘轮需联网或构建后才能求值（已在上表标注）`);
