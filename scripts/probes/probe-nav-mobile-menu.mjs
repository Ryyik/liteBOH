import { chromium } from 'playwright';

// =====================================================================
// 探针：竖屏导航菜单的几何回归护栏（接缝 + 菜单内部的一级/二级/三级）
//
// 用户报过**两次**，两次的根因不同：
//
// ① 第一次：「导航栏与二级菜单之间那条异常空隙」。实测（390×844）：
//   · 岛 .unified-nav-surface 有 transform: translateY(8px) + height 50px
//     ⇒ 它的视觉底边 = 58px（不是文档里常写的那套 10 + 58 = 68，那是横屏/桌面的值）。
//   · 关键陷阱：**`position: fixed` 的元素，若某祖先有 transform，它的包含块就是那个祖先**
//     （不是视口）。菜单 .nav-menu-mobile 正是这种情况 —— offsetParent 实测就是
//     .unified-nav-surface。所以它的 `top` 是**相对岛的 padding box**（48px）算的，
//     而不是相对视口。把 `top` 当视口坐标写，会**重复计算一次 translateY(8px)**。
//   · 修前：菜单 computed top 66px → 视觉上沿 = 8 + 1(border) + 66 = 75px，岛底边 58px
//     ⇒ 空隙 17px。已改为 `top: 100%`。
//
// ② 第二次（本轮）：「点开二级菜单之后的大空隙 + 顶部（菜单内部）的问题」。实测修前：
//   · 竖屏把 .nav-mobile-submenu-container 改成了「在流内、追加显示」（好处是卡片随子菜单
//     长高），而 vendor 隐藏一级菜单用的是 `visibility: hidden` —— **它不释放高度**。
//     两者叠加：一级菜单仍占 261.95px，子菜单容器 top 被推到 329.95 ⇒ 菜单内部顶部
//     一条 272px 空洞，返回条/标题一起被推下去；卡片被 max-height 撑到 748 且最后一
//     项被裁（底边 −9.67px）。
//   · 同一个根因还有第三个症状：**收起态**的子菜单容器也在占位（67.9px）⇒ 一级菜单底部
//     多出 81px 空白。修后 11px（与顶部的 10px 基本对称）。
//   · 修法（都在 style.scoped.css 竖屏档内，且两条规则**成对**）：
//     `.nav-menu-mobile .nav-mobile-main-menu.hidden { display: none }`
//     `.nav-mobile-submenu-container { height: 0; padding-top: 0; overflow: hidden }`
//     （**不能**去改 vendor 的 .nav-mobile-main-menu.hidden：横屏档子菜单容器仍是 absolute
//      覆盖式、靠主菜单撑高，把主菜单移出流会让那一档塌成 0 高。）
//
// 断言（三个宽度档各跑一遍）：
//   A 汉堡可见、点击后菜单打开（.nav-menu-mobile.active）
//   B **菜单上沿与岛底边齐平**：|menuTop − islandBottom| ≤ 1
//   C 菜单不被岛盖住：menuTop ≥ islandBottom − 1（允许 1px 边框重叠）
//   D 菜单打开时岛无下投影（否则阴影横跨接缝，视觉上又是一条灰缝）
//   E 菜单关闭时岛**有**投影（防止 D 被写成永久 none）
//   F 菜单横向不出视口
//   G 一级态：**收起态的子菜单容器不占位**（≤1px），卡片底部余量 ≤24px
//   H 二级态：面板从菜单内容区**顶部**开始（内部空洞 ≤12px），一级菜单占位 = 0
//   I 二级态：返回条贴在面板顶部
//   J 二级态：最后一个可见项**不被卡片裁掉**，且卡片不超出视口
//   K 点「返回」能回到一级菜单，且几何与刚进入菜单时一致（防「隐藏」被写成永久）
//
// 反证（改完必须自己先跑一遍，确认它真的会红）：
//   · 把竖屏档的 `top: 100%` 改回 `top: 66px` → B 必红（Δ=17）
//   · 删掉 `#unified-nav-container.mobile-menu-open .unified-nav-surface` 的
//     `box-shadow: none` → D 必红
//   · 删掉本轮那两条（主菜单 `display:none` / 容器 `height:0`）→ G/H/J 必红。
//     实测（`git checkout` 回退后跑）：24/33，G 子菜单容器高 67.9、卡片底余量 81；
//     H 一级菜单占位 261.95、顶部空洞 271.95；J 卡片底余量 −9.67。
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

