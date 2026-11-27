import { chromium } from 'playwright';

/* 探针：搜索体验（plans/052 之后的全屏搜索页）
 *
 * ── 2026-11-26 重写背景 ────────────────────────────────────────────
 * 搜索从「论坛工具栏内联输入框」升级为独立全屏页 `/search`（views/Search/SearchPage.vue）：
 *   · 首屏顶部只剩一枚入口图标（已并进 SegmentTabs 行右侧）
 *   · 搜索框 / 分类 chips（帖子·博莱克·资讯·成员·周边·活动）/ 最近搜索都在搜索页内
 * 所以本探针的断言面整体从 `.toolbar-search-input` 换到 `.search-input` + `.search-chip`。
 *
 * ── 覆盖 ───────────────────────────────────────────────────────────
 *  A 入口：论坛页有搜索图标 → 点击进入 /search；旧的内联输入框**必须不存在**
 *  B 搜索页结构：搜索框 / 分类 chips（6 枚，含「成员」）/ 空态引导 / 悬浮玻璃
 *  C 输入 → 检索 → 结果卡（帖子 chip）；清空回到引导态
 *  D 分类切换：chips 各自活跃态；「成员」chip 接完整成员页（.community-page-grid）
 *  E 最近搜索：显式提交才写入 / 空输入聚焦展开 / 点 chip 回填
 *  F 横屏三栏错位（用户构思图 16:36）
 *
 * ⚠️ 网络全程 mock：搜索结果的**正确性**（中文子串命中、相关度排序）在 SQL 层验证，
 *    不在本探针内 —— 这里只验证「搜索相关的 UI 行为」与前端交互链。
 * ⚠️ 同一 path 只注册一条 route（Playwright 按注册逆序匹配 → catch-all 先注册）。
 */
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
let pass = 0;
let fail = 0;
const results = [];

const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const MOCK_ROW = {
  id: '00000000-0000-0000-0000-0000000000a1',
  content: '这是一个用于探针的测试帖子，内容里包含关键词',
  title: '探针测试帖',
  body: '这是一个用于探针的测试帖子，内容里包含关键词',
  tag: 'daily',
  author_id: '00000000-0000-0000-0000-0000000000b1',
  author_username: 'probe_search_user',
  author_avatar_url: '',
  author_avatar_frame_url: null,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
  status: 'approved',
  comment_count: 0,
  like_count: 0,
  is_liked: false,
  image_count: 0,
  cover_image_url: '',
  images: [],
  replies: [],
  replies_has_more: false,
  hot_score: 0,
  search_rank: 1.4,
  search_excerpt: '…包含[[关键词]]的片段…',
  has_more: false,
};

const MOCK_PROFILE = {
  id: '00000000-0000-0000-0000-0000000000b1',
  username: 'probe_search_user',
  avatar_url: '',
  bio: '探针用成员简介',
  tags: [],
};

/** 打开搜索页；所有读请求 mock 成给定结果集 */
const openSearch = async ({ rows = [MOCK_ROW], profiles = [MOCK_PROFILE] } = {}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

  /* ⚠️ 注册顺序 = 匹配优先级（playwright 按**最后注册优先**匹配）：
     先注册两条 catch-all，再注册具体路径 —— 具体路径后注册才会赢。
     反过来写的后果：catch-all 把 list_forum_posts 一起吃掉，返回 []，
     结果列表恒空（2026-11-26 实测踩过，C1/F1 假红）。 */
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  // 成员通道（searchProfiles 走 profiles.ilike）
  await page.route('**/rest/v1/profiles**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profiles) }),
  );
  // 帖子直连降级路径
  await page.route('**/rest/v1/posts**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
      headers: {
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
      },
    }),
  );
  // 帖子 RPC（搜索主路径）
  await page.route('**/rest/v1/rpc/list_forum_posts**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }),
  );

  return { context, page, errors };
};

const readHistory = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('boh-forum-search-history') || '[]');
    } catch {
      return null;
    }
  });

