#!/usr/bin/env node
/**
 * check-layering.mjs — 分层棘轮：UI/视图层不得直连数据层出口
 *
 * ── 规则（2026-09-28 定稿，口径经实测收窄过两轮）──────────────────────
 * 禁止在 `src/views/**`、`src/components/**`、`src/composables/**` 里出现
 * **数据层出口**：
 *     supabase.from(...)              ← 直接暴露表名
 *     supabase.rpc(...)               ← 直接暴露 RPC 名
 *     supabase.functions.invoke(...)  ← 直接暴露 Edge Function 名
 * 这些调用必须收口到 `src/utils/**` 或 `src/stores/**`（前者是基础设施层，
 * 后者是状态层）。这样「表结构/RPC 改名」只改一处，而不是散在几十个组件里。
 *
 * ── 为什么不照抄报告那条「禁止 utils/api、stores 之外引入 supabase-client」──
 * 那条按字面实施会误判三类**完全合法**的写法（实测证据）：
 *   1. `supabase.auth.getUser()` / `getSession()` —— 全仓 56 处 auth 调用里
 *      31 处是会话内省，与表结构无关；收口只会造出一层没有收益的间接。
 *      （组件里这类调用的真问题是「该用 authStore」，那是另一条规则。）
 *   2. `supabase.channel()` / `removeChannel()` —— 组件生命周期绑定的订阅。
 *   3. **把 supabase 当参数传递的依赖注入**：`addExperience(supabase, ...)`、
 *      `deps.supabase`（`utils/xp.js`、`BOHAI/useKnowledgeRetrieval.js`）。
 *      那是比直连更好的写法，不该被判违规 —— 所以本脚本要求「文件自身 import 了
 *      supabase-client」才纳入管辖，DI 写法天然出局。
 *
 * ── 棘轮口径 ────────────────────────────────────────────────────────
 * 存量锁死在 `layering-baseline.json`，两条硬约束：
 *   ① **总量不得上升**（文件间搬移不判红，因为债务没增加）；
 *   ② **新文件不得违规** —— 这才是本规则的主要价值：新代码必须走 utils/api。
 *
 * 用法：
 *   node scripts/check-layering.mjs           校验（超出基线 / 新文件违规即 exit 1）
 *   node scripts/check-layering.mjs --update  以当前状态重写基线
 *   node scripts/check-layering.mjs --list    只列清单（审计用，不判定）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'scripts', 'layering-baseline.json');
const UPDATE = process.argv.includes('--update');
const LIST = process.argv.includes('--list');

/** 数据层出口：三类直接暴露「表名 / RPC 名 / EF 名」的调用 */
const DATA_EXIT =
  /\bsupabase\s*\.\s*(?:from|rpc)\s*\(|\bsupabase\s*\.\s*functions\s*\.\s*invoke\s*\(/g;
/** 只有自身导入了客户端才算「它在选择直连」；DI（supabase 作为参数）不纳入管辖 */
const IMPORTS_CLIENT = /from\s+['"][^'"]*supabase-client[^'"]*['"]/;
/** 受管辖的层：UI / 视图层 */
const UI_LAYER = /^src\/(?:views|components|composables)\//;

const listFiles = () =>
  execSync('git ls-files "src/**/*.js" "src/**/*.ts" "src/**/*.vue" "src/*.js" "src/*.ts"', {
    cwd: ROOT,
    encoding: 'utf-8',
  })
    .split('\n')
    .filter(Boolean);

const counts = {};
let total = 0;
for (const file of listFiles()) {
  if (!UI_LAYER.test(file)) continue;
  let source;
  try {
    source = readFileSync(join(ROOT, file), 'utf-8');
  } catch {
    continue;
  }
  if (!IMPORTS_CLIENT.test(source)) continue;
  const n = (source.match(DATA_EXIT) || []).length;
  if (!n) continue;
  counts[file] = n;
  total += n;
}

if (LIST) {
  console.log(
    `[check:layering] UI 层直连数据层出口：${total} 处 / ${Object.keys(counts).length} 文件`,
  );
  for (const [f, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${f}`);
  }
  process.exit(0);
}

if (UPDATE || !existsSync(BASELINE_FILE)) {
  const next = {
    total,
    updatedAt: new Date().toISOString().slice(0, 10),
    files: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1])),
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(
    `✅ 分层基线已${UPDATE ? '更新' : '建立'}：${total} 处 / ${Object.keys(counts).length} 个文件`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));

// 机读出口：供 check-ratchet-summary.mjs 汇总「棘轮总账」。只报数、不判定。
if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({
      ratchet: 'layering',
      label: 'UI 层直连数据层出口',
      current: total,
      baseline: baseline.total,
      unit: '处',
    }),
  );
  process.exit(0);
}

const newFiles = Object.entries(counts).filter(([f]) => !(f in baseline.files));
const totalUp = total > baseline.total;

if (newFiles.length || totalUp) {
  console.error('❌ UI/视图层出现了直连数据层出口（supabase.from / rpc / functions.invoke）：');
  if (newFiles.length) {
    console.error('   新增文件（基线里没有 —— 新代码必须走 utils/api 或 stores）：');
    for (const [f, n] of newFiles.sort((a, b) => b[1] - a[1])) {
      console.error(`     ${f}: ${n} 处`);
    }
  }
  if (totalUp) {
    console.error(`   总量上升：${baseline.total} → ${total}（+${total - baseline.total}）`);
    console.error('   本次增长的文件（若只是文件间搬移，总量不会上升）：');
    for (const [f, n] of Object.entries(counts)
      .filter(([f, n]) => n > (baseline.files[f] ?? 0))
      .sort((a, b) => b[1] - (baseline.files[b[0]] ?? 0) - (a[1] - (baseline.files[a[0]] ?? 0)))) {
      console.error(
        `     ${f in baseline.files ? '' : '[新文件] '}${f}: ${baseline.files[f] ?? 0} → ${n}`,
      );
    }
  }
  console.error('\n可选做法：');
  console.error(
    '  · 优先复用已有封装：src/utils/api/* 下多数表已有对应模块，直接 import 它的函数；',
  );
  console.error('  · 确实没有的，在 src/utils/api/ 下新增一个模块把这张表/RPC 收口；');
  console.error(
    '  · 会话内省（auth.getUser/getSession）请用 stores/auth 的 authStore，不要直连 supabase；',
  );
  console.error(
    '  · 确属有意为之：node scripts/check-layering.mjs --update 登记基线，并在 commit message 说明理由。',
  );
  process.exit(1);
}

const saved = baseline.total - total;
console.log(
  `✅ 分层棘轮通过：UI 层直连 ${total} / 基线 ${baseline.total}（${Object.keys(counts).length} 个文件）` +
    (saved > 0 ? `（已削减 ${saved}，记得 --update 下调基线）` : ''),
);
