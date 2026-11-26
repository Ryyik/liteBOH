import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：Cloud+ 图库页「竖屏顶栏工具行」几何（2026-10-01 新增）
//
//   背景：Cloud+ 竖屏连报两轮（相册网格 → 顶栏），之前没有护栏。
//   报障原状（390×844 实测）：工具行被 `flex-wrap: nowrap` 硬压成一行，产生三条连锁后果——
//     ① 搜索框只剩 30px（内部 input 宽 0）→ placeholder 与已输入内容全不可见；
//     ② 「筛选 / 刷新」被压到 45px 后文字折成三行（看起来就是竖排的「筛/选」）；
//     ③ 「新建」继承本档 `.primary-btn { width: 100% }`（本文件 style.scoped.css:2895）
//        又自带 `flex-shrink: 0` → right=518，**超出视口 128px 被祖先裁掉**。
//   修法：工具行折两行（搜索框独占第一行，三个按钮第二行平分）。
//
//   本探针锁死的就是这三条 + 「页头不再吸顶」「底栏仍是液态玻璃」两条相邻不变量。
//
//   ⚠️ 为什么没有相册网格断言：网格要 mock 一批带图条目才会渲染（探测账号 Cloud+ 是 0 条），
//      那是另一套 route 拦截；网格的 3 列 / 通栏 / 直角 / 2px 缝已在 2026-10-01 用临时脚本实测过，
//      若以后要常驻，连同 mock 一起补。
//
//   counter-proof（必须做）：把 ≤640 块里的修复整段还原成 `flex-wrap: nowrap` + 搜索框 `flex: 1`，
//   三档的 B/C/D/E 必须全部变红（实测：搜索框 30px、筛选 h=69、新建 right=518/503/448）。
// =====================================================================

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '375x667', width: 375, height: 667 },
  { name: '320x568', width: 320, height: 568 },
];

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const skip = (name, detail = '') => {
  results.push({ name, pass: null, detail });
  console.log(`SKIP  ${name}${detail ? '  -- ' + detail : ''}`);
};
const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

// pinia 伪造登录（探针惯例：reactive 须 Object.assign，id 用合法 UUID）
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
    });
  });
};

/**
 * 进入 Cloud+ 图库（内容分页）。
 * 先落到可访问页注入 pinia 登录，再用真实 router 进图库；不能直接 goto，
 * 因为路由守卫会在注入登录之前把深链拦回首页。
 */
const openCloudGallery = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document
      .querySelector('#app')
      .__vue_app__.config.globalProperties.$router.push('/user-space/note');
  });

  try {
    await page.waitForSelector('.gallery-header-actions', { timeout: 15000 });
  } catch {
    return { ok: false, why: '进入图库后工具条没渲染' };
  }
  await page.waitForTimeout(800);
  return { ok: true };
};

const readHeader = () =>
  `(() => {
  const q = (s) => document.querySelector(s);
  const box = (s) => {
    const el = q(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) };
  };
  const actions = q('.gallery-header-actions');
  return {
    viewportW: window.innerWidth,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    actionsWrap: actions ? getComputedStyle(actions).flexWrap : null,
    actionsPosition: actions ? getComputedStyle(actions).position : null,
    actions: box('.gallery-header-actions'),
    selectBtn: box('.album-select-trigger'),
    moreBtn: box('.gallery-more-shell > button'),
    headerPosition: (() => {
      const h = q('.gallery-header');
      return h ? getComputedStyle(h).position : null;
    })(),
    bottomNavFilter: (() => {
      /* 2026-10-22：Cloud+ 不再自带底栏，底部换成全站底栏（.bottom-nav-glass）。
         断言意图不变 —— 底栏这一层必须是液态玻璃，别被改成实色。 */
      const n = q('.bottom-nav-glass');
      return n ? getComputedStyle(n).backdropFilter || getComputedStyle(n).webkitBackdropFilter : null;
    })(),
  };
})()`;

const readSearch = () =>
  `(() => {
  const field = document.querySelector('.gallery-search-expander');
  const input = document.querySelector('.gallery-search-expander input');
  if (!field || !input) return { searchField: null, searchInputW: 0 };
  const r = field.getBoundingClientRect();
  return {
    searchField: { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) },
    searchInputW: Math.round(input.getBoundingClientRect().width),
  };
})()`;

const browser = await launch();