try {
  // ════════ A 入口：论坛页 → 搜索页 ════════
  {
    const { context, page, errors } = await openSearch();
    await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    /* ⚠️ 2026-11-26 21:45 用户线框图口径（**最终版**，本条覆盖前两轮）：
         首屏「tab 区」最右一颗放大镜 → 点它进**新的全屏搜索页**；
         搜索框只存在于那个整页里，页内不再有值得常驻的搜索条。
       所以本组断言的唯一事实是「入口唯一 + 点了确实进整页 + 整页有分类」。
       ⚠️ 这三条曾经两次翻向（18:08 要求页内搜索、更早要求页签行有图标）——
          现在方向已由线框图钉死。要再改先改这条注释并说明新依据，
          不要只改断言（那样下一次谁也看不出哪版才是用户要的）。 */
    console.log('\n--- A 整页搜索入口（竖屏首屏）---');
    // 竖屏：页签行右侧必须有那唯一一颗入口
    const entry = page.locator('.section-search');
    check(
      'A1 页签行右侧有整页搜索入口（唯一颗放大镜）',
      (await entry.count()) === 1,
      `count=${await entry.count()}`,
    );

    // 竖屏：页内那条搜索条**不该**再渲染（否则同屏两个搜索入口）
    check(
      'A2 竖屏页内不再有冗余搜索条',
      (await page.locator('.toolbar-search-input').count()) === 0,
      `count=${await page.locator('.toolbar-search-input').count()}`,
    );

    if ((await entry.count()) === 1) {
      await entry.first().click();
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => {
        const pageEl = document.querySelector('.search-page');
        const navEl = document.querySelector('.search-nav');
        const pageStyle = pageEl ? getComputedStyle(pageEl) : null;
        const navStyle = navEl ? getComputedStyle(navEl) : null;
        return {
          hash: location.hash,
          chips: [...document.querySelectorAll('.search-chip')].map((e) => e.textContent.trim()),
          hasInput: Boolean(document.querySelector('.search-input')),
          pageAnim: pageStyle?.animationName || '',
          pageDuration: pageStyle?.animationDuration || '',
          navAnim: navStyle?.animationName || '',
        };
      });
      check('A3 点入口后进入整页搜索', after.hash.startsWith('#/search'), after.hash);
      check(
        'A4 整页里带分类 chips（搜索结果可分类）',
        after.chips.length >= 5,
        JSON.stringify(after.chips),
      );
      check('A5 整页里有搜索输入框（进来才能搜）', after.hasInput === true);
      check(
        'A6 竖屏搜索页有慢速入场动画',
        /searchPagePortraitIn/.test(after.pageAnim) && after.pageDuration === '0.5s',
        `${after.pageAnim} / ${after.pageDuration}`,
      );
      check('A7 搜索栏接力动画已接线', /searchNavPortraitIn/.test(after.navAnim), after.navAnim);
    }
    check('A8 全程无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ════════ B 搜索页结构 ════════
  {
    const { context, page, errors } = await openSearch();
    await page.goto(`${BASE}/#/search`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.search-input', { timeout: 25000 });
    await page.waitForTimeout(600);

    console.log('\n--- B 结构 ---');
    check('B1 搜索输入框存在', (await page.locator('.search-input').count()) === 1);

    const chips = await page.locator('.search-chip').allTextContents();
    check('B2 分类 chips 共 6 枚', chips.length === 6, JSON.stringify(chips));
    check(
      'B3 chips 含「成员」',
      chips.some((c) => c.trim() === '成员'),
      JSON.stringify(chips),
    );
    check('B4 空输入时有引导态', (await page.locator('.search-placeholder').count()) === 1);

    // 悬浮玻璃：搜索栏本身透明无边框（玻璃由内部胶囊承担）
    const navStyle = await page.evaluate(() => {
      const nav = document.querySelector('.search-nav');
      if (!nav) return null;
      const cs = getComputedStyle(nav);
      return { bg: cs.backgroundColor, border: cs.borderBottomWidth };
    });
    check(
      'B5 搜索栏无矩形背景（玻璃浮在页面上）',
      Boolean(navStyle) && navStyle.bg === 'rgba(0, 0, 0, 0)',
      JSON.stringify(navStyle),
    );
    check('B6 无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ════════ C 输入 → 检索 → 结果 ════════
  {
    const { context, page, errors } = await openSearch();
    await page.goto(`${BASE}/#/search`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.search-input', { timeout: 25000 });
    await page.waitForTimeout(400);

    console.log('\n--- C 检索 ---');
    await page.fill('.search-input', '关键词');
    await page.waitForTimeout(2500);
    const cardCount = await page.locator('.search-result-card').count();
    check('C1 帖子 chip 有结果卡', cardCount >= 1, `count=${cardCount}`);
    if (cardCount >= 1) {
      const cardText = await page.locator('.search-result-card').first().innerText();
      check('C2 结果卡含命中内容', cardText.includes('探针测试帖'), cardText.slice(0, 40));
    }

    await page.fill('.search-input', '');
    await page.waitForTimeout(700);
    check(
      'C3 清空后回到引导态',
      (await page.locator('.search-placeholder').count()) === 1 &&
        (await page.locator('.search-result-card').count()) === 0,
    );
    check('C4 无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ════════ D 分类切换 + 成员完整页 ════════
  {
    const { context, page, errors } = await openSearch();
    await page.goto(`${BASE}/#/search?q=probe`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.search-chip', { timeout: 25000 });
    await page.waitForTimeout(2500);

    console.log('\n--- D 分类切换 ---');
    const activeOf = () =>
      page.evaluate(() => {
        const el = [...document.querySelectorAll('.search-chip')].find((c) =>
          c.classList.contains('is-active'),
        );
        return el?.textContent?.trim() || '';
      });
    check('D1 默认活跃 chip 是「帖子」', (await activeOf()) === '帖子', await activeOf());

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.search-chip')].find(
        (c) => c.textContent.trim() === '成员',
      );
      btn?.click();
    });
    await page.waitForTimeout(5000);
    check('D2 切到「成员」后活跃态翻转', (await activeOf()) === '成员', await activeOf());
    const communityCount = await page.locator('.community-page-grid, .community-pulse').count();
    check(
      'D3 成员 chip 接入完整成员页（社区概览）',
      communityCount >= 1,
      `count=${communityCount}`,
    );
    const titleCount = await page.locator('.search-section-title').count();
    check('D4 有关键词时先给匹配小节', titleCount >= 1, `titles=${titleCount}`);
    check('D5 无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ════════ E 最近搜索 ════════
  {
    const { context, page, errors } = await openSearch();
    await page.goto(`${BASE}/#/search`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.search-input', { timeout: 25000 });
    await page.waitForTimeout(500);

    console.log('\n--- E 最近搜索 ---');
    const h0 = await readHistory(page);
    check('E1 未提交过时历史为空', !h0 || h0.length === 0, JSON.stringify(h0));

    await page.fill('.search-input', '树洞');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const h1 = await readHistory(page);
    check('E2 显式提交后写入历史', Array.isArray(h1) && h1[0] === '树洞', JSON.stringify(h1));

    await page.fill('.search-input', '开学');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const h2 = await readHistory(page);
    check(
      'E3 最近的排最前且去重',
      Array.isArray(h2) && h2[0] === '开学' && h2[1] === '树洞',
      JSON.stringify(h2),
    );

    await page.fill('.search-input', '');
    await page.click('.search-input');
    await page.waitForTimeout(600);
    const panelCount = await page.locator('.search-history-panel').count();
    check('E4 空输入聚焦时展开最近搜索', panelCount === 1, `count=${panelCount}`);
    if (panelCount === 1) {
      const histChips = await page.locator('.search-history-chip').allTextContents();
      check('E5 chip 文案是最近词', histChips[0] === '开学', JSON.stringify(histChips));
      await page.locator('.search-history-chip').first().click();
      await page.waitForTimeout(1500);
      check(
        'E6 点 chip 回填输入框',
        (await page.inputValue('.search-input')) === '开学',
        await page.inputValue('.search-input'),
      );
    }
    check('E7 无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ════════ F 横屏三栏错位 ════════
  {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...MOCK_ROW,
      id: `00000000-0000-0000-0000-0000000000${String(i).padStart(2, '0')}`,
      title: `探针测试帖 ${i + 1}`,
      content: `第 ${i + 1} 条用于多列布局验证的内容`.repeat((i % 3) + 1),
    }));
    const { context, page, errors } = await openSearch({ rows: many });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/#/search?q=探针`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    console.log('\n--- F 横屏三栏 ---');
    const layout = await page.evaluate(() => {
      const list = document.querySelector('.search-result-list');
      const cards = [...document.querySelectorAll('.search-result-card')];
      const xs = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().x)))].sort(
        (a, b) => a - b,
      );
      return {
        cols: list ? getComputedStyle(list).columnCount : null,
        distinctX: xs.length,
        cardCount: cards.length,
      };
    });
    check('F1 横屏结果流为 3 列', layout.cols === '3', `cols=${layout.cols}`);
    check(
      'F2 卡片实际分布在多列（≥2 列有卡）',
      layout.distinctX >= 2,
      `distinctX=${layout.distinctX} cards=${layout.cardCount}`,
    );
    check('F3 无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `${OUT}/probe-search-landscape.png` });
    await context.close();
  }
} catch (error) {
  check('Z9 探针未抛异常', false, String(error?.message || error).slice(0, 200));
} finally {
  await browser.close();

  console.log('\n' + results.join('\n'));
  console.log(`\n===== probe-forum-search: ${pass}/${pass + fail} PASS =====`);
  if (fail > 0) console.log(`❗ ${fail} 项失败`);
  process.exit(fail > 0 ? 1 : 0);
}
