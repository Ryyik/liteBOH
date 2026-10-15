#!/usr/bin/env node
/**
 * clean-screenshots.mjs — debug-screenshots/ 的保留轮转
 *
 * 背景：`debug-screenshots/` 是探针与诊断脚本的截图落点，已 gitignore，
 * 但**只会涨** —— 2026-10-15 实测 757 个文件。它不影响 git、也不影响 AI 上下文，
 * 只吃磁盘，所以一直没人管。这个脚本给它一个保留窗口。
 *
 * 安全设计（默认什么都不删）：
 *   · **默认 dry-run**：只报告，不删。要真删必须显式 `--apply`。
 *   · `--keep-days=N`（默认 7）：按 **mtime** 保留最近 N 天。
 *   · `--max-delete=N`（默认 200）：单次删除上限。超了**直接拒绝执行**、不删半个 ——
 *     一个 bug 不该演成"把目录清空了"。要清更多就分批跑。
 *
 * 用法：
 *   node scripts/clean-screenshots.mjs                      # dry-run，看会删多少
 *   node scripts/clean-screenshots.mjs --apply              # 真删（保留 7 天）
 *   node scripts/clean-screenshots.mjs --keep-days=30 --apply
 *   node scripts/clean-screenshots.mjs --keep-days=1 --max-delete=400 --apply
 *
 * ⚠️ 若在受管沙箱里被拦（本环境的 safe-delete 会拦「一次删 >50 文件」），
 *    把 `--max-delete` 调到 50 以下分批跑，或直接在普通终端里执行本脚本。
 */
import { readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIR = join(ROOT, 'debug-screenshots');
const APPLY = process.argv.includes('--apply');

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : dflt;
};
const KEEP_DAYS = argOf('keep-days', 7);
const MAX_DELETE = argOf('max-delete', 200);

if (!existsSync(DIR)) {
  console.log('[clean:screenshots] 没有 debug-screenshots/ —— 无需处理。');
  process.exit(0);
}
if (!Number.isFinite(KEEP_DAYS) || KEEP_DAYS < 0) {
  console.error('❌ --keep-days 必须是非负数');
  process.exit(2);
}

const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;

// 只用 readdirSync 平铺：这个目录是平的（探针都写文件、不建子目录）。
// 真出现子目录时明确报出来，别静默漏掉或递归删 —— 递归删是不可逆的那一步。
const entries = readdirSync(DIR, { withFileTypes: true });
const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
const files = entries.filter((e) => e.isFile());

let totalBytes = 0;
const stale = [];
let newest = 0;
let oldest = Infinity;

for (const f of files) {
  const abs = join(DIR, f.name);
  const st = statSync(abs);
  totalBytes += st.size;
  newest = Math.max(newest, st.mtimeMs);
  oldest = Math.min(oldest, st.mtimeMs);
  if (st.mtimeMs < cutoff) stale.push({ name: f.name, size: st.size });
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
const day = (ms) => (ms === Infinity || ms === 0 ? '—' : new Date(ms).toISOString().slice(0, 10));

console.log(`[clean:screenshots] debug-screenshots/：${files.length} 个文件 / ${mb(totalBytes)}`);
console.log(`  时间跨度：${day(oldest)} → ${day(newest)}`);
console.log(`  保留窗口：${KEEP_DAYS} 天（cutoff ${new Date(cutoff).toISOString().slice(0, 10)}）`);
if (subdirs.length) {
  console.log(`  ⚠️ 发现 ${subdirs.length} 个子目录（本脚本不递归处理，请人工确认）：`);
  for (const d of subdirs.slice(0, 20)) console.log(`     ${d}/`);
}

const staleBytes = stale.reduce((a, s) => a + s.size, 0);
console.log(`\n  超出窗口：${stale.length} 个 / ${mb(staleBytes)}`);

if (!stale.length) {
  console.log('\n✅ 无需清理。');
  process.exit(0);
}
if (stale.length > MAX_DELETE) {
  console.error(
    `\n❌ 待删 ${stale.length} 个 > --max-delete ${MAX_DELETE} —— **拒绝执行**（一个 bug 不该演成清空目录）。`,
  );
  console.error(`   确认无误就显式放宽：--max-delete=${stale.length} --apply`);
  console.error('   或分批：先 --keep-days=1 清掉明显过期的，再逐步放宽窗口。');
  process.exit(1);
}

if (!APPLY) {
  console.log('\n（dry-run：没有删除任何文件。确认无误后加 --apply）');
  for (const s of stale.slice(0, 10)) console.log(`   ${s.name}  ${mb(s.size)}`);
  if (stale.length > 10) console.log(`   …另有 ${stale.length - 10} 个`);
  process.exit(0);
}

let removed = 0;
let removedBytes = 0;
const failed = [];
for (const s of stale) {
  try {
    rmSync(join(DIR, s.name), { force: true });
    removed += 1;
    removedBytes += s.size;
  } catch (err) {
    failed.push(`${s.name}: ${err.message}`);
  }
}

console.log(`\n✅ 已删除 ${removed} 个 / ${mb(removedBytes)}`);
if (failed.length) {
  console.error(`⚠️ ${failed.length} 个删除失败（沙箱拦批量删除？见文件头）：`);
  for (const f of failed.slice(0, 5)) console.error(`   ${f}`);
  process.exit(1);
}
console.log(
  `   剩余 ${readdirSync(DIR).length} 个文件。要直接跑的话：npm run clean:screenshots -- --keep-days=${KEEP_DAYS} --apply`,
);
