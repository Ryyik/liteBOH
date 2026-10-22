#!/usr/bin/env node
/**
 * request-timeout-audit.mjs — 量「数据面挂起时，页面多久给出出口」（2026-10-22）
 *
 * **诊断脚本，不是探针**（不做断言），按 docs/demos/README.md 的口径放这里。
 *
 * 为什么存在：`docs/2026-10-22-竖屏全宽与加载提示洞察.md` 的 L1 原来判定
 * 「全仓只有 2 个文件有请求超时，弱网下骨架永久转」并给了 P1。
 * 复核发现超时在 client 层（`src/utils/supabase-client.js:53` 的 `timeoutFetch`，
 * 读 8s / 写 15s / `/functions/v1/` 180s），从 2026-05 就覆盖全站；原文的取样点
 * 是 4s，早于超时点，所以看到的是「还在骨架」而非「永远转」。
 *
 * 用法：
 *   node docs/demos/request-timeout-audit.mjs --page=shop
 *   node docs/demos/request-timeout-audit.mjs --page=lotteries --mode=abort
 *   node docs/demos/request-timeout-audit.mjs --page=shop --seconds=20
 *
 * ⚠️ 两种挂起模式给出的是不同的物理量，别混着解读：
 *   · `--mode=hang`（默认）每个请求真的挂 N 秒 ⇒ 页面若有重试，每次都重新挂满。
 *     这是「比我配置的超时还久的网络」，用来找**永不 settle** 的链路。
 *   · `--mode=abort` 请求立刻失败 ⇒ 等价于「超时已经触发」。用来量**错误链路本身**多久落。
 *   真实弱网介于两者之间：`timeoutFetch` 到点 abort，所以看 `--mode=abort` 的落点更接近体感。
 *
 * 前置：dev server 在 5173（vite 默认只绑 IPv6，用 `localhost` 或 `[::1]`；127.0.0.1 会拿到代理 502）。
 * 产物：debug-screenshots/hang-<page>.png
 */
import { chromium } from 'playwright';

const arg = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || fallback;

const BASE = arg('base', 'http://[::1]:5173');
const PAGE = arg('page', 'shop');
const MODE = arg('mode', 'hang');
const SECONDS = Number(arg('seconds', 12));
const HANG_MS = 30000;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

page.on('console', (m) => {
  const t = m.text();
  if (/失败|超时|abort|Abort|Failed to fetch/i.test(t)) console.log('  [console]', t.slice(0, 130));
});
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 130)));

/* 数据面挂起 / 立即失败；静态资源与鉴权放行（否则页面压根渲染不出来） */
let touched = 0;
await page.route(/\/(rest|rpc)\/v1\/|\/rpc\//, async (route) => {
  touched += 1;
  if (MODE !== 'abort') await new Promise((r) => setTimeout(r, HANG_MS));
  await route.abort('failed').catch(() => {});
});

const t0 = Date.now();
await page.goto(`${BASE}/#/${PAGE}`, { waitUntil: 'domcontentloaded' });

/* 判据同 portrait-adaptive-audit：可见元素里 class 命中骨架词的才算加载指示 */
const sample = () =>
  page.evaluate(() => {
    const vis = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity <= 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    let sk = 0;
    const names = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!vis(el)) continue;
      if (/skeleton|loading|spinner|shimmer/i.test(String(el.className || ''))) {
        sk += 1;
        if (names.length < 3) names.push(String(el.className).trim().slice(0, 40));
      }
    }
    const txt = document.body.innerText.replace(/\s+/g, ' ').trim();
    return { sk, names, len: txt.length, txt: txt.slice(0, 80) };
  });

const deadline = Date.now() + SECONDS * 1000;
let firstClear = null;
while (Date.now() < deadline) {
  const s = await sample();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (s.sk === 0 && firstClear === null) firstClear = dt;
  console.log(
    `t=${dt}s  sk=${String(s.sk).padStart(3)}  text=${String(s.len).padStart(4)}  ${JSON.stringify(s.names)}  「${s.txt}」`,
  );
  await page.waitForTimeout(600);
}

console.log(`\n请求数: ${touched}   模式: ${MODE}`);
console.log(`骨架清空时刻: ${firstClear === null ? '观察窗口内未清空' : firstClear + 's'}`);
await page.screenshot({ path: `debug-screenshots/hang-${PAGE}.png` });
await browser.close();
