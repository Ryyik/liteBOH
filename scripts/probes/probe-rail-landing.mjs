import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：横屏左栏「竖排胶囊条」（2026-11-26 改版）
//   形态：72px 宽 / 圆角 36 / 高约 352 / 垂直居中 / 纯图标 / 5 席 + 更多
//   档位：1440×900（明 / 暗）· 1100×800 · 1024×600 · 竖屏零副作用
//   反证：把胶囊宽度或选中态改回旧值，对应断言必须变红
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/rail-capsule';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail === undefined ? '' : '— ' + detail);
  } else {
    fail += 1;
    console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail);
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

async function open(width, height, tag, theme) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(tag + ': ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(700);
  await page.evaluate((dark) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    Object.assign(pinia.state.value.auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
      points: 42,
    });
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  }, theme === 'dark');
  await page.waitForSelector('.userspace-rail-item', { timeout: 20000 });
  await page.waitForTimeout(1800);
  return { context, page };
}

const measure = (page) =>
  page.evaluate(() => {
    const rail = document.querySelector('.userspace-rail');
    const ind = document.querySelector('.userspace-rail-indicator');
    const act = document.querySelector('.userspace-rail-item.active');
    const tab = document.querySelector('.tab-page');
    const nav = document.querySelector('.unified-nav-surface');
    const first = document.querySelector('.userspace-rail-group .userspace-rail-item');
    const brand = document.querySelector('.userspace-rail-brand');
    const label = document.querySelector('.userspace-rail-label');
    const secondIcon = document
      .querySelectorAll('.userspace-rail-group .userspace-rail-item')[1]
      ?.querySelector('.userspace-rail-icon');
    const R = (el) => (el ? el.getBoundingClientRect() : null);
    const rr = R(rail);
    const ir = R(ind);
    const ar = R(act);
    const tr = R(tab);
    const nr = R(nav);
    const fr = R(first);
    const br = R(brand);
    const ir2 = R(secondIcon);
    return {
      vw: innerWidth,
      vh: innerHeight,
      rail: rr && {
        x: Math.round(rr.x),
        y: Math.round(rr.y),
        w: Math.round(rr.width),
        h: Math.round(rr.height),
        bottom: Math.round(rr.bottom),
        centerY: Math.round(rr.y + rr.height / 2),
      },
      radius: rail ? getComputedStyle(rail).borderRadius : null,
      items: [...document.querySelectorAll('.userspace-rail-item')].filter(
        (el) => el.offsetParent !== null,
      ).length,
      tabs: document.querySelectorAll('.userspace-rail-item[data-tab]').length,
      labelDisplay: label ? getComputedStyle(label).display : 'ABSENT',
      itemH: ar ? Math.round(ar.height) : null,
      iconW: ir2 ? Math.round(ir2.width) : null,
      activeIconTransform: act?.querySelector('.userspace-rail-icon')
        ? getComputedStyle(act.querySelector('.userspace-rail-icon')).transform
        : null,
      activeColor: act ? getComputedStyle(act).color : null,
      pillBg: ind ? getComputedStyle(ind).backgroundColor : null,
      indDelta:
        ir && ar
          ? { top: +(ir.top - ar.top).toFixed(1), height: +(ir.height - ar.height).toFixed(1) }
          : null,
      brandAboveFirst: br && fr ? br.bottom <= fr.top + 1 : null,
      contentLeft: tr ? Math.round(tr.x) : null,
      contentCenter: tr ? Math.round(tr.x + tr.width / 2) : null,
      navCenter: nr ? Math.round(nr.x + nr.width / 2) : null,
      railDisplay: rail ? getComputedStyle(rail).display : 'ABSENT',
      bottomNav: !!document.querySelector('.bottom-nav-glass'),
    };
  });

