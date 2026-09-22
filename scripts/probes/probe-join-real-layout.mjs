import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)); });

await page.goto(`${BASE}/#/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForSelector('.join-card', { timeout: 20000 });
await page.waitForTimeout(1800);

const info = await page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const nav = document.querySelector('nav, .unified-nav, header');
  const navCs = nav ? getComputedStyle(nav) : null;
  return {
    navbar: nav ? { tag: nav.tagName, cls: (nav.className || '').toString().slice(0, 40), pos: navCs.position, h: Math.round(nav.getBoundingClientRect().height), bottom: Math.round(nav.getBoundingClientRect().bottom) } : null,
    card: r('.join-card'),
    hero: r('.join-hero'),
    heroNatural: (() => { const i = document.querySelector('.join-hero'); return i ? `${i.naturalWidth}x${i.naturalHeight}` : null; })(),
    asidePanel: r('.join-panel'),
    main: r('.join-main'),
    terms: r('.join-terms'),
    footer: r('footer'),
    cardFilter: getComputedStyle(document.querySelector('.join-card')).backdropFilter,
    innerBlur: [...document.querySelectorAll('.join-card *')].filter((el) => {
      const f = getComputedStyle(el).backdropFilter;
      return f && f !== 'none';
    }).map((el) => (el.className || el.tagName).toString().slice(0, 26)),
    steps: document.querySelectorAll('.join-step').length,
    bodyScrollH: document.documentElement.scrollHeight,
  };
});
console.log(JSON.stringify(info, null, 2));
if (errors.length) console.log('errors:', errors.slice(0, 5));

await page.screenshot({ path: `${OUT}/real-join-full.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/real-join-top.png`, clip: { x: 0, y: 0, width: 1440, height: 520 } });
await browser.close();

// 窄屏（导航形态与桌面不同）
const browser2 = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const m = await (await browser2.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
})).newPage();
await m.goto(`${BASE}/#/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await m.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await m.waitForSelector('.join-card', { timeout: 20000 });
await m.waitForTimeout(1800);
const minfo = await m.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const nav = document.querySelector('.unified-nav');
  return {
    navbar: nav ? { pos: getComputedStyle(nav).position, h: Math.round(nav.getBoundingClientRect().height), bottom: Math.round(nav.getBoundingClientRect().bottom) } : null,
    card: r('.join-card'),
    aside: r('.join-aside'),
    asidePanel: r('.join-panel'),
    main: r('.join-main'),
    terms: r('.join-terms'),
    scrollH: document.documentElement.scrollHeight,
    innerBlur: [...document.querySelectorAll('.join-card *')].filter((el) => {
      const f = getComputedStyle(el).backdropFilter;
      return f && f !== 'none';
    }).map((el) => (el.className || el.tagName).toString().slice(0, 24)),
    gridCols: getComputedStyle(document.querySelector('.join-card')).gridTemplateColumns,
  };
});
console.log('--- mobile 390 ---');
console.log(JSON.stringify(minfo, null, 2));
await m.screenshot({ path: `${OUT}/real-join-mobile.png`, fullPage: false });
await browser2.close();
