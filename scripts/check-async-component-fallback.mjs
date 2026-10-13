/**
 * check-async-component-fallback.mjs —— 异步组件的「失败兜底」棘轮
 *
 * ── 为什么要有这道门禁（2026-10-13）──────────────────────────────────
 * `defineAsyncComponent(() => import(...))` 的**简写形式**没有任何失败出口：
 * chunk 拉不到时组件既不渲染、也不报错，用户看到的是一片空白 / 半截页面，
 * 和「CSS 加载失败导致样式错乱」是同一族问题（静默降级、无提示、无重试、无上报）。
 *
 * 仓库里已有正确范式，但只是约定、没有牙：
 *   · `AsyncForum` / `AsyncCommunity`（async-loaders.js）= 对象式 + onError 退避重试
 *   · `PostDetailMain`（PostDetailModal.vue）        = 对象式 + errorComponent
 *   · `AsyncBOHAI`                                   = 对象式 + loadingComponent + errorComponent
 *
 * 摸底（2026-10-13）：全仓 25 处裸简写 / 4 处带兜底。一次迁移 25 处不现实，
 * 所以按仓库既有纪律做成**台账棘轮**：存量只许降，新增一处当场红。
 *
 * ── 判据 ─────────────────────────────────────────────────────────────
 * 扫 `src/**` 里每个 `defineAsyncComponent(<参数>)`，看参数里有没有
 * `onError` 或 `errorComponent`。没写还要按**文件维度计数**与台账比：
 *   · 任何文件当前数 > 台账数（或文件不在台账里）⇒ 失败（新增了裸写法）
 *   · 总数下降 ⇒ 只提示跑 `--update` 下调台账（下调永远是好方向，不需要交代理由）
 * 用「文件计数」而不是「文件名+序号」当 key：前者对 prettier 重排 / 语句移动
 * **免疫**，不会因为格式化就假红（本仓源码被 prettier 重排过多次）。
 *
 * 用法：
 *   node scripts/check-async-component-fallback.mjs           # 门禁
 *   node scripts/check-async-component-fallback.mjs --update   # 下调台账
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
/* ⚠️ 剥注释用仓库的**规范实现**（tests/helpers/source.js），不再抄第 4 份：
   check-important-budget.mjs / check-project-structure.mjs 各带一份自己的副本，
   那是存量债（已记在待办里），不因为新门禁再翻一倍。
   两段式的理由见该文件头：.vue 必须先 scriptSection 再 stripComments —— 模板里的
   `accept="image/*"` 会和远处的闭注释符配对，一次吃掉几万字节真实代码。 */
import { scriptSection, stripComments } from '../tests/helpers/source.js';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const BASELINE_PATH = join(ROOT, 'scripts/async-component-baseline.json');
const SCOPED_EXT = /\.(?:js|ts|vue)$/;

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCOPED_EXT.test(entry)) out.push(full);
  }
  return out;
};

/** 取出 `defineAsyncComponent(` 的完整参数文本（按括号配平，不看引号里的括号也能用） */
const extractArgs = (source, openParenIdx) => {
  let depth = 1;
  let i = openParenIdx + 1;
  for (; i < source.length && depth > 0; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') depth -= 1;
  }
  return source.slice(openParenIdx + 1, i - 1);
};

const hasFallback = (args) => /\bonError\b/.test(args) || /\berrorComponent\b/.test(args);

const collect = () => {
  const perFile = {};
  const samples = [];
  for (const file of walk(SRC)) {
    // 只在「脚本区 + 无注释」的文本上扫：注释里合法地复述 `defineAsyncComponent(loader)`
    // （async-loaders.js 的说明就是这么写的），不剥会把它当成一处永久违规。
    const source = stripComments(scriptSection(readFileSync(file, 'utf8')));
    const rel = relative(ROOT, file).split('\\').join('/');
    let idx = -1;
    let count = 0;
    while ((idx = source.indexOf('defineAsyncComponent(', idx + 1)) !== -1) {
      const args = extractArgs(source, idx + 'defineAsyncComponent'.length);
      if (hasFallback(args)) continue;
      count += 1;
      if (samples.length < 5) {
        samples.push(`${rel}: defineAsyncComponent(${args.trim().split('\n')[0].slice(0, 48)}…)`);
      }
    }
    if (count) perFile[rel] = count;
  }
  return { perFile, samples };
};

const { perFile, samples } = collect();
const currentTotal = Object.values(perFile).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update')) {
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: '裸 defineAsyncComponent（无 onError / errorComponent）的台账：只许降不许升',
    total: currentTotal,
    files: perFile,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `[check:async-component-fallback] 台账已更新：${currentTotal} 处 / ${Object.keys(perFile).length} 个文件`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const baselineFiles = baseline.files || {};
const baselineTotal = Object.values(baselineFiles).reduce((a, b) => a + b, 0);

// 机读出口：供 check-ratchet-summary.mjs 汇总「棘轮总账」。只报数、不判定（与 check:layering 同契约）。
if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify({
      ratchet: 'async-fallback',
      current: currentTotal,
      baseline: baselineTotal,
    }),
  );
  process.exit(0);
}

const added = [];
const reduced = [];
const allFiles = new Set([...Object.keys(perFile), ...Object.keys(baselineFiles)]);
for (const file of allFiles) {
  const now = perFile[file] || 0;
  const was = baselineFiles[file] || 0;
  if (now > was) added.push({ file, now, was });
  else if (now < was) reduced.push({ file, now, was });
}

if (added.length) {
  console.error('[check:async-component-fallback] 新增了没有失败兜底的异步组件：');
  for (const item of added) {
    console.error(`  - ${item.file}：${item.was} → ${item.now} 处`);
  }
  console.error('');
  console.error('  修法：把 defineAsyncComponent(loader) 写成对象式并给失败出口，');
  console.error('        例如 onError(error, retry, fail, attempts) 退避重试，');
  console.error(
    '        或 errorComponent 给一个可见的降级 UI（参考 async-loaders.js 的 AsyncForum）。',
  );
  console.error('  存量迁移后请跑 npm run check:async-component-fallback:update 下调台账。');
  process.exit(1);
}

console.log(
  `✅ 异步组件兜底棘轮通过：当前 ${currentTotal} / 台账 ${baselineTotal}（${Object.keys(perFile).length} 个文件）`,
);
if (reduced.length) {
  console.log(
    `   存量已下降 ${reduced.length} 个文件 —— 跑 npm run check:async-component-fallback:update 下调台账`,
  );
}
if (currentTotal === baselineTotal && currentTotal > 0) {
  console.log('   待迁移清单（前 5 条）：');
  for (const s of samples) console.log(`     · ${s}`);
}
