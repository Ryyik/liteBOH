// 探针:消息中心列表视图 UX(2026-11-21 二期:日期分组 / 同帖点赞聚合 / 详情连续处理 / 左滑手势)
//
// 断言面:
//   A. 日期分组:今天/昨天/更早 组头出现且顺序正确
//   B. 同帖点赞聚合:3 赞 1 行、头像堆叠、独立赞不并、评论不聚、行内展开/收起、
//      成员行归属标记(连接线/缩进/错峰动画挂钩)、外置「未读」chip 过滤往返
//   C. 详情连续处理:上一条/下一条、边界禁用、J/K 键盘、归档 auto-advance
//   D. 左滑手势:拖拽吸附展开、按钮可用、纵向滚动复位、回弹吞点击、选择模式禁用
//   E. 虚拟滚动边界:>100 条退回原始流(无组头/无聚合)
//
// ⚠️ mock 必须有状态:PATCH(归档)/ mark_single_as_read RPC 翻转本地集合后,
//    notifications 列表 mock 返回翻转后的数据——生产语义是「落库后重拉一致」,
//    静态 mock 会在 triggerUnreadRefresh 的 120ms 重拉里把翻转盖回去(实测踩过)。
//    全部写请求显式 mock,探针不许触碰真实库(本地 dev 连着真项目)。
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const HEADFUL = process.env.HEADFUL === '1';
const OUT = 'debug-screenshots';

const mockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ryyik@bohrite.example.com',
  user_metadata: { username: '瑞一颗' },
  app_metadata: { provider: 'email' },
};

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 基础行集:3 条同帖赞(聚合)+ 独立赞 + 评论 + 关注 + 跨天系统消息 */
const baseRows = [
  {
    id: 'l1',
    type: 'like',
    status: 'unread',
    created_at: iso(30 * MIN),
    sender: '星野',
    postId: 'p1',
  },
  {
    id: 'l2',
    type: 'like',
    status: 'unread',
    created_at: iso(60 * MIN),
    sender: 'Mochi',
    postId: 'p1',
  },
  {
    id: 'l3',
    type: 'like',
    status: 'read',
    created_at: iso(90 * MIN),
    sender: '阿澈',
    postId: 'p1',
  },
  {
    id: 'c1',
    type: 'comment',
    status: 'unread',
    created_at: iso(2 * HOUR),
    sender: '小满',
    postId: 'p2',
  },
  {
    id: 'l4',
    type: 'like',
    status: 'read',
    created_at: iso(2.2 * HOUR),
    sender: '栗子',
    postId: 'p9',
  },
  {
    id: 'f1',
    type: 'follow',
    status: 'read',
    created_at: iso(1 * DAY + 2 * HOUR),
    sender: '阿澈',
    postId: null,
  },
  {
    id: 's1',
    type: 'system',
    status: 'read',
    created_at: iso(8 * DAY),
    sender: 'BOH 官方',
    postId: null,
  },
];

