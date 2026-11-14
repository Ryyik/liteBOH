#!/usr/bin/env node
/**
 * probe-perf-first-paint.mjs —— 首屏进入 / userspace 运行时性能勘察（2026-11-14）
 *
 * 用法：node scripts/probes/probe-perf-first-paint.mjs
 * 前置：npx vite build --outDir dist-audit && npx vite preview --outDir dist-audit --port 4180
 *
 * 口径：
 *   · 产物 = dist-audit（vite build 产物），preview 在 4180
 *   · 网络 1.6Mbps / RTT150ms、CPU 4× 降速（近似中端手机）
 *   · 冷启动一律 serviceWorkers: 'block'
 *   · 体积取 CDP Network.loadingFinished.encodedDataLength（gzip 传输字节）
 *
 * 段：
 *   S0 首次访问（不 block SW）：load 之后 5s 内的后台流量 = SW 预缓存开销
 *   S1 冷启动直达 /user-space?tab=posts：FCP/LCP/DCL/load + 骨架消失 + 请求分解
 *   S2 内容就绪（在途排空 + 静默 500ms）
 *   S3 分区切换 posts→community→assets→messages：每段墙钟 + 新请求 + 新 chunk
 *   S4 帖子流滚动：rAF 帧间隔（>50ms 帧占比 / 最长帧）
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://[::1]:4180';
const COLD = { width: 390, height: 844 };

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const fmt = (n) =>
  n >= 1024 * 1024 ? `${(n / 1048576).toFixed(2)}MB` : `${(n / 1024).toFixed(1)}KB`;

/* ── 首次访问（SW 允许）：测预缓存后台流量 ─────────────────────────── */
const measurePrecache = async () => {
  const ctx = await browser.newContext({ viewport: COLD, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const reqs = new Map();
  const finished = [];
  /* ⚠️ 时间基准必须与「load 时刻」同源。CDP 的 timestamp 是 epoch 秒，
     页面 performance.now() 是文档相对时间 —— 直接比较会得出「load 之后下了
     982KB」这种荒谬读数（S0 第一版就这么错过一次）。这里统一用 Node 侧 Date.now()。 */
  const navStart = Date.now();
  cdp.on('Network.requestWillBeSent', (e) => {
    reqs.set(e.requestId, { url: e.request.url, type: e.type, ts: Date.now() - navStart });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    finished.push({
      url: r.url,
      type: r.type,
      start: r.ts,
      bytes: e.encodedDataLength || 0,
    });
  });
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  const loadAt = Date.now() - navStart;
  await page.waitForTimeout(6000);
  const after = finished.filter((f) => f.start > loadAt + 200);
  const swReg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker?.getRegistration();
    return r ? 'registered' : 'none';
  });
  console.log('\n[S0] 首次访问（SW 允许）');
  console.log(
    JSON.stringify(
      {
        loadAtMs: loadAt,
        sw: swReg,
        preLoadCount: finished.filter((f) => f.start <= loadAt + 200).length,
        preLoadKB: +(
          finished.filter((f) => f.start <= loadAt + 200).reduce((a, b) => a + b.bytes, 0) / 1024
        ).toFixed(1),
        afterLoadCount: after.length,
        afterLoadKB: +(after.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1),
        afterLoadTop: after
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 6)
          .map((r) => `${fmt(r.bytes)} ${r.url.split('/').pop()}`),
      },
      null,
      2,
    ),
  );
  await ctx.close();
};

/* ── 登录种子：先在不限速的上下文里注入一次，拿回 boh_auth ───────── */
const grabAuthSeed = async () => {
  const ctx = await browser.newContext({ viewport: COLD });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    try {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      auth.isInitialized = true;
      Object.assign(auth.userInfo, {
        id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
        username: 'probe_user',
        role: 'user',
        points: 42,
      });
      return true;
    } catch {
      return false;
    }
  });
  await page.waitForTimeout(400);
  const seed = await page.evaluate(() => localStorage.getItem('boh_auth'));
  await ctx.close();
  return seed;
};

