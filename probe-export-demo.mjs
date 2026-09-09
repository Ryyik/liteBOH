import { chromium } from 'playwright';

const file = 'file:///Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/export-preview-v2-demo.html';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const errors = [];

// ---------- 浅色 ----------
const page = await browser.newPage({ viewport: { width: 1080, height: 1400 } });
page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message); errors.push('pageerror: ' + e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(file);
await page.waitForTimeout(600);

const stats = await page.evaluate(() => ({
  records: document.getElementById('stRecords')?.textContent,
  images: document.getElementById('stImages')?.textContent,
  posts: document.querySelectorAll('#view-forum .post').length,
  comments: document.querySelectorAll('#view-forum .comment').length,
  tabs: document.querySelectorAll('.tab').length,
  activeView: document.querySelector('.view.active')?.id
}));
console.log('LIGHT:', JSON.stringify(stats));

await page.screenshot({ path: 'debug-screenshots/export-demo-light.png', clip: { x: 0, y: 0, width: 1080, height: 1400 } });

// 论坛 → Cloud+ → 树洞 → 互动 → 记录 → 文件 逐个切一遍
for (const id of ['cloud', 'treehole', 'activity', 'records', 'files']) {
  await page.click(`.tab[data-tab="${id}"]`);
  await page.waitForTimeout(150);
  const vis = await page.evaluate(() => ({
    tab: document.querySelector('.tab.active')?.dataset.tab,
    view: document.querySelector('.view.active')?.id,
    len: document.querySelector('.view.active')?.innerHTML.length
  }));
  console.log(`TAB ${id}:`, JSON.stringify(vis));
}
await page.click('.tab[data-tab="forum"]');
await page.waitForTimeout(150);

// 搜索
await page.fill('#searchInput', '海');
await page.waitForTimeout(200);
const searchHits = await page.evaluate(() => ({
  line: document.getElementById('searchLine')?.textContent,
  visible: [...document.querySelectorAll('#view-forum .post')].filter((el) => el.style.display !== 'none').length
}));
console.log('SEARCH 海:', JSON.stringify(searchHits));
await page.fill('#searchInput', '');
await page.waitForTimeout(150);

// 灯箱
await page.click('#view-forum .thumb');
await page.waitForTimeout(300);
const lbOpen = await page.evaluate(() => ({
  open: document.getElementById('lightbox').classList.contains('open'),
  cap: document.getElementById('lbCap').textContent
}));
console.log('LIGHTBOX:', JSON.stringify(lbOpen));
await page.screenshot({ path: 'debug-screenshots/export-demo-lightbox.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);

// 展开全文
const expandBtn = page.locator('[data-expand]').first();
if (await expandBtn.count()) {
  await expandBtn.click();
  await page.waitForTimeout(150);
  const expanded = await page.evaluate(() => !document.querySelector('.post-text.clamped'));
  console.log('EXPAND works:', expanded);
}

// ---------- 深色 ----------
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(300);
await page.screenshot({ path: 'debug-screenshots/export-demo-dark.png', clip: { x: 0, y: 0, width: 1080, height: 1400 } });
console.log('DARK screenshot ok');

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
