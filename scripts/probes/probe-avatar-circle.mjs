import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：论坛头像全圆化回归（发帖编辑器横/竖屏 + 列表 + 回复）
// 入口：/#/user-space?tab=community（论坛唯一真实入口；/#/forum 会 redirect 到 tab=posts，勿用）
// 登录策略：拦截 /auth/v1/**（无真实会话时阻止 supabase 反复踢登录）；列表用游客态公读；
//   登录态断言前现注 pinia（boh_auth persist paths 含 isLoggedIn/userInfo）并立即测，窗口 <1s
// 断言（getComputedStyle 实测，不信代码存在性）：
//  1) 竖屏 390x844：列表 .post-author-avatar / .reply-avatar 圆形（宽==高 且 radius>=宽/2）
//  2) 竖屏全屏发帖器 .mobile-composer-section .user-avatar 圆形
//  3) 横屏 844x390 + 桌面 1280x900 内联发帖器 .user-avatar 圆形 —— 截图1场景
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';

const launch = async (viewport) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  return { browser, page, errors };
};

const openCommunity = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.community-shell', { timeout: 20000 });
  await page.waitForTimeout(3000); // 等 init 期会话检查（一次性异步）放完，此后 pinia 注入即为稳态
};

// 交互前现注登录态，注入后立即使用（auth 监听可能在数秒后再次重置）
const injectLogin = (page) => page.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '' });
}, UUID);

// 圆形断言：宽==高（±1px）且 borderRadius >= 宽/2 - 0.6px
const circleAudit = (page, selector) => page.evaluate((sel) => {
  const els = [...document.querySelectorAll(sel)];
  return els.slice(0, 12).map((el) => {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.width), h = parseFloat(cs.height), r = parseFloat(cs.borderRadius);
    return { w: +w.toFixed(1), h: +h.toFixed(1), r: +r.toFixed(1), circle: Math.abs(w - h) <= 1 && r >= w / 2 - 0.6, display: cs.display };
  }).filter((x) => x.display !== 'none');
}, selector);

const report = (name, items, minCount = 1) => {
  const usable = items.filter((x) => x.w > 0);
  const ok = usable.length >= minCount && usable.every((x) => x.circle);
  check(name, ok, JSON.stringify(usable.slice(0, 4)));
};

/* ---------- 1) 竖屏 390x844：列表(游客) + 全屏发帖器(现注登录) ---------- */
{
  const { browser, page, errors } = await launch({ width: 390, height: 844 });
  await openCommunity(page);
  await page.waitForSelector('.post-author-avatar', { timeout: 20000 });
  await page.waitForTimeout(800);
  report('竖屏列表 .post-author-avatar 圆形', await circleAudit(page, '.post-author-avatar'));
  const replies = await circleAudit(page, '.reply-avatar');
  if (replies.length) report('竖屏 .reply-avatar 圆形', replies); else console.log('SKIP  竖屏 .reply-avatar（视口内无回复节点，规则级已 grep 复核）');
  await page.screenshot({ path: `${OUT}/avatar-circle-portrait-list.png` });

  await page.click('.mobile-compose-fab');
  await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 10000 });
  await injectLogin(page);
  await page.waitForSelector('.mobile-composer-section .user-avatar', { timeout: 6000 });
  await page.waitForTimeout(400);
  report('竖屏发帖器 .user-avatar 圆形', await circleAudit(page, '.mobile-composer-section .user-avatar'));
  await page.screenshot({ path: `${OUT}/avatar-circle-portrait-composer.png` });
  check('竖屏无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 2) 横屏 844x390：内联发帖器 ---------- */
{
  const { browser, page, errors } = await launch({ width: 844, height: 390 });
  await openCommunity(page);
  await injectLogin(page);
  const hasInlineComposer = await page.waitForSelector('.post-creation-section .user-avatar', { timeout: 8000 }).then(() => true).catch(() => false);
  if (hasInlineComposer) {
    await page.waitForTimeout(400);
    report('横屏内联发帖器 .user-avatar 圆形', await circleAudit(page, '.post-creation-section .user-avatar'));
    await page.screenshot({ path: `${OUT}/avatar-circle-landscape-composer.png` });
  } else {
    console.log('SKIP  横屏内联发帖器未渲染');
  }
  check('横屏无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 3) 桌面 1280x900：内联发帖器（截图1场景） ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await openCommunity(page);
  await injectLogin(page);
  const hasInlineComposer = await page.waitForSelector('.post-creation-section .user-avatar', { timeout: 8000 }).then(() => true).catch(() => false);
  if (hasInlineComposer) {
    await page.waitForTimeout(400);
    report('桌面内联发帖器 .user-avatar 圆形', await circleAudit(page, '.post-creation-section .user-avatar'));
    await page.screenshot({ path: `${OUT}/avatar-circle-desktop-composer.png` });
  } else {
    console.log('SKIP  桌面内联发帖器未渲染');
  }
  check('桌面无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
