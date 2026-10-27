import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：发布会话出口去重（顶栏只保留取消 / 发布；标题文案已下线）
//   会话（.mobile-composer-overlay）顶栏是唯一发布出口；
//   内部动作栏只保留图片 / 标签 / 智能整理 / 更多，不再出现第二颗发布按钮。
//   断言：顶栏三件套在、内部 post-btn 与旧 footer 工具条不可见；
//         2026-10-26 起内嵌编辑器已废弃，页面里不应再出现它。
//   场景 A：竖屏 420x900（fab 打开）  B：横屏 1400x900（左栏「发布」打开）
//         C：900x700（landscape 但无分栏 → 页面无内嵌编辑器，FAB 是入口）
// =====================================================================
const BASE = process.env.PROBE_BASE || 'http://[::1]:5173';
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

// 度量：会话内每个出口的可见性（计算样式 + 几何双重判定）
const MEASURE_FN = () => {
  const vis = (el) => {
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      display: cs.display,
      visibility: cs.visibility,
      w: Math.round(r.width),
      h: Math.round(r.height),
      rendered: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0
    };
  };
  const q = (sel) => document.querySelector(`.mobile-composer-overlay ${sel}`);
  const overlay = document.querySelector('.mobile-composer-overlay');
  return {
    overlay: (() => {
      if (!overlay) return null;
      const cs = getComputedStyle(overlay);
      const r = overlay.getBoundingClientRect();
      return {
        position: cs.position,
        left: Math.round(r.left), top: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height)
      };
    })(),
    // 顶栏（保留下来的唯一出口）
    bar: vis(q('.mobile-composer-bar')),
    barCancel: vis(q('.mobile-composer-back')),
    barTitle: q('.mobile-composer-title')?.textContent.trim() || null,
    barSubmit: vis(q('.mobile-composer-submit')),
    // 底部整条（应整条消失）
    footer: vis(q('.editor-footer')),
    submitGroup: vis(q('.editor-submit-group')),
    desktopTools: vis(q('.desktop-post-tools')),
    footerPostBtn: vis(q('.editor-footer .post-btn')),
    actionBar: vis(q('.composer-actions')),
    legacyChipRow: !!q('.mobile-composer-chip-row'),
    imageAction: vis(q('.composer-actions .composer-action-btn[aria-label*="相册选择图片"]')),
    polishAction: vis(q('.composer-polish-action')),
    moreAction: vis(q('.composer-more-btn'))
  };
};

// dev 下 HMR 推送会打断 evaluate（Execution context was destroyed）→ 包一次重试，避免假红
const measure = async (page) => {
  try {
    return await page.evaluate(MEASURE_FN);
  } catch {
    await page.waitForTimeout(1000);
    return page.evaluate(MEASURE_FN);
  }
};

const report = { results: {}, checks: {}, pageErrors: [] };
const browser = await launch();

// ---------- 场景 A：竖屏 420x900，fab 打开会话 ----------
{
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('A: ' + String(e).slice(0, 160)));
  // 注：#/forum 会被重定向到用户空间，论坛已内嵌在 /user-space?tab=community
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.user-space-page', { timeout: 20000 });
  await page.waitForSelector('.mobile-compose-fab', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click('.mobile-compose-fab');
  await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(900);
  report.results.A_portrait = await measure(page);
  await page.screenshot({ path: `${OUT}/composer-dedupe-A-portrait.png` });
  await context.close();
}

// ---------- 场景 B：横屏 1400x900，左栏「发布」打开会话 ----------
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('B: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.user-space-page', { timeout: 20000 });
  await page.waitForSelector('[data-rail-action="compose"]', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.click('[data-rail-action="compose"]');
  await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1200);
  report.results.B_landscape = await measure(page);
  await page.screenshot({ path: `${OUT}/composer-dedupe-B-landscape.png` });

  // 行为断言：动作栏的「图片」必须真的弹出选图（不能只是 DOM 里有颗按钮）
  const imageSel = '.mobile-composer-overlay .composer-actions .composer-action-btn[aria-label*="相册选择图片"]';
  const imageVisible = await page.locator(imageSel).isVisible().catch(() => false);
  let chooser = null;
  if (imageVisible) {
    [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null),
      page.click(imageSel).catch(() => {})
    ]);
  }
  report.results.B_picker = {
    imageVisible,
    fileChooserOpened: !!chooser,
    multiple: chooser ? chooser.isMultiple() : null
  };
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/composer-dedupe-B-picker.png` });
  await context.close();
}

// ---------- 场景 C：900x700（landscape 但无分栏）内嵌编辑器已废弃，FAB 必须接管 ----------
{
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('C: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.user-space-page', { timeout: 20000 });
  await page.waitForSelector('.mobile-compose-fab', { timeout: 20000 });
  await page.waitForTimeout(1500);
  report.results.C_midwidth_inline = await page.evaluate(() => {
    const root = document.querySelector('.forum-left-column');
    const vis = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        display: cs.display,
        w: Math.round(r.width),
        h: Math.round(r.height),
        rendered: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0
      };
    };
    return {
      overlayOpen: !!document.querySelector('.mobile-composer-overlay'),
      inlineComposer: !!root?.querySelector('.post-creation-section'),
      fab: vis(document.querySelector('.mobile-compose-fab'))
    };
  });
  await page.screenshot({ path: `${OUT}/composer-dedupe-C-midwidth.png` });
  await context.close();
}

await browser.close();

// ---------- 断言 ----------
const A = report.results.A_portrait;
const B = report.results.B_landscape;
const C = report.results.C_midwidth_inline;

report.checks = {
  // 舞台真实存在（防止量到页面流里的同名元素 → 假绿）
  A_session_open: !!A.overlay && A.overlay.position === 'fixed' && A.overlay.h > 400,
  B_session_open: !!B.overlay && B.overlay.position === 'fixed' && B.overlay.h > 400,
  // 顶栏三个出口都还在（唯一出口的承担者）
  A_bar_intact: A.barCancel.rendered && A.barSubmit.rendered,
  A_bar_title_gone: A.barTitle === null,
  B_bar_title_gone: B.barTitle === null,
  B_bar_cancel_gone: !B.barCancel.rendered,
  B_bar_intact: B.barSubmit.rendered,
  // 动作栏保留，但旧桌面工具条与内部第二颗发布按钮必须消失
  A_footer_row_alive: A.footer.rendered === true,
  B_footer_row_alive: B.footer.rendered === true,
  A_second_submit_gone: !A.footerPostBtn.rendered,
  B_second_submit_gone: !B.footerPostBtn.rendered,
  A_legacy_tools_gone: !A.desktopTools.rendered,
  B_legacy_tools_gone: !B.desktopTools.rendered,
  C_inline_session_closed: C.overlayOpen === false,
  C_inline_composer_gone: C.inlineComposer === false,
  C_fab_alive: !!C.fab && C.fab.rendered === true,
  // 新动作栏：横竖屏都必须有图片 / 智能整理 / 更多，且旧 chips 不得回来
  A_action_bar: A.actionBar.rendered && A.imageAction.rendered && A.polishAction.rendered,
  B_action_bar: B.actionBar.rendered && B.imageAction.rendered && B.polishAction.rendered
    && B.moreAction.rendered,
  B_image_action_opens_picker: report.results.B_picker.fileChooserOpened === true,
  A_no_legacy_chips: A.legacyChipRow === false,
  B_no_legacy_chips: B.legacyChipRow === false
};
report.pass = Object.values(report.checks).every(Boolean) && report.pageErrors.length === 0;

fs.writeFileSync(`${OUT}/composer-dedupe-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
