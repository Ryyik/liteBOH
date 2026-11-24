#!/usr/bin/env node
/**
 * check-root-clean.mjs — 「不要往根目录新增 demo」这条规则的门禁化
 *
 * ── 背景 ────────────────────────────────────────────────────────────
 * AGENTS.md §6 早就写了：「不要往仓库根目录新增 `xxx-demo.html`（已有 14 个是历史债，
 * 不再增加）」。但 2026-10-15 的 AI 环境审计实测：根目录已有 **24 个** html 沙盒，
 * 而且 `demo-bolek-glass-refract.html` / `demo-wxperia-liquid.html` 都是**未跟踪的新增**。
 * 规则写了等于没写 —— 因为它**没有牙**：没有门禁、没有归拢目录，
 * 每次做视觉沙盒"顺手放根目录"都不会有任何反馈。
 *
 * 结论与做法：**与其继续写"不要放"，不如让门禁替你把这句话的执行成本归零。**
 *
 * ── 为什么是「棘轮」而不是「要么全删、要么全留」─────────────────────
 * 直接把 24 个 demo 判红，只会逼人 `--no-verify`；强行要求"立刻全部平移到 docs/demos/"
 * 又得先拍板（根目录放原型是这个仓库的**既有惯例**，`ai-config-demo.html`、
 * `boh-fenjing-demo.html` 都这么来的 —— 惯例 vs 规则本身在打架，需人来裁）。
 *
 * 所以这里走本仓库的既定套路：**冻结现状 = 棘轮**。
 *   · 现存 24 个 → 基线记账，不判红（存量债，明账）；
 *   · 任何**新增**的根目录沙盒 → 立刻 exit 1，并告诉你该放哪儿；
 *   · 真要归拢时用 `--update` 把基线降下来（下调永远是好方向）。
 * 换句话说：这一步不逼任何人现在做决定，只**止住增长**。
 *
 * 用法：
 *   node scripts/check-root-clean.mjs            # 判红模式（全量，扫工作树）
 *   node scripts/check-root-clean.mjs --staged   # 只判**暂存区**里的新增（pre-commit 用）
 *   node scripts/check-root-clean.mjs --update   # 以当前根目录重写基线（归拢后下调）
 *   node scripts/check-root-clean.mjs --json     # 机读出口（供 check-ratchet-summary 汇总）
 *
 * ── 为什么需要 `--staged`（2026-11-24 加）────────────────────────────
 * 全量模式的输入是 `readdirSync(ROOT)` —— **它不知道文件是谁的**。而 pre-commit
 * 跑在共享工作区里，于是并行会话往根目录扔的未跟踪沙盒会把**别人的提交**拦下。
 * 2026-11-24 实测代价：提交被拦 → 只能 `--no-verify` 绕过 → **那条命令会连
 * lint-staged 一起跳过**（prettier / eslint --fix 都不跑），正好撞上 AGENTS.md §5
 * 记的「验证的树 ≠ 提交的树」。当天是侥幸（第一次被拦时 lint-staged 已经改写并
 * 暂存过），先带 `--no-verify` 就真出事了。
 *
 * 所以把「判什么」和「在哪个集合里判」拆开：
 *   · 全量（无参数 / verify / verify:fast / gates-self-test / CI）—— 行为**一字不变**；
 *   · `--staged`（只在 pre-commit）—— 输入换成 `git diff --cached`，只拦本次
 *     提交里真的新增的根目录沙盒。
 * 两者共用同一个 `classify()` + 同一个基线，不存在第二份判定逻辑。
 *
 * ⚠️ `--staged` 的已知边界（写在这就是让人别误以为它是全量的替代品）：
 * 它看的是**暂存区**，不是「本次 commit 精确包含的路径」—— git 不向前置钩子
 * 提供后者。所以若别人 `git add` 了自己的沙盒却没提交，本模式仍会红（那时
 * 提示里会点名文件，让人能判断是不是自己弄的）。代价远小于原行为：原来只要
 * 根目录**有**未跟踪沙盒就红，现在要它真的进了暂存区。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'scripts', 'root-clean-baseline.json');
const UPDATE = process.argv.includes('--update');
/** 只判暂存区（pre-commit 用）。与 `--update` / `--json` 同时出现时让位于它们。 */
const STAGED = process.argv.includes('--staged') && !UPDATE && !process.argv.includes('--json');

/** Vite 入口，**永远**允许 —— 它不是沙盒，少了它整个站都起不来。 */
const ENTRY = new Set(['index.html']);

/**
 * 「根目录临时脚本」的识别式。
 * 判据来自审计实测的残留物（`repro-import-tmp.mjs` / `diag-render-tmp.mjs` / `test_dm_ui.py`）：
 * 临时性写在名字里（`-tmp` / `repro-` / `diag-` / `test_*`）。
 * 刻意写得**窄**：宁可漏放一个，也不要误伤 `vite.config.js` 这类真实配置
 * （误伤会让人习惯性 `--no-verify`，那比没有门禁更糟）。
 */
const SCRATCH_RE = /^(repro-|diag-|test_)|-tmp\.(mjs|js|cjs|py)$/;

const SKIP = new Set(['stats.html']); // 构建报告，已被 .gitignore 忽略，不是沙盒

/** 是不是「根目录沙盒」——html 与临时脚本的判据都只在这里定义一次。 */
const isHtmlSandbox = (n) => n.endsWith('.html') && !ENTRY.has(n) && !SKIP.has(n);
const isScratch = (n) => SCRATCH_RE.test(n);

