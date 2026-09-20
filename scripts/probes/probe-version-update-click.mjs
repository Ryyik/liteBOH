/**
 * probe-version-update-click.mjs — 「发现新版本 → 立即更新」点击后是否真的拿到新应用壳
 *
 * 背景（2026-09-20 修复前）：
 *   forceCleanAndReload 最多等 1.8s 让新 SW 接管，超时后仍直接导航。旧 SW 的
 *   NavigationRoute(createHandlerBoundToURL('index.html')) 会用旧预缓存的
 *   index.html 应答这次导航（__boh_update 查询串只影响 HTTP 缓存，影响不了
 *   SW 预缓存）→ 页面重载了但还是旧版本，且 sessionStorage 的目标 buildId
 *   让启动自检放弃自动强刷，只把同一个弹窗再弹出来。
 *
 * 做法（同一浏览器 context 内完成一次真实升级 + 真实点击）：
 *   ① 服务旧目录（含 bug 的构建）→ 加载页面 → 等 SW 装好并完成预缓存；
 *   ② 把服务目录切到新目录 → 在页面里派发 visibilitychange（与真实轮询同路径）→
 *      等弹窗出现 → 点「立即更新」；
 *   ③ 等带 __boh_update 的导航落地 → 读 meta boh-build-id 判断拿到的是新是旧，
 *      并观察「发现新版本」弹窗是否再次出现（循环守卫退化为重复弹窗的症状）。
 *
 * 可选 --static-delay-ms N：切换到新目录后给 /static/* 每个响应加 N 毫秒延迟，
 *   用于模拟真实网络下新 SW 预缓存下载慢于接管等待窗口（复现超时分支）。
 *
 * 断言模式：
 *   --expect stale   → 期望落地后仍是旧构建（用于旧代码复现 bug，即"反证"）
 *   --expect fresh   → 期望落地后就是新构建（用于修复后验证）
 *
 * 用法：
 *   node scripts/probes/probe-version-update-click.mjs dist dist-check 4191 --expect stale --static-delay-ms 900
 *   node scripts/probes/probe-version-update-click.mjs dist dist-check 4191 --expect fresh
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const OLD_DIR = argv[0] || 'dist';
const NEW_DIR = argv[1] || 'dist-check';
const PORT = Number(argv[2] || 4191);
const expectIdx = argv.indexOf('--expect');
const EXPECT = expectIdx >= 0 ? argv[expectIdx + 1] : 'fresh';
const delayIdx = argv.indexOf('--static-delay-ms');
const STATIC_DELAY_MS = delayIdx >= 0 ? Number(argv[delayIdx + 1]) || 0 : 0;

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
  '.ico': 'image/x-ico',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

let servedDir = OLD_DIR;

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let filePath = path.join(servedDir, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(servedDir, 'index.html'); // SPA 兜底
  }
  const respond = () => {
    try {
      const body = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        // 一律不缓存：保证每次请求都拿到「当前目录」的文件
        'Cache-Control': 'no-store',
        'Service-Worker-Allowed': '/',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  };
  // 只给「新目录」的 /static/* 加延迟（新 SW 安装期要全量下载它们）；
  // sw.js / version.json / index.html 保持即时，避免干扰 update() 检查与导航本身。
  if (STATIC_DELAY_MS > 0 && servedDir === NEW_DIR && /^\/static\//.test(urlPath)) {
    setTimeout(respond, STATIC_DELAY_MS);
  } else {
    respond();
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const BASE = `http://127.0.0.1:${PORT}`;
const violations = [];
const fail = (m) => violations.push(m);

const metaBuildIdOf = (dir) => {
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  return html.match(/meta[^>]*name="boh-build-id"[^>]*content="([^"]+)"/)?.[1]
    || html.match(/meta[^>]*content="([^"]+)"[^>]*name="boh-build-id"/)?.[1]
    || '(未找到)';
};

const oldBuildId = metaBuildIdOf(OLD_DIR);
const newBuildId = metaBuildIdOf(NEW_DIR);
console.log(`[ver-click] 旧目录 buildId：${oldBuildId}`);
console.log(`[ver-click] 新目录 buildId：${newBuildId}`);
if (oldBuildId === newBuildId) {
  console.error('[ver-click] 两个目录 buildId 相同，升级场景不成立，先重新构建其中一个');
  process.exit(1);
}

const precacheCount = (dir) => {
  const sw = readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const m = sw.match(/precacheAndRoute\((\[[\s\S]*?\])[,)]/);
  return m ? [...m[1].matchAll(/url:"([^"]+)"/g)].length : 0;
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (/\[version\]|\[pwa|\[pwa-update\]|\[probe-dump\]|\[probe-hook\]/i.test(text)) {
      console.log(`  [page:${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', (err) => console.log(`  [pageerror] ${err.message}`));

  // ---------- ① 旧版本：装 SW 并完成预缓存 ----------
  await page.goto(`${BASE}/#/home`, { waitUntil: 'load' });
  const ready = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true).catch(() => false));
  if (!ready) fail('旧版本 SW 未能就绪');

  const expectedOld = precacheCount(OLD_DIR);
  const afterOld = await page.evaluate(async (expected) => {
    for (let i = 0; i < 60; i++) {
      const names = await caches.keys();
      for (const n of names) {
        if ((await (await caches.open(n)).keys()).length >= expected) return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }, expectedOld);
  console.log(`[ver-click] 旧版本预缓存是否写满（期望 ≥${expectedOld} 条）：${afterOld}`);
  if (!afterOld) fail('旧版本预缓存未完成，升级场景前提不成立');

  const pageOldBuildId = await page.evaluate(() =>
    document.querySelector('meta[name="boh-build-id"]')?.getAttribute('content'));
  console.log(`[ver-click] 页面当前 buildId：${pageOldBuildId}`);

  // ---------- ② 切到新目录，走真实版本检查 → 弹窗 → 点击 ----------
  servedDir = NEW_DIR;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  // 等「发现新版本」弹窗出现（AdminConfirmModal 是异步组件）
  let dialogShown = true;
  try {
    await page.getByText('发现新版本', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    dialogShown = false;
    fail('切换新目录后「发现新版本」弹窗未出现');
  }
  console.log(`[ver-click] 更新弹窗是否出现：${dialogShown}`);

  // 记录点击瞬间新 SW 是否已被浏览器发现（installing）
  const installingAtClick = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg?.installing || reg?.waiting);
  });
  console.log(`[ver-click] 点击时新 SW 已进入 installing/waiting：${installingAtClick}`);

  if (dialogShown) {
    // 注入面包屑钩子：定位「超时未触发」还是「unregister/caches.delete 挂起」
    await page.evaluate(() => {
      const stamp = (name) => console.warn(`[probe-hook] ${name}`);
      const origUnregister = ServiceWorkerRegistration.prototype.unregister;
      ServiceWorkerRegistration.prototype.unregister = function (...a) {
        stamp('unregister() called');
        const p = origUnregister.apply(this, a);
        p.then(
          () => stamp('unregister() resolved'),
          (e) => stamp(`unregister() rejected: ${e}`)
        );
        return p;
      };
      const origKeys = CacheStorage.prototype.keys;
      CacheStorage.prototype.keys = function (...a) {
        stamp('caches.keys() called');
        const p = origKeys.apply(this, a);
        p.then(() => stamp('caches.keys() resolved'), (e) => stamp(`caches.keys() rejected: ${e}`));
        return p;
      };
      const origDelete = CacheStorage.prototype.delete;
      CacheStorage.prototype.delete = function (...a) {
        stamp(`caches.delete(${a[0]}) called`);
        const p = origDelete.apply(this, a);
        p.then(() => stamp(`caches.delete(${a[0]}) resolved`), (e) => stamp(`caches.delete(${a[0]}) rejected: ${e}`));
        return p;
      };
      const origSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = function (cb, ms, ...rest) {
        if (ms >= 5000) stamp(`setTimeout(${ms}) scheduled`);
        return origSetTimeout(function () {
          if (ms >= 5000) stamp(`setTimeout(${ms}) fired`);
          return cb(...rest);
        }, ms);
      };
      stamp('hooks installed');
    });

    await page.getByRole('button', { name: '立即更新' }).click();

    // forceCleanAndReload 一进来就会同步写 sessionStorage 目标标记，
    // 用它判断「点击是否真的走到了更新流程」
    await page.waitForTimeout(2000);
    const targetWritten = await page.evaluate(() => sessionStorage.getItem('boh_version_reload_target'));
    console.log(`[ver-click] 点击 2s 后目标构建标记（${'boh_version_reload_target'}）：${targetWritten}`);

    // 若 15s 后还没发生带 __boh_update 的导航，转储 SW 状态帮助定位卡点
    setTimeout(() => {
      page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        const dump = {
          href: location.href,
          regs: regs.map((r) => ({
            scope: r.scope,
            installing: Boolean(r.installing),
            waiting: Boolean(r.waiting),
            active: r.active?.state || null,
            controller: Boolean(navigator.serviceWorker.controller),
          })),
        };
        console.log(`[probe-dump] ${JSON.stringify(dump)}`);
      }).catch(() => {});
    }, 15000).unref?.();

    // ---------- ③ 等带 __boh_update 的导航落地 ----------
    // 用 commit 判定「导航已发生」即可：兜底路径下新页面的壳资源可能被
    // static-delay 拖慢，'load' 会晚到很多，不能作为导航发生的判据。
    await page.waitForURL(/__boh_update=/, { timeout: 30000, waitUntil: 'commit' });
    await page.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
    await page
      .waitForSelector('meta[name="boh-build-id"]', { state: 'attached', timeout: 30000 })
      .catch(() => fail('落地后未找到 boh-build-id meta'));
    await page.waitForTimeout(2500); // 等应用壳与 version-checker 启动自检跑完

    const finalBuildId = await page.evaluate(() =>
      document.querySelector('meta[name="boh-build-id"]')?.getAttribute('content'));
    const finalUrl = page.url();
    console.log(`[ver-click] 落地 URL：${finalUrl}`);
    console.log(`[ver-click] 落地后页面 buildId：${finalBuildId}（服务目录当前是 ${newBuildId}）`);

    // 观察弹窗是否再次出现（旧代码的循环守卫会退化为重复弹窗）
    let dialogReappeared = false;
    try {
      await page.getByText('发现新版本', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
      dialogReappeared = true;
    } catch { /* 没再弹，正常 */ }
    console.log(`[ver-click] 更新弹窗是否再次出现：${dialogReappeared}`);

    if (EXPECT === 'stale') {
      // 复现模式：旧代码应该拿回旧构建
      if (finalBuildId === newBuildId) {
        console.log('[ver-click] 意外：旧代码竟然直接拿到了新构建（本地太慢的延迟没拦住接管）');
        fail('复现失败：期望落地为旧构建（bug），但拿到了新构建');
      } else {
        console.log('[ver-click] BUG 已复现：点击「立即更新」后页面仍停留在旧构建' +
          (dialogReappeared ? '，且同一弹窗再次出现' : ''));
      }
    } else {
      // 验证模式：修复后的代码应该拿到新构建
      if (finalBuildId !== newBuildId) {
        fail(`修复验证失败：落地 buildId=${finalBuildId}，期望 ${newBuildId}`);
      } else if (dialogReappeared) {
        fail('修复验证失败：更新成功后「发现新版本」弹窗不应再次出现');
      } else {
        console.log('[ver-click] 修复验证通过：点击后落地即新构建，无重复弹窗');
      }
    }
  }

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

if (violations.length) {
  console.error('\n[ver-click] 未通过：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log(`\n[ver-click] 通过（--expect ${EXPECT}）`);
}
