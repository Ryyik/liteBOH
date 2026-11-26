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
 *   9. 详情分段（plans/050）：用户 5 段 / 订单 4 段、行高 ≥44px
 *  10. 就地操作：积分扣除走差异确认、礼品状态四档、地址一键复制（都不是浮层）
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

// plans/050 期 1 详情分段的 mock 记录（礼品详情）
const GIFT_ID = '11111111-1111-4111-8111-111111111111';
const gift = {
  id: GIFT_ID,
  user_id: IDs[0],
  username: 'user_1',
  gift_scope_label: 'BOH Bag',
  gift_content: 'E2E 礼物',
  gift_status: 'preparing',
  gift_no: 'SF1234567890',
  gift_price: 199,
  gift_points: 500,
  shipping_recipient: '测试收件人',
  shipping_phone: '13800000000',
  shipping_address: '上海市测试路 1 号',
  created_at: '2026-11-01T10:00:00.000Z',
  completed_at: null,
  is_active: true,
};

const results = [];
const check = (viewport, name, pass, detail = '') => {
  results.push({ viewport, name, pass: Boolean(pass), detail: String(detail).slice(0, 160) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${viewport}] ${name}${detail ? `  -- ${detail}` : ''}`);
};

/** 等某条 toast 出现（toast 是队列制，直接读 .boh-toast__msg 会读到上一条） */
// 保存走既有管线：有差异时会先弹「保存前差异预览」，确认后才落库
const confirmSaveIfAsked = async (page) => {
  const btn = page.locator('.confirm-btn.primary');
  if (await btn.count()) {
    await btn
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
  }
};

const waitToast = async (page, needle, timeout = 5000) => {
  try {
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('.boh-toast__msg')].some((node) =>
          (node.innerText || '').includes(text),
        ),
      needle,
      { timeout },
    );
    return needle;
  } catch {
    return '';
  }
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
      // 订阅层级批量/单发：返回真实形状，便于断言「Pro」而不是 mock 兜底
      if (url.includes('get_user_subscription_tiers')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(users.map((u) => ({ user_id: u.id, tier: 'pro' }))),
        });
      }
      if (url.includes('get_user_subscription_tier')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify('pro'),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, users: 12, forum: 137, lotteries: 3 }),
      });
    }
    // 写操作（保存）：PATCH 必须回「1 行」的表示，否则 saveData 判成「没有记录被更新」
    if (route.request().method() === 'PATCH') {
      if (url.includes('/user_gifts')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'content-range': '0-0/1',
            'access-control-allow-origin': '*',
            'access-control-expose-headers': 'content-range',
          },
          body: JSON.stringify([gift]),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': '0-0/1',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
        body: JSON.stringify([users[0]]),
      });
    }
    // 礼品详情（plans/050）：单条取数/更新返回对象，列表返回数组
    if (url.includes('/user_gifts')) {
      const giftAccept = route.request().headers().accept || '';
      if (giftAccept.includes('vnd.pgrst.object') || url.includes('id=eq.')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/vnd.pgrst.object+json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(gift),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': '0-0/1',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
        body: JSON.stringify([gift]),
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
  await page.route('**/functions/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('admin-issue-login-token')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ ok: true, token: 'tok_e2e_1a2b3c', username: 'user_1' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":false}',
    });
  });
};

const runViewport = async (width, height) => {
  const vp = `${width}x${height}`;
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
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

  // plans/050 §6：用户列表改成草图式紧凑行（不是大卡片）
  await page.waitForSelector('.mobile-row', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const compact = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.mobile-row')];
    return {
      count: rows.length,
      firstText: (rows[0]?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      hasCheckbox: Boolean(document.querySelector('.mobile-row .checkbox-wrapper')),
      hasRowButtons: Boolean(
        document.querySelector('.mobile-row .review-btn, .mobile-row .mobile-action-btn'),
      ),
      tableVisible: Boolean(
        document.querySelector('.g-table-sheet') &&
        document.querySelector('.g-table-sheet').getBoundingClientRect().height > 0,
      ),
    };
  });
  check(
    vp,
    '用户列表为紧凑行（常规态无勾选 / 无行内按钮）',
    compact.count > 0 && !compact.hasCheckbox && !compact.hasRowButtons && !compact.tableVisible,
    `rows=${compact.count} checkbox=${compact.hasCheckbox} buttons=${compact.hasRowButtons}`,
  );
  check(
    vp,
    '用户行显示「订阅层级 · 积分」',
    /Pro/.test(compact.firstText) && /积分/.test(compact.firstText),
    compact.firstText,
  );
  await page.screenshot({ path: `debug-screenshots/portrait-${vp}-list.png`, fullPage: false });

  // 「选择」模式才出现勾选，选两行出批量条
  await page.locator('.select-mode-toggle').click();
  await page.waitForTimeout(300);
  const selectModeBoxes = await page.locator('.mobile-row .checkbox-wrapper').count();
  check(vp, '「选择」模式才出现勾选', selectModeBoxes > 0, `checkboxes=${selectModeBoxes}`);
  await page.locator('.mobile-row').nth(0).click();
  await page.locator('.mobile-row').nth(1).click();
  await page.waitForTimeout(400);
  const bulkText = await page.evaluate(() =>
    (document.querySelector('.bulk-bar')?.innerText || '').replace(/\s+/g, ' ').trim(),
  );
  check(vp, '选择模式可批量选行', bulkText.includes('已选 2'), bulkText.slice(0, 60));
  await page.locator('.select-mode-toggle').click();
  await page.waitForTimeout(300);

  // 点整行 → 详情全屏页（草图：点进去进入一个详情全屏页）
  await page.locator('.mobile-row').first().click();
  await page.waitForTimeout(1200);
  const rowTap = await page.evaluate(() => ({
    url: location.hash,
    hasDetail: Boolean(document.querySelector('.detail-sections')),
  }));
  check(vp, '点整行进入详情全屏页', rowTap.url.includes('/users/') && rowTap.hasDetail, rowTap.url);

  // 其余通用卡片断言放到未改形态的页签（forum）上跑，避免两套口径混在一起
  await page.goto(`${BASE}/#/admin/data-management?section=data&tab=subscriptions`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('.mobile-card', { timeout: 30000 });
  await page.waitForTimeout(1500);

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
        createBtn: tap('.toolbar-actions .btn-primary'),
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
  /* 模块横向 chips 条已退场（plans/048 期 1，2026-11-25）：54 个页签被
     8 组设置页式行列表取代，`.g-module-tabs` 连同「更多 ▾」浮层一起删除。
     所以这条断言只能改口径，不能保留 —— 它此前一直假红/假绿：
       · 选择器已不存在 ⇒ base.tabs 为 null ⇒ 恒 FAIL（假红，掩盖真问题）
       · 即使存在，`a <= b || a > b` 是恒真式（假绿，什么都测不出来）
     现在的口径：**页签入口不该再以横向 chips 的形式出现**。
     竖屏下它们由整页目录承担（AdminNavPages），内容区不应再有那条横滑带。 */
  check(
    vp,
    '内容区不再有横向模块 chips 条（已由整页目录取代）',
    !base.tabs,
    base.tabs ? `仍在渲染：h=${base.tabs.height}` : 'absent（符合预期）',
  );

  const tapFloor = 40;
  /* createBtn 的存在性取决于两件事，都不能靠「找不到就是 bug」判定：
       · 当前角色是否有该表的 create 权限（探针用的是 admin，但表级策略可能仍禁）
       · 当前是否处于有数据的状态（空态时按钮在空态卡里）
     所以它单独处理：找到了就验命中区，找不到只记一条「未出现」而不判 FAIL。
     其余元素（checkbox / editBtn / rowMenu / pagination）是列表必有件，缺了就是真 bug。 */
  const OPTIONAL_TAP = new Set(['createBtn']);
  for (const [name, box] of Object.entries(base.tap)) {
    if (!box) {
      if (OPTIONAL_TAP.has(name)) {
        console.log(
          `  · [${vp}] 可点元素未出现（可选）：${name} —— 当前表可能无新增权限或处于空态`,
        );
        continue;
      }
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
      '.detail-header-row .btn, .detail-back-plain, .record-pane .back-btn, .record-back',
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

  // ── plans/050 期 1：详情分身段 ──
  const userSections = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.detail-section')];
    const rows = [...document.querySelectorAll('.detail-section-row')];
    return {
      count: nodes.length,
      titles: nodes.map((n) => n.querySelector('.detail-section-title')?.innerText?.trim() || ''),
      minRowHeight: Math.min(...rows.map((n) => Math.round(n.getBoundingClientRect().height))),
      actionTexts: [...document.querySelectorAll('.detail-section-row.is-action')].map((n) =>
        (n.innerText || '').replace(/\s+/g, ' ').trim(),
      ),
    };
  });
  check(
    vp,
    '用户详情按草图：主字段平铺 + 操作段（2 段）',
    userSections.count === 2 && userSections.titles[0] === '',
    `count=${userSections.count} | ${userSections.titles.join(' / ')}`,
  );
  check(
    vp,
    '详情分段行高 ≥44px',
    userSections.minRowHeight >= 44,
    `min=${userSections.minRowHeight}`,
  );
  check(
    vp,
    '资产段有可点行（积分 + 订阅层级）',
    userSections.actionTexts.some((t) => t.includes('积分')) &&
      userSections.actionTexts.some((t) => t.includes('订阅层级')),
    userSections.actionTexts.join(' | '),
  );
  check(
    vp,
    '订阅层级显示为可读档位（Pro，不是 [object Object]）',
    userSections.actionTexts.some((t) => t.includes('订阅层级') && t.includes('Pro')),
    userSections.actionTexts.join(' | '),
  );
  check(
    vp,
    '「操作」段含封禁 / 禁言入口（从列表行搬来）',
    userSections.actionTexts.some((t) => t.includes('封禁状态')) &&
      userSections.actionTexts.some((t) => t.includes('禁言状态')),
    userSections.actionTexts.join(' | '),
  );

  // ── 期 5：详情页本身即编辑器（草图：无「编辑」态、底部一个「保存」） ──
  const inline = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.detail-section-row .detail-inline-input')];
    const first = inputs[0] || null;
    const row = first ? first.closest('.detail-section-row') : null;
    const label = row ? row.querySelector('.detail-row-label') : null;
    const ir = first ? first.getBoundingClientRect() : null;
    const lr = label ? label.getBoundingClientRect() : null;
    const bar = document.querySelector('.detail-action-bar.is-plain');
    const saveBtn = [...(bar?.querySelectorAll('button') || [])].find(
      (b) => b.textContent.trim() === '保存',
    );
    const editBtn = [...document.querySelectorAll('.record-pane button')].some(
      (b) => b.textContent.trim() === '编辑',
    );
    return {
      inputs: inputs.length,
      label: (label?.innerText || '').trim(),
      sameRow: Boolean(
        ir && lr && Math.abs(ir.top + ir.height / 2 - (lr.top + lr.height / 2)) < 18,
      ),
      labelLeft: Boolean(ir && lr && lr.right <= ir.left + 1),
      underline: first ? getComputedStyle(first).borderBottomWidth : '',
      saveDisabled: saveBtn ? saveBtn.disabled : null,
      hasEditBtn: editBtn,
    };
  });
  check(
    vp,
    '详情页即编辑器（有行内输入、没有「编辑」按钮、有「保存」）',
    inline.inputs > 0 && inline.hasEditBtn === false && inline.saveDisabled === true,
    JSON.stringify(inline),
  );
  check(
    vp,
    '行内输入与标签同行（标签在左、输入右对齐、下划线）',
    inline.sameRow && inline.labelLeft && inline.underline !== '0px',
    `sameRow=${inline.sameRow} labelLeft=${inline.labelLeft} border=${inline.underline}`,
  );
  await page.screenshot({
    path: `debug-screenshots/portrait-${vp}-edit-plain.png`,
    fullPage: false,
  });

  // 改一个值 → 「保存」才可用 → 点保存走既有管线
  const usernameInput = page.locator('.detail-section-row .detail-inline-input').first();
  await usernameInput.fill('user_1_renamed');
  await page.waitForTimeout(300);
  const saveEnabled = await page.evaluate(() => {
    const bar = document.querySelector('.detail-action-bar.is-plain');
    const btn = [...(bar?.querySelectorAll('button') || [])].find(
      (b) => b.textContent.trim() === '保存',
    );
    return Boolean(btn && !btn.disabled);
  });
  check(vp, '有未保存修改时「保存」可用', saveEnabled);
  await page.locator('.detail-action-bar.is-plain button', { hasText: '保存' }).click();
  await confirmSaveIfAsked(page);
  const saveToast = await waitToast(page, '数据更新成功');
  check(vp, '详情页保存成功提示', Boolean(saveToast), saveToast || '（无 toast）');
  await page.waitForTimeout(800);

  // 一次性登录令牌（草图：发放一次性令牌）—— 复用既有签发链路：
  // 确认 → 原因必填（写审计）→ EF 签发 → token 直接进剪贴板（不渲染到页面）
  await page.locator('.detail-section-row.is-action', { hasText: '发放一次性令牌' }).click();
  await page.waitForSelector('.confirm-btn.primary', { timeout: 5000 });
  const issueConfirm = await page.evaluate(() =>
    (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
  );
  check(
    vp,
    '发放令牌先弹安全确认（等同账号密码）',
    issueConfirm.includes('签发一次性登录令牌') && issueConfirm.includes('等同账号密码'),
    issueConfirm.slice(0, 80),
  );
  await page.locator('.confirm-btn.primary').click();
  await page.waitForSelector('.confirm-input', { timeout: 5000 });
  await page.locator('.confirm-input').fill('E2E：当面核实身份');
  await page.locator('.confirm-btn.primary').click();
  const tokenToast = await waitToast(page, '令牌已复制到剪贴板');
  check(
    vp,
    '令牌签发后直接进剪贴板（不渲染到页面）',
    Boolean(tokenToast),
    tokenToast || '（无 toast）',
  );

  // ── plans/050 期 3：积分就地扣除（差异确认 → RPC） ──
  await page.locator('.detail-section-row.is-action', { hasText: '积分' }).first().click();
  await page.waitForSelector('.detail-pop-card', { timeout: 5000 });
  const pointsPanel = await page.evaluate(() => {
    const card = document.querySelector('.detail-pop-card');
    const anchor = card?.parentElement;
    const rect = card ? card.getBoundingClientRect() : null;
    return {
      position: anchor ? getComputedStyle(anchor).position : '',
      hasBackdrop: Boolean(document.querySelector('.detail-pop-backdrop')),
      width: rect ? Math.round(rect.width) : 0,
      inViewport: Boolean(rect && rect.top >= 0 && rect.bottom <= window.innerHeight + 1),
    };
  });
  check(
    vp,
    '积分是浮层（透明遮罩 + 锚定卡片，且在视口内）',
    pointsPanel.position === 'fixed' && pointsPanel.hasBackdrop && pointsPanel.inViewport,
    `${pointsPanel.position} backdrop=${pointsPanel.hasBackdrop} w=${pointsPanel.width}`,
  );
  await page.locator('.detail-pop-card input[type="number"]').fill('30');
  await page.locator('.detail-pop-card .detail-pop-modes button', { hasText: '扣除' }).click();
  await page.locator('.detail-pop-card .detail-pop-primary').click();
  await page.waitForSelector('.confirm-btn.primary', { timeout: 5000 });
  const confirmSnapshot = await page.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/g, ' '),
    primary: document.querySelector('.confirm-btn.primary')?.innerText?.trim() || '',
  }));
  check(
    vp,
    '扣除前弹出差异确认（100 → 70）',
    confirmSnapshot.text.includes('确认扣除') && confirmSnapshot.text.includes('100 → 70'),
    confirmSnapshot.primary,
  );
  await page.locator('.confirm-btn.primary').click();
  const pointsToast = await waitToast(page, '积分已更新');
  check(vp, '积分扣除成功提示', Boolean(pointsToast), pointsToast || '（无 toast）');

  // ── plans/050 期 1/3：礼品详情（4 段 + 复制地址 + 状态四档） ──
  await page.goto(`${BASE}/#/admin/data-management/gifts/${GIFT_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('.detail-sections', { timeout: 30000 });
  await page.waitForTimeout(900);
  const giftSections = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.detail-section')];
    return {
      count: nodes.length,
      titles: nodes.map((n) => n.querySelector('.detail-section-title')?.innerText?.trim() || ''),
      actionTexts: [...document.querySelectorAll('.detail-section-row.is-action')].map((n) =>
        (n.innerText || '').replace(/\s+/g, ' ').trim(),
      ),
    };
  });
  check(
    vp,
    '订单详情按草图：主字段平铺（1 段，无操作段）',
    giftSections.count === 1 && giftSections.titles[0] === '',
    `count=${giftSections.count} | ${giftSections.titles.join(' / ')}`,
  );
  const giftRowLabels = await page.evaluate(() =>
    [...document.querySelectorAll('.detail-row-label')].map((n) => n.innerText.trim()),
  );
  check(
    vp,
    '订单详情行 = 用户名 / 下单日期 / 礼物内容 / 地址 / 状态',
    ['用户名', '下单日期', '礼物内容', '地址', '状态'].every((t) => giftRowLabels.includes(t)),
    giftRowLabels.join(' / '),
  );
  const chipStyle = await page.evaluate(() => {
    const chip = document.querySelector('.detail-row-text.is-chip');
    if (!chip) return null;
    const cs = getComputedStyle(chip);
    return { radius: cs.borderRadius, bg: cs.backgroundColor, text: chip.innerText.trim() };
  });
  check(
    vp,
    '状态是胶囊 chip（不是一段裸文字）',
    Boolean(chipStyle && parseFloat(chipStyle.radius) >= 10 && chipStyle.bg !== 'rgba(0, 0, 0, 0)'),
    JSON.stringify(chipStyle),
  );
  const giftTitle = await page.evaluate(() =>
    (document.querySelector('.detail-title')?.innerText || '').replace(/\s+/g, ' ').trim(),
  );
  check(
    vp,
    '订单详情标题 = 用户名 + 礼物内容',
    giftTitle.includes('user_1') && giftTitle.includes('E2E 礼物'),
    giftTitle,
  );
  const addressRow = page.locator('.detail-section-row', { hasText: '地址' }).first();
  const addressCopyHint = await addressRow.evaluate((n) => (n.innerText || '').includes('复制'));
  check(vp, '地址行带一键复制提示', addressCopyHint);
  await addressRow.click();
  const copyToast = await waitToast(page, '收件信息已复制');
  check(vp, '地址一键复制', Boolean(copyToast), copyToast || '（无 toast）');

  await page.locator('.detail-section-row.is-action', { hasText: '状态' }).first().click();
  await page.waitForSelector('.detail-pop-card .detail-pop-option', { timeout: 5000 });
  const statusOptionCount = await page.locator('.detail-pop-card .detail-pop-option').count();
  check(
    vp,
    '状态浮层四档（取消/准备中/已发货/已完成）',
    statusOptionCount === 4,
    `${statusOptionCount} 档`,
  );
  await page.locator('.detail-pop-card .detail-pop-option', { hasText: '已发货' }).click();
  await page.waitForTimeout(400);
  const chipAfterPick = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.detail-section-row')].find((n) =>
      (n.innerText || '').includes('状态'),
    );
    return (row?.innerText || '').replace(/\s+/g, ' ').trim();
  });
  check(
    vp,
    '点选状态后先暂存（chip 变「已发货」）',
    chipAfterPick.includes('已发货'),
    chipAfterPick,
  );
  await page.locator('.detail-action-bar.is-plain button', { hasText: '保存' }).click();
  await confirmSaveIfAsked(page);
  const statusToast = await waitToast(page, '数据更新成功');
  check(vp, '状态随「保存」落库', Boolean(statusToast), statusToast || '（无 toast）');
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `debug-screenshots/portrait-${vp}-gift-detail.png`,
    fullPage: false,
  });

  // 礼品列表也是紧凑行：内容 + 进度 tag
  await page.goto(`${BASE}/#/admin/data-management?section=data&tab=gifts`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForSelector('.mobile-row', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const giftRowText = await page.evaluate(() => {
    const row = document.querySelector('.mobile-row');
    return (row?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  });
  const giftTagCount = await page.locator('.mobile-row-tag').count();
  check(
    vp,
    '礼品行显示「内容 + 进度 tag」',
    /E2E 礼物/.test(giftRowText) && /准备中/.test(giftRowText) && giftTagCount > 0,
    `${giftRowText} | tags=${giftTagCount}`,
  );
  await page.screenshot({
    path: `debug-screenshots/portrait-${vp}-gift-list.png`,
    fullPage: false,
  });

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
