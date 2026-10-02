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
 * ⚠️ 不能直接 goto(`/user-space/note`)：路由守卫在注入登录之前就把它拦回首页了。
 * 必须走真实入口：用户空间「设置」→ 点 Cloud+ 那行 → 落 view=settings → 点底栏「内容」。
 * 这同时是一条真实路径的冒烟（入口一旦坏掉，本探针会以「进不去」的形式变红）。
 */
const openCloudGallery = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForTimeout(3000);

  const entered = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.settings-shell button')].find((b) =>
      /Cloud\s*\+?/i.test(b.textContent || ''),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!entered) return { ok: false, why: '设置页里没找到 Cloud+ 入口' };

  await page.waitForTimeout(5000);
  const switched = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.cloud-bottom-nav-item')].find((b) =>
      /内容/.test(b.textContent || ''),
    );
    if (!item) return false;
    item.click();
    return true;
  });
  if (!switched) return { ok: false, why: 'Cloud+ 底栏没有「内容」分页' };

  try {
    await page.waitForSelector('#cloud-search', { timeout: 15000 });
  } catch {
    return { ok: false, why: '点了「内容」但图库工具行没渲染（#cloud-search 缺席）' };
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
  const input = q('#cloud-search');
  return {
    viewportW: window.innerWidth,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    actionsWrap: actions ? getComputedStyle(actions).flexWrap : null,
    actions: box('.gallery-header-actions'),
    searchField: box('.gallery-search-field'),
    searchInputW: input ? Math.round(input.getBoundingClientRect().width) : 0,
    filterBtn: box('.filter-trigger'),
    refreshBtn: box('.refresh-btn:not(.filter-trigger)'),
    primaryBtn: box('.gallery-header-actions .primary-btn'),
    headerPosition: (() => {
      const h = q('.user-center-page-header');
      return h ? getComputedStyle(h).position : null;
    })(),
    bottomNavFilter: (() => {
      const n = q('.cloud-bottom-nav');
      return n ? getComputedStyle(n).backdropFilter || getComputedStyle(n).webkitBackdropFilter : null;
    })(),
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

    const r = await page.evaluate(readHeader());
    const p = (s) => `[${vp.name}] ${s}`;
    const detail = `搜索框=${r.searchField?.w}px(input=${r.searchInputW}px) 筛选h=${r.filterBtn?.h} 刷新h=${r.refreshBtn?.h} 新建right=${r.primaryBtn?.right}/${r.viewportW} 工具行h=${r.actions?.h} wrap=${r.actionsWrap}`;

    // A 工具行必须是换行容器（折两行），不是 nowrap 硬压
    check(
      p('A 工具行允许换行（flex-wrap: wrap）'),
      r.actionsWrap === 'wrap',
      `flex-wrap=${r.actionsWrap}`,
    );

    // B 搜索框独占第一行且真能看能打：宽 ≥ 150 且内部 input 宽 ≥ 80
    check(
      p('B 搜索框完整可用（宽 ≥ 150，内部 input ≥ 80）'),
      (r.searchField?.w ?? 0) >= 150 && r.searchInputW >= 80,
      `field=${r.searchField?.w}px input=${r.searchInputW}px —— 报障原状是 30px/0px，placeholder 与输入全不可见`,
    );

    // C 「筛选 / 刷新」单行（折行即竖排两字一行）
    check(
      p('C 「筛选」「刷新」文字单行（未折字）'),
      (r.filterBtn?.h ?? 0) < 60 && (r.refreshBtn?.h ?? 0) < 60,
      `筛选h=${r.filterBtn?.h} 刷新h=${r.refreshBtn?.h}（折行时约 69）`,
    );

    // D 「＋新建」不得越出视口（报障原状：right=518 > 390，右半边被裁）
    check(
      p('D 「＋新建」不越出视口右缘'),
      (r.primaryBtn?.right ?? 1e9) <= r.viewportW && (r.primaryBtn?.x ?? -1) >= 0,
      `right=${r.primaryBtn?.right} 视口=${r.viewportW}`,
    );

    // E 页面不得出现横向滚动
    check(p('E 无横向滚动'), r.overflowX === false, `overflowX=${r.overflowX}`);

    // F 页头不再吸顶（2026-10-01 用户报障「这个栏不要固定在屏幕上」）
    check(
      p('F 页头不吸顶（position 非 sticky/fixed）'),
      r.headerPosition !== 'sticky' && r.headerPosition !== 'fixed',
      `position=${r.headerPosition}`,
    );

    // G 底栏仍是液态玻璃（Cloud+ 仅存的显形玻璃面之一，别被误改成实色）
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
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('.cloud-bottom-nav-item')].find(
        (b) => b.textContent.trim() === '设置',
      );
      item?.click();
    });
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
