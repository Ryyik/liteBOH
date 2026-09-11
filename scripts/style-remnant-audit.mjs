/**
 * style-remnant-audit.mjs — 全站旧样式残留审计
 * 输出 style-remnant-audit.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

// ---------- 工具 ----------
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

const srcFiles = walk(SRC);
console.error('[1] walked', srcFiles.length);
const rootHtmlPath = path.join(ROOT, 'index.html');
const codeFiles = srcFiles.filter(f => /\.(vue|js|ts|html)$/.test(f));
if (fs.existsSync(rootHtmlPath)) codeFiles.push(rootHtmlPath);
const cssFiles = srcFiles.filter(f => f.endsWith('.css'));

// ---------- 1. CSS 引用图 ----------
// 对 .vue 文件：找出每个 @import 所在 <style> 块是否 scoped
function vueStyleBlocks(text) {
  const blocks = [];
  const re = /<style([^>]*)>/g; let m;
  while ((m = re.exec(text))) {
    const attrs = m[1] || '';
    const start = m.index;
    const end = text.indexOf('</style>', start);
    if (end === -1) continue;
    blocks.push({ start, end, scoped: /\bscoped\b/.test(attrs) });
  }
  return blocks;
}
function lineStartsWithComment(text, idx) {
  const ls = text.lastIndexOf('\n', idx) + 1;
  const line = text.slice(ls, text.indexOf('\n', idx) === -1 ? undefined : text.indexOf('\n', idx)).trim();
  return line.startsWith('//') || line.startsWith('/*') || line.startsWith('*');
}

const refGraph = new Map(); // cssPath -> [{from, raw, scoped, commented}]
function addRef(importer, raw, scoped, commented) {
  let target;
  if (raw.startsWith('@/')) target = path.join(SRC, raw.slice(2));
  else if (raw.startsWith('.')) target = path.resolve(path.dirname(importer), raw);
  else if (raw.startsWith('/')) target = path.join(ROOT, raw.slice(1));
  else target = path.resolve(path.dirname(importer), raw);
  try { target = fs.realpathSync(target); } catch { return; }
  if (!refGraph.has(target)) refGraph.set(target, []);
  refGraph.get(target).push({ from: rel(importer), raw, scoped: !!scoped, commented: !!commented });
}

const CSS_REF_RES = [
  /(?:from\s*|import\s*\(\s*|import\s+|@import\s+|require\s*\(\s*)(['"])([^'"]+\.css)(?:\?[^'"]*)?\1/g,
  /@import\s+url\(\s*(['"])([^'"]+\.css)(?:\?[^'"]*)?\1\s*\)/g,
];
// <style scoped src="./x.css"> 形态（scoped 标志取自标签属性）
const STYLE_SRC_RE = /<style([^>]*)\ssrc=["']([^"']+\.css)(?:\?[^"']*)?["'][^>]*>/g;

for (const f of codeFiles) {
  const text = read(f);
  if (!text) continue;
  const isVue = f.endsWith('.vue');
  const blocks = isVue ? vueStyleBlocks(text) : [];
  for (const re of CSS_REF_RES) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      const raw = m[2];
      let scoped = false;
      if (isVue) {
        const b = blocks.find(b => m.index > b.start && m.index < b.end);
        scoped = b ? b.scoped : false;
      }
      addRef(f, raw, scoped, lineStartsWithComment(text, m.index));
    }
  }
  if (isVue) {
    STYLE_SRC_RE.lastIndex = 0; let sm;
    while ((sm = STYLE_SRC_RE.exec(text))) {
      addRef(f, sm[2], /\bscoped\b/.test(sm[1] || ''), false);
    }
  }
}

// 全局入口引用（js/ts/html 中 import，非 scoped）
console.error('[2] ref graph done', refGraph.size);
// 可达性：从「非 css 文件的引用」出发
const liveDirect = new Set();
const scopedOnlyRefs = new Map(); // cssPath -> [{from,scoped}]
for (const [css, refs] of refGraph) {
  const live = refs.filter(r => !r.commented);
  if (live.length === 0) continue;
  liveDirect.add(css);
  for (const r of live) {
    if (r.scoped) {
      if (!scopedOnlyRefs.has(css)) scopedOnlyRefs.set(css, []);
      scopedOnlyRefs.get(css).push(r);
    }
  }
}
// css->css @import 传递可达
const cssDepGraph = new Map();
for (const [css, refs] of refGraph) {
  for (const r of refs.filter(r => !r.commented)) {
    if (r.from.endsWith('.css')) {
      if (!cssDepGraph.has(css)) cssDepGraph.set(css, new Set());
      cssDepGraph.get(css).add(r.from); // css 被 css 引用
    }
  }
}
const reachableFromLive = new Set();
const queue = [...liveDirect];
while (queue.length) {
  const cur = queue.pop();
  if (reachableFromLive.has(cur)) continue;
  reachableFromLive.add(cur);
  for (const [css, deps] of cssDepGraph) {
    if (deps.has(rel(cur)) && !reachableFromLive.has(css)) queue.push(css);
  }
}
const deadCss = cssFiles.filter(f => !reachableFromLive.has(f));

// ---------- 2. 使用语料（剔除 .vue 的 <style> 块 + 所有 css）→ 分词建索引 ----------
const tokenSet = new Set();
for (const f of codeFiles) {
  let t = read(f);
  if (f.endsWith('.vue')) t = t.replace(/<style[\s\S]*?<\/style>/g, '');
  const re = /[\w$-]+/g; let m;
  while ((m = re.exec(t))) tokenSet.add(m[0]);
}

// ---------- 3. token 家族统计 ----------
const fams = {
  liquid: /--liquid-[a-z0-9-]+/g,
  apple: /--apple-[a-z0-9-]+/g,
  boh: /--boh-[a-z0-9-]+/g,
  hero: /--hero-[a-z0-9-]+/g,
  shadcn: /--(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring)(?:-[a-z]+)?(?![\w-])/g,
};
const allStyleText = srcFiles.filter(f => /\.(css|vue)$/.test(f)).map(f => read(f)).join('\n');
const tokenStats = {};
console.error('[3] token start');
for (const [fam, re] of Object.entries(fams)) {
  const defs = new Set(), uses = new Set();
  let m;
  const defRe = new RegExp('(' + re.source + ')\\s*:', 'g');
  while ((m = defRe.exec(allStyleText))) defs.add(m[1]);
  const useRe = new RegExp('var\\(\\s*(' + re.source + ')', 'g');
  while ((m = useRe.exec(allStyleText))) uses.add(m[1]);
  const unusedDefs = [...defs].filter(d => !uses.has(d));
  const orphanUses = [...uses].filter(u => !defs.has(u));
  tokenStats[fam] = {
    defined: defs.size, used: uses.size,
    unusedDefs: unusedDefs.slice(0, 60), unusedDefCount: unusedDefs.length,
    orphanUses: orphanUses.slice(0, 30), orphanUseCount: orphanUses.length,
  };
}

// ---------- 4. 字体 ----------
const fontStats = { Saira: {}, Poppins: {}, icomoon: {}, Inter: {} };
console.error('[4] tokens done');
for (const fam of Object.keys(fontStats)) {
  const re = new RegExp(fam, 'g');
  const files = [];
  for (const f of srcFiles) {
    const t = read(f); if (!t) continue;
    const c = (t.match(re) || []).length;
    if (c > 0) files.push({ file: rel(f), count: c });
  }
  files.sort((a, b) => b.count - a.count);
  fontStats[fam] = { totalFiles: files.length, total: files.reduce((s, x) => s + x.count, 0), files: files.slice(0, 25) };
}

// ---------- 5. backdrop-filter 散装使用 ----------
const CANONICAL_BACKDROP = new Set(['tokens.css', 'liquid-glass.css', 'glass-ui.css', 'hero-surface.css']);
const backdropFiles = [];
console.error('[5] fonts done');
let scatteredBigBlur = [];
for (const f of cssFiles) {
  const t = read(f); if (!t) continue;
  const hits = t.match(/backdrop-filter\s*:[^;}]*/g) || [];
  if (!hits.length) continue;
  const canonical = CANONICAL_BACKDROP.has(path.basename(f));
  const blurs = hits.map(h => { const m = h.match(/blur\(\s*([\d.]+)px/); return m ? parseFloat(m[1]) : null; }).filter(v => v !== null);
  const big = blurs.filter(v => v >= 6);
  backdropFiles.push({ file: rel(f), count: hits.length, canonical, bigBlur: big.length });
  if (!canonical && big.length) scatteredBigBlur.push({ file: rel(f), count: big.length, values: big.slice(0, 8) });
}
scatteredBigBlur.sort((a, b) => b.count - a.count);
const scatteredBackdropTotal = backdropFiles.filter(x => !x.canonical).reduce((s, x) => s + x.count, 0);

