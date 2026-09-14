/**
 * A1 验收探针：暗色下底栏 .nav-label 的文字色（区分激活/非激活）。
 *
 * 修正前序探针缺陷：原写法只取 querySelectorAll[0]，而 UserSpace 首个 nav-label
 * 恰是激活项（被 user-space-dark 的 !important 覆盖），导致误判「note 规则无效」。
 * 此处遍历全部匹配元素并按激活态分组去重。
 *
 * 用法：node probe-dark-note-verify.mjs <baseUrl> <label>
 *   label 仅用于输出标记（BEFORE / AFTER）。
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:5199';
const LABEL = process.argv[3] || '';

const PAGES = [
  ['shop', `${BASE}/#/shop`],
  ['forum', `${BASE}/#/forum`],
  ['user-space', `${BASE}/#/user-space?tab=community`],
  ['mbti', `${BASE}/#/mbti`],
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('boh-theme', 'dark'); } catch {} });
const page = await ctx.newPage();

console.log(`\n########## ${LABEL} ##########`);

for (const [name, url] of PAGES) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
  } catch (e) {
    console.log(`  ${name}: 打开失败 ${String(e.message).slice(0, 50)}`);
    continue;
  }

  const res = await page.evaluate(() => {
    const theme = document.documentElement.getAttribute('data-theme');
    const els = [...document.querySelectorAll('.nav-label')];
    const rows = els.map((el) => {
      const cs = getComputedStyle(el);
      const item = el.closest('.nav-item');
      const active = !!(item && item.classList.contains('active'));
      return { color: cs.color, active, text: (el.textContent || '').trim().slice(0, 8) };
    });
    return { theme, rows };
  });

  const label = (c) => {
    const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!m) return c;
    const hex = '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
    const note = hex === '#7a7a8a' ? '  <= note 原值 #7a7a8a' : '';
    return `${hex}${note}`;
  };

  console.log(`\n  ${name}  (theme=${res.theme}, .nav-label n=${res.rows.length})`);
  if (!res.rows.length) { console.log('    (无 .nav-label 元素)'); continue; }
  for (const r of res.rows) {
    console.log(`    [${r.active ? 'ACTIVE' : 'idle  '}] "${r.text}"  color=${label(r.color)}`);
  }
}

await browser.close();
