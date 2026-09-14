import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：我的空间 / 他人空间 hero 大头像 圆形 + 佩戴框 回归
// 覆盖：
//  1) 我的空间 /#/user-space：.profile-hero-avatar 圆形 + .boh-avatar-frame 注入橙猫（本地佩戴即换即见链路）
//  2) Profile 页（登录态=自己 /#/profile/:username）：ownFrame 本地分支 → 框层渲染 + 请求 select 带 avatar_frame_url
//  3) Profile 页（游客=他人）：hero 圆形 + profiles 请求 select 带 avatar_frame_url（2026091107 数据链路）
// 登录策略：先开游客页等 3s（init 期会话检查放完）现注 pinia，再切 hash 路由触发新组件挂载；
//   boh-avatar-frame-id 必须在 app 模块加载前种（addInitScript），equippedId 单例只在模块加载时 readStoredId()
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const FRAME_ID = 'orange-cat';

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

const waitVueApp = (page) => page.waitForFunction(
  () => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 }
);

const injectLogin = (page) => page.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '' });
}, UUID);

// 圆形断言：宽==高（±1px）且 borderRadius >= 宽/2 - 0.6px
const circleAudit = (page, selector) => page.evaluate((sel) => {
  const els = [...document.querySelectorAll(sel)];
  return els.slice(0, 6).map((el) => {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.width), h = parseFloat(cs.height), r = parseFloat(cs.borderRadius);
    return { w: +w.toFixed(1), h: +h.toFixed(1), r: +r.toFixed(1), circle: Math.abs(w - h) <= 1 && r >= w / 2 - 0.6, display: cs.display };
  }).filter((x) => x.display !== 'none');
}, selector);

const report = (name, items, minCount = 1) => {
  const usable = items.filter((x) => x.w > 0);
  const ok = usable.length >= minCount && usable.every((x) => x.circle);
  check(name, ok, JSON.stringify(usable.slice(0, 3)));
};

const frameBgOf = (page, scopeSel) => page.evaluate((scope) => {
  const root = scope ? document.querySelector(scope) : document;
  const el = root && root.querySelector('.boh-avatar-frame');
  return el ? getComputedStyle(el).backgroundImage : null;
}, scopeSel);

