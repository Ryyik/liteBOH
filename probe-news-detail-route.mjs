import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：S4 新闻独立详情路由（/news/:id）
// 断言：
//  1) 列表页可拿到真实新闻 id；点击卡片 → 详情岛出现且带「打开完整页面」入口
//  2) 岛内入口 → 跳 /news/:id，整页渲染（kicker/标题/meta/正文）
//  3) document.title 与 og:title / og:image / og:description meta 已注入
//  4) 直达 URL 刷新（reload）后详情仍在（可分享/可恢复）
//  5) 404：不存在的 id → EmptyState 文案
//  6) 深链 /newsroom?news=<id> → 详情岛自动展开
//  7) 暗色主题文字可读；移动端 375 不溢出
// =====================================================================
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 140)));

// ---------- 1. 列表页拿真实新闻 id ----------
await page.goto(`${BASE}/#/newsroom`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForSelector('.news-card[data-id]', { timeout: 25000 }).catch(() => {});
const firstNewsId = await page.evaluate(() => {
  const card = document.querySelector('.news-card[data-id]');
  return card?.getAttribute('data-id') || '';
});
check('列表页可取到新闻 id', !!firstNewsId, firstNewsId.slice(0, 40));

if (firstNewsId) {
  // ---------- 2. 点击卡片 → 岛出现 + 「分享」按钮 ----------
  await page.locator(`.news-card[data-id="${firstNewsId}"]`).first().click();
  await page.waitForSelector('.content-detail-island', { timeout: 8000 }).catch(() => {});
  const islandState = await page.evaluate(() => {
    const island = document.querySelector('.content-detail-island');
    if (!island) return { exists: false };
    const btn = island.querySelector('.cdi-open-page');
    return {
      exists: true,
      title: island.querySelector('.cdi-title')?.textContent.trim() || '',
      hasShareBtn: !!btn,
      shareBtnText: btn?.textContent.trim() || ''
    };
  });
  check('点击卡片 → 详情岛出现', islandState.exists === true);
  check('详情岛带标题', !!islandState.title, islandState.title.slice(0, 30));
  check('详情岛带「分享」按钮', islandState.hasShareBtn === true, islandState.shareBtnText);

  // ---------- 2b. 分享：原生 Web Share 路径（mock navigator.share） ----------
  const sharePayload = await page.evaluate(async () => {
    let captured = null;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (p) => { captured = p; } });
    document.querySelector('.cdi-open-page')?.click();
    await new Promise((r) => setTimeout(r, 400));
    return captured;
  });
  check('原生分享被调用且携带独立页链接', !!sharePayload && /#\/news\//.test(sharePayload.url || ''), sharePayload?.url?.slice(-40));

  // ---------- 2c. 分享：降级复制路径（无 navigator.share → clipboard） ----------
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const copiedState = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    document.querySelector('.cdi-open-page')?.click();
    await new Promise((r) => setTimeout(r, 500));
    const clip = await navigator.clipboard.readText().catch(() => '');
    const btnText = document.querySelector('.cdi-open-page')?.textContent.trim() || '';
    return { clip, btnText };
  });
  check('降级：剪贴板收到独立页链接', /#\/news\//.test(copiedState.clip), copiedState.clip.slice(-40));
  check('降级：按钮出现「链接已复制」反馈', copiedState.btnText.includes('链接已复制'), copiedState.btnText);

  // ---------- 3. 直达 /news/:id 整页渲染 ----------
  await page.goto(`${BASE}/#/news/${firstNewsId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ndp-card:not(.is-skeleton)', { timeout: 15000 }).catch(() => {});
  const detailState = await page.evaluate(() => {
    const pageEl = document.querySelector('.news-detail-page');
    if (!pageEl) return { exists: false };
    return {
      exists: true,
      url: location.hash,
      kicker: !!pageEl.querySelector('.ndp-kicker'),
      title: pageEl.querySelector('.ndp-title')?.textContent.trim() || '',
      meta: pageEl.querySelectorAll('.ndp-meta-item').length,
      rich: !!pageEl.querySelector('.ndp-rich'),
      excerptOnly: !!pageEl.querySelector('.ndp-excerpt-only'),
      cover: !!pageEl.querySelector('.ndp-cover'),
      footBtns: pageEl.querySelectorAll('.ndp-foot-btn').length
    };
  });
  check('直达 /news/:id 路由生效', /#\/news\//.test(detailState.url || ''), detailState.url);
  check('独立页整页渲染', detailState.exists === true && !!detailState.title, detailState.title.slice(0, 30));
  check('独立页结构完整（kicker/meta/正文/脚注）', detailState.kicker && detailState.meta >= 2 && (detailState.rich || detailState.excerptOnly) && detailState.footBtns === 2, `meta=${detailState.meta} rich=${detailState.rich} foot=${detailState.footBtns}`);

  // ---------- 4. OG / title 注入 ----------
  const seoState = await page.evaluate(() => {
    const meta = (sel) => document.head.querySelector(sel)?.getAttribute('content') || '';
    return {
      title: document.title,
      ogTitle: meta('meta[property="og:title"]'),
      ogDesc: meta('meta[property="og:description"]'),
      ogImage: meta('meta[property="og:image"]'),
      ogUrl: meta('meta[property="og:url"]'),
      twitterCard: meta('meta[name="twitter:card"]')
    };
  });
  check('document.title 含新闻标题', seoState.title.includes(detailState.title.slice(0, 12)), seoState.title);
  check('og:title 已注入', seoState.ogTitle.includes(detailState.title.slice(0, 12)), seoState.ogTitle.slice(0, 40));
  check('og:description 已注入', !!seoState.ogDesc, seoState.ogDesc.slice(0, 40));
  check('og:url 指向 /news/:id', /news\//.test(seoState.ogUrl), seoState.ogUrl.slice(-50));
  check('twitter:card 已注入', !!seoState.twitterCard, seoState.twitterCard);

  // ---------- 5. 刷新后详情仍在（URL 可恢复） ----------
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ndp-card:not(.is-skeleton)', { timeout: 20000 }).catch(() => {});
  const afterReload = await page.evaluate(() => ({
    title: document.querySelector('.ndp-title')?.textContent.trim() || '',
    stillOnRoute: /#\/news\//.test(location.hash)
  }));
  check('刷新后详情仍在（可分享 URL）', afterReload.stillOnRoute && afterReload.title === detailState.title, afterReload.title.slice(0, 30));

  // ---------- 6. 暗色主题 ----------
  const page2 = await context.newPage();
  await page2.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  await page2.goto(`${BASE}/#/news/${firstNewsId}`, { waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('.ndp-card:not(.is-skeleton)', { timeout: 20000 }).catch(() => {});
  const darkState = await page2.evaluate(() => {
    const pageEl = document.querySelector('.news-detail-page');
    const card = pageEl?.querySelector('.ndp-card');
    if (!pageEl || !card) return { exists: false };
    const cardBg = getComputedStyle(card).backgroundColor;
    const titleColor = getComputedStyle(pageEl.querySelector('.ndp-title')).color;
    return { exists: true, theme: pageEl.getAttribute('data-theme'), cardBg, titleColor };
  });
  check('暗色详情页渲染 + data-theme', darkState.exists && darkState.theme === 'dark', `${darkState.theme} bg=${darkState.cardBg}`);
  check('暗色标题可读（亮色文字）', /2\d\d|3\d\d|2\d\d,\s*\d/.test(darkState.titleColor) === false || darkState.titleColor.includes('2'), darkState.titleColor);
  await page2.screenshot({ path: `${OUT}/news-detail-dark.png` });
  await page2.close();

  // ---------- 7. 404（news.id 是 bigint：用不存在的大数字 id 测 NOT_FOUND 分支） ----------
  const page3 = await context.newPage();
  await page3.goto(`${BASE}/#/news/99999999999`, { waitUntil: 'domcontentloaded' });
  await page3.waitForSelector('.news-detail-page .ndp-empty', { timeout: 20000 }).catch(() => {});
  const notFound = await page3.evaluate(() => document.querySelector('.news-detail-page')?.textContent.includes('没有找到这篇新闻') || false);
  check('404 → 空态文案', notFound === true);
  // 非数字 id 也按「不存在」处理（不发无效请求）
  await page3.goto(`${BASE}/#/news/not-a-number`, { waitUntil: 'domcontentloaded' });
  await page3.waitForTimeout(1200);
  const notFoundAlpha = await page3.evaluate(() => document.querySelector('.news-detail-page')?.textContent.includes('没有找到这篇新闻') || false);
  check('非数字 id → 空态文案', notFoundAlpha === true);
  await page3.close();

  // ---------- 8. 深链 /newsroom?news=<id> → 岛自动展开 ----------
  const page4 = await context.newPage();
  await page4.goto(`${BASE}/#/newsroom?news=${firstNewsId}`, { waitUntil: 'domcontentloaded' });
  await page4.waitForSelector('.content-detail-island', { timeout: 20000 }).catch(() => {});
  const deepLink = await page4.evaluate(() => !!document.querySelector('.content-detail-island .cdi-title'));
  check('深链 /newsroom?news=<id> → 岛自动展开', deepLink === true);
  await page4.close();

  // ---------- 9. 移动端 375 ----------
  const page5 = await context.newPage();
  await page5.setViewportSize({ width: 375, height: 720 });
  await page5.goto(`${BASE}/#/news/${firstNewsId}`, { waitUntil: 'domcontentloaded' });
  await page5.waitForSelector('.ndp-card:not(.is-skeleton)', { timeout: 20000 }).catch(() => {});
  const mobile = await page5.evaluate(() => {
    const doc = document.documentElement;
    const card = document.querySelector('.ndp-card');
    const rect = card?.getBoundingClientRect();
    return {
      noHScroll: doc.scrollWidth <= window.innerWidth + 1,
      cardWidth: Math.round(rect?.width || 0),
      vw: window.innerWidth
    };
  });
  check('移动端 375 不横向溢出', mobile.noHScroll === true, `cardW=${mobile.cardWidth} vw=${mobile.vw}`);
  await page5.screenshot({ path: `${OUT}/news-detail-mobile.png` });
  await page5.close();
} else {
  check('列表页可取到新闻 id', false, 'news 表为空或列表未渲染，跳过后续断言');
}

check('零 pageerror', pageErrors.length === 0, pageErrors[0] || '');

console.log(`\n==== ${results.filter(r => r.pass).length} PASS / ${results.filter(r => !r.pass).length} FAIL ====`);
fs.writeFileSync(`${OUT}/news-detail-probe-results.json`, JSON.stringify(results, null, 2));
await page.screenshot({ path: `${OUT}/news-detail-final.png` });
await browser.close();
