#!/usr/bin/env node
/**
 * verify.mjs —— `npm run verify` 的并行编排器
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 原来的 verify 是一条 `npm run A && npm run B && …` 的 18 段长链，全部串行。
 * 2026-11-02 在这台机器（10 核 / M 系）上逐段实测（`npm run` 口径）：
 *
 *     test 100.0s │ type-check 14.6s │ lint 10.9s │ 其余 15 道门禁合计 16.2s
 *     ────────────────────────────────────────────────────────────────
 *     串行总计 144s
 *
 * 那 16.2s 里，每道门禁还各自摊了 **约 0.3s 的 `npm run` 启动**（15 道≈4.5s）。
 * 门禁彼此**只读、互不依赖**（写文件的分支全在 `--update` 里，正常档不触发），
 * 所以串行跑它们纯粹是在浪费墙钟 —— 这是最容易安全拿到的一笔时间。
 *
 * ── 三档策略（按 CPU 自适应，**CI 上行为不变**）────────────────────
 *   ① 门禁：**并行**（并发数 = clamp(核数-2, 2, 6)）。已有红就不再启动新的，
 *      语义与 `&&` 链一致；已在飞的自然跑完，不留孤儿进程。
 *   ② 重活三件（lint / type-check / test）：
 *      · 核数 ≥ 8：lint 与 type-check **并行**跑（都是单线程，吃不满多核），
 *        跑完再单独跑 test —— **test 始终独占**，不与任何东西抢 CPU。
 *        这条不是洁癖：`tests/unit/project-structure.test.js` 的全仓同步扫描
 *        曾被 CPU 争抢饿死撞 45s 超时（见 vitest.config.js 的 maxWorkers 注释），
 *        2026-10-15 复现过。所以再快的诱惑也不让 test 与重活并发。
 *      · 核数 < 8（CI 的 ubuntu-latest 是 4 核）：**完全串行**，与改动前一致。
 *   ③ check:ratchets：信息性汇总（恒 exit 0），搭 ② 的并行批，不占墙钟。
 *
 * ── 语义承诺（不许悄悄变）──────────────────────────────────────────
 *   · **同一份门禁清单**：从 package.json 的 verify 链正则提取，不写第二份。
 *   · **同样的失败语义**：任一门红 ⇒ 不跑后续重活，exit 1。
 *   · **同样的输出可读性**：每门一行 `✅ 名字 耗时`，红的那门打印全部输出。
 *
 * 用法：
 *   node scripts/verify.mjs               # 门禁 + 重活 + 汇总（= npm run verify）
 *   node scripts/verify.mjs --gates-only  # 只跑门禁（prepush 用）
 *   node scripts/verify.mjs --heavy-only  # 只跑 lint/type-check/test（prepush --full 用）
 *   npm run verify:serial                 # 退回老的串行长链（出问题时的逃生口）
 *   VERIFY_CORES=4 node scripts/verify.mjs  # 模拟 CI 的 4 核串行档（验证降级路径）
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const GATES_ONLY = ARGV.includes('--gates-only');
const HEAVY_ONLY = ARGV.includes('--heavy-only');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** 重活：耗时长、吃 CPU */
const HEAVY = ['lint', 'type-check', 'test'];
/** 信息性汇总：恒 exit 0，只打印一张总账表 */
const SUMMARY = 'check:ratchets';

/**
 * 门禁清单 = `verify:serial` 里的 `npm run X` 序列。
 *
 * ⚠️ 为什么读 `verify:serial` 而不是 `verify`：`verify` 本身已经指向本脚本
 * （`node scripts/verify.mjs`），再去解析它会**一条都匹配不到**，于是并行跑 0 道门禁、
 * 直接打印「全绿」—— 最糟糕的假绿。清单留在 `verify:serial` 当单一真源，
 * 本脚本只负责编排；下面还有 `chain.length === 0` 的硬断言兜住「有人把清单删空」。
 */
