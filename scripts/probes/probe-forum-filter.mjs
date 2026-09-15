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

// 登录注入：/user-space 未登录时社区 tab 不渲染论坛（会看到「登录以查看」空态），
// 探针会卡在 .toolbar-filter-btn 上。与 probe-user-space-ia.mjs 同一套做法。
const injectLogin = async (p) => {
  await p.waitForFunction(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
    return pinia && pinia.state.value.auth.isInitialized === true;
  }, null, { timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 6; i += 1) {
    await p.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      pinia.state.value.auth.isLoggedIn = true;
      pinia.state.value.auth.userInfo = {
        id: '3f1c9a54-2b6e-4e2a-9d17-8c4b1f0a2e77',
        username: 'probe_filter',
        role: 'user',
        points: 1024
      };
    });
    await p.waitForTimeout(450);
    const stillIn = await p.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      return !!pinia && pinia.state.value.auth.isLoggedIn === true;
    });
    if (stillIn) break;
  }
  // 登录态就绪 ≠ 页面就绪（index.html 骨架要等 Vue mount + 路由 chunk）
  await p.waitForFunction(() => !!document.querySelector('.forum-main-grid'), null, { timeout: 20000 }).catch(() => {});
};

// 入口：/forum 已退役（routes/community.ts 里它是 redirect → /user-space?tab=posts 的旧路由），
// 论坛现在的唯一入口是 /user-space?tab=community 的内嵌实例
await page.goto('http://localhost:5173/#/user-space?tab=community', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await injectLogin(page);
await page.waitForTimeout(3000);

const countCards = () => page.locator('.posts-list [data-forum-post-id]').count();

// 类型筛选的入口自 2026-09 起从工具栏下拉的「内容类型」分区搬到了页面级六档页签
// （工具栏下拉现在只剩「排序方式」+「标签筛选」，旧的 .filter-dropdown-section 内容类型已不存在）。
// 下推服务端的行为不变，实测：新闻 → post_kind=in.(news)、活动 → in.(activity)、最新 → 不带该参数。
const clickSegTab = (label) => page.evaluate((text) => {
  const groups = Array.from(document.querySelectorAll('.segment-tabs')).filter((t) => t.offsetParent !== null);
  for (const g of groups) {
    const hit = Array.from(g.querySelectorAll('.segment-tab')).find((b) => b.textContent.trim() === text);
    if (hit) { hit.click(); return true; }
  }
  return false;
}, label);

const failures = [];
const clickKind = async (tabLabel, expect, shot) => {
  const before = restLog.length;
  const clicked = await clickSegTab(tabLabel);
  await page.waitForTimeout(2400);
  const kinds = await page.evaluate(() => {
    return [...document.querySelectorAll('.posts-list [data-forum-post-id]')].slice(0, 14).map((c) => {
      const t = c.textContent || '';
      return t.includes('【新闻】') ? 'news' : t.includes('【活动】') ? 'activity' : 'post';
    });
  });
  const dist = kinds.reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {});
  const emptyText = await page.locator('.empty-state').innerText().catch(() => '');
  // 取这次切换后真正带 post_kind 的那条列表请求（id=in.(...) 的补图请求 kindFilter 为 null）
  const hit = restLog.slice(before).find((r) => 'kindFilter' in r && r.kindFilter !== null);
  const pushed = hit ? hit.kindFilter : null;
  const ok = clicked && pushed === expect;
  if (!ok) failures.push(`${tabLabel}: clicked=${clicked} post_kind=${pushed} 期望=${expect}`);
  console.log(`== [${tabLabel}] clicked=${clicked} post_kind=${pushed} 期望=${expect} ${ok ? 'OK' : 'FAIL'} rendered=${await countCards()} 文案分布(信息向，卡片已无【新闻】前缀)=${JSON.stringify(dist)} empty="${emptyText.slice(0, 30).replace(/\n/g, ' ')}"`);
  await page.screenshot({ path: `debug-screenshots/ff3-${shot}.png` });
};

await clickKind('新闻', 'in.(news)', 'news');
await clickKind('活动', 'in.(activity)', 'activity');
await clickKind('最新', null, 'latest');

// 筛选态下滚动加载：确认翻页正常，且后续分页请求仍带着同一个类型筛选。
// 注意：卡片文案里已不再内嵌【新闻】/【活动】前缀，所以「按文案分类」是空判据，
// 这里改为断言请求侧的 post_kind（真判据），文案分布只作信息输出。
await clickSegTab('活动');
await page.waitForTimeout(1500);
const scrollBefore = restLog.length;
const cardsBefore = await countCards();
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(900);
}
const cardsAfter = await countCards();
const pageKinds = restLog.slice(scrollBefore)
  .filter((r) => 'kindFilter' in r && r.kindFilter !== null)
  .map((r) => r.kindFilter);
const badKind = pageKinds.filter((k) => k !== 'in.(activity)');
const rendered = await page.evaluate(() => [...document.querySelectorAll('.posts-list [data-forum-post-id]')].length);
if (badKind.length) failures.push(`活动筛选下翻页请求带了别的 post_kind: ${JSON.stringify(badKind)}`);
if (cardsAfter < cardsBefore) failures.push(`翻页后卡片变少: ${cardsBefore} → ${cardsAfter}`);
console.log(`== activity filter after 4 screens scroll: rendered=${rendered} 分页请求 post_kind=${JSON.stringify(pageKinds)} 卡片 ${cardsBefore}→${cardsAfter}`,
  badKind.length ? 'FAIL' : 'OK');
await page.screenshot({ path: 'debug-screenshots/ff3-activity-scrolled.png' });

console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
if (failures.length) {
  console.log(`\n=== ${failures.length} FAIL ===\n` + failures.join('\n'));
}
await browser.close();
process.exit(failures.length > 0 || errors.length > 0 ? 1 : 0);
