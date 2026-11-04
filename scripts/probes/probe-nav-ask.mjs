import { chromium } from 'playwright';

// 探针：BohIsland —— 搜索 + 「问一句」独立悬浮岛（plans/038 P1）
//   1) `/` 与导航栏按钮召唤的是同一颗岛（同一 DOM 根，全局仅一个 .boh-island-root）
//   2) 输入条 top 恒定：空态 → 出结果，.gs-bar top 差值 ≤ 1px（本方案唯一的硬视觉契约）
//   3) 默认高亮两档（§3.2，缺一即假绿）：
//        非问句 + 有结果 → 第一个搜索结果；问句 / 零结果 → 第 0 项「问 BOHAI」
//   4) 零结果文案「站内没找到，问一下 BOHAI」
//   5) ⌘↵ 进岛内回答面（旧 AI 岛不再接管）
//   6) 键盘：注入 --kb-inset 后卡片底边 ≤ 视口 − 键盘高（卡片消费键盘真源）
//   7) 竖屏：常驻胶囊可见、点击展开
//   8) 无导航栏路由（hideNavbar）上 `/` 仍可召唤 —— Teleport 的存在理由
//   9) 深色岛材质：根节点恒 data-theme=dark，面板底色为低透明叠色
//  10) 零 pageerror
//  11) 回答面（P2）：⌘↵ 进回答、输入条 top 恒定、活动行、岛高随字数生长、
//      Esc 分层（回答→搜索→关岛）、追问、去全页 —— 流式由本地 SSE mock 服务器驱动
//  12) 零 pageerror

const BASE = 'http://localhost:5173';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/** 后端全空：只有本地索引类来源（教程/页面/下载/设定集/MBTI）会命中 */
const mockApi = async (page) => {
  await page.route('**/rest/v1/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-0/0' },
      body: '[]',
    }),
  );
};

const pressSlash = (page) =>
  page.evaluate(() => {
    const evt = new KeyboardEvent('keydown', {
      key: '/',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(evt);
    // defaultPrevented = 自家 handler 确实收到并处理了
    return evt.defaultPrevented;
  });

const islandOpen = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('.boh-island-root');
    const card = root?.querySelector('.boh-card');
    const search = root?.querySelector('.global-search');
    return !!root?.classList.contains('open') && !!card && !!search;
  });

const withPage = async (fn, { viewport = { width: 1440, height: 900 }, setupPage } = {}) => {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    // 跳过首页开场画（开场画在场时岛按设计不响应）
    try {
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await mockApi(page);
  // 追加路由（注册晚于 catch-all → 逆序匹配优先生效）
  if (setupPage) await setupPage(page);
  try {
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!document.querySelector('#unified-nav-container'), null, {
      timeout: 30000,
    });
    await page.waitForTimeout(1600);
    await fn(page, errs);
  } finally {
    await context.close();
  }
};

