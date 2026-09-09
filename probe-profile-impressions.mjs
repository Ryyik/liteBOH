import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：他人空间（/profile/:username）印象 tab 液态玻璃重设计
// 真实用户名从论坛动态抓取；印象数据走路由 mock
// 断言：
//  1) 印象卡渲染：玻璃卡 + 引用角标 + 首字母头像兜底 + @作者(tier 类保留) + 日期
//  2) 空态走 EmptyState（mock 返回空数组时）
//  3) 登录态（他人空间）：发布印象 composer 可见，空文案禁用/输入启用
//  4) 暗色 + 移动端 375
//  5) 无 JS 错误
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const now = Date.now();
const FAKE_ROWS = (ownerId) => ([
  { id: 'pimp-1', content: '老牛不卖，吃草草', created_at: new Date(now - 3 * 864e5).toISOString(), author_id: 'auth-aaaa', target_id: ownerId, author: { username: '雨美菜蕾蕾薾', avatar_url: null } },
  { id: 'pimp-2', content: '全网倒数第一克制渔夫区之人，克制杯前百选手，娱乐赛冠军辅助。', created_at: new Date(now - 2 * 36e5).toISOString(), author_id: 'auth-bbbb', target_id: ownerId, author: { username: '罐铁分子', avatar_url: '' } },
  { id: 'pimp-3', content: '方块之家的最大公约数', created_at: '2026-01-05T10:00:00Z', author_id: 'auth-cccc', target_id: ownerId, author: { username: 'CELLINIA', avatar_url: null } },
  { id: 'pimp-4', content: '超长印象：验证换行与溢出是否得体，中英混排 BOHLITE 2026 与连续中文没有空格的极端场景下卡片依旧优雅。', created_at: new Date(now - 40 * 6e4).toISOString(), author_id: 'auth-dddd', target_id: ownerId, author: { username: 'MinecraftLover', avatar_url: null } }
]);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const launch = async (theme, viewport) => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  if (theme === 'dark') {
    await context.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  return { browser, context, page, errors };
};

const grabRealUsername = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.post-author-v2', { timeout: 25000 });
  const name = await page.evaluate(() => {
    const el = document.querySelector('.post-author-v2');
    return (el?.textContent || '').replace(/^@/, '').trim();
  });
  return name;
};

