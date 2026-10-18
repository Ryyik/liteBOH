#!/usr/bin/env node
/**
 * probe-data-admin-detail.mjs — 数据管理详情子页 + 概览 NaN 回归锁（2026-10-17）
 *
 * 锁两条已实证的 bug：
 *   1. 详情路由会重建 DataAdmin；若 currentTab 只读 query.tab，会回落到 users，
 *      导致「编辑」打开用户表抽屉、Danger zone 删 profiles、面包屑/侧栏错模块。
 *      本探针从 /admin/data-management/lotteries/:id 进入，断言：
 *        标题/面包屑/侧栏 = 抽奖；编辑抽屉绑定「抽奖管理」；Danger zone 确认含当前 ID。
 *   2. 概览「待处理事项」曾因旧 tab 的 undefined 求和变成 NaN（tabTotals 只为
 *      tabs 数组建键）。本探针最后回概览页断言 body 不出现 NaN。
 *
 * 运行：node scripts/probes/probe-data-admin-detail.mjs
 * 依赖：dev server 在 5173（BASE 可覆盖）；假 admin 登录态 + 全量 mock PostgREST，
 *       不写真实库、不需要真实 JWT。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
const RECORD_ID = '11111111-1111-4111-8111-111111111111';
const ROW = {
  id: RECORD_ID,
  title: 'E2E 抽奖',
  status: 'open',
  draw_at: '2026-12-01T12:00:00.000Z',
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  entry_count: 0,
  max_entries: 100,
  created_by: ADMIN_UUID,
  // 表单必填字段（缺一个 saveData 就会被 required 校验拦下）
  prize_title: 'E2E 奖品',
  fulfillment_status: 'fulfilled',
  is_community_visible: true,
  is_home_visible: true,
  enforce_account_age_check: false,
  winner_count: 1,
  pity_mode: 'none',
};

const results = [];
const patchCalls = [];
let lastPatch = {};
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

await page.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = req.url();
  const headers = req.headers();
  const wantObject = String(headers.accept || '').includes('vnd.pgrst.object');
  if (url.includes('/rpc/')) {
    if (url.includes('admin_data_management_counts')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, lotteries: 1, lotteryEntries: 0 }),
      });
    }
    if (url.includes('admin_lottery_scheduler_status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          due_count: 0,
          pg_cron_enabled: false,
          job_exists: false,
          job_active: false,
          last_run: null,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  }
  if (req.method() === 'PATCH' && url.includes('id=eq.')) {
    // saveData 的 update：回显已应用的补丁（合并进 ROW）
    let patch = {};
    try {
      patch = JSON.parse(req.postData() || '{}');
    } catch {}
    patchCalls.push(patch);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ ...ROW, ...patch }]),
    });
  }
  if (url.includes('id=eq.')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: wantObject ? {} : { 'content-range': '0-0/0' },
      body: JSON.stringify(wantObject ? { ...ROW, ...lastPatch } : [{ ...ROW, ...lastPatch }]),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/1' },
    body: JSON.stringify([ROW]),
  });
});
await page.route('**/functions/v1/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, message: 'probe noop' }),
  }),
);

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(2000);
await page.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  s.isInitialized = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
}, ADMIN_UUID);

