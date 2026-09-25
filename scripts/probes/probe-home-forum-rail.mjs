import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：首页（论坛层）横屏左栏 —— 修复「换个入口进论坛，左右栏结构就没了」
//
// 背景：2026-09-23 首页社区化改版后，论坛本体落在首页 `/`（顶栏「社区 → 论坛」
// 与底栏「方块」都指 `/?view=latest`），而横屏左栏当时只做在 UserSpace ——
// 同一个论坛「从 /user-space 进有左栏、从首页进没有」，横屏电脑上就是左右栏消失。
//
// 断言组：
//   A 宽栏 1440×900：左栏可见 / 240px / fixed / 条目与 UserSpace 同源
//   B 内容让位：分区页签与顶部导航都以内容区（railW→视口右缘）为中心
//   C 同屏只留一个发布入口：内嵌编辑器隐藏、底栏槽位关掉
//   D 左栏动作：发布 → 发布会话落在右区（左栏仍可见）；我的 → /user-space?tab=posts
//   E 窄栏 1100×800：88px；竖屏 390×844：左栏 none、底栏仍在
//   F 开场画（.home-gate）在场时左栏先不显（:has 规则），退场后出现
//
// 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）
// 运行：node scripts/probes/probe-home-forum-rail.mjs
//
// counter-proof（手动）：
//   1) 删掉 Home/index.vue 的 <style src=".../landscape-rail.css"> → A1/B1 必红
//   2) 删掉 landscape-rail.css 里 body.page-home 的 .home-forum-stage padding-left
//      → B1（页签中心 = 内容区中心）必红
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots/home-forum-rail';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('PASS ', name, detail ? '— ' + detail : ''); }
  else { fail += 1; console.log('FAIL ', name, detail ? '— ' + detail : ''); }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const errors = [];

const injectAuth = async (page) => {
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null, { timeout: 30000 }
  );
  await page.waitForTimeout(500);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      Object.assign(auth.userInfo, {
        id: 'a1b2c3d4-0000-4000-8000-000000000003',
        username: 'probe_home_rail', role: 'user', points: 42
      });
    });
    await page.waitForTimeout(350);
  }
};

/** 打开首页；skipGate=true 时预置 24h 时间窗标记，直接落在论坛层 */
async function openHome(width, height, { skipGate = true, theme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript((cfg) => {
    try {
      localStorage.setItem('boh-theme', cfg.theme);
      if (cfg.skip) localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch { /* ignore */ }
  }, { skip: skipGate, theme });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  // 开场画阶段论坛层还没就位（stage 高度为 0），此时要等的是开场层本身
  await page.waitForSelector(skipGate ? '.forum-section-shell' : '.home-gate', { timeout: 20000 });
  await page.waitForTimeout(2200);
  return { context, page };
}

const measure = (page) => page.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    // ⚠️ display 不继承：祖先 display:none 时子元素的 computed display 仍是自己的值，
    // 所以「被祖先关掉」只能用尺寸判定（0×0）
    if (cs.display === 'none' || (b.width === 0 && b.height === 0)) return { hidden: true };
    return {
      x: Math.round(b.x), y: Math.round(b.y),
      w: Math.round(b.width), h: Math.round(b.height),
      cx: Math.round(b.x + b.width / 2)
    };
  };
  const rail = document.querySelector('.userspace-rail');
  const tabs = document.querySelector('.forum-section-shell .segment-tabs');
  const nav = document.querySelector('.unified-nav-surface');
  const composer = document.querySelector('.forum-page .forum-left-column > .post-creation-section');
  return {
    viewport: { w: innerWidth, h: innerHeight },
    bodyClass: document.body.className,
    railW: getComputedStyle(document.body).getPropertyValue('--userspace-rail-w').trim(),
    rail: box(rail),
    railPosition: rail ? getComputedStyle(rail).position : null,
    railItems: Array.from(document.querySelectorAll('.userspace-rail-item')).map((el) => el.textContent.trim()),
    railBadge: document.querySelector('.userspace-rail-badge')?.textContent.trim() || '',
    gate: box(document.querySelector('.home-gate')),
    stage: box(document.querySelector('.home-forum-stage')),
    tabs: box(tabs),
    nav: box(nav),
    htmlTheme: document.documentElement.getAttribute('data-theme'),
    indicatorBg: getComputedStyle(document.querySelector('.userspace-rail-indicator')).backgroundColor,
    inlineComposer: box(composer),
    // 底栏槽位是 display:contents，自身 rect 恒为 0×0 —— 要量它里面真正的底栏
    bottomNav: box(document.querySelector('.home-bottom-nav-slot .bottom-nav-glass')),
    mobileComposeFab: box(document.querySelector('.forum-page .mobile-compose-fab')),
    composerOverlay: box(document.querySelector('.mobile-composer-overlay'))
  };
});