const openProfileImpressions = async (page, username) => {
  await page.route('**/rest/v1/user_impressions**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const selectCols = decodeURIComponent(url.searchParams.get('select') || '');
    if (selectCols === 'author_id,target_id') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const row = FAKE_ROWS('target-owner').find((r) => r.id === id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row || {}) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_ROWS('target-owner')) });
  });
  await page.goto(`${BASE}/#/profile/${encodeURIComponent(username)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.profile-page', { timeout: 25000 });
  await page.waitForTimeout(1200);
  await page.click('.tab-item:has-text("印象")');
  await page.waitForSelector('.impression-card-profile', { timeout: 15000 });
  await page.waitForTimeout(900);
};

/* ---------- 1) 浅色 ---------- */
{
  const { browser, page, errors } = await launch('light');
  const username = await grabRealUsername(page);
  check('抓到真实用户名', !!username, username);
  await openProfileImpressions(page, username);

  const cards = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.impression-card-profile')];
    return {
      count: els.length,
      authors: els.map((el) => el.querySelector('.imp-author')?.textContent.trim()),
      tierClasses: els.map((el) => el.querySelector('.imp-author')?.className.trim().split(/\s+/).slice(1).join(',') || ''),
      dates: els.map((el) => el.querySelector('.imp-date')?.textContent.trim()),
      initials: els.map((el) => el.querySelector('.imp-avatar i')?.textContent.trim() || null),
      quoteMarks: els.filter((el) => el.querySelector('.imp-quote-mark')).length,
      composer: !!document.querySelector('.add-impression-section'),
      emptyState: !!document.querySelector('.empty-state')
    };
  });
  check('4 张玻璃卡', cards.count === 4, `count=${cards.count}`);
  check('引用角标 4/4', cards.quoteMarks === 4, `${cards.quoteMarks}`);
  check('作者与 tier 类保留', cards.authors.length === 4 && cards.authors.every((a) => a.startsWith('@')), JSON.stringify(cards.authors));
  check('首字母头像兜底', cards.initials.filter(Boolean).length === 4, JSON.stringify(cards.initials));
  check('日期渲染', cards.dates.every((d) => !!d), JSON.stringify(cards.dates));
  check('游客无 composer', !cards.composer);
  await page.evaluate(() => document.querySelector('.impressions-wall-profile')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/profile-impressions-light.png`, clip: { x: 0, y: 0, width: 1280, height: 820 } });
  check('无页面 JS 错误(浅色)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 2) 登录态 composer ---------- */
{
  const { browser, page, errors } = await launch('light');
  const username = await grabRealUsername(page);
  await page.route('**/rest/v1/user_impressions**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const selectCols = decodeURIComponent(url.searchParams.get('select') || '');
    if (selectCols === 'author_id,target_id') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const row = FAKE_ROWS('target-owner').find((r) => r.id === id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row || {}) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_ROWS('target-owner')) });
  });
  await page.goto(`${BASE}/#/profile/${encodeURIComponent(username)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.profile-page', { timeout: 25000 });
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, { id: 'someone-else-id', username: 'probe_visitor', role: 'user', points: 0 });
  });
  await page.waitForTimeout(800);
  await page.click('.tab-item:has-text("印象")');
  await page.waitForSelector('.impression-card-profile', { timeout: 15000 });
  await page.waitForTimeout(700);

  const composer = await page.evaluate(() => {
    const section = document.querySelector('.add-impression-section');
    if (!section) return null;
    const ta = section.querySelector('textarea');
    const btn = section.querySelector('.submit-imp-btn');
    return { present: true, btnDisabled: btn?.disabled };
  });
  check('登录态 composer 可见且空文案禁用', !!composer && composer.btnDisabled === true, JSON.stringify(composer));

  await page.fill('.add-impression-section textarea', '这位伙伴的存档造诣令人佩服，建筑细节控一枚。');
  await page.waitForTimeout(300);
  const charHint = await page.textContent('.char-hint');
  const btnEnabled = await page.evaluate(() => !document.querySelector('.submit-imp-btn')?.disabled);
  check('输入后计数+按钮启用', /^\d+\/100$/.test(String(charHint).trim()) && btnEnabled, `${String(charHint).trim()} enabled=${btnEnabled}`);
  await page.evaluate(() => document.querySelector('.add-impression-section')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/profile-impressions-composer.png`, clip: { x: 0, y: 0, width: 1280, height: 820 } });
  check('无页面 JS 错误(composer 段)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 3) 暗色 ---------- */
{
  const { browser, page, errors } = await launch('dark');
  const username = await grabRealUsername(page);
  await openProfileImpressions(page, username);
  const dark = await page.evaluate(() => {
    const card = document.querySelector('.impression-card-profile');
    const cs = getComputedStyle(card);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      bg: cs.backgroundColor,
      text: getComputedStyle(document.querySelector('.imp-text')).color
    };
  });
  check('暗色主题生效', dark.theme === 'dark', dark.theme);
  check('暗色卡底非白', dark.bg !== 'rgb(255, 255, 255)', dark.bg);
  check('暗色正文可读', dark.text === 'rgb(245, 245, 247)', dark.text);
  await page.evaluate(() => document.querySelector('.impressions-wall-profile')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/profile-impressions-dark.png`, clip: { x: 0, y: 0, width: 1280, height: 820 } });
  check('无页面 JS 错误(暗色)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 4) 移动端 375 ---------- */
{
  const { browser, page } = await launch('light', { width: 375, height: 760 });
  const username = await grabRealUsername(page);
  await openProfileImpressions(page, username);
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.impression-card-profile')];
    const rects = cards.map((c) => c.getBoundingClientRect());
    return { overflow: rects.some((r) => r.right > window.innerWidth + 1), vw: window.innerWidth };
  });
  check('移动端不溢出', !m.overflow, `vw=${m.vw}`);
  await page.evaluate(() => document.querySelector('.impressions-wall-profile')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/profile-impressions-mobile.png`, clip: { x: 0, y: 0, width: 375, height: 760 } });
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' ; '));
  process.exit(1);
}
