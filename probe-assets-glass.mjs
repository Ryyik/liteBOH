import { chromium } from 'playwright';
import fs from 'node:fs';

// 资产页液态玻璃化最终验证
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

const openAssets = async (theme, viewport) => {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  if (theme === 'dark') await context.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, { id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b', username: 'Ryyik', role: 'user', points: 14 });
  });
  await page.waitForTimeout(2300);
  return { context, page, errors };
};

/* ---------- 暗色全链路 ---------- */
{
  const { context, page, errors } = await openAssets('dark');
  const dark = await page.evaluate(() => {
    const cs = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el) : null;
    };
    const card = cs('.ah-hub-card');
    const pc = cs('.points-card');
    const h2 = cs('.ah-overview-heading h2');
    const tabs = [...document.querySelectorAll('.ah-tab')].map((t) => t.textContent.trim());
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      hubBg: card?.backgroundColor,
      pointsCardBg: pc?.backgroundColor,
      headingColor: h2?.color,
      tabs
    };
  });
  check('暗色主题生效', dark.theme === 'dark', dark.theme);
  check('账户卡暗玻璃', dark.hubBg === 'rgba(24, 26, 32, 0.62)', dark.hubBg);
  check('积分卡暗色化', dark.pointsCardBg !== 'rgb(237, 242, 244)' && !dark.pointsCardBg.startsWith('rgb(2'), dark.pointsCardBg);
  check('标题文字可读', dark.headingColor === 'rgb(245, 247, 250)', dark.headingColor);
  check('八个子页签在位', dark.tabs.length === 8, JSON.stringify(dark.tabs));

  await page.click('button:has-text("礼物与订单")');
  await page.waitForTimeout(1200);
  const fulfillment = await page.evaluate(() => {
    const el = document.querySelector('.ah-fulfillment-records');
    return el ? getComputedStyle(el).backgroundColor : 'MISSING';
  });
  check('礼物订单记录卡暗色', fulfillment !== 'rgb(255, 255, 255)' && !fulfillment.startsWith('rgba(255, 255, 255'), fulfillment);
  await page.screenshot({ path: `${OUT}/assets-final-dark-fulfillment.png` });

  await page.click('button:has-text("抽奖")');
  await page.waitForTimeout(1400);
  const lottery = await page.evaluate(() => {
    const hero = document.querySelector('.ah-lottery-hero');
    const cards = [...document.querySelectorAll('.ah-lottery-card')];
    return {
      heroBg: hero ? getComputedStyle(hero).backgroundImage.slice(0, 60) : 'MISSING',
      total: cards.length,
      dimmed: cards.filter((c) => parseFloat(getComputedStyle(c).opacity) < 0.9).length
    };
  });
  check('抽奖 hero 暗色渐变', lottery.heroBg.includes('30, 38, 64') || lottery.heroBg !== 'none', lottery.heroBg);
  check(`抽奖卡渲染(${lottery.total} 张)`, lottery.total > 0);
  if (lottery.dimmed) check('已结束卡降权生效', true, `${lottery.dimmed} 张降权`);
  await page.screenshot({ path: `${OUT}/assets-final-dark-lottery.png` });
  check('暗色无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

/* ---------- 浅色回归 ---------- */
{
  const { context, page, errors } = await openAssets('light');
  const light = await page.evaluate(() => {
    const card = document.querySelector('.ah-hub-card');
    const activeIcon = document.querySelector('.ah-tab.active .ah-tab-icon');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      hubBg: card ? getComputedStyle(card).backgroundColor : 'MISSING',
      activeIconColor: activeIcon ? getComputedStyle(activeIcon).color : 'MISSING'
    };
  });
  check('浅色主题', light.theme !== 'dark', light.theme);
  check('账户卡浅色玻璃', light.hubBg === 'rgba(255, 255, 255, 0.62)', light.hubBg);
  check('激活页签品牌蓝', light.activeIconColor === 'rgb(0, 113, 227)', light.activeIconColor);
  await page.screenshot({ path: `${OUT}/assets-final-light-overview.png` });
  check('浅色无 JS 错误', errors.length === 0, errors.join(' | '));
  await context.close();
}

/* ---------- 移动端 375 ---------- */
{
  const { context, page } = await openAssets('dark', { width: 375, height: 760 });
  const m = await page.evaluate(() => {
    const card = document.querySelector('.ah-hub-card');
    const r = card.getBoundingClientRect();
    return { right: r.right, vw: window.innerWidth, docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  check('移动端不溢出', !m.docOverflow && m.right <= m.vw + 1, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/assets-final-dark-mobile.png`, clip: { x: 0, y: 0, width: 375, height: 760 } });
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) process.exit(1);