try {
  // ---------------- A / B / C：宽栏 1440×900 ----------------
  {
    const { context, page } = await openHome(1440, 900);
    const m = await measure(page);
    console.log('\n--- 宽栏 1440×900 ---');
    check('A1 左栏可见且 240px', m.rail && !m.rail.hidden && m.rail.w === 240 && m.railW === '240px',
      `rail=${m.rail ? m.rail.w : 'ABSENT'} var=${m.railW}`);
    check('A2 左栏 fixed（长文档流下不被拉满整页）', m.railPosition === 'fixed', m.railPosition);
    check('A3 左栏条目与 UserSpace 同源（5 主 + 发布/搜索 + 首页）',
      m.railItems.join('/') === '方块/我的/资产/消息/设置/发布/搜索/首页', m.railItems.join('/'));

    const contentCx = Math.round((Number(m.railW.replace('px', '')) + m.viewport.w) / 2);
    check('B1 分区页签以内容区为中心', m.tabs && Math.abs(m.tabs.cx - contentCx) <= 2,
      `tabs.cx=${m.tabs?.cx} 期望=${contentCx}`);
    check('B2 顶部导航与内容区同心', m.nav && Math.abs(m.nav.cx - contentCx) <= 2,
      `nav.cx=${m.nav?.cx} 期望=${contentCx}`);
    check('B3 左栏不与内容重叠（内容左缘 ≥ 栏宽）',
      m.tabs && m.rail && m.tabs.x >= m.rail.w - 1, `tabs.x=${m.tabs?.x} railW=${m.rail?.w}`);

    check('C1 内嵌发帖编辑器在横屏隐藏（发布已收到左栏）',
      m.inlineComposer && m.inlineComposer.hidden, JSON.stringify(m.inlineComposer));
    check('C2 底栏在横屏关掉', !m.bottomNav || m.bottomNav.hidden, JSON.stringify(m.bottomNav));

    // D：左栏「发布」→ 发布会话只覆盖右区
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('.userspace-rail-item[data-rail-action="compose"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(2200);
    const after = await measure(page);
    check('D1 左栏「发布」打开发布会话', clicked && !!after.composerOverlay && !after.composerOverlay.hidden,
      JSON.stringify(after.composerOverlay));
    check('D2 发布会话左缘 = 栏宽（左栏保持可见）',
      after.composerOverlay && Math.abs(after.composerOverlay.x - after.rail.w) <= 2,
      `overlay.x=${after.composerOverlay?.x} railW=${after.rail?.w}`);
    await page.screenshot({ path: `${OUT}/wide-1440-composer.png` });

    // 关掉会话再测「我的」
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      document.querySelector('.userspace-rail-item[data-tab="posts"]')?.click();
    });
    await page.waitForTimeout(1500);
    check('D3 左栏「我的」→ /user-space?tab=posts',
      page.url().includes('/user-space') && page.url().includes('tab=posts'),
      page.url().replace(BASE, ''));

    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/wide-1440.png` });
    await context.close();
  }

  // ---------------- E1：窄栏 1100×800 ----------------
  {
    const { context, page } = await openHome(1100, 800);
    const m = await measure(page);
    console.log('\n--- 窄栏 1100×800 ---');
    check('E1 窄栏 88px', m.rail && m.rail.w === 88 && m.railW === '88px', `rail=${m.rail?.w} var=${m.railW}`);
    const contentCx = Math.round((88 + m.viewport.w) / 2);
    check('E2 窄栏下分区页签仍以内容区为中心', m.tabs && Math.abs(m.tabs.cx - contentCx) <= 2,
      `tabs.cx=${m.tabs?.cx} 期望=${contentCx}`);
    await page.screenshot({ path: `${OUT}/narrow-1100.png` });
    await context.close();
  }

  // ---------------- E3：竖屏 390×844 零副作用 ----------------
  {
    const { context, page } = await openHome(390, 844);
    const m = await measure(page);
    console.log('\n--- 竖屏 390×844 ---');
    check('E3 竖屏左栏不渲染（display:none）', m.rail && m.rail.hidden, JSON.stringify(m.rail));
    check('E4 竖屏底栏仍在（未被横屏规则波及）',
      m.bottomNav && !m.bottomNav.hidden && m.bottomNav.w > 200, JSON.stringify(m.bottomNav));
    // 竖屏本来就该走全屏编辑器（内嵌编辑器 v-if 就不渲染），这里守的是「没被横屏规则误伤」：
    // 分区页签不被左栏偏移影响 —— 仍以视口中心为中心
    check('E5 竖屏分区页签不受左栏偏移影响',
      m.tabs && Math.abs(m.tabs.cx - m.viewport.w / 2) <= 2,
      `tabs.cx=${m.tabs?.cx} 视口中心=${m.viewport.w / 2}`);
    await page.screenshot({ path: `${OUT}/portrait-390.png` });
    await context.close();
  }

  // ---------------- F：开场画在场时先不显左栏 ----------------
  {
    const { context, page } = await openHome(1440, 900, { skipGate: false });
    const during = await measure(page);
    console.log('\n--- 开场画在场 1440×900 ---');
    check('F1 开场画在场：左栏先隐藏', during.gate && !during.gate.hidden && during.rail && during.rail.hidden,
      `gate=${JSON.stringify(during.gate)} rail=${JSON.stringify(during.rail)}`);
    await page.screenshot({ path: `${OUT}/gate-open.png` });
    // 下滑退场
    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(2600);
    const after = await measure(page);
    check('F2 开场画退场后左栏出现', !after.gate && after.rail && !after.rail.hidden,
      `gate=${JSON.stringify(after.gate)} rail=${after.rail ? after.rail.w : 'ABSENT'}`);
    await context.close();
  }

  // ---------------- G：暗色下左栏淡染底（--rail-* 由页面根挂载） ----------------
  {
    const { context, page } = await openHome(1440, 900, { theme: 'dark' });
    const m = await measure(page);
    console.log('\n--- 暗色 1440×900 ---');
    check('G2 暗色主题已生效（html[data-theme=dark]）', m.htmlTheme === 'dark', String(m.htmlTheme));
    check('G3 选中胶囊淡染翻白（255,255,255 / .12）',
      /255,\s*255,\s*255/.test(m.indicatorBg), m.indicatorBg);
    await page.screenshot({ path: `${OUT}/wide-1440-dark.png` });
    await context.close();
  }

  check('H1 零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
