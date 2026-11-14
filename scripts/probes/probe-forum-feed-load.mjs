import { chromium } from 'playwright';
import fs from 'node:fs';

/* =====================================================================
 * 探针：论坛（/user-space?tab=community）数据加载瀑布
 *
 * 目的：把「论坛数据加载慢」拆成可测量的四段，避免凭感觉优化：
 *   ① 入口壳（JS/CSS 到能发请求）
 *   ② 数据请求（每一条 supabase rest/rpc 的 start / duration / 字节）
 *   ③ 串行波次（有前后依赖的 RTT 链 —— 手机 4G 上 1 跳 ≈ 150~300ms）
 *   ④ 首条帖子出现在 DOM 的时刻（用户真正看见的第一个信号）
 *
 * 用法：
 *   node scripts/probes/probe-forum-feed-load.mjs            # 桌面档 + 手机 4G 档
 *   node scripts/probes/probe-forum-feed-load.mjs --only=4g  # 只跑 4G
 *   node scripts/probes/probe-forum-feed-load.mjs --warm     # 预热后二次进入（快照命中）
 *
 * ⚠️ 四条读数纪律（2026-11-14 复核时补，别删）：
 *   1. `--warm` 的「二次进入」同时享受了**模块缓存**与**会话快照** ⇒ 整段差值不能算作快照收益。
 *      净收益须用 probe-forum-feed-causal 的 D(有快照) vs E(清快照)：实测 **498ms**（不是 1.6s）。
 *   2. 「串行波次」是按「本条开始 ≥ 上一条结束 −5ms」聚合的**启发式**，并行扇出的独立请求
 *      也会被算成一波。真正决定首帖的是**关键路径串行段**（本场景 2 段：posts → 官方目录）；
 *      因果归属一律用 probe-forum-feed-causal 的「定向延迟」验证，不要靠时间戳相邻去推。
 *   3. 单条请求的 `dur` **含等预检的时间**（GET 在 OPTIONS 结束后才真正发出）⇒
 *      汇总网络耗时别把 OPTIONS 与 GET 的时长相加，否则重复计一次往返。
 *   4. 绝对毫秒只在本机网络下成立（到区域 1 RTT ≈170ms、首次建连 +550ms）；
 *      看结构（往返条数/串行段），别把绝对值当用户体感。
 * ===================================================================== */
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
// ⚠️ 应用是 hash 路由：写 `/user-space?tab=community`（path 形式）会被解析成 `#/`＝首页，
// 测到的是「首页里嵌的论坛」而不是 userspace 的社区页（2026-11-14 踩过）。
const PATH = '/#/user-space?tab=community';
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const warm = args.includes('--warm');

const classify = (url) => {
  try {
    const u = new URL(url);
    const p = u.pathname;
    if (p.includes('/rest/v1/rpc/')) return { kind: 'rpc', name: p.split('/rest/v1/rpc/')[1] };
    if (p.includes('/rest/v1/'))
      return { kind: 'table', name: p.split('/rest/v1/')[1].split('?')[0] };
    if (p.includes('/functions/v1/'))
      return { kind: 'edge', name: p.split('/functions/v1/')[1].split('?')[0] };
    if (p.includes('/auth/v1/'))
      return { kind: 'auth', name: p.split('/auth/v1/')[1].split('?')[0] };
    if (p.includes('/storage/v1/'))
      return { kind: 'storage', name: p.split('/storage/v1/')[1].slice(0, 40) };
    if (u.hostname.includes('cloudinary') || u.hostname.includes('blockofhome'))
      return { kind: 'image-cdn', name: p.split('/').pop().slice(0, 40) };
    if (p.endsWith('.js')) return { kind: 'js', name: p.split('/').pop().slice(0, 60) };
    if (p.endsWith('.css')) return { kind: 'css', name: p.split('/').pop().slice(0, 60) };
    if (/\.(png|jpg|jpeg|webp|gif|svg|woff2?)$/.test(p))
      return { kind: 'asset', name: p.split('/').pop().slice(0, 40) };
    return { kind: 'other', name: p.slice(0, 60) };
  } catch {
    return { kind: 'parse-error', name: String(url).slice(0, 40) };
  }
};

const fmt = (n) => (Number.isFinite(n) ? Math.round(n) : '-');
const kb = (n) => (n ? (n / 1024).toFixed(1) : '0.0');

