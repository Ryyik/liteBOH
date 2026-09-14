/**
 * 白屏诊断探针（只读，不改任何源码）
 *
 * 精确区分两类 chunk：
 *   应用壳依赖 = 入口 app-*.js 的静态 import（8 个，Vue mount 之前必须全部到位）
 *   懒加载 chunk = 其余 132 个（每个路由页/功能页一包）
 *
 * 场景：
 *   A. 正常加载：导航栏与首屏内容的到达先后
 *   B. 懒加载 chunk 延迟 4s（模拟新版重新下载）
 *   C. 懒加载 chunk 404（模拟发布新版后旧壳引用的 hash 已被删除）
 *
 * 用法：先 `cd dist && python3 -m http.server 4199 --bind 127.0.0.1`，再
 *   node probe-blank-screen-diagnosis.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4199';
const OUT = process.env.PROBE_OUT || 'output/blank-screen-diagnosis';
const DIST = process.env.DIST_DIR || 'dist';
const JS_DIR = `${DIST}/static/js`;
const SW_FILE = `${DIST}/sw.js`;
mkdirSync(OUT, { recursive: true });

// ---------- 应用壳依赖：入口 app-*.js 的静态 import ----------
const APP_ENTRY = readdirSync(JS_DIR).find((f) => f.startsWith('app-'));
const SHELL_DEPS = (() => {
  const src = readFileSync(`${JS_DIR}/${APP_ENTRY}`, 'utf8');
  const set = new Set([APP_ENTRY]);
  for (const re of [/from"\.\/([\w.-]+\.js)"/g, /import"\.\/([\w.-]+\.js)"/g]) {
    let m;
    while ((m = re.exec(src))) set.add(m[1]);
  }
  return set;
})();
const ALL_JS = readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
const isShellDep = (name) => SHELL_DEPS.has(name);

// ---------- SW 预缓存 JS 清单（解析 dist/sw.js） ----------
const PRECACHE_JS = (() => {
  const sw = readFileSync(SW_FILE, 'utf8');
  const m = sw.match(/precacheAndRoute\((\[[\s\S]*?\])[,)]/);
  if (!m) return new Set();
  return new Set((m[1].match(/url:"static\/js\/([\w.-]+\.js)"/g) || [])
    .map((x) => x.replace(/url:"static\/js\/|"/g, '')));
})();

console.log(`入口 chunk: ${APP_ENTRY}`);
console.log(`应用壳依赖 ${SHELL_DEPS.size} 个: ${[...SHELL_DEPS].join(', ')}`);
console.log(`懒加载 chunk ${ALL_JS.length - SHELL_DEPS.size} 个`);
console.log(`\nSW 预缓存 JS ${PRECACHE_JS.size} 个: ${[...PRECACHE_JS].join(', ')}`);
const missing = [...SHELL_DEPS].filter((f) => !PRECACHE_JS.has(f));
console.log(`⚠️  壳依赖中未进 SW 预缓存: ${missing.length ? missing.join(', ') : '（无）'}`);

const launchOptions = {
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
};

const probe = (page) => page.evaluate(() => {
  const nav = document.querySelector('#unified-nav-container');
  const navRect = nav ? nav.getBoundingClientRect() : null;
  const fallback = document.querySelector('.page-suspense-fallback');
  const app = document.querySelector('#app');
  const bootSkeleton = document.querySelector('#boh-boot');
  const bootRetry = document.querySelector('#boh-boot-retry');
  const inAppLoading = document.querySelector('.boh-boot-body--standalone');
  const bootText = document.querySelector('.boh-boot-text');
  // 主体区：RouterView 渲染出的第一个实质内容（排除导航栏/页脚）
  const mainCandidates = document.querySelectorAll('#app > *:not(#unified-nav-container):not(footer)');
  let mainHeight = 0;
  mainCandidates.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > mainHeight) mainHeight = Math.round(r.height);
  });
  const visibleText = (document.body.innerText || '').trim();
  return {
    navVisible: !!navRect && navRect.height > 0,
    bootSkeleton: !!bootSkeleton,
    bootRetryButton: !!bootRetry && bootRetry.hidden === false,
    inAppLoading: !!inAppLoading,
    loadingText: bootText ? bootText.textContent.trim() : '',
    suspenseFallbackVisible: !!fallback,
    appChildCount: app ? app.children.length : -1,
    mainAreaHeight: mainHeight,
    bodyTextLength: visibleText.length,
  };
});

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const timelineAt = async (page, t0, checkpoints, prefix, navCounter) => {
  const rows = [];
  for (const at of checkpoints) {
    const wait = at - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    rows.push({ atMs: at, reloads: navCounter.value, ...(await probe(page)) });
    await shot(page, `${prefix}-${at}ms`);
  }
  console.log(JSON.stringify(rows, null, 1));
};

// ---------- 场景 A：正常加载 ----------
async function scenarioA(browser) {
  console.log('\n========== 场景 A：正常加载 ==========');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const t0 = Date.now();
  const reqs = [];
  page.on('requestfinished', (r) => {
    const u = r.url();
    if (!u.includes('/static/js/')) return;
    const name = u.split('/').pop();
    reqs.push({ atMs: Date.now() - t0, name, shell: isShellDep(name) });
  });

  await page.goto(`${BASE}/#/`, { waitUntil: 'commit' });
  const navCounter = { value: 0 };
  await timelineAt(page, t0, [150, 300, 500, 900, 1800], 'A-normal', navCounter);

  console.log('\n  JS 到达顺序（★ = 应用壳依赖）:');
  reqs.sort((a, b) => a.atMs - b.atMs).forEach((r) =>
    console.log(`   +${String(r.atMs).padStart(5)}ms ${r.shell ? '★' : ' '} ${r.name}`));

  const shellLast = Math.max(...reqs.filter((r) => r.shell).map((r) => r.atMs));
  const lazyFirst = Math.min(...reqs.filter((r) => !r.shell).map((r) => r.atMs));
  console.log(`\n  → 壳依赖最晚到达: ${shellLast}ms ；懒加载 chunk 最早到达: ${lazyFirst}ms`);
  await context.close();
}

// ---------- 场景 B/C：只拦截懒加载 chunk，壳依赖放行 ----------
async function scenarioBC(browser, mode, delayMs) {
  const title = mode === 'slow' ? `场景 B：懒加载 chunk 延迟 ${delayMs}ms` : '场景 C：懒加载 chunk 404';
  console.log(`\n========== ${title} ==========`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const t0 = Date.now();
  const navCounter = { value: 0 };
  const blocked = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navCounter.value += 1; });

  await page.route('**/static/js/*.js', async (route) => {
    const name = route.request().url().split('/').pop();
    if (isShellDep(name)) return route.continue();      // 应用壳：放行
    if (blocked.join(',').includes(name)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
    blocked.push(name);
    if (mode === 'slow') {
      await new Promise((r) => setTimeout(r, delayMs));
      return route.continue();
    }
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
  });

  await page.goto(`${BASE}/#/`, { waitUntil: 'commit' });

  if (mode === 'slow') {
    await timelineAt(page, t0, [600, 1500, 3000, 4500, 6500], 'B-slow', navCounter);
  } else {
    await timelineAt(page, t0, [1500, 4000, 8000, 13000], 'C-404', navCounter);
  }
  console.log(`\n  被拦截的懒加载 chunk: ${blocked.slice(0, 12).join(', ')}${blocked.length > 12 ? ` … 共 ${blocked.length} 个` : ''}`);
  console.log(`  页面导航次数（含兜底自动刷新）: ${navCounter.value}`);
  await context.close();
}

// ---------- 场景 D：应用壳依赖 404（壳整个起不来，验证纯内联骨架兜底） ----------
async function scenarioD(browser) {
  console.log('\n========== 场景 D：应用壳依赖 ui-sanitize 404 ==========');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const t0 = Date.now();
  const navCounter = { value: 0 };
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navCounter.value += 1; });

  let logged = false;
  await page.route('**/static/js/*.js', async (route) => {
    const name = route.request().url().split('/').pop();
    if (name.startsWith('ui-sanitize-')) {
      if (!logged) { logged = true; console.log(`   [404] ${name}`); }
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/#/`, { waitUntil: 'commit' });
  await timelineAt(page, t0, [1500, 8000, 13000], 'D-shell404', navCounter);
  await context.close();
}

const browser = await chromium.launch(launchOptions);
try {
  await scenarioA(browser);
  await scenarioBC(browser, 'slow', 4000);
  await scenarioBC(browser, '404', 0);
  await scenarioD(browser);
} finally {
  await browser.close();
}
console.log(`\n截图已写入 ${OUT}/`);
