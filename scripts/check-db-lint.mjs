#!/usr/bin/env node
/**
 * check-db-lint.mjs — 线上数据库**函数体** lint 门禁
 *
 * ## 为什么需要这道门禁
 *
 * 2026-10-04 首次跑 `supabase db lint --linked` 就抓到 **6 个 error** —— 全是
 * 「函数体引用了不存在的函数/列/表」这类**运行期必抛**的问题，而本仓
 * **200+ 探针 + 10 道门禁一个都没发现**（它们只看前端源码与构建产物，不看 DB 函数体）。
 *
 * 实例（见 docs/2026-10-04-线上DB函数lint与积分链路修复.md）：
 *   - `reserve_ai_points` 用了 `hashtextext()` —— PG 里只有 `hashtext()` ⇒ 42883，
 *     **AI 积分预扣链路从未成功过**（解释了「积分只发不收」）；
 *   - `execute_lottery_draw` 往 `lottery_notification_jobs` 插 `fulfillment_id`，
 *     而该列只存在于 `lottery_admin_audit_logs` ⇒ 42703，**抽奖开奖不可用**。
 *
 * 这两个都是「改一处漏一处」型的事故，靠人 review 抓不住，必须上机制。
 *
 * ## 用法
 *
 *   node scripts/check-db-lint.mjs                     # 跑 CLI（需已 link 项目）
 *   node scripts/check-db-lint.mjs --level warning     # 把 warning 也算失败（默认只算 error）
 *   node scripts/check-db-lint.mjs --report <path>     # 回放一份已保存的 JSON 报告（离线可跑）
 *
 * `--report` 也是**自证入口**：`scripts/check-gates-self-test.mjs` 用一份含已知 error 的
 * 合成报告注入，断言本脚本 exit 1（见 scripts/lib/gate-fixtures.mjs 的 `check:db-lint` 条目）。
 * 环境变量 `BOH_DB_LINT_REPORT` 与 `--report` 等价（fixture 用环境变量注入）。
 *
 * ## 凭据与降级
 *
 * 需要 **已 link 的项目**（`supabase/.temp/project-ref`）与可用的 `supabase` CLI。
 * 拿不到（未 link / 无网络 / 无 CLI）→ **告警 + exit 0**，不阻断本地开发与发布 ——
 * 与仓库既有 `security:anon-check`、`cloudflare-security-headers.mjs` 同策略。
 *
 * ⚠️ **刻意不接入 `verify` / `build:ci`**：CI 里没有链接的 Supabase 项目，
 * 接进去只会永远降级跳过，变成「假门禁」（与 `security:anon-check` 同判断）。
 * 它是**发布前的本地检查**。若要进 CI，需在 Secrets 里提供项目凭据。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const readFlag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? '' : String(argv[i + 1] || '');
};

const LEVEL = (readFlag('--level') || 'error').toLowerCase();
const REPORT_PATH = readFlag('--report') || String(process.env.BOH_DB_LINT_REPORT || '').trim();

const warn = (...a) => console.warn(...a);
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

/**
 * 从 CLI 输出里抠出 JSON 数组。
 * CLI 会打三行前言（Initialising/Connecting/Linting），**结尾还会附一段
 * 「A new version of Supabase CLI is available」提示** —— 所以不能用
 * `raw.slice(indexOf('['))` 直接 parse（会因尾随文本报
 * `Unexpected non-whitespace character after JSON`）。这里做括号配对提取，
 * 并跳过字符串内部与转义字符。
 */
const extractJsonArray = (raw) => {
  const start = raw.indexOf('[');
  if (start === -1) throw new Error('输出里找不到 JSON 数组');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  throw new Error('JSON 数组没有闭合');
};

/** 归一化成 { fn, level, message, sql? }[] */
const collect = (report, level) => {
  const want = level === 'warning' ? ['error', 'warning'] : ['error'];
  const out = [];
  for (const fn of Array.isArray(report) ? report : []) {
    for (const issue of fn?.issues || []) {
      const lv = String(issue.level || '');
      if (!want.some((w) => lv.startsWith(w))) continue;
      out.push({
        fn: fn.function || '(unknown)',
        level: lv,
        message: issue.message || '',
        sql: issue.query?.text ? String(issue.query.text).replace(/\s+/g, ' ').trim() : '',
        sqlState: issue.sqlState || '',
      });
    }
  }
  return out;
};

let report;
let source;

if (REPORT_PATH) {
  if (!existsSync(REPORT_PATH))
    fail(`[check:db-lint] ❌ --report 指定的文件不存在：${REPORT_PATH}`);
  report = extractJsonArray(readFileSync(REPORT_PATH, 'utf-8'));
  source = `报告回放 ${REPORT_PATH}`;
} else {
  const r = spawnSync(
    'supabase',
    [
      'db',
      'lint',
      '--linked',
      '--level',
      'warning',
      '--output-format',
      'json',
      '--fail-on',
      'none',
    ],
    { encoding: 'utf-8', timeout: 300_000 },
  );
  const raw = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error || !raw.includes('[')) {
    warn(
      '[check:db-lint] ⚠️ 跳过：拿不到 lint 结果（未 link 项目 / 无 supabase CLI / 网络不可达）。',
      '\n             想离线复跑请用：node scripts/check-db-lint.mjs --report <保存的 json>',
    );
    process.exit(0);
  }
  try {
    report = extractJsonArray(raw);
  } catch (e) {
    warn(`[check:db-lint] ⚠️ 跳过：输出不是可解析的 JSON（${e.message}）。`);
    process.exit(0);
  }
  source = 'supabase db lint --linked';
}

const issues = collect(report, LEVEL);
const scope = LEVEL === 'warning' ? 'error + warning' : 'error';

if (!issues.length) {
  const total = Array.isArray(report) ? report.length : 0;
  console.log(`[check:db-lint] ✅ 通过：${total} 个函数，无 ${scope} 级问题（来源：${source}）`);
  process.exit(0);
}

console.error(`[check:db-lint] ❌ 发现 ${issues.length} 个 ${scope} 级问题（来源：${source}）`);
console.error('');
for (const it of issues) {
  console.error(
    `  ${it.fn}  [${it.level}]  ${it.message}${it.sqlState ? `  (${it.sqlState})` : ''}`,
  );
  if (it.sql) console.error(`      SQL: ${it.sql.slice(0, 160)}`);
}
console.error('');
console.error('  这类问题**每次调用都会抛运行期异常**，前端探针与构建门禁都看不到它们。');
console.error(
  '  修法：写迁移 `supabase/migrations/YYYYMMDDNN_*.sql` 后 `supabase db push --linked --yes`，',
);
console.error('  并按仓库纪律做两条独立路径验证（直读 pg_get_functiondef + 事务内真跑一次）。');
console.error('  参考：docs/2026-10-04-线上DB函数lint与积分链路修复.md');
process.exit(1);
