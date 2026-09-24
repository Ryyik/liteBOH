#!/usr/bin/env node
/**
 * 数据管理面板「一键查错」运行时探针
 *
 * 做法：伪造 admin 登录 → 遍历侧栏每个模块 + 每个页签 → 采集
 *   ① PostgREST 4xx/5xx 响应体（含 `column X.xxx does not exist` 这类列错误）
 *   ② pageerror / console.error
 *   ③ 面板自己的 toast 文案（用户看到的报错）
 * 最后按「模块 / 页签」归因输出。
 *
 * 依赖：dev server 已在 http://localhost:5173 运行
 * 用法：node scripts/probes/probe-datamanagement-errors.mjs [--json]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const OUT = 'output';
const SHOTS = 'debug-screenshots';
const ADMIN_UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// ---- 采集器 ----
let bucket = [];          // 当前页签的采集窗口
const globalEvents = [];  // 全流程事件
const pushEvent = (kind, payload) => { bucket.push({ kind, ...payload }); };

const REST_RE = /\/rest\/v1\//;

page.on('response', async (res) => {
  if (!REST_RE.test(res.url())) return;
  if (res.status() < 400) return;
  let body = '';
  try { body = (await res.text()).slice(0, 400); } catch { body = '(body 读取失败)'; }
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { /* 非 JSON */ }
  pushEvent('rest', {
    status: res.status(),
    url: res.url().replace(BASE, '').slice(0, 300),
    message: parsed?.message || body.slice(0, 300),
    code: parsed?.code || null,
    details: parsed?.details || null,
    hint: parsed?.hint || null
  });
});
page.on('pageerror', (e) => pushEvent('pageerror', { message: String(e.message).slice(0, 300) }));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const t = msg.text();
  if (/favicon|net::ERR_|Download the React/i.test(t)) return;
  pushEvent('console', { message: t.slice(0, 300) });
});

// ---- 登录态注入 ----
// 单次注入会被启动期 / 路由期的会话检查覆盖（表现为刚注入是 admin，几百毫秒后侧栏又变回置灰）。
// 因此装一个常驻守护：持续把 auth state 拉回 admin，探针结束后由浏览器销毁回收。
const armAdminGuard = () =>
  page.evaluate((uid) => {
    const app = document.querySelector('#app')?.__vue_app__;
    const pinia = app?.config?.globalProperties?.$pinia;
    if (!pinia) return 'no-pinia';
    const apply = () => {
      const s = pinia.state.value.auth;
      if (!s) return;
      s.isLoggedIn = true;
      s.isInitialized = true;
      if (s.userInfo) Object.assign(s.userInfo, { username: '探针', id: uid, role: 'admin' });
    };
    apply();
    if (!window.__bohProbeGuard) window.__bohProbeGuard = setInterval(apply, 150);
    return String(pinia.state.value.auth?.userInfo?.role || '(空)');
  }, ADMIN_UUID);

const currentRole = () =>
  page.evaluate(() => {
    const v = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.auth;
    return `${v?.userInfo?.role || '(空)'} loggedIn=${v?.isLoggedIn}`;
  });

/**
 * admin_* 这类 RPC 依赖真实管理员会话；探针只有 anon key，必然 401。
 * 这些 401 会淹没有效信号，因此统一打桩成 200，
 * 把采集焦点留给真正与权限无关的「列错误」。
 */
