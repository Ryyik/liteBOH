import { chromium } from 'playwright';

/* 探针：论坛搜索体验增强（2026-09-27）
   覆盖：
     1. 清除按钮（有内容才出现 / 点击后清空并消失）
     2. ⌘K / Ctrl+K 聚焦搜索框
     3. 最近搜索（显式提交才写入 / 聚焦空输入时展开 / 点回填 / 清除）
     4. 结果计数（只在该出现的时候出现）
     5. 无结果引导（问 BOHAI + 清除搜索）
   ⚠️ 网络全程 mock：
     搜索结果的**正确性**（中文子串命中、相关度排序）在 SQL 层验证，不在本探针内；
     这里只验证「搜索相关的 UI 行为」与前端交互链，所以刻意断网，避免数据漂移。
   ⚠️ 同一 path 只注册一条 route（Playwright 按注册逆序匹配 → catch-all 先注册）。 */
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

/** 打开论坛并把所有读请求 mock 成「给定结果集」 */
const openForum = async (rows) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      // 跳过首页开场画（本探针只关心论坛页）
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

  const body = JSON.stringify(rows);
  const json = { status: 200, contentType: 'application/json', body };
  // RPC 路径 + 降级直连路径都 mock（前端两条路都可能走）
  await page.route('**/rest/v1/rpc/list_forum_posts', (route) => route.fulfill(json));
  await page.route('**/rest/v1/posts*', (route) =>
    route.fulfill({
      ...json,
      headers: {
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
      },
    }),
  );

  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.forum-page .toolbar-search-input', { timeout: 25000 });
  await page.waitForTimeout(700);
  return { context, page, errors };
};

const inputValue = (page) => page.inputValue('.toolbar-search-input');
/* ⚠️ 清除按钮在 DOM 里有两份（移动端内联版 + 横屏 .is-hero 版），
   窄视口下 is-hero 那份被 CSS 隐藏 —— count() 数的是 DOM 数、不是可见数，
   所以断言与点击都必须带 :visible，否则会点到隐藏的那个（click 超时）。 */
const countVisibleClear = (page) => page.locator('.forum-page .toolbar-clear-btn:visible').count();
const historyVisible = (page) => page.locator('.forum-search-history').count();
const readHistory = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('boh-forum-search-history') || '[]');
    } catch {
      return null;
    }
  });

