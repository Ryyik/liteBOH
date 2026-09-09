#!/usr/bin/env node
/**
 * check-important-budget.mjs — !important 棘轮预算门禁
 *
 * 背景（2026-09-08 全站盘点）：src 下 !important 共 1917 处，其中
 *   - src/styles/themes/*.css（暗色机制层，~500 处）是刻意设计，白名单豁免；
 *   - 其余散落在 BOHAI styles、vendor 导航、组件 scoped 里，是历史债。
 * 存量由 important-budget.json 锁死（棘轮）：任何文件超出基线即失败；
 * 文件减少时应顺手下调基线，让预算单调递减。
 *
 * 用法：node scripts/check-important-budget.mjs [--update]
 *   --update  以当前数量重写基线（仅在有意削减后使用）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const BUDGET_FILE = join(ROOT, 'scripts', 'important-budget.json');
const UPDATE = process.argv.includes('--update');

// 白名单：暗色主题机制层（刻意用 !important 压过页面 scoped 样式）
const WHITELIST = [
  'src/styles/themes/',
];

const files = execSync(
  'git ls-files "src/*.vue" "src/*.css" "src/**/*.vue" "src/**/*.css"',
  { cwd: ROOT, encoding: 'utf-8' }
).split('\n').filter(Boolean);

const counts = {};
let total = 0;
for (const rel of files) {
  const norm = relative(ROOT, join(ROOT, rel)).replace(/\\/g, '/');
  if (WHITELIST.some((w) => norm.startsWith(w))) continue;
  const text = readFileSync(join(ROOT, rel), 'utf-8');
  const n = (text.match(/!important/g) || []).length;
  if (n > 0) {
    counts[norm] = n;
    total += n;
  }
}

if (UPDATE || !existsSync(BUDGET_FILE)) {
  writeFileSync(BUDGET_FILE, JSON.stringify({ total, files: counts }, null, 2) + '\n');
  console.log(`✅ 基线已${UPDATE ? '更新' : '建立'}：${total} 处 !important（${Object.keys(counts).length} 个文件）`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'));
const violations = [];
let budgetTotal = budget.total;

for (const [file, n] of Object.entries(counts)) {
  const base = budget.files[file] || 0;
  if (n > base) violations.push(`  ${file}: ${n} > 基线 ${base} (+${n - base})`);
  budgetTotal += Math.max(0, base - n); // 已削减的文件按现值放行
}

if (violations.length) {
  console.error(`❌ !important 超出棘轮基线（不得新增，见 plans/007 视觉焕新约定）：`);
  console.error(violations.join('\n'));
  console.error(`\n存量削减请编辑后运行 node scripts/check-important-budget.mjs --update 下调基线。`);
  process.exit(1);
}

const saved = budget.total - total;
console.log(`✅ !important 预算通过：当前 ${total} / 基线 ${budget.total}${saved > 0 ? `（已削减 ${saved}，记得 --update 下调基线）` : ''}`);
