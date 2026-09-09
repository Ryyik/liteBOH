import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：User Space 系统性性能审查 v2（索引切阶段 + 定时器堆栈归因）
// =====================================================================
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const classify = (url) => {
  try {
    const u = new URL(url);
    const p = u.pathname;
    if (p.includes('/rest/v1/rpc/')) return { kind: 'rpc', name: p.split('/rest/v1/rpc/')[1] };
    if (p.includes('/rest/v1/')) return { kind: 'table', name: p.split('/rest/v1/')[1].split('?')[0] };
    if (p.includes('/functions/v1/')) return { kind: 'edge', name: p.split('/functions/v1/')[1].split('?')[0] };
    if (p.includes('/auth/v1/')) return { kind: 'auth', name: p.split('/auth/v1/')[1].split('?')[0] };
    if (p.includes('/storage/v1/')) return { kind: 'storage', name: p.split('/storage/v1/')[1].slice(0, 60) };
    if (u.hostname.includes('cloudinary') || u.hostname.includes('blockofhome')) return { kind: 'image-cdn', name: p.split('/').pop().slice(0, 60) };
    if (p.endsWith('.js')) return { kind: 'js', name: p.split('/').pop().slice(0, 70) };
    if (p.endsWith('.css')) return { kind: 'css', name: p.split('/').pop().slice(0, 70) };
    if (/\.(png|jpg|jpeg|webp|gif|svg|woff2?)$/.test(p)) return { kind: 'asset', name: p.split('/').pop().slice(0, 50) };
    return { kind: 'other', name: p.slice(0, 80) };
  } catch { return { kind: 'parse-error', name: url.slice(0, 60) }; }
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  window.__perfProbe = { intervals: [], longTasks: [], lcp: 0, fcp: 0 };
  const oi = window.setInterval.bind(window);
  window.setInterval = function (fn, delay, ...rest) {
    const id = oi(fn, delay, ...rest);
    const stack = String(new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/^at /, '').split(' (')[0]).join(' <- ');
    window.__perfProbe.intervals.push({ id, delay, cleared: false, stack: stack.slice(0, 300) });
    return id;
  };
  const oc = window.clearInterval.bind(window);
  window.clearInterval = function (id) {
    const rec = window.__perfProbe.intervals.find((i) => i.id === id);
    if (rec) rec.cleared = true;
    return oc(id);
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.entryType === 'largest-contentful-paint') window.__perfProbe.lcp = e.startTime;
        if (e.entryType === 'paint' && e.name === 'first-contentful-paint') window.__perfProbe.fcp = e.startTime;
        if (e.entryType === 'longtask') window.__perfProbe.longTasks.push(Math.round(e.duration));
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perfProbe.longTasks.push(Math.round(e.duration));
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
});

const reqLog = [];
const failedLog = [];
context.on('request', (req) => {
  const url = req.url();
  if (!url.startsWith('http')) return;
  const { kind, name } = classify(url);
  reqLog.push({ url, method: req.method(), kind, name, failed: false });
});
context.on('requestfailed', (req) => {
  const url = req.url();
  const { kind, name } = classify(url);
  failedLog.push({ url: url.slice(0, 140), method: req.method(), kind, name, err: req.failure()?.errorText });
  const rec = [...reqLog].reverse().find((r) => r.url === url);
  if (rec) rec.failed = true;
});
const wsLog = [];
context.on('websocket', (ws) => wsLog.push({ url: ws.url().slice(0, 110) }));

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 120)));

const heap = () => page.evaluate(() => {
  const m = performance.memory || {};
  return { usedMB: Math.round((m.usedJSHeapSize || 0) / 1048576 * 10) / 10 };
});
const probeState = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__perfProbe || {})));
const resourceEntries = () => page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({
  name: r.name.slice(0, 140), start: Math.round(r.startTime), dur: Math.round(r.duration),
  size: r.transferSize || 0, type: r.initiatorType
})));

const summarize = (label, reqs, extra = {}) => {
  const byKind = {};
  for (const r of reqs) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  const detail = {};
  for (const r of reqs) detail[`${r.kind}:${r.name}`] = (detail[`${r.kind}:${r.name}`] || 0) + 1;
  return { label, count: reqs.length, byKind, detail: Object.fromEntries(Object.entries(detail).sort((a, b) => b[1] - a[1]).slice(0, 45)), ...extra };
};
const settle = (ms) => page.waitForTimeout(ms);
const clickNav = async (label) => page.locator('.bottom-nav-glass .nav-item', { hasText: label }).first().click();
const clickSegment = async (host, label) => page.locator(`${host} .segment-tab`, { hasText: label }).first().click();
const countReqs = (reqs, fn) => reqs.filter(fn).length;

const report = { stages: [], hypotheses: {}, heapTrend: [], websockets: [], pageErrors: [] };

