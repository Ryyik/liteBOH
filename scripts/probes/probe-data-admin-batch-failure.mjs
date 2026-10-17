#!/usr/bin/env node
/**
 * probe-data-admin-batch-failure.mjs — 批量删除「含失败项」场景（plans/027 E6.3 验收）
 *
 * 选中行批量删除走单语句 `delete().in('id', ids).select('id')`（全有或全无），
 * 本探针用 mock PostgREST 构造两种失败形态并断言 UI 行为：
 *   A. 部分未生效：DELETE 200 但只回 1/2 个 id → 必须报「批量删除未完全生效」
 *      且**选中态保留**（不能把没删掉的行从选中里清掉）
 *   B. 整批失败：DELETE 409（FK 约束）→ 报错 toast、选中态保留
 *   C. 对照组：DELETE 200 全部生效 → 成功 toast、选中态清空
 *
 * 运行：node scripts/probes/probe-data-admin-batch-failure.mjs [--strict]
 * 依赖：dev server 5173；假 admin 登录态 + mock PostgREST，不写真实库。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const rows = [
  {
    id: 'aaa00000-0000-4000-8000-000000000001',
    title: '新闻甲',
    status: 'published',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'aaa00000-0000-4000-8000-000000000002',
    title: '新闻乙',
    status: 'published',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'aaa00000-0000-4000-8000-000000000003',
    title: '新闻丙',
    status: 'published',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
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

// 可编程的 DELETE 响应：每个用例前设置
let deleteResponder = null; // ({ids}) => ({ status, body })
let deleteCalls = [];

await page.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const method = route.request().method();
  if (method === 'DELETE' && url.includes('news?')) {
    deleteCalls.push(url);
    const ids = (url.match(/id=in\.\(([^)]*)\)/) || [])[1] || '';
    const res = deleteResponder
      ? deleteResponder(ids.split(','))
      : { status: 200, body: rows.map((r) => ({ id: r.id })) };
    return route.fulfill({
      status: res.status,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      },
      body: JSON.stringify(res.body),
    });
  }
  if (url.includes('/rpc/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true,"users":3}',
    });
  }
  if (url.includes('id=eq.')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      body: JSON.stringify(rows[0]),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'content-range': '0-2/3',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
    },
    body: JSON.stringify(rows),
  });
});
await page.route('**/functions/v1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
);

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(1500);
await page.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  s.isInitialized = true;
  s.isAdmin = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
}, ADMIN_UUID);

await page.goto(`${BASE}/#/admin/data-management?section=data&tab=news`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForSelector('.g-table-sheet tbody tr', { timeout: 30000, state: 'attached' });
await page.waitForTimeout(2000);
// news 的持久化视图默认是卡片视图，切回表格再操作
await page
  .locator('.g-sheet-foot-tools .view-mode-toggle button', { hasText: '表格' })
  .click()
  .catch(() => {});
await page.waitForTimeout(600);
const visInfo = await page.evaluate(() => {
  const scroll = document.querySelector('.g-sheet-table-scroll');
  const tr = document.querySelector('.g-table-sheet tbody tr');
  return {
    scrollDisplay: scroll ? getComputedStyle(scroll).display : null,
    scrollH: scroll ? Math.round(scroll.getBoundingClientRect().height) : null,
    trH: tr ? Math.round(tr.getBoundingClientRect().height) : null,
    viewMode: (() => {
      let c = document.querySelector('.data-management-page')?.__vueParentComponent;
      while (c && !c.setupState?.viewMode) c = c.parent;
      return c ? c.setupState.viewMode : null;
    })(),
  };
});
console.log('VIS:', JSON.stringify(visInfo));

const selectTwoRows = async () => {
  // 重置选择
  const clear = page.locator('.bulk-bar button', { hasText: '清除' });
  if (await clear.count()) {
    await clear
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
  }
  const boxes = page.locator('.g-table-sheet tbody .checkbox-wrapper input');
  await boxes.nth(0).check({ force: true });
  await boxes.nth(1).check({ force: true });
  await page.waitForTimeout(400);
};

const selectedCount = async () =>
  page.evaluate(() => {
    let c = document.querySelector('.data-management-page')?.__vueParentComponent;
    while (c && !c.setupState?.selectedItems) c = c.parent;
    return c ? c.setupState.selectedItems.length : -1;
  });

const readToast = async () => {
  await page.waitForTimeout(500);
  return page.evaluate(() => document.querySelector('.toast-message')?.innerText?.trim() || '');
};

// ── A. 部分未生效 ──
await selectTwoRows();
check('A0 勾选 2 行', (await selectedCount()) === 2, String(await selectedCount()));
deleteResponder = () => ({ status: 200, body: [{ id: rows[0].id }] }); // 只删掉 1/2
await page.locator('.bulk-bar .btn-danger', { hasText: '删除' }).first().click();
await page.waitForTimeout(400);
await page
  .locator('.confirm-btn.primary')
  .click()
  .catch(() => {});
await page.waitForTimeout(600);
const toastA = await readToast();
check('A1 报「未完全生效」', /未完全生效/.test(toastA), toastA);
check('A2 选中态保留', (await selectedCount()) === 2, String(await selectedCount()));

// ── B. 整批失败（FK 409）──
deleteResponder = () => ({
  status: 409,
  body: {
    code: '23503',
    message: 'update or delete on table "news" violates foreign key constraint',
  },
});
await page.locator('.bulk-bar .btn-danger', { hasText: '删除' }).first().click();
await page.waitForTimeout(400);
await page
  .locator('.confirm-btn.primary')
  .click()
  .catch(() => {});
await page.waitForTimeout(600);
const toastB = await readToast();
check('B1 报删除失败', /批量删除失败/.test(toastB), toastB);
check('B2 选中态保留', (await selectedCount()) === 2, String(await selectedCount()));

// ── C. 对照组：全部成功 ──
deleteResponder = ({}) => ({ status: 200, body: rows.slice(0, 2).map((r) => ({ id: r.id })) });
await page.locator('.bulk-bar .btn-danger', { hasText: '删除' }).first().click();
await page.waitForTimeout(400);
await page
  .locator('.confirm-btn.primary')
  .click()
  .catch(() => {});
await page.waitForTimeout(800);
const toastC = await readToast();
check('C1 成功 toast', /批量删除成功/.test(toastC), toastC);
check('C2 选中态清空', (await selectedCount()) === 0, String(await selectedCount()));

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
await browser.close();
process.exit(process.argv.includes('--strict') && failed.length ? 1 : 0);
