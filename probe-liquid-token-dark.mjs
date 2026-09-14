// 液态玻璃 token 统一后：暗色实测（读计算值，不靠肉眼）
// 用法: node /tmp/deadcode/probe-liquid-token-dark.mjs <baseUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const OUT = '/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// 暗色必须 addInitScript 预设（css 懒加载，直接 setAttribute 会误报）
await ctx.addInitScript(() => {
  try { localStorage.setItem('boh-theme', 'dark'); } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

const hex = (rgb) => {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
};

const report = { tokens: {}, elements: {}, errors: [] };

async function readTokens() {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = ['--liquid-text-primary', '--liquid-text-secondary', '--liquid-text-tertiary',
      '--liquid-bg', '--hero-text', '--hero-text-secondary'];
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim()]));
  });
}

async function probe(label, url, sels, shot) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const htmlTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  report.tokens[label] = { htmlTheme, ...(await readTokens()) };
  const got = {};
  for (const sel of sels) {
    got[sel] = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { color: cs.color, background: cs.backgroundColor };
    }, sel);
  }
  report.elements[label] = got;
  if (shot) await page.screenshot({ path: `${OUT}/${shot}`, fullPage: false });
  console.log(`\n=== ${label} === html[data-theme]=${htmlTheme}`);
  console.log('  tokens:', JSON.stringify(report.tokens[label]));
  for (const [k, v] of Object.entries(got)) {
    console.log(`  ${k} -> ${v ? `color ${hex(v.color)} / bg ${hex(v.background)}` : '未找到元素'}`);
  }
}

await probe('1-home', `${BASE}/#/`, ['.beta6-hero', '.beta6-hero-sub', '.beta6-hero-eyebrow'], 'liquid-token-1-home-dark.png');

// 关键验证：token 是唯一变量。settings-glass / DataExportPanel 等被改文件里的
// 亮色规则本来就写 var(--liquid-text-*, 字面量)，只要证明「暗色下该 token 解析到
// 暗值」即可。注入带同样声明的元素，读计算色 —— 也顺带验证旧硬编码值不再是结果。
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2600);
const injected = await page.evaluate(() => {
  const mk = (id, decl) => {
    const d = document.createElement('span');
    d.id = id;
    d.style.cssText = decl;
    d.textContent = 'x';
    document.body.appendChild(d);
    return getComputedStyle(d).color;
  };
  return {
    primary: mk('p1', 'color: var(--liquid-text-primary, #1d1d1f)'),
    secondary: mk('p2', 'color: var(--liquid-text-secondary, #6e6e73)'),
    tertiary: mk('p3', 'color: var(--liquid-text-tertiary, #8b9098)'),
    heroAlias: mk('p4', 'color: var(--hero-text, #1d1d1f)'),
  };
});
console.log('\n=== 4-token 解析（暗色，带旧字面量 fallback）===');
console.log('  var(--liquid-text-primary,   #1d1d1f) ->', injected.primary, injected.primary === 'rgb(245, 245, 247)' ? '✓ 取到暗值' : '✗ 仍是 fallback！');
console.log('  var(--liquid-text-secondary, #6e6e73) ->', injected.secondary, injected.secondary === 'rgb(161, 161, 166)' ? '✓ 取到暗值' : '✗ 仍是 fallback！');
console.log('  var(--liquid-text-tertiary,  #8b9098) ->', injected.tertiary, injected.tertiary === 'rgb(138, 145, 156)' ? '✓ 取到暗值' : '✗ 仍是 fallback！');
console.log('  var(--hero-text,             #1d1d1f) ->', injected.heroAlias, injected.heroAlias === 'rgb(245, 245, 247)' ? '✓ 别名跟随' : '✗ 未跟随');
report.injected = injected;

await probe('3-reset-password', `${BASE}/#/reset-password`, ['.reset-page'], 'liquid-token-3-reset-dark.png');

report.errors = errors.slice(0, 10);
console.log('\n=== 页面错误 ===', errors.length ? errors : '无');
fs.writeFileSync('/tmp/deadcode/liquid-token-dark-report.json', JSON.stringify(report, null, 2));
await browser.close();
