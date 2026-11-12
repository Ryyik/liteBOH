#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：数据管理面板「按功能名找入口」（2026-11-12 用户报障）
//
// 用户原话：「数据管理面板还是不能通过搜索来查找功能，感觉很不方便」。
//
// 改前的三条搜索路径没有一条能落到「功能」上：
//   ① 侧栏「筛选模块…」只过滤 10 个 tabModules 的 label/description
//      ⇒ 搜「积分发放」「补发」「头像框」一律「无匹配模块」；
//   ② 工具栏搜索框搜的是**记录**，功能名只挂在「全部表」范围下；
//   ③ ⌘K 自己写了一段 `for (const tab of tabs)` 匹配，最多 3 条，
//      走不到独立控制台页（商城装修 / 资讯编辑 / 开屏管理 / 头像框），也不认别名。
//
// 本探针守的是**能不能搜到、点了能不能到**这两件事（纯逻辑部分由
// tests/unit/admin-function-index.test.js 覆盖；这里只测真实渲染与真实点击）：
//   A 侧栏搜「补发」→ 出现「功能」组，含 积分发放 / 订阅发放（别名命中）
//   B 点「积分发放」→ URL 落到 tab=points-grant，页面型 tab 真的渲染出来；
//      且关键词被清掉（侧栏不能停在过滤态，否则刚打开的页看不见高亮）
//   C 搜「头像」→ 独立控制台页「头像框」在结果里（改前 ⌘K 与侧栏都找不到）
//   D 搜无关词 → 明确告知没有匹配，而不是静默空白
//   E 键盘：输入后直接 ↵ 打开第一条
//   F ⌘K：同一份索引，搜「补发」也能打开「积分发放」
//   G 全程零 pageerror
//
// 前置：Vite dev server 已启动（默认 http://localhost:5173，BASE 可覆盖）
// 运行：node scripts/probes/probe-admin-function-search.mjs
//
// counter-proof（手动，任一都必须让对应断言转红）：
//   1) AdminSidebar 里去掉 functions 那组渲染 → A*/C* 红（功能名搜不出来）
//   2) DataAdmin 的 handleFunctionClick 改成 no-op → B*/E*/F* 红（点了没反应）
//   3) function-index.js 去掉 TAB_ALIASES['points-grant'] 的「补发」→ A* 红（只剩原文命中）
// =====================================================================
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'debug-screenshots/admin-function-search';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log(`✅ ${name}`);
  } else {
    fail += 1;
    console.log(`❌ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const errors = [];
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
page.on('pageerror', (err) => errors.push(String(err)));

/** 全量 mock PostgREST：本探针只关心导航，不关心数据内容 */
await page.route('**/rest/v1/**', (route) => {
  const url = route.request().url();
  if (url.includes('/rpc/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'content-range': '0-0/0',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range',
    },
    body: '[]',
  });
});
await page.route('**/functions/v1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
);

const SEARCH = '.g-sidebar-search-input';
const FN_ROWS = '.g-sidebar .g-nav-fn';

const fnLabels = () =>
  page.$$eval(FN_ROWS, (els) =>
    els.map((el) => el.querySelector('.g-nav-label')?.textContent?.trim()),
  );

const fnModules = () =>
  page.$$eval(FN_ROWS, (els) =>
    els.map((el) => el.querySelector('.g-nav-fn-module')?.textContent?.trim()),
  );

const search = async (keyword) => {
  await page.fill(SEARCH, keyword);
  await page.waitForTimeout(450);
};

try {
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
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
  }, ADMIN_UUID);
  await page.goto(`${BASE}/#/admin/data-management?section=data&tab=users`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('.data-management-page', { timeout: 30000 });
  await page.waitForSelector(SEARCH, { timeout: 30000 });
  await page.waitForTimeout(2500);

  // ---------- A 别名命中 ----------
  await search('补发');
  const aliasHits = await fnLabels();
  const aliasModules = await fnModules();
  check(
    'A1 搜「补发」出现功能结果（不是「无匹配模块」）',
    aliasHits.length >= 2,
    `hits=${JSON.stringify(aliasHits)}`,
  );
  check('A2 命中「积分发放」', aliasHits.includes('积分发放'), JSON.stringify(aliasHits));
  check('A3 命中「订阅发放」', aliasHits.includes('订阅发放'), JSON.stringify(aliasHits));
  check(
    'A4 每条结果都标了所属模块（回答「这页在哪」）',
    aliasModules.every((label) => Boolean(label)),
    JSON.stringify(aliasModules),
  );
  const statusText = await page.textContent('.g-sidebar-search-status');
  check('A5 状态行给出「找到 N 个功能」', /找到\s*\d+\s*个功能/.test(statusText || ''), statusText);
  await page.screenshot({ path: `${OUT}/A-alias-补发.png` });

  // ---------- B 点击真的跳过去 ----------
  const grantIndex = aliasHits.indexOf('积分发放');
  await page.locator(FN_ROWS).nth(grantIndex).click();
  await page.waitForTimeout(1600);
  const url = page.url();
  check('B1 跳到 tab=points-grant', url.includes('tab=points-grant'), url);
  const pageTabReady = await page.evaluate(() => {
    const box = document.querySelector('.page-tab-container');
    return Boolean(box && box.getBoundingClientRect().height > 40);
  });
  check('B2 页面型 tab 真的渲染出来了（不是空白内容区）', pageTabReady);
  const cleared = await page.inputValue(SEARCH);
  check('B3 跳转后关键词被清掉（侧栏回到完整导航）', cleared === '', cleared);
  const moduleLabelBack = await page.evaluate(() => document.querySelectorAll('.g-nav-btn').length);
  check('B4 侧栏恢复成模块导航（不再是过滤态）', moduleLabelBack >= 8, `rows=${moduleLabelBack}`);
  await page.screenshot({ path: `${OUT}/B-jumped-points-grant.png` });

  // ---------- C 独立控制台页 ----------
  await search('头像');
  /* 「头像框」既是模块又带别名，落在模块组还是功能组都可以 ——
     用户要的是「搜得到」，所以按整条侧栏的可见行来断言，不锁死分组。 */
  const avatarRows = await page.$$eval('.g-sidebar .g-nav-btn', (els) =>
    els.map((el) => el.querySelector('.g-nav-label')?.textContent?.trim()),
  );
  check(
    'C1 搜「头像」能找到「头像框」控制台页',
    avatarRows.includes('头像框'),
    JSON.stringify(avatarRows),
  );
  await page.screenshot({ path: `${OUT}/C-avatar-console.png` });

  /* 同一个模块不许在「功能」和「模块」两组里各出现一次：
     搜「积分」时两个「用户」会让人以为这是两个不同的东西。 */
  await search('积分');
  const dupFn = await fnLabels();
  const dupModules = await page.$$eval('.g-sidebar-group', (groups) =>
    groups
      .filter((g) => g.querySelector('.g-sidebar-group-label')?.textContent?.trim() === '数据管理')
      .flatMap((g) => [...g.querySelectorAll('.g-nav-label')].map((el) => el.textContent?.trim())),
  );
  check(
    'C2 模块组里已有的「用户」不在功能组里重复出现',
    dupFn.includes('积分发放') && !dupFn.includes('用户') && dupModules.includes('用户'),
    `fn=${JSON.stringify(dupFn)} modules=${JSON.stringify(dupModules)}`,
  );

  // ---------- D 无匹配时给明确反馈 ----------
  await search('zzzz没有这个功能');
  const emptyHits = await fnLabels();
  const emptyText = await page.textContent('.g-sidebar-empty');
  check(
    'D1 无匹配时既不出结果、也不静默（有明确文案）',
    emptyHits.length === 0 && /换/.test(emptyText || ''),
    `hits=${emptyHits.length} text=${emptyText}`,
  );

  // ---------- E 键盘直接打开 ----------
  await search('广告');
  const adHits = await fnLabels();
  check('E1 搜「广告」命中广告管理', adHits.includes('广告管理'), JSON.stringify(adHits));
  await page.focus(SEARCH);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  check('E2 ↵ 直接打开第一条（不用先点它）', page.url().includes('tab=ads'), page.url());

  // ---------- F ⌘K 共用同一份索引 ----------
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.command-palette-input', { timeout: 8000 });
  await page.fill('.command-palette-input', '补发');
  await page.waitForTimeout(700);
  const paletteLabels = await page.$$eval('.command-palette-label', (els) =>
    els.map((el) => el.textContent?.trim()),
  );
  check(
    'F1 ⌘K 里搜「补发」也能看到「积分发放」（同一份功能索引）',
    paletteLabels.some((label) => label && label.includes('积分发放')),
    JSON.stringify(paletteLabels.slice(0, 6)),
  );
  await page.screenshot({ path: `${OUT}/F-command-palette.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---------- G ----------
  check('G1 全程零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
