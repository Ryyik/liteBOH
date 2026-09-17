import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：竖屏导航 Mini Bar 形态（plans/009-portrait-nav-mini-bar.md）
//   默认 mini 胶囊（logo + 头像 + 汉堡）⇄ 点汉堡一步展开长条 + 菜单；
//   任意岛唤起强制展开且连体；岛关闭双轴回缩 mini；连发通知无缝接管不闪断。
//   场景：
//     A 竖屏 390x844（≤480 档）首帧 mini + 点 logo 不展开（直达）
//     B 点汉堡 → 长条 + 菜单（一步到位）
//     C 点外部 → 回缩 mini
//     D 菜单开着唤起通知岛 → 菜单被收 + 岛强制展开连体
//     E 连发两条通知 → 宽度轨迹全程 >300（无缝接管无闪断）→ 结束回 mini
//     F 滚动 >140px 回缩；横向滚动（scrollLeft）不误触
//     G 横屏 1400x900 现状零影响
//     H 竖屏 600x900（>480 档）mini 宽 128
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const launch = () => chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user', role: 'user', points: 42
    });
  });
};

// dev 下 HMR 会打断 evaluate → 包一次重试，避免假红
const evalRetry = async (page, fn, arg) => {
  try {
    return await page.evaluate(fn, arg);
  } catch {
    await page.waitForTimeout(1000);
    return page.evaluate(fn, arg);
  }
};

const MEASURE_FN = () => {
  const $ = (s) => document.querySelector(s);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
  };
  const surface = $('.unified-nav-surface');
  const container = surface ? surface.querySelector('.nav-container') : null;
  const cs = surface ? getComputedStyle(surface) : null;
  const logoText = $('.nav-logo-text');
  const username = $('.nav-username');
  const menu = $('.nav-menu-mobile');
  const statusCard = $('.global-nav-status-card');
  return {
    surface: rect(surface),
    classes: surface ? surface.className : null,
    surfaceMaxW: cs ? cs.maxWidth : null,
    surfaceH: cs ? cs.height : null,
    containerScrollW: container ? container.scrollWidth : null,
    containerClientW: container ? container.clientWidth : null,
    logoTextOpacity: logoText ? getComputedStyle(logoText).opacity : null,
    usernameOpacity: username ? getComputedStyle(username).opacity : null,
    logoIcon: rect($('.nav-logo-icon')),
    avatar: rect($('.nav-avatar')),
    burger: rect($('#nav-hamburger')),
    burgerRendered: (() => { const b = $('#nav-hamburger'); if (!b) return false; const s = getComputedStyle(b); const r2 = b.getBoundingClientRect(); return s.display !== 'none' && r2.width > 0; })(),
    menuActive: !!menu && menu.classList.contains('active'),
    menuDisplay: menu ? getComputedStyle(menu).display : null,
    statusCardRect: rect(statusCard),
    statusCardRendered: (() => { if (!statusCard) return false; const s = getComputedStyle(statusCard); return s.display !== 'none' && statusCard.getBoundingClientRect().height > 0; })(),
    viewport: { w: window.innerWidth, h: window.innerHeight }
  };
};

const dispatchIsland = (title, durationMs) => {
  window.dispatchEvent(new CustomEvent('boh_global_nav_status', {
    detail: { title, message: '', icon: 'success', durationMs }
  }));
};

// 采样 surface 宽度轨迹（E 场景「无闪断」的判据）
const startWidthPolling = (page) => page.evaluate(() => {
  window.__miniPoll = [];
  window.__miniPollTimer = setInterval(() => {
    const s = document.querySelector('.unified-nav-surface');
    if (s) window.__miniPoll.push({ t: Date.now(), w: Math.round(s.getBoundingClientRect().width), island: s.classList.contains('has-status-card') });
  }, 50);
});
const stopWidthPolling = (page) => page.evaluate(() => {
  clearInterval(window.__miniPollTimer);
  return window.__miniPoll || [];
});

const report = { results: {}, checks: {}, pageErrors: [] };
const browser = await launch();