const toRow = (r) => ({
  id: r.id,
  type: r.type,
  status: r.status,
  created_at: r.created_at,
  sender_id: `u-${r.sender}`,
  archived_at: null,
  sender: { id: `u-${r.sender}`, username: r.sender, avatar_url: '' },
  post: r.postId
    ? {
        id: r.postId,
        title: `帖子 ${r.postId}`,
        body: null,
        content: '帖子正文内容,用于摘要与聚合文案',
      }
    : null,
  comment:
    r.type === 'comment'
      ? {
          id: `comment-${r.id}`,
          content: `来自 ${r.sender} 的评论内容，用于验证回复与原文卡。`,
          parent_id: null,
          author_username: r.sender,
        }
      : null,
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !HEADFUL,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const openMessages = async (
  viewport,
  { rows = baseRows, hasTouch = false, theme = 'light', paginate = false } = {},
) => {
  const archivedIds = new Set();
  const readIds = new Set(rows.filter((r) => r.status === 'read').map((r) => r.id));
  const viewRows = () =>
    rows
      .filter((r) => !archivedIds.has(r.id))
      .map(toRow)
      .map((r) => ({
        ...r,
        status: readIds.has(r.id) ? 'read' : r.status,
      }));

  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch });
  // catch-all 最先注册(逆序匹配 ⇒ 最后注册的优先)
  await context.route('**/rest/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await context.route('**/auth/v1/user', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }),
  );
  await context.route('**/rest/v1/notifications**', (r) => {
    // paginate=true:按 API 契约分页(limit + created_at=lt.<cursor>),配合哨兵自动
    // 加载把列表推过 100 条虚拟阈值;false:一次性给全量(API 层会按 limit 自行切片)。
    if (paginate) {
      const url = new URL(r.request().url());
      const limit = Number(url.searchParams.get('limit') || 25);
      const ltParam = url.searchParams.get('created_at') || '';
      const cursor = ltParam.startsWith('lt.') ? ltParam.slice(3) : null;
      let view = viewRows();
      if (cursor) view = view.filter((row) => row.created_at < cursor);
      const page_ = view.slice(0, limit + 1); // 多给 1 条 ⇒ API 层 hasMore=true
      return r.fulfill({
        status: 200,
        headers: { 'content-range': `0-${Math.max(0, page_.length - 1)}/*` },
        contentType: 'application/json',
        body: JSON.stringify(page_),
      });
    }
    const view = viewRows();
    return r.fulfill({
      status: 200,
      headers: { 'content-range': `0-${Math.max(0, view.length - 1)}/*` },
      contentType: 'application/json',
      body: JSON.stringify(view),
    });
  });
  await context.route(/\/rest\/v1\/notifications\?[^]*archived_at=not\.is\.null/, (r) =>
    r.fulfill({ status: 204, body: '' }),
  );
  // 归档 PATCH:notifications?id=eq.xxx(archiveNotification)→ 翻转本地归档集合
  // ⚠️ 用谓词不用正则:id 常是首个查询参数,其 "?" 会被 notifications\? 消耗,
  //    [?&]id=eq\. 这类正则对它先天不匹配(实测踩过);recipient_id 又会让裸
  //    id=eq\. 误匹配列表 GET。pathname + searchParams 判定最稳。
  await context.route(
    (url) => url.pathname.endsWith('/rest/v1/notifications') && url.searchParams.has('id'),
    (r) => {
      if (r.request().method() !== 'PATCH') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      const id = (new URL(r.request().url()).searchParams.get('id') || '').replace('eq.', '');
      if (id) archivedIds.add(id);
      return r.fulfill({ status: 204, body: '' });
    },
  );
  // 未读相关 RPC(最后注册 = 最先命中):翻转 readIds,不触碰真实库
  await context.route('**/rest/v1/rpc/mark_single_as_read', (r) => {
    const body = JSON.parse(r.request().postData() || '{}');
    if (body.notification_id) readIds.add(body.notification_id);
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await context.route('**/rest/v1/rpc/mark_all_as_read', (r) => {
    rows.forEach((r2) => readIds.add(r2.id));
    return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await context.route('**/rest/v1/rpc/get_unread_notification_count', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[{"count":0}]' }),
  );

  const page = await context.newPage();
  await page.addInitScript(
    ({ u, t }) => {
      localStorage.setItem('boh-theme', t);
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
    },
    { u: mockUser, t: theme },
  );
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const auth =
      document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) auth.userInfo.id = '00000000-0000-4000-8000-000000000001';
    window.location.hash = '#/user-space?tab=messages';
  });
  await page.waitForTimeout(2400);
  return { context, page, archivedIds, readIds };
};

const firePointer = (el, type, x, y) =>
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      clientX: x,
      clientY: y,
      buttons: type === 'pointerup' ? 0 : 1,
    }),
  );

