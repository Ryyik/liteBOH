import { chromium } from 'playwright';

// =====================================================================
// 探针：BOH AI 整页（/ai-chat）在横屏保留 UserSpace 左栏导航（2026-10-03 新增）
//
//   背景（用户口径）：AI 是底栏「AI」席的全屏落点，原先一切过去左栏整条消失 ——
//   横屏电脑上从「我」页点 AI，导航没了、只剩一个返回键。现在复用同一份
//   UserSpaceSideRail（BOHAIMain 里 v-if="isStandalone"）。
//
//   两档视口：
//     · 1440×900（横屏 ≥1024×600）：左栏可见/fixed/88px、高亮 AI 席、
//       整页 padding-left 88px、聊天区起点 ≥ 左栏右缘、
//       AI 自带会话侧栏接在左栏右侧（left: 88px）、顶部导航岛心 = 内容区中心、
//       点左栏「内容」能跳走、无 pageerror
//     · 390×844（竖屏）：左栏 display:none、整页不右移（零副作用）
//
//   ⚠️ 两条实测坑：
//     ① 页面级规则在 landscape-rail.css 里，而那个文件是**按页引入**的 ——
//        BOHAIMain 不写 `<style src=...>` 时，左栏照样渲染但 position/让位全不生效
//        （实测 absolute + padding-left:0 + 会话侧栏 left:0）。本探针第一条断言就是
//        「左栏 fixed 且贴左」，专门咬这一处。
//     ② 顶部导航岛是「满宽容器里 margin:0 auto 居中 + left 相对偏移」，
//        判据必须写成「岛心 == 内容区中心」，不能拿 left 的绝对值去比。
// =====================================================================
const BASE = process.env.PROBE_BASE || 'http://localhost:5173';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch();

const probeLandscape = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  // 2026-10-08：AI 页顶部导航默认**收成一颗球**（沉浸导航，见 probe-nav-immersive-orb.mjs），
  // 球态下不存在「内容区居中」这件事 ⇒ 先把导航唤醒成完整胶囊，再量下面这组几何。
  // （球与左栏的对位由沉浸球探针负责，这里只管展开态的光学居中。）
  await page
    .locator('#unified-nav-container .unified-nav-surface')
    .click()
    .catch(() => {});
  await page.waitForTimeout(900);

  const m = await page.evaluate(() => {
    const rail = document.querySelector('.userspace-rail');
    const pageEl = document.querySelector('.bohai-page');
    // plans/025 v2 · Step 6：会话侧栏重绘为 `.boh-sidebar`（旧 `.sidebar` 随旧 DOM 删除），
    // 主列由 `.main-content` 改为 `.boh-main`。
    const sidebar = document.querySelector('.boh-sidebar');
    const active = document.querySelector('.userspace-rail-item.active');
    const main = document.querySelector('.boh-main');
    const cs = rail ? getComputedStyle(rail) : null;
    const r = rail?.getBoundingClientRect();
    return {
      bodyClass: document.body.className,
      railFound: !!rail,
      display: cs?.display,
      position: cs?.position,
      width: r ? Math.round(r.width) : 0,
      left: r ? Math.round(r.left) : -1,
      right: r ? Math.round(r.right) : -1,
      railItems: document.querySelectorAll('.userspace-rail-item').length,
      activeTab: active?.getAttribute('data-tab') || '',
      pagePaddingLeft: pageEl ? getComputedStyle(pageEl).paddingLeft : '',
      sidebarLeft: sidebar ? getComputedStyle(sidebar).left : '(no sidebar)',
      sidebarOpen: !!sidebar && sidebar.classList.contains('is-open'),
      mainLeft: main ? Math.round(main.getBoundingClientRect().left) : -1,
      navSurfaceLeft: (() => {
        const s = document.querySelector('.unified-nav-surface');
        return s ? Math.round(s.getBoundingClientRect().left) : -1;
      })(),
      navSurfaceCenter: (() => {
        const s = document.querySelector('.unified-nav-surface');
        if (!s) return -1;
        const r = s.getBoundingClientRect();
        return Math.round(r.left + r.width / 2);
      })(),
    };
  });

  console.log('  [1440x900]', JSON.stringify(m));
  check('body 类名 = page-aichat', /\bpage-aichat\b/.test(m.bodyClass), m.bodyClass);
  check('左栏已渲染', m.railFound && m.railItems >= 3, `items=${m.railItems}`);
  check('左栏可见（display: flex）', m.display === 'flex', m.display);
  check(
    '左栏 fixed 且贴左',
    m.position === 'fixed' && m.left === 0,
    `${m.position} left=${m.left}`,
  );
  check('左栏宽 88px（不随 ≥1280 升到 240）', m.width === 88, `${m.width}px`);
  check('高亮项 = AI 席', m.activeTab === 'ai', m.activeTab);
  check('整页内容右移 88px', m.pagePaddingLeft === '88px', m.pagePaddingLeft);
  check('聊天区起点 ≥ 左栏右缘', m.mainLeft >= m.right, `main=${m.mainLeft} railRight=${m.right}`);
  check(
    'AI 会话侧栏接在左栏右侧（left: 88px）',
    m.sidebarOpen ? m.sidebarLeft === '88px' : true,
    `open=${m.sidebarOpen} left=${m.sidebarLeft}`,
  );
  // 导航岛是「在满宽容器里 margin:0 auto 居中 + left 相对偏移」，所以判据是
  // 「岛心 == 内容区中心」（内容区 = 视口去掉 88px 左栏），而不是 left 的绝对值。
  const contentCenter = Math.round((88 + 1440) / 2);
  check(
    '顶部导航以内容区居中（岛心 = 内容区中心）',
    Math.abs(m.navSurfaceCenter - contentCenter) <= 1,
    `center=${m.navSurfaceCenter} 期望=${contentCenter}`,
  );
  check('无 pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));

  // 左栏导航真的能跳：点「内容」→ 回首页论坛层
  await page.evaluate(() => {
    const item = document.querySelector('.userspace-rail-item[data-tab="community"]');
    item?.click();
  });
  await page.waitForTimeout(1500);
  const afterNav = await page.evaluate(() => location.hash);
  check(
    '点左栏「内容」跳到首页',
    afterNav.startsWith('#/') && !afterNav.includes('ai-chat'),
    afterNav,
  );

  await ctx.close();
};

const probePortrait = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const m = await page.evaluate(() => {
    const rail = document.querySelector('.userspace-rail');
    const pageEl = document.querySelector('.bohai-page');
    return {
      display: rail ? getComputedStyle(rail).display : '(none)',
      paddingLeft: pageEl ? getComputedStyle(pageEl).paddingLeft : '',
    };
  });
  console.log('  [390x844]', JSON.stringify(m));
  check('[竖屏] 左栏不显示（零副作用）', m.display === 'none', m.display);
  check('[竖屏] 整页不右移', m.paddingLeft === '0px', m.paddingLeft);
  await ctx.close();
};

await probeLandscape();
await probePortrait();

const failed = results.filter((r) => !r.pass);
console.log(`\n合计 ${results.length} 条，失败 ${failed.length} 条`);
await browser.close();
process.exit(failed.length ? 1 : 0);
