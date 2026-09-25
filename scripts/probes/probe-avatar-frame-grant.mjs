import { chromium } from 'playwright';

// 探针：头像框「按人发放」
//   1) 控制台档位下拉含「活动限定」
//   2) 「按人发放」可用：输入用户名 → 按钮可用 → 点击发出正确的 RPC 参数 → 成功反馈
//   3) 装扮页对 limit 框：未在台账 → is-locked；在台账 → 可佩戴
// 全程 mock 后端，不触碰线上数据。
//
// ⚠️ Playwright 的 page.route 按「注册逆序」匹配：具体路由必须注册在 catch-all / rpc 通配之后。

const BASE = 'http://localhost:5173';
const ADMIN_ID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const TARGET_ID = '51bfaddb-b3ad-4f3d-ae43-56ca37837779';
const TARGET_NAME = '小牛无聊';
const FRAME_ID = 'lottery-probe';
const FRAME_NAME = '抽奖专属探针框';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const FRAME_ROW = {
  id: FRAME_ID, name: FRAME_NAME, description: '探针用',
  url: '/avatars/frames/elf-flower-frame.png', source_url: '', scale: 2.08,
  tier: 'limit', free_until: null, points_price: null, sort_order: 100,
  status: 'published', ring: '#e8734a',
  created_at: '2026-09-25T00:00:00+00:00', updated_at: '2026-09-25T00:00:00+00:00'
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const grantCalls = [];
const eqQueries = [];   // 记下「按用户名反查」的请求 —— 从候选点选后就不该再有它

const setupRoutes = async (page, ownedIds = []) => {
  // ① 兜底最先注册（逆序匹配下最后命中）
  await page.route('**/rest/v1/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/0' }, body: '[]',
  }));
  // ② rpc 通配
  await page.route('**/rest/v1/rpc/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Expose-Headers': 'Content-Range' }, body: JSON.stringify([]),
  }));
  // ③ 具体 rpc（必须晚于通配注册）
  await page.route('**/rest/v1/rpc/grant_avatar_frame', async (route) => {
    grantCalls.push(route.request().postDataJSON() || {});
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify({ ok: true, source: 'lottery' }),
    });
  });
  await page.route('**/rest/v1/rpc/list_my_avatar_frame_unlocks', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Expose-Headers': 'Content-Range' },
    body: JSON.stringify(ownedIds),
  }));
  // ④ 表
  await page.route('**/rest/v1/profiles*', async (route) => {
    const url = route.request().url();
    // 用户搜索（searchGrantTargetUsers）：PostgREST 语法是 `username=ilike.值`（点号！不是等号）
    if (url.includes('=ilike.')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/1' },
        body: JSON.stringify([{ id: TARGET_ID, username: TARGET_NAME, points: 12, role: 'user' }]),
      });
      return;
    }
    if (url.includes('username=eq.')) {
      eqQueries.push(url);
      await route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/1' },
        body: JSON.stringify({ id: TARGET_ID, username: TARGET_NAME }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/1' },
      body: JSON.stringify([{ id: ADMIN_ID, username: '瑞一颗', points: 100, role: 'admin', avatar_url: null }]),
    });
  });
  await page.route('**/rest/v1/avatar_frames*', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/1' },
    body: JSON.stringify([FRAME_ROW]),
  }));
};

const loginAsAdmin = async (page) => {
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
};

const withPage = async (fn, ownedIds = []) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  await setupRoutes(page, ownedIds);
  try {
    await loginAsAdmin(page);
    await fn(page, errs);
  } finally {
    await context.close();
  }
};

