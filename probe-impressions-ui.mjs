import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：我的印象面板液态玻璃重设计
// 假数据走路由拦截（GET /rest/v1/user_impressions* → 固定 JSON；DELETE → 204）
// 断言：
//  1) 印象卡渲染：4 张玻璃卡、@作者、相对/绝对日期、无头像走首字母兜底、计数副标题
//  2) 移除两步确认：点一下 armed（确认移除胶囊），2.6s 自动收回；armed 后再点 → DELETE 发出 → 卡片移除 + 计数联动
//  3) 空态/骨架：拦截延时可看到骨架（不强断言）；删除到 0 后 EmptyState 文案
//  4) 暗色（boh-theme=dark 注入）：卡片 token 自适应，无硬编码白底残留
//  5) 移动端 375：单列不溢出
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const now = Date.now();
const PROBE_USER_ID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
const FAKE_ROWS = [
  { id: 'imp-1', content: '老牛不卖，吃草草', created_at: new Date(now - 3 * 864e5).toISOString(), author_id: 'auth-aaaa', target_id: PROBE_USER_ID, author: { username: '雨美菜蕾蕾薾', avatar_url: null } },
  { id: 'imp-2', content: '全网倒数第一克制渔夫区之人，克制杯前百选手，娱乐赛冠军辅助，战力天花板。', created_at: new Date(now - 2 * 36e5).toISOString(), author_id: 'auth-bbbb', target_id: PROBE_USER_ID, author: { username: '罐铁分子', avatar_url: '' } },
  { id: 'imp-3', content: '方块之家的最大公约数', created_at: '2026-01-05T10:00:00Z', author_id: 'auth-cccc', target_id: PROBE_USER_ID, author: { username: 'CELLINIA', avatar_url: null } },
  { id: 'imp-4', content: '超长印象：验证换行与溢出是否得体，中英混排 BOHLITE 2026 与连续中文没有空格的极端场景下卡片依旧优雅。', created_at: new Date(now - 40 * 6e4).toISOString(), author_id: 'auth-dddd', target_id: PROBE_USER_ID, author: { username: 'MinecraftLover', avatar_url: null } }
];

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
  const deletedIds = [];
  await context.route('**/rest/v1/user_impressions**', async (route) => {
    const req = route.request();
    if (req.method() === 'DELETE') {
      const url = new URL(req.url());
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      deletedIds.push(id);
      return route.fulfill({ status: 204, body: '' });
    }
    const url = new URL(req.url());
    const selectCols = decodeURIComponent(url.searchParams.get('select') || '');
    if (selectCols === 'author_id,target_id') {
      // 属主校验单行查询（.single()）：select 恰为 author_id,target_id 两列；列表 select 更宽，勿误伤
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const row = FAKE_ROWS.find((r) => r.id === id);
      return route.fulfill({ status: row ? 200 : 406, contentType: 'application/json', body: row ? JSON.stringify(row) : '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${FAKE_ROWS.length - 1}/${FAKE_ROWS.length}` },
      body: JSON.stringify(FAKE_ROWS)
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  return { browser, page, errors, deletedIds };
};

const fakeLogin = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.community-shell .segment-tabs', { timeout: 20000 });
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    // userInfo 是 reactive 对象：必须原地 assign（整对象替换不生效，store 闭包仍指原对象）
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
      points: 0
    });
  });
  await page.waitForTimeout(500);
  await page.click('.community-shell .segment-tab:has-text("印象")');
  await page.waitForSelector('.profile-impression-card:not(.is-skeleton)', { timeout: 15000 });
  await page.waitForTimeout(900);
};

