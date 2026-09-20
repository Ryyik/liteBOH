/**
 * 首屏 LCP / 慢资源定向探针
 * 用法：node scripts/probe-lcp.mjs 'http://[::1]:4180'
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';
const LAUNCH_ARGS = ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'];

const browser = await chromium.launch({ channel: 'chrome', args: LAUNCH_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
const page = await ctx.newPage();

// 4G 级别限速（下行 1.6Mbps / 上行 750kbps / RTT 150ms）
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8,
});

await page.addInitScript(() => {
  window.__lcp = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__lcp.push({ t: Math.round(e.startTime), size: e.size, url: e.url || '(text)', tag: e.element?.tagName, cls: e.element?.className, src: e.element?.currentSrc || e.element?.src || '' });
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  window.__cls = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
});

const t0 = Date.now();
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForTimeout(6000);

const res = await page.evaluate(() => {
  const rs = performance.getEntriesByType('resource').map((r) => ({
    name: r.name, type: r.initiatorType, kb: +(r.transferSize / 1024).toFixed(1),
    dur: Math.round(r.duration), start: Math.round(r.startTime), proto: r.nextHopProtocol,
  }));
  return { lcp: window.__lcp, cls: +window.__cls.toFixed(4), res: rs, nav: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd };
});

console.log('=== LCP 候选（限速 1.6Mbps / RTT150）===');
for (const l of res.lcp) console.log(`  t=${l.t}ms size=${Math.round(l.size)} tag=${l.tag} <${l.cls}> ${l.src || l.url}`.slice(0, 220));
console.log('CLS =', res.cls, ' DCL =', Math.round(res.nav), 'ms');
console.log('\n=== 传输量最大的 22 个资源 ===');
res.res.sort((a, b) => b.kb - a.kb);
for (const r of res.res.slice(0, 22)) {
  console.log(`  ${String(r.kb).padStart(8)}KB  start=${String(r.start).padStart(5)}ms dur=${String(r.dur).padStart(5)}ms ${r.proto || ''} ${r.type.padEnd(9)} ${r.name.slice(0, 110)}`);
}
const total = res.res.reduce((s, r) => s + r.kb, 0);
console.log(`\n合计 ${res.res.length} 条 / ${total.toFixed(1)}KB`);
const byType = {};
for (const r of res.res) byType[r.type] = (byType[r.type] || 0) + r.kb;
console.log('按类型：', Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v.toFixed(0)}KB`).join('  '));

await browser.close();
