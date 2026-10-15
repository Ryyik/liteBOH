#!/usr/bin/env node
/**
 * env-doctor.mjs — AI 会话开工前的**一键环境自检**
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 本仓库记录在案的「环境级坑」有 10 条（npx 被 SIGTERM、vite 只绑 IPv6、
 * 后台服务被杀、safe-delete 拦批量删除、BSD grep 无 `\|`、GitHub HTTPS 被阻断、
 * Playwright 需直连代理、macOS 无 timeout、lint-staged 卷入无关文件、deno 装不了）。
 *
 * 问题**不是"没记"** —— 是记在 `docs/AI-ENV.md` 这种**按需通道**里，
 * 于是每一个新 AI 会话都要**重新踩一遍**才真正"读到"。规范放错通道 = 每条规则
 * 都要被重新踩一遍才生效。
 *
 * 本脚本把那 10 条变成"一条命令的绿灯"：**实测**（而不是按平台名推断）——
 *   `grep 'a\|b'` 真的跑一次看它匹不匹配，比读 process.platform 可信。
 *
 * ── 定位（重要）────────────────────────────────────────────────────
 * 这是**诊断**，不是门禁。它检查的是「这台机器/这次会话的工具链」，
 * 而工具的缺席是**环境事实**、不是代码缺陷 —— 所以：
 *   · 默认**永远 exit 0**（免得被顺手塞进 verify，变成一条永远红的假门禁）；
 *   · 要它当门禁用 `--strict`（有 ❌ 时 exit 1），由调用方显式声明意图。
 * 「诊断」与「门禁」不要混为一谈，是本仓库 grep 不出来的那类约定。
 *
 * 用法：
 *   node scripts/env-doctor.mjs            # 全量自检，永远 exit 0
 *   node scripts/env-doctor.mjs --strict   # 有 ❌ 则 exit 1（给 CI / 预检脚本用）
 *   node scripts/env-doctor.mjs --deep     # 额外做联网探测（GitHub :443 可达性等）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STRICT = process.argv.includes('--strict');
const DEEP = process.argv.includes('--deep');

// level 用**语义键**、不用 emoji 本身当键：
// 拿 emoji 当键会让 label[level] 取到 undefined、计数恒为 0 ——
// 表现为「满屏 undefined 却报环境全绿」，正是本仓库最忌讳的假绿。
const LEVEL = { ok: '✅', warn: '⚠️', fail: '❌', info: 'ℹ️' };
const OK = 'ok';
const WARN = 'warn';
const FAIL = 'fail';
const INFO = 'info';

const rows = [];
const section = (text) => rows.push({ kind: 'section', text });
const report = (level, name, detail, hint) =>
  rows.push({ kind: 'check', level, name, detail, hint });

/** 跑一条命令，永不抛错 —— 诊断脚本挂在自己身上最难查。 */
const sh = (cmd, args, opts = {}) => {
  try {
    return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 10_000, ...opts });
  } catch (err) {
    return { status: null, stdout: '', stderr: String(err), signal: null };
  }
};

/** stderr 里含 "illegal option"/"invalid option"/"unknown primary" 即「本平台不支持该 flag」 */
const unsupported = (r) =>
  /illegal option|invalid option|unknown primary|unrecognized option|usage:/i.test(r.stderr || '');

// ── 1. 版本锚 ─────────────────────────────────────────────────────────
section('1. 版本锚');

const nvmrc = existsSync(join(ROOT, '.nvmrc'))
  ? readFileSync(join(ROOT, '.nvmrc'), 'utf-8').trim()
  : null;
const nodeMajor = process.versions.node.split('.')[0];
if (!nvmrc) {
  report(WARN, 'node 版本锚', '缺少 .nvmrc', '建 .nvmrc（本机验证过 node 22）');
} else if (nvmrc.replace(/^v/, '').split('.')[0] === nodeMajor) {
  report(OK, 'node 版本锚', `v${process.versions.node}（.nvmrc=${nvmrc}）`);
} else {
  report(FAIL, 'node 版本锚', `当前 v${process.versions.node} ≠ .nvmrc ${nvmrc}`, 'nvm use');
}

