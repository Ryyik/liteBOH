import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PERF_BASE || 'http://127.0.0.1:4173';
const RUNS = Number(process.env.PERF_RUNS || 3);
const results = [];
const check = (n, p, e = '') => { results.push({ n, p }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${e ? '  → ' + e : ''}`); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

// 首屏测量受 Service Worker 安装态影响很大（第一次裸跑、第二次已被 SW 接管，
// 请求数与字节数都不同）。所以每轮都用全新 context，跑多次取中位数。
const runs = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const reqs = [];
  page.on('response', async (res) => {
    const r = res.request();
    let size = 0;
    try { size = Number((await res.allHeaders())['content-length'] || 0); } catch { /* ignore */ }
    reqs.push({ url: r.url(), type: r.resourceType(), size });
  });

  await page.addInitScript(() => {
    window.__metrics = { lcp: 0, lcpEl: '', fcp: 0, cls: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__metrics.lcp = e.startTime;
        window.__metrics.lcpEl = (e.element ? e.element.tagName + (e.element.className ? '.' + String(e.element.className).split(' ')[0] : '') : e.url || '');
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { if (e.name === 'first-contentful-paint') window.__metrics.fcp = e.startTime; }
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__metrics.cls += e.value; }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  const t0 = Date.now();
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 45000 });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => window.__metrics);

  const totalBytes = reqs.reduce((s, r) => s + r.size, 0);
  runs.push({ reqs, totalBytes, m, loadMs, i });
  console.log(`  第 ${i + 1} 轮：${reqs.length} 请求 / ${(totalBytes / 1024).toFixed(0)} K / LCP ${Math.round(m.lcp)} ms / load ${loadMs} ms`);
  await ctx.close();
}

await browser.close();

const reqCounts = runs.map((r) => r.reqs.length);
const byteTotals = runs.map((r) => r.totalBytes);
const lcps = runs.map((r) => r.m.lcp);
const clss = runs.map((r) => r.m.cls);

// 用中位数那一轮做明细分析
const ref = runs.slice().sort((a, b) => a.reqs.length - b.reqs.length)[Math.floor(RUNS / 2)];
const reqs = ref.reqs, totalBytes = ref.totalBytes, m = ref.m;
const byType = {};
for (const r of reqs) {
  byType[r.type] = byType[r.type] || { count: 0, bytes: 0 };
  byType[r.type].count++;
  byType[r.type].bytes += r.size;
}

console.log('\n===== 首屏实测（中位数轮）=====');
console.log(`请求数 ${median(reqCounts)}（区间 ${Math.min(...reqCounts)}~${Math.max(...reqCounts)}）`);
console.log(`总字节 ${(median(byteTotals) / 1024).toFixed(0)} K（区间 ${(Math.min(...byteTotals) / 1024).toFixed(0)}~${(Math.max(...byteTotals) / 1024).toFixed(0)} K，未压缩）`);
console.log(`LCP ${Math.round(median(lcps))} ms（区间 ${Math.round(Math.min(...lcps))}~${Math.round(Math.max(...lcps))}）`);
console.log(`CLS ${median(clss).toFixed(4)}`);
console.log(`FCP ${Math.round(m.fcp)} ms    LCP 元素: ${m.lcpEl}`);
console.log('\n按类型:');
for (const [t, v] of Object.entries(byType).sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${t.padEnd(12)} ${String(v.count).padStart(3)} 个   ${(v.bytes / 1024).toFixed(1)} K`);
}
const jsReqs = reqs.filter((r) => r.type === 'script').sort((a, b) => b.size - a.size);
console.log(`\n首屏 JS chunk（${jsReqs.length} 个）:`);
for (const r of jsReqs) console.log(`  ${(r.size / 1024).toFixed(1).padStart(7)} K  ${r.url.split('/').pop()}`);
const imgReqs = reqs.filter((r) => r.type === 'image').sort((a, b) => b.size - a.size);
console.log(`\n首屏图片（${imgReqs.length} 个）:`);
for (const r of imgReqs) console.log(`  ${(r.size / 1024).toFixed(1).padStart(7)} K  ${r.url.split('/').pop()}`);

const heavy = jsReqs.filter((r) => /nsfw|tfjs|docx-vendor|ppt-vendor|doc-utils|BOHAIMain|DataAdmin|ForumMain|AltchaWidget|image-processing/.test(r.url));
check('首屏未误加载重型业务 chunk', heavy.length === 0, heavy.map((h) => h.url.split('/').pop()).join(', ') || '无');
check('LCP 中位数在 2.5s 内（localhost 基线）', median(lcps) < 2500, `${Math.round(median(lcps))} ms`);
check('CLS 中位数小于 0.1', median(clss) < 0.1, median(clss).toFixed(4));
check('首屏请求数中位数 ≤ 45', median(reqCounts) <= 45, `${median(reqCounts)} 个`);
check('首屏总字节中位数 ≤ 1.6 MB', median(byteTotals) <= 1.6 * 1024 * 1024, `${(median(byteTotals) / 1024).toFixed(0)} K`);
check('首屏未加载本机图片以外的远端资源', reqs.filter((r) => /^https?:/.test(r.url) && !r.url.includes('127.0.0.1') && !r.url.includes('supabase.co')).length === 0,
  reqs.filter((r) => /^https?:/.test(r.url) && !r.url.includes('127.0.0.1')).map((r) => r.url.split('/')[2]).join(', ') || '无');

fs.writeFileSync('/tmp/perf-detail.json', JSON.stringify({ runs: runs.map((r) => ({ n: r.reqs.length, b: r.totalBytes, lcp: r.m.lcp })), byType, totalBytes, m }, null, 2));
console.log(`\n汇总：${results.filter((r) => r.p).length}/${results.length} 通过`);
