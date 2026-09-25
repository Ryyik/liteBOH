import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// 探针：dev server 依赖预构建不炸（node 内置模块 / node-fetch 那条链）
//
// 背景：`src/utils/forum-image-moderation.js` 动态 import('@tensorflow/tfjs')，
// tfjs-core 的 ESM 产物里带着 platform_node 分支 → `node-fetch` → `import https from 'https'`。
// `https` 是 Node 内置模块，浏览器端解析不了，Vite 直接报
//   [plugin:vite:import-analysis] Failed to resolve entry for package "https"
// 并弹出 vite-error-overlay —— 那层遮罩会把整页点击全部吃掉。
//
// 触发条件（当年 vite.config 的注释也写了）：**依赖缓存失效**后重新预构建/扫描。
// 所以这里主动删掉 node_modules/.vite 来复现同一路径 —— 不删就等于没测。
//
// 用法：node scripts/probes/probe-vite-dep-scan.mjs
const BASE = process.env.BASE || 'http://[::1]:5173';
const CACHE_DIR = path.resolve('node_modules/.vite');
const KEEP_CACHE = process.argv.includes('--keep-cache');
/** 临时探针模块：借它跑一遍「Vite 解析 import 'node-fetch' 会指向哪」 */
const PROBE_MODULE = path.resolve('src/__probe_node_fetch_import.js');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

if (!KEEP_CACHE && fs.existsSync(CACHE_DIR)) {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  console.log(`已清空 ${path.relative(process.cwd(), CACHE_DIR)}（强制冷启动预构建）`);
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));

/** 报错遮罩的文案（Vite 把错误塞在 shadow DOM 里） */
const overlayText = () => page.evaluate(() => {
  const list = [...document.querySelectorAll('vite-error-overlay')];
  if (!list.length) return '';
  return list.map((el) => (el.shadowRoot?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)).join(' | ');
});

// 冷启动第一趟：预构建在请求途中发生，可能伴随一次自动 reload
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

const overlayHome = await overlayText();
check('冷启动后首页无 Vite 报错遮罩', overlayHome === '', overlayHome);
check('首页应用根节点已挂载', await page.evaluate(() => Boolean(document.querySelector('#app')?.firstElementChild)), '');

// 再走一趟带动态 import 链路的页面（管理端控制台），确认不是首页侥幸
await page.evaluate(() => { location.hash = '#/admin/avatar-console'; });
await page.waitForTimeout(4000);
const overlayConsole = await overlayText();
check('管理端页面无 Vite 报错遮罩', overlayConsole === '', overlayConsole);
check('无未捕获运行时错误', errors.length === 0, errors.join(' | ').slice(0, 200));

/* ══════ 核心断言：node-fetch 的解析目标 ══════
 * 这条路径就是事故现场：Vite 把 import 'node-fetch' 重写成一个 URL 让浏览器自己取，
 * 如果指向 node_modules/node-fetch/lib/index.mjs（Node 版 ESM，顶部 import https），
 * 取回来就是「Failed to resolve entry for package "https"」错误页 + 报错遮罩。
 * 正确目标 = scripts/shims/node-fetch.browser.js（浏览器替身空实现）。
 */
try {
  fs.writeFileSync(PROBE_MODULE, "import fetch from 'node-fetch';\nexport default fetch;\n");
  const rewritten = await page.evaluate(async () => {
    const res = await fetch('/src/__probe_node_fetch_import.js');
    const code = await res.text();
    return code.match(/["']([^"']*node-fetch[^"']*)["']/)?.[1] || '';
  });
  check('node-fetch 被重写到浏览器替身（不是 node_modules 原包）',
    rewritten.includes('scripts/shims/node-fetch.browser.js'), `→ ${rewritten || '(未匹配到)'}`);

  const body = await page.evaluate(async (u) => {
    const res = await fetch(u);
    const text = await res.text();
    return { status: res.status, ok: text.includes('unavailable'), head: text.slice(0, 80).replace(/\s+/g, ' ') };
  }, rewritten);
  check('请求该目标能拿到真模块（不是错误页）', body.status === 200 && body.ok === true,
    `status=${body.status} head=${body.head}`);
} finally {
  fs.rmSync(PROBE_MODULE, { force: true });
}

await browser.close();

const passCount = results.filter((r) => r.pass).length;
console.log(`\n${passCount}/${results.length} PASS`);
process.exit(passCount === results.length ? 0 : 1);