const INSTRUMENT = () => {
  window.__perf = { lcp: [], long: [], paint: [], shifts: [], skeletonGoneAt: null };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__perf.lcp.push({
          t: Math.round(e.startTime),
          size: e.size,
          tag: e.element?.tagName || '',
          cls: String(e.element?.className || '').slice(0, 60),
          src: (e.element?.currentSrc || e.element?.src || '').slice(-60),
        });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__perf.long.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__perf.paint.push({ n: e.name, t: Math.round(e.startTime) });
    }).observe({ type: 'paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        if (!e.hadRecentInput)
          window.__perf.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4) });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  // 骨架消失
  const watchBoot = () => {
    const boot = document.getElementById('boh-boot');
    if (!boot) {
      if (window.__perf.skeletonGoneAt === null) window.__perf.skeletonGoneAt = -1;
      return;
    }
    const mo = new MutationObserver(() => {
      if (!document.getElementById('boh-boot') && window.__perf.skeletonGoneAt === null) {
        window.__perf.skeletonGoneAt = Math.round(performance.now());
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  };
  document.addEventListener('DOMContentLoaded', watchBoot, { once: true });
};

const coldCtx = async (seed) => {
  const ctx = await browser.newContext({
    viewport: COLD,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  if (seed) {
    await ctx.addInitScript((s) => {
      try {
        localStorage.setItem('boh_auth', s);
      } catch {}
    }, seed);
  }
  await ctx.addInitScript(INSTRUMENT);
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

  const reqs = new Map();
  const done = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    reqs.set(e.requestId, { url: e.request.url, type: e.type, ts: e.timestamp });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    done.push({
      url: r.url,
      type: r.type,
      start: Math.round((r.ts - t0) * 1000),
      dur: Math.round((e.timestamp - r.ts) * 1000),
      bytes: e.encodedDataLength || 0,
    });
  });
  const t0 = Date.now() / 1000;
  return { ctx, page, done, cdp };
};

const groupBy = (list, keyFn) => {
  const out = {};
  for (const x of list) {
    const k = keyFn(x);
    out[k] = out[k] || { n: 0, bytes: 0 };
    out[k].n += 1;
    out[k].bytes += x.bytes;
  }
  return out;
};

const TYPE_MAP = {
  Script: 'js',
  Stylesheet: 'css',
  Image: 'img',
  Font: 'font',
  Document: 'html',
  XHR: 'xhr',
  Fetch: 'xhr',
  Other: 'other',
  Media: 'media',
};

const readPage = (page) =>
  page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const p = window.__perf || {};
    return {
      fcp: p.paint?.find((x) => x.n === 'first-contentful-paint')?.t ?? null,
      fp: p.paint?.find((x) => x.n === 'first-paint')?.t ?? null,
      lcp: p.lcp?.length ? p.lcp[p.lcp.length - 1].t : null,
      lcpLast: p.lcp?.length ? p.lcp[p.lcp.length - 1] : null,
      lcpCount: p.lcp?.length ?? 0,
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEnd: Math.round(nav.loadEventEnd || 0),
      responseEnd: Math.round(nav.responseEnd || 0),
      skeletonGone: p.skeletonGoneAt,
      longTasks: p.long || [],
      cls: +(p.shifts || []).reduce((a, b) => a + b.v, 0).toFixed(4),
      now: Math.round(performance.now()),
    };
  });

/* ══════════════ 主流程 ══════════════ */
await measurePrecache();
const seed = await grabAuthSeed();
console.log('\n[seed] boh_auth =', seed ? `${seed.slice(0, 40)}… (${seed.length}B)` : 'NULL');

/* ── S1 冷启动直达 userspace ─────────────────────────────────────── */
console.log('\n[S1] 冷启动直达 /#/user-space?tab=posts（1.6Mbps / RTT150 / CPU4×）');
const { ctx, page, done } = await coldCtx(seed);
await page.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'domcontentloaded' });

