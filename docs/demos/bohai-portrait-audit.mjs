/**
 * bohai-portrait-audit.mjs — BOHAI 竖屏「模式选择」现状体检（只读，诊断脚本）
 *
 * 用途：为 `plans/031-bohai-portrait-mode-picker.md` 的「实测现状」一节提供**可重跑的判据**。
 * 不做断言判定（不是门禁），只打印每项指标与已知问题的 ⚠️ 标记；方案落地后应把它转成
 * `scripts/probes/probe-bohai-mode-sheet.mjs`（带断言、进探针清单）。
 *
 * 前置：dev server 在 5173（`npm run dev` 或 `vite --host ::`）。
 * 用法：node docs/demos/bohai-portrait-audit.mjs [baseUrl]
 *      默认 http://[::1]:5173
 *
 * 判据口径：
 *   · 所有几何取 `getBoundingClientRect()`，面板可见性以 computed display 为准（v-show）；
 *   · 模式表是异步 RPC（实测 ~0.9s）⇒ 每处都等 `.boh-mm-item` 落地再量，避免竞态；
 *   · 登录态用 pinia 注入（仓库既有口径，不种 sb-*-auth-token）。
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:5173';
const UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
const SIZES = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const log = (section, data) => console.log(`\n### ${section}\n${JSON.stringify(data, null, 1)}`);

const boot = async (ctx, { login = true, page: existing = null } = {}) => {
  const page = existing || (await ctx.newPage());
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(300);
  if (login) {
    await page.evaluate((uid) => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      if (auth.userInfo) Object.assign(auth.userInfo, { username: 'audit', id: uid });
    }, UID);
  }
  await page.waitForSelector('.boh-composer-input', { timeout: 20000 });
  return page;
};

const openModeMenu = async (page) => {
  // 模式表是异步 RPC（实测 0.6–2.4s 抖动）⇒ 等「骨架消失 + 行出现」，别用固定 sleep。
  // 面板可能在 RPC 落地前被误关（再点一次胶囊会切换），所以整个动作允许重试。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.evaluate(() => {
      const m = document.querySelector('.boh-mode-menu');
      return !!m && getComputedStyle(m).display !== 'none';
    });
    if (!open) await page.locator('.boh-mode-pill').click();
    const ready = await page
      .waitForFunction(
        () =>
          !document.querySelector('.boh-mm-loading') &&
          document.querySelectorAll('.boh-mm-item').length >= 3,
        null,
        { timeout: 12000 },
      )
      .then(() => true)
      .catch(() => false);
    if (ready) {
      await page.waitForTimeout(250);
      return true;
    }
  }
  console.warn('   ⚠️ 模式菜单未在 36s 内出现行（RPC 慢 / 被关掉），本节数据不可用');
  return false;
};

const menuMetrics = (page) =>
  page.evaluate(() => {
    const menu = document.querySelector('.boh-mode-menu');
    const first = document.querySelector('.boh-mm-item');
    const current = document.querySelector('.boh-mm-item.is-on');
    const rows = [...document.querySelectorAll('.boh-mm-item')];
    if (!menu || !first || !current) {
      return { rows: rows.length, ready: false };
    }
    const mb = menu.getBoundingClientRect();
    const cb = current.getBoundingClientRect();
    const fb = first.getBoundingClientRect();
    const orb = document.querySelector('#unified-nav-container .unified-nav-surface');
    const ob = orb ? orb.getBoundingClientRect() : null;
    const overlaps = (a, b) =>
      !!a && !!b && !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    return {
      ready: true,
      viewport: { w: innerWidth, h: innerHeight },
      menu: {
        top: Math.round(mb.top),
        bottom: Math.round(mb.bottom),
        height: Math.round(mb.height),
      },
      firstRow: { top: Math.round(fb.top), height: Math.round(fb.height) },
      currentRow: { text: current.textContent.trim().slice(0, 14), top: Math.round(cb.top) },
      currentFullyVisible: cb.top >= mb.top - 0.5 && cb.bottom <= mb.bottom + 0.5,
      fullyVisibleRows: rows.filter((el) => {
        const b = el.getBoundingClientRect();
        return b.top >= mb.top - 0.5 && b.bottom <= mb.bottom + 0.5;
      }).length,
      totalRows: rows.length,
      rowHeights: [...new Set(rows.map((el) => Math.round(el.getBoundingClientRect().height)))],
      orbOverlapsFirstRow: ob ? overlaps(fb, ob) : null,
      menuAboveViewport: mb.top < 0,
    };
  });

// ── A. 多档竖屏：当前行可见性 / 首行是否被导航球压住 / 触控热区 ─────────────
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    serviceWorkers: 'block',
  });
  const page = await boot(ctx);
  await openModeMenu(page);
  log(`A ${w}x${h} 模式菜单几何`, await menuMetrics(page));
  await ctx.close();
}

// ── B. 触屏（hasTouch）：行高是否 ≥44 ───────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: 'block',
  });
  const page = await boot(ctx);
  await openModeMenu(page);
  const touch = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.boh-mm-item')];
    const detail = document.querySelector('.boh-mm-detail-anchor');
    return {
      hoverNone: matchMedia('(hover: none)').matches,
      rowHeights: rows.map((el) => Math.round(el.getBoundingClientRect().height)),
      minRowHeight: Math.min(...rows.map((el) => Math.round(el.getBoundingClientRect().height))),
      detailCardMounted: !!detail,
    };
  });
  log('B 触屏热区（期望 ≥44）', touch);
  // B2：触屏点一行后是否残留 hover 详情卡
  await page.locator('.boh-mm-item').nth(4).tap();
  await page.waitForTimeout(300);
  const afterTap = await page.evaluate(() => {
    const d = document.querySelector('.boh-mm-detail');
    return d ? { mounted: true, display: getComputedStyle(d).display } : { mounted: false };
  });
  log('B2 触屏点行后详情卡', afterTap);
  await ctx.close();
}

// ── C. 竖屏 390×844：hover 详情卡是否仍会挂出（layout.css 的 portrait 规则是否生效）──
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await boot(ctx);
  await openModeMenu(page);
  await page.locator('.boh-mm-item').nth(4).hover({ force: true });
  await page.waitForTimeout(300);
  const hover = await page.evaluate(() => {
    const d = document.querySelector('.boh-mm-detail');
    if (!d) return { mounted: false };
    const b = d.getBoundingClientRect();
    return {
      mounted: true,
      display: getComputedStyle(d).display,
      left: Math.round(b.left),
      right: Math.round(b.right),
      offscreenLeft: b.right <= 0,
    };
  });
  log('C 竖屏 hover 详情卡（期望不挂）', hover);
  await ctx.close();
}

// ── D. 软键盘弹起（--kb-inset 注入）：菜单是否被顶出视口 ─────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await boot(ctx);
  await page.evaluate(() => document.documentElement.style.setProperty('--kb-inset', '336px'));
  await page.waitForTimeout(400);
  await openModeMenu(page);
  log('D 键盘弹起（可用高度 508）', await menuMetrics(page));
  await ctx.close();
}

// ── E. 键盘关不掉：Esc 是否收起菜单（独立页没有宿主 Esc 分层）────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await boot(ctx);
  await openModeMenu(page);
  const isOpen = () =>
    page.evaluate(() => {
      const m = document.querySelector('.boh-mode-menu');
      return !!m && getComputedStyle(m).display !== 'none';
    });
  const opened = await isOpen();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const afterEsc = await isOpen();
  const focusOnOpen = await page.evaluate(
    () => document.activeElement?.className || document.activeElement?.tagName,
  );
  log('E Esc / 焦点', { opened, afterEsc, focusOnOpen, escWorks: !afterEsc });
  await ctx.close();
}

// ── F. 游客：锁定行数量 / 首次可见的可用行 / 点锁定的反馈落点 ─────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await boot(ctx, { login: false });
  await openModeMenu(page);
  const guest = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.boh-mm-item')];
    const menu = document.querySelector('.boh-mode-menu');
    const mb = menu.getBoundingClientRect();
    const usable = rows.filter((el) => !el.classList.contains('is-locked'));
    return {
      total: rows.length,
      locked: rows.filter((el) => el.classList.contains('is-locked')).length,
      usableIndex: rows.findIndex((el) => !el.classList.contains('is-locked')) + 1,
      usableFullyVisible: usable.every((el) => {
        const b = el.getBoundingClientRect();
        return b.top >= mb.top && b.bottom <= mb.bottom;
      }),
      lockedOpacity: rows[0] ? getComputedStyle(rows[0]).opacity : null,
    };
  });
  log('F 游客模式菜单', guest);
  if (!guest.total) {
    log('F2 游客点锁定行的反馈', { note: '无行可点（RPC 慢），跳过' });
    await ctx.close();
  } else {
    await page
      .locator('.boh-mm-item.is-locked')
      .first()
      .click({ force: true, timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    const feedback = await page.evaluate(() => {
      const nav = document.querySelector('#unified-nav-container');
      const surface = nav?.querySelector('.unified-nav-surface');
      const settings = document.querySelector('.ai-settings-backdrop');
      return {
        navText: (nav?.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
        navSurfaceTop: surface ? Math.round(surface.getBoundingClientRect().top) : null,
        settingsOpen: !!settings,
      };
    });
    log('F2 游客点锁定行的反馈', feedback);
    await ctx.close();
  }
}

// ── G. 设置页「默认响应模式」：游客能否选到锁定行（与输入区口径是否一致）──────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await boot(ctx, { login: false });
  await page.waitForTimeout(1200);
  await page.locator('.boh-float-actions button[title="打开侧栏"]').click();
  await page.waitForTimeout(400);
  await page.locator('.boh-account-btn').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('.boh-account-actions button')]
      .find((x) => /设置/.test(x.textContent || ''))
      ?.click();
  });
  await page.waitForSelector('.ai-settings-drawer', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    [...document.querySelectorAll('.ai-settings-row.clickable')]
      .find((x) => /默认响应模式/.test(x.textContent || ''))
      ?.click();
  });
  await page.waitForTimeout(400);
  const settings = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('.ai-settings-inline-option')];
    return {
      count: opts.length,
      lockedCount: opts.filter((el) => el.classList.contains('is-locked')).length,
      disabledCount: opts.filter((el) => el.disabled).length,
      ariaDisabledCount: opts.filter((el) => el.getAttribute('aria-disabled') === 'true').length,
    };
  });
  log('G 设置页模式选择（游客）', settings);
  await ctx.close();
}

// ── H. 模式表 RPC 失败：空态是否可恢复（有无重试入口）────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.route('**/rest/v1/rpc/list_public_bohai_modes**', (route) => route.abort('failed'));
  await boot(ctx, { page });
  await page.waitForTimeout(2000);
  await page.locator('.boh-mode-pill').click();
  await page.waitForTimeout(900);
  const failed = await page.evaluate(() => {
    const menu = document.querySelector('.boh-mode-menu');
    return {
      text: (menu?.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
      rows: document.querySelectorAll('.boh-mm-item').length,
      hasRetry: [...(menu?.querySelectorAll('button') || [])].some((b) =>
        /重试|重新加载/.test(b.textContent || ''),
      ),
      pillName: document.querySelector('.boh-mode-pill-name')?.textContent?.trim(),
    };
  });
  log('H RPC 失败态', failed);
  await ctx.close();
}

