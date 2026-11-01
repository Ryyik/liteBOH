#!/usr/bin/env node
/**
 * check-first-paint-budget.mjs — 首屏入口字节棘轮（必须在 vite build 之后运行）
 *
 * ── 为什么需要它 ─────────────────────────────────────────────────────
 * `check-bundle-size.sh` 只卡两件事：dist 总量 ≤30MB、单个 JS ≤800KB。这两道闸
 * 对**首屏**几乎没有约束力 —— 首屏多背 100KB，dist 总量只涨 0.3%，单文件也远
 * 不到 800KB，两道闸都是绿的。
 *
 * 2026-11-01 实测教训：首屏从 310KB 降到 242KB（-22%）是靠人工量出来的，
 * 中间还踩了一个静默坑 —— `manualChunks` 只拆走了 JS、CSS 仍留在首屏壳里，
 * 首屏 JS 体积看起来达标，实际白拆一半。这类回归**没有任何门禁会报**，
 * 加个依赖、改条 manualChunks 规则就能悄悄涨回去，几个月后才发现。
 *
 * ── 度量口径 ─────────────────────────────────────────────────────────
 * 「首屏」= index.html 直接引用的本地 JS + CSS：
 *   · `<script src>`            入口
 *   · `<link rel="stylesheet">` 壳样式
 *   · `<link rel="modulepreload">` 静态 import 链（浏览器会在首屏就并发拉）
 * 全部按 **gzip level 9** 计（≈ 线上实际传输字节），外部 URL（https://…）跳过。
 *
 * 按 gzip 而非 raw 计的理由：raw 体积和传输代价不线性（重复度高的 vendor
 * 压缩比高得多），按 raw 卡会奖励「把代码写得更啰嗦」这种无意义行为。
 *
 * ── 棘轮语义 ─────────────────────────────────────────────────────────
 * · 总量超出 `totalBytes + toleranceBytes` ⇒ 失败
 * · 单个入口超出自己的基线 ⇒ 失败（能直接指认是谁涨的）
 * · 总量下降 ⇒ 只提示 `--update` 下调基线，不失败（棘轮只许往下走）
 *
 * toleranceBytes 的存在理由：gzip 输出在不同 zlib 版本/CPU 上可能有微小差异。
 * 本地 Node 与 CI 的 Node 22 之间若有几十字节漂移，硬卡会让「本地绿、CI 红」
 * 这种最难查的假红出现。默认 2KB（≈0.8%）足以吸收漂移，又拦得住真实回归
 * （这次拆掉一个岛就是 -27KB，比容差大一个数量级）。
 *
 * 用法：
 *   node scripts/check-first-paint-budget.mjs            校验
 *   node scripts/check-first-paint-budget.mjs --update   以当前值重写基线
 *   node scripts/check-first-paint-budget.mjs --json     机读出口（供 check:ratchets）
 *   DIST_DIR=dist2 node scripts/check-first-paint-budget.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const DIST_ARG = process.env.DIST_DIR || 'dist';
// DIST_DIR 允许绝对路径（探针/对比构建常传 /tmp/xxx）：join(ROOT, '/abs') 会把
// 绝对路径当成相对段拼成 ROOT//abs —— 那样报出来的错是「缺少 index.html」，
// 看起来像没构建，实际是路径拼错了，极难定位。
const DIST = isAbsolute(DIST_ARG) ? DIST_ARG : join(ROOT, DIST_ARG);
const BASELINE_FILE = join(ROOT, 'scripts', 'first-paint-budget.json');
const UPDATE = process.argv.includes('--update');
const JSON_OUT = process.argv.includes('--json');

const INDEX = resolve(DIST, 'index.html');

/** 读基线（缺失时给 0，供 --json / 首次 --update 使用） */
const readBaseline = () =>
  existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) : { totalBytes: 0 };

if (!existsSync(INDEX)) {
  // --json 是给 check:ratchets 用的机读出口，而 check:ratchets 在 verify 主链里、
  // **不保证有 dist**（verify 不构建）。此时必须仍然吐出基线，否则总账那一行会显示
  // 「— / null」—— 看起来像基线丢了，实际只是没构建。判定语义不变：非 --json 时照样 exit 1。
  if (JSON_OUT) {
    console.log(
      JSON.stringify({
        ratchet: 'first-paint-budget',
        label: '首屏入口 gzip 合计',
        current: null,
        baseline: readBaseline().totalBytes,
        unit: 'B',
      }),
    );
    process.exit(0);
  }
  console.error(`[first-paint] 缺少 ${DIST}/index.html —— 本门禁必须在 vite build 之后运行。`);
  console.error(`              (build:ci 里它排在 vite build 之后；单独跑请先 npm run build)`);
  process.exit(1);
}

const html = readFileSync(INDEX, 'utf-8');

/**
 * 只认本地引用。index.html 里还有 preconnect / canonical / icon 等外部 URL，
 * 不排除掉会把 https://cdn.blockofhome.cn 这种当成入口文件去 stat，直接崩。
 * 同时排除 `//host/...` 这种协议相对 URL —— 它和 `/static/...` 只差一个斜杠。
 */
const isLocalAsset = (u) =>
  /\.(js|css)(\?|$)/.test(u) && !/^(https?:)?\/\//.test(u) && !/^data:/.test(u);

const refs = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const u = m[1];
  if (isLocalAsset(u)) refs.add(u);
}