/* ---------- 1) 我的空间：hero 圆形 + 橙猫框 ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await page.addInitScript((fid) => localStorage.setItem('boh-avatar-frame-id', fid), FRAME_ID);
  await page.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForTimeout(3000);
  await injectLogin(page);
  const heroAppeared = await page.waitForSelector('.profile-hero-avatar .apple-avatar', { timeout: 15000 }).then(() => true).catch(() => false);
  if (!heroAppeared) {
    // UserSpaceMain 登录态若非响应式刷新，重进一次 hash 路由
    await page.goto(`${BASE}/#/user-space?t=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.profile-hero-avatar .apple-avatar', { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
  report('我的空间 hero 头像圆形', await circleAudit(page, '.profile-hero-avatar .apple-avatar'));
  const bg = await frameBgOf(page, '.profile-hero-body');
  check('我的空间 hero 佩戴橙猫框', !!bg && bg.includes('orange-cat-frame.png'), bg ? bg.slice(0, 100) : 'no .boh-avatar-frame in .profile-hero-body');
  await page.screenshot({ path: `${OUT}/avatar-hero-frame-userspace.png` });
  check('我的空间无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 2) Profile 页（自己）：ownFrame 本地分支 ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await page.addInitScript((fid) => localStorage.setItem('boh-avatar-frame-id', fid), FRAME_ID);
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForTimeout(3000);
  await injectLogin(page);
  const reqPromise = page.waitForRequest(
    (r) => r.url().includes('/rest/v1/profiles') && decodeURIComponent(r.url()).includes('username=eq.'),
    { timeout: 15000 }
  ).catch(() => null);
  await page.goto(`${BASE}/#/profile/${encodeURIComponent('瑞一颗')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.profile-home-shell .profile-hero-avatar .apple-avatar', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  report('Profile(自己) hero 头像圆形', await circleAudit(page, '.profile-home-shell .profile-hero-avatar .apple-avatar'));
  const bg = await frameBgOf(page, '.profile-home-shell');
  check('Profile(自己) hero 佩戴橙猫框（ownFrame 本地分支）', !!bg && bg.includes('orange-cat-frame.png'), bg ? bg.slice(0, 100) : 'no .boh-avatar-frame');
  const req = await reqPromise;
  check('Profile 查询 select 带 avatar_frame_url', !!req && req.url().includes('avatar_frame_url'), req ? 'request captured' : 'no profiles request captured');
  await page.screenshot({ path: `${OUT}/avatar-hero-frame-profile-own.png` });
  check('Profile(自己) 无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 3) Profile 页（游客=他人）：数据链路 ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForSelector('.post-author-v2', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const username = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.post-author-v2')];
    for (const el of els) {
      const name = (el.textContent || '').replace(/^@/, '').trim();
      if (name && name !== '方块之家') return name; // 跳过官方卡兜底名
    }
    return '';
  });
  if (!username) {
    console.log('SKIP  未抓到真实作者名，他人空间场景跳过');
  } else {
    const reqPromise = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/profiles') && decodeURIComponent(r.url()).includes(`username=eq.${username}`),
      { timeout: 15000 }
    ).catch(() => null);
    await page.goto(`${BASE}/#/profile/${encodeURIComponent(username)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.profile-home-shell .profile-hero-avatar .apple-avatar', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    report(`他人空间(${username}) hero 头像圆形`, await circleAudit(page, '.profile-home-shell .profile-hero-avatar .apple-avatar'));
    const req = await reqPromise;
    check('他人 Profile 查询 select 带 avatar_frame_url', !!req && req.url().includes('avatar_frame_url'), req ? 'request captured' : 'no profiles request captured');
    const bg = await frameBgOf(page, '.profile-home-shell');
    console.log(`INFO  他人框层: ${bg ? bg.slice(0, 100) : '无（对方未戴框属正常）'}`);
    await page.screenshot({ path: `${OUT}/avatar-hero-frame-profile-other.png` });
  }
  check('他人空间无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 4) 社区成员列表：圆形 + 框列数据 + wrap 结构（游客有登录墙；成员在「成员」子 section） ---------- */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForTimeout(3000);
  await injectLogin(page);
  const reqPromise = page.waitForRequest(
    (r) => r.url().includes('/rest/v1/profiles') && decodeURIComponent(r.url()).includes('avatar_frame_url'),
    { timeout: 20000 }
  ).catch(() => null);
  // 登录态下重进 hash 路由触发社区分区重新加载，再切「成员」子 section
  await page.goto(`${BASE}/#/user-space?tab=community&x=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.post-author-avatar', { timeout: 20000 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '成员');
    if (btn) btn.click();
  });
  await page.waitForSelector('.user-item .user-avatar', { timeout: 20000 });
  await page.waitForTimeout(1500);
  report('成员列表头像圆形抽检', await circleAudit(page, '.user-item .user-avatar'));
  const req = await reqPromise;
  check('成员列表查询 select 带 avatar_frame_url', !!req, req ? 'request captured' : 'no profiles request with frame col');
  const structure = await page.evaluate(() => {
    const avatars = [...document.querySelectorAll('.user-item .user-avatar')];
    const wrapped = avatars.filter((el) => el.parentElement?.classList.contains('boh-avatar-wrap'));
    const frames = document.querySelectorAll('.user-item .boh-avatar-frame').length;
    return { total: avatars.length, wrapped: wrapped.length, frames };
  });
  check('成员头像全部包 wrap 且框层节点就位', structure.total > 0 && structure.wrapped === structure.total, JSON.stringify(structure));
  console.log(`INFO  当前成员列表框层渲染数: ${structure.frames}（首屏成员无人戴框时为 0 属正常）`);
  await page.screenshot({ path: `${OUT}/avatar-frame-community-members.png` });
  check('成员列表无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