let contentAt = null;
try {
  await page.waitForFunction(
    () => {
      /* 判据不能用「.user-space-page 文本 > N 字」：壳内只有当前档的 tab-page 有高度，
         而空态/私密档（如 posts 对空主页只有 45 字）会让判据永远不成立 —— 上一版
         这里返回 -1，看着像「内容一直没出来」。改成「有任意一档 tab-page 撑开且有内容」。 */
      const root = document.querySelector('.user-space-page');
      if (!root) return false;
      const pane = [...root.querySelectorAll('.tab-page')].find(
        (el) => el.getBoundingClientRect().height > 300,
      );
      return Boolean(pane && (pane.innerText || '').trim().length > 20);
    },
    { timeout: 45000 },
  );
  contentAt = await page.evaluate(() => Math.round(performance.now()));
} catch {
  contentAt = -1;
}
await page.waitForTimeout(2500);
const s1 = await readPage(page);
const nav1 = await page.evaluate(() => ({
  hash: location.hash,
  root: !!document.querySelector('.user-space-page'),
}));
console.log(
  JSON.stringify(
    {
      ...s1,
      contentVisibleAt: contentAt,
      hash: nav1.hash,
      rootPresent: nav1.root,
      requests: done.length,
      totalKB: +(done.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1),
      byType: groupBy(done, (r) => TYPE_MAP[r.type] || r.type),
      slowest: done
        .slice()
        .sort((a, b) => b.dur - a.dur)
        .slice(0, 10)
        .map((r) => `${r.dur}ms ${fmt(r.bytes)} ${(r.url.split('/').pop() || '').slice(0, 60)}`),
      biggest: done
        .slice()
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 10)
        .map((r) => `${fmt(r.bytes)} ${r.dur}ms ${(r.url.split('/').pop() || '').slice(0, 60)}`),
    },
    null,
    2,
  ),
);

/* ── S3a 我页内分段（SegmentTabs 空间/资产/印象）────────────────── */
const clickText = async (text, scope = 'button') =>
  page.evaluate(
    ({ text, scope }) => {
      const el = [...document.querySelectorAll(scope)].find(
        (b) => (b.textContent || '').trim() === text,
      );
      el?.click();
      return Boolean(el);
    },
    { text, scope },
  );

const measureSwitch = async (name, action, sel) => {
  const before = done.length;
  const t0 = Date.now();
  const ok = await action();
  let visible = -1;
  for (let i = 0; i < 160; i += 1) {
    const good = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      /* >20 而不是 >60：图库空态、消息 minimal 档的文本量都很少，卡 60 会让
         「可见」恒为 -1（上一版图库/消息两席就是这么假阴的）。 */
      return r.height > 80 && (el.innerText || '').trim().length > 20;
    }, sel);
    if (good) {
      visible = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(800);
  const after = done.slice(before);
  return {
    name,
    clicked: ok,
    visibleMs: visible,
    newRequests: after.length,
    newKB: +(after.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1),
    newChunks: after
      .filter((r) => r.type === 'Script')
      .map((r) => (r.url.split('/').pop() || '').slice(0, 42)),
  };
};

console.log('\n[S3a] 我页内分段（空间 → 资产 → 印象）');
for (const seg of ['资产', '印象', '空间']) {
  const r = await measureSwitch(seg, () => clickText(seg), '.user-space-page');
  console.log(JSON.stringify(r));
}

/* ── S3b 底栏五席互切（keepAlive 真实验收）──────────────────────── */
console.log('\n[S3b] 底栏五席互切：我 → 内容 → 图库 → 周边 → 消息 → 我');
const NAV = {
  内容: '.forum-page',
  图库: '.cloud-page',
  周边: '.store-page',
  消息: '.x-notifications-container',
  我: '.user-space-page',
};
for (const label of ['内容', '图库', '周边', '消息', '我']) {
  const r = await measureSwitch(label, () => clickText(label, '.nav-item'), NAV[label]);
  console.log(JSON.stringify(r));
}
console.log('\n[S3c] 第二轮（应全部命中缓存）');
for (const label of ['内容', '图库', '周边', '我']) {
  const r = await measureSwitch(label, () => clickText(label, '.nav-item'), NAV[label]);
  console.log(JSON.stringify(r));
}