let pkg = null;
try {
  pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
} catch (err) {
  report(FAIL, 'package.json', `解析失败：${err.message}`);
}
report(
  pkg?.engines?.node ? OK : WARN,
  'engines 字段',
  pkg?.engines?.node ? `node ${pkg.engines.node}` : '未声明',
  pkg?.engines?.node ? null : '在 package.json 加 engines.node，让 CI 与本机对齐',
);

const npmV = sh('npm', ['-v']).stdout?.trim();
report(npmV ? OK : WARN, 'npm', npmV || '取不到');

// ── 2. 工具链（本机） ──────────────────────────────────────────────────
section('2. 工具链（本机）');

// 本地二进制：本仓库硬规则是**永远不用 npx**，所以这里直接查 .bin 而非 PATH。
for (const bin of ['vite', 'vitest', 'eslint', 'vue-tsc', 'playwright', 'prettier']) {
  const p = join(ROOT, 'node_modules', '.bin', bin);
  report(
    existsSync(p) ? OK : FAIL,
    `node_modules/.bin/${bin}`,
    existsSync(p) ? '存在' : '缺失',
    existsSync(p) ? null : 'npm ci',
  );
}

// npx 被 SIGTERM 的**实测**：这是本仓库最常踩、最费时的一条。
// 不要读平台名推断 —— 直接跑一次，看它是正常返回还是被信号杀掉。
const npxProbe = sh('npx', ['--version'], { timeout: 5_000 });
if (npxProbe.error || npxProbe.signal === 'SIGTERM' || npxProbe.status === null) {
  report(
    FAIL,
    'npx 可用性',
    `被 ${npxProbe.signal || npxProbe.error?.code || 'unknown'} 终止`,
    '改用 ./node_modules/.bin/<tool>（本仓库既定做法）',
  );
} else {
  report(OK, 'npx 可用性', `返回 ${String(npxProbe.stdout || '').trim() || 'exit 0'}`);
}

const sb = sh('sh', ['-c', 'command -v supabase']);
const sbV = sb.status === 0 ? sh('supabase', ['--version']).stdout?.trim() : null;
report(
  sbV ? OK : WARN,
  'supabase CLI',
  sbV || '不在 PATH',
  sbV ? null : 'check:db-lint / check:db-advisors / migrations 用得到',
);

// Playwright 浏览器：装了 @playwright/test 不等于浏览器二进制就位，
// 探针会在 launch 那一刻才炸 —— 开工前查掉。
const pwCache = join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright');
if (existsSync(pwCache)) {
  const browsers = readdirSync(pwCache).filter((d) => !d.startsWith('.'));
  const hasChromium = browsers.some((d) => d.startsWith('chromium'));
  report(
    hasChromium ? OK : WARN,
    'Playwright 浏览器',
    hasChromium ? browsers.slice(0, 3).join(', ') : '未发现 chromium',
    hasChromium ? null : './node_modules/.bin/playwright install chromium',
  );
} else {
  report(process.platform === 'darwin' ? WARN : INFO, 'Playwright 浏览器缓存', '未发现缓存目录');
}

// ── 3. 网络与代理 ─────────────────────────────────────────────────────
section('3. 网络与代理');

const proxyKeys = [
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
];
const setProxies = proxyKeys.filter((k) => process.env[k]);
if (setProxies.length) {
  report(
    WARN,
    '代理环境变量',
    setProxies.join(', '),
    'Playwright 必须 --proxy-server=direct:// --proxy-bypass-list=*，否则与外层代理冲突',
  );
} else {
  report(OK, '代理环境变量', '未设置（探针无需额外 bypass）');
}
report(INFO, 'NO_PROXY', process.env.NO_PROXY || process.env.no_proxy || '（空）');

