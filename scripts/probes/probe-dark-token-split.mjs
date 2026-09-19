/**
 * 拆分「暗色块内字面量」的两类来源：
 *   定义侧  --x: #hex / rgba()   —— token 的家，字面量**必须**写在这里，是正确写法
 *   消费侧  color: #hex / background: rgba()  —— 这才是应当收敛成 var() 的债
 * 用于判断 check-dark-tokens 的口径会不会误伤正确行为。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listDarkScanFiles } from '../lib/dark-token-counter.mjs';

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/g;
const DARK = /\[data-theme=["']?dark|\[data-boh-theme=["']?dark|\.dark-mode/;
const VARDEF = /^\s*--[a-zA-Z0-9-]+\s*:/;

const files = listDarkScanFiles({});
let def = 0, use = 0, defImp = 0, useImp = 0;
const defF = new Map(), useF = new Map();

for (const f of files) {
  let src;
  try { src = readFileSync(path.join(process.cwd(), f), 'utf8'); } catch { continue; }
  src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  let depth = 0, entry = -1, pre = '';
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      depth++;
      const d = DARK.test(pre);
      stack.push(d);
      if (d && entry === -1) entry = depth;
      pre = '';
    } else if (ch === '}') {
      stack.pop(); depth--;
      if (depth < entry) entry = -1;
      pre = '';
    } else if (depth === 0) pre += ch;
    else if (ch === ';') {
      const decl = pre; pre = '';
      const dark = stack[stack.length - 1] || entry !== -1;
      if (!dark) continue;
      const lits = decl.match(COLOR) || [];
      if (!lits.length) continue;
      const isDef = VARDEF.test(decl);
      if (isDef) {
        def += lits.length; defF.set(f, (defF.get(f) || 0) + lits.length);
        if (/!important/.test(decl)) defImp++;
      } else {
        use += lits.length; useF.set(f, (useF.get(f) || 0) + lits.length);
        if (/!important/.test(decl)) useImp++;
      }
    } else pre += ch;
  }
}

const total = def + use;
console.log(`暗色块内字面量总计        ${total}`);
console.log(`  定义侧 --x: #hex        ${def}  (${(def / total * 100).toFixed(1)}%)  ← token 的家，正确写法`);
console.log(`  消费侧 color: #hex      ${use}  (${(use / total * 100).toFixed(1)}%)  ← 应当收敛成 var() 的真债`);
console.log(`\n!important  定义侧=${defImp}  消费侧=${useImp}`);
console.log('\n定义侧 top6（这些其实是"已经做对"的地方）:');
[...defF].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([f, n]) => console.log(`  ${String(n).padStart(3)}  ${f}`));
console.log('\n消费侧 top8（真正该清扫的）:');
[...useF].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([f, n]) => console.log(`  ${String(n).padStart(3)}  ${f}`));