// ── I. 岛形态（overlay）：模式菜单 / 斜杠菜单是否被岛体裁切 ──────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(1200);
  if (!(await page.evaluate(() => !!document.querySelector('.bohai-island')))) {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(1200);
  }
  const islandOpen = await page.evaluate(() => !!document.querySelector('.bohai-island'));
  if (!islandOpen) {
    log('I 岛形态', { islandOpen: false, note: '快捷键未唤起，跳过' });
  } else {
    await openModeMenu(page);
    const overlay = await page.evaluate(() => {
      const menu = document.querySelector('.boh-mode-menu');
      const island = document.querySelector('.bohai-island');
      const chat = document.querySelector('.bohai-island-chat');
      const box = (n) => {
        if (!n) return null;
        const b = n.getBoundingClientRect();
        return {
          top: Math.round(b.top),
          bottom: Math.round(b.bottom),
          height: Math.round(b.height),
        };
      };
      return {
        island: box(island),
        chat: box(chat),
        chatOverflow: chat ? getComputedStyle(chat).overflow : null,
        menu: box(menu),
        menuAboveIslandChat:
          menu && chat ? menu.getBoundingClientRect().top < chat.getBoundingClientRect().top : null,
        visibleRows: [...document.querySelectorAll('.boh-mm-item')].filter((el) => {
          const r = el.getBoundingClientRect();
          const cr = chat.getBoundingClientRect();
          return r.top >= cr.top && r.bottom <= cr.bottom;
        }).length,
        totalRows: document.querySelectorAll('.boh-mm-item').length,
      };
    });
    log('I 岛形态模式菜单', overlay);
    await page.locator('.boh-mode-pill').click();
    await page.waitForTimeout(300);
    await page.locator('.boh-composer-input').fill('/');
    await page.waitForTimeout(500);
    const slash = await page.evaluate(() => {
      const el = document.querySelector('.boh-slash');
      const chat = document.querySelector('.bohai-island-chat');
      if (!el) return { mounted: false };
      const b = el.getBoundingClientRect();
      const c = chat.getBoundingClientRect();
      return {
        mounted: true,
        top: Math.round(b.top),
        height: Math.round(b.height),
        aboveChatTop: b.top < c.top,
        chatTop: Math.round(c.top),
      };
    });
    log('I2 岛形态斜杠菜单', slash);
  }
  await ctx.close();
}

await browser.close();
console.log('\n（完）');