// ---------- 1) 控制台 ----------
await withPage(async (page, errs) => {
  await page.evaluate(() => { location.hash = '#/admin/avatar-console'; });
  await page.waitForSelector('.afc-lib-item', { timeout: 25000 });
  await page.waitForTimeout(1200);

  const options = await page.evaluate(() => [...document.querySelectorAll('select option')].map((o) => o.value));
  check('控制台档位含 limit（活动限定）', options.includes('limit'), `options=${JSON.stringify(options.slice(0, 6))}`);

  await page.locator('.afc-lib-item').first().click();
  await page.waitForTimeout(900);
  await page.selectOption('select:has(option[value="limit"])', 'limit');
  await page.waitForTimeout(400);

  const hintShown = await page.evaluate(() =>
    [...document.querySelectorAll('.hint')].some((el) => el.textContent.includes('活动限定框不会按档位放开')));
  check('选 limit 后出现「不按档位放开」说明', hintShown);

  const grantInput = page.locator('.afc-user-search input').first();
  check('存在「按人发放」搜索输入区', (await grantInput.count()) > 0);

  const grantBtn = page.locator('button', { hasText: /^发放/ }).first();
  check('存在发放按钮', (await grantBtn.count()) > 0);
  check('未填目标时按钮禁用', await grantBtn.isDisabled());

  // ① 搜用户列表：输用户名片段 → 出候选（不再要求一字不差地填用户名）
  await grantInput.fill('小牛');
  await page.waitForTimeout(1400);
  const items = await page.locator('.afc-user-item').count();
  const firstItem = (await page.locator('.afc-user-item').first().innerText().catch(() => '')).replace(/\n/g, ' ');
  check('输入片段后列出候选用户', items >= 1 && firstItem.includes(TARGET_NAME), `items=${items} first=${firstItem}`);
  check('候选带 ID 前缀（防同名发错人）', /[0-9a-f]{8}/.test(firstItem), firstItem);
  await page.locator('.afc-user-item').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'debug-screenshots/avatar-grant-user-search.png' });

  // ② 点选候选 → 进入已选中态，列表收起
  eqQueries.length = 0;
  await page.locator('.afc-user-item').first().click();
  await page.waitForTimeout(400);
  check('点候选后进入「已选中」态', (await page.locator('.afc-user-flag.ok').count()) === 1);
  check('选中后候选列表收起', (await page.locator('.afc-user-item').count()) === 0);
  check('填入目标后按钮可用', !(await grantBtn.isDisabled()));

  grantCalls.length = 0;
  await grantBtn.click();
  await page.waitForTimeout(1500);

  const call = grantCalls[0] || {};
  check('发放调用 grant_avatar_frame 一次', grantCalls.length === 1, JSON.stringify(grantCalls));
  check('RPC 参数正确（user / frame / source）',
    call.p_user_id === TARGET_ID && call.p_frame_id === FRAME_ID && call.p_source === 'lottery',
    JSON.stringify(call));
  check('点选路径直接用候选 id，不再按用户名反查', eqQueries.length === 0, `eq=${JSON.stringify(eqQueries)}`);

  const okText = await page.evaluate(() => document.querySelector('.afc-notice')?.textContent || '');
  check('展示发放成功反馈（含用户名与来源）', /已发放给/.test(okText) && /小牛无聊/.test(okText) && /lottery/.test(okText), okText.slice(0, 100));

  // ③ 兜底：手填 UUID 仍然能用（不依赖搜索）
  grantCalls.length = 0;
  await grantInput.fill(TARGET_ID);
  await page.waitForTimeout(900);
  await grantBtn.click();
  await page.waitForTimeout(1500);
  check('手填 UUID 的兜底路径仍可用', (grantCalls[0] || {}).p_user_id === TARGET_ID, JSON.stringify(grantCalls[0] || {}));

  check('控制台零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 150));
});

// ---------- 2) 装扮页：未发放 → 锁定 ----------
const openAssets = async (page) => {
  await page.evaluate(() => { location.hash = '#/user-space?tab=assets'; });
  await page.waitForTimeout(4000);
  // 资产中心内的「装扮」子 tab 才是 AvatarFrameGrid 的宿主
  const decorTab = page.getByRole('tab', { name: '装扮' }).first();
  if (await decorTab.count()) {
    await decorTab.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1800);
  }
  return page.evaluate(() => Boolean(document.querySelector('.afg-grid')));
};

const readCard = (page) => page.evaluate((name) => {
  // 排除占位卡（div.afg-card.is-placeholder）
  const cards = [...document.querySelectorAll('button.afg-card')];
  const el = cards.find((c) => (c.querySelector('.afg-card-name')?.textContent || '').includes(name));
  const dump = {
    hash: location.hash,
    hasGrid: Boolean(document.querySelector('.afg-grid')),
    cardCount: cards.length,
    names: cards.map((c) => (c.querySelector('.afg-card-name')?.textContent || '').trim()).slice(0, 10)
  };
  if (!el) return { found: false, ...dump };
  return {
    found: true, ...dump,
    locked: el.classList.contains('is-locked'),
    lockPill: (el.querySelector('.afg-lock-pill')?.textContent || '').trim(),
    text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)
  };
}, FRAME_NAME);

await withPage(async (page, errs) => {
  const ok = await openAssets(page);
  check('装扮页渲染出框网格（.afg-root）', ok, ok ? '' : '未渲染，见下条 dump');
  const card = await readCard(page);
  check('装扮页能定位到该框卡片', card.found, JSON.stringify(card));
  check('未发放：卡片为锁定态（is-locked）', card.found && card.locked === true, JSON.stringify(card));
  check('装扮页零 pageerror（未发放）', errs.length === 0, errs.join(' | ').slice(0, 150));
}, []);

// ---------- 3) 装扮页：已发放 → 可佩戴 ----------
await withPage(async (page, errs) => {
  const ok = await openAssets(page);
  check('装扮页渲染出框网格（已发放轮）', ok, ok ? '' : '未渲染');
  const card = await readCard(page);
  check('已发放：卡片解除锁定（可佩戴）', card.found && card.locked === false, JSON.stringify(card));
  check('装扮页零 pageerror（已发放）', errs.length === 0, errs.join(' | ').slice(0, 150));
}, [FRAME_ID]);

await browser.close();

const passCount = results.filter((r) => r.pass).length;
console.log(`\n${passCount}/${results.length} PASS`);
process.exit(passCount === results.length ? 0 : 1);
