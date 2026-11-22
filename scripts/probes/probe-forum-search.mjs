import { chromium } from 'playwright';

/* 探针：论坛搜索体验增强（2026-09-27）
   覆盖：
     1. 清除按钮（有内容才出现 / 点击后清空并消失）
     2. ⌘K / Ctrl+K 聚焦搜索框
     3. 最近搜索（显式提交才写入 / 聚焦空输入时展开 / 点回填 / 清除）
     4. 结果计数（只在该出现的时候出现）
     5. 无结果引导（问 BOHAI + 清除搜索）
     6. 「问 BOHAI」内联回答卡片（2026-11-22）：点问 BOHAI 不弹悬浮岛 —— 卡片出现在
        空态下方 / 帖子列表前面，原句回显，SSE 流式文字进卡片，点卡片跳 /ai-chat 交接
   ⚠️ 网络全程 mock：
     搜索结果的**正确性**（中文子串命中、相关度排序）在 SQL 层验证，不在本探针内；
     这里只验证「搜索相关的 UI 行为」与前端交互链，所以刻意断网，避免数据漂移。
   ⚠️ 同一 path 只注册一条 route（Playwright 按注册逆序匹配 → catch-all 先注册）。
   ⚠️ AI 链路的 mock 手法抄 probe-bohai-keepalive-stream.mjs：SSE 一次性给、
      addInitScript 注入 fetch 包装逐块重放（且必须接住 abort 信号）——
      route.fulfill 一次给完会让「有内容」恒真（假绿）。 */
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

/* ── 「问 BOHAI」内联回答卡片的 AI 链路 mock（手法抄 probe-bohai-keepalive-stream）── */

const MOCK_AI_MODES = [
  {
    id: 'fast',
    mode_id: 'fast',
    model_id: 'deepseek-ai/DeepSeek-V3',
    name: 'Fast',
    display_name: 'Fast',
    tagline: '极速响应',
    min_tier: 'free',
    status: 'active',
    sort_order: 10,
    quota_multiplier: 1,
  },
];

/** 哨兵放最后一段：只断言「有内容」会假绿（中止前也吐过几段），哨兵到达 = 流跑到自然结束 */
const AI_SENTINEL = '内联回答哨兵END';
const AI_CHUNK_GAP_MS = 240;

const AI_SSE_BODY =
  ['论', '坛', '内', '联', '回', '答', AI_SENTINEL]
    .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
    .join('') + 'data: [DONE]\n\n';

/** 注入的 fetch 包装：把一次性拿到的 SSE 按「空行」切开逐块重放（真等 gapMs），
    必须接住 abort 信号 —— 否则这条 mock 流免疫于中止，「点卡片停流」就测不出来。 */
const SLOW_SSE_FETCH_WRAPPER = ({ gapMs }) => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const signal = args[1]?.signal;
    const response = await originalFetch(...args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (!String(url).includes('api-key-vault')) return response;
    if (!response.headers.get('content-type')?.includes('text/event-stream')) return response;
    const text = await response.text();
    const parts = text.split(/(?<=\n\n)/).filter(Boolean);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const onAbort = () => {
          try {
            controller.error(new DOMException('Aborted', 'AbortError'));
          } catch {
            /* 流已关闭 */
          }
        };
        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
        for (const part of parts) {
          if (signal?.aborted) return;
          controller.enqueue(encoder.encode(part));
          await new Promise((resolve) => setTimeout(resolve, gapMs));
        }
        if (!signal?.aborted) controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };
};

