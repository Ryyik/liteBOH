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
 *   node scripts/check-npm-audit.mjs --advisory   # 同上判定，但只告警不阻断（exit 0）
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
 *
 * ## 为什么分成「严格档 / 告警档」（2026-10-27 加）
 *
 * 这道门禁的判据不是本仓代码，而是 **npm 公告库**：同一份 lock，昨天绿、今天红。
 * 2026-10-27 实证 —— 三条新公告（fast-uri / esbuild / serialize-javascript）同时发布，
 * 把一次与依赖毫无关系的推送卡红，`main` 一直红到有人手动升包为止。
 *
 * 这类失败有两个特征，决定了不能一律阻断：
 *   1. **与推送内容无关**：改一行 CSS 也会红，作者无从下手，久了就学会无视（比没门禁更糟）；
 *   2. **必然周期性复发**：本仓 800+ 个包，任何一天都可能有新公告。
 *
 * 所以分两档（决策在 ci.yml，不在本脚本）：
 *   · **严格档**：本次推送动了 `package.json` / `package-lock.json` ⇒ 谁动依赖谁清账，必须红；
 *   · **告警档**：没动依赖 ⇒ `--advisory`，只在 Actions 里打 annotation + step summary，不阻断；
 *     新公告由**每日定时审计**（`.github/workflows/audit-scheduled.yml`）兜底并开 issue。
 *
 * 净效果：**「新增漏洞」这件事仍然一定会被发现，但不再阻塞无关工作**。
 *
 * ## 2026-10-17 清账（P1-7）：high 3 → 0，基线同时下调
 *
 * - **`image-size`（high，经 pptxgenjs）已修**：`package.json` 加
 *   `overrides.image-size = ^2.0.4`（上游 pptxgenjs 4.0.1 仍锁 `^1.2.1`，官方修复只有
 *   「降级到 4.0.0」，而 4.0.0 也用 image-size 1.x —— npm 那个 fix 只是把 **pptxgenjs
 *   这条**移出漏洞区间，真正的 `image-size` 还在）。
 *   安全性论证：pptxgenjs 的 `browser` 字段把 `image-size` 映射成 `false`，它的三个
 *   dist 产物（cjs/es/bundle）里**都没有 image-size 的解析器代码**（grep `icns`/`heif` = 0），
 *   构建产物同样查不到 ⇒ 该 DoS 面在我们的浏览器侧**不可达**，override 只影响 Node 侧
 *   （本仓无 Node 侧用法）。改完 `node scripts/.../ppt-smoke`（带图片生成 pptx）实测
 *   产物字节一致（45526B，PK 头正常）。
 * - **`brace-expansion`（high，dev-only，eslint→minimatch@3）已修**：`npm update brace-expansion`
 *   → 1.1.15 → 1.1.21（在 minimatch@3 的 `^1.1.7` 内，无 override）。
 * - **`sprintf-js`（moderate ×5）不可修**：GitHub 公告 `GHSA-hp3w-g68c-fv3c` 的
 *   `vulnerable_version_range = "<= 1.1.3"`、`first_patched_version = null`
 *   —— 上游没有修复版。唯一「修法」是把 tfjs 降到 2.1.0（脱离 argparse），荒谬。
 *   可达性：格式串来自 argparse 内部（非用户输入），触发的是 `sprintf('%<巨大精度>d')`
 *   这类 DoS ⇒ **接受**，基线保留 5。
 * - **`esbuild`（low）接受**：`0.27.3–0.28.0` 的「Windows 上 dev server 任意文件读」，
 *   仅 Windows + 仅开发服务器；修复版 0.28.1 超出 vite 7 的 `^0.27.0`，为它升 vite
 *   不值。基线保留 1。
 * ## 2026-10-28 登记：workbox 链 4 个 low（不可修 + 构建期不可达，基线 0 → 4）
 *
 * 这批是**每日定时审计首次跑就抓到**的，正是那条兜底链存在的意义（ci.yml 的告警档不会红）。
 * 依赖链（`package-lock.json` 实测，四层全是 `dev: true`）：
 *
 *     vite-plugin-pwa@1.3.0 → workbox-build@7.4.1
 *       → @rollup/plugin-node-resolve@16.0.3 → deepmerge@4.3.1
 *
 * 根因公告 `GHSA-gcqx-w48m-w2h4`（deepmerge 的 `mergeObject()` 允许对返回对象做原型污染），
 * 区间 `>=4.2.0 <=4.3.1`、**`fixAvailable: null`** —— 4.3.1 已是该包当前最高版，
 * 上游没有修复版，`npm audit fix`（非 force）动不了；`--force` 才能升，
 * 那是把 vite-plugin-pwa 连锅端的破坏性升级。
 *
 * 可达性（实证，不是推断）：`grep -rl deepmerge dist/static/js/` **零命中** ⇒ 不进运行时产物；
 * 它只在 workbox-build **构建期**生成 service worker 时被调用，输入是本仓 `vite.config.*`
 * 里写死的配置对象，**不经用户输入**。⇒ 浏览器侧攻击面为零。
 * 等 vite-plugin-pwa 把 workbox 升到带修复的版本后，`npm run security:audit:update` 下调基线。
 *
 * ## 2026-10-28 同日修掉的假绿（比上面那 4 个 low 严重得多）
 *
 * 同日排查时本地跑出「0 漏洞 ✅ 通过」，与 CI 的 4 个 low 冲突。真因是
 * `npm audit` 的 quick 端点退役、返回 400，而错误响应也是合法 JSON ⇒ 旧代码
 * `raw.includes('{')` 就当成报告 ⇒ 从缺字段里读出全 0 ⇒ 打印「通过」。
 * 详见 `isValidReport` 的注释。**门禁最危险的形态不是红，是绿得没有依据。**
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideScope, SCOPE_ADVISORY } from './lib/audit-scope.mjs';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'scripts', 'npm-audit-baseline.json');