const chainSource = pkg.scripts['verify:serial'] || '';
const chain = [...chainSource.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((m) => m[1]);
if (!chain.length) {
  console.error(
    '[verify] ❌ 从 package.json 的 verify:serial 里没解析到任何 `npm run X` —— 拒绝静默跑空。',
  );
  process.exit(1);
}
const GATES = chain.filter((name) => !HEAVY.includes(name) && name !== SUMMARY);

/* VERIFY_CORES 可覆盖核数（只为「本机模拟 CI 的 4 核串行档」而存在，见文件头用法） */
const CORES = Number(process.env.VERIFY_CORES) || availableParallelism();
/** 可用 VERIFY_GATE_CONCURRENCY 覆盖（调参与排查用）；默认按核数留出余量 */
const GATE_CONCURRENCY =
  Number(process.env.VERIFY_GATE_CONCURRENCY) || Math.max(2, Math.min(4, CORES - 2));
/** 多核才允许 lint/type-check/总账 并行；CI（4 核）走纯串行，行为与旧链一致 */
const CAN_PARALLEL_LIGHT = CORES >= 8;

const elapsed = (start) => Math.round(Number(process.hrtime.bigint() - start) / 1e6);
const fmt = (n) => (n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`);

/** 跑一条 npm script 并捕获输出（并行时不能 inherit，否则终端串行） */
const runCaptured = (name) =>
  new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn('npm', ['run', '--silent', name], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ name, ok: code === 0, out, ms: elapsed(started) }));
  });

/** 长任务（test 80s+）必须实时可见，用 inherit */
const runInherit = (name) =>
  new Promise((resolve) => {
    const started = process.hrtime.bigint();
    console.log(`\n[verify] ▶ ${name}`);
    const child = spawn('npm', ['run', '--silent', name], {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve({ name, ok: code === 0, out: '', ms: elapsed(started) }));
  });

/** 成功时留最有信息的一行（各门禁自己打的 ✅/统计行），失败时另打印全量 */
const lastLine = (out) =>
  out
    .split('\n')
    .map((s) => s.trimEnd())
    .filter(Boolean)
    .filter((s) => !s.startsWith('> '))
    .pop()
    ?.trim() || '';

const runPool = async (names, concurrency, onDone) => {
  const queue = [...names];
  const failures = [];
  const worker = async () => {
    while (queue.length) {
      /* 已有红就不再启动新的（与 `&&` 链一致），已在飞的自然跑完 */
      if (failures.length) return;
      const r = await runCaptured(queue.shift());
      if (!r.ok) failures.push(r);
      onDone(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker));
  return failures;
};

const printFailure = (f) => {
  console.error(`\n───── ${f.name} ─────`);
  if (f.out.trim()) console.error(f.out.trim());
};

/* ── ① 门禁（并行）+ ② 轻活（lint / type-check / 总账，与门禁同时起跑）──
   两者互不依赖：门禁是 fs 扫描，lint/tsc 是 CPU 编译，压在同一批核上互相填补等待。
   实测（10 核 M 系，2026-11-02）：门禁独占 11.4s、轻活独占 15.2s，重叠后 ≈16s，
   比「先门禁后轻活」的 26s 省 10s。 */
const t0 = process.hrtime.bigint();

const LIGHT = [SUMMARY, 'lint', 'type-check'];
/* 只在「多核 + 需要跑重活」时才预热这一批；--gates-only 时不应白跑 lint */
const lightPromise =
  CAN_PARALLEL_LIGHT && !GATES_ONLY ? Promise.all(LIGHT.map((name) => runCaptured(name))) : null;
/* --heavy-only（prepush --full 用）：没有门禁批陪跑，就地起这一批 */
const heavyLightPromise =
  lightPromise || (CAN_PARALLEL_LIGHT ? Promise.all(LIGHT.map((name) => runCaptured(name))) : null);

if (!HEAVY_ONLY) {
  console.log(`\n[verify] 门禁 ${GATES.length} 道，并发 ${GATE_CONCURRENCY}（核数 ${CORES}）…`);
  const failed = await runPool(GATES, GATE_CONCURRENCY, (r) => {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.name.padEnd(30)} ${fmt(r.ms)}`);
    const line = lastLine(r.out);
    if (r.ok && line) console.log(`     ${line}`);
  });

  if (failed.length) {
    console.error('\n[verify] 以下门禁红了（完整输出）：');
    failed.forEach(printFailure);
    console.error(`\n[verify] FAIL：${failed.length} 道门禁未通过`);
    process.exit(1);
  }
}

/* ── ②③ 重活 + 汇总 ──────────────────────────────────────────────── */
if (!GATES_ONLY) {
  if (CAN_PARALLEL_LIGHT) {
    console.log('\n[verify] 重活：lint / type-check / 棘轮总账（已与门禁并行起跑），test 独占…');
    const light = await heavyLightPromise;
    for (const r of light.filter((x) => x.name !== SUMMARY)) {
      console.log(`\n[verify] ${r.ok ? '✅' : '❌'} ${r.name}（${fmt(r.ms)}）`);
      if (!r.ok) printFailure(r);
    }
    const lightFailed = light.filter((r) => !r.ok);
    if (lightFailed.length) {
      console.error(`\n[verify] FAIL：${lightFailed.map((f) => f.name).join(', ')}`);
      process.exit(1);
    }

    const test = await runInherit('test');

    /* 总账最后打印（信息性，恒 exit 0，但顺序上放末尾更符合「收尾汇报」的直觉） */
    const summary = light.find((r) => r.name === SUMMARY);
    if (summary) {
      console.log(`\n[verify] ${summary.ok ? '✅' : '❌'} ${SUMMARY}（${fmt(summary.ms)}）`);
      console.log(summary.out.trimEnd());
    }

    if (!test.ok) {
      console.error('\n[verify] FAIL：test');
      process.exit(1);
    }
  } else {
    /* 纯串行档（CI 4 核）：与旧链逐项一致，只是少了每段 `npm run` 的重复启动 */
    console.log('\n[verify] 重活：串行（核数 < 8，与旧链一致）…');
    for (const name of ['lint', 'type-check', 'test']) {
      const r = await runInherit(name);
      if (!r.ok) {
        console.error(`\n[verify] FAIL：${name}`);
        process.exit(1);
      }
    }
    const summary = await runInherit(SUMMARY);
    if (!summary.ok) process.exit(1);
  }
}

console.log(`\n[verify] 全绿（总耗时 ${fmt(elapsed(t0))}）。`);
process.exit(0);