// ============ Stage 1: 社区冷加载 ============
let idx = reqLog.length;
await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(600);
const idxLogin = reqLog.length;
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const auth = pinia.state.value.auth;
  auth.isLoggedIn = true;
  Object.assign(auth.userInfo, {
    id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
    username: 'probe_user', role: 'user', points: 42
  });
});
await page.waitForSelector('.community-shell', { timeout: 15000 }).catch(() => {});
await settle(9000);
const appShellReqs = reqLog.slice(idx, idxLogin);
const communityReqs = reqLog.slice(idxLogin);
const h1 = await heap();
const p1 = await probeState();
report.fcp = Math.round(p1.fcp || 0); report.lcp = Math.round(p1.lcp || 0);
const navTiming = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0];
  return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : {};
});
report.stages.push(summarize('app-shell-load', appShellReqs, {}));
report.stages.push(summarize('community-cold-data', communityReqs, { heap: h1, fcp: report.fcp, lcp: report.lcp, navigation: navTiming }));
report.heapTrend.push({ stage: 'community', ...h1 });

report.hypotheses.H1_forum_double_fetch = {
  list_forum_posts_calls: countReqs(communityReqs, (r) => r.kind === 'rpc' && r.name === 'list_forum_posts'),
  list_forum_posts_aborted: failedLog.filter((f) => f.name === 'list_forum_posts').length
};
report.hypotheses.H2_hydrate_queries = {
  posts: countReqs(communityReqs, (r) => r.kind === 'table' && r.name === 'posts'),
  news: countReqs(communityReqs, (r) => r.kind === 'table' && r.name === 'news'),
  activities: countReqs(communityReqs, (r) => r.kind === 'table' && r.name === 'activities')
};
report.hypotheses.H3_embedded_redundant = {
  weekly: countReqs(communityReqs, (r) => /weekly/i.test(r.name)),
  ads: countReqs(communityReqs, (r) => /active_ads|use_active/i.test(r.name)),
  checkin: countReqs(communityReqs, (r) => /checkin|check_in/i.test(r.name))
};

// ============ Stage 2: 我的（posts） ============
idx = reqLog.length;
await clickNav('我的');
await settle(6000);
const postsReqs = reqLog.slice(idx);
const h2 = await heap();
report.stages.push(summarize('posts-tab', postsReqs, { heap: h2 }));
report.heapTrend.push({ stage: 'posts', ...h2 });
report.hypotheses.H4_posts_fetches = {
  summary_rpc: countReqs(postsReqs, (r) => r.kind === 'rpc' && r.name === 'get_my_user_space_summary'),
  posts_table: countReqs(postsReqs, (r) => r.kind === 'table' && r.name === 'posts'),
  profiles: countReqs(postsReqs, (r) => r.kind === 'table' && r.name === 'profiles'),
  user_follows: countReqs(postsReqs, (r) => r.kind === 'table' && r.name === 'user_follows'),
  cloud_entries: countReqs(postsReqs, (r) => /boh_cloud|cloud_entries/i.test(r.name))
};

// ============ Stage 3: 资产（assets） ============
idx = reqLog.length;
await clickNav('资产');
await settle(5000);
const assetsReqs = reqLog.slice(idx);
const h3 = await heap();
report.stages.push(summarize('assets-tab', assetsReqs, { heap: h3 }));
report.heapTrend.push({ stage: 'assets', ...h3 });

// ============ Stage 4: 消息（messages） ============
idx = reqLog.length;
await clickNav('消息');
await settle(6000);
const messagesReqs = reqLog.slice(idx);
const h4 = await heap();
report.stages.push(summarize('messages-tab', messagesReqs, { heap: h4 }));
report.heapTrend.push({ stage: 'messages', ...h4 });
report.hypotheses.H5_messages_tab = {
  notifications_get: countReqs(messagesReqs, (r) => r.kind === 'table' && r.name === 'notifications'),
  unread_rpc: countReqs(messagesReqs, (r) => r.kind === 'rpc' && r.name === 'get_unread_notification_count'),
  js_chunks: countReqs(messagesReqs, (r) => r.kind === 'js')
};

// ============ Stage 5: 消息段切 AI 再切回 ============
idx = reqLog.length;
try { await clickSegment('.messages-tab .segment-tabs', 'BOH AI'); } catch {}
await settle(3500);
const aiReqs = reqLog.slice(idx);
idx = reqLog.length;
try { await clickSegment('.messages-tab .segment-tabs', '消息'); } catch {}
await settle(3000);
const aiBackReqs = reqLog.slice(idx);
report.stages.push(summarize('ai-section', aiReqs, {}));
report.stages.push(summarize('ai-back', aiBackReqs, {}));
const p5 = await probeState();
report.hypotheses.H6_bohai_interval = {
  active_1s_intervals_after_switch_back: (p5.intervals || []).filter((i) => i.delay <= 1100 && !i.cleared).map((i) => ({ delay: i.delay, stack: i.stack.slice(0, 160) }))
};