async function run(label, { width, height, mobile, throttle }) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 3 : 1,
    userAgent: mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: throttle.latency,
      downloadThroughput: throttle.download,
      uploadThroughput: throttle.upload,
      connectionType: 'cellular4g',
    });
  }

  await page.addInitScript(() => {
    window.__fl = { firstCard: 0, lcp: 0, longTasks: [], navStart: performance.timeOrigin };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          if (e.entryType === 'largest-contentful-paint') window.__fl.lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__fl.longTasks.push(Math.round(e.duration));
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  });

  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    const c = classify(e.request.url);
    if (
      !['rpc', 'table', 'edge', 'auth', 'js', 'css', 'asset', 'image-cdn', 'storage'].includes(
        c.kind,
      )
    )
      return;
    reqs.set(e.requestId, {
      ...c,
      url: e.request.url,
      start: e.timestamp * 1000,
      method: e.request.method,
      priority: e.request.initialPriority,
      done: 0,
      bytes: 0,
      status: 0,
    });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    r.served = e.response.fromDiskCache ? 'cache' : 'net';
    // 连接建立拆解（dns / tcp / tls）——「预连接能省多少」的唯一证据来源。
    // ⚠️ CDP 的 timing 字段单位是**毫秒**（相对 requestTime 秒数），不要再 ×1000。
    const t = e.response.timing;
    if (t && t.requestTime) {
      const span = (a, b) => (a > 0 && b >= a ? Math.round(b - a) : 0);
      r.conn = {
        dns: span(t.dnsStart, t.dnsEnd),
        tcp: span(t.connectStart, t.connectEnd),
        ssl: span(t.sslStart, t.sslEnd),
        wait: span(t.sendEnd, t.receiveHeadersEnd),
        reused: t.connectStart < 0,
      };
    }
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    r.done = e.timestamp * 1000;
    r.bytes = e.encodedDataLength || 0;
  });

  await page.goto(BASE + PATH, { waitUntil: 'commit', timeout: 120000 });
  // 首条帖子卡出现 = 数据链路的终点信号
  try {
    await page.waitForSelector('[data-forum-post-id]', { timeout: 90000 });
  } catch {
    /* 收敛不了就照样收数据，报告里会体现 */
  }
  const firstCardAt = await page.evaluate(() => {
    const el = document.querySelector('[data-forum-post-id]');
    if (!el) return 0;
    return Math.round(performance.now());
  });
  await page.waitForTimeout(2500);
  const perf = await page.evaluate(() => ({
    lcp: Math.round(window.__fl.lcp || 0),
    longTasks: window.__fl.longTasks,
    navStart: Math.round(performance.timeOrigin),
    cards: document.querySelectorAll('[data-forum-post-id]').length,
    resources: performance.getEntriesByType('resource').map((r) => ({
      url: r.name,
      start: Math.round(r.startTime),
      dur: Math.round(r.duration),
      bytes: r.transferSize || 0,
    })),
  }));

  const list = [...reqs.values()]
    .filter((r) => r.done)
    .map((r) => ({
      kind: r.kind,
      name: r.name,
      method: r.method,
      preflight: r.method === 'OPTIONS',
      status: r.status,
      served: r.served,
      start: Math.round(r.start),
      dur: Math.round(r.done - r.start),
      bytes: r.bytes,
      conn: r.conn || null,
      url: r.url,
    }))
    .sort((a, b) => a.start - b.start);

  /* ⚠️ CDP 的 timestamp 是页面级单调时钟，与 Date.now() 不是同一历元
     （2026-11-14 踩过：混用后 start 出现 -1794437xxxxx 这种负数）。
     统一以本档最早一条请求为 0 点。 */
  const origin = list.length ? list[0].start : 0;
  for (const r of list) r.start -= origin;

  const data = list.filter(
    (r) => ['rpc', 'table', 'edge', 'auth', 'storage'].includes(r.kind) && !r.preflight,
  );
  const preflightCount = list.filter((r) => r.preflight).length;
  const js = list.filter((r) => r.kind === 'js');
  const dataChainStart = data.length ? data[0].start : 0;

  // 串行波次：把「开始时间晚于前一条结束时间」的相邻数据请求算作新的一波
  const waves = [];
  for (const r of data) {
    const last = waves[waves.length - 1];
    if (!last || r.start >= last.end - 5)
      waves.push({ items: [r], start: r.start, end: r.start + r.dur });
    else {
      last.items.push(r);
      last.end = Math.max(last.end, r.start + r.dur);
    }
  }

  const report = {
    label,
    firstCardMs: firstCardAt,
    lcpMs: perf.lcp,
    cards: perf.cards,
    longTasks: perf.longTasks,
    dataRequests: data.length,
    preflightCount,
    dataBytes: data.reduce((s, r) => s + r.bytes, 0),
    jsBytes: js.reduce((s, r) => s + r.bytes, 0),
    jsCount: js.length,
    waves: waves.length,
    dataChainStart,
    dataChainEnd: data.length ? Math.max(...data.map((r) => r.start + r.dur)) : 0,
    requests: list,
  };

  if (warm) {
    // 二次进入：会话快照命中后从 tab 切走再切回
    await page.evaluate(() => window.scrollTo(0, 0));
    const t0 = Date.now();
    await page.goto(BASE + PATH, { waitUntil: 'commit' });
    try {
      await page.waitForSelector('[data-forum-post-id]', { timeout: 60000 });
    } catch {}
    const t1 = await page.evaluate(() => Math.round(performance.now()));
    report.warmReload = { wall: Date.now() - t0, firstCardMs: t1 };
  }

  await page.screenshot({ path: `${OUT}/forum-feed-load-${label}.png` });
  await context.close();
  await browser.close();
  return report;
}

