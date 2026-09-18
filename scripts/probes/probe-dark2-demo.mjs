/**
 * 验证 docs/dark-mode-demo.html：截图 + 控制台错误 + 抓出两侧实测对比度。
 * 用法：node scripts/probes/probe-dark2-demo.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const FILE = 'file://' + process.cwd() + '/docs/dark-mode-demo.html';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  // 本机未下载 playwright 自带浏览器，复用系统 Chrome 做视觉验证
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await b.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto(FILE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const summary = await page.evaluate(() => {
  const rows = [];
  for (const p of document.querySelectorAll('.pane[data-p=cur], .pane[data-p=d2]')) {
    const pane = p.dataset.p;
    p.querySelectorAll('[data-cr]').forEach((el) => {
      const badge = el.querySelector(':scope > .cr');
      if (!badge) return;
      rows.push({
        pane,
        text: (el.textContent || '').replace(badge.textContent, '').trim().slice(0, 22),
        cr: parseFloat(badge.textContent) || 0,
        level: badge.className.split(' ').pop(),
        detail: badge.title.replace(/\n/g, ' | '),
      });
    });
  }
  const g = (id) => document.getElementById(id)?.textContent;
  return {
    cur: { fail: g('scoreCur'), total: g('totCur') },
    d2: { fail: g('scoreD2'), total: g('totD2') },
    rows,
  };
});

console.log(`pairs checked: ${summary.cur.total} per pane`);
console.log(`current  failing: ${summary.cur.fail}`);
console.log(`dark2.0  failing: ${summary.d2.fail}`);
const byLevel = (pane) => summary.rows.filter((r) => r.pane === pane)
  .reduce((a, r) => (a[r.level] = (a[r.level] || 0) + 1, a), {});
console.log('current  by level:', JSON.stringify(byLevel('cur')));
console.log('dark2.0  by level:', JSON.stringify(byLevel('d2')));

console.log('\n--- worst 12 in current ---');
summary.rows.filter((r) => r.pane === 'cur' && r.level === 'fail')
  .sort((a, z) => a.cr - z.cr).slice(0, 12)
  .forEach((r) => console.log(`  ${r.cr.toFixed(2).padEnd(6)} "${r.text}"  ${r.detail}`));

console.log('\n--- every badge in dark2.0 (min should be >= 4.5) ---');
const d2 = summary.rows.filter((r) => r.pane === 'd2')
  .sort((a, z) => a.cr - z.cr).slice(0, 10);
d2.forEach((r) => console.log(`  ${r.cr.toFixed(2).padEnd(6)} "${r.text}"`));

await page.screenshot({ path: `${OUT}/dark2-demo-full.png`, fullPage: true });
for (const [v, name] of [['cur', 'current'], ['d2', 'dark2']]) {
  await page.click(`.seg button[data-v=${v}]`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/dark2-demo-${name}.png`, fullPage: false });
}
await page.click('.seg button[data-v=split]');
await page.waitForTimeout(250);
const stack = page.locator('.pane[data-p=cur] .stack').first();
await stack.screenshot({ path: `${OUT}/dark2-demo-stack-current.png` });
await page.locator('.pane[data-p=d2] .stack').first()
  .screenshot({ path: `${OUT}/dark2-demo-stack-dark2.png` });

// section 02 (ramps) + 05 (principles) close-ups, plus a stray-source-code check
const leak = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('.stack, .principles, #blues, #mig')) {
    const txt = el.textContent || '';
    if (/=>|\bconst\b|\bfunction\b|\[object Function\]/.test(txt)) bad.push(txt.slice(0, 70));
  }
  return bad;
});
console.log('template-source leaks:', leak.length ? leak : 'none');
await page.locator('#ramps').screenshot({ path: `${OUT}/dark2-demo-ramps.png` });
await page.locator('#prin').screenshot({ path: `${OUT}/dark2-demo-principles.png` });
await page.locator('#blues').screenshot({ path: `${OUT}/dark2-demo-blues.png` });

console.log('\nconsole errors:', errs.length ? errs : 'none');
await b.close();