// ───────── 档 1：1440×900（明） ─────────
{
  const { context, page } = await open(1440, 900, 'wide1440');
  const m = await measure(page);
  check('宽屏：胶囊宽 72', m.rail?.w === 72, `${m.rail?.w}px`);
  check('宽屏：圆角 36（胶囊形）', m.radius === '36px', m.radius);
  check('宽屏：贴左 8px', m.rail?.x === 8, `x=${m.rail?.x}`);
  check(
    '宽屏：垂直居中',
    m.rail !== null && Math.abs(m.rail.centerY - m.vh / 2) <= 2,
    `center=${m.rail?.centerY} vh/2=${m.vh / 2}`,
  );
  check('宽屏：高度由内容决定（340–366）', m.rail?.h >= 340 && m.rail?.h <= 366, `${m.rail?.h}px`);
  check('宽屏：6 行（5 席 + 更多）', m.items === 6, `${m.items} 行`);
  check('宽屏：无文字（label display:none）', m.labelDisplay === 'none', m.labelDisplay);
  check('宽屏：条目高 46', m.itemH === 46, `${m.itemH}px`);
  check('宽屏：图标 22', m.iconW === 22, `${m.iconW}px`);
  check(
    '选中图标放大 1.12（不再用描边加粗）',
    /matrix\(1\.12/.test(m.activeIconTransform || ''),
    m.activeIconTransform,
  );
  check(
    '指示器内缩 2px（top +2 / 高 -4）',
    m.indDelta && m.indDelta.top === 2 && m.indDelta.height === -4,
    JSON.stringify(m.indDelta),
  );
  check('亮色选中淡染 0.075', /0\.075/.test(m.pillBg || ''), m.pillBg);
  check('品牌标在首项之上', m.brandAboveFirst === true, String(m.brandAboveFirst));
  check('内容让位 88px', m.contentLeft === 88, `${m.contentLeft}px`);
  check(
    '顶部导航与内容区同心',
    m.navCenter !== null && Math.abs(m.navCenter - m.contentCenter) <= 2,
    `nav=${m.navCenter} content=${m.contentCenter}`,
  );

  // 菜单
  await page.click('.userspace-rail-more', { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('.userspace-rail-menu', { timeout: 4000 }).catch(() => {});
  const menu = await page.evaluate(() => {
    const el = document.querySelector('.userspace-rail-menu');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      entries: [...el.querySelectorAll('[role="menuitem"]')].map((n) => n.dataset.railAction),
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      inside: Boolean(
        document
          .elementFromPoint(r.right - 8, r.top + r.height / 2)
          ?.closest('.userspace-rail-menu'),
      ),
    };
  });
  check(
    '菜单收齐 发布/资产/首页/主题/退出',
    menu &&
      ['compose', 'assets', 'home', 'theme', 'logout'].every((id) => menu.entries.includes(id)),
    menu ? menu.entries.join(',') : 'ABSENT',
  );
  check('菜单完整落在视口内', menu?.inViewport === true, JSON.stringify(menu));
  check('菜单右缘不被裁（elementFromPoint 命中自身）', menu?.inside === true, String(menu?.inside));
  await page.screenshot({ path: OUT + '/1-wide-1440.png' });
  await context.close();
}

// ───────── 档 2：1440×900（暗） ─────────
{
  const { context, page } = await open(1440, 900, 'wide1440dark', 'dark');
  const m = await measure(page);
  check('暗色选中淡染 = 0.12', /0\.12/.test(m.pillBg || ''), m.pillBg);
  check('暗色选中文字 = #f5f5f7', m.activeColor === 'rgb(245, 245, 247)', m.activeColor);
  await page.screenshot({ path: OUT + '/2-wide-dark.png' });
  await context.close();
}

// ───────── 档 3：1100×800 ─────────
{
  const { context, page } = await open(1100, 800, 'narrow1100');
  const m = await measure(page);
  check('1100：胶囊仍 72 宽（不随视口变宽）', m.rail?.w === 72, `${m.rail?.w}px`);
  check(
    '1100：垂直居中',
    m.rail !== null && Math.abs(m.rail.centerY - m.vh / 2) <= 2,
    `${m.rail?.centerY}`,
  );
  check('1100：内容让位 88', m.contentLeft === 88, `${m.contentLeft}px`);
  check('1100：条目仍 46（无矮窗压缩档）', m.itemH === 46, `${m.itemH}px`);
  await page.screenshot({ path: OUT + '/3-narrow-1100.png' });
  await context.close();
}

// ───────── 档 4：1024×600 下限 ─────────
{
  const { context, page } = await open(1024, 600, 'short1024');
  const m = await measure(page);
  check(
    '1024×600：胶囊完整落在视口内',
    m.rail !== null && m.rail.y >= 0 && m.rail.bottom <= m.vh,
    `y=${m.rail?.y} bottom=${m.rail?.bottom} vh=${m.vh}`,
  );
  check('1024×600：5 席 + 更多仍全在', m.items === 6 && m.tabs === 5, `${m.items}/${m.tabs}`);
  await page.click('.userspace-rail-more', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const menuIn = await page.evaluate(() => {
    const el = document.querySelector('.userspace-rail-menu');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
  });
  check('1024×600：菜单仍在视口内', menuIn === true, String(menuIn));
  await page.screenshot({ path: OUT + '/4-short-1024x600.png' });
  await context.close();
}

// ───────── 档 5：竖屏零副作用 ─────────
{
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('portrait: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(1500);
  const p = await page.evaluate(() => ({
    railDisplay: getComputedStyle(document.querySelector('.userspace-rail')).display,
    bottomNav: !!document.querySelector('.bottom-nav-glass'),
  }));
  check('竖屏：左栏隐藏（零副作用）', p.railDisplay === 'none', p.railDisplay);
  check('竖屏：底部胶囊仍在', p.bottomNav === true, String(p.bottomNav));
  await context.close();
}

check('零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean');

console.log(`\n合计 ${pass + fail} 条：通过 ${pass} / 失败 ${fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
