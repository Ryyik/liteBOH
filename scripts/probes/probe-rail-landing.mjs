import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：横屏左栏改造落地验收（plans/011 B 组 + C1/C2）
//   档位：1440×900 宽栏（明/暗）· 1100×800 窄栏 · 1024×600 矮窗
//   反证：git stash 单个源文件后重跑，对应断言必须变红
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/rail-landing';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
let skip = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log('PASS ', name, detail === undefined ? '' : '— ' + detail); }
  else { fail += 1; console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail); }
};
const skipCheck = (name, why) => { skip += 1; console.log('SKIP ', name, '— ' + why); };

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const errors = [];

async function open(width, height, tag, theme) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + String(e).slice(0, 160)));
  // console 不纳入断言：mock 登录态下 Supabase 请求必然 400/超时（无真鉴权），
  // 那是环境噪声不是回归。只认未捕获异常（同 probe-user-space-ia.mjs 的做法）。
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, { id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b', username: 'probe_user', role: 'user', points: 42 });
  });
  await page.waitForSelector('.userspace-rail-item', { timeout: 20000 });
  if (theme === 'dark') {
    await page.evaluate(() => document.querySelector('.user-space-page')?.setAttribute('data-theme', 'dark'));
  }
  await page.waitForTimeout(2200);
  return { context, page };
}

const measure = (page) => page.evaluate(() => {
  const rail = document.querySelector('.userspace-rail');
  const ind = document.querySelector('.userspace-rail-indicator');
  const act = document.querySelector('.userspace-rail-item.active');
  const scroll = document.querySelector('.userspace-rail-scroll');
  const brand = document.querySelector('.userspace-rail-brand');
  const brandName = document.querySelector('.userspace-rail-brand-name');
  const first = document.querySelector('.userspace-rail-item');
  const divider = document.querySelector('.userspace-rail-divider');
  const compose = document.querySelector('.userspace-rail-item[data-rail-action="compose"]');
  const badge = document.querySelector('.userspace-rail-badge');
  const pageRoot = document.querySelector('.user-space-page');
  const navSurface = document.querySelector('.unified-nav-surface');
  const tabPage = document.querySelector('.tab-page');
  const R = (el) => (el ? el.getBoundingClientRect() : null);
  const ir = R(ind); const ar = R(act); const br = R(brand); const fr = R(first);
  const nr = R(navSurface); const tr = R(tabPage);
  const icon = act ? act.querySelector('.userspace-rail-icon') : null;
  const label = act ? act.querySelector('.userspace-rail-label') : null;
  return {
    railW: rail ? Math.round(R(rail).width) : null,
    padTop: rail ? Math.round(parseFloat(getComputedStyle(rail).paddingTop)) : null,
    dTop: ir && ar ? +(ir.top - ar.top).toFixed(1) : null,
    dLeft: ir && ar ? +(ir.left - ar.left).toFixed(1) : null,
    dW: ir && ar ? +(ir.width - ar.width).toFixed(1) : null,
    itemH: ar ? Math.round(ar.height) : null,
    iconW: icon ? Math.round(R(icon).width) : null,
    iconStroke: icon ? getComputedStyle(icon).strokeWidth : null,
    labelFont: label ? getComputedStyle(label).fontSize : null,
    pillBg: pageRoot ? getComputedStyle(pageRoot).getPropertyValue('--rail-pill-bg').trim() : null,
    brandTop: br ? Math.round(br.top) : null,
    brandVisible: !!br && br.width > 0 && br.height > 0,
    brandNameShown: !!brandName && getComputedStyle(brandName).display !== 'none',
    firstItemTop: fr ? Math.round(fr.top) : null,
    dividerH: divider ? Math.round(parseFloat(getComputedStyle(divider).height)) : null,
    dividerBg: divider ? getComputedStyle(divider).backgroundColor : null,
    composeW: compose ? Math.round(compose.getBoundingClientRect().width) : null,
    composeRadius: compose ? getComputedStyle(compose).borderRadius : null,
    composeBg: compose ? getComputedStyle(compose).backgroundColor : null,
    badgePos: badge ? getComputedStyle(badge).position : 'ABSENT',
    railLogout: !!document.querySelector('.userspace-rail-item[data-rail-action="logout"]'),
    railItems: document.querySelectorAll('.userspace-rail-item').length,
    overflow: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : null,
    scrollH: scroll ? scroll.scrollHeight : null,
    clientH: scroll ? scroll.clientHeight : null,
    navCenter: nr ? Math.round(nr.left + nr.width / 2) : null,
    tabCenter: tr ? Math.round(tr.left + tr.width / 2) : null,
    navRight: nr ? Math.round(nr.right) : null,
    hasMoreBtn: !!document.querySelector('.userspace-rail-more'),
    pageRootExists: !!pageRoot,
    railExists: !!rail,
    activeExists: !!act
  };
});

