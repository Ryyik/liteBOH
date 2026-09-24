#!/usr/bin/env node
/**
 * 核心路径运行时错误扫描：逐页访问并收集 pageerror / console.error，
 * 专门盯「is not a function」类错误（对应生产 main.<hash>.js 的 v[w] 报错）。
 * 用法：node scripts/probes/probe-core-pages-errors.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const ROUTES = ['/#/', '/#/user-space', '/#/login', '/#/settings', '/#/admin/data-management'];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});

// 统一用 admin 登录态，让需要权限的页面也能进
const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await context.newPage();
const errors = [];

page.on('pageerror', (e) => {
  const msg = String(e.message || '');
  errors.push({ route: currentRoute, msg: msg.slice(0, 220) });
  if (/is not a function/i.test(msg)) flagged.push({ route: currentRoute, msg: msg.slice(0, 220) });
});
const flagged = [];
let currentRoute = '';

await page.route('**/rest/v1/rpc/**', async (route) => {
  const url = route.request().url();
  const listShaped = /list_users|existing_subscribers|grant_batches|sensitive|counts/i.test(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': listShaped ? '0--1/*' : '0-0/0' },
    body: listShaped ? '[]' : '{}'
  });
});

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const apply = () => {
    const s = pinia.state.value.auth;
    if (!s) return;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: '探针', role: 'admin' });
  };
  apply();
  setInterval(apply, 150);
});
await page.waitForTimeout(600);

for (const route of ROUTES) {
  currentRoute = route;
  await page.evaluate((h) => { location.hash = h.slice(1); }, route);
  await page.waitForTimeout(3200);
  const textLen = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
  console.log(`${route}  渲染文本 ${textLen} 字`);
}

console.log('\n== pageerror 汇总 ==');
if (!errors.length) console.log('（无）');
for (const e of errors) console.log(`[${e.route}] ${e.msg}`);
console.log('\n== 「is not a function」==');
if (!flagged.length) console.log('未出现 ✅');
for (const f of flagged) console.log(`[${f.route}] ${f.msg}`);

await browser.close();
process.exit(flagged.length ? 1 : 0);
