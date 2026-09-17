import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：发布会话底部整条工具栏去重（只保留上方顶栏 取消 / 草稿 / 发布）
//   会话（.mobile-composer-overlay）顶栏始终提供 取消 / 草稿 / 发布；
//   底部那条 .editor-footer（#标签 / 预览 / 图片计数 / 保存草稿 / 更多 / 黑发布）
//   在 ≤768px 已被隐藏，但宽屏 / 横屏会整条重新出现 → 一屏两套出口。
//   断言：会话内 .editor-footer 整条不可见，且顶栏出口仍在；
//         反向保护：内嵌编辑器（非会话）的 footer 不能被误伤 —— 那是它唯一出口。
//   场景 A：竖屏 420x900（fab 打开）  B：横屏 1400x900（左栏「发布」打开）
//         C：900x700（landscape 但无分栏 → 内嵌编辑器）
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
    barDraft: vis(q('.mobile-composer-draft-btn')),
    barSubmit: vis(q('.mobile-composer-submit')),
    // 底部整条（应整条消失）
    footer: vis(q('.editor-footer')),
    submitGroup: vis(q('.editor-submit-group')),
    desktopTools: vis(q('.desktop-post-tools')),
    footerPostBtn: vis(q('.editor-footer .post-btn')),
    saveDraftBtn: vis(q('.desktop-save-draft-btn')),
    // chips 行的发图入口（横屏才显示）+ 网格内大卡片（竖屏才显示）—— 二者必须互斥
    chipRow: vis(q('.mobile-composer-chip-row')),
    chipImage: vis(q('.mobile-composer-chip--image')),
    chipImageText: (() => {
      const el = q('.mobile-composer-chip--image');
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    })(),
    addMoreCard: vis(q('.post-image-add-more-card'))
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

  // 行为断言：点「图片」chip 必须真的弹出选图（不能只是 DOM 里有颗按钮）
  // 先判可见再点 —— chip 不可见时直接跳过，让报告能完整跑出 false，而不是点击超时中断
  const chipSel = '.mobile-composer-overlay .mobile-composer-chip--image';
  const chipVisible = await page.locator(chipSel).isVisible().catch(() => false);
  let chooser = null;
  if (chipVisible) {
    [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null),
      page.click(chipSel).catch(() => {})
    ]);
  }
  report.results.B_picker = {
    chipVisible,
    fileChooserOpened: !!chooser,
    multiple: chooser ? chooser.isMultiple() : null
  };
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/composer-dedupe-B-picker.png` });
  await context.close();
}

// ---------- 场景 C：900x700（landscape 但无分栏）内嵌编辑器，整条 footer 必须还在 ----------
{
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.pageErrors.push('C: ' + String(e).slice(0, 160)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.user-space-page', { timeout: 20000 });
  await page.waitForSelector('.forum-left-column .post-creation-section', { timeout: 20000 });
  await page.waitForTimeout(1500);
  report.results.C_midwidth_inline = await page.evaluate(() => {
    const root = document.querySelector('.forum-left-column .post-creation-section');
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
      inlineFooter: vis(root.querySelector('.editor-footer')),
      inlinePostBtn: vis(root.querySelector('.editor-footer .post-btn')),
      inlineChipRow: !!root.querySelector('.mobile-composer-chip-row')
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
  A_bar_intact: A.barCancel.rendered && A.barDraft.rendered && A.barSubmit.rendered,
  B_bar_intact: B.barCancel.rendered && B.barDraft.rendered && B.barSubmit.rendered,
  // 底部整条必须消失（footer 本身 + 内部所有入口）
  A_footer_row_removed: A.footer.display === 'none',
  B_footer_row_removed: B.footer.display === 'none',
  A_footer_children_gone: !A.desktopTools.rendered && !A.footerPostBtn.rendered && !A.saveDraftBtn.rendered,
  B_footer_children_gone: !B.desktopTools.rendered && !B.footerPostBtn.rendered && !B.saveDraftBtn.rendered,
  // 反向保护：内嵌编辑器（非会话）的整条 footer 与发布按钮不能被误伤
  C_inline_session_closed: C.overlayOpen === false,
  C_inline_footer_alive: !!C.inlineFooter && C.inlineFooter.rendered === true,
  C_inline_post_btn_alive: !!C.inlinePostBtn && C.inlinePostBtn.rendered === true,
  C_inline_has_no_chip_row: C.inlineChipRow === false,
  // 发图入口在会话内必须恰好一个：横屏用 chips 行的「图片」chip，竖屏用网格内大卡片
  A_image_chip_hidden: A.chipImage.display === 'none',
  A_add_card_alive: A.addMoreCard.rendered === true,
  B_image_chip_visible: B.chipImage.rendered === true
    && /图片/.test(B.chipImageText || '')
    && /0\/6/.test(B.chipImageText || ''),
  B_add_card_hidden: !B.addMoreCard.rendered,
  B_image_chip_opens_picker: report.results.B_picker.fileChooserOpened === true
};
report.pass = Object.values(report.checks).every(Boolean) && report.pageErrors.length === 0;

fs.writeFileSync(`${OUT}/composer-dedupe-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
