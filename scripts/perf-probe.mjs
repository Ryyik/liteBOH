/**
 * perf-probe.mjs — 加载性能与「样式安全」实测探针（一次性审计工具）
 *
 * 用法：先起产物静态服务，再
 *   npx vite preview --outDir dist-check --port 4180 --strictPort
 *   node scripts/perf-probe.mjs http://[::1]:4180 dist-check
 *   第二个参数是产物目录（默认 dist），用于读取 sw.js 的预缓存清单 —— 场景 C 必须
 *   按清单归属来切分流量，否则远端图片会被误算成"预缓存吞掉的流量"。
 *
 * 场景：
 *   A 首页冷启（无 SW、不限速）—— 首屏关键路径与资源瀑布
 *   B 限速冷启受保护路由（无 SW）—— 登录弹窗「有 DOM 无样式」窗口实测
 *   C SW 首次安装（限速）—— 预缓存实际吞掉的流量（按清单精确归属）
 *   D 二次访问（SW 命中）—— 壳与路由的缓存收益
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const BASE = process.argv[2] || 'http://[::1]:4180';
const DIST = process.argv[3] || 'dist';
const LAUNCH_ARGS = ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'];
const PROTECTED = '/#/user-space/account-security'; // 该路由 requiresLogin: true

/** 读 sw.js 的预缓存清单，用于把实测流量精确归属到"预缓存"或"其他" */
const readPrecacheManifest = () => {
  try {
    const sw = readFileSync(path.join(DIST, 'sw.js'), 'utf8');
    const m = sw.match(/precacheAndRoute\((\[[\s\S]*?\])[,)]/);
    if (!m) return [];
    return [...m[1].matchAll(/url:"([^"]+)"/g)].map((x) => x[1]);
  } catch {
    return [];
  }
};

/** 预缓存清单在磁盘上的体积 —— 这才是 SW 安装必然要下载的字节数（权威口径） */
const measureManifestOnDisk = () => {
  const per = PRECACHED.map((u) => {
    try {
      const buf = readFileSync(path.join(DIST, u));
      return { url: u, raw: buf.length, gzip: gzipSync(buf, { level: 6 }).length };
    } catch {
      return null;
    }
  }).filter(Boolean);
  const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);
  const css = per.filter((r) => r.url.endsWith('.css'));
  return {
    count: per.length,
    raw: sum(per, 'raw'),
    gzip: sum(per, 'gzip'),
    cssCount: css.length,
    cssRaw: sum(css, 'raw'),
    cssGzip: sum(css, 'gzip'),
  };
};

const PRECACHED = readPrecacheManifest();
const MANIFEST_DISK = measureManifestOnDisk();

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const fmt = (n) => (n == null ? '—' : `${n}ms`);

const collectPaint = (page) => page.evaluate(() => {
  const out = { fcp: null, lcp: null, dcl: null, load: null };
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  if (fcp) out.fcp = Math.round(fcp.startTime);
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) { out.dcl = Math.round(nav.domContentLoadedEventEnd); out.load = Math.round(nav.loadEventEnd); }
  const lcp = performance.getEntriesByType('largest-contentful-paint');
  if (lcp.length) out.lcp = Math.round(lcp[lcp.length - 1].startTime);
  return out;
});

const summarize = (rows) => {
  const js = rows.filter((r) => r.kind === 'js');
  const css = rows.filter((r) => r.kind === 'css');
  const sum = (a) => a.reduce((s, r) => s + r.size, 0);
  return `${rows.length} 条 / ${kb(sum(rows))}；JS ${js.length} 个 ${kb(sum(js))}，CSS ${css.length} 个 ${kb(sum(css))}`;
};

const resources = (page) => page.evaluate(() => performance.getEntriesByType('resource').map((e) => ({
  name: e.name.split('/').pop().slice(0, 46),
  kind: /\.css($|\?)/.test(e.name) ? 'css' : /\.js($|\?)/.test(e.name) ? 'js' : 'other',
  start: Math.round(e.startTime),
  dur: Math.round(e.duration),
  size: e.transferSize || e.encodedBodySize || 0,
})));

const browser = await chromium.launch({ channel: 'chrome', args: LAUNCH_ARGS });

// ───────── A ─────────
{
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  const origin = await page.evaluate(() => performance.timeOrigin);
  const bootGone = await page.waitForFunction(() => !document.querySelector('.boh-boot'), { timeout: 15000 })
    .then(() => Date.now()).catch(() => null);
  const p = await collectPaint(page);
  const rows = await resources(page);
  console.log('\n######## 场景 A：首页冷启（无 SW、不限速） ########');
  console.log(`  FCP ${fmt(p.fcp)} / DCL ${fmt(p.dcl)} / load ${fmt(p.load)}`);
  console.log(`  骨架消失（首屏路由就绪）：${bootGone ? bootGone - origin : '—'}ms`);
  console.log(`  资源合计：${summarize(rows)}`);
  console.log('  首屏关键路径（前 11 条，全部并发发起）：');
  rows.sort((a, b) => a.start - b.start).slice(0, 11).forEach((r) =>
    console.log(`    ${r.name.padEnd(46)}${r.kind.padEnd(5)}start=${String(r.start).padStart(4)}ms dur=${String(r.dur).padStart(4)}ms ${kb(r.size)}`));
  await ctx.close();
}

