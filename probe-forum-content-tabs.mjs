import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：社区段控新增 新闻/活动 页签（用户空间 → 社区）+ 筛选栏只留排序/标签
// 真实入口：/#/user-space?tab=community（论坛以 embedded + externalFeed 握手渲染）
// 断言：
//  1) 社区段控六档：最新/关注/新闻/活动/成员/印象；论坛 host 可见；嵌入态不渲染内部 tab 行
//  2) 点新闻/活动 → 帖子列表请求带 post_kind=in.(news|activity)（服务端下推）；回最新 → 无 kind 过滤
//  3) 筛选下拉只剩 排序方式/标签筛选，摘要不含「全部内容」
//  4) 成员段隐藏论坛 host + 独立布局 class；回最新恢复
//  5) 登录态：关注段发出 user_follows 请求；关注→新闻 一次同步出新 kind 查询
//  6) 暗色（boh-theme=dark 启动注入）：段控/下拉可读、无 JS 错误
//  7) 移动端 375px：段控行不横向溢出
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

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
  const postQueries = [];   // 帖子列表查询（GET /rest/v1/posts?select=*...）完整 URL
  const otherReqs = [];     // 其余 supabase 请求标记
  page.on('request', (req) => {
    const u = req.url();
    if (!u.includes('supabase.co')) return;
    if (/\/rest\/v1\/posts\?select=\*/.test(u) && req.method() === 'GET') {
      postQueries.push(decodeURIComponent(u));
    } else {
      otherReqs.push(u.replace(/^https:\/\/[^/]+/, '').slice(0, 160));
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  return { browser, page, postQueries, otherReqs, errors };
};

const openCommunity = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.community-shell .segment-tabs', { timeout: 20000 });
  await page.waitForTimeout(1500);
};

const segInfo = (page) => page.evaluate(() => {
  const shell = document.querySelector('.community-shell');
  const tabs = [...shell.querySelectorAll('.segment-tab')];
  return {
    labels: tabs.map((t) => t.textContent.trim()),
    active: tabs.filter((t) => t.classList.contains('active')).map((t) => t.textContent.trim())
  };
});

/* ---------- 1) 游客：六档段控 + kind 下推 + 下拉瘦身 ---------- */
{
  const { browser, page, postQueries, errors } = await launch('light');
  await openCommunity(page);
  let seg = await segInfo(page);
  check('段控六档', JSON.stringify(seg.labels) === JSON.stringify(['最新', '关注', '新闻', '活动', '成员', '印象']), JSON.stringify(seg.labels));
  check('默认最新激活', seg.active.includes('最新'), JSON.stringify(seg.active));
  const hostVisible = await page.evaluate(() => {
    const host = document.querySelector('.community-forum-host');
    return !!host && getComputedStyle(host).display !== 'none';
  });
  check('论坛 host 可见', hostVisible);
  check('嵌入态不渲染内部 tab 行', !(await page.$('.feed-mode-tabs')));
  check('最新档无 kind 过滤', postQueries.length > 0 && postQueries.every((u) => !u.includes('post_kind=in.')), `${postQueries.length} 条查询`);

  postQueries.length = 0;
  await page.click('.community-shell .segment-tab:has-text("新闻")');
  await page.waitForTimeout(1700);
  seg = await segInfo(page);
  check('新闻段激活', seg.active.includes('新闻'), JSON.stringify(seg.active));
  check('新闻 kind 下推', postQueries.some((u) => u.includes('post_kind=in.(news)')), postQueries[0]?.match(/post_kind[^&]*/)?.[0] || '无查询');
  await page.screenshot({ path: `${OUT}/community-tabs-news.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } });

  postQueries.length = 0;
  await page.click('.community-shell .segment-tab:has-text("活动")');
  await page.waitForTimeout(1700);
  check('活动 kind 下推', postQueries.some((u) => u.includes('post_kind=in.(activity)')), postQueries[0]?.match(/post_kind[^&]*/)?.[0] || '无查询');
  await page.screenshot({ path: `${OUT}/community-tabs-activity.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } });

  postQueries.length = 0;
  await page.click('.community-shell .segment-tab:has-text("最新")');
  await page.waitForTimeout(1700);
  // getPosts 走 LIST_DATA 短 TTL 缓存：若恰好命中缓存则零查询（缓存内容即无过滤列表，语义正确）
  const backCards = await page.evaluate(() => document.querySelectorAll('.forum-virtual-post').length);
  check('回最新：kind 过滤清空(或缓存命中)', postQueries.every((u) => !u.includes('post_kind=in.')) && backCards > 0,
    `查询=${postQueries.length} 卡片=${backCards}`);

  /* ---------- 筛选下拉 ---------- */
  await page.click('.toolbar-filter-btn');
  await page.waitForTimeout(400);
  const dropdown = await page.evaluate(() => {
    const dd = document.querySelector('.toolbar-filter-dropdown');
    if (!dd) return null;
    return {
      labels: [...dd.querySelectorAll('.filter-dropdown-label')].map((l) => l.textContent.trim()),
      text: dd.textContent
    };
  });
  check('下拉区块=排序+标签', !!dropdown && JSON.stringify(dropdown.labels) === JSON.stringify(['排序方式', '标签筛选']), JSON.stringify(dropdown?.labels));
  check('下拉无内容类型残留', !!dropdown && !dropdown.text.includes('全部内容') && !dropdown.text.includes('内容类型'));
  const summary = await page.textContent('.toolbar-filter-text');
  check('摘要不含类型字样', !String(summary).includes('全部内容'), String(summary).trim());
  await page.screenshot({ path: `${OUT}/community-tabs-dropdown.png`, clip: { x: 360, y: 0, width: 920, height: 800 } });

  /* ---------- 成员段 host 隐藏 / 恢复 ---------- */
  await page.click('.community-shell .segment-tab:has-text("成员")');
  await page.waitForTimeout(900);
  const memberState = await page.evaluate(() => ({
    hostHidden: !document.querySelector('.community-forum-host')
      || getComputedStyle(document.querySelector('.community-forum-host')).display === 'none',
    layoutClass: document.querySelector('.user-space-page').classList.contains('community-tab-active')
  }));
  check('成员段隐藏论坛 host', memberState.hostHidden);
  check('成员段启用独立布局 class', memberState.layoutClass);
  await page.click('.community-shell .segment-tab:has-text("最新")');
  await page.waitForTimeout(700);
  const backState = await page.evaluate(() => ({
    hostVisible: !!document.querySelector('.community-forum-host')
      && getComputedStyle(document.querySelector('.community-forum-host')).display !== 'none',
    layoutClass: document.querySelector('.user-space-page').classList.contains('community-tab-active')
  }));
  check('回最新恢复论坛 host', backState.hostVisible && !backState.layoutClass);

  check('无页面 JS 错误(浅色段)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 2) 登录态：关注流请求 + 关注→新闻 同步 ---------- */
{
  const { browser, page, postQueries, otherReqs, errors } = await launch('light');
  await openCommunity(page);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    pinia.state.value.auth.userInfo = {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
      points: 0
    };
  });
  await page.waitForTimeout(800);
  await page.click('.community-shell .segment-tab:has-text("关注")');
  await page.waitForTimeout(2000);
  const followReq = otherReqs.find((u) => u.includes('user_follows'));
  check('关注段发出 user_follows 请求', !!followReq, followReq || '无');
  check('关注段激活', (await segInfo(page)).active.includes('关注'));

  postQueries.length = 0;
  await page.click('.community-shell .segment-tab:has-text("新闻")');
  await page.waitForTimeout(2000);
  const seg = await segInfo(page);
  check('关注→新闻 段激活', seg.active.includes('新闻'), JSON.stringify(seg.active));
  check('关注→新闻 kind 查询跟进', postQueries.some((u) => u.includes('post_kind=in.(news)')), postQueries[0]?.match(/post_kind[^&]*/)?.[0] || '无查询');
  await page.screenshot({ path: `${OUT}/community-tabs-following-news.png`, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  check('无页面 JS 错误(登录段)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 3) 暗色保真 ---------- */
{
  const { browser, page, errors } = await launch('dark');
  await openCommunity(page);
  const dark = await page.evaluate(() => {
    const activeSeg = document.querySelector('.community-shell .segment-tab.active');
    const toolbar = document.querySelector('.forum-toolbar');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      segActiveColor: activeSeg ? getComputedStyle(activeSeg).color : 'MISSING',
      toolbarColor: toolbar ? getComputedStyle(toolbar).color : 'MISSING'
    };
  });
  check('暗色主题生效', dark.theme === 'dark', dark.theme);
  check('段控激活项亮色文字', dark.segActiveColor !== 'MISSING' && dark.segActiveColor !== 'rgb(29, 29, 31)', dark.segActiveColor);
  await page.click('.toolbar-filter-btn');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/community-tabs-dark-dropdown.png`, clip: { x: 360, y: 0, width: 920, height: 800 } });
  check('无页面 JS 错误(暗色段)', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 4) 移动端 375px ---------- */
{
  const { browser, page } = await launch('light', { width: 375, height: 720 });
  await openCommunity(page);
  const m = await page.evaluate(() => {
    const tabs = document.querySelector('.community-shell .segment-tabs');
    const r = tabs.getBoundingClientRect();
    return { left: r.left, right: r.right, vw: window.innerWidth, scrollW: tabs.scrollWidth, clientW: tabs.clientWidth };
  });
  check('移动端段控不溢出', m.right <= m.vw + 1 && m.left >= -1 && m.scrollW <= m.clientW + 1, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/community-tabs-mobile.png`, clip: { x: 0, y: 0, width: 375, height: 720 } });
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(' ; '));
  process.exit(1);
}