// 菜单内部几何（一级 / 二级 / 三级 各调一次）
const MEASURE_INNER = () => {
  const q = (s) => document.querySelector(s);
  const vis = (el) =>
    !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), h: +b.height.toFixed(2) };
  };
  const card = q('.nav-menu-mobile');
  const content = q('.nav-menu-mobile-content');
  const main = q('.nav-mobile-main-menu');
  const subWrap = q('.nav-mobile-submenu-container');
  const back = q('.nav-mobile-back');
  const items = [
    ...document.querySelectorAll('.nav-menu-mobile a, .nav-mobile-group-entry'),
  ].filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height > 0);
  const last = items[items.length - 1];
  const cb = box(card);
  const cc = box(content);
  const sw = box(subWrap);
  return {
    cardH: cb?.h ?? null,
    cardBottom: cb?.bottom ?? null,
    mainVisible: vis(main),
    mainH: box(main)?.h ?? 0,
    subWrapTop: sw?.top ?? null,
    subWrapH: sw?.h ?? 0,
    backTop: box(back)?.top ?? null,
    groupBackTop: box(q('.nav-mobile-group-back'))?.top ?? null,
    // 一级态：收起态的子菜单**不得占位**；二级/三级态：面板必须从内容区顶部开始
    //（修前实测 273px —— 就是用户报的「点开二级菜单后的大空隙」）
    innerTopVoid: sw && cc ? +(sw.top - cc.top).toFixed(2) : null,
    // 最后一项底边到卡片底边的余量（负数 = 被裁掉，修前实测 −9.67）
    bottomSlack: cb && last ? +(cb.bottom - box(last).bottom).toFixed(2) : null,
    overflowsViewport: cb ? cb.bottom > window.innerHeight : null,
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

  // ── G–K：菜单**内部**的几何（一级 ↔ 二级 ↔ 三级）────────────────────
  // 这一段是 2026-09-28 用户第二次报障后补的：上一轮只测了「菜单展开/收起」，
  // 从没测过点开二级菜单之后的状态，于是 273px 的顶部空洞 + 底部裁切全部漏过。

  // G/I：一级态 —— 收起态的子菜单容器**不得占位**（修前占 67.9px）
  const lv1 = await page.evaluate(MEASURE_INNER);
  check(
    `G ${tag} 一级态：收起态子菜单不占位`,
    lv1.subWrapH <= 1 && lv1.bottomSlack !== null && lv1.bottomSlack <= 24,
    `子菜单容器高=${lv1.subWrapH} 卡片底余量=${lv1.bottomSlack}px（修前 67.9 / 81）`,
  );

  // 点开第一个「带子项」的一级菜单
  const parents = page.locator('.nav-mobile-item.has-children .nav-mobile-link');
  const parentCount = await parents.count();
  let openedLabel = null;
  for (let i = 0; i < parentCount; i++) {
    const label = (await parents.nth(i).innerText()).trim();
    await parents.nth(i).click();
    await page.waitForTimeout(900);
    const visibleChildren =
      (await page.locator('.nav-mobile-submenu-section:visible a').count()) +
      (await page.locator('.nav-mobile-submenu-section:visible .nav-mobile-group-entry').count());
    if (visibleChildren > 0) {
      openedLabel = label;
      break;
    }
    await page.locator('.nav-mobile-back').click();
    await page.waitForTimeout(600);
  }

  if (!openedLabel) {
    check(`H–K ${tag} 二级菜单`, false, '没有找到任何带子项的一级菜单，无法验证');
  } else {
    const lv2 = await page.evaluate(MEASURE_INNER);

    // H：面板必须从内容区**顶部**开始（修前被隐藏的一级菜单顶到 273px 处）
    check(
      `H ${tag} 二级态：面板从菜单顶部开始（无内部空洞）`,
      lv2.mainH === 0 && lv2.innerTopVoid !== null && lv2.innerTopVoid <= 12,
      `「${openedLabel}」一级菜单占位=${lv2.mainH} 顶部空洞=${lv2.innerTopVoid}px（修前 261.95 / 273）`,
    );

    // I：返回条必须贴在面板顶部
    check(
      `I ${tag} 二级态：返回条在面板顶部`,
      lv2.backTop !== null && lv2.subWrapTop !== null && lv2.backTop - lv2.subWrapTop <= 12,
      `返回条 ${lv2.backTop} / 面板顶 ${lv2.subWrapTop}`,
    );

    // J：最后一项不被卡片裁掉（修前 −9.67px，尾部被切）
    check(
      `J ${tag} 二级态：最后一项未被裁切`,
      lv2.bottomSlack !== null && lv2.bottomSlack >= 0 && lv2.overflowsViewport === false,
      `卡片底余量=${lv2.bottomSlack}px 超视口=${lv2.overflowsViewport}`,
    );

    // K：点返回能回到一级菜单（且一级态几何与刚才一致 —— 防止「隐藏」被写成永久）
    await page.locator('.nav-mobile-back').click();
    await page.waitForTimeout(1000);
    const back = await page.evaluate(MEASURE_INNER);
    check(
      `K ${tag} 返回键回到一级菜单`,
      back.mainVisible && back.mainH > 100 && Math.abs(back.cardH - lv1.cardH) <= 2,
      `一级菜单可见=${back.mainVisible} 高=${back.mainH} 卡片高=${back.cardH}（一级态 ${lv1.cardH}）`,
    );
  }

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
