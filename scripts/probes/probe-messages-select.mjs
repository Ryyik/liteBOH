// 探针：消息中心「选择模式」横竖屏适配（plans/028）
//
// 断言面（每档视口跑一遍：进入选择 → 勾选一条 → Esc 退出）：
//   A. 退出入口：`.x-select-cancel` 存在、可见、elementFromPoint 命中（防「加了 class 但被压住」）
//   B. 动作条在视口内（底边 ≤ vh、宽度 ≤ vw），且与底栏不相交
//   C. ≥1024：选择模式下详情面板必须收起（detail-open 与选择模式互斥）
//   D. Esc 退出：动作条消失、选中数归零、body 标记移除；≥1024 详情恢复
//   E. 0 选中时「已读」禁用（旧实现在 0 选中时偷偷执行「全部已读」）
//   F. 手机横屏 844×390：完全可见行数 ≥3（改动前是 2）
//   G. 横屏选择模式下底栏让位（opacity 0 / pointer-events none）
//   H–J. 长按 / 桌面右键进选择模式、已归档分区批量入口
//   K. 手机横屏详情（2026-11-21）：返回钮可见可点、动作条 static 不压正文
//   L. 页头常驻「全部已读」（2026-11-21 二次改版）：常驻可见、0 未读置灰、下拉不含该项
//   M. 批量动作后保持选择模式（2026-11-21 批量减按钮：选择清空、模式不退）
//   N. 桌面 shift-click 范围多选（1→3 共 3 条）
//   另：选择模式内「全部|未读」分段已删（未读筛选唯一真源 = 外置未读 chip），计数并入全选 chip
//
// 为什么这些断言值钱：旧实现在 ≥1024 下 A/B 全红（底部条被 v-if 与 CSS 双杀、页头动作永久
// display:none），而手机横屏 B 红（条浮到屏高 61% 处压住列表并与底栏相交）。
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const HEADFUL = process.env.HEADFUL === '1';

const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ryyik@bohrite.example.com',
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email' },
  user_metadata: { username: '瑞一颗' },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: new Date().toISOString(),
};

const now = Date.now();
const rows = Array.from({ length: 8 }).map((_, i) => ({
  id: `n${i + 1}`,
  type: ['like', 'comment', 'follow', 'impression'][i % 4],
  status: i < 3 ? 'unread' : 'read',
  created_at: new Date(now - (i + 1) * 47 * 60000).toISOString(),
  sender_id: `u${i}`,
  archived_at: null,
  sender: { id: `u${i}`, username: ['星野', 'Mochi', '阿澈', '小满'][i % 4], avatar_url: '' },
  post: { id: `p${i}`, title: null, body: null, content: 'Beta6 的液态玻璃导航真的绝了' },
  comment: null,
}));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !HEADFUL,
  args: ['--no-proxy-server'],
});

/** 已归档分区的 mock 行（getArchivedNotifications 走 `archived_at=not.is.null`） */
const archivedRows = rows.slice(0, 4).map((row) => ({
  ...row,
  archived_at: new Date().toISOString(),
  status: 'read',
}));

