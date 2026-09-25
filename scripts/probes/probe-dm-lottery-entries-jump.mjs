import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：数据管理面板「名单」按钮 → 抽奖报名记录跳转 + 翻页
// 关注：跳转后 lottery_entries 请求是否带 lottery_id 过滤、分页总数是否与过滤结果一致、
//       点下一页后请求与展示是否仍指向同一抽奖
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const ADMIN_ID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const LOTTERY_ID = 'e270e91d-2357-40db-8721-b7f17a32ab0a';
const OTHER_LOTTERY_ID = 'ca31f8e2-a5d4-4398-8b2c-eb72c7b5dad2';
const ENTRY_TOTAL = 25; // 目标抽奖 25 人报名 → 至少 2 页（pageSize 20）

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const LOTTERY_ROW = {
  id: LOTTERY_ID,
  title: '中秋节抽奖',
  description: '探针用',
  prize_title: '瑞幸咖啡9.9X1',
  prize_description: '',
  cover_image_url: '',
  status: 'open',
  is_community_visible: true,
  is_home_visible: false,
  enforce_account_age_check: false,
  max_entries: null,
  winner_count: 1,
  entry_count: ENTRY_TOTAL,
  entry_deadline_at: '2026-09-25T14:00:00+00:00',
  draw_at: '2026-09-25T14:00:00+00:00',
  drawn_at: null,
  winner_user_id: null,
  winner_username: '',
  created_at: '2026-09-25T10:53:36+00:00',
  updated_at: '2026-09-25T10:53:36+00:00',
  pity_mode: 'count_only',
  pity_winner_count: null,
  pity_reward_title: '',
  pity_reward_description: '',
  pity_overflow_reward_title: '',
  pity_overflow_reward_description: '',
  fulfillment_status: 'pending_contact',
  draw_attempted_at: null,
  draw_failed_at: null,
  draw_failure_message: '',
  draw_candidate_hash: '',
  draw_algorithm_version: ''
};

const makeEntries = (lotteryId, count) => Array.from({ length: count }, (_, i) => ({
  id: `1111111${i % 10}-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`,
  lottery_id: lotteryId,
  user_id: `2222222${i % 10}-2222-4222-8222-2222222222${String(i).padStart(2, '0')}`,
  username_snapshot: `报名用户${i + 1}`,
  created_at: `2026-09-25T10:${String(10 + (i % 45)).padStart(2, '0')}:00+00:00`,
  lottery: { title: lotteryId === LOTTERY_ID ? '中秋节抽奖' : '七夕·方块之家抽奖' },
  profile: { username: `报名用户${i + 1}`, join_date: '2026-01-01' }
}));

const entryRequests = [];
const allRequests = [];