// ============ Stage 6: 设置（settings） ============
idx = reqLog.length;
await clickNav('设置');
await settle(5000);
const settingsReqs = reqLog.slice(idx);
const h5 = await heap();
report.stages.push(summarize('settings-tab', settingsReqs, { heap: h5 }));
report.heapTrend.push({ stage: 'settings', ...h5 });

// ============ Stage 7: 回访社区（缓存命中验证） ============
idx = reqLog.length;
await clickNav('社区');
await settle(5000);
const revisitReqs = reqLog.slice(idx);
const h6 = await heap();
report.stages.push(summarize('revisit-community', revisitReqs, { heap: h6 }));
report.heapTrend.push({ stage: 'revisit-community', ...h6 });
report.hypotheses.H8_revisit_cache = {
  list_forum_posts_calls: countReqs(revisitReqs, (r) => r.kind === 'rpc' && r.name === 'list_forum_posts'),
  total_db_requests: countReqs(revisitReqs, (r) => ['rpc', 'table', 'edge'].includes(r.kind)),
  detail: revisitReqs.filter((r) => ['rpc', 'table', 'edge'].includes(r.kind)).map((r) => `${r.kind}:${r.name}`)
};

// ============ Stage 8: 驻留社区 65s（跨两个 30s 轮询周期） ============
idx = reqLog.length;
await settle(65000);
const pollReqs = reqLog.slice(idx);
const h7 = await heap();
const p7 = await probeState();
report.stages.push(summarize('community-dwell-65s', pollReqs, { heap: h7 }));
report.heapTrend.push({ stage: 'community-dwell-65s', ...h7 });
report.hypotheses.H7_idle_polling = {
  db_requests_in_65s: countReqs(pollReqs, (r) => ['rpc', 'table', 'edge'].includes(r.kind)),
  detail: pollReqs.filter((r) => ['rpc', 'table', 'edge'].includes(r.kind)).map((r) => `${r.kind}:${r.name}`),
  all_active_intervals: (p7.intervals || []).filter((i) => !i.cleared).map((i) => ({ delay: i.delay, stack: i.stack.slice(0, 200) }))
};

// ============ 并发与资源 ============
const resources = await resourceEntries();
const events = [];
for (const r of resources) { events.push({ t: r.start, d: 1 }); events.push({ t: r.start + r.dur, d: -1 }); }
events.sort((a, b) => a.t - b.t);
let cur = 0, maxConc = 0, maxConcAt = 0;
for (const e of events) { cur += e.d; if (cur > maxConc) { maxConc = cur; maxConcAt = e.t; } }
let burstMax = 0;
for (let i = 0; i < events.length; i++) {
  let c = 0;
  for (let j = i; j < events.length && events[j].t <= events[i].t + 1000; j++) if (events[j].d === 1) c++;
  if (c > burstMax) burstMax = c;
}
report.concurrent = {
  maxConcurrentInflight: maxConc, maxConcurrentAtMs: maxConcAt, maxRequestsPerSecond: burstMax,
  resourceTotalKB: Math.round(resources.reduce((s, r) => s + r.size, 0) / 1024),
  slowest: resources.filter((r) => r.size > 0).sort((a, b) => b.dur - a.dur).slice(0, 12)
};
const pFinal = await probeState();
report.longTaskSummary = {
  count: (pFinal.longTasks || []).length,
  over200ms: (pFinal.longTasks || []).filter((d) => d > 200).length,
  max: Math.max(0, ...(pFinal.longTasks || [0]))
};
report.pageErrors = pageErrors;
report.websockets = wsLog;
report.failed = failedLog;
report.totalRequests = reqLog.length;

fs.writeFileSync('debug-screenshots/user-space-perf-report.json', JSON.stringify(report, null, 2));
await page.screenshot({ path: 'debug-screenshots/user-space-perf-final.png' });

console.log('\n===== SUMMARY =====');
console.log(JSON.stringify({
  totalRequests: report.totalRequests,
  heapTrend: report.heapTrend,
  concurrent: { max: report.concurrent.maxConcurrentInflight, rps: report.concurrent.maxRequestsPerSecond, kb: report.concurrent.resourceTotalKB },
  longTasks: report.longTaskSummary,
  fcp: report.fcp, lcp: report.lcp,
  hypotheses: report.hypotheses,
  stages: report.stages.map((s) => ({ label: s.label, count: s.count, byKind: s.byKind })),
  failed: failedLog.map((f) => `${f.method} ${f.kind}:${f.name} ${f.err}`),
  ws: wsLog.length, pageErrors: pageErrors.length
}, null, 2));

await browser.close();