// ───────── B ─────────
{
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // 从页面最早时刻开始用 rAF 轮询，抓「遮罩首次出现」的瞬时计算样式
  await page.addInitScript(() => {
    window.__overlayLog = [];
    const tick = () => {
      const el = document.querySelector('.boh-login-modal-overlay');
      if (el) {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        window.__overlayLog.push({
          t: Math.round(performance.now()),
          position: s.position,
          z: s.zIndex,
          w: Math.round(r.width),
          h: Math.round(r.height),
          styled: s.position === 'fixed' && r.width > 100 && r.height > 100,
          sheets: document.styleSheets.length,
        });
        if (window.__overlayLog.length > 60) return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: (1.2 * 1024 * 1024) / 8, uploadThroughput: (600 * 1024) / 8,
  });

  await page.goto(`${BASE}/${PROTECTED}`, { waitUntil: 'commit' });
  await page.waitForTimeout(12000); // 给足限速下载时间

  const log = await page.evaluate(() => window.__overlayLog || []);
  const p = await collectPaint(page);
  const rows = await resources(page);
  const cssAt = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource').find((r) => /login-modal-.*\.css/.test(r.name));
    return e ? { start: Math.round(e.startTime), end: Math.round(e.responseEnd) } : null;
  });

  console.log('\n######## 场景 B：限速冷启受保护路由（无 SW） ########');
  console.log(`  路由 ${PROTECTED}  FCP ${fmt(p.fcp)} / DCL ${fmt(p.dcl)}`);
  console.log(`  登录弹窗 CSS（login-modal-*.css）请求窗口：${cssAt ? `${cssAt.start}ms → ${cssAt.end}ms` : '未观察到'}`);
  console.log(`  遮罩采样点 ${log.length} 个`);
  if (log.length) {
    const first = log[0];
    const styled = log.find((x) => x.styled);
    console.log(`  遮罩首次出现：${first.t}ms（position=${first.position} ${first.w}x${first.h}）→ ${first.styled ? '当时已上样式' : '⚠ 当时未上样式'}`);
    console.log(`  首次「样式已生效」：${styled ? styled.t + 'ms' : '本次采样内未出现'}`);
    if (!first.styled && styled) console.log(`  ⚠ 无样式窗口 ≈ ${styled.t - first.t}ms`);
    log.filter((_, i) => i % 4 === 0).slice(0, 10).forEach((x) =>
      console.log(`    t=${String(x.t).padStart(6)}ms position=${String(x.position).padEnd(7)} ${String(x.w)}x${String(x.h)} stylesheets=${x.sheets} ${x.styled ? 'OK' : '⚠ 未上样式'}`));
  }
  console.log(`  资源合计：${summarize(rows)}`);
  await ctx.close();
}

// ───────── C / D ─────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: (2 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8,
  });

  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return reg ? 'active' : 'none';
  });
  // 等预缓存把流量吃完（或超时）
  await page.waitForTimeout(20000);
  const first = await resources(page);

  // 按 sw.js 清单归属切分：只有清单里的 URL 才算"预缓存吞掉的流量"。
  // 否则远端图片（往往单张几百 KB、耗时数秒）会被误算，得出相反结论。
  const isPrecached = (name) => PRECACHED.some((u) => u.endsWith(name) || name === u.split('/').pop());
  const precacheRows = first.filter((r) => isPrecached(r.name));
  const otherRows = first.filter((r) => !isPrecached(r.name));
  const precacheCss = precacheRows.filter((r) => r.kind === 'css');
  const sum = (a) => a.reduce((s, r) => s + r.size, 0);

  console.log('\n######## 场景 C：SW 首次安装（限速 2Mbps） ########');
  console.log(`  SW 状态：${swState}；产物目录 ${DIST}`);
  console.log(
    `  预缓存清单权威体积（读 ${DIST}/sw.js 后按磁盘文件求和）：` +
      `${MANIFEST_DISK.count} 条，raw ${kb(MANIFEST_DISK.raw)}，gzip ${kb(MANIFEST_DISK.gzip)}；` +
      `其中 CSS ${MANIFEST_DISK.cssCount} 个，raw ${kb(MANIFEST_DISK.cssRaw)}，gzip ${kb(MANIFEST_DISK.cssGzip)}`
  );
  console.log(`  首屏 + 预缓存合计（页面时间线）：${summarize(first)}`);
  console.log(
    `  ⚠️ 页面 performance 时间线**不含** SW 自行发起的预缓存抓取，所以下面这组只能当参考：`
  );
  console.log(
    `     清单内可见：${precacheRows.length} 条 / ${kb(sum(precacheRows))}；` +
      `清单外（远端图片/接口）：${otherRows.length} 条 / ${kb(sum(otherRows))}`
  );
  console.log(`     预缓存 CSS 可见：${precacheCss.length} 个 / ${kb(sum(precacheCss))}`);

  // D：二次访问（SW 命中）
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/`, { waitUntil: 'load' });
  const nav2 = await p2.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const rs = performance.getEntriesByType('resource');
    return {
      dcl: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      count: rs.length,
      bytes: rs.reduce((s, r) => s + (r.transferSize || 0), 0),
      fromSW: rs.filter((r) => r.transferSize === 0 && r.decodedBodySize > 0).length,
    };
  });
  // 切一个重路由，量「二次访问下路由切换」的真实成本
  const t = Date.now();
  await p2.evaluate(() => { window.location.hash = '#/ai-chat'; });
  await p2.waitForFunction(() => document.querySelector('#app')?.childElementCount > 0 && !document.querySelector('.boh-boot'), { timeout: 20000 }).catch(() => {});
  console.log('\n######## 场景 D：二次访问（SW 已激活） ########');
  console.log(`  首页 DCL ${fmt(nav2.dcl)} / load ${fmt(nav2.load)}；资源 ${nav2.count} 条 / 网络传输 ${kb(nav2.bytes)}；SW 命中 ${nav2.fromSW} 条`);
  console.log(`  切到 #/ai-chat 耗时：${Date.now() - t}ms`);
  await ctx.close();
}

await browser.close();
console.log('\n探针结束。');