// ---------- 场景 A：竖屏 390x844 首帧 mini + logo 直达 ----------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('A: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.A_mini = await evalRetry(page, MEASURE_FN);
  // 点 logo：直达不展开
  await page.click('.nav-logo');
  await page.waitForTimeout(500);
  report.results.A_afterLogoTap = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-A-firstframe.png` });
  await context.close();
}

// ---------- 场景 B/C：点汉堡展开 + 菜单；点外部回缩 ----------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('BC: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  // B：点汉堡 = 展开 + 菜单一步到位
  await page.click('#nav-hamburger');
  await page.waitForTimeout(1000);
  report.results.B_expanded = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-B-expanded.png` });
  // C：点胶囊外部（页面左下角）→ 回缩 mini
  await page.mouse.click(30, 700);
  await page.waitForTimeout(800);
  report.results.C_collapsed = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-C-collapsed.png` });
  await context.close();
}

// ---------- 场景 D：菜单开着唤起通知岛 → 收菜单 + 强制展开连体 ----------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('D: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.click('#nav-hamburger');       // 先开菜单
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('boh_global_nav_status', {
      detail: { title: '离线摘要已生成', message: '探针 D', icon: 'success', durationMs: 4000 }
    }));
  });
  await page.waitForTimeout(1100);
  report.results.D_island = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-D-island.png` });
  // 岛关闭 → 双轴回 mini
  await page.waitForTimeout(4200);
  report.results.D_afterClose = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-D-afterclose.png` });
  await context.close();
}

// ---------- 场景 E：连发两条通知，宽度轨迹无闪断 ----------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('E: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await startWidthPolling(page);
  await page.evaluate(() => {
    const fire = (title) => window.dispatchEvent(new CustomEvent('boh_global_nav_status', {
      detail: { title, message: '', icon: 'success', durationMs: 1800 }
    }));
    fire('探针通知一');
    setTimeout(() => fire('探针通知二'), 120);   // 第二条入队（第一条在场）
  });
  await page.waitForTimeout(6200);
  const track = await stopWidthPolling(page);
  await context.close();
  const islandFrames = track.filter((f) => f.island);
  const minIslandW = islandFrames.length ? Math.min(...islandFrames.map((f) => f.w)) : 0;
  const lastW = track.length ? track[track.length - 1].w : 0;
  const islandSpan = islandFrames.length ? islandFrames[islandFrames.length - 1].t - islandFrames[0].t : 0;
  report.results.E_track = { frames: track.length, islandFrames: islandFrames.length, minIslandW, lastW, islandSpan };
  report.results.E_minIslandW = minIslandW;
  report.results.E_lastW = lastW;
  report.results.E_islandSpan = islandSpan;
}

// ---------- 场景 F：滚动回缩 + 横向滚动不误触 ----------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('F: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.click('#nav-hamburger');
  await page.waitForTimeout(900);
  // 横向滚动（scrollLeft）不触发回缩：插入一个横滑容器并滚动它
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'probe-hscroll';
    d.style.cssText = 'position:fixed;left:0;bottom:0;width:200px;height:40px;overflow-x:auto;z-index:1;';
    d.innerHTML = '<div style="width:600px;height:10px"></div>';
    document.body.appendChild(d);
    d.scrollLeft = 80;
  });
  await page.waitForTimeout(700);
  report.results.F_afterHScroll = await evalRetry(page, MEASURE_FN);
  // 纵向滚动 >140 → 回缩
  await page.evaluate(() => window.scrollTo(0, 220));
  await page.waitForTimeout(800);
  report.results.F_afterVScroll = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-F-scrolled.png` });
  await context.close();
}

// ---------- 场景 G：横屏 1400x900 现状零影响 ----------
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('G: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.G_landscape = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-G-landscape.png` });
  await context.close();
}

