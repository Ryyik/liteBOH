/**
 * 登录岛宽度探针（只读，不改源码）
 *
 * 用途：横屏（orientation: landscape 且 min-width 769px）点击导航「登录」后，
 *       对比导航胶囊 surface 与登录卡片容器的实测宽度，确认两者是否同宽。
 *
 * 用法（仓库根运行）：node scripts/probes/probe-login-island-width.mjs
 * 环境变量：BASE_URL（默认 http://localhost:5173）、PROBE_OUT（默认 output/login-island-width）
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = process.env.PROBE_OUT || 'output/login-island-width';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { label: '1440x816', width: 1440, height: 816 },
  { label: '1280x800', width: 1280, height: 800 },
  { label: '1024x768', width: 1024, height: 768 },
];

const launchOptions = {
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
};

const browser = await chromium.launch(launchOptions);
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav-login-btn', { timeout: 15000 });
    await page.waitForTimeout(1200);

    await page.click('#nav-login-btn');
    await page.waitForSelector('.boh-login-modal-container', { timeout: 10000 });
    await page.waitForTimeout(1200); // 等过渡（max-width 500ms / 岛入场 560ms）结束

    const data = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          bottom: Math.round(r.bottom), right: Math.round(r.right),
          computedWidth: cs.width, computedMaxWidth: cs.maxWidth, computedHeight: cs.height,
          boxSizing: cs.boxSizing, borderWidth: `${cs.borderTopWidth}/${cs.borderBottomWidth}`,
          marginTop: cs.marginTop, borderTopRadius: cs.borderTopLeftRadius,
          borderBottomRadius: cs.borderBottomLeftRadius, transform: cs.transform,
          background: cs.backgroundColor,
        };
      };
      const nav = document.querySelector('#unified-nav-container .unified-nav-surface');
      const box = document.querySelector('.boh-login-modal-container');
      const overlay = document.querySelector('.boh-login-modal-overlay');
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        navClass: nav ? nav.className : null,
        nav: rect(nav),
        container: rect(box),
        overlay: overlay ? { w: Math.round(overlay.getBoundingClientRect().width), padding: getComputedStyle(overlay).padding } : null,
      };
    });

    await page.screenshot({ path: `${OUT}/${vp.label}.png` });

    // 第二阶段：展开表单，确认 860 宽的岛内不会出现横向溢出
    let form = null;
    if (await page.$('.mobile-login-primary')) {
      await page.click('.mobile-login-primary');
      await page.waitForTimeout(700);
      form = await page.evaluate(() => {
        const box = document.querySelector('.boh-login-modal-container');
        const formEl = document.querySelector('.boh-login-modal-container > .boh-login-form');
        return {
          boxW: Math.round(box.getBoundingClientRect().width),
          boxScrollW: box.scrollWidth,
          boxClientW: box.clientWidth,
          formW: formEl ? Math.round(formEl.getBoundingClientRect().width) : null,
          horizontalOverflow: box.scrollWidth > box.clientWidth + 1,
        };
      });
      await page.screenshot({ path: `${OUT}/${vp.label}-form-open.png` });
    }

    console.log(`\n=== ${vp.label} ===`);
    console.log('nav classes     :', data.navClass);
    console.log('nav rect        :', JSON.stringify(data.nav));
    console.log('container rect  :', JSON.stringify(data.container));
    console.log('overlay         :', JSON.stringify(data.overlay));
    if (data.nav && data.container) {
      const delta = data.container.w - data.nav.w;
      console.log(`宽度差 container-nav = ${delta}px  ${delta === 0 ? '✅ 同宽' : '❌ 不同宽'}`);
      const leftDelta = Math.round(data.container.x - data.nav.x);
      console.log(`左边界差 = ${leftDelta}px  ${leftDelta === 0 ? '✅ 对齐' : '❌ 未对齐'}`);
      const seam = data.container.y - data.nav.bottom;
      console.log(`接缝 卡片上沿-导航下沿 = ${seam}px  ${seam <= 0 ? '✅ 无缝（重叠）' : '❌ 有缝隙'}`);
    }
    if (form) {
      console.log('展开表单        :', JSON.stringify(form),
        form.horizontalOverflow ? '❌ 横向溢出' : '✅ 无横向溢出');
    }
    await ctx.close();
  }

  // 暗色：岛上下一体（两半都应是 #1c1c1e），只跑最宽一档
  const darkCtx = await browser.newContext({ viewport: { width: 1440, height: 816 } });
  await darkCtx.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  const darkPage = await darkCtx.newPage();
  await darkPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await darkPage.waitForSelector('#nav-login-btn', { timeout: 15000 });
  await darkPage.waitForTimeout(1200);
  await darkPage.screenshot({ path: `${OUT}/1440x816-dark-nav-normal.png` });
  const normalNavBg = await darkPage.$eval('#unified-nav-container .unified-nav-surface',
    (el) => getComputedStyle(el).backgroundColor);
  await darkPage.click('#nav-login-btn');
  await darkPage.waitForSelector('.boh-login-modal-container', { timeout: 10000 });
  await darkPage.waitForTimeout(900);
  const dark = await darkPage.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container .unified-nav-surface');
    const box = document.querySelector('.boh-login-modal-container');
    const n = nav.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return {
      theme: document.documentElement.dataset.theme,
      navBg: getComputedStyle(nav).backgroundColor,
      boxBg: getComputedStyle(box).backgroundColor,
      sameWidth: Math.round(n.width) === Math.round(b.width),
    };
  });
  await darkPage.screenshot({ path: `${OUT}/1440x816-dark.png` });
  console.log('\n=== 1440x816 dark ===');
  console.log(`常态导航底色（应仍为 rgba(20,27,37,0.9)）: ${normalNavBg}`);
  console.log(JSON.stringify(dark), dark.sameWidth && dark.navBg === dark.boxBg ? '✅ 上下一体' : '❌ 两半不一致');
  await darkCtx.close();
} finally {
  await browser.close();
}
console.log(`\n截图目录：${OUT}`);