const argv = process.argv.slice(2);
const readFlag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? '' : String(argv[i + 1] || '');
};
const UPDATE = argv.includes('--update');
// 告警档：判定逻辑完全相同，只是「有新增」时不阻断（见文件头「严格档 / 告警档」）。
const ADVISORY_FLAG = argv.includes('--advisory');
// CI 档：由「本次推送有没有动依赖清单」自己决定严格还是告警（判定在 lib/audit-scope.mjs）。
const CI_SCOPE = argv.includes('--ci-scope');

/** GitHub compare 的 files 上限；达到即视为截断。 */
const CI_MAX_FILES = 300;

const LEVELS = ['critical', 'high', 'moderate', 'low'];
const warn = (...a) => console.warn(...a);

/** 读 CI 环境（compare API 服务端比对，不需要本地 git 历史 —— 本仓 .git 有 480MB，不能全量 fetch）。 */
const resolveCiScope = () => {
  const base = String(process.env.BASE_SHA || '').trim();
  const head = String(process.env.GITHUB_SHA || '').trim();
  const repo = String(process.env.GITHUB_REPOSITORY || '').trim();
  const ZERO = '0'.repeat(40);
  if (!base || base === ZERO || !head || !repo) {
    warn(
      '[security:audit] ⚠️ --ci-scope：拿不到 BASE_SHA / GITHUB_SHA / GITHUB_REPOSITORY ⇒ 告警档（由每日定时审计兜底）。',
    );
    return SCOPE_ADVISORY;
  }
  try {
    const raw = execFileSync('gh', ['api', `repos/${repo}/compare/${base}...${head}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = (JSON.parse(raw).files || []).map((f) => f.filename);
    const truncated = files.length >= CI_MAX_FILES;
    const scope = decideScope(files, { truncated });
    console.log(
      `[security:audit] 变更域：${files.length} 个文件${truncated ? '（列表已截断，按严格处理）' : ''}` +
        ` ⇒ ${scope === SCOPE_ADVISORY ? '告警档（未改动依赖清单）' : '严格档（改动了依赖清单）'}`,
    );
    return scope;
  } catch {
    warn(
      '[security:audit] ⚠️ --ci-scope：gh compare 不可用（无网络 / 权限）⇒ 告警档（由每日定时审计兜底）。',
    );
    return SCOPE_ADVISORY;
  }
};

const ADVISORY = CI_SCOPE ? resolveCiScope() === SCOPE_ADVISORY : ADVISORY_FLAG;
const REPORT_PATH =
  readFlag('--from-json') || String(process.env.BOH_NPM_AUDIT_REPORT || '').trim();

/**
 * 报告合法性判据 —— 单一真源。
 *
 * 2026-10-28 实证（**假绿事故**）：npm 的 `/security/audits/quick` 端点退役后返回 **400**，
 * stdout 仍是一份**合法 JSON**（`{ "message": "400 Bad Request - POST .../audits/quick ..." }`）。
 * 旧代码只判 `raw.includes('{')` 就当成报告 ⇒ `countByLevel` 从缺字段里读出一堆 0
 * ⇒ 打印「✅ 通过：依赖漏洞未新增」。
 *
 * 表现是最坏的一种：**本地静默假绿、CI 判红**（CI 的 npm 走可用端点，真实结果是 4 个 low）。
 * 我按本地结果判断「0 漏洞」，跑去查网络、查公告，全查错了方向 ——
 * 判据必须是「有 `metadata.vulnerabilities` 对象」，不是「输出里有花括号」。
 */
const isValidReport = (r) =>
  Boolean(
    r &&
    typeof r === 'object' &&
    r.metadata &&
    typeof r.metadata.vulnerabilities === 'object' &&
    r.metadata.vulnerabilities !== null,
  );

/** 把「拿不到报告」翻译成人能看懂的原因 —— 否则下一次还得从零 recon。 */
const describeBadReport = (raw) => {
  const s = String(raw || '');
  if (/security\/audits\/quick/.test(s) && /400|retired|Bad Request/i.test(s)) {
    return 'npm 的 audit quick 端点已退役（服务端返回 400）⇒ 需要 npm 11+（它走 bulk advisory 端点）';
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|audit endpoint returned an error/i.test(s)) {
    return 'registry 不可达（无网络 / 代理 / 限流）';
  }
  if (!s.trim()) return 'npm audit 没有任何输出';
  return 'npm audit 的输出不是合法审计报告';
};

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
let badRaw = '';
if (REPORT_PATH) {
  if (!existsSync(REPORT_PATH)) {
    warn(`[security:audit] ❌ --from-json 指定的文件不存在：${REPORT_PATH}`);
    process.exit(1);
  }
  report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
  source = `报告回放 ${REPORT_PATH}`;
  // 回放入口是自证通道（check:gates-self-test 靠它注入已知漏洞），不接受「读不懂的报告」，
  // 否则一次格式漂移就能让自检在「0 漏洞」上静默通过。
  if (!isValidReport(report)) {
    warn(`[security:audit] ❌ --from-json 的报告缺少 metadata.vulnerabilities：${REPORT_PATH}`);
    process.exit(1);
  }
} else {
  // `npm audit` 有漏洞时退出码非 0，所以要读 stdout 而不是靠退出码。
  // 注意：失败路径同样会往 stdout 写 JSON，必须过 isValidReport 才算数（见该函数注释）。
  let raw = '';
  try {
    raw = execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    raw = String(e.stdout || '');
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (isValidReport(parsed)) {
    report = parsed;
    source = 'npm audit --json';
  } else {
    badRaw = raw;
  }
}

const IS_CI = process.env.GITHUB_ACTIONS === 'true';

if (!report) {
  const why = describeBadReport(badRaw);
  warn(`[security:audit] ❌ 审计没能执行：${why}`);
  if (badRaw.trim()) {
    warn(`  原始输出（前 3 行）：${badRaw.trim().split('\n').slice(0, 3).join(' / ')}`);
  }
  if (IS_CI && !ADVISORY) {
    // 严格档宁可红也不能静默通过：这道门禁是「每日兜底」，静默放行等于它不存在。
    warn('[security:audit] ❌ 严格档判红（审计没能执行 ≠ 0 漏洞）。');
    process.exit(1);
  }
  warn('[security:audit] ⚠️ 告警档 / 本地不阻断，但**这次什么都没验成** —— 不是「通过」。');
  process.exit(0);
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

const FIX_HINTS = [
  '  先试 `npm audit fix`（非 force）；修完跑 `npm run security:audit:update` 下调基线。',
  '  ⚠️ `npm audit fix --force` 是破坏性升级，必须单独一次提交并跑全量 verify。',
];

// 告警档：不阻断，但必须在 Actions 里留下可见痕迹（annotation + step summary），
// 否则「静默变黄」和「静默变绿」是同一种病 —— 本仓在 check:dark-tokens 上吃过这个亏。
if (ADVISORY) {
  for (const line of FIX_HINTS) console.error(line);
  const oneLine = regressions.map((r) => `${r.level} ${r.base}→${r.now}`).join('；');
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error(
      `::warning title=Dependency audit（告警档，未阻断）::依赖漏洞新增：${oneLine}。详情见本步骤 Summary。`,
    );
  }
  const summaryPath = String(process.env.GITHUB_STEP_SUMMARY || '').trim();
  if (summaryPath) {
    const rows = regressions
      .map((r) => `| ${r.level} | ${r.base} | ${r.now} | ❌ 新增 |`)
      .join('\n');
    appendFileSync(
      summaryPath,
      [
        '',
        '### ⚠️ 依赖漏洞棘轮：告警档（本次未改动依赖清单，故不阻断）',
        '',
        '| 级别 | 基线 | 当前 | 判定 |',
        '|---|---|---|---|',
        rows,
        '',
        '这类新增通常来自 npm 新发布的公告，与本次改动无关。',
        '跟踪与清账由每日定时审计（`.github/workflows/audit-scheduled.yml`）负责：',
        '它跑严格档，判红会自动开 issue。空档期跑 `npm audit fix` 升包后再 `security:audit:update` 下调基线。',
        '',
      ].join('\n'),
    );
  }
  console.warn('\n[security:audit] ⚠️ 告警档：本次未改动依赖清单，不做阻断。');
  process.exit(0);
}

for (const line of FIX_HINTS) console.error(line);
process.exit(1);