// ---------- 场景 H：竖屏 600x900（>480 档）mini 宽 128 ----------
{
  const context = await browser.newContext({ viewport: { width: 600, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('H: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  report.results.H_portrait_mid = await evalRetry(page, MEASURE_FN);
  await page.screenshot({ path: `${OUT}/nav-mini-H-600w.png` });
  await context.close();
}

await browser.close();

// ---------- 断言 ----------
const A = report.results.A_mini;
const AL = report.results.A_afterLogoTap;
const B = report.results.B_expanded;
const C = report.results.C_collapsed;
const D = report.results.D_island;
const DC = report.results.D_afterClose;
const F1 = report.results.F_afterHScroll;
const F2 = report.results.F_afterVScroll;
const G = report.results.G_landscape;
const H = report.results.H_portrait_mid;

const hasMini = (m) => /nav-mini-caps/.test(m.classes || '');
const hasExpanded = (m) => /nav-expanded/.test(m.classes || '');

report.checks = {
  // A：首帧 mini —— 机制类在、展开类不在、宽度即 mini 档、文本隐藏、三元素齐全
  A_mini_class: hasMini(A) && !hasExpanded(A),
  A_mini_width: A.surface && A.surface.w >= 134 && A.surface.w <= 146,
  A_no_overflow: A.containerScrollW && A.containerScrollW <= A.surface.w - 2,
  A_texts_hidden: A.logoTextOpacity === '0' && A.usernameOpacity === '0',
  A_anchors_alive: !!A.logoIcon && A.logoIcon.w > 0 && A.avatar && A.avatar.w > 0 && A.burgerRendered,
  A_logo_tap_no_expand: hasMini(AL) && !hasExpanded(AL) && AL.surface && AL.surface.w <= 146,
  // B：点汉堡一步到位 —— 长条 + 菜单 + 文本可见
  B_expanded_class: hasExpanded(B) && hasMini(B),
  B_full_width: B.surface && B.surface.w > 300,
  B_texts_shown: B.logoTextOpacity === '1' && B.usernameOpacity === '1',
  B_menu_open: B.menuActive && B.menuDisplay !== 'none',
  // C：点外部回缩
  C_collapsed_back: hasMini(C) && !hasExpanded(C) && C.surface && C.surface.w <= 146,
  C_menu_closed: !C.menuActive || C.menuDisplay === 'none',
  // D：岛强制展开 + 连体（状态卡 top 相对 surface ≈ status-top 57px）+ 菜单被收
  D_island_forced_expand: hasExpanded(D) && D.surface && D.surface.w > 300,
  D_menu_auto_closed: !D.menuActive || D.menuDisplay === 'none',
  D_island_attached: D.statusCardRect && D.surface && Math.abs((D.statusCardRect.top - D.surface.top) - 57) <= 10,
  // 岛关闭后一起回缩（双轴：宽回 mini、高回 50）
  D_closed_back_to_mini: hasMini(DC) && !hasExpanded(DC) && DC.surface && DC.surface.w <= 146 && DC.surfaceH === '50px',
  // E：连发两条，岛活跃窗口内宽度轨迹最小值仍 >300（无闪断），结束回 mini
  E_no_flash_gap: report.results.E_minIslandW > 300 && report.results.E_islandSpan > 3200,
  E_back_to_mini: report.results.E_lastW <= 146,
  // F：横向滚动不误触、纵向滚动回缩
  F_hscroll_no_collapse: hasExpanded(F1) && F1.menuActive,
  F_vscroll_collapses: hasMini(F2) && !hasExpanded(F2),
  // G：横屏零影响（nav-mini-caps 必须不在；nav-expanded 横屏常驻是派生预期，无样式效果）
  G_no_mini_class: !hasMini(G),
  G_landscape_width_intact: G.surface && Math.abs(G.surface.w - 860) <= 4,
  // H：>480 竖屏 mini 档 164（内容实测 152，含 user-info 胶囊底 padding 16）
  H_mini_width_164: hasMini(H) && H.surface && H.surface.w >= 158 && H.surface.w <= 170,
  H_no_overflow: H.containerScrollW && H.containerScrollW <= H.surface.w - 2
};

report.pass = Object.values(report.checks).every(Boolean) && report.pageErrors.length === 0;

fs.writeFileSync(`${OUT}/nav-mini-report.json`, JSON.stringify(report, null, 2));
const failed = Object.entries(report.checks).filter(([, v]) => !v);
console.log(`checks: ${Object.keys(report.checks).length}, failed: ${failed.length}`);
failed.forEach(([k]) => console.log('  FAIL ' + k));
if (report.pageErrors.length) console.log('pageErrors:', report.pageErrors.slice(0, 5));
console.log(JSON.stringify(report.results, null, 2));
process.exit(report.pass ? 0 : 1);
