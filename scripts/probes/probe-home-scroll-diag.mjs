import { chromium } from 'playwright';

// 首页滚动诊断探针（bug: 下滑内容显示不全 / 始终加载中 / 滚动卡顿）
// 用法: node probe-home-scroll-diag.mjs [mobile|desktop|both]

const BASE = 'http://localhost:5173';
const mode = process.argv[2] || 'both';

const diagnose = async (page, label) => {
  return page.evaluate((tag) => {
    const rows = [...document.querySelectorAll('.home-hero-row')];
    const rowInfo = rows.map((row, i) => {
      const inner = row.querySelector('.home-hero-row-inner');
      const childCount = inner ? inner.children.length : -1;
      const cs = getComputedStyle(row);
      const rect = row.getBoundingClientRect();
      return {
        i,
        cls: row.className.replace('home-hero-row', '').trim(),
        intrinsic: row.getAttribute('data-intrinsic') || '',
        childCount,
        h: Math.round(rect.height),
        top: Math.round(rect.top + window.scrollY),
        cv: cs.contentVisibility,
      };
    });
    const fadeSections = [...document.querySelectorAll('.fade-section')];
    const fadeHidden = fadeSections.filter((el) => !el.classList.contains('visible')).length;
    const heroLoading = !!document.querySelector('.home-hero-loading');
    const heroContentRows = document.querySelectorAll('.home-hero-content .home-hero-row').length;
    return {
      tag,
      scrollY: Math.round(window.scrollY),
      pageH: document.documentElement.scrollHeight,
      viewportH: window.innerHeight,
      heroLoading,
      heroContentRows,
      rows: rowInfo,
      fadeSections: fadeSections.length,
      fadeHidden,
      footer: !!document.querySelector('.home-footer'),
      footerTop: (() => {
        const f = document.querySelector('.home-footer');
        return f ? Math.round(f.getBoundingClientRect().top + window.scrollY) : -1;
      })(),
    };
  }, label);
};

const runViewport = async (browser, label, viewport, userAgent) => {
  const page = await browser.newPage({ viewport, userAgent });
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`));

  const t0 = Date.now();
  await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000); // 等英雄区加载 + 空闲预热窗口（300ms + idle 2.5s 上限）

  const d0 = await diagnose(page, label + '@top');
  console.log(`\n===== ${label} 顶部 =====`);
  console.log(JSON.stringify(d0, null, 1));

  // 逐步滚动到底，记录每步可见的行渲染情况
  const steps = 8;
  for (let s = 1; s <= steps; s += 1) {
    await page.evaluate((frac) => {
      const target = (document.documentElement.scrollHeight - window.innerHeight) * frac;
      window.scrollTo({ top: target, behavior: 'instant' });
    }, s / steps);
    await page.waitForTimeout(700);
  }

  const d1 = await diagnose(page, label + '@bottom');
  console.log(`\n===== ${label} 滚到底后 =====`);
  console.log(JSON.stringify(d1, null, 1));

  // 视口截图：滚到底的状态
  await page.screenshot({ path: `debug-screenshots/home-scroll-diag-${label}.png` });

  // 中段截图：滚回 1.5~2.5 viewport 处看是否有空白带
  await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.5, behavior: 'instant' }));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `debug-screenshots/home-scroll-diag-${label}-mid.png` });

  console.log(`\n----- ${label} 页面错误 (${pageErrors.length}) -----`);
  pageErrors.slice(0, 10).forEach((e) => console.log('PAGEERROR:', e));
  console.log(`----- ${label} 控制台错误 (${consoleErrors.length}) -----`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('CONSOLE:', e));
  console.log(`----- ${label} 请求失败 (${failedRequests.length}) -----`);
  failedRequests.slice(0, 15).forEach((e) => console.log('REQFAIL:', e));
  console.log(`[${label}] 总耗时 ${Date.now() - t0}ms`);

  await page.close();
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

if (mode === 'both' || mode === 'desktop') {
  await runViewport(browser, 'desktop', { width: 1440, height: 900 }, undefined);
}
if (mode === 'both' || mode === 'mobile') {
  await runViewport(
    browser,
    'mobile',
    { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  );
}

await browser.close();
console.log('\nDONE');
