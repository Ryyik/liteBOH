#!/usr/bin/env node
/**
 * probe-data-admin-density.mjs — 数据管理列表首屏密度（C 批验收探针）
 *
 * 用 mock 的 40 行 users 表格，在 1440×900 / 1280×900 测：
 *   thead 顶部位置、首屏完整可见行数、tab 行高、chips 可见性、真实行高。
 *
 * 验收线（plans/027 阶段 1 + 2.4）：
 *   · thead.top ≤ 240（1440×900）
 *   · 首屏可见行 ≥ 13
 *   · 运营模块 tab 行 ≤ 44px（本探针用 users tab，行高同源）
 *   · 筛选条折叠时 chips 可见
 *   · 标准密度行高 = 42px（34/42/48 三档，默认 42）
 *
 * 默认是**诊断模式**（只打印 PASS/FAIL，exit 0）；`--strict` 用作 C 批门禁。
 * 2026-10-17 实测：thead=414、行高=64、可见 6 行 → C 批未达标（见
 * docs/2026-10-17-审查-数据管理重构-验收与测试指南.md §4.7）。
 *
 * 运行：node scripts/probes/probe-data-admin-density.mjs [--strict]
 * 依赖：dev server 在 5173（BASE 可覆盖）；假 admin 登录态 + 全量 mock PostgREST。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
const rows = Array.from({ length: 40 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  username: `user_${i + 1}`,
  role: i % 7 === 0 ? 'moderator' : 'user',
  points: 100 + i,
  experience: 10 + i,
  join_date: '2026-01-01T00:00:00.000Z',
  bio: '',
  avatar_url: '',
  avatar_frame_url: '',
  tags: [],
}));

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const measure = async (width, height) => {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/')) {
      if (url.includes('admin_data_management_counts')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, users: 40, forum: 137, lotteries: 3 }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-39/40',
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
  await page.waitForTimeout(1800);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
  }, ADMIN_UUID);
  await page.goto(`${BASE}/#/admin/data-management?section=data&tab=users`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('.data-management-page', { timeout: 30000 });
  await page.waitForTimeout(3000);

  const vmState = await page.evaluate(() => {
    let c = document.querySelector('.data-management-page')?.__vueParentComponent;
    while (c && !c.setupState?.totalRecordCount) c = c.parent;
    return c
      ? {
          total: c.setupState.totalRecordCount,
          currentLen: c.setupState.currentData?.length,
          queryTotals: JSON.parse(JSON.stringify(c.setupState.tabQueryTotals || {})),
        }
      : null;
  });
  console.log('VM state:', JSON.stringify(vmState));
  const data = await page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) };
    };
    const thead = document.querySelector('.g-table-sheet thead');
    const theadTop = thead ? Math.round(thead.getBoundingClientRect().top) : null;
    const visibleRows = [...document.querySelectorAll('.g-table-sheet tbody tr')].filter((r) => {
      const b = r.getBoundingClientRect();
      return b.top >= 0 && b.bottom <= window.innerHeight;
    }).length;
    const blocks = [];
    const sels = [
      '.g-topbar',
      '.admin-breadcrumb',
      '.management-section',
      '.g-module-tabs',
      '.toolbar-primary',
      '.toolbar-secondary',
      '.collection-overview',
      '.g-sheet',
      '.g-sheet-head',
      '.g-sheet-body',
      '.g-sheet-table-scroll',
    ];
    for (const sel of sels) {
      const r = rect(sel);
      if (r) blocks.push({ sel, ...r });
    }
    const tabs = document.querySelector('.g-module-tabs');
    const chips = document.querySelector('.collection-overview');
    const chipVisible = Boolean(
      chips &&
      chips.getBoundingClientRect().height > 0 &&
      chips.getBoundingClientRect().width > 0 &&
      getComputedStyle(chips).visibility !== 'hidden',
    );
    return {
      theadTop,
      visibleRows,
      totalRows: document.querySelectorAll('.g-table-sheet tbody tr').length,
      firstRowHeight: Math.round(
        document.querySelector('.g-table-sheet tbody tr')?.getBoundingClientRect().height || 0,
      ),
      cellHeights: [...(document.querySelector('.g-table-sheet tbody tr')?.children || [])].map(
        (td) => ({
          h: Math.round(td.getBoundingClientRect().height),
          cls: td.className,
          text: (td.innerText || '').slice(0, 18),
        }),
      ),
      actionCell: (() => {
        const td = document.querySelector('.g-table-sheet tbody tr .actions-col');
        if (!td) return null;
        const cs = getComputedStyle(td);
        return {
          h: Math.round(td.getBoundingClientRect().height),
          padTop: cs.paddingTop,
          padBottom: cs.paddingBottom,
          lineHeight: cs.lineHeight,
          fontSize: cs.fontSize,
          children: [...td.children].map((el) => ({
            cls: el.className,
            h: Math.round(el.getBoundingClientRect().height),
            w: Math.round(el.getBoundingClientRect().width),
          })),
        };
      })(),
      footerTop: (() => {
        const f = document.querySelector('.g-sheet-foot');
        return f ? Math.round(f.getBoundingClientRect().top) : null;
      })(),
      emptyKind: document.querySelector('.empty-state')?.getAttribute('data-empty-kind') || null,
      tabHeight: tabs ? Math.round(tabs.getBoundingClientRect().height) : null,
      chipVisible,
      blocks,
      innerHeight: window.innerHeight,
      bodyScrollHeight: document.documentElement.scrollHeight,
    };
  });
  await page.screenshot({ path: `debug-screenshots/fix-layout-${width}x${height}.png` });
  await ctx.close();
  return { width, height, ...data };
};

const strict = process.argv.includes('--strict');
const targets = { theadTop: 240, visibleRows: 13, tabHeight: 44, firstRowHeight: 42 };
const summary = [];
for (const [w, h] of [
  [1440, 900],
  [1280, 900],
]) {
  const out = await measure(w, h);
  const checks = [
    {
      name: 'thead.top ≤ 240',
      pass: out.theadTop !== null && out.theadTop <= targets.theadTop,
      value: out.theadTop,
    },
    {
      name: '首屏可见行 ≥ 13',
      pass: out.visibleRows >= targets.visibleRows,
      value: out.visibleRows,
    },
    {
      name: 'tab 行高 ≤ 44',
      pass: out.tabHeight !== null && out.tabHeight <= targets.tabHeight,
      value: out.tabHeight,
    },
    { name: 'chips 可见', pass: out.chipVisible === true, value: out.chipVisible },
    {
      // 42 = 内容 26 + 上下 8px padding；实际节距 43（多 1px tr 分隔线），容差 ±1
      name: '标准密度行高 = 42(±1)',
      pass: Math.abs((out.firstRowHeight || 0) - targets.firstRowHeight) <= 1,
      value: out.firstRowHeight,
    },
  ];
  console.log(`\n=== ${w}×${h} ===`);
  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  -- ${c.value}`);
    summary.push({ viewport: `${w}x${h}`, ...c });
  }
  console.log('blocks:', JSON.stringify(out.blocks));
  console.log('cells:', JSON.stringify(out.cellHeights));
  console.log('action:', JSON.stringify(out.actionCell));
}
const failed = summary.filter((c) => !c.pass);
console.log(`\n──── 合计 ${summary.length} 条，失败 ${failed.length} 条 ────`);
await browser.close();
process.exit(strict && failed.length ? 1 : 0);