// ============================================================
// 组 1：桌面主流程
// ============================================================
await withPage(async (page, errs) => {
  // ---- 同一颗岛：/ 开 → / 关 → 按钮开，根节点全程唯一 ----
  const handled = await pressSlash(page);
  await page.waitForTimeout(500);
  check('① / 键打开岛', await islandOpen(page), `handler 收到=${handled}`);

  const rootCount = await page.evaluate(() => document.querySelectorAll('.boh-island-root').length);
  check('② 岛根节点全局唯一（不是两张卡）', rootCount === 1, `count=${rootCount}`);

  // plans/038 P3：旧 AI 岛（导航 surface 宿主形态）已退场
  check(
    '②b 旧 AI 岛已退场（.bohai-island 不存在）',
    (await page.evaluate(() => document.querySelectorAll('.bohai-island').length)) === 0,
  );

  check(
    '③ 输入框自动聚焦（壳同步渲染，唤起即聚焦）',
    await page.evaluate(() => document.activeElement?.classList?.contains('gs-input') === true),
  );

  // ---- 输入条 top 恒定（硬视觉契约）----
  const barTopEmpty = await page.evaluate(
    () => document.querySelector('.gs-bar')?.getBoundingClientRect().top ?? -1,
  );
  await page.locator('.gs-input').fill('教程');
  await page.waitForTimeout(900);
  const barTopResults = await page.evaluate(
    () => document.querySelector('.gs-bar')?.getBoundingClientRect().top ?? -1,
  );
  check(
    '④ 输入条 top 恒定：空态 → 出结果差值 ≤1px',
    Math.abs(barTopResults - barTopEmpty) <= 1 && barTopEmpty > 0,
    `empty=${barTopEmpty} results=${barTopResults}`,
  );

  // ---- 默认高亮两档 ----
  const activeIsAsk = await page.evaluate(() => {
    const el = document.querySelector('.gs-hit.active');
    return !!el?.classList.contains('gs-ai');
  });
  check(
    '⑤a 非问句 + 有结果 → 第一个搜索结果高亮（不是第 0 项）',
    activeIsAsk === false,
    `activeIsAsk=${activeIsAsk}`,
  );

  await page.locator('.gs-input').fill('八周年的活动什么时候开始');
  await page.waitForTimeout(900);
  const askDiag = await page.evaluate(() => {
    const el = document.querySelector('.gs-hit.active');
    return { isAsk: !!el?.classList.contains('gs-ai'), text: el?.textContent.trim() || '' };
  });
  // 问句 → 第 0 项高亮；mock 后端为空 ⇒ 该问句同时是零结果，两种文案都合法
  check(
    '⑤b 问句 → 第 0 项高亮',
    askDiag.isAsk && (askDiag.text.includes('问 BOHAI') || askDiag.text.includes('站内没找到')),
    JSON.stringify(askDiag),
  );

  // ---- 零结果：文案换「站内没找到」且仍高亮 ----
  await page.locator('.gs-input').fill('zzqq不存在的东西xyz');
  await page.waitForTimeout(900);
  const zeroDiag = await page.evaluate(() => {
    const ask = document.querySelector('.gs-ai');
    return {
      isAskActive: !!ask?.classList.contains('active'),
      text: ask?.textContent.trim() || '',
    };
  });
  check(
    '⑥ 零结果 → 「站内没找到，问一下 BOHAI」且高亮',
    zeroDiag.isAskActive && zeroDiag.text.includes('站内没找到'),
    JSON.stringify(zeroDiag),
  );

  // ---- Esc 关闭 ----
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('⑦ Esc 关闭岛', (await islandOpen(page)) === false);

  // ---- 导航栏按钮召唤同一颗岛 ----
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  check(
    '⑧ 导航栏按钮召唤同一颗岛（根唯一 + 已展开）',
    (await islandOpen(page)) &&
      (await page.evaluate(() => document.querySelectorAll('.boh-island-root').length)) === 1,
  );

  // ---- 键盘真源：注入 --kb-inset 后卡片底边让位（在 ⌘↵ 前量，状态最干净）----
  await page.locator('.gs-input').fill('教程');
  await page.waitForTimeout(900);
  const kb = await page.evaluate(() => {
    document.documentElement.style.setProperty('--kb-inset', '336px');
    const card = document.querySelector('.boh-card');
    const input = document.querySelector('.gs-input');
    const rect = card?.getBoundingClientRect();
    const inputRect = input?.getBoundingClientRect();
    return {
      cardBottom: rect ? Math.round(rect.bottom) : -1,
      inputBottom: inputRect ? Math.round(inputRect.bottom) : -1,
      vh: window.innerHeight,
    };
  });
  const limit = kb.vh - 336;
  check(
    '⑨ 注入 --kb-inset:336 后卡片底边 ≤ 视口−键盘（输入框在键盘上方）',
    kb.cardBottom <= limit + 2 && kb.inputBottom <= limit + 2 && kb.cardBottom > 0,
    JSON.stringify({ ...kb, limit }),
  );
  await page.evaluate(() => document.documentElement.style.setProperty('--kb-inset', '0px'));

  // ---- ⌘↵ 进岛内回答面（P2 起：岛内直接回答，不再召唤旧 AI 岛）----
  await page.evaluate(() => {
    const input = document.querySelector('.gs-input');
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForTimeout(1200);
  const afterCmd = await page.evaluate(() => ({
    answerShown: !!document.querySelector('.boh-answer'),
    islandOpen: !!document.querySelector('.boh-island-root')?.classList.contains('open'),
    oldAiOpen:
      document.querySelector('.unified-nav-surface')?.className.includes('has-bohai-island') ||
      false,
  }));
  check(
    '⑩ ⌘↵ 进岛内回答面（旧 AI 岛不再接管）',
    afterCmd.answerShown && afterCmd.islandOpen && !afterCmd.oldAiOpen,
    JSON.stringify(afterCmd),
  );

  // plans/038 P3：⌘K 改线到新岛（App.vue handleGlobalAiKeydown）。放组尾 ——
  // 中途按会扰动 ③ 的聚焦链路（面板重挂载后聚焦时序不稳）。
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(600);
  check(
    '⑩b ⌘K 打开同一颗新岛',
    (await islandOpen(page)) &&
      (await page.evaluate(() => document.querySelectorAll('.boh-island-root').length)) === 1,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  check('⑪ 组 1 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 180));
});

// ============================================================
// 组 2：竖屏胶囊
// ============================================================
await withPage(
  async (page, errs) => {
    await page.waitForTimeout(600);
    const pill = await page.evaluate(() => {
      const el = document.querySelector('.boh-pill');
      if (!el) return { present: false };
      const rect = el.getBoundingClientRect();
      const nav = document.querySelector('#unified-nav-container')?.getBoundingClientRect();
      return {
        present: true,
        visible: rect.width > 0 && rect.height > 0,
        belowNav: nav ? rect.top >= nav.bottom - 1 : null,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    });
    check(
      '⑫ 竖屏常驻胶囊可见且挂在导航栏下方',
      pill.present && pill.visible && pill.belowNav === true,
      JSON.stringify(pill),
    );
    check(
      '⑬ 胶囊尺寸 ≈148×40',
      Math.abs(pill.w - 148) <= 4 && Math.abs(pill.h - 40) <= 4,
      `${pill.w}×${pill.h}`,
    );

    await page.locator('.boh-pill').click();
    await page.waitForTimeout(600);
    check('⑭ 点胶囊展开岛', await islandOpen(page));
    check(
      '⑮ 展开后胶囊退场（同一物体的两个形态）',
      await page.evaluate(() => !document.querySelector('.boh-pill')),
    );

    // 竖屏键盘态
    await page.locator('.gs-input').fill('教程');
    await page.waitForTimeout(900);
    const kb = await page.evaluate(() => {
      document.documentElement.style.setProperty('--kb-inset', '336px');
      const card = document.querySelector('.boh-card');
      const input = document.querySelector('.gs-input');
      return {
        cardBottom: Math.round(card?.getBoundingClientRect().bottom || -1),
        inputBottom: Math.round(input?.getBoundingClientRect().bottom || -1),
        vh: window.innerHeight,
      };
    });
    const limit = kb.vh - 336;
    check(
      '⑯ 竖屏键盘态：输入框底边在键盘上方',
      kb.inputBottom <= limit + 2 && kb.cardBottom > 0,
      JSON.stringify({ ...kb, limit }),
    );

    check('⑰ 组 2 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
  },
  { viewport: { width: 390, height: 844 } },
);

// ============================================================
// 组 3：无导航栏路由（Teleport 的存在理由）
// ============================================================
await withPage(async (page, errs) => {
  await page.evaluate(() => {
    location.hash = '#/profile/probe-user';
  });
  await page.waitForTimeout(2000);
  const noHost = await page.evaluate(
    () => !document.querySelector('#unified-nav-container .nav-search-btn'),
  );
  check('㉘ hideNavbar 路由下没有导航栏搜索按钮（前置条件）', noHost);

  const handled = await pressSlash(page);
  await page.waitForTimeout(600);
  check(
    '㉙ 无导航栏路由上 / 仍召唤岛（不依赖导航栏存在）',
    await islandOpen(page),
    `handler 收到=${handled}`,
  );

  check('㉚ 组 3 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
});

// ============================================================
// 组 4：深色岛材质（根恒 dark，不随页面主题）
// ============================================================
await withPage(async (page) => {
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  // 页面切到浅色主题（容器暗色移除）—— 岛内面板仍应是暗色叠色
  await page.evaluate(() => {
    document.querySelector('#unified-nav-container')?.setAttribute('data-theme', 'light');
  });
  await page.waitForTimeout(300);
  const diag = await page.evaluate(() => {
    const root = document.querySelector('.boh-island-root');
    const bg = getComputedStyle(document.querySelector('.gs-bar')).backgroundColor;
    return {
      rootTheme: root?.getAttribute('data-theme'),
      bg,
      alpha: parseFloat(String(bg).split(',').pop() || '1') || 0,
    };
  });
  check(
    '㉛ 页面浅色主题下岛仍为深色材质（面板底色低透明叠色）',
    diag.rootTheme === 'dark' && diag.alpha < 0.2,
    JSON.stringify(diag),
  );
});

// ============================================================
// 组 5：回答面（P2）—— ⌘↵ 进回答面 / 输入条 top 恒定 / 活动行 / 高度随字数生长 /
//       Esc 分层（回答→搜索→关岛）/ 再问一轮 / 去全页
//
// 流式真源：引擎走内置默认模型 boh:fast → 站方 API-Key 代理 EF（runtime-chat-stream），
// 探针按请求体嗅探 mock functions/v1：流式请求延迟 1.2s 再整段 fulfill SSE
// （Playwright fulfill 无法逐帧推流 ⇒ 「每帧生长」的真机属性由原型验证，
//  这里断言机制本身：早期无内容的高度 < 内容到齐后的高度）。
// ⚠️ functions/v1 不 mock 会打到被墙的 supabase.co —— 检索段挂死 24s，全组超时。
// ============================================================
const SSE_CHUNKS = [
  '八周年庆典将在主广场举行。',
  '时间是本周六下午两点，地点在社区中央的主广场舞台区，现场会搭建签到拱门与合影墙。',
  '报名入口在「活动」页，打开后选择「八周年庆典」卡片即可填写同行人数与饮食偏好。',
  '欢迎带朋友一起来，现场有限定徽章和抽奖环节，奖品包括周年纪念礼盒与限定坐骑兑换码，记得提前十分钟入场排队领取手环。',
];
const SSE_BODY =
  SSE_CHUNKS.map(
    (c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`,
  ).join('') + 'data: [DONE]\n\n';

const MOCK_MODE_ROW = [
  {
    id: 'mock-fast',
    mode_id: 'fast',
    model_id: 'mock-llm',
    display_name: 'Fast',
    provider: 'siliconflow',
    api_url: 'http://127.0.0.1:1/v1/chat/completions',
    status: 'active',
    capability: 'chat',
    min_tier: 'free',
    sort_order: 1,
    quota_multiplier: 0,
  },
];

await withPage(
  async (page, errs) => {
    await page.locator('.nav-search-btn').click();
    await page.waitForTimeout(500);
    const searchBarTop = await page.evaluate(
      () => document.querySelector('.gs-bar')?.getBoundingClientRect().top ?? -1,
    );

    await page.locator('.gs-input').fill('八周年的活动什么时候开始');
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const input = document.querySelector('.gs-input');
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForTimeout(700);

    check(
      '㉜ ⌘↵ 进入回答面（岛不关，回答组件挂载）',
      await page.evaluate(() => {
        const answer = document.querySelector('.boh-answer');
        const root = document.querySelector('.boh-island-root');
        return !!answer && !!root?.classList.contains('open');
      }),
    );

    const ansBarTop = await page.evaluate(
      () => document.querySelector('.boh-answer-bar')?.getBoundingClientRect().top ?? -1,
    );
    check(
      '㉝ 输入条 top 恒定：搜索面 = 回答面（≤1px）',
      Math.abs(ansBarTop - searchBarTop) <= 1 && ansBarTop > 0,
      `search=${searchBarTop} answer=${ansBarTop}`,
    );

    check(
      '㉞ 问题回显（一行小字）',
      await page.evaluate(() =>
        (document.querySelector('.boh-q-echo')?.textContent || '').includes('八周年'),
      ),
    );

    // 流式中：活动行可见 + 内容未到时的「早期高度」
    await page.waitForTimeout(300);
    const h1 = await page.evaluate(() =>
      Math.round(document.querySelector('.boh-card')?.getBoundingClientRect().height || 0),
    );
    check(
      '㉟ 流式期间有活动行',
      await page.evaluate(() => !!document.querySelector('.boh-activity')),
    );
    await page.waitForTimeout(2500); // 代理 mock 延迟 1.2s + 渲染余量
    const h2 = await page.evaluate(() =>
      Math.round(document.querySelector('.boh-card')?.getBoundingClientRect().height || 0),
    );
    check('㊃ 岛高随字数生长（回答完 > 流式早期）', h2 > h1 + 20, `early=${h1} final=${h2}`);
    check(
      '㊄ 回答正文渲染（SSE 内容落到 markdown）',
      await page.evaluate(() =>
        (document.querySelector('.boh-answer-text')?.textContent || '').includes('主广场'),
      ),
    );
    check(
      '㊅ 流式结束后活动行消失',
      await page.evaluate(() => !document.querySelector('.boh-activity')),
    );

    // plans/038 P3b：快速会话打 origin 标记，全页侧栏「在搜索里问过」分组按此归档
    const originDiag = await page.evaluate(() => {
      try {
        const rows = JSON.parse(localStorage.getItem('boh_chat_sessions') || '[]');
        return rows.find((s) => s.origin === 'quick-ask') ? 'found' : `rows=${rows.length}`;
      } catch (e) {
        return String(e);
      }
    });
    check(
      '㊋ 快速会话已落 origin=quick-ask（可归入「在搜索里问过」）',
      originDiag === 'found',
      originDiag,
    );

    // Esc 分层：回答 → 搜索（保留原句）→ 关岛
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const layered = await page.evaluate(() => ({
      islandOpen: !!document.querySelector('.boh-island-root')?.classList.contains('open'),
      query: document.querySelector('.gs-input')?.value || '',
    }));
    check(
      '㊆ Esc 退回搜索面且保留原句（不关岛）',
      layered.islandOpen && layered.query === '八周年的活动什么时候开始',
      JSON.stringify(layered),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('㊇ 再 Esc 关岛', (await islandOpen(page)) === false);

    // 再问一轮：重开岛 → ⌘↵ → 第二轮回答（引擎新实例，startNewChat）
    await pressSlash(page);
    await page.waitForTimeout(500);
    await page.locator('.gs-input').fill('报名要带什么');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const input = document.querySelector('.gs-input');
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForTimeout(3000);
    check(
      '㊈ 再问一轮：新回答内容出现',
      await page.evaluate(() =>
        (document.querySelector('.boh-answer-text')?.textContent || '').includes('八周年庆典'),
      ),
    );

    // 去全页
    await page.locator('.boh-foot-btn').click();
    await page.waitForTimeout(900);
    const afterFull = await page.evaluate(() => ({
      hash: location.hash,
      islandOpen: !!document.querySelector('.boh-island-root')?.classList.contains('open'),
    }));
    check(
      '㊉ 去全页：跳 /ai-chat 且岛关闭',
      afterFull.hash.startsWith('#/ai-chat') && !afterFull.islandOpen,
      JSON.stringify(afterFull),
    );

    check('㊊ 组 5 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 180));
  },
  {
    setupPage: (page) => {
      void page.route('**/rest/v1/rpc/list_public_bohai_modes', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_MODE_ROW),
        }),
      );
      void page.route('**/functions/v1/**', async (r) => {
        const post = r.request().postData() || '';
        // 流式主生成（站方代理 passthrough）：延迟后整段 SSE
        if (post.includes('runtime-chat-stream') || post.includes('"stream":true')) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          await r.fulfill({ status: 200, contentType: 'text/event-stream', body: SSE_BODY });
          return;
        }
        // 非流式模型调用兜底
        if (post.includes('messages')) {
          await r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              status: 200,
              data: { choices: [{ message: { content: '（非流式兜底回答）' } }] },
            }),
          });
          return;
        }
        // 其余（Tavily 搜索 / 连接器 / 记忆等）一律空结果
        await r.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' });
      });
    },
  },
);

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} PASS`);
if (passed !== results.length) {
  console.log(
    'FAILED:\n' +
      results
        .filter((r) => !r.pass)
        .map((r) => `  - ${r.name}  ${r.detail}`)
        .join('\n'),
  );
  process.exitCode = 1;
}

await browser.close();
