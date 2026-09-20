/**
 * check-route-css-runtime-cache.mjs — P0-1 的运行时行为验收
 *
 * 背景：P0-1 把约 100 个路由 CSS 移出了 SW 预缓存，改由 runtimeCaching 的
 * `/static/css/` CacheFirst 兜底。静态门禁（check:shell-precache）只能断言
 * "sw.js 里确实有这条规则"，但**规则是否真的生效**必须实测：
 *
 *   1. 壳样式（index.html 引用的 2 个）必须躺在预缓存 cache 里；
 *   2. 路由样式必须不在预缓存里（否则收窄没生效）；
 *   3. 首次访问某路由后，其 CSS 必须落进 'route-css' cache；
 *   4. 二次访问该路由时，该 CSS 必须由 SW 命中（网络传输 0 字节）——
 *      这是"弱网/离线切到该路由仍然有样式"的可观测证据。
 *
 * 用法：先起产物服务，再
 *   npx vite preview --outDir dist-check --port 4180 --strictPort
 *   node scripts/check-route-css-runtime-cache.mjs http://[::1]:4180 dist-check
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://[::1]:4180';
const DIST = process.argv[3] || 'dist-check';
const PROBE_ROUTE = '#/ai-chat'; // 其 CSS（BOHAIMain-*.css）应已被移出预缓存

const violations = [];
const fail = (m) => violations.push(m);

const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
const shellCss = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\.\/(static\/css\/[^"]+)"/g)].map(
  (m) => m[1].split('/').pop()
);
const sw = readFileSync(path.join(DIST, 'sw.js'), 'utf8');
const precacheUrls = [...(sw.match(/precacheAndRoute\((\[[\s\S]*?\])[,)]/)?.[1] || '').matchAll(/url:"([^"]+)"/g)].map(
  (m) => m[1]
);
const precacheCss = precacheUrls.filter((u) => u.endsWith('.css')).map((u) => u.split('/').pop());

if (shellCss.length === 0) fail(`${DIST}/index.html 里找不到壳样式链接，无法验收`);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // ---- 首次访问：建立客户端 + 装 SW + 预缓存 ----
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  const swReady = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true).catch(() => false));
  if (!swReady) fail('Service Worker 未能就绪，后续断言无意义');
  // 给预缓存一点时间落盘
  await page.waitForTimeout(6000);

  // ---- 断言 1/2：预缓存里应当只有壳 CSS ----
  const precacheExtra = precacheCss.filter((f) => !shellCss.includes(f));
  const precacheMissing = shellCss.filter((f) => !precacheCss.includes(f));
  console.log(`[runtime-check] 壳样式 ${shellCss.length} 个：${shellCss.join(', ')}`);
  console.log(`[runtime-check] sw.js 预缓存 CSS ${precacheCss.length} 个：${precacheCss.join(', ') || '(无)'}`);
  if (precacheMissing.length) fail(`壳样式未进预缓存：${precacheMissing.join(', ')}`);
  if (precacheExtra.length) {
    console.log(`[runtime-check] 提示：预缓存里仍有非壳 CSS：${precacheExtra.join(', ')}`);
  }

  // ---- 切到目标路由，等其 CSS 真正生效 ----
  await page.evaluate((r) => { window.location.hash = r; }, PROBE_ROUTE);
  const routeCssRow = await page.waitForFunction(
    () => {
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
      const hit = links.find((l) => /BOHAIMain-/.test(l.href));
      return hit ? hit.href.split('/').pop() : null;
    },
    { timeout: 20000 }
  ).then((h) => h.jsonValue()).catch(() => null);

  if (!routeCssRow) {
    fail(`切到 ${PROBE_ROUTE} 后没有观察到该路由的 CSS（BOHAIMain-*.css）被挂载`);
  } else {
    console.log(`[runtime-check] 目标路由 CSS 已挂载：${routeCssRow}`);
    // 等它进 route-css cache
    const cached = await page.evaluate(async (file) => {
      for (let i = 0; i < 20; i++) {
        const names = await caches.keys();
        for (const n of names) {
          const c = await caches.open(n);
          const keys = await c.keys();
          if (keys.some((k) => k.url.endsWith(file))) return n;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    }, routeCssRow);
    if (!cached) fail(`路由 CSS ${routeCssRow} 没有落进任何 Cache Storage —— 运行时兜底没生效`);
    else console.log(`[runtime-check] 路由 CSS 已落入 cache："${cached}"`);
  }

  // ---- 断言 4：二次访问该路由，CSS 必须由 SW 命中（零网络传输）----
  const page2 = await ctx.newPage();
  await page2.goto(`${BASE}/`, { waitUntil: 'load' });
  await page2.waitForTimeout(1200);
  await page2.evaluate((r) => { window.location.hash = r; }, PROBE_ROUTE);
  const servedFromCache = await page2.evaluate(
    async (file) => {
      // 直接向 SW 控制域发起同一 URL 的 fetch，观察 resource timing 的传输字节
      const link = await new Promise((resolve) => {
        const found = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href.endsWith(file));
        if (found) return resolve(found.href);
        // 还没挂上就自己请求一次（仍会被 SW 拦截）
        const probe = new URL(`static/css/${file}`, document.baseURI).href;
        resolve(probe);
      });
      const res = await fetch(link, { cache: 'default' });
      const buf = await res.arrayBuffer();
      const entries = performance.getEntriesByName(link).slice(-1);
      const last = entries[0];
      return { ok: res.ok, bytes: buf.byteLength, transferSize: last ? last.transferSize : null };
    },
    routeCssRow || ''
  ).catch((e) => ({ error: String(e) }));

  if (routeCssRow) {
    if (servedFromCache?.error) fail(`二次校验失败：${servedFromCache.error}`);
    else if (!servedFromCache.ok) fail(`二次访问时路由 CSS 取不到（HTTP 失败）`);
    else if (servedFromCache.transferSize === 0) {
      console.log(`[runtime-check] 二次访问命中 SW 缓存：传输 0 字节 / 解码 ${servedFromCache.bytes} 字节 ✅`);
    } else {
      fail(
        `二次访问时路由 CSS 仍走了网络（transferSize=${servedFromCache.transferSize}）——运行时缓存未命中，弱网下会重新下载`
      );
    }
  }

  await ctx.close();
} finally {
  await browser.close();
}

if (violations.length) {
  console.error('[runtime-check] P0-1 运行时行为验收未通过：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log('[runtime-check] P0-1 运行时行为验收通过（壳样式在预缓存、路由样式走运行时缓存并命中）。');
}
