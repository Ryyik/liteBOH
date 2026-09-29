// 只读分析 v3：用 **acorn 解析**拿顶层声明的精确区间（v1/v2 手搓边界都出过 bug）。
//
// 为什么必须换解析器：v1 用「下一个声明的位置」当结束边界 → 过度延伸；
// v2 用括号深度 → `const f = () => {...}` 在 `()` 后深度就回到 0，被截断成
// `const f = () =>`，导致 refs 全空、结论全错。**这类"手搓边界"的错误极其隐蔽：
// 工具照样输出、数字看着合理，但结论是错的。** 有真解析器就用真解析器。
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';

const FILE = process.argv[2] || 'src/views/Forum/ForumMain.vue';
const src = readFileSync(FILE, 'utf-8');
const lines = src.split('\n');

const scriptStart = lines.findIndex((l) => l.startsWith('<script'));
const scriptEnd = lines.findIndex((l) => l === '</script>');
const tplStart = lines.findIndex((l) => l === '<template>');
const tplEnd = lines.findIndex((l) => l === '</template>');

// 用等长空白替换非 script 内容，保证 acorn 的 offset 与原文件一致
const pad = (s) => s.replace(/[^\n]/g, ' ');
const masked =
  pad(lines.slice(0, scriptStart + 1).join('\n')) +
  '\n' +
  lines.slice(scriptStart + 1, scriptEnd).join('\n') +
  '\n' +
  pad(lines.slice(scriptEnd).join('\n'));

const template = tplStart >= 0 ? lines.slice(tplStart, tplEnd + 1).join('\n') : '';

let ast;
try {
  ast = parse(masked, { ecmaVersion: 'latest', sourceType: 'module' });
} catch (e) {
  console.error('解析失败:', e.message);
  process.exit(2);
}

const nameOf = (node) => {
  if (node.type === 'VariableDeclaration') return node.declarations[0]?.id?.name;
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return node.id?.name;
  return undefined;
};

const decls = [];
for (const node of ast.body) {
  const name = nameOf(node);
  if (name) decls.push({ name, start: node.start, end: node.end });
}
const names = new Set(decls.map((d) => d.name));
const wordRe = (n) => new RegExp(`(?<![\\w$])${n.replace(/[$]/g, '\\$')}(?![\\w$])`, 'g');
const countIn = (text, n) => [...text.matchAll(wordRe(n))].length;

// 「顶层内联代码」= 所有不属于任何声明区间的 script 文本
let cursor = 0;
let inlineCode = '';
for (const d of decls.sort((a, b) => a.start - b.start)) {
  inlineCode += masked.slice(cursor, d.start) + '\n';
  cursor = d.end;
}
inlineCode += masked.slice(cursor);

const refs = new Map();
for (const d of decls) {
  const own = masked.slice(d.start, d.end);
  const hit = new Set();
  for (const n of names) if (n !== d.name && countIn(own, n) > 0) hit.add(n);
  refs.set(d.name, hit);
}

// 区间外出现次数 = 全文件出现 − 自身区间内出现
const outside = new Map();
for (const d of decls) {
  const total = countIn(masked, d.name) + countIn(template, d.name);
  outside.set(d.name, total - countIn(masked.slice(d.start, d.end), d.name));
}
const dead = decls.filter((d) => outside.get(d.name) === 0).map((d) => d.name);

const usedBy = new Map();
for (const d of decls) usedBy.set(d.name, new Set());
for (const [from, tos] of refs) for (const t of tos) usedBy.get(t)?.add(from);
const INFRA = 8;
const infra = new Set(decls.filter((d) => usedBy.get(d.name).size >= INFRA).map((d) => d.name));

const parent = new Map(decls.map((d) => [d.name, d.name]));
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
for (const [from, tos] of refs) {
  if (infra.has(from)) continue;
  for (const t of tos) if (!infra.has(t)) parent.set(find(from), find(t));
}
const groups = new Map();
for (const d of decls) {
  if (infra.has(d.name)) continue;
  const r = find(d.name);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(d.name);
}

// 簇的「对外引用」：成员引用到的簇外名（去重）
const spanOf = (n) => decls.find((d) => d.name === n);
const scored = [...groups.values()]
  .filter((g) => g.length >= 3)
  .map((g) => {
    const set = new Set(g);
    const outward = new Set();
    for (const n of g) for (const t of refs.get(n)) if (!set.has(t)) outward.add(t);
    // 簇外被引用：成员出现在「本簇任何声明的区间之外」的次数（含顶层内联代码与模板）
    let ext = 0;
    for (const n of g) {
      let inside = 0;
      for (const m of g) {
        const s = spanOf(m);
        inside += countIn(masked.slice(s.start, s.end), n);
      }
      ext += countIn(masked, n) + countIn(template, n) - inside;
    }
    return { size: g.length, outward: outward.size, ext, members: g, outList: [...outward] };
  })
  .sort((a, b) => a.ext - b.ext || a.outward - b.outward || b.size - a.size);

console.log(`文件: ${FILE}`);
console.log(`顶层声明（acorn 解析）: ${decls.length}`);
console.log(
  `真死代码（区间外零出现）: ${dead.length}${dead.length ? ' → ' + dead.join(', ') : ''}`,
);
console.log(`基础设施型（被 >=${INFRA} 处引用，拆不动）: ${infra.size} → ${[...infra].join(', ')}`);
console.log('');
console.log('可拆候选簇（>=3 成员，按「簇外被引用次数」升序；**0 才完全自包含**）:');
for (const s of scored.slice(0, 8)) {
  const tag = s.ext === 0 ? '★ 完全自包含' : '';
  console.log(
    `  成员 ${String(s.size).padStart(3)} | 对外引用 ${String(s.outward).padStart(3)} | 簇外被引用 ${String(s.ext).padStart(4)}  ${tag}`,
  );
  console.log(
    `      ${s.members.slice(0, 12).join(', ')}${s.members.length > 12 ? ` …(+${s.members.length - 12})` : ''}`,
  );
  if (s.outList.length)
    console.log(
      `      对外: ${s.outList.slice(0, 10).join(', ')}${s.outList.length > 10 ? ' …' : ''}`,
    );
}
