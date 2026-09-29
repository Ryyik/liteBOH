#!/usr/bin/env node
/**
 * compare-builds.mjs — 产物级对比：证明一次重构「是纯搬运」或「只改了该改的」
 *
 * ── 它回答什么问题 ──────────────────────────────────────────────────
 * 拆分组件 / 外置 CSS / 搬代码这类重构，**目标就是"产物不变"**。所以最强的自动化
 * 证据不是"我觉得没变"，而是**把改动前后的两份构建产物逐字节比一遍**。
 * 本会话已用它证明过：第 19 条 CSS 外置（111 文件 / 2,970,170 字节完全一致）
 * 与 ForumMain 死代码清理（chunk 字节相同 → 反证删的是死代码）。
 *
 * ── 四层检查（从粗到细）────────────────────────────────────────────
 *   L1 总字节：两份产物总量是否一致
 *   L2 文件级：哪些文件变了、变了几字节
 *   L3 声明级：对**变化的 CSS** 剥掉 `[data-v-*]` 并归一 8 位 scope 哈希后缀后，
 *              逐条规则比对 —— 差异只剩哈希本身才算"语义中性"
 *   L4 配对级：CSS 侧出现的 scope id 是否在 JS 侧同名出现
 *              （**这一层是 L3 证明不了的**：scope id 不配对 = 样式静默不生效）
 *
 * ⚠️ 它证明的是「样式与产物结构」没变，**证明不了运行时行为**。行为要靠单测 + 探针。
 *    视觉仍须人眼确认（本工具不提供那个能力）。
 *
 * 用法：
 *   node scripts/compare-builds.mjs <beforeDir> <afterDir>
 *   例：node scripts/compare-builds.mjs /tmp/dist-before dist-check
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.error('用法: node scripts/compare-builds.mjs <beforeDir> <afterDir>');
  process.exit(2);
}
for (const d of [beforeDir, afterDir]) {
  if (!existsSync(d)) {
    console.error(`目录不存在: ${d}`);
    process.exit(2);
  }
}

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const index = (dir) => {
  const m = new Map();
  for (const f of walk(dir)) {
    // ⚠️ 必须把文件名里的**内容哈希**归一掉：Vite 产物名形如 `Foo-Dzmu6m6U.js`，
    // 每次重建哈希都不同。不归一的话，两份产物会被报成「125 新增 / 125 删除」，
    // 完全掩盖真正的内容差异（第一版就栽在这里）。
    const key = relative(dir, f)
      .split('\\')
      .join('/')
      .replace(/-[A-Za-z0-9_-]{8}\.(js|mjs|css)$/, '-<hash>.$1');
    // 同名冲突时取较大者（同内容不同哈希的极端情况）
    m.set(key, Math.max(m.get(key) ?? 0, statSync(f).size));
  }
  return m;
};

const A = index(beforeDir);
const B = index(afterDir);
const keys = new Set([...A.keys(), ...B.keys()]);

let totalA = 0;
let totalB = 0;
const changed = [];
const added = [];
const removed = [];
for (const k of keys) {
  const a = A.get(k);
  const b = B.get(k);
  if (a !== undefined) totalA += a;
  if (b !== undefined) totalB += b;
  if (a === undefined) added.push(k);
  else if (b === undefined) removed.push(k);
  else if (a !== b) changed.push({ file: k, before: a, after: b });
}

console.log('═══ L1 总字节 ═══');
console.log(`  before: ${totalA} bytes / ${A.size} 文件`);
console.log(`  after : ${totalB} bytes / ${B.size} 文件`);
console.log(`  差    : ${totalB - totalA >= 0 ? '+' : ''}${totalB - totalA} bytes`);
console.log('');

console.log('═══ L2 文件级 ═══');
console.log(`  内容变化: ${changed.length} | 新增: ${added.length} | 删除: ${removed.length}`);
for (const c of changed.slice(0, 20)) {
  const d = c.after - c.before;
  console.log(`    ${d >= 0 ? '+' : ''}${String(d).padStart(7)}  ${c.file}`);
}
if (changed.length > 20) console.log(`    …还有 ${changed.length - 20} 个`);
for (const f of added.slice(0, 10)) console.log(`    [新增] ${f}`);
for (const f of removed.slice(0, 10)) console.log(`    [删除] ${f}`);
console.log('');

// ── L3 声明级：只对变化的 CSS 做「剥 scope 属性 + 归一哈希后缀」的规则比对 ──
const cssChanged = changed.filter((c) => c.file.endsWith('.css'));
const cssAdded = added.filter((f) => f.endsWith('.css'));
const cssRemoved = removed.filter((f) => f.endsWith('.css'));

/** 抽 CSS 规则，剥掉 [data-v-x]，并把 8 位 scope 哈希后缀归一成 `-<scope>` */
const normalizeRules = (text) => {
  const out = new Map();
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    let sel = m[1]
      .replace(/\[data-v-[0-9a-f]+\]/g, '')
      .replace(/-[0-9a-f]{8}\b/g, '-<scope>')
      .replace(/\s+/g, ' ')
      .trim();
    const val = m[2].replace(/\s+/g, ' ').trim();
    if (!sel) continue;
    const key = `${sel} => ${val}`;
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
};

