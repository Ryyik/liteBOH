import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：4.9.1 回退通道移除 + Beta 6 版本页冒烟
// 断言：
//  1) 版本页：标题「版本」、含「BOH Beta 6」介绍、无「兼容模式/回退」字样、无开关
//  2) 导航：浅色/暗色截图（去前缀后视觉对照）且 .scrolled class 不再出现
//  3) 资产页：SegmentTabs 渲染（tabGroups 收敛后）
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';

const launch = async (viewport, theme) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport });
  if (theme === 'dark') await context.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  return { browser, page, errors };
};

const settleAndLogin = async (page, hash) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000); // 等 init 会话检查放完
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '' });
  }, UUID);
  await page.waitForTimeout(600);
  // requiresLogin 守卫可能在游客态已把路由弹走：注入登录后站内再跳一次
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(1200);
};

/* ---------- 1) 版本页 ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await settleAndLogin(page, '/user-space/settings/version');
  await page.waitForTimeout(1500);
  const pageInfo = await page.evaluate(() => {
    const h1 = document.querySelector('.beta-preview-heading h1')?.textContent?.trim() || '';
    const body = document.querySelector('.beta-preview-content')?.textContent || '';
    const hasSwitch = !!document.querySelector('.apple-switch');
    const hasToggleBar = !!document.querySelector('.toggle-bar');
    return {
      h1,
      hasBeta6: body.includes('BOH Beta 6'),
      hasCompat: body.includes('兼容模式'),
      hasRollback: body.includes('回退'),
      hasSwitch,
      hasToggleBar,
      metaVersion: document.querySelector('meta[name="boh-version"]')?.getAttribute('content') || ''
    };
  });
  check('版本页标题为「版本」', pageInfo.h1 === '版本', pageInfo.h1);
  check('版本页含 BOH Beta 6 介绍', pageInfo.hasBeta6);
  check('无兼容模式字样', !pageInfo.hasCompat);
  check('无回退字样', !pageInfo.hasRollback);
  check('无兼容模式开关', !pageInfo.hasSwitch && !pageInfo.hasToggleBar);
  check('meta 版本非 4.9.1', pageInfo.metaVersion !== '4.9.1', pageInfo.metaVersion);
  check('版本页无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${OUT}/version-page-beta6.png` });
  await browser.close();
}

/* ---------- 1b) 底部导航自动隐藏行为（用户报障回归） ---------- */
{
  const { browser, page, errors } = await launch({ width: 390, height: 844 });
  await settleAndLogin(page, '/user-space?tab=posts');
  await page.waitForSelector('.bottom-nav-glass', { timeout: 15000 });
  await page.waitForTimeout(800);
  const readHidden = () => page.evaluate(() => document.querySelector('.bottom-nav-glass')?.classList.contains('is-hidden'));
  const scrollContainer = (y) => page.evaluate((top) => {
    // 移动端用户空间由 window 层滚动（嵌套 tab-page 多为隐藏态/零高度）
    const el = document.scrollingElement || document.documentElement;
    el.scrollTop = top;
  }, y);
  check('底部导航初始可见', (await readHidden()) === false);
  // 分帧累计向下行程（composable 需两次滚动事件间 travel >= 20px 才收起）
  await scrollContainer(60);
  await page.waitForTimeout(150);
  await scrollContainer(240);
  await page.waitForTimeout(400);
  const hiddenAfterDown = await readHidden();
  check('向下滚动后底部导航收起', hiddenAfterDown === true, `is-hidden=${hiddenAfterDown}`);
  // 向上滚动 => 导航应重新出现
  await scrollContainer(120);
  await page.waitForTimeout(400);
  const hiddenAfterUp = await readHidden();
  check('向上滚动后底部导航重现', hiddenAfterUp === false, `is-hidden=${hiddenAfterUp}`);
  check('底部导航无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 2) 导航浅色/暗色 + scrolled 移除 ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('#unified-nav-container', { timeout: 15000 });
  await page.waitForTimeout(2500);
  // 滚动后 scrolled class 不应再出现
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(600);
  const scrolledClass = await page.evaluate(() => document.querySelector('#unified-nav-container')?.classList.contains('scrolled'));
  check('滚动后无 .scrolled 收缩态', scrolledClass === false);
  check('首页无 JS 错误(浅色)', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${OUT}/navbar-light-after-removal.png` });
  await browser.close();

  const dark = await launch({ width: 1280, height: 900 }, 'dark');
  await dark.page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dark.page.waitForSelector('#unified-nav-container', { timeout: 15000 });
  await dark.page.waitForTimeout(2500);
  const navBg = await dark.page.evaluate(() => getComputedStyle(document.querySelector('.unified-nav-surface')).backgroundColor);
  check('暗色导航背景为深色', /rgba\(2[0-9],\s*2[0-9]/.test(navBg) || navBg.includes('28, 28'), navBg);
  check('首页无 JS 错误(暗色)', dark.errors.length === 0, dark.errors.join(' | '));
  await dark.page.screenshot({ path: `${OUT}/navbar-dark-after-removal.png` });
  await dark.browser.close();
}

/* ---------- 3) 资产页 tab 冒烟 ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await settleAndLogin(page, '/user-space?tab=assets');
  await page.waitForTimeout(2000);
  const assets = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.segment-tab, .ah-hub-tabs button, [class*="segment"] button')].map((b) => b.textContent.trim()).filter(Boolean);
    const shell = !!document.querySelector('.profile-subpage-shell, .assets-shell');
    return { tabs: tabs.slice(0, 12), shell };
  });
  check('资产页壳渲染', assets.shell);
  check('资产页 tab 行有内容', assets.tabs.length > 0, JSON.stringify(assets.tabs));
  check('资产页无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${OUT}/assets-tabs-after-removal.png` });
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