const stubAdminRpcs = () =>
  page.route('**/rest/v1/rpc/**', async (route) => {
    const url = route.request().url();
    const listShaped = /list_users|existing_subscribers|grant_batches|sensitive/i.test(url);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': listShaped ? '0--1/*' : '0-0/0' },
      body: listShaped ? '[]' : '{}'
    });
  });

const toastText = () =>
  page.evaluate(() => {
    const nodes = document.querySelectorAll(
      '.boh-toast, .toast, [class*="toast"] [class*="message"], [class*="toast"]'
    );
    return [...nodes].map((n) => n.textContent.trim()).filter(Boolean).slice(0, 3);
  });

// ---- 打开面板 ----
const page2 = page;
await page2.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page2.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page2.waitForTimeout(3500); // 等启动期会话检查放完，之后再注 pinia 才是稳态
await stubAdminRpcs();
const roleAfterArm = await armAdminGuard();
await page2.evaluate(() => { location.hash = '#/admin/data-management'; });
await page2.waitForSelector('.admin-shell', { timeout: 30000 });
await page2.waitForTimeout(2500);
await armAdminGuard(); // 幂等，兜底
await page2.waitForTimeout(800);
console.log(`登录态：注入后 role=${roleAfterArm} → 采集时 ${await currentRole()}`);

// ---- 采集侧栏模块（每次读实时 DOM 状态，避免拿到注入前的旧快照）----
const readModules = () =>
  page2.evaluate(() =>
    [...document.querySelectorAll('.g-sidebar .g-nav-btn')].map((b, i) => ({
      index: i,
      label: b.querySelector('.g-nav-label')?.textContent?.trim() || b.textContent.trim(),
      denied: b.classList.contains('is-denied') || b.getAttribute('aria-disabled') === 'true',
      active: b.classList.contains('is-active')
    }))
  );

const modules = await readModules();
console.log(`侧栏模块 ${modules.length} 个: ${modules.map((m) => m.label + (m.denied ? '(禁)' : '')).join(' / ')}`);

const results = [];
const tabTexts = () =>
  page2.evaluate(() =>
    [...document.querySelectorAll('.g-module-tab, .g-tab')].map((e) => e.textContent.trim())
  );

const listTabs = () =>
  page2.evaluate(() =>
    [...document.querySelectorAll('.g-module-tab, .g-tab')].map((b, i) => ({
      index: i,
      label: b.textContent.trim().slice(0, 24),
      active: b.classList.contains('is-active')
    })).filter((t) => t.label)
  );

for (const mod of modules) {
  // 实时复核权限态：注入态可能被会话检查覆盖，届时模块会被置灰
  const live = (await readModules()).find((m) => m.index === mod.index) || mod;
  if (live.denied) {
    console.log(`\n▸ ${mod.label} —— 当前角色无权限（置灰），跳过`);
    continue;
  }

  await armAdminGuard();
  bucket = [];
  const before = await tabTexts();
  const clicked = await page2
    .locator('.g-sidebar .g-nav-btn')
    .nth(mod.index)
    .click({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    console.log(`\n▸ ${mod.label} —— 点击失败/被禁用，跳过`);
    continue;
  }
  // 等页签栏真的换成这个模块的（模块内无页签时可能不变，超时不算失败）
  await page2
    .waitForFunction(
      (prev) => {
        const now = [...document.querySelectorAll('.g-module-tab, .g-tab')].map((e) => e.textContent.trim());
        return JSON.stringify(now) !== JSON.stringify(prev);
      },
      before,
      { timeout: 8000 }
    )
    .catch(() => {});
  await page2.waitForTimeout(2200);

  const tabs = await listTabs();

  if (tabs.length === 0) {
    // 非表格模块（概览 / 装修台 / 系统等），只记录模块级错误
    results.push({ module: mod.label, tab: '(模块首页)', events: [...bucket] });
  } else {
    for (const tab of tabs) {
      await armAdminGuard();
      bucket = [];
      await page2
        .locator('.g-module-tab, .g-tab')
        .nth(tab.index)
        .click({ timeout: 8000 })
        .catch(() => {});
      await page2.waitForTimeout(2200);
      const toasts = await toastText();
      results.push({ module: mod.label, tab: tab.label, toasts, events: [...bucket] });
    }
  }
  const errCount = results.filter((r) => r.module === mod.label).reduce((a, r) => a + r.events.length, 0);
  console.log(`▸ ${mod.label.padEnd(10)} 页签 ${String(tabs.length).padStart(2)} 个 · 事件 ${errCount}`);
}

// 补：把模块级采集里属于各页签的量也算进去（上面已按页签重置 bucket，模块级只留了非表格模块）
await browser.close();

// ---- 汇总 ----
const withErr = results.filter((r) => r.events.length > 0);
const colErrors = [];
const otherErrors = [];

for (const r of results) {
  for (const e of r.events) {
    const row = { module: r.module, tab: r.tab, ...e };
    const isColErr = e.kind === 'rest' && /does not exist|could not find|42703|PGRST204|PGRST200/i.test(`${e.message} ${e.code}`);
    (isColErr ? colErrors : otherErrors).push(row);
  }
}

const dedupe = (list) => {
  const seen = new Map();
  for (const it of list) {
    const k = `${it.module}|${it.tab}|${it.kind}|${it.status || ''}|${(it.message || '').slice(0, 200)}`;
    if (!seen.has(k)) seen.set(k, { ...it, count: 1 });
    else seen.get(k).count += 1;
  }
  return [...seen.values()];
};

const colU = dedupe(colErrors);
const otherU = dedupe(otherErrors);

console.log('\n' + '='.repeat(78));
console.log('数据管理面板 · 运行时查错结果');
console.log('='.repeat(78));
console.log(`扫描页签 ${results.length} 个 · 有事件的 ${withErr.length} 个`);
console.log(`列/schema 类错误 ${colU.length} 类  ·  其它错误 ${otherU.length} 类`);

if (colU.length) {
  console.log('\n──── A. 列 / schema 错误（点击即报，直接对应你说的「列错误」）────');
  for (const e of colU) {
    console.log(`\n  ▸ [${e.module} / ${e.tab}]`);
    console.log(`    HTTP ${e.status}  ${e.code || ''}`);
    console.log(`    ${e.message}`);
    console.log(`    ${e.url}`);
  }
}

if (otherU.length) {
  console.log('\n──── B. 其它运行时错误 ────');
  for (const e of otherU) {
    console.log(`\n  ▸ [${e.module} / ${e.tab}] ${e.kind} ${e.status || ''}`);
    console.log(`    ${(e.message || '').slice(0, 220)}`);
    if (e.url) console.log(`    ${e.url}`);
  }
}

const toastHits = results.filter((r) => (r.toasts || []).length);
if (toastHits.length) {
  console.log('\n──── C. UI 上弹给用户的报错 ────');
  for (const r of toastHits) console.log(`  [${r.module} / ${r.tab}] ${r.toasts.join(' | ')}`);
}

fs.writeFileSync(
  path.join(OUT, 'datamanagement-error-scan.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, results, colErrors: colU, otherErrors: otherU }, null, 2)
);
console.log(`\n明细已写入 ${OUT}/datamanagement-error-scan.json`);
process.exit(colU.length || otherU.length ? 1 : 0);