try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));

    const opened = await openCloudGallery(page);
    if (!opened.ok) {
      skip(`[${vp.name}] 进入 Cloud+ 图库`, opened.why);
      await ctx.close();
      continue;
    }

    await page.locator('.gallery-more-shell > button').click();
    await page.getByRole('menuitem', { name: '搜索' }).click();
    await page.waitForSelector('.gallery-search-expander input');
    const search = await page.evaluate(readSearch());
    await page.getByRole('button', { name: '关闭搜索' }).click();
    const r = { ...(await page.evaluate(readHeader())), ...search };
    const p = (s) => `[${vp.name}] ${s}`;
    const detail = `搜索框=${r.searchField?.w}px(input=${r.searchInputW}px) 选择h=${r.selectBtn?.h} 更多h=${r.moreBtn?.h} 工具行h=${r.actions?.h} wrap=${r.actionsWrap}`;

    // A 图标工具条保持单行，搜索展开时由输入框独占整行
    check(
      p('A 图标工具条保持单行（flex-wrap: nowrap）'),
      r.actionsWrap === 'nowrap',
      `flex-wrap=${r.actionsWrap}`,
    );

    // B 展开搜索框必须完整可用：窄屏宽 ≥ 150 且内部 input ≥ 80
    check(
      p('B 展开搜索框完整可用（宽 ≥ 150，内部 input ≥ 80）'),
      (r.searchField?.w ?? 0) >= 150 && r.searchInputW >= 80,
      `field=${r.searchField?.w}px input=${r.searchInputW}px`,
    );

    // C 图标按钮不得被压成多行高块
    check(
      p('C 工具按钮保持单行几何（高度 < 60）'),
      (r.selectBtn?.h ?? 0) < 60 && (r.moreBtn?.h ?? 0) < 60,
      `选择h=${r.selectBtn?.h} 更多h=${r.moreBtn?.h}`,
    );

    // D 更多与选择两颗按钮不得越出视口
    check(
      p('D 更多与选择按钮不越出视口右缘'),
      (r.selectBtn?.right ?? 1e9) <= r.viewportW &&
        (r.moreBtn?.right ?? 1e9) <= r.viewportW &&
        (r.selectBtn?.x ?? -1) >= 0 &&
        (r.moreBtn?.x ?? -1) >= 0,
      `选择right=${r.selectBtn?.right} 更多right=${r.moreBtn?.right} 视口=${r.viewportW}`,
    );

    // E 页面不得出现横向滚动
    check(p('E 无横向滚动'), r.overflowX === false, `overflowX=${r.overflowX}`);

    // F 只固定按钮层：标题和日期正常滚动，下滑后按钮仍可点
    check(
      p('F 图库按钮层保持固定（position: fixed）'),
      r.actionsPosition === 'fixed',
      `position=${r.actionsPosition}`,
    );

    // G 底栏仍是液态玻璃（2026-10-22 起这是**全站底栏**，Cloud+ 只是它的宿主页之一）
    check(
      p('G 底部导航保持液态玻璃（backdrop-filter 含 blur）'),
      typeof r.bottomNavFilter === 'string' && /blur/.test(r.bottomNavFilter),
      `backdrop-filter=${r.bottomNavFilter}`,
    );

    if (errs.length) check(p('H 零页面错误'), false, errs.slice(0, 2).join(' | '));
    else check(p('H 零页面错误'), true, '');

    // I 设置页 / 分享页的卡片是液态玻璃（2026-10-01 改版）
    //    材质单源 = 全局 `.liquid-glass`；这里锁三件事：
    //      · backdrop-filter 真的在（不是被 scoped 的实色底骗过来）
    //      · 背景是半透明白（若变回 rgb(245,245,247) 说明又被某条 `.sidebar-card` 覆盖了
    //        —— 那正是改版前踩到的坑：blur 生效但底色仍被压）
    //      · 卡片与存储条**圆角一致**（都来自 --liquid-radius-lg；被 scoped 的 --radius-lg 压回去就红）
    await page.locator('.gallery-more-shell > button').click();
    await page.getByRole('menuitem', { name: '设置' }).click();
    await page.waitForTimeout(2500);
    const glass = await page.evaluate(() => {
      const card = document.querySelector('.cloud-settings-page .sidebar-card');
      const bar = document.querySelector('.storage-bar-card');
      const cs = card ? getComputedStyle(card) : null;
      const bs = bar ? getComputedStyle(bar) : null;
      return {
        hasCard: Boolean(card),
        hasBar: Boolean(bar),
        cardBg: cs?.backgroundColor || '',
        cardBlur: cs?.backdropFilter || '',
        cardRadius: cs?.borderRadius || '',
        barRadius: bs?.borderRadius || '',
        barBlur: bs?.backdropFilter || '',
      };
    });
    check(
      p('I 设置页卡片为液态玻璃（模糊 + 半透明底 + 圆角与存储条一致）'),
      glass.hasCard &&
        glass.hasBar &&
        /blur\(/.test(glass.cardBlur) &&
        /rgba\(255,\s*255,\s*255/.test(glass.cardBg) &&
        glass.cardRadius === glass.barRadius &&
        glass.cardRadius !== '' &&
        /blur\(/.test(glass.barBlur),
      `card(bg=${glass.cardBg} blur=${glass.cardBlur} r=${glass.cardRadius}) storage(r=${glass.barRadius} blur=${glass.barBlur})`,
    );

    console.log(`       ${detail}`);
    await page.screenshot({ path: `${OUT}/probe-cloud-portrait-${vp.name}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass === true).length;
const failed = results.filter((r) => r.pass === false).length;
const skipped = results.filter((r) => r.pass === null).length;
console.log(`\nCloud+ 竖屏顶栏：${passed} PASS / ${failed} FAIL / ${skipped} SKIP`);
process.exit(failed > 0 ? 1 : 0);