const openMessages = async (viewport, { hasTouch = false } = {}) => {
  // L/M 场景用：mark_all_as_read RPC 发出后列表 mock 返回已读行;归档 PATCH 后该行
  // 从 mock 集合剔除 —— 生产语义是「落库 → 重拉 → 服务端与本地一致」,mock 必须模拟
  // 服务端真值,否则重拉会把本地翻转盖回去（2026-11-21 实测踩过）。
  let markAllFired = false;
  const archivedIds = new Set();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch });
  await context.route('**/auth/v1/user', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }),
  );
  await context.route('**/rest/v1/notifications**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        rows
          .filter((row) => !archivedIds.has(row.id))
          .map((row) => (markAllFired ? { ...row, status: 'read' } : row)),
      ),
    }),
  );
  // 归档 PATCH:notifications?id=eq.xxx(archiveNotification)→ 翻转本地归档集合。
  // 用谓词不用正则:recipient_id 会与裸 id=eq. 混淆(实测踩过,详见 probe-messages-list-ux)。
  await context.route(
    (url) => url.pathname.endsWith('/rest/v1/notifications') && url.searchParams.has('id'),
    (r) => {
      if (r.request().method() !== 'PATCH') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      const id = (new URL(r.request().url()).searchParams.get('id') || '').replace('eq.', '');
      if (id.startsWith('n')) archivedIds.add(id);
      return r.fulfill({ status: 204, body: '' });
    },
  );
  // 未读相关 RPC 显式 mock（最后注册 = 逆序最先命中）：mark-all 流程 / 刷新未读计数
  // 都不许探针触碰真实库（本地 dev 也连着真项目）。
  await context.route('**/rest/v1/rpc/mark_all_as_read', (r) => {
    markAllFired = true;
    r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await context.route('**/rest/v1/rpc/get_unread_notification_count', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { count: markAllFired ? 0 : rows.filter((row) => row.status === 'unread').length },
      ]),
    }),
  );
  await context.route(/\/rest\/v1\/notifications\?[^]*archived_at=not\.is\.null/, (r) =>
    r.fulfill({
      status: 200,
      headers: { 'content-range': `0-${archivedRows.length - 1}/*` },
      contentType: 'application/json',
      body: JSON.stringify(archivedRows),
    }),
  );
  const page = await context.newPage();
  await page.addInitScript((u) => {
    localStorage.setItem('boh-theme', 'light');
    localStorage.setItem(
      'sb-nplnlefdwfgtyimfkyih-auth-token',
      JSON.stringify({
        access_token: 'mock-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'mock-refresh-token',
        user: u,
      }),
    );
  }, mockUser);
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__;
    const auth = app.config.globalProperties.$pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) {
      auth.userInfo.id = '00000000-0000-4000-8000-000000000001';
      auth.userInfo.username = '瑞一颗';
    }
    window.location.hash = '#/user-space?tab=messages';
  });
  await page.waitForTimeout(2600);
  return { context, page };
};

/** 视口档案：isLandscape 决定底栏是否应让位；wide 决定详情面板是否分栏 */
const CASES = [
  { name: '竖屏 390×844', vp: { width: 390, height: 844 }, landscape: false, wide: false },
  { name: '手机横屏 844×390', vp: { width: 844, height: 390 }, landscape: true, wide: false },
  { name: '手机横屏 740×360', vp: { width: 740, height: 360 }, landscape: true, wide: false },
  { name: '平板横屏 1024×600', vp: { width: 1024, height: 600 }, landscape: false, wide: true },
  { name: '桌面 1280×800', vp: { width: 1280, height: 800 }, landscape: false, wide: true },
];