// ───────── 档 1：1440×900 宽栏（明） ─────────
{
  const { context, page } = await open(1440, 900, 'wide1440');
  const m = await measure(page);
  check('宽栏：栏宽 240', m.railW === 240, m.railW + 'px');
  check('A 指示器与条目几何重合（首屏，未交互）',
    m.dTop !== null && Math.abs(m.dTop) <= 1 && Math.abs(m.dLeft) <= 1 && Math.abs(m.dW) <= 1,
    `Δtop=${m.dTop} Δleft=${m.dLeft} Δwidth=${m.dW}`);
  check('B3 宽栏规格：条目 58 / 图标 24 / 字 16',
    m.itemH === 58 && m.iconW === 24 && m.labelFont === '16px',
    `${m.itemH} / ${m.iconW} / ${m.labelFont}`);
  check('B2 选中态底色 = 0.075', /\.?0?75/.test(m.pillBg), m.pillBg);
  check('B2 选中图标描边加粗 2.5', m.iconStroke === '2.5px', m.iconStroke);
  check('B1 品牌位渲染在首个条目之上',
    m.brandVisible && m.brandTop < m.firstItemTop,
    `brandTop=${m.brandTop} firstItem=${m.firstItemTop}`);
  check('B1 品牌位不进文档流（首项 top = 栏顶避让值）',
    m.firstItemTop === m.padTop, `firstItem=${m.firstItemTop} padTop=${m.padTop}`);
  check('B1 宽栏显示品牌名', m.brandNameShown === true, String(m.brandNameShown));
  check('B4 分组不再画线（divider 高度 0）',
    m.dividerH === 0, `h=${m.dividerH} bg=${m.dividerBg}`);
  check('B5 宽栏发布 = 胶囊（radius 999）+ 主题蓝底',
    m.composeRadius === '999px' && /rgb\(0, 113, 227\)/.test(m.composeBg),
    `${m.composeRadius} ${m.composeBg}`);
  check('B7 宽栏角标内联（position static）',
    m.badgePos === 'static' || m.badgePos === 'ABSENT',
    m.badgePos === 'ABSENT' ? 'SKIP-able：本档无未读消息' : m.badgePos);
  check('B6 退出登录不在左栏一级导航里', m.railLogout === false, String(m.railLogout));
  check('B6 左栏条目收敛为 8 项（5 主 + 2 便捷 + 首页）', m.railItems === 8, m.railItems + ' 项');
  check('C2 顶部导航与内容区同心',
    m.navCenter !== null && Math.abs(m.navCenter - m.tabCenter) <= 2,
    `nav=${m.navCenter} tab=${m.tabCenter}`);
  check('宽栏 1440×900 不溢出', m.overflow === false, `${m.scrollH}/${m.clientH}`);
  check('宽栏 1440×900 不触发紧凑档（条目仍 58）', m.itemH === 58, m.itemH + 'px');

  // 菜单交互
  await page.click('.userspace-rail-more', { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('.userspace-rail-menu', { timeout: 4000 }).catch(() => {});
  const menuItems = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.userspace-rail-menu-item')).map((el) => el.dataset.railAction));
  check('B6「更多」菜单含 主题 / 退出登录',
    ['theme', 'logout'].every((id) => menuItems.includes(id)), menuItems.join(','));
  check('B6 菜单项有 role=menuitem',
    await page.locator('.userspace-rail-menu [role="menuitem"]').count() === menuItems.length);
  await page.screenshot({ path: OUT + '/1-wide-menu-open.png' });
  // 点菜单外关闭：直接派发 pointerdown，避免鼠标落到帖子图片上触发大图查看器
  await page.evaluate(() => {
    const target = document.querySelector('.user-space-page') || document.body;
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(350);
  check('B6 点击菜单外关闭',
    await page.locator('.userspace-rail-menu').count() === 0);
  // Esc 关闭
  await page.click('.userspace-rail-more', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('B6 Esc 关闭菜单', await page.locator('.userspace-rail-menu').count() === 0);
  await page.screenshot({ path: OUT + '/2-wide-1440.png' });
  await context.close();
}

// ───────── 档 2：1440×900 宽栏（暗） ─────────
{
  const { context, page } = await open(1440, 900, 'wide1440dark', 'dark');
  const m = await measure(page);
  check('B2 暗色选中底色 = 0.12', /\.12/.test(m.pillBg), m.pillBg);
  check('暗色下指示器仍与条目重合',
    m.dLeft !== null && Math.abs(m.dLeft) <= 1 && Math.abs(m.dW) <= 1,
    `Δleft=${m.dLeft} Δwidth=${m.dW} pageRoot=${m.pageRootExists} rail=${m.railExists} active=${m.activeExists}`);
  await page.screenshot({ path: OUT + '/3-wide-dark.png' });
  await context.close();
}

// ───────── 档 3：1100×800 窄栏 ─────────
{
  const { context, page } = await open(1100, 800, 'narrow1100');
  const m = await measure(page);
  check('窄栏：栏宽 88', m.railW === 88, m.railW + 'px');
  check('A 窄栏指示器与条目重合', m.dLeft !== null && Math.abs(m.dLeft) <= 1 && Math.abs(m.dW) <= 1,
    `Δleft=${m.dLeft} Δwidth=${m.dW}`);
  check('B3 窄栏规格：图标 20 / 字 13', m.iconW === 20 && m.labelFont === '13px',
    `${m.iconW} / ${m.labelFont}`);
  check('B1 窄栏只留品牌标（文字隐藏）', m.brandNameShown === false, String(m.brandNameShown));
  check('B5 窄栏发布 = 圆形按钮 40px',
    m.composeW === 40 && m.composeRadius === '50%', `${m.composeW}px ${m.composeRadius}`);
  check('B7 窄栏角标回落为浮标（absolute）',
    m.badgePos === 'absolute' || m.badgePos === 'ABSENT', m.badgePos);
  check('C1 1100×800 不触发紧凑档（窄栏本就能放下）', m.itemH === 56 && m.overflow === false,
    `${m.itemH}px overflow=${m.overflow}`);
  check('1100×800 不溢出', m.overflow === false, `${m.scrollH}/${m.clientH}`);
  check('C2 窄栏导航与内容区同心',
    m.navCenter !== null && Math.abs(m.navCenter - m.tabCenter) <= 2,
    `nav=${m.navCenter} tab=${m.tabCenter}`);
  await page.screenshot({ path: OUT + '/4-narrow-1100.png' });
  await context.close();
}

// ───────── 档 3.5：1363×648 一级紧凑（用户真实半屏窗口） ─────────
{
  const { context, page } = await open(1363, 648, 'half-1363x648');
  const m = await measure(page);
  check('C1 1363×648 触发一级紧凑（条目 44±2 / 图标 18 / 字 13）',
    m.itemH >= 42 && m.itemH <= 46 && m.iconW === 18 && m.labelFont === '13px',
    `${m.itemH} / ${m.iconW} / ${m.labelFont}`);
  check('C1 1363×648 整栏不溢出（一级紧凑下工具组可吸底）', m.overflow === false,
    `${m.scrollH}/${m.clientH}`);
  check('C1 一级紧凑下指示器仍与条目重合',
    m.dLeft !== null && Math.abs(m.dLeft) <= 1 && Math.abs(m.dW) <= 1,
    `Δleft=${m.dLeft} Δwidth=${m.dW}`);
  check('C2 1363×648 导航与内容区同心',
    m.navCenter !== null && Math.abs(m.navCenter - m.tabCenter) <= 2,
    `nav=${m.navCenter} tab=${m.tabCenter}`);
  await page.screenshot({ path: OUT + '/6-half-1363x648.png' });
  await context.close();
}

// ───────── 档 3.6：1366×858 正常档（常见笔记本，上一版被误压的窗口） ─────────
{
  const { context, page } = await open(1366, 858, 'laptop-1366x858');
  const m = await measure(page);
  check('1366×858 走正常档（条目 58 / 字 16），不再被紧凑档误压',
    m.itemH === 58 && m.labelFont === '16px', `${m.itemH} / ${m.labelFont}`);
  check('1366×858 不溢出', m.overflow === false, `${m.scrollH}/${m.clientH}`);
  await context.close();
}

// ───────── 档 4：1024×600 矮窗 ─────────
{
  const { context, page } = await open(1024, 600, 'short1024');
  const m = await measure(page);
  check('C1 1024×600 触发紧凑档（条目 38）', m.itemH === 38, m.itemH + 'px');
  check('C1 1024×600 紧凑档图标 16 / 字 10', m.iconW === 16 && m.labelFont === '10px',
    `${m.iconW} / ${m.labelFont}`);
  check('C1 1024×600 整栏不溢出（工具组可吸底）', m.overflow === false, `${m.scrollH}/${m.clientH}`);
  check('C1 紧凑档下指示器仍与条目重合',
    m.dLeft !== null && Math.abs(m.dLeft) <= 1 && Math.abs(m.dW) <= 1, `Δleft=${m.dLeft} Δwidth=${m.dW}`);
  check('C2 矮窗导航与内容区同心',
    m.navCenter !== null && Math.abs(m.navCenter - m.tabCenter) <= 2,
    `nav=${m.navCenter} tab=${m.tabCenter}`);
  await page.screenshot({ path: OUT + '/5-short-1024x600.png' });
  await context.close();
}

// ───────── 竖屏不受影响 ─────────
{
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('portrait: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    Object.assign(pinia.state.value.auth.userInfo, { id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b', username: 'probe_user', role: 'user', points: 42 });
  });
  await page.waitForTimeout(2200);
  const portrait = await page.evaluate(() => ({
    railDisplay: getComputedStyle(document.querySelector('.userspace-rail')).display,
    brandDisplay: document.querySelector('.userspace-rail-brand')
      ? getComputedStyle(document.querySelector('.userspace-rail-brand')).display : 'ABSENT',
    bottomNav: !!document.querySelector('.bottom-nav-glass'),
    navSurfaceLeft: Math.round(document.querySelector('.unified-nav-surface').getBoundingClientRect().left)
  }));
  check('竖屏：左栏隐藏（零副作用）', portrait.railDisplay === 'none', portrait.railDisplay);
  check('竖屏：底部胶囊仍在', portrait.bottomNav === true);
  await context.close();
}

check('零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

await browser.close();
console.log(`\n=== ${pass} PASS / ${fail} FAIL / ${skip} SKIP ===`);
process.exit(fail ? 1 : 0);