try {
  // ---------------- A：清除按钮 + ⌘K + 历史（列表有数据） ----------------
  {
    const { context, page, errors } = await openForum([MOCK_ROW]);

    console.log('\n--- A 初始态 ---');
    check('A1 搜索框存在', (await page.locator('.forum-page .toolbar-search-input').count()) === 1);
    check(
      'A2 空输入时不显示清除按钮',
      (await countVisibleClear(page)) === 0,
      `count=${await countVisibleClear(page)}`,
    );
    check('A3 未提交过时不显示最近搜索', (await historyVisible(page)) === 0);
    check('A4 非搜索态不显示结果计数', (await page.locator('.forum-search-count').count()) === 0);

    console.log('\n--- B 输入 → 清除 ---');
    await page.fill('.forum-page .toolbar-search-input', '树洞');
    await page.waitForTimeout(120);
    check(
      'B1 有内容时出现清除按钮',
      (await countVisibleClear(page)) >= 1,
      `count=${await countVisibleClear(page)}`,
    );
    await page.locator('.forum-page .toolbar-clear-btn:visible').first().click();
    await page.waitForTimeout(200);
    check(
      'B2 点清除后输入框为空',
      (await inputValue(page)) === '',
      `value=${await inputValue(page)}`,
    );
    check('B3 清除后按钮消失', (await countVisibleClear(page)) === 0);

    console.log('\n--- C ⌘K 聚焦 ---');
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(220);
    const focusedByMeta = await page.evaluate(
      () => document.activeElement?.classList?.contains('toolbar-search-input') === true,
    );
    check('C1 ⌘K 把焦点送进搜索框', focusedByMeta);
    // Ctrl+K（Windows/Linux 同款组合）
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(220);
    check(
      'C2 Ctrl+K 同样生效',
      await page.evaluate(
        () => document.activeElement?.classList?.contains('toolbar-search-input') === true,
      ),
    );

    console.log('\n--- D 最近搜索 ---');
    await page.fill('.forum-page .toolbar-search-input', '树洞');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const histAfterSubmit = await readHistory(page);
    check(
      'D1 显式提交后写入最近搜索',
      Array.isArray(histAfterSubmit) && histAfterSubmit[0] === '树洞',
      JSON.stringify(histAfterSubmit),
    );
    // 提交第二个词，验证「最近的排最前」
    await page.fill('.forum-page .toolbar-search-input', '开学');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const hist2 = await readHistory(page);
    check(
      'D2 最近的排最前且去重',
      Array.isArray(hist2) && hist2[0] === '开学' && hist2[1] === '树洞',
      JSON.stringify(hist2),
    );

    // 清空输入 + 聚焦 → 历史条出现
    await page.fill('.forum-page .toolbar-search-input', '');
    await page.click('.forum-page .toolbar-search-input');
    await page.waitForTimeout(320);
    check(
      'D3 清空并聚焦后展开最近搜索',
      (await historyVisible(page)) === 1,
      `visible=${await historyVisible(page)}`,
    );
    const chips = await page.locator('.search-history-chip').allTextContents();
    check(
      'D4 chip 文案是最近搜过的词',
      chips[0] === '开学' && chips[1] === '树洞',
      JSON.stringify(chips),
    );

    console.log('\n--- E 点历史词回填 ---');
    const chipTarget = page.locator('.search-history-chip', { hasText: '树洞' }).first();
    try {
      await chipTarget.click({ timeout: 8000 });
    } catch (error) {
      // 只在失败时打诊断：这个面板历史上被底部导航栏盖过（命中 nav-item），
      // 留一份现场信息便于下次直接定位，而不是让 click 超时了事。
      const diag = await chipTarget
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            hit: hit ? String(hit.className || hit.tagName).slice(0, 70) : null,
            viewport: [window.innerWidth, window.innerHeight],
          };
        })
        .catch(() => null);
      console.log('  chip 点击失败诊断:', JSON.stringify(diag));
      throw error;
    }
    await page.waitForTimeout(320);
    check(
      'E1 点 chip 回填搜索框',
      (await inputValue(page)) === '树洞',
      `value=${await inputValue(page)}`,
    );
    check('E2 回填后收起历史条', (await historyVisible(page)) === 0);

    console.log('\n--- F 清除历史 ---');
    await page.fill('.forum-page .toolbar-search-input', '');
    await page.click('.forum-page .toolbar-search-input');
    await page.waitForTimeout(320);
    if ((await historyVisible(page)) === 1) {
      await page.locator('.search-history-clear').first().click();
      await page.waitForTimeout(260);
      check('F1 清除历史后条带消失', (await historyVisible(page)) === 0);
      check(
        'F2 localStorage 里的历史被清空',
        JSON.stringify(await readHistory(page)) === '[]',
        JSON.stringify(await readHistory(page)),
      );
    } else {
      check('F1 清除历史后条带消失', false, '历史条未展开，前置条件不成立');
      check('F2 localStorage 里的历史被清空', false, '同上');
    }

    check('Z1 零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `${OUT}/forum-search-desktop.png` });
    await context.close();
  }

  // ---------------- G：无结果引导（mock 空结果集） ----------------
  {
    const { context, page, errors } = await openForum([]);

    console.log('\n--- G 无结果引导 ---');
    await page.fill('.forum-page .toolbar-search-input', '不存在的关键词');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);

    const emptyText = await page
      .locator('.empty-state')
      .first()
      .innerText()
      .catch(() => '');
    check(
      'G1 空态文案带上搜索词',
      emptyText.includes('不存在的关键词'),
      emptyText.replace(/\s+/g, ' ').slice(0, 60),
    );
    check(
      'G2 出现「问 BOHAI」引导',
      (await page.locator('.empty-action-btn.is-primary').count()) === 1,
    );
    check(
      'G3 出现「清除搜索」引导',
      (await page.locator('.empty-state-actions .empty-action-btn').count()) === 2,
    );
    check('G4 无结果时不显示结果计数', (await page.locator('.forum-search-count').count()) === 0);

    await page.locator('.empty-state-actions .empty-action-btn').nth(1).click();
    await page.waitForTimeout(400);
    check(
      'G5 点「清除搜索」后输入框清空',
      (await inputValue(page)) === '',
      `value=${await inputValue(page)}`,
    );

    check('Z2 零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `${OUT}/forum-search-empty.png` });
    await context.close();
  }

  // ---------------- H：结果计数（有数据 + 有关键词） ----------------
  {
    const { context, page, errors } = await openForum([MOCK_ROW]);
    await page.fill('.forum-page .toolbar-search-input', '关键词');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    const countText = await page
      .locator('.forum-search-count')
      .first()
      .innerText()
      .catch(() => '');
    check('H1 有结果时显示结果计数', /条/.test(countText), countText || '(无计数元素)');
    check(
      'H2 计数不谎报精确总数（has_more=false 才说「共」）',
      countText.includes('共') || countText.includes('前'),
      countText,
    );
    check('Z3 零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} catch (error) {
  check('Z9 探针未抛异常', false, String(error?.message || error).slice(0, 240));
} finally {
  await browser.close();
}

console.log('\n' + results.join('\n'));
console.log(`\n===== probe-forum-search: ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