for (const c of CASES) {
  console.log(`\n▶ ${c.name}`);
  const { context, page } = await openMessages(c.vp);

  // ⚠️ 按文本锁「选择」：2026-11-21 起页头还有「全部已读」也挂 .x-mark-all-btn-minimal，
  //    .first() 会点错（实测全读后 selected=0 连环假红）
  const selectBtn = page.locator('.x-mark-all-btn-minimal', { hasText: '选择' }).first();
  check(`${c.name} · 页头有「选择」入口`, (await selectBtn.count()) > 0);
  await selectBtn.click();
  await page.waitForTimeout(500);

  // A. 退出入口存在且真的能点到
  const cancel = page.locator('.x-select-cancel').first();
  const cancelCount = await cancel.count();
  check(`${c.name} · 取消按钮存在`, cancelCount > 0);
  if (cancelCount > 0) {
    const hit = await page.evaluate(() => {
      const el = document.querySelector('.x-select-cancel');
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        visible: getComputedStyle(el).visibility !== 'hidden' && r.width > 0 && r.height > 0,
        hit: top === el || el.contains(top),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      };
    });
    check(`${c.name} · 取消按钮可见`, hit.visible, JSON.stringify(hit.rect));
    check(`${c.name} · 取消按钮未被遮挡`, hit.hit, JSON.stringify(hit.rect));
  }

  // B. 动作条几何
  const geo = await page.evaluate(() => {
    const bar = document.querySelector('.x-select-action-bar');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav-glass');
    const navCs = nav ? getComputedStyle(nav) : null;
    const items = [...document.querySelectorAll('.x-item')].filter((el) => {
      const ir = el.getBoundingClientRect();
      return ir.top >= 0 && ir.bottom <= innerHeight + 0.5;
    }).length;
    return {
      vp: [innerWidth, innerHeight],
      bar: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      barInViewport: r.bottom <= innerHeight + 0.5 && r.top >= 0 && r.width <= innerWidth + 1,
      nav: nav
        ? [
            Math.round(nav.getBoundingClientRect().top),
            Math.round(nav.getBoundingClientRect().height),
          ]
        : null,
      navYielding: navCs ? navCs.opacity === '0' || navCs.pointerEvents === 'none' : true,
      rowsFullyVisible: items,
      readDisabled: document.querySelector('.x-select-action-bar .x-sab-btn:last-of-type')
        ?.disabled,
      countText: (document.querySelector('.x-select-count')?.textContent?.trim() || '').replace(
        /\s+/g,
        ' ',
      ),
      detailOpen: Boolean(document.querySelector('.x-detail-panel')),
    };
  });
  check(`${c.name} · 动作条存在`, Boolean(geo), '选择模式下 .x-select-action-bar 不在 DOM');
  if (geo) {
    check(`${c.name} · 动作条在视口内`, geo.barInViewport, JSON.stringify(geo.bar));
    if (c.landscape) {
      check(`${c.name} · 底栏让位给贴底条`, geo.navYielding, `nav=${JSON.stringify(geo.nav)}`);
    } else if (geo.nav && !c.wide) {
      // 竖屏：条在底栏上方，两者不得相交
      const overlap = geo.bar[1] + geo.bar[3] - geo.nav[0];
      check(`${c.name} · 动作条不压底栏`, overlap <= 2, `overlap=${overlap}px`);
    }
    // C. 详情与选择互斥（≥1024 旧实现里详情永远开着，把动作面按成 0）
    if (c.wide) {
      check(`${c.name} · 选择模式收起详情`, !geo.detailOpen);
    }
    // E. 0 选中时「已读」禁用;计数徽标并入全选 chip,0 选中时不渲染
    check(`${c.name} · 0 选中时「已读」禁用`, geo.readDisabled === true);
    check(`${c.name} · 计数徽标初始隐藏`, geo.countText === '', geo.countText);
    // F. 横屏可见行数
    if (c.landscape) {
      check(`${c.name} · 完全可见行数 ≥3`, geo.rowsFullyVisible >= 3, `${geo.rowsFullyVisible} 行`);
    }
  }

  // 勾选一条：动作可用、计数更新
  await page.locator('.x-item').first().click();
  await page.waitForTimeout(350);
  const afterPick = await page.evaluate(() => ({
    selected: document.querySelectorAll('.x-item.selected').length,
    readDisabled: document.querySelector('.x-select-action-bar .x-sab-btn:last-of-type')?.disabled,
    countText: document.querySelector('.x-select-count')?.textContent?.trim() || '',
    detailOpen: Boolean(document.querySelector('.x-detail-panel')),
  }));
  check(`${c.name} · 点行进入勾选`, afterPick.selected === 1, `selected=${afterPick.selected}`);
  check(`${c.name} · 勾选后「已读」可用`, afterPick.readDisabled === false);
  check(`${c.name} · 计数徽标显示已选 1 条`, afterPick.countText === '· 1', afterPick.countText);
  if (c.wide) check(`${c.name} · 勾选时详情仍收起`, !afterPick.detailOpen);

  // D. Esc 退出
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  const afterEsc = await page.evaluate(() => ({
    bar: Boolean(document.querySelector('.x-select-action-bar')),
    selected: document.querySelectorAll('.x-item.selected').length,
    bodyFlag: document.body.classList.contains('boh-messages-selecting'),
    detailOpen: Boolean(document.querySelector('.x-detail-panel')),
    navOpacity: (() => {
      const nav = document.querySelector('.bottom-nav-glass');
      return nav ? getComputedStyle(nav).opacity : null;
    })(),
    navCls: document.querySelector('.bottom-nav-glass')?.className || '',
  }));
  check(`${c.name} · Esc 收起动作条`, !afterEsc.bar);
  check(`${c.name} · Esc 清空选择`, afterEsc.selected === 0, `selected=${afterEsc.selected}`);
  check(`${c.name} · Esc 摘掉 body 标记`, !afterEsc.bodyFlag);
  if (c.wide) check(`${c.name} · Esc 后详情恢复`, afterEsc.detailOpen);
  if (c.landscape) {
    // 底栏还有一套「滚动方向自动收起」，与选择模式无关 ——
    // 只要不是被我们的规则藏住即可：要么 opacity 回到 1，要么带的是
    // is-hidden（键盘态）/ is-collapsed（滚动收起，2026-11-14 起的新契约）。
    const navBack =
      afterEsc.navOpacity === '1' ||
      afterEsc.navCls.includes('is-hidden') ||
      afterEsc.navCls.includes('is-collapsed');
    check(
      `${c.name} · 底栏不再被选择模式藏住`,
      navBack,
      `opacity=${afterEsc.navOpacity} cls=${afterEsc.navCls}`,
    );
  }

  await context.close();
}

