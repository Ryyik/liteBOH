#!/usr/bin/env node
/**
 * 加载性能基线探针（只读；线上段打 www.blockofhome.cn，**不进 verify / build:ci 主链**）
 *
 * 起因：docs/2026-09-29-加载速度与提速全面评测报告.md。报告的测量脚本原本躺在 /tmp，
 * 重启即失，「提速改完必须自证」就没有前后对照的判据。本探针把报告附录 A 的
 * A-1 / A-2 / A-3 / A-5 收敛成一份可重跑基线：同一口径（390×844 移动视口 + iPhone UA、
 * 每路由全新 context、不节流、9s 观察窗），输出同一张表。改完 P0/P1 后重跑对比。
 *
 * 三段（缺前置时自动跳过并在输出里标注，不算失败）：
 *   [local]  dist 入口闭包 BFS（附录 A-3 口径：只跟静态 import；必须命中 `}from"./x.js"`
 *            这种压缩形态，否则闭包会算成 1 个文件 —— 历史坑）+ 路由静态引入扫描
 *   [cold]   线上冷首访 Core Web Vitals + 资源分类（传输总量 / 框 PNG / Supabase 头像 /
 *            Cloudinary / REST 请求按 path 归组取 top）
 *   [db]     游客态 REST RTT（12 连发取 p50）+ Supabase 头像字节分布。⚠️ 必须在浏览器
 *            页内 fetch：本机 node/curl 直连 supabase.co 会 ECONNRESET（报告 §0 限制 1）。
 *
 * 断言（网络数字只设「防回涨上限」，不是性能目标；基线下调要随优化同步改这里）：
 *   A1 入口闭包不得包含 nsfw-weights / tfjs chunk（3.6MB 审核模型不许回到首屏）
 *   A2 路由文件 0 个静态 view 引入（路由全懒加载不许回退）
 *   A3 `/` 冷首访 supabase REST 请求 ≤ 15（2026-09-29 实测 15；P1-1/P1-2 落地后应下调）
 *   A4 线上单张头像框 PNG ≤ 400KB（2026-09-29 实测最大 hamster 384KB；P0-2 落地后应下调）
 *
 * 用法：
 *   node scripts/probes/probe-perf-baseline.mjs                    # 全部段（约 2 分钟）
 *   node scripts/probes/probe-perf-baseline.mjs --skip-online      # 只跑本地段（秒级）
 *   node scripts/probes/probe-perf-baseline.mjs --routes=/,/forum  # 自选路由
 *   node scripts/probes/probe-perf-baseline.mjs --json out.json    # 机读输出落盘
 *   db 段需要 .env 的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（只读 anon 查询）。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const BASE = 'https://www.blockofhome.cn';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
// 同时支持 `--routes /,/forum` 与 `--routes=/` 两种形式
const optVal = (name, fallback) => {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  const inline = args.find((a) => a.startsWith(name + '='));
  return inline ? inline.slice(name.length + 1) : fallback;
};
const ROUTES = (optVal('--routes', null) || '/,/forum,/user-space,/overview')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);
const SKIP_ONLINE = flag('--skip-online');
const JSON_OUT = optVal('--json', null);

const results = {
  date: new Date().toISOString(),
  base: BASE,
  routes: ROUTES,
  local: null,
  cold: [],
  db: null,
  framePng: [],
  skipped: [],
};
const failures = [];
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
  if (!pass) failures.push(name);
};
const skip = (section, why) => {
  results.skipped.push({ section, why });
  console.log(`SKIP  [${section}] ${why}`);
};

/* ---------------- [local] 入口闭包 BFS + 路由扫描 ---------------- */

