/**
 * 量化 dark-token-counter 的计数盲区（它现在是门禁，口径必须站得住）。
 * 对照三档：
 *   A 当前实现
 *   B A + 补上「块尾无分号的声明」（.x { color: #fff } 这种漏法）
 *   C B + 把 @media (prefers-color-scheme: dark) 也算暗色块
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/g;
const DARK = /\[data-theme=["']?dark|\[data-boh-theme=["']?dark|\.dark-mode/;
const DARK_MEDIA = /prefers-color-scheme:\s*dark/;

const files = execSync('git ls-files "src/**/*.css" "src/**/*.scss" "src/**/*.vue" "src/*.css"',
  { encoding: 'utf-8' }).split('\n').filter(Boolean);

function scan({ tailDecl, mediaDark }) {
  let total = 0, imp = 0;
  const perFile = new Map();
  for (const f of files) {
    let src;
    try { src = readFileSync(path.join(process.cwd(), f), 'utf8'); } catch { continue; }
    src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    let depth = 0, darkEntry = -1, n = 0;
    const stack = [];
    let prelude = '';
    const eat = (decl) => {
      const dark = stack[stack.length - 1] || darkEntry !== -1;
      if (!dark) return;
      const lits = decl.match(COLOR) || [];
      if (lits.length) { n += lits.length; total += lits.length; }
      if (/!important/.test(decl)) imp++;
    };
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') {
        depth++;
        const isDark = DARK.test(prelude) || (mediaDark && DARK_MEDIA.test(prelude));
        stack.push(isDark);
        if (isDark && darkEntry === -1) darkEntry = depth;
        prelude = '';
      } else if (ch === '}') {
        if (tailDecl) eat(prelude);          // 块尾声明常省略分号
        stack.pop(); depth--;
        if (depth < darkEntry) darkEntry = -1;
        prelude = '';
      } else if (depth === 0) prelude += ch;
      else if (ch === ';') { eat(prelude); prelude = ''; }
      else prelude += ch;
    }
    if (n) perFile.set(f, n);
  }
  return { total, imp, perFile };
}

const A = scan({ tailDecl: false, mediaDark: false });
const B = scan({ tailDecl: true, mediaDark: false });
const C = scan({ tailDecl: true, mediaDark: true });
console.log(`A 当前实现                          literals=${A.total}  important=${A.imp}`);
console.log(`B +块尾无分号声明                    literals=${B.total}  important=${B.imp}   (Δ +${B.total - A.total} / +${B.imp - A.imp})`);
console.log(`C +prefers-color-scheme:dark 计入    literals=${C.total}  important=${C.imp}   (Δ +${C.total - B.total} / +${C.imp - B.imp})`);
const budget = JSON.parse(readFileSync('scripts/dark-token-budget.json', 'utf8'));
console.log(`\nbudget.total=${budget.total}  vs A=${A.total}  ${budget.total === A.total ? '一致' : '不一致 ⚠️'}`);
const d = [...B.perFile.entries()].filter(([f, v]) => v > (A.perFile.get(f) || 0)).sort((x, y) => (y[1] - (A.perFile.get(y[0]) || 0)) - (x[1] - (A.perFile.get(x[0]) || 0)));
console.log('\nB 相对 A 增长最多的文件（= 块尾漏法集中在哪）：');
d.slice(0, 10).forEach(([f, v]) => console.log(`  +${v - (A.perFile.get(f) || 0)}  ${f}`));

/* .vue 模板里的内联 style 是否被 brace-depth 口径覆盖 */
let inlineFiles = new Set(), inlineHits = 0;
for (const f of files) {
  if (!f.endsWith('.vue')) continue;
  let src; try { src = readFileSync(path.join(process.cwd(), f), 'utf8'); } catch { continue; }
  const tpl = src.slice(0, src.indexOf('<style') === -1 ? src.length : src.indexOf('<style'));
  const hits = tpl.match(/style="[^"]*(?:#[0-9a-fA-F]{3,8}|rgba?\()/g) || [];
  if (hits.length) { inlineFiles.add(f); inlineHits += hits.length; }
}
console.log(`\n.vue 模板内联 style 含色值：${inlineFiles.size} 个文件 / ${inlineHits} 处（brace-depth 口径不计入）`);
