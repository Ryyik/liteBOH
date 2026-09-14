/**
 * probe-post-detail-fix.mjs — 论坛帖子详情两问题复现探针
 * P1: 活动/新闻帖详情无图（列表有图）
 * P2: 多图贴轮播点左无效/无法循环
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const MULTI_POST = '0d33c7f6-47c0-4f70-9205-2fc5d0a4938e';   // 4 图帖
const ACTIVITY_POST = 'd14f113c-f4ba-41aa-b956-c9d391cfabaf'; // activity，cover=@/assets/images/2025-10-shengri.webp
const NEWS_POST = '46700e85-c64c-406d-a3dd-b14056bccfe1';     // news，Cloudinary cover

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const launch = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { browser, page: await ctx.newPage() };
};

const fakeLogin = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const injected = await page.evaluate(() => {
    const vueApp = document.querySelector('#app')?.__vue_app__;
    if (!vueApp) return 'no vue app';
    const pinia = vueApp.config.globalProperties.$pinia;
    if (!pinia) return 'no pinia';
    const auth = pinia._s.get('auth');
    if (!auth) return 'no auth store';
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00000000-0000-0000-0000-00000000abcd',
      username: 'probe_user',
      email: 'probe@example.com',
      role: 'user',
      points: 0
    });
    return 'ok';
  });
  console.log('[fake-login]', injected);
};

// 轮播状态快照
const inspectCarousel = async (page) => {
  return page.evaluate(() => {
    const dots = [...document.querySelectorAll('.post-detail-image-dot')];
    const activeIdx = dots.findIndex((d) => d.classList.contains('active'));
    const img = document.querySelector('.post-detail-image-stage .post-detail-image');
    const prev = document.querySelector('.post-detail-image-nav.prev');
    const next = document.querySelector('.post-detail-image-nav.next');
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    let prevHit = null;
    if (prev) {
      const r = prev.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      prevHit = el
        ? `${(el.className || '').toString().slice(0, 60) || el.tagName} isPrev=${!!el.closest?.('.post-detail-image-nav.prev')}`
        : 'nothing';
    }
    return {
      carouselExists: !!document.querySelector('.post-detail-image-carousel'),
      dotsCount: dots.length,
      activeIdx,
      imgSrc: img ? img.src.slice(0, 120) : null,
      imgLoaded: img ? img.complete && img.naturalWidth > 0 : false,
      prevRect: rectOf(prev),
      nextRect: rectOf(next),
      prevHit,
      prevDisabled: prev ? prev.disabled : null
    };
  });
};

const clickNav = async (page, which) => {
  const btn = page.locator(`.post-detail-image-nav.${which}`);
  if ((await btn.count()) === 0) return false;
  await btn.click({ force: false });
  await sleep(450); // 等 out-in transition 完成
  return true;
};

const run = async () => {
  const { browser, page } = await launch();
  try {
    await fakeLogin(page);

    // ===== P1: 活动/新闻帖详情图片 =====
    for (const [label, id] of [['activity', ACTIVITY_POST], ['news', NEWS_POST]]) {
      await page.goto(`${BASE}/#/forum/post/${id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.post-detail-page', { timeout: 15000 });
      await sleep(2500);
      const state = await inspectCarousel(page);
      console.log(`[P1 ${label}] carousel=${state.carouselExists} dots=${state.dotsCount} imgSrc=${state.imgSrc} loaded=${state.imgLoaded}`);
      await page.screenshot({ path: `debug-screenshots/p1-${label}-detail.png` });
    }

    // ===== P2: 多图帖轮播循环 =====
    await page.goto(`${BASE}/#/forum/post/${MULTI_POST}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.post-detail-image-carousel', { timeout: 15000 });
    await sleep(1500);

    console.log('[P2 initial]', JSON.stringify(await inspectCarousel(page)));

    const seq = ['prev', 'prev', 'next', 'next', 'next', 'next', 'prev'];
    for (const dir of seq) {
      const ok = await clickNav(page, dir);
      const state = await inspectCarousel(page);
      console.log(`[P2 click=${dir} executed=${ok}] activeIdx=${state.activeIdx} dots=${state.dotsCount} imgSrc=${state.imgSrc} prevHit=${state.prevHit}`);
    }
    await page.screenshot({ path: 'debug-screenshots/p2-carousel-final.png' });
  } finally {
    await browser.close();
  }
};

run().catch((e) => { console.error(e); process.exit(1); });
