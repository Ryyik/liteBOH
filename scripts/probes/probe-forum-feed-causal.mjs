import { chromium } from 'playwright';
import fs from 'node:fs';

/* 反证式复核：用「定向延迟某类请求」验证因果，而不是靠时间戳相关性推断。
 *
 * 场景：
 *   A 基线 / G 空拦截（★ 必跑对照）/ H 屏蔽 SW / B 延迟官方目录 / C 延迟评论预览
 *   D 二次进入（有快照）/ E 二次进入（清快照）/ F 目录瞬时（预演 P0 修复）
 *
 * 🔴 本文件的头号教训（2026-11-14 实证）：
 *   **只要挂上 page.route，页面就快约 470ms**——与拦谁、延迟谁无关。
 *   于是「延迟评论 1500ms」的首帖读数反而比基线**快** 533ms，看起来像「评论拖慢了首屏」。
 *   没有 G 组，就会把伪影当成收益。⇒ 任何带拦截的读数，必须减去同一轮 G 组的偏移，
 *   且用「交错执行 + 取中位数」（单次本机漂移 ±500ms；顺序跑会把「后跑更快」误读成修复收益）。
 *
 * 用法：
 *   node scripts/probes/probe-forum-feed-causal.mjs            # 每场景 3 次
 *   REPEAT=2 node scripts/probes/probe-forum-feed-causal.mjs   # 快速档
 */
const BASE = process.env.BASE || 'http://[::1]:5173';
// ⚠️ 应用是 hash 路由：写 `/user-space?tab=community`（path 形式）会被解析成 `#/`＝首页，
// 测到的是「首页里嵌的论坛」而不是 userspace 的社区页（2026-11-14 踩过）。
const PATH = '/#/user-space?tab=community';
const DELAY = 1500;
fs.mkdirSync('debug-screenshots', { recursive: true });

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

async function measure(
  label,
  {
    stall = null,
    instant = null,
    warmClear = false,
    warm = false,
    passthrough = false,
    blockSW = false,
  } = {},
) {
  const browser = await launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...(blockSW ? { serviceWorkers: 'block' } : {}),
  });
  const page = await ctx.newPage();
  const hit = [];
  if (passthrough) {
    // 对照：注册一个「什么都不做」的 route —— 用来测量拦截本身带来的系统性偏移
    await page.route('**/*', (route) => route.continue());
  }
  if (instant) {
    // 瞬时回放：body 由调用方事先用 anon key 取好（保持被测页面冷启动，不靠预加载养缓存）
    await page.route('**/*', async (route) => {
      const u = route.request().url();
      const key = Object.keys(instant).find((s) => u.includes(s));
      if (!key) return route.continue();
      return route.fulfill({
        status: 200,
        body: instant[key],
        headers: { 'content-type': 'application/json' },
      });
    });
  }
  if (stall) {
    await page.route('**/*', async (route) => {
      const u = route.request().url();
      if (stall.some((s) => u.includes(s)) && route.request().method() === 'GET') {
        hit.push(u.split('/rest/v1/')[1]?.split('?')[0] || u);
        await new Promise((r) => setTimeout(r, DELAY));
      }
      return route.continue();
    });
  }
  if (warm) {
    // 第一次进入：把快照/模块缓存养热
    await page.goto(BASE + PATH, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('[data-forum-post-id]', { timeout: 90000 }).catch(() => {});
    if (warmClear) await page.evaluate(() => sessionStorage.clear());
    if (stall) await page.unroute('**/*');
    await page.goto('about:blank');
  }
  const t0 = Date.now();
  await page.goto(BASE + PATH, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForSelector('[data-forum-post-id]', { timeout: 90000 }).catch(() => {});
  const firstCard = await page.evaluate(() => Math.round(performance.now()));
  const cards = await page.evaluate(() => document.querySelectorAll('[data-forum-post-id]').length);
  const wall = Date.now() - t0;
  await browser.close();
  const row = {
    label,
    firstCard,
    wall,
    cards,
    stalled: hit.length,
    stalledNames: [...new Set(hit)],
  };
  console.log(
    `${label.padEnd(26)} 首帖 ${String(firstCard).padStart(5)}ms | 墙钟 ${String(wall).padStart(5)}ms | 卡片 ${cards} | 被延迟 ${hit.length} 条 ${[...new Set(hit)].join(',')}`,
  );
  return row;
}

/* F 的素材：用 anon key 直接从 REST 取两份真实响应体（与页面同源同表），
   让「瞬时回放」不改变渲染内容，只削掉等待。 */
const envText = fs.readFileSync('.env', 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const SB = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const grab = async (table) => {
  const r = await fetch(`${SB}/rest/v1/${table}?select=title,image`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}` },
  });
  return r.ok ? await r.text() : '[]';
};
const directoryBodies = {};
try {
  directoryBodies['/rest/v1/news'] = await grab('news');
  directoryBodies['/rest/v1/activities'] = await grab('activities');
  console.log(
    `[素材] news ${directoryBodies['/rest/v1/news'].length}B · activities ${directoryBodies['/rest/v1/activities'].length}B`,
  );
} catch (e) {
  console.log('[素材] 取数失败，跳过 F：', e.message);
}

const scenarios = [
  ['A 基线', {}],
  ['G 空拦截（对照）', { passthrough: true }],
  ['H 屏蔽 SW', { blockSW: true }],
  [`B 延迟目录 +${DELAY}ms`, { stall: ['/rest/v1/news', '/rest/v1/activities'] }],
  [`C 延迟评论 +${DELAY}ms`, { stall: ['/rest/v1/comments'] }],
  ['D 二次进入（有快照）', { warm: true }],
  ['E 二次进入（清快照）', { warm: true, warmClear: true }],
];
if (Object.keys(directoryBodies).length === 2)
  scenarios.push(['F 目录瞬时（预演修复）', { instant: directoryBodies }]);

/* 交错执行 + 取中位数：单次读数在本机有 ±500ms 漂移（C 组曾无故快 491ms），
   顺序跑会把「后跑更快」误读成修复收益。 */
const REPEAT = Number(process.env.REPEAT || 3);
const buckets = new Map(scenarios.map(([label]) => [label, []]));
for (let round = 0; round < REPEAT; round += 1) {
  for (const [label, opts] of scenarios) {
    const row = await measure(`${label} #${round + 1}`, opts);
    buckets.get(label).push(row.firstCard);
  }
}
const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const rows = [];
console.log('\n—— 中位数汇总 ——');
for (const [label, arr] of buckets) {
  const m = median(arr);
  rows.push({ label, median: m, samples: arr });
  console.log(`${label.padEnd(26)} 中位 ${String(m).padStart(5)}ms   样本 ${arr.join(' / ')}`);
}
const base = median(buckets.get('A 基线'));
console.log('\n相对基线（中位数）的差值：');
for (const r of rows.slice(1))
  console.log(`  ${r.label.padEnd(26)} ${r.median - base > 0 ? '+' : ''}${r.median - base}ms`);
fs.writeFileSync('debug-screenshots/forum-causal.json', JSON.stringify(rows, null, 2));
