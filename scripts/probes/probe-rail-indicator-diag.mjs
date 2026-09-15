import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/#/user-space', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
await page.waitForFunction(() => {
  const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
  return pinia && pinia.state.value.auth.isInitialized === true;
}, null, { timeout: 15000 }).catch(() => {});
for (let i = 0; i < 6; i += 1) {
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    pinia.state.value.auth.userInfo = { id: '3f1c9a54-2b6e-4e2a-9d17-8c4b1f0a2e77', username: 'diag', role: 'user', points: 1 };
  }).catch(() => {});
  await page.waitForTimeout(500);
  if (await page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
    return !!pinia && pinia.state.value.auth.isLoggedIn === true;
  }).catch(() => false)) break;
}
await page.waitForFunction(() => !!document.querySelector('.user-space-page'), null, { timeout: 20000 }).catch(() => {});
await page.waitForFunction(() => !!document.querySelector('.userspace-rail.liquid-glass'), null, { timeout: 20000 }).catch(() => {});
if (!await page.evaluate(() => !!document.querySelector('.userspace-rail.liquid-glass')).catch(() => false)) {
  console.log('[diag] rail not rendered; url =', page.url());
  console.log('[diag] errors:', JSON.stringify(pageErrors.slice(0, 10), null, 2));
  await page.screenshot({ path: 'debug-screenshots/rail-diag-stuck.png' });
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1500);

const diag = await page.evaluate(() => {
  const rail = document.querySelector('.userspace-rail.liquid-glass');
  const ind = document.querySelector('.userspace-rail-indicator');
  const railCs = getComputedStyle(rail);
  const cs = ind ? getComputedStyle(ind) : null;
  const activeItem = document.querySelector('.userspace-rail-item.active');
  return {
    railBackdrop: railCs.backdropFilter,
    indicatorExists: !!ind,
    indicatorBackdrop: cs ? cs.backdropFilter : 'ABSENT',
    indicatorBg: cs ? cs.backgroundColor : 'ABSENT',
    indicatorOpacity: cs ? cs.opacity : 'ABSENT',
    indicatorTransform: cs ? cs.transform : 'ABSENT',
    indicatorZIndex: cs ? cs.zIndex : 'ABSENT',
    activeItemBg: activeItem ? getComputedStyle(activeItem).backgroundColor : 'ABSENT',
    blurSmVar: cs ? cs.getPropertyValue('--liquid-blur-sm').trim() : 'ABSENT',
    filterSmVar: cs ? cs.getPropertyValue('--liquid-filter-sm').trim() : 'ABSENT',
    innerHighlightVar: cs ? cs.getPropertyValue('--liquid-inner-highlight').trim().slice(0, 80) : 'ABSENT',
    perfLite: document.documentElement.classList.contains('boh-perf-lite') || document.body.classList.contains('boh-perf-lite'),
    htmlClasses: document.documentElement.className,
    bodyClasses: document.body.className,
    reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    ancestorBackdropChain: (() => {
      const chain = [];
      let el = ind ? ind.parentElement : null;
      while (el) {
        const c = getComputedStyle(el);
        if (c.backdropFilter && c.backdropFilter !== 'none') chain.push(`${el.className.split(' ')[0]}:bf`);
        if (c.filter && c.filter !== 'none') chain.push(`${el.className.split(' ')[0]}:filter`);
        if (c.opacity !== '1') chain.push(`${el.className.split(' ')[0]}:opacity=${c.opacity}`);
        el = el.parentElement;
      }
      return chain;
    })()
  };
});
console.log(JSON.stringify(diag, null, 2));

const railEl = await page.$('.userspace-rail');
if (railEl) await railEl.screenshot({ path: 'debug-screenshots/rail-indicator-material.png' });
await browser.close();