// ── 补充场景：长按 / 右键 / 已归档分区 ──────────────────────────────────────
{
  console.log('\n▶ 补充场景');

  // H. 长按 450ms 进选择模式（触屏，省掉「先点选择再点行」两步）
  const { context, page } = await openMessages({ width: 390, height: 844 }, { hasTouch: true });
  await page.locator('.x-item').first().dispatchEvent('pointerdown', {
    pointerType: 'touch',
    isPrimary: true,
    pointerId: 1,
  });
  await page.waitForTimeout(700);
  const afterLongPress = await page.evaluate(() => ({
    bar: Boolean(document.querySelector('.x-select-action-bar')),
    checked: document.querySelectorAll('.x-item.selected').length,
    count: document.querySelector('.x-select-count')?.textContent?.trim() || '',
  }));
  check('长按进选择模式', afterLongPress.bar);
  check('长按同时勾中该条', afterLongPress.checked === 1, `checked=${afterLongPress.checked}`);
  check('长按后计数徽标显示已选 1 条', afterLongPress.count === '· 1', afterLongPress.count);
  await context.close();

  // I. 桌面右键进选择模式（不弹浏览器菜单、不误开详情）
  const desktop = await openMessages({ width: 1280, height: 800 });
  await desktop.page.locator('.x-item').nth(2).click({ button: 'right' });
  await desktop.page.waitForTimeout(500);
  const afterRightClick = await desktop.page.evaluate(() => ({
    bar: Boolean(document.querySelector('.x-select-action-bar')),
    checked: document.querySelectorAll('.x-item.selected').length,
    detail: Boolean(document.querySelector('.x-detail-panel')),
  }));
  check('桌面右键进选择模式', afterRightClick.bar);
  check('右键勾中该条', afterRightClick.checked === 1, `checked=${afterRightClick.checked}`);
  check('右键不误开详情', !afterRightClick.detail);
  await desktop.context.close();

  // J. 已归档分区：批量入口换成「取消归档」，且 0 选中时「已读」仍禁用
  const archived = await openMessages({ width: 1280, height: 800 });
  await archived.page.locator('.x-filter-chip.filter-trigger').first().click();
  await archived.page.waitForTimeout(300);
  const archivedOption = archived.page.locator('.x-filter-option', { hasText: '已归档' }).first();
  if ((await archivedOption.count()) > 0) {
    await archivedOption.click();
    await archived.page.waitForTimeout(1200);
  }
  await archived.page.locator('.x-mark-all-btn-minimal', { hasText: '选择' }).first().click();
  await archived.page.waitForTimeout(400);
  const archivedState = await archived.page.evaluate(() => ({
    labels: [...document.querySelectorAll('.x-sab-btn')].map((b) => b.textContent.trim()),
    readDisabled: document.querySelector('.x-select-action-bar .x-sab-btn:last-of-type')?.disabled,
  }));
  check(
    '已归档分区入口为「取消归档」',
    archivedState.labels.some((t) => t.startsWith('取消归档')),
    archivedState.labels.join('|'),
  );
  check('已归档分区 0 选中时「已读」禁用', archivedState.readDisabled === true);
  await archived.context.close();

  // K. 手机横屏详情（2026-11-21）：返回钮可见可点、动作条静态化不压正文。
  //    旧实现：.x-detail-back 在 601–1023 被 display:none（只能点面板外的暗化遮罩关闭，
  //    不可发现）；.notification-actions 基础样式 sticky，~390 高的抽屉里正文从半透明
  //    动作条底下穿过（actionsOverlapSrc 实测 true）。≤767 竖屏有 static 重置，横屏漏了。
  const landscapeDetail = await openMessages({ width: 844, height: 390 });
  // 点第 6 条（read + comment：详情有 source-content，且点开不触发标记已读写路径）
  await landscapeDetail.page.locator('.x-item').nth(5).click();
  await landscapeDetail.page.waitForTimeout(600);
  const detailGeo = await landscapeDetail.page.evaluate(() => {
    const back = document.querySelector('.x-detail-back');
    const actions = document.querySelector('.notification-actions');
    const src = document.querySelector('.source-content');
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    const backHit = (() => {
      if (!back) return false;
      const b = back.getBoundingClientRect();
      const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return top === back || back.contains(top);
    })();
    const overlap =
      actions && src
        ? !(
            actions.getBoundingClientRect().bottom <= src.getBoundingClientRect().top ||
            src.getBoundingClientRect().bottom <= actions.getBoundingClientRect().top
          )
        : false;
    return {
      backVisible: back
        ? getComputedStyle(back).display !== 'none' && back.getBoundingClientRect().width > 0
        : false,
      backHit,
      actionsStatic: actions ? getComputedStyle(actions).position === 'static' : false,
      actionsOverlapSrc: overlap,
      hasSource: Boolean(src),
      backRect: back ? rect(back) : null,
    };
  });
  check('横屏详情 · 返回钮可见', detailGeo.backVisible, JSON.stringify(detailGeo.backRect));
  check('横屏详情 · 返回钮未被遮挡', detailGeo.backHit, JSON.stringify(detailGeo.backRect));
  check('横屏详情 · 动作条随内容流（static）', detailGeo.actionsStatic);
  check(
    '横屏详情 · 动作条不压正文',
    detailGeo.hasSource && !detailGeo.actionsOverlapSrc,
    `hasSource=${detailGeo.hasSource} overlap=${detailGeo.actionsOverlapSrc}`,
  );
  await landscapeDetail.page.locator('.x-detail-back').click();
  await landscapeDetail.page.waitForTimeout(500);
  const detailClosed = await landscapeDetail.page.evaluate(
    () => !document.querySelector('.x-detail-panel'),
  );
  check('横屏详情 · 点返回钮关闭详情', detailClosed);
  await landscapeDetail.context.close();

  // L. 页头常驻「全部已读」（2026-11-21 二次改版）：**不再按未读数隐藏**——0 未读置灰,
  //    入口永远可见（用户反馈「看不到」的根因就是 0 未读整颗消失）;启用判定走
  //    serverUnreadCount（服务端真源）;下拉里不再有该项（用户口径：放页头不放筛选）。
  const markAll = await openMessages({ width: 390, height: 844 });
  await markAll.page.waitForTimeout(300);
  const markAllBtn = markAll.page
    .locator('.x-header-actions-minimal .x-mark-all-btn-minimal', { hasText: '全部已读' })
    .first();
  const markAllPresent = (await markAllBtn.count()) > 0;
  check(
    '页头「全部已读」常驻存在（mock 未读 3 时可用）',
    markAllPresent && (await markAllBtn.isEnabled()),
  );
  if (markAllPresent) {
    await markAll.page.locator('.x-filter-chip.filter-trigger').first().click();
    await markAll.page.waitForTimeout(300);
    const inDropdown = await markAll.page.evaluate(() => {
      const dd = document.querySelector('.x-filter-dropdown');
      return Boolean(dd && dd.textContent.includes('全部已读'));
    });
    check('筛选下拉不含「全部已读」', !inDropdown);
    await markAll.page.locator('.x-filter-chip.filter-trigger').first().click();
    await markAll.page.waitForTimeout(300);
    await markAllBtn.click();
    await markAll.page.waitForTimeout(900);
    const afterMarkAll = await markAll.page.evaluate(() => {
      const btn = [...document.querySelectorAll('.x-header-actions-minimal button')].find((b) =>
        b.textContent.includes('全部已读'),
      );
      return {
        unreadRows: document.querySelectorAll('.x-item.unread').length,
        btnPresent: Boolean(btn),
        btnDisabled: btn?.disabled,
      };
    });
    check(
      '全部已读 · 未读行清零',
      afterMarkAll.unreadRows === 0,
      `unread=${afterMarkAll.unreadRows}`,
    );
    check(
      '全部已读 · 清零后仍常驻但置灰',
      afterMarkAll.btnPresent === true && afterMarkAll.btnDisabled === true,
      JSON.stringify(afterMarkAll),
    );
  }
  await markAll.context.close();
}