await page.goto(`${BASE}/#/admin/data-management/lotteries/${RECORD_ID}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForSelector('.record-pane', { timeout: 30000 });
await page.waitForTimeout(800);

const crumbs = (await page.locator('.detail-crumbs').innerText()).replace(/\s+/g, ' ');
const title = await page.locator('.detail-title').innerText();
const activeNav = await page.locator('.g-nav-btn.is-active').innerText();
const overviewCount = await page.locator('text=站点运行概览').count();
check('详情页渲染记录标题', title.includes('E2E 抽奖'), title);
check(
  '面包屑=数据管理/抽奖/抽奖管理/记录',
  crumbs.includes('数据管理') && crumbs.includes('抽奖') && crumbs.includes('抽奖管理'),
  crumbs,
);
check('侧栏高亮=抽奖（不是概览）', activeNav.includes('抽奖'), activeNav);
check('详情页不再叠加概览区', overviewCount === 0, `overview nodes=${overviewCount}`);

// ── D2 升级（第二版）：详情页内编辑 = 完整抽屉表单嵌入（Teleport 进槽位） ──
await page.locator('.detail-action-bar button', { hasText: '编辑' }).click();
await page.waitForTimeout(1500);
const dbgState = await page.evaluate(() => ({
  slotHTML: (document.querySelector('#detail-edit-slot')?.innerHTML || '').slice(0, 120),
  overlays: document.querySelectorAll('.drawer-overlay').length,
  embedded: document.querySelectorAll('.drawer-overlay.is-embedded').length,
  toast: document.querySelector('.toast-message')?.innerText?.trim() || '',
  slotExists: Boolean(document.querySelector('#detail-edit-slot')),
}));
console.log('EDIT DBG:', JSON.stringify(dbgState));
await page.waitForSelector('#detail-edit-slot .drawer-overlay.is-embedded', {
  timeout: 10000,
  state: 'attached',
});
const embedVisible = await page.evaluate(() => {
  const el = document.querySelector('#detail-edit-slot .drawer-overlay');
  if (!el) return { v: false, why: 'no el' };
  const r = el.getBoundingClientRect();
  return { v: r.width > 0 && r.height > 0, w: Math.round(r.width), h: Math.round(r.height) };
});
console.log('embedded 可见性:', JSON.stringify(embedVisible));
check('编辑=嵌入完整表单（槽位内）', true);
const overlayCount = await page.locator('.drawer-overlay:not(.is-embedded)').count();
check('编辑不弹遮罩抽屉', overlayCount === 0, `popup=${overlayCount}`);
const formFieldCount = await page
  .locator(
    '#detail-edit-slot .drawer input, #detail-edit-slot .drawer select, #detail-edit-slot .drawer textarea',
  )
  .count();
check('嵌入表单渲染字段', formFieldCount > 0, `widgets=${formFieldCount}`);

// 修改 draw_at（datetime 输入）并保存（mock PATCH 回显）
const drawInput = page.locator('#detail-edit-slot .drawer input#f-lotteries-draw_at');
await drawInput.fill('2026-12-25T18:30');
await page.locator('.detail-action-bar .btn-primary', { hasText: '保存' }).click();
// saveData 会先弹「保存前差异预览」确认（与抽屉一致），确认后才发 PATCH
await page.waitForSelector('.confirm-modal', { timeout: 10000 });
await page.locator('.confirm-btn.primary').click();
await page.waitForTimeout(1500);
const saveToast = await page.evaluate(
  () => document.querySelector('.toast-message')?.innerText?.trim() || '',
);
check('页内保存成功 toast', saveToast.includes('数据更新成功'), saveToast);
check(
  'PATCH 携带新 draw_at',
  patchCalls.some((p) => String(p.draw_at || '').startsWith('2026-12-25')),
  JSON.stringify(patchCalls[patchCalls.length - 1] || {}).slice(0, 140),
);
const embedGone = await page.locator('#detail-edit-slot .drawer.is-embedded').count();
check('保存后回到只读视图', embedGone === 0, `embedded=${embedGone}`);
lastPatch = patchCalls[patchCalls.length - 1] || {};

await page.locator('.detail-aside-card.is-danger button').click();
await page.waitForSelector('.confirm-modal', { timeout: 10000 });
const confirmText = await page.locator('.confirm-message').innerText();
check(
  'Danger zone 确认含当前记录 ID',
  confirmText.includes(RECORD_ID),
  confirmText.replace(/\n/g, ' ').slice(0, 160),
);
await page.locator('.confirm-btn.cancel').click();
await page.waitForTimeout(300);

await page.locator('.detail-header button', { hasText: '返回列表' }).click();
await page.waitForTimeout(1200);
const recordPaneLeft = await page.locator('.record-pane').count();
check('返回列表后详情容器消失', recordPaneLeft === 0, `record-pane=${recordPaneLeft}`);

await page.goto(`${BASE}/#/admin/data-management`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(1800);
const overviewText = await page.locator('body').innerText();
check(
  '概览不再出现 NaN',
  !/\bNaN\b/.test(overviewText),
  (overviewText.split('\n').find((l) => l.includes('待处理事项')) || '').trim(),
);
check('全程零 pageerror', pageErrors.length === 0, pageErrors.join(' | '));

console.log(
  `\n──── 合计 ${results.length} 条，失败 ${results.filter((r) => !r.pass).length} 条 ────`,
);
await browser.close();
process.exit(results.some((r) => !r.pass) ? 1 : 0);
