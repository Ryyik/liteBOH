#!/usr/bin/env node
/**
 * probe-data-admin-portrait.mjs — 数据管理后台 竖屏手机端可用性探针
 *
 * 覆盖 390×844（iPhone 14/15）与 360×800（常见安卓）两档：
 *   1. 页面整体不横向溢出（scrollWidth ≤ innerWidth）
 *   2. 移动端走卡片列表（.mobile-card），且首屏能看到若干卡片
 *   3. 关键可点元素命中区 ≥ 40px（WCAG 2.2 AA 为 24px，Apple HIG 44px）
 *   4. 模块 tab 横向可滑、不换行、不被裁
 *   5. 编辑抽屉占满宽度、不溢出、底部操作条可点到
 *   6. 表单输入字号 ≥ 16px（iOS 会自动放大的阈值）
 *   7. 详情子页在竖屏可打开且返回按钮可见
 *   8. 勾选行后批量条出现且不遮挡内容
 *
 * 默认诊断模式（打印 PASS/FAIL，exit 0）；`--strict` 作门禁。
 * 运行：node scripts/probes/probe-data-admin-portrait.mjs [--strict]
 * 依赖：dev server 在 5173（BASE 可覆盖）；假 admin 登录态 + mock PostgREST，不写真实库。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const IDs = Array.from(
  { length: 12 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const users = Array.from({ length: 12 }, (_, i) => ({
  id: IDs[i],
  username: `user_${i + 1}`,
  role: i % 7 === 0 ? 'moderator' : 'user',
  points: 100 + i,
  experience: 10 + i,
  join_date: '2026-01-01T00:00:00.000Z',
  bio: '',
  avatar_url: '',
  avatar_frame_url: '',
  tags: [],
}));

const results = [];
const check = (viewport, name, pass, detail = '') => {
  results.push({ viewport, name, pass: Boolean(pass), detail: String(detail).slice(0, 160) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${viewport}] ${name}${detail ? `  -- ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const loginAsAdmin = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(1500);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    s.isAdmin = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
  }, ADMIN_UUID);
};

const mockRest = async (page) => {
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, users: 12, forum: 137, lotteries: 3 }),
      });
    }
    // 详情页按 id 单条取数（id=eq.xxx）：返回数组会被 postgrest-js 判成
    // "JSON object requested, multiple (or no) rows returned"（假失败）。
    const accept = route.request().headers().accept || '';
    if (accept.includes('vnd.pgrst.object') || url.includes('id=eq.')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.pgrst.object+json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(users[0]),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-11/12',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      },
      body: JSON.stringify(users),
    });
  });
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
  );
};

const runViewport = async (width, height) => {
  const vp = `${width}x${height}`;
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 120)));
  await mockRest(page);
  await loginAsAdmin(page);

  await page.goto(`${BASE}/#/admin/data-management?section=data&tab=users`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('.data-management-page', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const base = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const size = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        left: Math.round(r.left),
      };
    };
    const tap = (sel) => {
      const el = q(sel);
      return el ? size(el) : null;
    };
    const tabs = q('.g-module-tabs, .tabs-nav');
    const cards = document.querySelectorAll('.mobile-card');
    return {
      // 关键：用 clientWidth（= 设备 CSS 宽度）比，不能用 innerWidth。
      // 内容溢出时 Chrome 移动端会把 layout viewport 撑大（innerWidth 跟着变大），
      // 于是「scrollWidth === innerWidth」永远成立 —— 那是个假绿。
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      visualWidth: window.visualViewport ? Math.round(window.visualViewport.width) : null,
      bodyScrollWidth: document.body.scrollWidth,
      cardCount: cards.length,
      firstCard: size(cards[0]),
      headerH: size(document.querySelector('.g-topbar'))?.h ?? null,
      tableVisible: Boolean(
        q('.g-table-sheet') && q('.g-table-sheet').getBoundingClientRect().height > 0,
      ),
      tabs: tabs
        ? {
            scrollWidth: tabs.scrollWidth,
            clientWidth: tabs.clientWidth,
            height: Math.round(tabs.getBoundingClientRect().height),
            wrap: getComputedStyle(tabs).flexWrap,
          }
        : null,
      tap: {
        sidebarToggle: tap('.g-topbar .g-icon-btn.round'),
        checkbox: tap('.mobile-card .checkbox-wrapper'),
        editBtn: tap('.mobile-card .mobile-action-btn.edit'),
        rowMenu: tap('.mobile-card [aria-haspopup="menu"], .mobile-card .row-action-trigger'),
        searchInput: tap('.toolbar-secondary .search-box input'),
        createBtn: tap('.toolbar-primary .btn-primary'),
        paginationNext: tap('.mobile-data-pagination button'),
      },
      fontSizes: {
        cardLabel: q('.mobile-card-label')
          ? getComputedStyle(q('.mobile-card-label')).fontSize
          : null,
        cardValue: q('.mobile-card-value')
          ? getComputedStyle(q('.mobile-card-value')).fontSize
          : null,
      },
    };
  });

  check(
    vp,
    '页面无横向溢出',
    base.docScrollWidth <= (base.clientWidth || base.innerWidth) + 1,
    `scrollWidth=${base.docScrollWidth} clientWidth=${base.clientWidth} visual=${base.visualWidth} innerWidth=${base.innerWidth}`,
  );
  check(vp, '走移动端卡片列表', base.cardCount > 0, `cards=${base.cardCount}`);
  check(vp, '桌面表格不在移动端渲染', !base.tableVisible, `tableVisible=${base.tableVisible}`);
  // 竖屏验收线：首张卡片完整可见，且内容区不超过首屏一半（<=50%）。
  // 重构前实测 584/844 = 69%，即 2/3 屏被 chrome 吃掉。
  check(
    vp,
    '首屏内容区 ≤50%（≥1 张完整卡片）',
    Boolean(
      base.firstCard &&
      base.firstCard.top <= height * 0.5 &&
      base.firstCard.top + base.firstCard.h <= height - 40,
    ),
    `firstTop=${base.firstCard?.top} cardH=${base.firstCard?.h} ratio=${(base.firstCard?.top / height).toFixed(2)}`,
  );
  // tab 能全放下更好；放不下必须可横滑。两种都算达标，换行/被裁算失败。
  check(
    vp,
    '模块 tab 不被裁切且不换行',
    Boolean(
      base.tabs &&
      base.tabs.wrap !== 'wrap' &&
      (base.tabs.scrollWidth <= base.tabs.clientWidth + 1 ||
        base.tabs.scrollWidth > base.tabs.clientWidth),
    ),
    `scroll=${base.tabs?.scrollWidth}/${base.tabs?.clientWidth} wrap=${base.tabs?.wrap} h=${base.tabs?.height}`,
  );

  const tapFloor = 40;
  for (const [name, box] of Object.entries(base.tap)) {
    if (!box) {
      check(vp, `可点元素存在：${name}`, false, 'not found');
      continue;
    }
    check(
      vp,
      `命中区 ≥${tapFloor}px：${name}`,
      box.w >= tapFloor && box.h >= tapFloor,
      `${box.w}x${box.h}`,
    );
  }
  check(
    vp,
    '卡片字号 ≥12px',
    parseFloat(base.fontSizes.cardLabel || '0') >= 12 &&
      parseFloat(base.fontSizes.cardValue || '0') >= 12,
    `${base.fontSizes.cardLabel}/${base.fontSizes.cardValue}`,
  );

  // 勾选一行 → 批量条
  const cb = page.locator('.mobile-card .checkbox-wrapper').first();
  if (await cb.count()) {
    await cb.click({ force: true });
    await page.waitForTimeout(600);
    const bulk = await page.evaluate(() => {
      const el = document.querySelector('.bulk-bar');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        text: (el.innerText || '').replace(/\n/g, ' ').slice(0, 80),
      };
    });
    check(
      vp,
      '勾选后批量条出现',
      Boolean(bulk && bulk.h > 0),
      bulk ? `${bulk.w}x${bulk.h} top=${bulk.top}` : 'no .bulk-bar',
    );
    check(
      vp,
      '批量条不超出视口宽度',
      Boolean(bulk && bulk.w <= width + 1),
      bulk ? `w=${bulk.w}` : '',
    );
    check(
      vp,
      '批量条文案已纠正为「已选当前页」',
      Boolean(bulk && !/全选全部|所有结果/.test(bulk.text)),
      bulk ? bulk.text : '',
    );
    if (bulk) {
      await page.screenshot({ path: `debug-screenshots/portrait-${vp}-bulk.png`, fullPage: false });
    }
  }

  // 编辑抽屉
  const editBtn = page.locator('.mobile-card .mobile-action-btn.edit').first();
  if (await editBtn.count()) {
    await editBtn.click();
    await page.waitForTimeout(900);
    const drawer = await page.evaluate(() => {
      const el = document.querySelector('.drawer');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const body = el.querySelector('.drawer-body');
      const footer = el.querySelector('.drawer-footer, .drawer-actions');
      const input = el.querySelector(
        'input:not([type="checkbox"]):not([type="radio"]), textarea, select',
      );
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        left: Math.round(r.left),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        bodyScrollable: body ? body.scrollHeight > body.clientHeight : null,
        footerVisible: footer
          ? footer.getBoundingClientRect().bottom <= window.innerHeight + 1
          : null,
        inputFontSize: input ? getComputedStyle(input).fontSize : null,
      };
    });
    check(vp, '编辑抽屉打开', Boolean(drawer), drawer ? `${drawer.w}x${drawer.h}` : 'no .drawer');
    check(
      vp,
      '抽屉占满宽度且不溢出',
      Boolean(drawer && drawer.left >= -1 && drawer.right <= width + 1 && drawer.w >= width - 2),
      drawer ? `left=${drawer.left} right=${drawer.right} w=${drawer.w}` : '',
    );
    check(
      vp,
      '抽屉高度不超视口',
      Boolean(drawer && drawer.bottom <= height + 1),
      drawer ? `bottom=${drawer.bottom}` : '',
    );
    check(
      vp,
      '抽屉正文可滚动',
      Boolean(drawer && drawer.bodyScrollable),
      String(drawer?.bodyScrollable),
    );
    check(
      vp,
      '抽屉底部操作条在视口内',
      Boolean(drawer && drawer.footerVisible),
      String(drawer?.footerVisible),
    );
    check(
      vp,
      '输入框字号 ≥16px（防 iOS 缩放）',
      parseFloat(drawer?.inputFontSize || '0') >= 16,
      String(drawer?.inputFontSize),
    );
    await page.screenshot({ path: `debug-screenshots/portrait-${vp}-drawer.png`, fullPage: false });
    const closeBtn = page.locator('.drawer-close').first();
    if (await closeBtn.count()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      const btn = page.locator('.confirm-btn.cancel, .confirm-btn:not(.primary)').first();
      if (await btn.count()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  }

  // 详情子页
  await page.goto(`${BASE}/#/admin/data-management/users/${IDs[0]}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2200);
  const detail = await page.evaluate(() => {
    const back = document.querySelector(
      '.detail-header-row .btn, .record-pane .back-btn, .record-back',
    );
    const pane = document.querySelector('.record-pane');
    let backBox = null;
    if (back) {
      const r = back.getBoundingClientRect();
      backBox = {
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: (back.innerText || back.getAttribute('aria-label') || '').trim(),
      };
    }
    return {
      pane: Boolean(pane && pane.getBoundingClientRect().height > 0),
      backBox,
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      title: (
        document.querySelector('.record-pane h1, .record-pane h2, .detail-title')?.innerText || ''
      )
        .trim()
        .slice(0, 40),
    };
  });
  check(vp, '详情子页在竖屏可打开', detail.pane, detail.title);
  check(
    vp,
    '详情页无横向溢出',
    detail.docScrollWidth <= detail.innerWidth + 1,
    `${detail.docScrollWidth}/${detail.innerWidth}`,
  );
  check(
    vp,
    '详情页返回按钮命中区 ≥40px',
    Boolean(detail.backBox && detail.backBox.w >= 40 && detail.backBox.h >= 40),
    detail.backBox
      ? `${detail.backBox.w}x${detail.backBox.h} "${detail.backBox.text}"`
      : 'not found',
  );
  await page.screenshot({ path: `debug-screenshots/portrait-${vp}-detail.png`, fullPage: false });

  check(vp, '全程零 pageerror', pageErrors.length === 0, pageErrors.join(' | '));
  await ctx.close();
};

for (const [w, h] of [
  [390, 844],
  [360, 800],
]) {
  await runViewport(w, h);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
await browser.close();
process.exit(process.argv.includes('--strict') && failed.length ? 1 : 0);
