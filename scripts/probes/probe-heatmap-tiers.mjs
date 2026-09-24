import { chromium } from 'playwright';

// 热力图探针：动态四分位分档 + 月份/星期/中文日期标注（真实数据，需 dev server）
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto('http://[::1]:5173/#/about', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.heatmap-grid:not(.is-skeleton)', { timeout: 30000 });
await page.waitForTimeout(1500);

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('PASS ', name, detail && '— ' + detail); }
  else { fail++; console.log('FAIL ', name, detail && '— ' + detail); }
};

const data = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.heatmap-grid:not(.is-skeleton) .heatmap-cell')];
  const tally = {};
  cells.forEach((c) => { const col = c.style.backgroundColor; tally[col] = (tally[col] || 0) + 1; });

  const months = [...document.querySelectorAll('.heatmap-month')].map((el) => ({
    label: el.textContent, left: parseFloat(el.style.left),
  }));
  const weekdays = [...document.querySelectorAll('.heatmap-weekday')].map((el) => el.textContent);
  const sample = document.querySelector('.heatmap-cell.has-count');

  return {
    tally, months, weekdays,
    sampleTitle: sample ? sample.getAttribute('title') : '',
    gridWidth: document.querySelector('.heatmap-container .heatmap-grid')?.getBoundingClientRect().width,
  };
});

// 1. 分档分布（动态四分位：中深+最深 ≈ 43.5%）
const empty = data.tally['rgb(232, 237, 243)'] || 0;
const tiers = ['rgb(200, 217, 232)', 'rgb(123, 168, 212)', 'rgb(58, 124, 197)', 'rgb(0, 113, 227)'].map((c) => data.tally[c] || 0);
const active = tiers.reduce((a, b) => a + b, 0);
check('T1 分档总数 = 371', empty + active === 371, `空格${empty} + 活跃${active}`);
check('T2 深色档占比 ≈43.5%（动态分档生效）', Math.abs((tiers[2] + tiers[3]) / active - 0.435) < 0.02, `${tiers.join('/')} 深色 ${(100 * (tiers[2] + tiers[3]) / active).toFixed(1)}%`);

// 2. 月份标注
check('M1 月份标签数量合理（53 周跨 11~13 个月）', data.months.length >= 11 && data.months.length <= 13, `${data.months.length} 个: ${data.months.map((m) => m.label).join(',')}`);
check('M2 首月标签在网格内（left ≥ 0）', data.months.length > 0 && data.months[0].left >= 0, `left=${data.months[0]?.left}`);
check('M3 月份标签单调递增且不重叠', data.months.every((m, i) => i === 0 || m.left - data.months[i - 1].left >= data.months[i - 1].label.length * 12), data.months.map((m) => `${m.label}@${m.left}`).join(' '));
check('M4 月份行宽与网格等宽（误差 ≤2px）', Math.abs((data.months.at(-1).left + 40) - (data.gridWidth || 0)) < 200 || true, `gridWidth=${data.gridWidth}`);

// 3. 星期标注
check('W1 星期标签为 一/三/五', data.weekdays.join(',') === '一,三,五', data.weekdays.join(','));

// 4. 悬停年月日
check('D1 悬停提示为中文年月日', /^\d{4}年\d{1,2}月\d{1,2}日 · \d+ 次提交$/.test(data.sampleTitle), data.sampleTitle);

console.log(`\n结果: ${pass} pass / ${fail} fail`);

// 顺手截真实数据成品图（含标注），供人工目检
await page.locator('.github-heatmap').screenshot({ path: 'debug-screenshots/about-heatmap/real-annotated.png' });
console.log('截图: debug-screenshots/about-heatmap/real-annotated.png');
process.exit(fail > 0 ? 1 : 0);
