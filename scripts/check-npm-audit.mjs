#!/usr/bin/env node
/**
 * check-npm-audit.mjs — 依赖漏洞**棘轮**门禁
 *
 * ## 为什么是棘轮，不是 `--audit-level=high`
 *
 * 2026-10-04 实测：本仓 `npm audit` 有 **15 个漏洞**（1 low / 4 moderate / **10 high** / 0 critical），
 * 其中 2 个是直接依赖（`dompurify` XSS、`pptxgenjs` 经 `image-size` 的 DoS）。
 * 跑 `npm audit fix`（非 force）后降到 **6 个**（1 low / 2 moderate / 3 high）。
 *
 * 剩下的 6 个需要 `--force`（破坏性升级），短期修不掉。所以：
 *   - 直接拿 `--audit-level=high` 当门禁 ⇒ **永远红** ⇒ 人会开始无视它（比没有门禁更糟）；
 *   - 沿用本仓 `check-important-budget` / `check:dark-tokens` 的套路 ⇒ **存量锁死、只许降不许升**。
 *
 * ## 用法
 *
 *   node scripts/check-npm-audit.mjs              # 对比基线，任一档位数量上升即 exit 1
 *   node scripts/check-npm-audit.mjs --update     # 以当前状态重写基线（降完依赖后用）
 *   node scripts/check-npm-audit.mjs --from-json <path>   # 回放一份已保存的 npm audit --json 报告
 *
 * `--from-json` 也是**自证入口**：`scripts/check-gates-self-test.mjs` 用一份含已知漏洞的
 * 合成报告注入，断言本脚本 exit 1（见 scripts/lib/gate-fixtures.mjs 的 `security:audit` 条目）。
 * 环境变量 `BOH_NPM_AUDIT_REPORT` 与 `--from-json` 等价。
 *
 * ## 与 CI 的关系
 *
 * 已接入 `.github/workflows/ci.yml` 的 `quality` job（**CI 有网络**，能跑真 audit）。
 * 本地跑需要网络；拿不到结果时**告警 + exit 0**（不阻断本地开发）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'scripts', 'npm-audit-baseline.json');

const argv = process.argv.slice(2);
const readFlag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? '' : String(argv[i + 1] || '');
};
const UPDATE = argv.includes('--update');
const REPORT_PATH =
  readFlag('--from-json') || String(process.env.BOH_NPM_AUDIT_REPORT || '').trim();

const LEVELS = ['critical', 'high', 'moderate', 'low'];
const warn = (...a) => console.warn(...a);

const countByLevel = (report) => {
  const v = report?.metadata?.vulnerabilities || {};
  const out = {};
  for (const l of LEVELS) out[l] = Number(v[l] || 0);
  return out;
};

/** 取「直接依赖」上的漏洞清单 —— 升级它们最可能真解决问题。 */
const directAdvisories = (report) =>
  Object.values(report?.vulnerabilities || {})
    .filter((x) => x.isDirect)
    .map((x) => `${x.name}(${x.severity})`);

let report;
let source;
if (REPORT_PATH) {
  if (!existsSync(REPORT_PATH)) {
    warn(`[security:audit] ❌ --from-json 指定的文件不存在：${REPORT_PATH}`);
    process.exit(1);
  }
  report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
  source = `报告回放 ${REPORT_PATH}`;
} else {
  try {
    // `npm audit` 有漏洞时退出码非 0，所以要读 stdout 而不是靠退出码
    const raw = execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    report = JSON.parse(raw);
    source = 'npm audit --json';
  } catch (e) {
    const raw = String(e.stdout || '');
    if (raw.includes('{')) {
      report = JSON.parse(raw);
      source = 'npm audit --json';
    } else {
      warn('[security:audit] ⚠️ 跳过：拿不到 npm audit 结果（无网络 / registry 不可达）。');
      process.exit(0);
    }
  }
}

const current = countByLevel(report);

if (UPDATE || !existsSync(BASELINE_FILE)) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), ...current }, null, 2)}\n`,
  );
  if (UPDATE) {
    console.log(
      `[security:audit] ✅ 基线已更新：${LEVELS.map((l) => `${l} ${current[l]}`).join(' / ')}`,
    );
    process.exit(0);
  }
  console.log(
    `[security:audit] ⚠️ 首次运行：已写出基线（${LEVELS.map((l) => `${l} ${current[l]}`).join(' / ')}）。`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const regressions = [];
const improvements = [];

for (const level of LEVELS) {
  const base = Number(baseline[level] || 0);
  const now = current[level];
  if (now > base) regressions.push({ level, base, now });
  else if (now < base) improvements.push({ level, base, now });
}

console.log(`  来源：${source}`);
for (const level of LEVELS) {
  const base = Number(baseline[level] || 0);
  const now = current[level];
  const mark = now > base ? '❌ 新增' : now < base ? '✅ 已削减' : '持平';
  console.log(
    `  ${level.padEnd(9)} 当前 ${String(now).padStart(3)} / 基线 ${String(base).padStart(3)}  ${mark}`,
  );
}

const directs = directAdvisories(report);
if (directs.length) console.log(`  直接依赖上的漏洞：${directs.join(', ')}`);

if (!regressions.length) {
  console.log('\n[security:audit] ✅ 通过：依赖漏洞未新增。');
  if (improvements.length) console.log('（有削减项，记得 --update 下调基线）');
  process.exit(0);
}

console.error(`\n[security:audit] ❌ 依赖漏洞新增：`);
for (const r of regressions) console.error(`      ${r.level}: ${r.base} → ${r.now}`);
console.error(
  '\n  先试 `npm audit fix`（非 force）；修完跑 `npm run security:audit:update` 下调基线。',
);
console.error('  ⚠️ `npm audit fix --force` 是破坏性升级，必须单独一次提交并跑全量 verify。');
process.exit(1);