function localSection() {
  if (!fs.existsSync(path.join(DIST, 'static', 'js'))) {
    skip('local', 'dist/static/js 不存在（先构建再跑本地段）');
    return;
  }
  const jsDir = path.join(DIST, 'static', 'js');
  const files = new Map();
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.set(path.relative(jsDir, p), p);
    }
  })(jsDir);
  const entries = [...files.keys()].filter((f) => /^app-.*\.js$/.test(f));
  // 压缩形态的静态 import：`}from"./x.js"`、`from'./x.js'` 都要命中（空格可选）
  const STATIC_RE = /(?:^|[\s;}])import\s*[^;]*?from\s*['"](\.\/[^'"]+)['"]/g;
  const DYNAMIC_RE = /import\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g;
  const norm = (fromFile, spec) =>
    path.posix.normalize(path.join(path.posix.dirname(fromFile), spec));
  const deps = (file) => {
    const src = fs.readFileSync(files.get(file), 'utf8');
    const stat = new Set();
    const dyn = new Set();
    for (const m of src.matchAll(STATIC_RE)) {
      const t = norm(file, m[1]);
      if (files.has(t)) stat.add(t);
    }
    for (const m of src.matchAll(DYNAMIC_RE)) {
      const t = norm(file, m[1]);
      if (files.has(t)) dyn.add(t);
    }
    return { stat, dyn };
  };
  const seen = new Set();
  const dynAll = new Set();
  const q = [...entries];
  while (q.length) {
    const f = q.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const { stat, dyn } = deps(f);
    for (const t of stat) q.push(t);
    for (const t of dyn) dynAll.add(t);
  }
  const sizeOf = (set) => {
    let raw = 0;
    let gz = 0;
    for (const f of set) {
      const b = fs.readFileSync(files.get(f));
      raw += b.length;
      gz += zlib.gzipSync(b, { level: 9 }).length;
    }
    return { raw, gz };
  };
  const closureSize = sizeOf(seen);
  const lazySize = sizeOf(dynAll);
  const closureList = [...seen].sort();
  console.log(`\n[local] 入口 ${entries.join(', ')}`);
  console.log(
    `[local] 静态闭包 = ${seen.size} 个文件 / ${(closureSize.raw / 1048576).toFixed(2)}MB raw / ${(closureSize.gz / 1048576).toFixed(2)}MB gz`,
  );
  console.log(closureList.map((f) => `  - ${f}`).join('\n'));
  console.log(
    `[local] 直连动态入口（懒路由 chunk）= ${dynAll.size} 个 / ${(lazySize.raw / 1048576).toFixed(2)}MB raw / ${(lazySize.gz / 1048576).toFixed(2)}MB gz`,
  );
  results.local = {
    entry: entries,
    closure: closureList,
    closureRaw: closureSize.raw,
    closureGz: closureSize.gz,
    lazyCount: dynAll.size,
    lazyRaw: lazySize.raw,
    lazyGz: lazySize.gz,
  };

  const heavy = closureList.filter((f) => /nsfw-weights|tfjs/.test(f));
  check(
    'A1 入口闭包不含 nsfw-weights/tfjs',
    heavy.length === 0,
    heavy.length ? `混入: ${heavy.join(', ')}` : `${seen.size} 个文件全净`,
  );

  const routesDir = path.join(ROOT, 'src', 'router', 'routes');
  const routeFiles = fs.existsSync(routesDir)
    ? fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'))
    : [];
  let lazyCount = 0;
  const staticImports = [];
  for (const f of routeFiles) {
    const src = fs.readFileSync(path.join(routesDir, f), 'utf8');
    lazyCount += (src.match(/\(\) => import\(/g) || []).length;
    for (const m of src.matchAll(/^import\s+.*views\//gm))
      staticImports.push(`${f}: ${m[0].trim()}`);
  }
  console.log(`[local] 路由懒加载 ${lazyCount} 个 / 静态 view 引入 ${staticImports.length} 个`);
  check(
    'A2 路由 0 静态 view 引入',
    staticImports.length === 0,
    staticImports.join(' | ') || `${routeFiles.length} 个路由文件全懒加载`,
  );
}

/* ---------------- [cold] 线上冷首访 ---------------- */

const METRICS = `(() => {
  window.__v = {};
  new PerformanceObserver(l => { for (const e of l.getEntries()) {
    if (e.entryType === 'largest-contentful-paint') {
      window.__v.lcp = e.startTime;
      window.__v.lcpEl = (e.element && (e.element.tagName + ' ' + (e.element.src || e.element.currentSrc || '').slice(0, 110))) || '?';
    }
    if (e.entryType === 'first-contentful-paint') window.__v.fcp = e.startTime;
  }}).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls = (window.__v.cls || 0) + e.value; }).observe({ type: 'layout-shift', buffered: true });
  window.__v.longtasks = [];
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__v.longtasks.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
})()`;

async function coldSection(browser) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const api = [];
    page.on('requestfinished', async (r) => {
      const u = r.url();
      // 跨域无 Timing-Allow-Origin 时 resource entry 的 transferSize 恒为 0，
      // 字节归组只能靠 Playwright 拦响应体（报告附录 A-2 的口径）
      if (!/supabase\.co\/(rest|functions)\/|storage\/v1\/object\/public\//.test(u)) return;
      const res = await r.response().catch(() => null);
      if (!res) return;
      const body = await res.body().catch(() => null);
      api.push({ url: u, bytes: body ? body.length : 0 });
    });
    await page.addInitScript(METRICS);
    await page.goto(BASE + (route === '/' ? '/#/' : '/#' + route), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(9000);
    const d = await page.evaluate(async () => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const res = performance.getEntriesByType('resource').map((r) => ({
        n: r.name,
        init: r.initiatorType,
        sz: r.transferSize || 0,
        end: Math.round(r.responseEnd),
      }));
      const pick = (re) => res.filter((r) => re.test(r.n));
      const sum = (a) => a.reduce((s, r) => s + r.sz, 0);
      // 框 PNG 逐张实测字节（页内 fetch，通常命中刚下载的 HTTP 缓存）
      const frameSizes = [];
      for (const u of [...new Set(pick(/avatars\/frames\/[^?]+\.png/).map((r) => r.n))]) {
        try {
          const b = await (await fetch(u)).arrayBuffer();
          frameSizes.push({ url: u.split('/').pop(), kb: Math.round(b.byteLength / 1024) });
        } catch {}
      }
      return {
        ttfb: Math.round(nav.responseStart || 0),
        dcl: Math.round(nav.domContentLoadedEventEnd || 0),
        fcp: Math.round(window.__v.fcp || 0),
        lcp: Math.round(window.__v.lcp || 0),
        lcpEl: window.__v.lcpEl || '?',
        cls: +(window.__v.cls || 0).toFixed(4),
        longtasks: window.__v.longtasks || [],
        resCount: res.length,
        transferKB: Math.round(sum(res) / 1024),
        lastResMs: Math.max(0, ...res.map((r) => r.end)),
        frameCount: pick(/avatars\/frames/).length,
        frameKB: Math.round(sum(pick(/avatars\/frames/)) / 1024),
        frameSizes,
        supaAvatarKB: Math.round(sum(pick(/storage\/v1\/object\/public\/avatars/)) / 1024),
        supaAvatarCount: pick(/storage\/v1\/object\/public\/avatars/).length,
        cloudinaryKB: Math.round(sum(pick(/image\/upload/)) / 1024),
        supaRestCount: pick(/supabase\.co\/rest\/v1/).length,
      };
    });
    // REST / 头像的字节用拦截到的响应体归组（transferSize 跨域不可靠）
    await page.waitForTimeout(500);
    const restTop = {};
    let supaAvatarBytes = 0;
    for (const a of api) {
      if (/storage\/v1\/object\/public\/avatars/.test(a.url)) {
        supaAvatarBytes += a.bytes;
        continue;
      }
      if (!/rest\/v1/.test(a.url)) continue;
      let label;
      try {
        const u = new URL(a.url);
        const sel = u.searchParams.get('select');
        label = u.pathname + (sel ? ` select=${sel.slice(0, 40)}` : '');
      } catch {
        label = a.url;
      }
      restTop[label] = (restTop[label] || 0) + a.bytes;
    }
    d.supaAvatarKB = Math.round(supaAvatarBytes / 1024);
    d.restTop = Object.entries(restTop)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    results.cold.push({ route, ...d, api });
    console.log(
      `\n[cold] ${route}  TTFB ${d.ttfb}ms | DCL ${d.dcl}ms | LCP ${d.lcp}ms (${d.lcpEl}) | CLS ${d.cls}` +
        `\n       资源 ${d.resCount} 个 / 传输 ${d.transferKB}KB / 最后资源 ${d.lastResMs}ms | longtasks ${JSON.stringify(d.longtasks)}` +
        `\n       框PNG ${d.frameCount}张/${d.frameKB}KB | Supabase头像 ${d.supaAvatarCount}张/${d.supaAvatarKB}KB | Cloudinary ${d.cloudinaryKB}KB | REST请求 ${d.supaRestCount} 个`,
    );
    for (const [p, b] of d.restTop) console.log(`         ${(b / 1024).toFixed(1)}KB  ${p}`);
    await ctx.close();
  }
  const home = results.cold.find((r) => r.route === '/');
  if (home) {
    // P1-1（游客跳过 list_my_avatar_frame_unlocks）已落地但未部署：线上实测仍 15；
    // 部署后应降到 14 —— 届时把这里的上限同步下调到 14，别忘。
    check(
      'A3 `/` 冷首访 supabase REST 请求 ≤ 15',
      home.supaRestCount <= 15,
      `实测 ${home.supaRestCount} 个（2026-09-29 基线 15；部署 P1-1 后应为 14）`,
    );
  } else {
    console.log('SKIP  A3（路由清单里没有 `/`）');
  }
  const frameUnion = [];
  const seenFrame = new Set();
  for (const r of results.cold) {
    for (const f of r.frameSizes || []) {
      if (!seenFrame.has(f.url)) {
        seenFrame.add(f.url);
        frameUnion.push(f);
      }
    }
  }
  if (frameUnion.length) {
    results.framePng = frameUnion;
    const max = Math.max(...frameUnion.map((f) => f.kb));
    console.log(
      `[cold] 线上框 PNG 字节：${frameUnion.map((f) => `${f.url} ${f.kb}KB`).join(', ')}`,
    );
    check(
      'A4 单张头像框 PNG ≤ 400KB',
      max <= 400,
      `最大 ${max}KB（2026-09-29 基线 hamster 384KB）`,
    );
  } else {
    console.log('SKIP  A4（冷首访未拉到框 PNG，内容依赖）');
  }
}

/* ---------------- [db] RTT + 头像字节（页内 fetch） ---------------- */

function readEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

async function dbSection(browser) {
  const env = readEnv();
  const base = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) {
    skip('db', '缺 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
    return;
  }
  const page = await browser.newPage();
  await page.goto(BASE + '/#/', { waitUntil: 'load' });
  const out = await page.evaluate(
    async ({ base, key }) => {
      const H = { apikey: key, authorization: 'Bearer ' + key, accept: 'application/json' };
      const R = {};
      const lat = [];
      for (let i = 0; i < 12; i++) {
        const t = performance.now();
        await fetch(base + '/rest/v1/posts?select=id&limit=1', { headers: H });
        lat.push(Math.round(performance.now() - t));
      }
      const s = [...lat].sort((a, b) => a - b);
      R.restLatency = {
        samples: lat,
        p50: s[6],
        min: s[0],
        max: s[11],
        avg: Math.round(lat.reduce((a, b) => a + b, 0) / lat.length),
      };
      const prof = await fetch(base + '/rest/v1/profiles?select=avatar_url&limit=2000', {
        headers: H,
      });
      if (prof.ok) {
        const rows = await prof.json();
        const sup = rows.filter((x) => x.avatar_url && /supabase\.co\/storage/.test(x.avatar_url));
        const sizes = [];
        for (const x of sup.slice(0, 20)) {
          try {
            const buf = await (await fetch(x.avatar_url)).arrayBuffer();
            sizes.push(Math.round(buf.byteLength / 1024));
          } catch {}
        }
        sizes.sort((a, b) => a - b);
        R.avatars = {
          profilesTotal: rows.length,
          withAvatar: rows.filter((x) => x.avatar_url).length,
          supabaseHosted: sup.length,
          sampled: sizes.length,
          avgKB: sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : 0,
          medianKB: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0,
          maxKB: sizes.length ? sizes[sizes.length - 1] : 0,
        };
      } else {
        R.avatars = { error: prof.status + ' ' + (await prof.text()).slice(0, 100) };
      }
      return R;
    },
    { base, key },
  );
  await page.close();
  results.db = out;
  console.log(
    `\n[db] REST RTT 12 连发：p50 ${out.restLatency.p50}ms / avg ${out.restLatency.avg}ms / min ${out.restLatency.min} / max ${out.restLatency.max}`,
  );
  console.log(`     样本 ${JSON.stringify(out.restLatency.samples)}`);
  if (out.avatars.error) {
    console.log(`[db] 头像字节分布：查询失败 ${out.avatars.error}`);
  } else {
    const a = out.avatars;
    console.log(
      `[db] 头像：profiles ${a.profilesTotal} / 有头像 ${a.withAvatar} / Supabase 托管 ${a.supabaseHosted}；抽样 ${a.sampled} 张 avg ${a.avgKB}KB / p50 ${a.medianKB}KB / max ${a.maxKB}KB`,
    );
  }
}

/* ---------------- main ---------------- */

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  localSection();
  if (SKIP_ONLINE) {
    skip('cold', '--skip-online');
    skip('db', '--skip-online');
  } else {
    await coldSection(browser);
    await dbSection(browser);
  }
} finally {
  await browser.close();
}

console.log(
  `\n==== 结果：${failures.length ? `FAIL（${failures.length} 条断言未过：${failures.join('；')}）` : 'PASS（全部断言通过）'} ====`,
);
if (JSON_OUT) {
  fs.writeFileSync(path.resolve(ROOT, JSON_OUT), JSON.stringify(results, null, 2));
  console.log(`机读输出已写入 ${path.resolve(ROOT, JSON_OUT)}`);
}
process.exit(failures.length ? 1 : 0);
