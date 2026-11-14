#!/usr/bin/env node
/**
 * probe-perf-prefetch-ab.mjs —— 空闲路由预取（/ai-chat → AI 引擎 225KB）对首屏的真实代价
 *
 * 用法：node scripts/probes/probe-perf-prefetch-ab.mjs
 * 前置：同上（dist-audit + preview 4180）
 *   A = 现状（空闲预取 /user-space + /ai-chat）
 *   B = 关掉空闲预取（sessionStorage 预置去重标记，等价于「本次会话已预取过」）
 * 口径：1.6Mbps / RTT150 / CPU4×，冷启动 block SW，三次取中位数。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://[::1]:4180';
const N = 3;
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const run = async (skipPrefetch) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  await ctx.addInitScript((skip) => {
    if (skip) sessionStorage.setItem('boh_route_idle_prefetch_v1', '1');
    window.__perf = { lcp: [] };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          window.__perf.lcp.push({
            t: Math.round(e.startTime),
            src: (e.element?.currentSrc || '').slice(-50),
          });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
  }, skipPrefetch);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (600 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const done = [];
  cdp.on('Network.loadingFinished', (e) => done.push(e.encodedDataLength || 0));
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  const r = await page.evaluate(() => ({
    lcp: window.__perf.lcp.at(-1),
    fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
  }));
  const ai = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => /useChatEngine|index-DkVAVPgv|markdown-vendor/.test(e.name))
      .reduce((a, e) => a + (e.transferSize || 0), 0),
  );
  await ctx.close();
  return {
    lcp: r.lcp?.t ?? null,
    fcp: r.fcp,
    requests: done.length,
    totalKB: +(done.reduce((a, b) => a + b, 0) / 1024).toFixed(1),
    aiKB: +(ai / 1024).toFixed(1),
  };
};

const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const skip of [false, true]) {
  const rows = [];
  for (let i = 0; i < N; i += 1) rows.push(await run(skip));
  console.log(
    `\n[${skip ? 'B 关闭空闲预取' : 'A 现状'}]`,
    JSON.stringify({
      runs: rows,
      lcpMedian: med(rows.map((r) => r.lcp)),
      fcpMedian: med(rows.map((r) => r.fcp)),
      kbMedian: med(rows.map((r) => r.totalKB)),
      aiKB: rows.map((r) => r.aiKB),
    }),
  );
}
await browser.close();