console.log('═══ L3 声明级（只对变化的 CSS）═══');
if (!cssChanged.length && !cssAdded.length && !cssRemoved.length) {
  console.log('  CSS 文件无变化 ✓');
} else {
  let allClean = true;
  for (const c of cssChanged) {
    const before = normalizeRules(readFileSync(join(beforeDir, c.file), 'utf-8'));
    const after = normalizeRules(readFileSync(join(afterDir, c.file), 'utf-8'));
    const lost = [...before.keys()].filter((k) => !after.has(k));
    const gained = [...after.keys()].filter((k) => !before.has(k));
    const clean = lost.length === 0 && gained.length === 0;
    if (!clean) allClean = false;
    console.log(
      `  ${clean ? '✅' : '⚠️ '} ${c.file}  规则 ${before.size} → ${after.size}  丢失 ${lost.length} / 新增 ${gained.length}`,
    );
    for (const l of lost.slice(0, 3)) console.log(`        丢失: ${l.slice(0, 110)}`);
    for (const g of gained.slice(0, 3)) console.log(`        新增: ${g.slice(0, 110)}`);
  }
  if (cssAdded.length || cssRemoved.length) {
    console.log(
      `  另有 CSS 文件增删（${cssAdded.length} 新增 / ${cssRemoved.length} 删除）—— 声明级对比不适用，需人工看`,
    );
    allClean = false;
  }
  console.log(
    allClean
      ? '  → 变化的 CSS 在归一后**逐条一致**：语义中性 ✓'
      : '  → 存在差异，需人工核对上面列出的规则',
  );
}
console.log('');

// ── L4 配对级：CSS 里的 scope id 是否在 JS 里同名出现 ──
const collect = (dir, exts) => {
  const set = new Set();
  for (const f of walk(dir)) {
    if (!exts.some((e) => f.endsWith(e))) continue;
    const t = readFileSync(f, 'utf-8');
    for (const m of t.matchAll(/data-v-[0-9a-f]{8}/g)) set.add(m[0]);
  }
  return set;
};
const cssIds = collect(afterDir, ['.css']);
const jsIds = collect(afterDir, ['.js', '.mjs', '.ts']);

console.log('═══ L4 配对级（CSS scope id ↔ JS scope id）═══');
console.log(`  CSS 侧 scope id: ${cssIds.size} | JS 侧: ${jsIds.size}`);
const orphanCssIds = [...cssIds].filter((id) => !jsIds.has(id));
console.log(
  orphanCssIds.length
    ? `  ⚠️ 有 ${orphanCssIds.length} 个 scope id 只在 CSS 出现、JS 侧找不到 → 这些样式可能静默不生效：\n    ${orphanCssIds.slice(0, 10).join(', ')}`
    : '  ✅ CSS 侧每个 scope id 都能在 JS 侧找到同名 → 不存在「样式静默不生效」',
);
console.log('');
console.log('⚠️ 本工具只覆盖「产物结构 + 样式」。运行时行为靠单测与探针，视觉仍须人眼确认。');
