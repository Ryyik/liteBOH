/**
 * probe-post-detail-verify.mjs — 修复后验证
 * P1: 活动/新闻帖详情显示封面图（@/assets 引用 + Cloudinary cover 两种）
 * P2: 大图查看器 prev/next 双向可点且循环；详情页轮播循环回归
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const MULTI_POST = '0d33c7f6-47c0-4f70-9205-2fc5d0a4938e';   // 4 图帖
const ACTIVITY_ASSET = 'd14f113c-f4ba-41aa-b956-c9d391cfabaf'; // activity，cover=@/assets/images/2025-10-shengri.webp
const ACTIVITY_CLOUD = 'ae022a7a-dd22-4d6a-9790-dace1e457c0b'; // activity，Cloudinary cover
const NEWS_CLOUD = '46700e85-c64c-406d-a3dd-b14056bccfe1';     // news，Cloudinary cover

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await sleep(1800);
await page.evaluate(() => {
  const vueApp = document.querySelector('#app')?.__vue_app__;
  const auth = vueApp?.config?.globalProperties?.$pinia?._s?.get('auth');
  auth.isLoggedIn = true;
  Object.assign(auth.userInfo, { id: '00000000-0000-0000-0000-00000000abcd', username: 'probe_user', email: 'probe@example.com', role: 'user', points: 0 });
});

const openDetail = async (id) => {
  await page.goto(`${BASE}/#/forum/post/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.post-detail-page', { timeout: 20000 });
  // 等数据落定：轮播/空态/失效态三者任一出现（骨架消失）
  await page.waitForFunction(
    () => document.querySelector('.post-detail-image-carousel, .empty-state, .post-detail-skeleton ~ * , .x-post-card'),
    null,
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForFunction(
    () => !document.querySelector('.post-detail-skeleton'),
    null,
    { timeout: 20000 }
  ).catch(() => {});
  await sleep(600);
};

const carouselInfo = () => page.evaluate(() => {
  const img = document.querySelector('.post-detail-image-stage .post-detail-image');
  return {
    carousel: !!document.querySelector('.post-detail-image-carousel'),
    dots: document.querySelectorAll('.post-detail-image-dot').length,
    imgSrc: img ? img.src.slice(0, 130) : null,
    loaded: img ? img.complete && img.naturalWidth > 0 : false,
    natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null
  };
});

// ===== P1 =====
for (const [label, id] of [
  ['activity(@/assets cover)', ACTIVITY_ASSET],
  ['activity(cloud cover)', ACTIVITY_CLOUD],
  ['news(cloud cover)', NEWS_CLOUD]
]) {
  await openDetail(id);
  // 等图片真正加载完成（naturalWidth > 0），最多 15s
  await page.waitForFunction(() => {
    const img = document.querySelector('.post-detail-image-stage .post-detail-image');
    return !!img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 15000 }).catch(() => {});
  const info = await carouselInfo();
  if (!info.carousel || !info.loaded) {
    const diag = await page.evaluate(() => ({
      skeleton: !!document.querySelector('.post-detail-skeleton'),
      empty: !!document.querySelector('.empty-state'),
      title: document.querySelector('.post-detail-title')?.textContent?.trim()?.slice(0, 40) || null
    }));
    console.log('   [diag]', JSON.stringify(diag));
  }
  check(`P1 ${label}: 详情显示图片`, info.carousel && info.loaded, `src=${info.imgSrc} natural=${info.natural}`);
  await page.screenshot({ path: `debug-screenshots/verify-p1-${label.replace(/[()/@ ]/g, '_')}.png` });
}

// ===== P2：大图查看器 prev/next 双向 + 循环 =====
await openDetail(MULTI_POST);
const viewerSnapshot = () => page.evaluate(() => ({
  open: !!document.querySelector('.detail-image-viewer'),
  count: document.querySelector('.detail-image-viewer-count')?.textContent?.trim() || ''
}));

// 先用轮播 dots 回到第 1 张再打开查看器
await page.locator('.post-detail-image-dot').first().click();
await sleep(400);
await page.locator('.post-detail-image-link').click();
await sleep(800);
check('P2 查看器打开于第 1 张', (await viewerSnapshot()).count === '1 / 4', (await viewerSnapshot()).count);

// prev：1 → 4（循环）——修复点：此前被图片盖住点不了
await page.locator('.detail-image-viewer-nav.prev').click({ timeout: 5000 });
await sleep(450);
check('P2 查看器 prev 可点（1→4 循环）', (await viewerSnapshot()).count === '4 / 4', (await viewerSnapshot()).count);

await page.locator('.detail-image-viewer-nav.prev').click({ timeout: 5000 });
await sleep(450);
check('P2 查看器 prev 连续（4→3）', (await viewerSnapshot()).count === '3 / 4', (await viewerSnapshot()).count);

await page.locator('.detail-image-viewer-nav.next').click({ timeout: 5000 });
await sleep(450);
check('P2 查看器 next 可点（3→4）', (await viewerSnapshot()).count === '4 / 4', (await viewerSnapshot()).count);

await page.locator('.detail-image-viewer-nav.next').click({ timeout: 5000 });
await sleep(450);
check('P2 查看器 next 循环（4→1）', (await viewerSnapshot()).count === '1 / 4', (await viewerSnapshot()).count);

await page.screenshot({ path: 'debug-screenshots/verify-p2-viewer.png' });
await page.locator('.detail-image-viewer-close').click();
await sleep(400);

// ===== P2 回归：详情页轮播 prev/next 循环 =====
const dotIndex = () => page.evaluate(() => {
  const dots = [...document.querySelectorAll('.post-detail-image-dot')];
  return dots.findIndex((d) => d.classList.contains('active'));
});
await page.locator('.post-detail-image-dot').first().click();
await sleep(400);
await page.locator('.post-detail-image-nav.prev').click();
await sleep(420);
check('P2 详情轮播 prev 循环（0→3）', (await dotIndex()) === 3, `idx=${await dotIndex()}`);
await page.locator('.post-detail-image-nav.next').click();
await sleep(420);
check('P2 详情轮播 next 回绕（3→0）', (await dotIndex()) === 0, `idx=${await dotIndex()}`);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
process.exit(failed.length ? 1 : 0);
