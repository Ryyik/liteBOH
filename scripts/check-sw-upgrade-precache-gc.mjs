/**
 * check-sw-upgrade-precache-gc.mjs — SW 升级时旧预缓存条目是否被回收（P0-1 上线前必跑）
 *
 * 为什么需要它：
 *   P0-1 把约 100 个路由 CSS 移出了预缓存清单。老用户设备上的旧 SW 已经把这些 CSS
 *   写进了 Cache Storage。如果新 SW 激活时不回收它们，每个老用户会长期留着近 3MB
 *   陈旧 CSS；而且带 hash 的文件名每次部署都变，缓存会随部署次数持续膨胀。
 *
 *   我在设计里把「Workbox 的 PrecacheController 会在 activate 时删除不在新清单里的
 *   条目」当作标准行为 —— 但这是**假设**，上线前必须实测。本脚本就是这个实测。
 *
 * 做法（同一浏览器 context 内完成一次真实升级）：
 *   ① 用目录 A（旧产物，117 条清单）加载页面 → 等 SW 装好并完成预缓存；
 *   ② 把服务目录切到 B（新产物，17 条清单）→ 页面里 registration.update()；
 *   ③ 等新 SW 接管 → 读 Cache Storage：新清单条目应在，被移出的旧 CSS 应已消失。
 *
 * 用法：node scripts/check-sw-upgrade-precache-gc.mjs dist dist-check
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const OLD_DIR = process.argv[2] || 'dist';
const NEW_DIR = process.argv[3] || 'dist-check';
const PORT = Number(process.argv[4] || 4181);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// 服务目录可在运行中切换：升级就是「同一个 URL 换了一套文件」
let servedDir = OLD_DIR;

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let filePath = path.join(servedDir, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(servedDir, 'index.html'); // SPA 兜底
  }
  try {
    const body = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      // 一律不缓存：保证每次请求都拿到「当前目录」的文件，
      // sw.js 的字节变化才能被浏览器检测到（真实环境由 updateViaCache:'none' 保证）
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const BASE = `http://127.0.0.1:${PORT}`;
const violations = [];
const fail = (m) => violations.push(m);

const manifestOf = (dir) => {
  const sw = readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const m = sw.match(/precacheAndRoute\((\[[\s\S]*?\])[,)]/);
  return m ? [...m[1].matchAll(/url:"([^"]+)"/g)].map((x) => x[1]) : [];
};

const oldManifest = manifestOf(OLD_DIR);
const newManifest = manifestOf(NEW_DIR);
const removed = oldManifest.filter((u) => !newManifest.includes(u));
console.log(`[sw-upgrade] 旧清单 ${oldManifest.length} 条 / 新清单 ${newManifest.length} 条 / 本次移除 ${removed.length} 条`);
console.log(`[sw-upgrade] 被移除的 CSS 数量：${removed.filter((u) => u.endsWith('.css')).length}`);

// 读 Cache Storage 里所有缓存的键
const readCaches = (page) => page.evaluate(async () => {
  const out = {};
  for (const name of await caches.keys()) {
    const c = await caches.open(name);
    out[name] = (await c.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, ''));
  }
  return out;
});

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();

  // ---------- ① 旧版本：装 SW 并完成预缓存 ----------
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  const ready = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true).catch(() => false));
  if (!ready) fail('旧版本 SW 未能就绪');
  // 等预缓存把条目写满（按旧清单数量判断，留足时间）
  const afterOld = await page.evaluate(async (expected) => {
    for (let i = 0; i < 60; i++) {
      const names = await caches.keys();
      for (const n of names) {
        const c = await caches.open(n);
        const keys = await c.keys();
        if (keys.length >= expected) return keys.length;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const names = await caches.keys();
    let best = 0;
    for (const n of names) best = Math.max(best, (await (await caches.open(n)).keys()).length);
    return best;
  }, oldManifest.length);
  console.log(`[sw-upgrade] 旧版本预缓存条目数：${afterOld}（期望 ≥${oldManifest.length}）`);
  if (afterOld < oldManifest.length) {
    fail(`旧版本预缓存未完成（${afterOld}/${oldManifest.length}），升级验证的前提不成立`);
  }
  const cachesOld = await readCaches(page);
  const oldCssCachedBefore = removed.filter((u) =>
    Object.values(cachesOld).some((keys) => keys.includes(u)),
  );
  console.log(`[sw-upgrade] 升级前：被移除清单中的 ${oldCssCachedBefore.length} 个 CSS 确实已在设备缓存里`);

  // ---------- ② 切换到新版本并触发更新 ----------
  servedDir = NEW_DIR;
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  // 等新 SW 接管（skipWaiting + clientsClaim 下会很快）
  const tookOver = await page.evaluate(() => new Promise((resolve) => {
    if (navigator.serviceWorker.controller?.scriptURL) {
      // 已经由某个 SW 控制；靠 Cache Storage 变化判断是否换新版，这里先等 controllerchange
    }
    const t = setTimeout(() => resolve(false), 15000);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(true); }, { once: true });
  }));
  console.log(`[sw-upgrade] 是否收到 controllerchange：${tookOver}`);
  // 给新 SW 的 activate 回收动作留时间
  await page.waitForTimeout(4000);

  // ---------- ③ 检查回收结果 ----------
  const cachesNew = await readCaches(page);
  const allKeysNew = Object.values(cachesNew).flat();
  const stillThere = removed.filter((u) => allKeysNew.includes(u));
  const newMissing = newManifest.filter((u) => !allKeysNew.includes(u));

  console.log('\n######## 升级后 Cache Storage 状态 ########');
  for (const [name, keys] of Object.entries(cachesNew)) {
    console.log(`  ${name}：${keys.length} 条`);
  }
  console.log(`  被移除的旧资源仍残留：${stillThere.length} / ${removed.length}`);
  if (stillThere.length) {
    console.log(`    例：${stillThere.slice(0, 5).join(', ')}`);
  }
  console.log(`  新清单中缺失的条目：${newMissing.length} / ${newManifest.length}`);
  if (newMissing.length) console.log(`    例：${newMissing.slice(0, 5).join(', ')}`);

  if (newMissing.length) fail(`新清单有 ${newMissing.length} 个条目未落到设备缓存`);
  if (stillThere.length) {
    fail(
      `升级后仍有 ${stillThere.length} 个旧预缓存条目残留 —— Workbox 的 activate 回收并没有清掉它们。` +
        `上线前必须补清理逻辑（例如在新 SW 的 activate 里按当前清单删除同名 cache 的过期键），` +
        `否则每个老用户设备会长期保留近 3MB 陈旧 CSS，且随部署次数膨胀`
    );
  }

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

if (violations.length) {
  console.error('\n[sw-upgrade] 未通过：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log('\n[sw-upgrade] 通过：新 SW 激活后旧预缓存条目已被回收，新清单完整落地。');
}