/* ── S3d 已缓存状态下「一次切页」到底发了什么 ──────────────────────
   第二轮读数里每席恒定 3 个请求 / ~25KB，看着像业务轮询，其实是浏览器
   在软导航后重取 favicon（type=Other，不是 Image —— 所以与侧栏那枚
   `<img src="/favicon.png">` 无关）。把 URL 打出来，避免下次又误判。 */
console.log('\n[S3d] 已缓存状态下 我→内容→我 的全部请求');
const s3dMark = done.length;
await clickText('内容', '.nav-item');
await page.waitForTimeout(1200);
await clickText('我', '.nav-item');
await page.waitForTimeout(1400);
for (const r of done.slice(s3dMark)) {
  console.log(
    `  ${r.bytes ? `${(r.bytes / 1024).toFixed(1)}KB` : '—'}  ${r.type.padEnd(9)} ${(r.url.split('/').pop() || '').slice(0, 52)}`,
  );
}

/* ── S4 滚动流畅度 ──────────────────────────────────────────────── */
console.log('\n[S4] 滚动流畅度（论坛流，30 步）');
/* 必须先切到「内容」：'我'页的空态只有 45 字、没有图片，在上面滚动永远是 17ms 假绿。
   论坛流才有真实卡片 + 图片解码。 */
await clickText('内容', '.nav-item');
await page
  .waitForFunction(
    () => [...document.querySelectorAll('.image-post-thumb, .post-card')].length >= 2,
    { timeout: 20000 },
  )
  .catch(() => {});
await page.waitForTimeout(600);
await page.evaluate(async () => {
  const el = document.scrollingElement;
  window.__frames = [];
  let last = performance.now();
  let raf = 0;
  const tick = () => {
    const now = performance.now();
    window.__frames.push(Math.round(now - last));
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  for (let i = 0; i < 30; i += 1) {
    el.scrollTop += 180;
    await new Promise((r) => setTimeout(r, 90));
  }
  await new Promise((r) => setTimeout(r, 300));
  cancelAnimationFrame(raf);
});
const frames = await page.evaluate(() => window.__frames || []);
const sorted = frames.slice().sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      frames: frames.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      worst: sorted[sorted.length - 1],
      over50: frames.filter((f) => f > 50).length,
      over50Pct: +((frames.filter((f) => f > 50).length / frames.length) * 100).toFixed(1),
    },
    null,
    2,
  ),
);

await ctx.close();

/* ── S5 首页冷启动（对照） ──────────────────────────────────────── */
console.log('\n[S5] 冷启动直达 /（对照）');
const home = await coldCtx(seed);
await home.page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
let homeContent = -1;
try {
  await home.page.waitForFunction(
    () => {
      const el = document.querySelector('.forum-page, .home-page');
      return el && (el.innerText || '').trim().length > 200;
    },
    { timeout: 45000 },
  );
  homeContent = await home.page.evaluate(() => Math.round(performance.now()));
} catch {
  homeContent = -1;
}
await home.page.waitForTimeout(2500);
const s5 = await readPage(home.page);
console.log(
  JSON.stringify(
    {
      ...s5,
      contentVisibleAt: homeContent,
      requests: home.done.length,
      totalKB: +(home.done.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1),
      byType: groupBy(home.done, (r) => TYPE_MAP[r.type] || r.type),
      biggest: home.done
        .slice()
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 8)
        .map((r) => `${fmt(r.bytes)} ${r.dur}ms ${(r.url.split('/').pop() || '').slice(0, 56)}`),
    },
    null,
    2,
  ),
);
await home.ctx.close();

await browser.close();
