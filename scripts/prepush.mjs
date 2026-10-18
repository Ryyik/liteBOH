#!/usr/bin/env node
/**
 * prepush.mjs — 推送前对「提交树」跑门禁，而不是对「工作区」
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 2026-10-15 一天之内 CI 三连红，根因全是同一类：**本地绿 = 工作区绿，CI 红 = 提交树红**。
 * 中间隔着三类「只在本地存在」的东西：
 *   ① 没提交的门禁本体与基线 —— check-liquid-glass 的折射守卫、dark-token-budget、
 *      （以及更早的）package-lock 配套：本地跑的门禁/测试用着新守卫新基线，CI 用提交树里的旧版；
 *   ② 没提交的 lock 配套 —— package.json 加了依赖但 lock 没一起提交，npm ci 在 CI 必炸；
 *   ③ 先行入库的半成品测试 —— 测试断言的源码还在别人工作区里没提交，本地过、CI 断言红。
 *
 * verify:fast / npm test 全绿救不了这些 —— **它们跑的是工作区**。
 * 唯一能在推送前看到「提交树真相」的办法，是对 HEAD 做一次干净检出再跑门禁。
 *
 * ── 做法 ────────────────────────────────────────────────────────────
 *   · `git worktree add --detach <tmp> HEAD`：干净检出，**不碰工作区、不碰索引**；
 *   · 在里面跑全部门禁（清单从 package.json 的 verify 链自动提取，不写第二份）；
 *   · `npm ci --dry-run`：抓 package.json / lock 失同步（不装包、不碰本机 node_modules）；
 *   · `--full`：symlink node_modules 后再加跑 lint + type-check + test（约多 10 分钟；build:ci 会暴露「只有构建才炸」的坑，如 worker/静态资源缺失）。
 *
 * 用法：npm run prepush [--full]
 * 退出码：全部绿 = 0；任何一门红 = 1。⏱ 默认约 40s（最重的是全仓结构扫描）。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const FULL = process.argv.includes('--full');
// --quick：漏配快速档（doc-truth + self-test + lock），供 git pre-push 钩子调用。
// 对提交树跑（干净 worktree）——工作区的并行会话在途改动不背锅。
const QUICK = process.argv.includes('--quick');

const git = (args) => {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败：${r.stderr}`);
  return r.stdout;
};

// 门禁清单从 verify 链自动提取 —— 不写第二份清单（写第二份迟早和 verify 分叉）。
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SKIP = new Set(['lint', 'type-check', 'test', 'check:ratchets']);
const gates = QUICK
  ? // 漏配快速档：只跑「配套一致性」两道（lock 同步在流程尾部单独跑）。
    // 覆盖 2026-10-18 复盘的三类根因：计数漂移（doc-truth）、
    // 基线余量假绿（self-test）、lockfile 失同步（ci --dry-run）。
    ['check:doc-truth', 'check:gates-self-test', 'check:untracked-imports']
  : [
      ...[...(pkg.scripts.verify || '').matchAll(/npm run ([A-Za-z0-9:_-]+)/g)]
        .map((m) => m[1])
        .filter((name) => !SKIP.has(name)),
      // verify 链不跑自检（注入违规→断言变红，耗时数分钟），只有 CI Quality Gate 跑 ——
      // 2026-10-18 layering 基线余量假绿连红 CI 10 次而本地/prepush 全绿，就是这条缝。
      // 自检是「你凭什么证明自己会红」的总闸，推送前必须过。
      'check:gates-self-test',
    ];

// 干净 worktree + 退出兜底（任何路径都必须清掉，否则 /tmp 会攒一排检出）
const wt = mkdtempSync(path.join(tmpdir(), 'boh-prepush-'));
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  try {
    spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT });
  } catch {
    /* 上面 spawnSync 不抛错，这里兜底 */
  }
  try {
    rmSync(wt, { recursive: true, force: true });
  } catch {
    /* 同上 */
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}
process.on('exit', cleanup);

const head = git(['rev-parse', '--short', 'HEAD']).trim();
console.log(`[prepush] 对 HEAD ${head} 建干净检出（工作区与索引不受影响）：${path.basename(wt)}`);
git(['worktree', 'add', '--detach', wt, 'HEAD']);

if (FULL) {
  // lint/type-check/test 需要依赖；symlink 让 worktree 复用本机的 node_modules
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(wt, 'node_modules'), 'dir');
}

const results = [];
const run = (label, cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
  const ok = r.status === 0;
  results.push({ label, ok, out: `${r.stdout || ''}${r.stderr || ''}` });
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  return ok;
};

console.log(
  `[prepush]${QUICK ? '（quick 漏配快速档）' : ''} 跑 ${gates.length} 道门禁（对提交树）…`,
);
let allOk = true;
for (const name of gates) allOk = run(name, 'npm', ['run', '--silent', name], wt) && allOk;

console.log('[prepush] npm ci --dry-run（抓 package.json / lock 失同步）…');
allOk = run('lock 同步', 'npm', ['ci', '--dry-run'], wt) && allOk;

if (FULL) {
  console.log('[prepush] --full：lint + type-check + test …');
  for (const name of ['lint', 'type-check', 'test', 'build:ci']) {
    allOk = run(name, 'npm', ['run', '--silent', name], wt) && allOk;
  }
}

// 失败的门禁把首条错误行带出来 —— 只报「红了」不给线索等于没修
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error('\n[prepush] 失败门禁的首条错误线索：');
  for (const f of failed) {
    const line = f.out
      .split('\n')
      .map((s) => s.trim())
      .find((s) => /error|❌|FAIL|超出|失败/i.test(s) && !/^\[prepush\]/.test(s));
    console.error(`   ${f.label}: ${line || '（未提取到错误行，单独重跑看全量输出）'}`);
  }
  console.error(
    '\n这些红来自**提交树**：工作区里能让它变绿的东西（新守卫/新基线/新源码）还没提交。',
  );
  console.error('先把对应的门禁/基线/源码改动补提交，再推送。');
  cleanup();
  process.exit(1);
}

console.log(
  `\n[prepush] 全绿 —— 提交树 ${head} 可以推送。${FULL ? '' : '（未含 lint/type-check/test，要全量加 --full）'}`,
);