if (refs.size === 0) {
  console.error(`[first-paint] 在 ${DIST}/index.html 里找不到任何本地 JS/CSS 引用。`);
  console.error(`             若是 base 配置改成绝对 CDN 路径导致，请同步修改本脚本的解析逻辑。`);
  process.exit(1);
}

/**
 * 归一化入口名：去掉内容指纹。
 * `static/js/supabase-vendor-D1BGFDA5.js` → `static/js/supabase-vendor.js`
 * 这样每次构建 hash 变化不会让基线全量失效，失败信息也能直接指认是哪个 chunk。
 * 指纹形如 `-A1b2C3d4`（8 位 base64url），只剥最后一段。
 */
const normalizeKey = (u) => u.replace(/^\.?\//, '').replace(/-[A-Za-z0-9_-]{8}(\.[a-z]+)$/, '$1');

const files = {};
let totalBytes = 0;
const missing = [];

for (const ref of refs) {
  const rel = ref.replace(/^\.?\//, '');
  const abs = resolve(DIST, rel);
  if (!existsSync(abs)) {
    missing.push(rel);
    continue;
  }
  const raw = readFileSync(abs);
  const gz = gzipSync(raw, { level: 9 }).length;
  const key = normalizeKey(ref);
  // 同一 key 理论上只会出现一次；真重复时按最大计，不累加（避免重复计数）
  files[key] = Math.max(files[key] || 0, gz);
  totalBytes += gz;
}

/**
 * 引用了但产物不存在 ⇒ 失败，不静默跳过。
 * 静默跳过会让「路径写错 / base 改了」表现为「体积变小了、门禁更绿了」——
 * 最坏的一种假绿。
 */
if (missing.length) {
  console.error(`[first-paint] FAIL: index.html 引用了不存在的产物：`);
  for (const m of missing) console.error(`  ${DIST}/${m}`);
  console.error(`\n  这通常意味着 base 配置、资源路径或构建产物结构变了。`);
  process.exit(1);
}

const kb = (n) => (n / 1024).toFixed(1);

// ── 机读出口 ────────────────────────────────────────────────────────
// 与 check-important-budget.mjs 同款：只报数、不判定，供 check-ratchet-summary 汇总。
if (JSON_OUT) {
  console.log(
    JSON.stringify({
      ratchet: 'first-paint-budget',
      label: '首屏入口 gzip 合计',
      current: totalBytes,
      baseline: readBaseline().totalBytes,
      unit: 'B',
    }),
  );
  process.exit(0);
}

const DEFAULT_TOLERANCE = 2048;

if (UPDATE || !existsSync(BASELINE_FILE)) {
  const payload = {
    _comment:
      '首屏入口 gzip 基线（index.html 直接引用的 JS+CSS）。只许下调；上调必须 --update 并在 commit message 说明理由。',
    totalBytes,
    toleranceBytes: DEFAULT_TOLERANCE,
    files,
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2) + '\n');
  console.log(
    `✅ 首屏基线已${UPDATE ? '更新' : '建立'}：${kb(totalBytes)} KB（${Object.keys(files).length} 个入口）`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const tolerance = Number.isFinite(baseline.toleranceBytes)
  ? baseline.toleranceBytes
  : DEFAULT_TOLERANCE;
const limit = baseline.totalBytes + tolerance;

const violations = [];

if (totalBytes > limit) {
  violations.push(
    `  首屏合计 ${kb(totalBytes)} KB > 上限 ${kb(limit)} KB` +
      `（基线 ${kb(baseline.totalBytes)} + 容差 ${kb(tolerance)}）` +
      `  超出 ${kb(totalBytes - baseline.totalBytes)} KB`,
  );
}

// 单文件回归：直接指认是谁涨的。新增入口不在此列 —— 它会体现在总量上，
// 且新入口首次出现时没有基线可比，硬报会误伤「拆得更细」这类好改动。
const grew = [];
for (const [key, bytes] of Object.entries(files)) {
  const base = baseline.files?.[key];
  if (base == null) continue;
  if (bytes > base + tolerance) {
    grew.push(`  ${key}: ${kb(bytes)} KB > 基线 ${kb(base)} KB (+${kb(bytes - base)} KB)`);
  }
}
if (grew.length) violations.push(...grew);

if (violations.length) {
  console.error(`❌ 首屏字节超出棘轮基线（首屏是最贵的字节，不得悄悄回涨）：`);
  console.error(violations.join('\n'));
  console.error(`\n  当前入口明细：`);
  for (const [key, bytes] of Object.entries(files).sort((a, b) => b[1] - a[1])) {
    console.error(`    ${String(kb(bytes)).padStart(7)} KB  ${key}`);
  }
  console.error(
    `\n  排查方向：新增依赖是否真需要进首屏 / 能否懒加载 / manualChunks 是否把它卷进了壳 chunk。`,
  );
  console.error(`  确认增长是必要代价后，用 --update 上调基线并在 commit message 写明理由。`);
  process.exit(1);
}

const saved = baseline.totalBytes - totalBytes;
console.log(
  `✅ 首屏预算通过：${kb(totalBytes)} / ${kb(baseline.totalBytes)} KB（容差 ${kb(tolerance)}，${Object.keys(files).length} 个入口）` +
    (saved > tolerance ? `（已削减 ${kb(saved)} KB，记得 --update 下调基线）` : ''),
);