// ── A/B. 分组 + 聚合(竖屏) ─────────────────────────────────────────────
{
  console.log('\n▶ A/B 日期分组 + 聚合(390×844)');
  const { context, page } = await openMessages({ width: 390, height: 844 });

  const groups = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('.x-date-group-header')];
    return headers.map((h) => h.dataset.group);
  });
  check('A1 · 「今天」组头出现', groups.includes('today'), groups.join(','));
  check('A2 · 「昨天」组头出现', groups.includes('yesterday'));
  check('A3 · 「更早」组头出现', groups.includes('earlier'));
  const sorted = [...groups].sort(
    (a, b) =>
      ['today', 'yesterday', 'week', 'earlier'].indexOf(a) -
      ['today', 'yesterday', 'week', 'earlier'].indexOf(b),
  );
  check(
    'A4 · 组头按时间顺序排列',
    JSON.stringify(groups) === JSON.stringify(sorted),
    groups.join(','),
  );

  const agg = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.x-aggregate-row')];
    return rows.map((r) => ({
      text: r.textContent.replace(/\s+/g, ''),
      stack: r.querySelectorAll('.x-stack-avatar').length,
    }));
  });
  check('B1 · 同帖 3 赞聚成 1 行', agg.length === 1, JSON.stringify(agg));
  check(
    'B2 · 文案含人数与帖子',
    agg[0]?.text.includes('3人') && agg[0]?.text.includes('赞了你的帖子'),
    agg[0]?.text,
  );
  check('B3 · 头像堆叠 3 枚', agg[0]?.stack === 3, `stack=${agg[0]?.stack}`);
  const plainLike = await page.evaluate(() => {
    const row = document.querySelector('.x-item[data-message-id="l4"]');
    return Boolean(row) && !row.classList.contains('x-aggregate-row');
  });
  check('B4 · 不同帖的赞保持普通行', plainLike);
  const c1Row = await page.evaluate(() =>
    Boolean(document.querySelector('.x-item[data-message-id="c1"]')),
  );
  check('B5 · 评论不被聚合(独立成行)', c1Row);

  // 展开 / 收起
  await page.locator('.x-aggregate-row').first().click();
  await page.waitForTimeout(400);
  const expanded = await page.evaluate(() => {
    const row = document.querySelector('.x-aggregate-row');
    const memberIds = ['l1', 'l2', 'l3'].filter((id) =>
      document.querySelector(`.x-item[data-message-id="${id}"]`),
    );
    return { isExpanded: row?.classList.contains('is-expanded'), memberIds };
  });
  check(
    'B6 · 点击展开:成员行全部可见',
    expanded.isExpanded && expanded.memberIds.length === 3,
    JSON.stringify(expanded),
  );
  // B6b 成员行归属标记(2026-11-21 二次改版):连接线/缩进/错峰动画的数据挂钩
  const memberMark = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.x-item-swipe-cell[data-agg-member]')];
    const expandedRow = document.querySelector('.x-aggregate-row.is-expanded');
    const last = cells.find((c) => c.classList.contains('is-agg-last'));
    return {
      count: cells.length,
      hasLast: Boolean(last),
      expandedRowTinted: expandedRow ? getComputedStyle(expandedRow).backgroundColor : null,
      indented: cells.length
        ? getComputedStyle(cells[0].querySelector('.x-item')).paddingLeft
        : null,
    };
  });
  check(
    'B6b · 成员行带归属标记/缩进/展开态聚合行强化',
    memberMark.count === 3 &&
      memberMark.hasLast &&
      parseFloat(memberMark.indented) >= 44 &&
      memberMark.expandedRowTinted !== 'rgba(0, 0, 0, 0)',
    JSON.stringify(memberMark),
  );
  await page.screenshot({ path: `${OUT}/msgs-list-agg-expanded.png` });
  await page.locator('.x-aggregate-row').first().click();
  await page.waitForTimeout(400);
  const collapsed = await page.evaluate(() => {
    const row = document.querySelector('.x-aggregate-row');
    const memberIds = ['l1', 'l2', 'l3'].filter((id) =>
      document.querySelector(`.x-item[data-message-id="${id}"]`),
    );
    return { isExpanded: row?.classList.contains('is-expanded'), memberIds };
  });
  check(
    'B7 · 再点收起:成员行隐藏',
    !collapsed.isExpanded && collapsed.memberIds.length === 0,
    JSON.stringify(collapsed),
  );

  // B8 外置「未读」chip(2026-11-21):未读筛选的唯一真源(取代选择模式内分段与下拉项)
  const unreadChip = page.locator('.x-unread-chip').first();
  const chipPresent = (await unreadChip.count()) > 0;
  check('B8 · 「未读」chip 常驻存在', chipPresent);
  if (chipPresent) {
    await unreadChip.click();
    await page.waitForTimeout(400);
    const unreadOnly = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.x-item[data-message-id]')];
      return {
        total: rows.length,
        allUnread: rows.every((r) => r.classList.contains('unread')),
      };
    });
    check(
      'B9 · 点 chip 后仅未读行可见',
      unreadOnly.total > 0 && unreadOnly.allUnread,
      JSON.stringify(unreadOnly),
    );
    await unreadChip.click();
    await page.waitForTimeout(400);
    const restored = await page.evaluate(
      () => document.querySelectorAll('.x-item[data-message-id]').length,
    );
    check('B10 · 再点 chip 恢复全量', restored === 4, `rows=${restored}`);
    await page.screenshot({ path: `${OUT}/msgs-list-unread-chip.png` });
  }
  await context.close();
}

