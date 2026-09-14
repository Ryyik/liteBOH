import { chromium } from 'playwright';

// 探针：新闻/活动详情灵动岛 + 管理员投稿弹窗（玻璃/层级/上传入口）
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

const injectRole = (role) => page.evaluate((r) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
  if (pinia.state.value.auth.userInfo) pinia.state.userInfo && (pinia.state.value.auth.userInfo.role = r);
  if (pinia.state.value.auth.userInfo) pinia.state.value.auth.userInfo.role = r;
}, role);

const navMetrics = () => page.evaluate(() => {
  const surface = document.querySelector('.unified-nav-surface');
  const island = document.querySelector('.content-detail-island');
  return {
    surfaceH: surface ? Math.round(surface.getBoundingClientRect().height) : -1,
    hasCustom: surface ? surface.classList.contains('has-custom-card') : false,
    islandOpen: !!island
  };
});

// ===== 1) Newsroom 详情岛：开 → surface 撑开，关 → 完全复原 =====
await page.goto('http://localhost:5173/#/newsroom', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await page.waitForTimeout(3000);

const before = await navMetrics();
console.log('[newsroom] before open:', JSON.stringify(before));

await page.locator('.news-card').first().click();
await page.waitForTimeout(900);
const open = await navMetrics();
console.log('[newsroom] after open:', JSON.stringify(open), '(expect islandOpen=true, hasCustom=true, surfaceH>before)');
await page.screenshot({ path: 'debug-screenshots/island-1-news-open.png' });

await page.keyboard.press('Escape');
await page.waitForTimeout(900);
const afterClose = await navMetrics();
const restored = Math.abs(afterClose.surfaceH - before.surfaceH) <= 4;
console.log('[newsroom] after close:', JSON.stringify(afterClose), '| restored:', restored, '(expect true)');
await page.screenshot({ path: 'debug-screenshots/island-2-news-closed.png' });

// ===== 2) 活动详情岛 =====
await page.goto('http://localhost:5173/#/activities-wall', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const actBefore = await navMetrics();
await page.locator('.activity-card:not(.activity-card-skeleton)').first().click();
await page.waitForTimeout(900);
const actOpen = await navMetrics();
console.log('[activities] open:', JSON.stringify(actOpen), '(expect islandOpen=true)');
await page.screenshot({ path: 'debug-screenshots/island-3-activity-open.png' });

await page.keyboard.press('Escape');
await page.waitForTimeout(900);
const actAfter = await navMetrics();
const actRestored = Math.abs(actAfter.surfaceH - actBefore.surfaceH) <= 4;
console.log('[activities] closed:', JSON.stringify(actAfter), '| restored:', actRestored, '(expect true)');

// ===== 3) 管理员投稿弹窗：玻璃 + 盖住导航栏 + 上传入口 =====
await injectRole('admin');
await page.waitForTimeout(500);
const pubBtns = await page.locator('.activity-admin-publish-btn:visible').count();
console.log('[activities] admin publish btn (expect 1):', pubBtns);
await page.locator('.activity-admin-publish-btn').first().click();
await page.waitForTimeout(800);

const modalState = await page.evaluate(() => {
  const overlay = document.querySelector('.admin-publish-overlay');
  if (!overlay) return null;
  const z = getComputedStyle(overlay).zIndex;
  const modal = overlay.querySelector('.admin-publish-modal');
  const rect = modal.getBoundingClientRect();
  // 弹窗顶边中心点命中的元素应属于弹窗自身（而非被导航栏盖住）
  const topEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 4);
  return {
    z,
    glass: getComputedStyle(modal).backdropFilter !== 'none',
    uploadBtn: !!overlay.querySelector('.ap-upload'),
    coveredByNav: !!topEl && !overlay.contains(topEl) && !!topEl.closest('#unified-nav-container')
  };
});
console.log('[modal]', JSON.stringify(modalState), '(expect z=10002, glass=true, uploadBtn=true, coveredByNav=false)');
await page.screenshot({ path: 'debug-screenshots/island-4-publish-modal.png' });

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('pageerrors:', errors.length ? errors.slice(0, 4) : 'none');
await context.close();
await browser.close();
