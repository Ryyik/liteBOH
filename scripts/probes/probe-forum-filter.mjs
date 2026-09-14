import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const restLog = [];
page.on('request', (req) => {
  const url = req.url();
  if (url.includes('/rest/v1/posts?')) {
    const u = new URL(url);
    const kindFilter = u.searchParams.get('post_kind');
    restLog.push({ kindFilter, inFilter: (u.search || '').includes('post_kind.in'), cursor: (u.search || '').includes('created_at.lt') });
  }
  if (url.includes('/rest/v1/rpc/list_forum_posts')) {
    restLog.push({ rpc: true, body: (req.postData() || '').slice(0, 200) });
  }
});

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await page.waitForTimeout(3000);

const countCards = () => page.locator('.posts-list [data-forum-post-id]').count();
const openDropdown = async () => {
  const dd = page.locator('.toolbar-filter-dropdown');
  if (!(await dd.isVisible().catch(() => false))) {
    await page.locator('.toolbar-filter-btn').click();
    await page.waitForTimeout(350);
  }
};
const clickKind = async (label, shot) => {
  await openDropdown();
  const before = restLog.length;
  await page.locator('.filter-dropdown-section', { hasText: '内容类型' }).locator('.filter-tag-btn', { hasText: label }).first().click();
  await page.waitForTimeout(2200);
  const kinds = await page.evaluate(() => {
    return [...document.querySelectorAll('.posts-list [data-forum-post-id]')].slice(0, 14).map((c) => {
      const t = c.textContent || '';
      const badge = c.querySelector('[class*="kind"], [class*="official"], [class*="badge"]')?.textContent?.trim() || '';
      return t.includes('【新闻】') ? 'news' : t.includes('【活动】') ? 'activity' : `post${badge ? '' : ''}`;
    });
  });
  const dist = kinds.reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {});
  const emptyText = await page.locator('.empty-state').innerText().catch(() => '');
  const logSlice = restLog.slice(before, before + 2);
  console.log(`== [${label}] rendered=${await countCards()} first14=${JSON.stringify(dist)} empty="${emptyText.slice(0, 30).replace(/\n/g, ' ')}" rest=${JSON.stringify(logSlice)}`);
  await page.screenshot({ path: `debug-screenshots/ff3-${shot}.png` });
};

await clickKind('新闻', 'news');
await clickKind('活动', 'activity');
await clickKind('论坛', 'post');
await clickKind('全部内容', 'all');

// 筛选态下滚动加载：确认翻页正常且类型不混
await openDropdown();
await page.locator('.filter-dropdown-section', { hasText: '内容类型' }).locator('.filter-tag-btn', { hasText: '活动' }).first().click();
await page.waitForTimeout(1500);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(900);
}
const scrolled = await page.evaluate(() => {
  return [...document.querySelectorAll('.posts-list [data-forum-post-id]')].map((c) => {
    const t = c.textContent || '';
    return t.includes('【新闻】') ? 'news' : t.includes('【活动】') ? 'activity' : 'post';
  });
});
const sd = scrolled.reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {});
console.log('== activity filter after 4 screens scroll: rendered=', scrolled.length, 'dist=', JSON.stringify(sd));
await page.screenshot({ path: 'debug-screenshots/ff3-activity-scrolled.png' });

console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
