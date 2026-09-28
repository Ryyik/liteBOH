import { chromium } from 'playwright';

// =====================================================================
// 探针：移动端二级菜单与常驻悬浮岛的「接缝几何」回归护栏
//
// 用户报的 bug：手机端展开汉堡菜单后，导航栏与二级菜单之间有一条异常空隙。
//
// 这处的机制很容易搞错，实测记录（390×844 竖屏，2026-09-28）：
//   · 岛 .unified-nav-surface 有 transform: translateY(8px) + height 50px
//     ⇒ 它的视觉底边 = 58px（不是文档里常写的那套 10 + 58 = 68，那是横屏/桌面的值）。
//   · 关键陷阱：**`position: fixed` 的元素，若某祖先有 transform，它的包含块就是那个祖先**
//     （不是视口）。菜单 .nav-menu-mobile 正是这种情况 —— offsetParent 实测就是
//     .unified-nav-surface。所以它的 `top` 是**相对岛的 padding box**（48px）算的，
//     而不是相对视口。把 `top` 当视口坐标写，会**重复计算一次 translateY(8px)**。
//   · 修前实测：菜单 computed top 66px → 视觉上沿 = 8 + 1(border) + 66 = 75px，
//     岛底边 58px ⇒ **空隙 17px**（用户看到的就是它）。
//
// 断言（每个宽度档都跑）：
//   A 汉堡可见、点击后菜单打开（.nav-menu-mobile.active）
//   B **菜单上沿与岛底边齐平**：|menuTop − islandBottom| ≤ 1
//   C 菜单不被岛盖住：menuTop ≥ islandBottom − 1（允许 1px 边框重叠）
//   D 菜单打开时岛无下投影（否则阴影横跨接缝，视觉上又是一条灰缝）
//   E 菜单关闭时岛**有**投影（防止 D 被写成永久 none）
//   F 菜单横向不出视口
//
// 反证（改完必须自己先跑一遍，确认它真的会红）：
//   · 把 style.scoped.css 竖屏档的 `top: 100%` 改回 `top: 66px` → B 必红（Δ=17）
//   · 删掉 `:global(#unified-nav-container.mobile-menu-open .unified-nav-surface)`
//     的 `box-shadow: none` → D 必红
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const WIDTHS = (process.env.WIDTHS || '360,390,430').split(',').map(Number);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
      points: 42,
    });
  });
  await page.waitForTimeout(300);
};

const MEASURE = () => {
  const surface = document.querySelector('.unified-nav-surface');
  const menu = document.querySelector('.nav-menu-mobile');
  const sb = surface?.getBoundingClientRect();
  const mb = menu?.getBoundingClientRect();
  return {
    vw: window.innerWidth,
    hamburgerVisible: (() => {
      const b = document.querySelector('#nav-hamburger');
      return b
        ? getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0
        : false;
    })(),
    menuActive: menu ? menu.classList.contains('active') : false,
    menuVisible: menu ? menu.getBoundingClientRect().height > 0 : false,
    islandBottom: sb ? +sb.bottom.toFixed(2) : null,
    menuTop: mb ? +mb.top.toFixed(2) : null,
    menuLeft: mb ? +mb.left.toFixed(2) : null,
    menuRight: mb ? +mb.right.toFixed(2) : null,
    surfaceBoxShadow: surface ? getComputedStyle(surface).boxShadow : null,
  };
};

const browser = await launch();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForTimeout(600);

  const tag = `${width}px`;

  const burger = page.locator('#nav-hamburger');
  if (!(await burger.isVisible())) {
    check(`A ${tag} 汉堡可见`, false, '汉堡不可见 —— 该档不在移动端形态，断言无意义');
    await ctx.close();
    continue;
  }

  const closed = await page.evaluate(MEASURE);
  await burger.click();
  await page.waitForTimeout(1200); // slideDown 0.4s + delay 180ms，留足余量
  const open = await page.evaluate(MEASURE);

  check(
    `A ${tag} 菜单已展开`,
    open.menuActive && open.menuVisible,
    `.active=${open.menuActive} 高度>0=${open.menuVisible}`,
  );
  check(
    `B ${tag} 菜单上沿与岛底边齐平`,
    open.menuTop !== null &&
      open.islandBottom !== null &&
      Math.abs(open.menuTop - open.islandBottom) <= 1,
    `菜单 ${open.menuTop} / 岛底 ${open.islandBottom} / 空隙 ${(open.menuTop - open.islandBottom).toFixed(2)}px`,
  );
  check(
    `C ${tag} 菜单未被岛盖住`,
    open.menuTop !== null && open.islandBottom !== null && open.menuTop >= open.islandBottom - 1,
    `Δ=${(open.menuTop - open.islandBottom).toFixed(2)}px`,
  );
  check(
    `D ${tag} 展开时岛无下投影`,
    open.surfaceBoxShadow === 'none',
    `box-shadow=${open.surfaceBoxShadow}`,
  );
  check(
    `E ${tag} 收起时岛有投影（D 不是永久 none）`,
    closed.surfaceBoxShadow !== 'none',
    `box-shadow=${closed.surfaceBoxShadow}`,
  );
  check(
    `F ${tag} 菜单横向不出视口`,
    open.menuLeft >= -0.5 && open.menuRight <= open.vw + 0.5,
    `left=${open.menuLeft} right=${open.menuRight} vw=${open.vw}`,
  );

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log('\n' + '-'.repeat(64));
console.log(`[probe-nav-mobile-menu] ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('FAIL 明细：');
  for (const r of failed) console.log(`  - ${r.name}  ${r.detail}`);
  process.exit(1);
}
console.log('[probe-nav-mobile-menu] 全部通过');