if (DEEP) {
  const nc = sh('nc', ['-z', '-G', '3', 'ssh.github.com', '443']);
  report(
    nc.status === 0 ? OK : FAIL,
    'GitHub over :443（--deep）',
    nc.status === 0 ? '可达' : '不可达',
    nc.status === 0 ? null : 'push 走 ssh.github.com:443（见 docs/AI-ENV.md）',
  );
} else {
  report(INFO, 'GitHub :443 探测', '已跳过（加 --deep 联网实测）');
}

// ── 4. 端口 ───────────────────────────────────────────────────────────
section('4. 端口');

for (const [port, what] of [
  ['5173', 'vite dev（探针 BASE 默认值）'],
  ['4174', 'vite preview'],
]) {
  const lsof = sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
  const lines = (lsof.stdout || '').split('\n').filter((l) => l && !l.startsWith('COMMAND'));
  report(
    lines.length ? INFO : OK,
    `:${port}`,
    lines.length ? `已被占用（${what}）` : `空闲（${what}）`,
  );
}

// ── 5. 平台能力（**实测**，不按平台名推断）────────────────────────────
section('5. 平台能力（实测）');

// BSD grep 没有 BRE 的 `\|`：`grep 'a\|b'` 会**静默 0 命中**，
// 让人误判「没有引用」。这是本仓库踩得最多的一条 grep 坑。
const grepProbe = sh('grep', ['a\\|b'], { input: 'a\n' });
if (grepProbe.status === 0) {
  report(OK, 'grep BRE 交替 (\\|)', '支持');
} else {
  report(
    WARN,
    'grep BRE 交替 (\\|)',
    '不支持 —— `grep "a\\|b"` 会静默 0 命中',
    '一律用 grep -E 或 Grep 工具（本仓库硬规则）',
  );
}

const timeoutProbe = sh('sh', ['-c', 'command -v timeout']);
report(
  timeoutProbe.status === 0 ? OK : WARN,
  'timeout 命令',
  timeoutProbe.status === 0 ? timeoutProbe.stdout.trim() : '不存在',
  timeoutProbe.status === 0 ? null : 'macOS 默认无 timeout，别在脚本里用它',
);

const findProbe = sh('find', ['.', '-maxdepth', '0', '-newermt', '2000-01-01']);
if (unsupported(findProbe)) {
  report(WARN, 'find -newermt', '不支持（BSD find）', '改用 git ls-files / -mtime');
} else {
  report(OK, 'find -newermt', '支持');
}

const dateProbe = sh('date', ['-d', '@0']);
report(
  unsupported(dateProbe) || dateProbe.status !== 0 ? WARN : OK,
  'date -d',
  dateProbe.status === 0 ? '支持' : '不支持（BSD date）',
  dateProbe.status === 0 ? null : '要取时间戳用 date -v / 或直接交给 shell 算',
);

// ── 6. 工作区状态 ─────────────────────────────────────────────────────
section('6. 工作区状态');

const head = sh('git', ['log', '--oneline', '-1']).stdout?.trim();
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout?.trim();
report(head ? OK : WARN, 'git HEAD', `${branch || '?'} · ${head || '取不到'}`);

const dirty = sh('git', ['status', '--porcelain']).stdout?.split('\n').filter(Boolean) || [];
if (dirty.length > 12) {
  report(
    WARN,
    '未提交改动',
    `${dirty.length} 项`,
    '工作区很脏：并行会话会同工作区 last-write-wins；提交**只给明确路径**，永不 git add -A',
  );
} else {
  report(OK, '未提交改动', `${dirty.length} 项`);
}