// ── C. 详情连续处理(桌面 1280×800,挂载自动打开首条) ─────────────────────
{
  console.log('\n▶ C 详情连续处理(1280×800)');
  const { context, page } = await openMessages({ width: 1280, height: 800 });
  await page.waitForTimeout(600);

  const navState = async () =>
    page.evaluate(() => {
      const btns = [...document.querySelectorAll('.notif-action-btn.detail-nav')];
      const prev = btns.find((b) => b.textContent.includes('上一条'));
      const next = btns.find((b) => b.textContent.includes('下一条'));
      return {
        open: Boolean(document.querySelector('.x-detail-panel')),
        name: document.querySelector('.detail-user-card .name')?.textContent?.trim() || '',
        prevDisabled: prev?.disabled,
        nextDisabled: next?.disabled,
      };
    });

  const s0 = await navState();
  check('C1 · 首条详情自动打开', s0.open && s0.name === '星野', JSON.stringify(s0));
  check(
    'C2 · 第一条时「上一条」禁用、「下一条」可用',
    s0.prevDisabled === true && s0.nextDisabled === false,
  );

  await page.locator('.notif-action-btn.detail-nav', { hasText: '下一条' }).click();
  await page.waitForTimeout(500);
  const s1 = await navState();
  check('C3 · 「下一条」切到第二条(Mochi)', s1.name === 'Mochi', s1.name);
  const focusOnTitle = await page.evaluate(
    () => document.activeElement?.classList.contains('detail-title') === true,
  );
  check('C3b · 切换详情后焦点落到新标题', focusOnTitle);
  await page.keyboard.press('k');
  await page.waitForTimeout(400);
  const s2 = await navState();
  check('C4 · K 键回到上一条(星野)', s2.name === '星野', s2.name);
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  const s3 = await navState();
  check('C5 · J 键切到下一条(Mochi)', s3.name === 'Mochi', s3.name);

  await page.locator('.detail-more-trigger').focus();
  await page.keyboard.press('Tab');
  const focusTrapped = await page.evaluate(
    () => document.activeElement?.closest('.x-detail-panel') !== null,
  );
  check('C5b · 详情尾部 Tab 循环回抽屉内首个焦点', focusTrapped);

  // 归档 auto-advance:l2 详情点「更多 → 归档」→ 详情落到 l3(阿澈);聚合组少一人(Mochi 出组,阿澈入文案)
  await page.locator('.detail-more-trigger').click();
  await page.locator('[data-detail-action="archive"]').click();
  await page.waitForTimeout(900);
  const after = await navState();
  const aggText = await page.evaluate(() => {
    const row = document.querySelector('.x-aggregate-row');
    return row ? row.textContent.replace(/\s+/g, '') : '';
  });
  check(
    'C6 · 归档后 auto-advance 到下一条(详情仍开)',
    after.open && after.name === '阿澈',
    JSON.stringify(after),
  );
  check(
    'C7 · 聚合组成员更新(Mochi 出组、阿澈入文案)',
    aggText.includes('阿澈') && !aggText.includes('Mochi'),
    aggText,
  );
  await context.close();
}