const print = (r) => {
  console.log(`\n================ ${r.label} ================`);
  console.log(
    `首条帖子 ${fmt(r.firstCardMs)}ms | LCP ${fmt(r.lcpMs)}ms | 卡片 ${r.cards} | 数据请求 ${r.dataRequests} 条(+${r.preflightCount} 预检)/${kb(r.dataBytes)}KiB | JS ${r.jsCount} 条/${kb(r.jsBytes)}KiB | 串行波次 ${r.waves}`,
  );
  console.log(
    `数据链：起点 ${fmt(r.dataChainStart)}ms → 收尾 ${fmt(r.dataChainEnd)}ms（${fmt(r.dataChainEnd - r.dataChainStart)}ms）`,
  );
  if (r.warmReload) console.log(`二次进入：首条帖子 ${fmt(r.warmReload.firstCardMs)}ms`);
  console.log('长任务(ms):', r.longTasks.slice(0, 12).join(', ') || '无');
  const firstConn = r.requests.find(
    (x) => x.conn && ['rpc', 'table', 'edge', 'auth', 'storage'].includes(x.kind),
  );
  if (firstConn)
    console.log(
      `首条数据请求的连接开销：dns ${firstConn.conn.dns}ms · tcp ${firstConn.conn.tcp}ms · tls ${firstConn.conn.ssl}ms · TTFB ${firstConn.conn.wait}ms${firstConn.conn.reused ? '（连接复用）' : ''}  ← ${firstConn.name}`,
    );
  if (r.warmReload) return;
  console.log('\n  start   dur    KiB  kind     name');
  for (const q of r.requests.filter(
    (x) =>
      ['rpc', 'table', 'edge', 'auth', 'storage'].includes(x.kind) ||
      (x.preflight && x.kind === 'table'),
  ))
    console.log(
      `  ${String(q.start).padStart(6)}  ${String(q.dur).padStart(5)}  ${kb(q.bytes).padStart(6)}  ${(q.preflight ? 'OPT' : q.kind).padEnd(6)}   ${q.name}${q.served === 'cache' ? ' [cache]' : ''}`,
    );
  console.log('\n  JS 前 8 条：');
  for (const q of r.requests.filter((x) => x.kind === 'js').slice(0, 8))
    console.log(
      `  ${String(q.start).padStart(6)}  ${String(q.dur).padStart(5)}  ${kb(q.bytes).padStart(6)}  ${q.name}`,
    );
};

const cases = [];
if (!only || only === 'desktop')
  cases.push(['desktop', { width: 1280, height: 900, mobile: false, throttle: null }]);
if (!only || only === '4g')
  cases.push([
    '4g',
    {
      width: 390,
      height: 844,
      mobile: true,
      throttle: { latency: 150, download: (9 * 1024 * 1024) / 8, upload: (3 * 1024 * 1024) / 8 },
    },
  ]);
if (only === 'slow4g')
  cases.push([
    'slow4g',
    {
      width: 390,
      height: 844,
      mobile: true,
      throttle: { latency: 300, download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8 },
    },
  ]);

const out = [];
for (const [label, opts] of cases) out.push(await run(label, opts));
out.forEach(print);
fs.writeFileSync(`${OUT}/forum-feed-load.json`, JSON.stringify(out, null, 2));
console.log(`\n原始数据：${OUT}/forum-feed-load.json`);
