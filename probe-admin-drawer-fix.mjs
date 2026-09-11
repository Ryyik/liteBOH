import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：DataManagement 编辑抽屉错位诊断 + 横竖屏回归
// 1) 伪造 admin 登录（isAdmin=纯前端 userInfo.role==='admin' 判断）+ mock admin RPC
// 2) 打开「订阅发放」→「已有订阅用户」行 → 点「编辑」→ .drawer-overlay 打开
// 3) 诊断：overlay/drawer 视口矩形 + 祖先链上的 transform/filter/backdrop-filter/will-change/contain
//    （fixed 定位被这些属性劫持成相对祖先定位 = 错位根因）
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const SUB_ROW_ID = '11111111-1111-4111-8111-111111111111';

const SUBSCRIBER_ROW = {
  id: SUB_ROW_ID,
  user_id: UUID,
  username: '瑞一颗',
  plan_code: 'pro',
  plan_name: 'Pro',
  billing_cycle: 'monthly',
  duration_months: 1,
  metadata: {},
  points_cost: 0,
  started_at: '2026-09-05T05:47:00+00:00',
  expires_at: '2026-10-05T00:00:00+00:00',
  status: 'active',
  grant_count: 3
};

const setupRoutes = async (page) => {
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const url = route.request().url();
    let body = {};
    if (url.includes('admin_list_existing_subscribers')) {
      body = { total: 1, same_total: 1, any_total: 1, rows: [SUBSCRIBER_ROW] };
    } else if (url.includes('admin_list_subscription_grant_batches')) {
      body = { total: 0, rows: [] };
    } else if (url.includes('get_unread_notification_count')) {
      body = { count: 0 };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/rest/v1/profiles*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/32' },
      body: JSON.stringify([{ id: UUID, username: '瑞一颗', points: 100, role: 'admin', avatar_url: null }])
    });
  });
};

const openGrantConsole = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000); // 等启动期会话检查放完
  // 现注 admin 登录（userInfo 是 reactive({})，必须 Object.assign 原地改）
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, role: 'admin', avatarUrl: '' });
  }, UUID);
  await page.evaluate(() => { location.hash = '#/admin/data-management'; });
  await page.waitForSelector('.admin-shell', { timeout: 30000 });
  // 切到「订阅发放」子 tab
  await page.waitForTimeout(600);
  const tab = page.locator('.g-module-tab', { hasText: '订阅发放' }).first();
  if (await tab.count()) {
    await tab.click();
  } else {
    const side = page.locator('button, a', { hasText: '订阅发放' }).first();
    await side.click();
  }
  await page.waitForSelector('.grant-existing-row', { timeout: 20000 });
  await page.waitForTimeout(500);
};

const openEditDrawer = async (page) => {
  await page.locator('.grant-existing-row .grant-edit-btn', { hasText: '编辑' }).first().click();
  await page.waitForSelector('.drawer-overlay', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(500); // 等滑入动画结束
};

// 诊断：overlay/drawer 是否铺满视口 + 祖先链 containing-block 嫌疑
const diagnose = (page) => page.evaluate(() => {
  const overlay = document.querySelector('.drawer-overlay');
  if (!overlay) return { found: false };
  const suspects = [];
  let el = overlay.parentElement;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    const s = {};
    if (cs.transform && cs.transform !== 'none') s.transform = cs.transform.slice(0, 60);
    if (cs.filter && cs.filter !== 'none') s.filter = cs.filter.slice(0, 60);
    if (cs.backdropFilter && cs.backdropFilter !== 'none') s.backdropFilter = String(cs.backdropFilter).slice(0, 60);
    if (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none') s.webkitBackdropFilter = String(cs.webkitBackdropFilter).slice(0, 60);
    if (cs.willChange && cs.willChange !== 'auto') s.willChange = cs.willChange;
    if (cs.contain && cs.contain !== 'none') s.contain = cs.contain;
    if (cs.containerType && cs.containerType !== 'normal') s.containerType = cs.containerType;
    if (cs.zoom && cs.zoom !== '1') s.zoom = cs.zoom;
    if (Object.keys(s).length) {
      suspects.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 70), ...s });
    }
    el = el.parentElement;
  }
  const r = overlay.getBoundingClientRect();
  const d = document.querySelector('.drawer');
  const dr = d ? d.getBoundingClientRect() : null;
  const dh = d ? getComputedStyle(d) : null;
  return {
    found: true,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    overlayRect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
    drawerRect: dr ? { top: Math.round(dr.top), left: Math.round(dr.left), w: Math.round(dr.width), h: Math.round(dr.height) } : null,
    drawerPosition: dh ? dh.position : null,
    overlayPosition: getComputedStyle(overlay).position,
    overlayOffsetParentClass: overlay.offsetParent ? String(overlay.offsetParent.className).slice(0, 70) : '(null=viewport)',
    suspects
  };
});

const audit = (page, label) => page.evaluate((name) => {
  const overlay = document.querySelector('.drawer-overlay');
  if (!overlay) return { name, pass: false, detail: 'overlay 不存在' };
  const cs = getComputedStyle(overlay);
  if (cs.position !== 'fixed') return { name, pass: false, detail: `position=${cs.position}（fixed 失效）` };
  const r = overlay.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const full = Math.abs(r.top) <= 1 && Math.abs(r.left) <= 1 && Math.abs(r.width - vw) <= 1 && Math.abs(r.height - vh) <= 1;
  const drawer = document.querySelector('.drawer');
  const dr = drawer ? drawer.getBoundingClientRect() : null;
  const drawerFull = dr && Math.abs(dr.height - vh) <= 2 && Math.abs(dr.top) <= 1;
  return {
    name,
    pass: full && !!drawerFull,
    detail: `overlay=${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} viewport=${vw}x${vh} drawer=${dr ? `${Math.round(dr.width)}x${Math.round(dr.height)}@${Math.round(dr.top)}` : '无'}`
  };
}, label);

const run = async (viewport, tag, diagnoseOnly = false) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport });
  const p = await context.newPage();
  await setupRoutes(p);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  try {
    await openGrantConsole(p);
    await openEditDrawer(p);
    const diag = await diagnose(p);
    console.log(`\n===== ${tag} 诊断 =====`);
    console.log(JSON.stringify(diag, null, 2));
    if (!diagnoseOnly) {
      const a = await audit(p, `${tag} 抽屉铺满视口`);
      check(a.name, a.pass, a.detail);
    }
    await p.screenshot({ path: `${OUT}/admin-drawer-${tag}.png` });
    check(`${tag} 无 JS 报错`, errs.length === 0, errs.join(' | ').slice(0, 160));
  } catch (e) {
    check(`${tag} 流程`, false, String(e.message).slice(0, 160));
    await p.screenshot({ path: `${OUT}/admin-drawer-${tag}-failure.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
};

const mode = process.argv[2] || 'diag';
if (mode === 'diag') {
  await run({ width: 1280, height: 900 }, 'desktop', true);
} else {
  await run({ width: 1280, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'portrait');
  await run({ width: 844, height: 390 }, 'landscape');
}
const passCount = results.filter((r) => r.pass).length;
console.log(`\n${passCount}/${results.length} PASS`);
process.exit(passCount === results.length ? 0 : 1);