// ── D. 左滑手势(触屏 390×844) ─────────────────────────────────────────
{
  console.log('\n▶ D 左滑手势(390×844 触屏)');
  const { context, page } = await openMessages({ width: 390, height: 844 }, { hasTouch: true });

  const cellInfo = (id) =>
    page.evaluate((msgId) => {
      const cell = document.querySelector(`.x-item-swipe-cell[data-swipe-id="${msgId}"]`);
      const row = cell?.querySelector('.x-item');
      const actions = cell?.querySelector('.x-swipe-actions');
      return {
        cellFound: Boolean(cell),
        open: cell?.classList.contains('is-swipe-open'),
        transform: row?.style.transform || '',
        actionsOpacity: actions ? Number(actions.style.opacity || 0) : null,
        unread: row?.classList.contains('unread'),
      };
    }, id);

  // D1 拖拽吸附展开(对未读的评论行 c1)
  const c1Row = page.locator('.x-item[data-message-id="c1"]');
  const box = await c1Row.boundingBox();
  await page.evaluate((id) => {
    const row = document.querySelector(`.x-item[data-message-id="${id}"]`);
    const fire = (type, x, y) =>
      row.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      );
    fire('pointerdown', 340, 100);
    for (let i = 1; i <= 10; i++) fire('pointermove', 340 - i * 10, 100);
    fire('pointerup', 240, 100);
  }, 'c1');
  await page.waitForTimeout(400);
  const d1 = await cellInfo('c1');
  check(
    'D1 · 左滑过阈值吸附展开',
    d1.open === true && d1.transform.includes('-148') && d1.actionsOpacity === 1,
    JSON.stringify(d1),
  );
  await page.screenshot({ path: `${OUT}/msgs-swipe-open.png` });

  // D2 展开层「已读」可点 → 行翻已读、层收起
  await page.locator('.x-item-swipe-cell[data-swipe-id="c1"] .x-swipe-btn.read').click();
  await page.waitForTimeout(600);
  const d2 = await cellInfo('c1');
  check(
    'D2 · 滑层「已读」生效且层收起',
    d2.unread === false && !d2.transform.includes('-'),
    JSON.stringify(d2),
  );

  // D3 纵向拖动被斜率判定拦下,pointercancel 复位
  await page.evaluate((id) => {
    const row = document.querySelector(`.x-item[data-message-id="${id}"]`);
    const fire = (type, x, y) =>
      row.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 9,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          buttons: type === 'pointercancel' ? 0 : 1,
        }),
      );
    fire('pointerdown', 300, 200);
    fire('pointermove', 296, 230);
    fire('pointermove', 294, 280);
    fire('pointercancel', 294, 300);
  }, 'l4');
  await page.waitForTimeout(300);
  const d3 = await cellInfo('l4');
  check(
    'D3 · 纵向滚动接管后无残留展开',
    !d3.open && !d3.transform.includes('-'),
    JSON.stringify(d3),
  );

  // D4 滑动回弹后点击被吞(suppressClick)
  await page.evaluate((id) => {
    const row = document.querySelector(`.x-item[data-message-id="${id}"]`);
    const fire = (type, x, y) =>
      row.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 11,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      );
    fire('pointerdown', 320, 120);
    fire('pointermove', 290, 120);
    fire('pointermove', 316, 120);
    fire('pointerup', 320, 120);
    setTimeout(() => row.click(), 60);
  }, 'l4');
  await page.waitForTimeout(700);
  const d4 = await page.evaluate(() => ({
    detail: Boolean(document.querySelector('.x-detail-panel')),
  }));
  check('D4 · 回弹手势吞掉后续点击(详情不开)', d4.detail === false, JSON.stringify(d4));

  // D5 选择模式下滑动禁用
  await page.locator('.x-mark-all-btn-minimal', { hasText: '选择' }).first().click();
  await page.waitForTimeout(400);
  await page.evaluate((id) => {
    const row = document.querySelector(`.x-item[data-message-id="${id}"]`);
    const fire = (type, x, y) =>
      row.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 13,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      );
    fire('pointerdown', 340, 140);
    for (let i = 1; i <= 6; i++) fire('pointermove', 340 - i * 10, 140);
    fire('pointerup', 280, 140);
  }, 'f1');
  await page.waitForTimeout(300);
  const d5 = await cellInfo('f1');
  check('D5 · 选择模式下滑动禁用', !d5.open && !d5.transform.includes('-'), JSON.stringify(d5));
  await context.close();
}

