#!/usr/bin/env node
/**
 * check-gates-self-test.mjs — 门禁自检：证明每道门禁**真的会红**
 *
 * 为什么需要它：本仓库出过两次「检查在跑、但永远绿」（详见 lib/gate-fixtures.mjs 头注）。
 * 假绿是静默的 —— 它不会报错，只会持续签发「已验证」的假签名。人盯不住，只能靠机器周期性自证。
 *
 * 做法：对每条 fixture 注入一个**已知违规** → 跑该门禁 → 断言退出码非 0 → 撤销。
 *
 * 用法：
 *   node scripts/check-gates-self-test.mjs              # 全跑
 *   node scripts/check-gates-self-test.mjs --only=check:views
 *
 * 退出码：
 *   0  所有已覆盖的门禁都自证会红（未覆盖的只报告，不算失败）
 *   1  有门禁**没能**红 —— 那它就是假绿嫌疑，必须查
 *
 * ⚠️ 本脚本会临时改写工作区文件（每条跑完立刻还原，异常路径也有兜底）。
 *    因此**不要**把它塞进 verify/build:ci 主链；要进 CI 请单开一个 job
 *    （CI 跑在干净检出上，改坏也只影响那一个 job）。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES, UNTESTABLE } from './lib/gate-fixtures.mjs';

const ROOT = process.cwd();
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

// ── 兜底还原：任何异常路径都必须把工作区还原干净 ──────────────────────
const pending = new Set();
const restoreAll = () => {
  for (const restore of [...pending].reverse()) {
    try {
      restore();
    } catch (err) {
      console.error(`   ⚠️ 还原失败（请手动 git checkout）：${err.message}`);
    }
  }
  pending.clear();
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.error(`\n[gates-self-test] 收到 ${sig}，还原工作区后退出`);
    restoreAll();
    process.exit(130);
  });
}
process.on('uncaughtException', (err) => {
  console.error(err);
  restoreAll();
  process.exit(1);
});
process.on('exit', restoreAll);

// ── 收集「本该有牙」的门禁清单（verify + build:ci 链上出现的）──────────
const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).scripts;
const chainGates = new Set();
for (const key of ['verify', 'build:ci']) {
  for (const m of (scripts[key] || '').matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
    const name = m[1];
    // lint / type-check / test 不是「门禁脚本」，不参与自检
    if (name === 'lint' || name === 'type-check' || name === 'test') continue;
    chainGates.add(name);
  }
}

const fixtures = ONLY ? FIXTURES.filter((f) => f.gate === ONLY) : FIXTURES;
if (ONLY && !fixtures.length) {
  console.error(`[gates-self-test] 没有匹配 --only=${ONLY} 的 fixture`);
  process.exit(2);
}

const results = [];
console.log(`[gates-self-test] 开始注入违规样本（共 ${fixtures.length} 条，跑完逐条还原）\n`);

for (const fx of fixtures) {
  let restore;
  process.stdout.write(`  ${fx.gate.padEnd(28)} `);

  try {
    restore = fx.prepare();
  } catch (err) {
    console.log(`⚠️  注入失败：${err.message}`);
    results.push({ gate: fx.gate, status: 'inject-failed', why: fx.why });
    continue;
  }

  pending.add(restore);
  let code = null;
  let output = '';
  try {
    const r = spawnSync('npm', ['run', '--silent', fx.gate], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 300_000,
      env: { ...process.env, npm_config_loglevel: 'silent' },
    });
    code = r.status;
    output = `${r.stdout || ''}${r.stderr || ''}`;
  } finally {
    pending.delete(restore);
    restore();
  }

  if (code !== 0) {
    console.log(`✅ 会红（exit ${code}）`);
    results.push({ gate: fx.gate, status: 'red', code, why: fx.why });
  } else {
    console.log(`❌ 没红（exit 0）—— 假绿嫌疑`);
    const firstLines = output.split('\n').filter(Boolean).slice(0, 3).join('\n        ');
    if (firstLines) console.log(`        ${firstLines}`);
    results.push({ gate: fx.gate, status: 'false-green', code, why: fx.why });
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────
const red = results.filter((r) => r.status === 'red');
const falseGreen = results.filter((r) => r.status === 'false-green');
const injectFailed = results.filter((r) => r.status === 'inject-failed');
// 未覆盖清单必须按**全部** fixture 算，不能用本次跑的子集 ——
// 否则 --only 模式会把「只是这次没跑」的门禁误报成未覆盖。
const allCovered = new Set(FIXTURES.map((f) => f.gate));
const uncovered = [...chainGates].filter((g) => !allCovered.has(g)).sort();

console.log('\n' + '─'.repeat(64));
console.log(
  `[gates-self-test] 本次跑 ${results.length} 条，自证会红 ${red.length} 条` +
    (ONLY ? `（--only=${ONLY}）` : ''),
);
console.log(
  `                  链上门禁总数：${chainGates.size}，已有 fixture：${allCovered.size}，未覆盖：${uncovered.length}`,
);

if (falseGreen.length) {
  console.log('\n❌ 以下门禁**注入违规后仍然 exit 0** —— 它们是假绿，必须查：');
  for (const r of falseGreen) console.log(`   ${r.gate}    （本应拦：${r.why}）`);
}
if (injectFailed.length) {
  console.log('\n⚠️  以下 fixture 注入失败（样本已失效，等于没有自检）：');
  for (const r of injectFailed) console.log(`   ${r.gate}`);
}
if (uncovered.length) {
  console.log('\n⬜ 未覆盖（尚无法自证，属已知盲区）：');
  for (const g of uncovered) {
    const known = UNTESTABLE.find((u) => u.gate === g);
    console.log(
      `   ${g.padEnd(28)} ${known ? known.why : '（未登记原因，建议补 fixture 或登记到 UNTESTABLE）'}`,
    );
  }
}

const failed = falseGreen.length + injectFailed.length;
if (failed) {
  console.log(`\n[gates-self-test] FAIL：${failed} 条未通过`);
  process.exit(1);
}
console.log('\n[gates-self-test] PASS：已覆盖的门禁全部自证会红。');