// pre-commit 是**仓库自带**的（非 husky）。新克隆 / 新机器上它不会自动存在。
const hookSrc = join(ROOT, 'scripts', 'git-hooks', 'pre-commit');
const hookDst = join(ROOT, '.git', 'hooks', 'pre-commit');
if (!existsSync(hookDst)) {
  report(
    FAIL,
    'pre-commit 钩子',
    '未安装',
    'cp scripts/git-hooks/pre-commit .git/hooks/ && chmod +x .git/hooks/pre-commit',
  );
} else if (
  existsSync(hookSrc) &&
  readFileSync(hookDst, 'utf-8') !== readFileSync(hookSrc, 'utf-8')
) {
  report(WARN, 'pre-commit 钩子', '与 scripts/git-hooks/pre-commit 不一致', '重新 cp 覆盖');
} else {
  report(OK, 'pre-commit 钩子', '已安装且与仓库版本一致');
}

for (const stub of ['post-commit', 'post-checkout']) {
  const p = join(ROOT, '.git', 'hooks', stub);
  if (existsSync(p) && statSync(p).size <= 12) {
    report(
      INFO,
      `${stub} 钩子`,
      `${statSync(p).size} 字节空 stub`,
      '删掉或写实（见 docs/2026-10-15-AI-环境审计.md 建议 A-5）',
    );
  }
}

// dist 残留 → 下一次 vite build 会撞上 safe-delete 拦「>50 文件删除」。开工前化解掉。
for (const d of ['dist', 'dist-check']) {
  if (!existsSync(join(ROOT, d))) {
    report(OK, d, '不存在（构建不受阻）');
    continue;
  }
  let size = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else size += statSync(p).size;
    }
  };
  try {
    walk(join(ROOT, d));
  } catch (err) {
    report(WARN, d, `统计失败：${err.message}`);
    continue;
  }
  report(
    WARN,
    d,
    `存在（${(size / 1024 / 1024).toFixed(1)}MB）`,
    '跑 build / build:ci 前先 mv 到 /tmp，否则 prepareOutDir 报 SAFE_DELETE_BULK_CONFIRM_REQUIRED',
  );
}

report(
  existsSync(join(ROOT, '.env')) ? OK : FAIL,
  '.env',
  existsSync(join(ROOT, '.env')) ? '存在' : '缺失（本地开发/探针注入需要）',
);

if (existsSync(join(ROOT, 'debug-screenshots'))) {
  const n = readdirSync(join(ROOT, 'debug-screenshots')).length;
  report(
    n > 500 ? WARN : OK,
    'debug-screenshots',
    `${n} 个文件`,
    n > 500 ? 'npm run clean:screenshots --keep-days=7 轮转（已 gitignore，但只会涨）' : null,
  );
}

// ── 输出 ──────────────────────────────────────────────────────────────
// 宽度按**显示宽度**算：emoji 与中文都是 2 列，用 String.length 会参差不齐。
const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.codePointAt(0) > 255 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};

console.log('[env:doctor] 环境自检（诊断档：默认永远 exit 0；加 --strict 才当门禁用）\n');
for (const r of rows) {
  if (r.kind === 'section') {
    console.log(`\n${r.text}`);
    continue;
  }
  console.log(`  ${LEVEL[r.level]} ${pad(r.name, 30)} ${r.detail}`);
  if (r.hint) console.log(`     ${' '.repeat(30)} ↳ ${r.hint}`);
}

const checks = rows.filter((r) => r.kind === 'check');
const count = (lv) => checks.filter((r) => r.level === lv).length;
console.log(
  `\n[env:doctor] ${checks.length} 项：✅ ${count(OK)} · ⚠️ ${count(WARN)} · ❌ ${count(FAIL)}`,
);
if (count(FAIL) === 0 && count(WARN) === 0) {
  console.log('环境全绿 —— 可以直接开工。');
} else if (count(FAIL) === 0) {
  console.log('无阻断项；⚠️ 是「本机如此」的事实，读一眼再开工。');
} else {
  console.log('有 ❌ 阻断项，先按 ↳ 提示修掉（详见 docs/AI-ENV.md）。');
}
if (!STRICT && count(FAIL) > 0) {
  console.log('（诊断档：以 exit 0 结束。要让它阻断请加 --strict）');
}
process.exit(STRICT && count(FAIL) > 0 ? 1 : 0);