// ── E. 虚拟滚动边界(101 条退回原始流) ──────────────────────────────────
{
  console.log('\n▶ E 虚拟滚动边界(101 条)');
  const manyRows = Array.from({ length: 101 }).map((_, i) => ({
    id: `m${i}`,
    type: i % 5 === 0 ? 'like' : 'comment',
    status: 'read',
    created_at: iso(i * 5 * MIN),
    sender: ['星野', 'Mochi', '阿澈', '小满', '栗子'][i % 5],
    postId: `mp${i % 7}`, // 同帖赞存在,但 >100 必须不聚合
  }));
  const { context, page } = await openMessages(
    { width: 390, height: 844 },
    { rows: manyRows, paginate: true },
  );
  // 哨兵自动加载链:滚到底触发 load-more(哨兵在视口外不会自触发),等虚拟容器出现
  let virtualOn = false;
  for (let i = 0; i < 24 && !virtualOn; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(450);
    virtualOn = await page.evaluate(() =>
      Boolean(document.querySelector('.x-virtual-list-container')),
    );
  }
  const e1 = await page.evaluate(() => ({
    headers: document.querySelectorAll('.x-date-group-header').length,
    aggregates: document.querySelectorAll('.x-aggregate-row').length,
    rows: document.querySelectorAll('.x-item[data-message-id]').length,
    virtualOn: Boolean(document.querySelector('.x-virtual-list-container')),
  }));
  check(
    'E1 · >100 条退回原始流(无组头/无聚合)',
    e1.headers === 0 && e1.aggregates === 0,
    JSON.stringify(e1),
  );
  // 如实锁定「伪虚拟」契约:.x-virtual-list-container 查无高度 CSS,useVirtualList
  // 实际全量渲染——组头/聚合被挡在阈值外是唯一防线。若未来改成真窗口渲染,
  // 请同步把本断言改为窗口尺寸并复测 E1。
  check('E2 · 虚拟分支全量渲染(伪虚拟契约)', e1.rows === manyRows.length, `rows=${e1.rows}`);
  await context.close();
}