/** 打开论坛并把所有读请求 mock 成「给定结果集」；options.ai = 连 AI 链路一起 mock */
const openForum = async (rows, options = {}) => {
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

  if (options.ai) {
    // 模式清单 mock（list_public_bohai_modes）。⚠️ 必填 model_id：normalize 会把缺
    // model_id 的行整条丢掉 ⇒ availableModels 为空 ⇒ 流根本没起来（keepalive 探针同坑）。
    await page.route('**/rest/v1/rpc/list_public_bohai_modes*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_AI_MODES),
      }),
    );
    // SSE 慢速重放（fetch 包装逐块 enqueue，接住 abort —— 手法与判据见文件头）
    await context.addInitScript(SLOW_SSE_FETCH_WRAPPER, { gapMs: AI_CHUNK_GAP_MS });
    await page.route('**/functions/v1/api-key-vault**', async (route) => {
      const reqBody = route.request().postData() || '';
      if (!reqBody.includes('runtime-chat-stream')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: {} }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: AI_SSE_BODY,
      });
    });
  }

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
    const countEls = await page.locator('.forum-search-count').count();
    /* 2026-10-22：结果计数提示按用户要求**整条删除**（原 H1/H2 断言它存在且措辞正确）。
       现在改成反向锁：任何情况下都不该再出现 —— 防止有人以「提升可发现性」为由加回来。 */
    check('H1 搜索态不渲染结果计数（2026-10-22 已移除）', countEls === 0, `count=${countEls}`);
    check('Z3 零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  /* ⚠️ 内联卡片场景的公共断言：
     · 卡片不再弹悬浮岛 —— 岛的根节点（.boh-island-root）必须不出现；
     · 原句回显 = 搜索框原句（stripTagTokens 后），不是拼好的长 prompt；
     · 点卡片跳 #/ai-chat 且会话以 origin=quick-ask 落盘（交接的发起侧）。 */
  const waitCardStreamed = async (page) => {
    await page.waitForSelector('.boh-forum-answer', { timeout: 15000 });
    await page.waitForFunction(
      () =>
        document.querySelector('.boh-forum-answer-text')?.textContent?.includes('内联回答哨兵END'),
      null,
      { timeout: 15000 },
    );
  };

  // ---------------- I：内联回答卡片（无结果 → 卡片在空态下方） ----------------
  {
    const { context, page, errors } = await openForum([], { ai: true });

    console.log('\n--- I 问 BOHAI 内联卡片（无结果） ---');
    await page.fill('.forum-page .toolbar-search-input', '不存在的关键词');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);

    await page.locator('.empty-state-actions .empty-action-btn.is-primary:visible').click();
    // 检索窗口：转圈状态出现 → 卡片挂载
    await page.waitForSelector('.boh-forum-answer', { timeout: 15000 });

    /* 岛的根节点 .boh-island-root 是 App 级常驻（Teleport 到 body，关岛也卸不掉），
       要数的是展开卡（v-if="rendered"）或 open 态 —— 数根节点会恒假红。 */
    check(
      'I1 不弹悬浮岛',
      (await page.locator('.boh-island-root.open').count()) === 0 &&
        (await page.locator('.boh-island-root .boh-card').count()) === 0,
    );
    check(
      'I2 原句回显 = 搜索框原句',
      (await page.locator('.boh-forum-answer-q').innerText()).includes('不存在的关键词'),
    );
    check(
      'I3 检索 hint 已收（状态交棒给卡片）',
      (await page.locator('.toolbar-ai-hint').count()) === 0,
    );

    // 空态在前、卡片在后（用户口径：渲染在搜索结果的下方）
    const order = await page.evaluate(() => {
      const empty = document.querySelector('.posts-list .empty-state');
      const card = document.querySelector('.boh-forum-answer');
      if (!empty || !card) return 'missing';
      return empty.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING
        ? 'empty-first'
        : 'wrong';
    });
    check('I4 卡片在空态下方', order === 'empty-first', order);
    check(
      'I5 卡片不带追问输入框（纯展示口径）',
      (await page.locator('.boh-forum-answer input, .boh-forum-answer textarea').count()) === 0,
    );

    await waitCardStreamed(page);
    check(
      'I6 SSE 流式文字进卡片（含哨兵 = 流自然结束）',
      (await page.locator('.boh-forum-answer-text').innerText()).includes(AI_SENTINEL),
    );

    // 点卡片 → /ai-chat（交接发起侧；消费侧 = useBohShell 消费交接，源码级单测锁定）
    await page.locator('.boh-forum-answer .boh-forum-answer-cta:visible').click();
    await page.waitForFunction(() => window.location.hash.startsWith('#/ai-chat'), null, {
      timeout: 10000,
    });
    const finalHash = await page.evaluate(() => window.location.hash);
    check('I8 点卡片跳 /ai-chat', finalHash.startsWith('#/ai-chat'), finalHash.slice(0, 24));

    // 落盘断言放在点击之后：点卡片链里有 flushSessionsToStorage（立即写），
    // 平时防抖 500ms+idle 的落盘在跳转前已经完成 —— 顺序反了会撞上防抖窗口假红
    check(
      'I7 会话以 quick-ask 落盘（侧栏「在搜索里问过」分组的来源标记）',
      await page.evaluate(() => {
        try {
          const sessions = JSON.parse(localStorage.getItem('boh_chat_sessions') || '[]');
          return sessions.some(
            (s) =>
              s.origin === 'quick-ask' &&
              Array.isArray(s.messages) &&
              s.messages.some(
                (m) => m.role === 'user' && String(m.content || '').includes('不存在的关键词'),
              ),
          );
        } catch {
          return false;
        }
      }),
    );

    check('Z4 零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `${OUT}/forum-search-bohai-card-empty.png` });
    await context.close();
  }

  // ---------------- J：内联回答卡片（有结果 → 卡片在帖子列表前面） ----------------
  {
    const { context, page, errors } = await openForum([MOCK_ROW], { ai: true });

    console.log('\n--- J 问 BOHAI 内联卡片（有结果） ---');
    await page.fill('.forum-page .toolbar-search-input', '关键词');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);

    // 有结果时空态不在场：走搜索行内的「问 BOHAI」胶囊（⚠️ hero 版本 display:none，必须 :visible）
    await page.locator('.toolbar-search-actions .toolbar-ai-btn:visible').click();
    await page.waitForSelector('.boh-forum-answer', { timeout: 15000 });

    const order = await page.evaluate(() => {
      const card = document.querySelector('.boh-forum-answer');
      const post = document.querySelector('.posts-list .forum-virtual-post');
      if (!card || !post) return 'missing';
      return card.compareDocumentPosition(post) & Node.DOCUMENT_POSITION_FOLLOWING
        ? 'card-first'
        : 'wrong';
    });
    check('J1 卡片在帖子列表前面', order === 'card-first', order);

    await waitCardStreamed(page);
    check(
      'J2 有结果时同样流式出全文',
      (await page.locator('.boh-forum-answer-text').innerText()).includes(AI_SENTINEL),
    );

    // 换关键词收卡（watch(searchKeyword) → dismissInlineAsk）
    await page.fill('.forum-page .toolbar-search-input', '另一个词');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    check(
      'J3 换关键词后卡片收起',
      (await page.locator('.boh-forum-answer').count()) === 0,
      `count=${await page.locator('.boh-forum-answer').count()}`,
    );

    check('Z5 零 JS 运行时错误', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `${OUT}/forum-search-bohai-card-results.png` });
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