/**
 * 取「根目录下的文件名单」。两种模式只在这里分叉，判定逻辑完全共用。
 *   · 全量：`readdirSync`（工作树现状，含未跟踪 —— gates-self-test 的 fixture
 *     就是一个未跟踪文件，所以它必须走这条）；
 *   · `--staged`：`git diff --cached --name-only --diff-filter=ACMR`（新增/复制/
 *     修改/改名，排除删除），只取仓库**根层**的（`/` 不能出现，否则是子目录文件）。
 *     用 `-z` 读，路径含空格/中文也不会被拆开。
 */
function listRootNames() {
  if (!STAGED) {
    return readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  }
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    // 取不到暂存区（不在 git 仓库里 / git 不可用）时**退回全量**：
    // 宁可多拦一次，也不要因为「问不到」而静默放行全部新增。
    console.warn('⚠️  --staged 读不到暂存区，退回全量扫描（原因见下）');
    console.warn(String(r.stderr || '').trim() || '(git 无输出)');
    return readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  }
  return (
    (r.stdout || '')
      .split('\0')
      .filter(Boolean)
      .filter((p) => !p.includes('/')) // 只要根层文件
      // 暂存区里可能有已从工作树删掉的文件（`git rm --cached` 之类），
      // 那不是「要新增沙盒」，跳过。
      .filter((p) => existsSync(join(ROOT, p)))
  );
}

const entries = listRootNames();

const htmlFiles = entries.filter(isHtmlSandbox).sort();
const scratchFiles = entries.filter(isScratch).sort();

if (UPDATE || !existsSync(BASELINE_FILE)) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify(
      {
        note:
          '根目录沙盒棘轮基线（check-root-clean.mjs）。' +
          '存量记账、只许下调；新增根目录 *.html 或临时脚本会 exit 1。' +
          '归拢到 docs/demos/ 之后跑 npm run check:root-clean:update 下调。',
        html: htmlFiles,
        scratch: scratchFiles,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `✅ 基线已${UPDATE ? '更新' : '建立'}：根目录沙盒 html ${htmlFiles.length} 个 + 临时脚本 ${scratchFiles.length} 个`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const allow = (list) => new Set(list || []);

// 机读出口：供 check-ratchet-summary.mjs 汇总「棘轮总账」。
// 只报数、不判定、不改退出码语义 —— 汇总器不该复制一遍计数逻辑（那就是第二份真源）。
if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({
      ratchet: 'root-clean',
      label: '根目录沙盒',
      current: htmlFiles.length + scratchFiles.length,
      baseline: allow(baseline.html).size + allow(baseline.scratch).size,
      unit: '个',
    }),
  );
  process.exit(0);
}

const violations = [];
for (const n of htmlFiles) {
  if (!allow(baseline.html).has(n)) {
    violations.push({ name: n, kind: 'html' });
  }
}
for (const n of scratchFiles) {
  if (!allow(baseline.scratch).has(n)) {
    violations.push({ name: n, kind: 'scratch' });
  }
}

if (violations.length) {
  console.error(
    STAGED
      ? '❌ 本次提交往根目录新增了沙盒文件（AGENTS.md §6：「已有存量是历史债，不再增加」）：\n'
      : '❌ 根目录新增了沙盒文件（AGENTS.md §6：「已有存量是历史债，不再增加」）：\n',
  );
  for (const v of violations) {
    console.error(`   + ${v.name}${v.kind === 'scratch' ? '   （临时脚本）' : ''}`);
  }
  if (STAGED) {
    /* 全量模式会在这里报「现存基线 N 个」；暂存区模式下列表只有本次提交涉及的文件，
       算「现存总量」没有意义，改成点名判据，省得读者以为根目录只剩这么几个。 */
    console.error('\n（pre-commit 只检查**本次暂存**的根目录文件，不是整个根目录的现状）');
  } else {
    console.error(
      `\n现存基线：html ${htmlFiles.length - violations.filter((v) => v.kind === 'html').length} 个` +
        ` + 临时脚本 ${scratchFiles.length - violations.filter((v) => v.kind === 'scratch').length} 个。`,
    );
  }
  console.error('\n正确落点（二选一，别放根目录）：');
  console.error('   · 长期保留的原型/沙盒  →  docs/demos/');
  console.error('   · 一次性复现脚本       →  用完即删，或 scripts/probes/ 下带明确命名');
  console.error('\n若确认这是有意保留的新原型，走 `npm run check:root-clean:update` 并');
  console.error('在 commit message 里说明「为什么必须放根目录」—— 抬基线要交代理由。');
  if (STAGED) {
    console.error('\n若是**别人**放进暂存区的：让那个会话自己处理，不要替它 --update 抬基线。');
  }
  process.exit(1);
}

if (STAGED && htmlFiles.length + scratchFiles.length === 0) {
  console.log(
    `✅ 本次提交没有新增根目录沙盒（pre-commit 模式；全量现状请跑 npm run check:root-clean）`,
  );
  process.exit(0);
}

const saved =
  allow(baseline.html).size +
  allow(baseline.scratch).size -
  (htmlFiles.length + scratchFiles.length);
console.log(
  `${STAGED ? '✅ 本次提交的根目录沙盒未增长' : '✅ 根目录沙盒未增长'}：html ${htmlFiles.length}（基线 ${baseline.html.length}）+ ` +
    `临时脚本 ${scratchFiles.length}（基线 ${baseline.scratch.length}）` +
    (saved > 0 ? `（已削减 ${saved}，记得 --update 下调基线）` : ''),
);