// ---------- 6. 已删组件残留 ----------
const remnantComponents = {};
console.error('[6] backdrop done');
const compChecks = {
  'HeroSection(已删)': /(?<!History)HeroSection\b/,
  'Beta6Hero(旧)': /\bBeta6Hero\b/,
  'LegacyHero': /\bLegacyHero\b/i,
};
for (const [name, re] of Object.entries(compChecks)) {
  const hits = [];
  for (const f of codeFiles) {
    const t = read(f);
    const c = (t.match(new RegExp(re.source, 'g')) || []).length;
    if (c) hits.push({ file: rel(f), count: c });
  }
  remnantComponents[name] = hits;
}

// ---------- 7. 主题机制 ----------
const themeMech = { dataTheme: { files: 0, count: 0 }, dataBohTheme: { files: 0, count: 0 }, prefersColorScheme: [] };
console.error('[7] remnants done');
for (const f of srcFiles.filter(f => /\.(css|vue|js|ts)$/.test(f))) {
  const t = read(f); if (!t) continue;
  const a = (t.match(/\[data-theme/g) || []).length + (t.match(/data-theme=/g) || []).length;
  const b = (t.match(/data-boh-theme/g) || []).length;
  const c = (t.match(/prefers-color-scheme:\s*(?:dark|light)/g) || []).length;
  if (a) { themeMech.dataTheme.files++; themeMech.dataTheme.count += a; }
  if (b) { themeMech.dataBohTheme.files++; themeMech.dataBohTheme.count += b; }
  if (c && !f.includes('/themes/')) themeMech.prefersColorScheme.push({ file: rel(f), count: c });
}
themeMech.prefersColorScheme.sort((a, b) => b.count - a.count);

// ---------- 8. !important 基线 ----------
let importantCount = 0, importantThemes = 0;
for (const f of srcFiles.filter(f => /\.(css|vue)$/.test(f))) {
  const n = (read(f).match(/!important/g) || []).length;
  if (f.includes(`${path.sep}themes${path.sep}`)) importantThemes += n;
  else importantCount += n;
}
let budget = null;
try { budget = JSON.parse(read(path.join(ROOT, 'scripts/important-budget.json'))); } catch {}

// ---------- 9. 全局 css 重复定义的类 ----------
const globalStyleDirs = cssFiles.filter(f => f.includes(`${path.sep}styles${path.sep}`));
console.error('[8] theme done');
const classDefs = new Map(); // name -> Set(files)
for (const f of globalStyleDirs) {
  const t = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /(?<![\w-])\.([a-zA-Z_][\w-]*)/g; let m;
  while ((m = re.exec(t))) {
    if (!classDefs.has(m[1])) classDefs.set(m[1], new Set());
    classDefs.get(m[1]).add(rel(f));
  }
}
const dupClasses = [...classDefs.entries()]
  .filter(([n, s]) => s.size >= 3)
  .map(([n, s]) => ({ name: n, files: [...s] }))
  .sort((a, b) => b.files.length - a.files.length);

// ---------- 10. 死类（src/styles/** 中定义、语料中零命中） ----------
const deadClassesByFile = {};
console.error('[9] dup classes done', dupClasses.length);
let deadClassTotal = 0, globalClassTotal = 0;
for (const f of globalStyleDirs) {
  const t = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set();
  const re = /(?<![\w-])\.([a-zA-Z_][\w-]*)/g; let m;
  while ((m = re.exec(t))) names.add(m[1]);
  globalClassTotal += names.size;
  const dead = [...names].filter(n => !tokenSet.has(n));
  deadClassTotal += dead.length;
  if (dead.length) deadClassesByFile[rel(f)] = { total: names.size, dead: dead.sort().slice(0, 40), deadCount: dead.length };
}

// icon-* 单独统计（icomoon 体系）
const iconUses = new Set();
{
  const re = /\bicon-[a-z0-9-]+/g; let m;
  const codeCorpus = codeFiles.map(f => read(f)).join('\n');
  while ((m = re.exec(codeCorpus))) iconUses.add(m[0]);
}

// ---------- 11. body.page-* vendor 遗留 ----------
const bodyPageSelectors = [];
console.error('[10] dead classes done', deadClassTotal);
for (const f of cssFiles) {
  const t = read(f);
  const hits = t.match(/body\.page-[a-z0-9-]+[^{]*/g) || [];
  if (hits.length) bodyPageSelectors.push({ file: rel(f), count: hits.length, sample: [...new Set(hits.map(h => h.trim().slice(0, 50)))].slice(0, 5) });
}
bodyPageSelectors.sort((a, b) => b.count - a.count);

// ---------- 12. tailwind 实用类使用抽样 ----------
let tailwindHits = 0;
{
  const re = /\bclass="[^"]*\b(items-center|justify-center|justify-between|px-\d+|py-\d+|gap-\d+|rounded-(?:lg|xl|full)|text-(?:xs|sm|lg|xl)|font-bold|w-full|h-full)\b/g;
  for (const f of srcFiles.filter(f => f.endsWith('.vue'))) tailwindHits += (read(f).match(re) || []).length;
}

// ---------- 13. z-index >= 9000 ----------
const zWar = {};
for (const f of srcFiles.filter(f => /\.(css|vue)$/.test(f))) {
  const t = read(f);
  const re = /z-index\s*:\s*(\d{4,})/g; let m;
  while ((m = re.exec(t))) {
    const v = parseInt(m[1]);
    if (v >= 9000) zWar[v] = (zWar[v] || 0) + 1;
  }
}

// ---------- 14. css 体积清单 ----------
const cssInventory = cssFiles.map(f => {
  const t = read(f);
  return { file: rel(f), lines: t.split('\n').length, kb: Math.round(fs.statSync(f).size / 1024 * 10) / 10, refs: (refGraph.get(f) || []).filter(r => !r.commented).length, scopedRefs: (scopedOnlyRefs.get(f) || []).length };
}).sort((a, b) => b.lines - a.lines);

// 多重 scoped 引入（同文件被多个组件 scoped 引入 = 打包重复）
const multiScoped = [...scopedOnlyRefs.entries()]
  .map(([css, refs]) => ({ file: rel(css), scopedImports: refs.length, importers: [...new Set(refs.map(r => r.from))].slice(0, 10), lines: (cssInventory.find(x => x.file === rel(css)) || {}).lines || 0 }))
  .filter(x => x.scopedImports >= 2)
  .sort((a, b) => (b.scopedImports * b.lines) - (a.scopedImports * a.lines));

// ---------- 15. rgba 白色半透叠加（玻璃遮罩禁令） ----------
const whiteOverlay = [];
for (const f of srcFiles.filter(f => /\.(css|vue)$/.test(f))) {
  const t = read(f);
  const hits = t.match(/background[^;{}]*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[3-9]/g) || [];
  if (hits.length >= 3) whiteOverlay.push({ file: rel(f), count: hits.length });
}
whiteOverlay.sort((a, b) => b.count - a.count);

// ---------- 16. style.css 内容概况 ----------
const styleCss = read(path.join(ROOT, 'src/style.css'));
const styleCssInfo = {
  lines: styleCss.split('\n').length,
  darkRules: (styleCss.match(/data-theme="dark"/g) || []).length + (styleCss.match(/\[data-theme="dark"\]/g) || []).length,
  hasDarkComment: styleCss.includes('已改为按需加载'),
};

// ---------- 汇总 ----------
const result = {
  generatedAt: new Date().toISOString(),
  summary: {
    cssFiles: cssFiles.length,
    cssTotalLines: cssInventory.reduce((s, x) => s + x.lines, 0),
    deadCssCount: deadCss.length,
    deadCssList: deadCss.map(rel),
    deadClassTotal, globalClassTotal,
    importantCount, importantThemes, budgetBaseline: budget?.baseline ?? budget ?? null,
    scatteredBackdropTotal,
    tailwindUtilityHits: tailwindHits,
    iconUses: [...iconUses].slice(0, 40),
  },
  deadCssDetails: deadCss.map(f => {
    const t = read(f);
    return { file: rel(f), lines: t.split('\n').length, kb: Math.round(fs.statSync(f).size / 1024 * 10) / 10 };
  }),
  multiScoped,
  tokenStats,
  fontStats,
  scatteredBigBlur,
  remnantComponents,
  themeMech,
  dupClasses: dupClasses.slice(0, 50),
  deadClassesByFile,
  bodyPageSelectors,
  zWar,
  whiteOverlay: whiteOverlay.slice(0, 25),
  styleCssInfo,
  cssInventory: cssInventory.slice(0, 45),
};

fs.writeFileSync(path.join(ROOT, 'style-remnant-audit.json'), JSON.stringify(result, null, 2));
console.log('OK — style-remnant-audit.json written');
console.log('dead css:', result.summary.deadCssCount, '| dead classes:', deadClassTotal, '| !important:', importantCount, '| scattered backdrop:', scatteredBackdropTotal, '| tailwind hits:', tailwindHits);
