#!/usr/bin/env node
/**
 * 装修台入口探针 —— 验证数据管理面板里「商城装修 / 首页装修 / 头像框」
 * 三个 page 类页签的接入与功能是否正常。
 *
 * 覆盖：
 *   1) 侧栏存在三个入口（tabModules 的 type:'page' 项）
 *   2) 从侧栏点击后路由切到 /admin/<slug> 且对应根节点渲染
 *   3) 页面拿到实质内容（标题文案 + 关键操作按钮）
 *   4) 全程无 pageerror / 无 5xx
 *
 * 登录策略：等启动期会话检查放完 → 常驻守护注入 admin（单次注入会被覆盖）
 * 用法：node scripts/probes/probe-console-entries.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const CONSOLES = [
  { label: '商城装修', slug: '/admin/shop-console', root: '.shop-console', title: /商城|商品/ },
  { label: '首页装修', slug: '/admin/hero-console', root: '.hero-console', title: /英雄区/ },
  { label: '头像框', slug: '/admin/avatar-console', root: '.afc', title: /头像框/ }
];

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let bucket = [];
let phase = '(启动)';
const pageErrors = [];
const serverErrors = [];

page.on('pageerror', (e) => {
  pageErrors.push({ phase, msg: String(e.message).slice(0, 240) });
  bucket.push(`pageerror: ${String(e.message).slice(0, 200)}`);
});
page.on('response', (res) => {
  if (res.status() < 500) return;
  const url = res.url();
  if (!/\/rest\/v1\/|\/functions\/v1\//.test(url)) return;
  serverErrors.push({ phase, status: res.status(), url: url.slice(0, 160) });
  bucket.push(`HTTP ${res.status()} ${url.slice(0, 140)}`);
});

// admin_* RPC 依赖真实管理员会话，探针只有 anon key，统一打桩避免噪声
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

const armAdminGuard = () =>
  page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
    if (!pinia) return false;
    const apply = () => {
      const s = pinia.state.value.auth;
      if (!s) return;
      s.isLoggedIn = true;
      s.isInitialized = true;
      if (s.userInfo) Object.assign(s.userInfo, { username: '探针', role: 'admin' });
    };
    apply();
    if (!window.__bohConsoleProbeGuard) window.__bohConsoleProbeGuard = setInterval(apply, 120);
    return true;
  });

phase = '打开后台';
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(4000);
await armAdminGuard();
await page.evaluate(() => { location.hash = '#/admin/data-management'; });
await page.waitForSelector('.admin-shell', { timeout: 30000 });
await page.waitForTimeout(2500);
await armAdminGuard();
await page.waitForTimeout(800);

const role = await page.evaluate(() => {
  const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
  return pinia?.state?.value?.auth?.userInfo?.role || '(空)';
});
check('进入后台且登录态为 admin', role === 'admin', `role=${role}`);

// ---- 侧栏三个入口存在 ----
const navLabels = await page.evaluate(() =>
  [...document.querySelectorAll('.g-sidebar .g-nav-btn')].map((b) => ({
    label: b.querySelector('.g-nav-label')?.textContent?.trim() || '',
    denied: b.classList.contains('is-denied')
  }))
);
for (const c of CONSOLES) {
  const hit = navLabels.find((n) => n.label === c.label);
  check(`侧栏有「${c.label}」入口且可用`, Boolean(hit) && !hit.denied, hit ? '' : `实际侧栏：${navLabels.map((n) => n.label).join(' / ')}`);
}

// ---- 逐个点击进入 ----
for (const c of CONSOLES) {
  phase = c.label;
  bucket = [];

  // 装修台是独立页面（/admin/<slug>），进入后会把 admin shell 整个替换掉、
  // 侧栏消失。所以每个入口都必须先回到数据管理面板再点，否则第二个之后全都点不到。
  await page.evaluate(() => { location.hash = '#/admin/data-management'; });
  await page.waitForSelector('.admin-shell', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await armAdminGuard();

  const clicked = await page
    .locator('.g-sidebar .g-nav-btn', { hasText: c.label })
    .first()
    .click({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (!clicked) {
    check(`${c.label} 可点击进入`, false, '按钮被禁用或不可见');
    continue;
  }

  const rendered = await page
    .waitForSelector(c.root, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(1800);

  const info = await page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel);
    if (!root) return null;
    const h1 = root.querySelector('h1')?.textContent?.trim() || '';
    const buttons = [...root.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean);
    return {
      hash: location.hash,
      h1,
      buttonCount: buttons.length,
      buttons: buttons.slice(0, 10),
      textLen: root.innerText.length
    };
  }, c.root);

  check(`${c.label} 根节点渲染`, rendered && Boolean(info), rendered ? '' : `未出现 ${c.root}`);
  if (info) {
    check(`${c.label} 路由正确`, info.hash.includes(c.slug), `hash=${info.hash}`);
    check(`${c.label} 标题文案匹配`, c.title.test(info.h1), `h1="${info.h1}"`);
    check(`${c.label} 有可操作按钮`, info.buttonCount >= 2, `按钮 ${info.buttonCount} 个：${info.buttons.slice(0, 5).join(' / ')}`);
    check(`${c.label} 页面有实质内容`, info.textLen > 200, `文本长度 ${info.textLen}`);
  }
  check(`${c.label} 无运行时错误`, bucket.length === 0, bucket.slice(0, 3).join(' | '));

  await page.screenshot({ path: `${OUT}/console-entry-${c.slug.split('/').pop()}.png` });
}

await browser.close();

console.log('\n' + '='.repeat(72));
const pass = results.filter((r) => r.pass).length;
console.log(`装修台入口探针：${pass}/${results.length} 通过`);
if (pageErrors.length) {
  console.log('\npageerror 汇总：');
  for (const e of pageErrors) console.log(`  [${e.phase}] ${e.msg}`);
}
if (serverErrors.length) {
  console.log('\n5xx 汇总：');
  for (const e of serverErrors) console.log(`  [${e.phase}] HTTP ${e.status} ${e.url}`);
}

fs.writeFileSync(
  'output/console-entries-scan.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), results, pageErrors, serverErrors }, null, 2)
);
console.log('\n明细已写入 output/console-entries-scan.json');
process.exit(pass === results.length ? 0 : 1);