/* ---------- 1) 浅色：渲染 + 两步移除 ---------- */
{
  const { browser, page, errors, deletedIds } = await launch('light');
  await fakeLogin(page);

  const cards = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.profile-impression-card:not(.is-skeleton)')];
    return {
      count: els.length,
      subtitle: document.querySelector('.profile-impressions-subtitle')?.textContent.replace(/\s+/g, '').trim(),
      authors: els.map((el) => el.querySelector('.impression-author-name')?.textContent.trim()),
      dates: els.map((el) => el.querySelector('.impression-date')?.textContent.trim()),
      fallbackInitials: els.map((el) => el.querySelector('.impression-avatar i')?.textContent.trim() || null),
      quoteMarks: els.filter((el) => el.querySelector('.impression-quote-mark')).length
    };
  });
  check('4 张印象卡', cards.count === 4, `count=${cards.count}`);
  check('计数副标题', cards.subtitle?.includes('4') && cards.subtitle.includes('位伙伴'), cards.subtitle);
  check('@作者渲染', JSON.stringify(cards.authors) === JSON.stringify(['@雨美菜蕾蕾薾', '@罐铁分子', '@CELLINIA', '@MinecraftLover']), JSON.stringify(cards.authors));
  check('相对+绝对日期', cards.dates[0]?.includes('天前') && cards.dates[1]?.includes('小时前') && /\d{4}-\d{2}-\d{2}/.test(cards.dates[2] || '') && cards.dates[3]?.includes('分钟前'), JSON.stringify(cards.dates));
  check('无头像首字母兜底', cards.fallbackInitials.filter(Boolean).length === 4, JSON.stringify(cards.fallbackInitials));
  check('引用角标 4/4', cards.quoteMarks === 4, `${cards.quoteMarks}`);
  await page.screenshot({ path: `${OUT}/impressions-light.png`, clip: { x: 0, y: 0, width: 1280, height: 820 } });

  /* 两步移除 */
  // alert 是异步弹出的：等它出现 → 点确认 → 等它消失
  const dismissAlertWhenShown = async () => {
    await page.waitForSelector('.common-alert-overlay', { timeout: 4000 }).catch(() => {});
    const btn = page.locator('.alert-confirm-btn').first();
    if (await btn.count()) {
      await btn.click({ timeout: 3000 }).catch(() => {});
    }
    await page.waitForSelector('.common-alert-overlay', { state: 'detached', timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(200);
  };

  const firstBtn = page.locator('.profile-impression-card:not(.is-skeleton)').first().locator('.impression-remove-btn');
  await firstBtn.click();
  await page.waitForTimeout(300);
  const armed = await page.evaluate(() => {
    const btn = document.querySelector('.profile-impression-card:not(.is-skeleton) .impression-remove-btn');
    return { armed: btn.classList.contains('armed'), text: btn.textContent.trim() };
  });
  check('第一步进入 armed', armed.armed && armed.text.includes('确认移除'), armed.text);
  await page.screenshot({ path: `${OUT}/impressions-armed.png`, clip: { x: 0, y: 0, width: 1280, height: 500 } });

  await page.waitForTimeout(2900);
  const disarmed = await page.evaluate(() => !document.querySelector('.profile-impression-card:not(.is-skeleton) .impression-remove-btn.armed'));
  check('armed 超时自动收回', disarmed);

  // 两步确认删除（成功后有 alert，等它出现后关闭再继续）
  await firstBtn.click();
  await page.waitForTimeout(300);
  await firstBtn.click();
  await dismissAlertWhenShown();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    count: document.querySelectorAll('.profile-impression-card:not(.is-skeleton)').length,
    subtitle: document.querySelector('.profile-impressions-subtitle')?.textContent.replace(/\s+/g, '').trim()
  }));
  check('确认后 DELETE 发出', deletedIds.includes('imp-1'), JSON.stringify(deletedIds));
  check('卡片移除 + 计数联动', after.count === 3 && after.subtitle?.includes('3'), `count=${after.count} subtitle=${after.subtitle}`);

  /* 删空 → EmptyState */
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('.profile-impression-card:not(.is-skeleton)').first().locator('.impression-remove-btn');
    await btn.click();
    await page.waitForTimeout(250);
    await btn.click();
    await dismissAlertWhenShown();
    await page.waitForTimeout(600);
  }
  const emptyText = await page.evaluate(() => document.querySelector('.empty-state')?.textContent.replace(/\s+/g, '').trim() || '');
  check('删空走 EmptyState', emptyText.includes('暂无他人印象'), emptyText.slice(0, 40));
  await page.screenshot({ path: `${OUT}/impressions-empty.png`, clip: { x: 0, y: 0, width: 1280, height: 620 } });

  check('无页面 JS 错误(浅色段)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 2) 暗色 ---------- */
{
  const { browser, page, errors } = await launch('dark');
  await fakeLogin(page);
  const dark = await page.evaluate(() => {
    const card = document.querySelector('.profile-impression-card:not(.is-skeleton)');
    const cs = getComputedStyle(card);
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      bg: cs.backgroundColor,
      color: cs.color,
      isDarkBg: cs.backgroundColor.startsWith('rgb(2') || cs.backgroundColor.startsWith('rgb(1')
    };
  });
  check('暗色主题生效', dark.theme === 'dark', dark.theme);
  check('暗色卡片底色非白', dark.bg !== 'rgb(255, 255, 255)', dark.bg);
  check('暗色文字可读', dark.color === 'rgb(245, 245, 247)' || dark.color.startsWith('rgb(2'), dark.color);
  await page.screenshot({ path: `${OUT}/impressions-dark.png`, clip: { x: 0, y: 0, width: 1280, height: 820 } });
  check('无页面 JS 错误(暗色段)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 3) 移动端 375 单列 ---------- */
{
  const { browser, page } = await launch('light', { width: 375, height: 760 });
  await fakeLogin(page);
  const m = await page.evaluate(() => {
    const grid = document.querySelector('.profile-impressions-grid');
    const cards = [...document.querySelectorAll('.profile-impression-card:not(.is-skeleton)')];
    const rects = cards.map((c) => c.getBoundingClientRect());
    return {
      cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      overflow: rects.some((r) => r.right > window.innerWidth + 1),
      vw: window.innerWidth
    };
  });
  check('移动端单列', m.cols === 1, `cols=${m.cols}`);
  check('移动端不溢出', !m.overflow, `vw=${m.vw}`);
  await page.screenshot({ path: `${OUT}/impressions-mobile.png`, clip: { x: 0, y: 0, width: 375, height: 760 } });
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' ; '));
  process.exit(1);
}