// ── 补充场景三(2026-11-21 二次改版):批量减按钮 / 动作后保持模式 / shift-click ──
{
  console.log('\n▶ 补充场景三');

  // M. 批量动作后保持选择模式:勾 1 条归档 → 模式不退、选择清零(旧实现整模式退出)
  const keepMode = await openMessages({ width: 390, height: 844 });
  await keepMode.page.locator('.x-mark-all-btn-minimal', { hasText: '选择' }).first().click();
  await keepMode.page.waitForTimeout(400);
  await keepMode.page.locator('.x-item').first().click();
  await keepMode.page.waitForTimeout(300);
  await keepMode.page.locator('.x-select-action-bar .x-sab-btn', { hasText: '归档' }).click();
  await keepMode.page.waitForTimeout(900);
  const afterArchive = await keepMode.page.evaluate(() => ({
    bar: Boolean(document.querySelector('.x-select-action-bar')),
    selected: document.querySelectorAll('.x-item.selected').length,
    cancelVisible: (() => {
      const c = document.querySelector('.x-select-cancel');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })(),
  }));
  check(
    'M1 · 批量归档后选择模式保持(动作条仍在)',
    afterArchive.bar && afterArchive.selected === 0 && afterArchive.cancelVisible,
    JSON.stringify(afterArchive),
  );
  await keepMode.context.close();

  // N. 桌面 shift-click 范围多选:点第 1 条 → shift 点第 3 条 ⇒ 3 条入选
  const shiftSel = await openMessages({ width: 1280, height: 800 });
  await shiftSel.page.locator('.x-mark-all-btn-minimal', { hasText: '选择' }).first().click();
  await shiftSel.page.waitForTimeout(400);
  await shiftSel.page.locator('.x-item').first().click();
  await shiftSel.page.waitForTimeout(200);
  await shiftSel.page
    .locator('.x-item')
    .nth(2)
    .click({ modifiers: ['Shift'] });
  await shiftSel.page.waitForTimeout(300);
  const afterShift = await shiftSel.page.evaluate(() => ({
    selected: document.querySelectorAll('.x-item.selected').length,
  }));
  check(
    'N1 · shift-click 范围多选(1→3 共 3 条)',
    afterShift.selected === 3,
    JSON.stringify(afterShift),
  );
  await shiftSel.context.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  · ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exitCode = 1;
}