const setupRoutes = async (page) => {
  // ⚠️ Playwright 的 route 处理器按「注册逆序」匹配：后注册的先命中。
  // 因此 catch-all 必须最先注册，具体路由后注册才能生效。
  await page.route('**/rest/v1/**', async (route) => {
    allRequests.push(route.request().url());
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/0' },
      body: JSON.stringify([])
    });
  });
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const url = route.request().url();
    let body = {};
    if (url.includes('admin_lottery_entry_counts')) {
      // 真实返回 setof，必须给数组：客户端做 (rows || []).forEach
      body = [{ lottery_id: LOTTERY_ID, entry_count: ENTRY_TOTAL }];
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify(body)
    });
  });
  await page.route('**/rest/v1/profiles*', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/1' },
      body: JSON.stringify([{ id: ADMIN_ID, username: '瑞一颗', points: 100, role: 'admin', avatar_url: null }])
    });
  });
  await page.route('**/rest/v1/lotteries*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const url = route.request().url();
    const single = /id=eq\./.test(url);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/1' },
      body: JSON.stringify(single ? [LOTTERY_ROW] : [LOTTERY_ROW])
    });
  });
  // 注意：/lotteries 与 /lottery_entries 是两个 path，pattern 不会互相误伤
  await page.route('**/rest/v1/lottery_entries*', async (route) => {
    const url = route.request().url();
    entryRequests.push(url);
    // or=(...) 语法里字段是点号形式（lottery_id.eq.<uuid>）；顶层过滤才是 lottery_id=eq.<uuid>。
    // 两者都要认，否则带过滤的请求会被当成全量查询，count 与页数全错。
    const matches = url.match(/lottery_id(?:\.|=)eq\.([0-9a-f-]{36})/i);
    const filteredId = matches ? matches[1] : null;
    const rows = filteredId
      ? makeEntries(filteredId, filteredId === LOTTERY_ID ? ENTRY_TOTAL : 3)
      : [...makeEntries(LOTTERY_ID, ENTRY_TOTAL), ...makeEntries(OTHER_LOTTERY_ID, 30)];
    const total = rows.length;
    const from = Number((url.match(/offset=(\d+)/) || [])[1] || 0);
    const to = from + 19;
    const pageRows = rows.slice(from, to + 1);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: {
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Range': `${from}-${Math.min(to, Math.max(total - 1, 0))}/${total}`
      },
      body: JSON.stringify(pageRows)
    });
  });
};

const login = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, role: 'admin', avatarUrl: '' });
  }, ADMIN_ID);
  await page.evaluate(() => { location.hash = '#/admin/data-management'; });
  await page.waitForSelector('.admin-shell', { timeout: 30000 });
  await page.waitForTimeout(1200);
};

const gotoLotteriesTab = async (page) => {
  // 侧栏 module 入口文本为「抽奖」
  const mod = page.locator('.admin-sidebar button, aside button, nav button', { hasText: /^抽奖$/ }).first();
  if (await mod.count()) {
    await mod.click();
  } else {
    await page.locator('button', { hasText: /^抽奖$/ }).first().click();
  }
  await page.waitForTimeout(2500);
  // 若进入后落在子 tab 而非「抽奖活动」列表，再点一次子 tab
  const subTab = page.locator('[class*="module-tab"], [class*="sub-tab"], [class*="tab"] button', { hasText: /^抽奖活动$/ }).first();
  if (await subTab.count()) {
    await subTab.click();
    await page.waitForTimeout(2000);
  }
};