// ── F. 详情操作分级 / 原帖卡 / 竖屏头部 / Esc 草稿保护(390×844) ──────────
{
  console.log('\n▶ F 详情优化(390×844)');
  const { context, page } = await openMessages({ width: 390, height: 844 }, { hasTouch: true });
  await page.locator('.x-item[data-message-id="c1"]').click();
  await page.waitForTimeout(600);

  const detailInfo = await page.evaluate(() => {
    const panel = document.querySelector('.x-detail-panel');
    const avatar = panel?.querySelector('.large-avatar-img, .large-avatar');
    const actions = [...(panel?.querySelectorAll('.notification-actions .notif-action-btn') || [])];
    const source = panel?.querySelector('.source-content');
    return {
      open: Boolean(panel),
      avatarW: avatar?.getBoundingClientRect().width || 0,
      timeVisible: Boolean(panel?.querySelector('.detail-time')?.offsetParent),
      actions: actions.map((button) => button.textContent.replace(/\s+/g, '').trim()),
      moreInBar: actions.some((button) => button.classList.contains('detail-more-trigger')),
      archiveInBar: actions.some((button) => button.textContent.includes('归档')),
      sourceTag: source?.tagName,
      sourceClickable: source?.classList.contains('is-clickable'),
      sourceHasTitle: Boolean(panel?.querySelector('.source-title')),
      sourceHasLink: Boolean(panel?.querySelector('.source-link')),
      navInHeader: Boolean(panel?.querySelector('.detail-header-nav .detail-nav-next')),
      titleFocused: document.activeElement?.classList.contains('detail-title'),
    };
  });
  check(
    'F1 · 竖屏详情打开且标题获得焦点',
    detailInfo.open && detailInfo.titleFocused,
    JSON.stringify(detailInfo),
  );
  check(
    'F2 · 身份头部紧凑：头像 44px、相对时间可见',
    detailInfo.avatarW === 44 && detailInfo.timeVisible,
    JSON.stringify(detailInfo),
  );
  check(
    'F3 · 主操作只保留回复/查看原文/更多，归档不占底栏',
    detailInfo.actions.includes('回复') &&
      detailInfo.actions.includes('查看原文') &&
      detailInfo.moreInBar &&
      !detailInfo.archiveInBar,
    JSON.stringify(detailInfo.actions),
  );
  check('F4 · 上一条/下一条移到详情头部', detailInfo.navInHeader);
  check(
    'F5 · 原帖摘要卡是按钮且带标题/查看原文',
    detailInfo.sourceTag === 'BUTTON' &&
      detailInfo.sourceClickable &&
      detailInfo.sourceHasTitle &&
      detailInfo.sourceHasLink,
    JSON.stringify(detailInfo),
  );

  await page.locator('.source-content.is-clickable').click();
  await page.waitForTimeout(600);
  const sourceHash = await page.evaluate(() => location.hash);
  check(
    'F6 · 点击原帖卡进入对应帖子并带评论锚点',
    sourceHash.includes('/forum/post/p2') && sourceHash.includes('comment=comment-c1'),
    sourceHash,
  );

  await page.evaluate(() => {
    location.hash = '#/user-space?tab=messages';
  });
  await page.waitForTimeout(1400);
  await page.locator('.x-item[data-message-id="c1"]').click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const closedWithoutDraft = await page.evaluate(() => !document.querySelector('.x-detail-panel'));
  check('F7 · 空草稿按 Esc 直接关闭详情', closedWithoutDraft);

  await page.locator('.x-item[data-message-id="c1"]').click();
  await page.waitForTimeout(500);
  await page.locator('.notification-actions .reply').click();
  await page.locator('.reply-textarea').fill('这是一条不应被误关的草稿');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const guarded = await page.evaluate(() => ({
    panel: Boolean(document.querySelector('.x-detail-panel')),
    confirm: Boolean(document.querySelector('.confirm-modal-overlay')),
    draft: document.querySelector('.reply-textarea')?.value || '',
  }));
  check(
    'F8 · 有草稿按 Esc 先确认，详情与草稿都保留',
    guarded.panel && guarded.confirm && guarded.draft.includes('不应被误关'),
    JSON.stringify(guarded),
  );
  await page.locator('.confirm-btn.cancel').click();
  await page.waitForTimeout(300);
  const keptAfterCancel = await page.evaluate(
    () =>
      Boolean(document.querySelector('.x-detail-panel')) &&
      (document.querySelector('.reply-textarea')?.value || '').includes('不应被误关'),
  );
  check('F9 · 取消放弃后继续留在详情与草稿', keptAfterCancel);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('.confirm-btn.primary').click();
  await page.waitForTimeout(500);
  const closedAfterConfirm = await page.evaluate(() => !document.querySelector('.x-detail-panel'));
  check('F10 · 确认放弃后关闭详情并清空草稿', closedAfterConfirm);
  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  · ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  process.exitCode = 1;
}
