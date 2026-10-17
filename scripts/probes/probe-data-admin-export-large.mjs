#!/usr/bin/env node
/**
 * probe-data-admin-export-large.mjs — 全量导出 >1000 行分页路径（plans/027 S2/A 批验收）
 *
 * 真实管理员的线上实测需要登录态，本探针先把 **UI 全链路** 锁住：
 *   mock 一张 1500 行的 news 表（Range 分页 1000/批），从「导出」菜单点
 *   「导出全部筛选结果」，断言：
 *     1. fetchAllRows 分页请求恰好 2 次（0-999、1000-1499，每轮 range 重建）
 *     2. toast 回执「已导出 1500 条（全部筛选结果）」
 *     3. 下载事件触发，文件名 news_all_*.csv
 *     4. 审计 RPC log_admin_action(action=export, meta.count=1500) 已发
 *     5. CSV 行数 = 1500 + 1 表头
 *
 * >1000 行真实库上的最终确认（管理员账号点一次）仍需人工执行，见
 * docs/2026-10-17-修复-数据管理面板-全量检查与验证.md §9。
 *
 * 运行：node scripts/probes/probe-data-admin-export-large.mjs [--strict]
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
const TOTAL = 1500;

const allRows = Array.from({ length: TOTAL }, (_, i) => ({
  id: `bbb00000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  title: `导出验证新闻 ${i + 1}`,
  status: 'published',
  created_at: '2026-01-01T00:00:00.000Z',
}));

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
  acceptDownloads: true,
});
const page = await ctx.newPage();

const rangeCalls = [];
let auditCalls = [];

await page.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const method = route.request().method();
  const accept = route.request().headers().accept || '';

  if (url.includes('/rpc/log_admin_action')) {
    try {
      auditCalls.push(JSON.parse(route.request().postData() || '{}'));
    } catch {
      auditCalls.push({ parse: 'fail' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  }
  if (url.includes('/rpc/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true,"users":3}',
    });
  }
  // postgrest-js 的 .range() 走 offset/limit 查询参数（不是 Range 头）
  if (method === 'GET' && url.includes('news?') && !url.includes('id=eq.')) {
    const u = new URL(url);
    const offset = u.searchParams.get('offset');
    const limit = u.searchParams.get('limit');
    if (offset !== null && limit !== null) {
      const from = Number(offset);
      const to = from + Number(limit) - 1;
      rangeCalls.push({ from, to });
      const batch = allRows.slice(from, from + Number(limit));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': `${from}-${from + batch.length - 1}/${TOTAL}`,
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
        body: JSON.stringify(batch),
      });
    }
  }
  if (accept.includes('vnd.pgrst.object') || url.includes('id=eq.')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      body: JSON.stringify(allRows[0]),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'content-range': `0-2/${TOTAL}`,
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
    },
    body: JSON.stringify(allRows.slice(0, 3)),
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
// 视图可能持久化为卡片，切回表格
await page
  .locator('.g-sheet-foot-tools .view-mode-toggle button', { hasText: '表格' })
  .click()
  .catch(() => {});
await page.waitForTimeout(500);

const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
await page.locator('.toolbar-actions .btn-secondary', { hasText: '导出' }).first().click();
await page.waitForTimeout(400);
await page
  .locator('.row-float-menu .row-float-item', { hasText: '导出全部筛选结果' })
  .first()
  .click();
await page.waitForTimeout(3000);

const toast = await page.evaluate(
  () => document.querySelector('.toast-message')?.innerText?.trim() || '',
);
check('1 toast 回执 1500 条', /已导出 1,?500 条/.test(toast) && /全部筛选结果/.test(toast), toast);

// 列表首查是 limit=20；导出分页是 limit=1000 的整批请求
const pagingCalls = rangeCalls.filter((c) => c.to - c.from + 1 >= 1000);
const pagingOk =
  pagingCalls.length === 2 && pagingCalls[0].from === 0 && pagingCalls[1].from === 1000;
check('2 分页请求 2 次（0-999 / 1000-1499）', pagingOk, JSON.stringify(pagingCalls));

const download = await downloadPromise;
const filename = download.suggestedFilename();
check('3 下载触发且文件名带 _all', /news_all_\d{4}-\d{2}-\d{2}\.csv$/.test(filename), filename);
const path = await download.path();
const { readFileSync } = await import('node:fs');
const csv = readFileSync(path, 'utf8');
const csvLines = csv
  .replace(/^\ufeff/, '')
  .trim()
  .split('\n').length;
check('4 CSV 行数 = 1501（含表头）', csvLines === TOTAL + 1, String(csvLines));

const audit = auditCalls.find((a) => (a.p_action || '') === 'export');
check(
  '5 审计 RPC action=export count=1500',
  Boolean(audit) && Number(audit?.p_meta?.count) === TOTAL && audit?.p_resource_table === 'news',
  JSON.stringify(audit || auditCalls),
);

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
await browser.close();
process.exit(process.argv.includes('--strict') && failed.length ? 1 : 0);