const readState = (page) => page.evaluate(() => {
  const q = (sel) => document.querySelector(sel);
  const tableRows = [...document.querySelectorAll('table tbody tr')];
  // ⚠️ 顶栏「全局搜索」输入框 placeholder 也含「搜索」，必须按主列表的 placeholder 精确定位
  const searchInput = [...document.querySelectorAll('input')]
    .find((el) => (el.getAttribute('placeholder') || '').includes('搜索数据'));
  const paginationText = q('.g-sheet-foot-text')?.textContent?.trim() || '';
  const pageButtons = [...document.querySelectorAll('.g-pager-item')]
    .map((b) => ({ text: b.textContent.trim().slice(0, 8), disabled: b.disabled, label: b.getAttribute('aria-label') || '' }));
  return {
    activeTab: [...document.querySelectorAll('[class*="module-tab"].is-active, .g-module-tab.is-active')]
      .map((el) => el.textContent.trim()).join(' | '),
    search: searchInput ? searchInput.value : '(未找到搜索框)',
    rowCount: tableRows.length,
    firstRowText: (tableRows[0]?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    paginationText,
    pageButtons,
    hasPagination: Boolean(q('.g-pager'))
  };
});

const run = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  await setupRoutes(page);

  try {
    await login(page);
    await gotoLotteriesTab(page);
    await page.screenshot({ path: `${OUT}/dm-lottery-entries-1-list.png` });

    const before = await readState(page);
    console.log('\n===== 抽奖列表（跳转前）=====');
    console.log(JSON.stringify(before, null, 2));

    // 点「名单」按钮
    const nameBtn = page.locator('button', { hasText: /^名单$/ }).first();
    if (!(await nameBtn.count())) {
      check('找到「名单」按钮', false, '按钮未渲染');
      await browser.close();
      return;
    }
    entryRequests.length = 0;
    await nameBtn.click();
    await page.waitForTimeout(2500);

    const after = await readState(page);
    console.log('\n===== 跳转后状态 =====');
    console.log(JSON.stringify(after, null, 2));
    console.log('\n===== 跳转后 lottery_entries 请求 =====');
    entryRequests.forEach((u) => console.log('  ' + decodeURIComponent(u)));
    await page.screenshot({ path: `${OUT}/dm-lottery-entries-2-jumped.png` });

    const jumpReq = entryRequests[0] || '';
    check('跳转后搜索框带回抽奖 id', after.search === LOTTERY_ID, `search="${after.search}"`);
    // 组件级 key 若回到 route.fullPath，切表会销毁重建 DataAdmin，
    // onMounted 的 fetchData 会补发一次列表请求（实测 2 次）——
    // 这条断言把这个坑钉死，防止第三次复发。
    // 注意：request.url() 是编码后的（逗号会变 %2C），必须先解码再匹配列名。
    const listReqs = entryRequests
      .map((u) => decodeURIComponent(u))
      .filter((u) => u.includes('select=id,lottery_id'));
    check('切表只发 1 次列表请求（组件未被重建）', listReqs.length === 1, `列表请求 ${listReqs.length} 次`);
    // 搜索走 or=(...) 语法，字段是点号形式：lottery_id.eq.<uuid>
    check('lottery_entries 请求带 lottery_id 过滤', jumpReq.includes(`lottery_id.eq.${LOTTERY_ID}`), decodeURIComponent(jumpReq).slice(0, 200));
    check('跳转后列表只显示该抽奖报名（首行是报名用户）', /报名用户/.test(after.firstRowText), after.firstRowText);
    check('分页总数 = 该抽奖报名数（25）', /25/.test(after.paginationText), after.paginationText);

    // 翻页
    const nextBtn = page.locator('.g-pager-item[aria-label="Next page"]').first();
    entryRequests.length = 0;
    if (await nextBtn.count()) {
      check('分页控件存在（可翻页）', true, `pageButtons=${JSON.stringify(after.pageButtons)}`);
      await nextBtn.click();
    } else {
      check('分页控件存在（可翻页）', false, JSON.stringify(after.pageButtons));
    }
    await page.waitForTimeout(2500);

    const paged = await readState(page);
    console.log('\n===== 翻页后状态 =====');
    console.log(JSON.stringify(paged, null, 2));
    console.log('\n===== 翻页后 lottery_entries 请求 =====');
    entryRequests.forEach((u) => console.log('  ' + decodeURIComponent(u)));
    await page.screenshot({ path: `${OUT}/dm-lottery-entries-3-page2.png` });

    const pageReq = entryRequests[0] || '';
    check('翻页仍带 lottery_id 过滤', pageReq.includes(`lottery_id.eq.${LOTTERY_ID}`), decodeURIComponent(pageReq).slice(0, 200));
    check('第 2 页显示剩余 5 条（25 - 20）', paged.rowCount === 5, `rowCount=${paged.rowCount} pagination="${paged.paginationText}"`);
    check('翻页后分页口径仍是筛选结果总数（25）', /\/ 共 25 条/.test(paged.paginationText), paged.paginationText);
    check('翻页后首行仍属该抽奖', /报名用户/.test(paged.firstRowText), paged.firstRowText);

    check('流程无 JS 报错', errs.length === 0, errs.join(' | ').slice(0, 200));
  } catch (e) {
    check('探针流程', false, String(e.message).slice(0, 200));
    await page.screenshot({ path: `${OUT}/dm-lottery-entries-failure.png` }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${results.length} PASS`);
};

await run();
