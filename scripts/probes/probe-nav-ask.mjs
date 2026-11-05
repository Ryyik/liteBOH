import { chromium } from 'playwright';

// 探针：BohIsland —— 和 BOHAI 聊天的入口（2026-11-04 终版口径）
//   1) `/`、⌘K、导航栏按钮、竖屏下拉，四种唤起都落在同一颗岛（全局唯一根节点）
//   2) 岛只有一个面：对话输入框（占位「问 BOHAI…」），没有搜索列表面板
//   3) **不按回车不出结果**：输入过程中不发请求、不出任何结果块
//   4) 回车后：页面类问题 → 「为你找到以下页面：」+ 可点页面胶囊；其余 → BOHAI 流式回答
//   5) 岛从公共导航栏长出来：surface 撑高（has-boh-island），卡片透明、材质由 surface 提供
//   6) 开/退场都有过渡（surface 高度动画），点空白收回（横竖屏同一套逻辑）
//   7) 主题跟随：浅色/深色都用导航同款玻璃，不再是恒黑岛
//   8) 键盘态让位、Esc 关岛、去全页、快速会话 origin 落账、档位恒 balance
//   9) 无导航栏路由（hideNavbar）上 `/` 仍可召唤 —— Teleport 的存在理由

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

/** 后端全空：不依赖任何远端数据 */
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
    const evt = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    return evt.defaultPrevented;
  });

const islandOpen = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('.boh-island-root');
    return !!root?.classList.contains('open') && !!root.querySelector('.boh-card');
  });

const answerInput = (page) => page.locator('.boh-answer-input');

const withPage = async (fn, { viewport = { width: 1440, height: 900 }, setupPage } = {}) => {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
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
// 组 1：桌面主流程（唤起 → 输入 → 回车 → 回答 → 收回）
// ============================================================
const SSE_BODY =
  [
    '八周年庆典将在主广场举行。',
    '时间是本周六下午两点，地点在社区中央的主广场舞台区，现场会搭建签到拱门与合影墙。',
    '报名入口在「活动」页，打开后选择「八周年庆典」卡片即可填写同行人数与饮食偏好。',
  ]
    .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
    .join('') + 'data: [DONE]\n\n';

await withPage(
  async (page, errs) => {
    const handled = await pressSlash(page);
    await page.waitForTimeout(600);
    check('① `/` 打开岛', await islandOpen(page), `handler 收到=${handled}`);

    const rootCount = await page.evaluate(
      () => document.querySelectorAll('.boh-island-root').length,
    );
    check('② 岛根节点全局唯一', rootCount === 1, `count=${rootCount}`);
    check(
      '②b 搜索列表面板已退场（.global-search 不存在）',
      await page.evaluate(() => !document.querySelector('.global-search')),
    );

    const face = await page.evaluate(() => ({
      input: !!document.querySelector('.boh-answer-input'),
      placeholder: document.querySelector('.boh-answer-input')?.getAttribute('placeholder') || '',
      focused: document.activeElement?.classList?.contains('boh-answer-input') === true,
    }));
    check(
      '③ 唤起即对话面：输入框在场、占位「问 BOHAI…」、自动聚焦',
      face.input && face.placeholder === '问 BOHAI…' && face.focused,
      JSON.stringify(face),
    );

    // 不按回车不出结果：打字过程中既不发请求，也不出任何结果块
    await answerInput(page).fill('八周年的活动什么时候开始');
    await page.waitForTimeout(800);
    const typing = await page.evaluate(() => ({
      answer: (document.querySelector('.boh-answer-text')?.textContent || '').trim(),
      pages: !!document.querySelector('.boh-pages'),
      echo: document.querySelector('.boh-q-echo')?.textContent || '',
    }));
    check(
      '④ 不按回车不出结果（无回答、无页面块、无回显）',
      !typing.answer && !typing.pages && !typing.echo,
      JSON.stringify(typing),
    );

    // 回车 → 真问句走 BOHAI
    await page.keyboard.press('Enter');
    await page
      .waitForFunction(
        () => (document.querySelector('.boh-answer-text')?.textContent || '').length > 0,
        { timeout: 8000 },
      )
      .catch(() => null);
    const answered = await page.evaluate(() => ({
      echo: document.querySelector('.boh-q-echo')?.textContent?.trim() || '',
      answer: (document.querySelector('.boh-answer-text')?.textContent || '').slice(0, 20),
      streaming: !!document.querySelector('.boh-activity'),
    }));
    check(
      '⑤ 回车 → BOHAI 回答落到消息区（回显 + 正文）',
      answered.echo.includes('八周年') && answered.answer.length > 0,
      JSON.stringify(answered),
    );

    // 岛高随字数生长（早期 vs 收尾）
    const heights = await page.evaluate(() => {
      const card = document.querySelector('.boh-card');
      return card ? Math.round(card.getBoundingClientRect().height) : 0;
    });
    check('⑥ 回答后岛高被内容撑开（> 空态 120）', heights > 120, `h=${heights}`);

    // Esc 直接关岛（没有搜索面分层）
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check('⑦ Esc 直接关岛（无分层）', (await islandOpen(page)) === false);

    // 导航栏搜索按钮 = 同一个入口
    await page.locator('.nav-search-btn').click();
    await page.waitForTimeout(600);
    check(
      '⑧ 导航栏按钮唤起同一颗岛（对话面）',
      (await islandOpen(page)) &&
        (await page.evaluate(() => !!document.querySelector('.boh-answer-input'))),
    );

    // 点空白收回
    await page.mouse.click(200, 700);
    await page.waitForTimeout(600);
    check('⑨ 点空白收回（桌面）', (await islandOpen(page)) === false);

    // ⌘K 同一颗岛
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(600);
    check(
      '⑩ ⌘K 打开同一颗岛（根唯一）',
      (await islandOpen(page)) &&
        (await page.evaluate(() => document.querySelectorAll('.boh-island-root').length)) === 1,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    check('⑪ 组 1 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 180));
  },
  {
    setupPage: (page) => {
      void page.route('**/rest/v1/rpc/list_public_bohai_modes', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'balance',
              mode_id: 'balance',
              model_id: 'mock-llm',
              display_name: 'Balance',
              provider: 'siliconflow',
              api_url: 'http://127.0.0.1:1/v1/chat/completions',
              status: 'active',
              capability: 'chat',
              min_tier: 'free',
              sort_order: 1,
              quota_multiplier: 0,
            },
          ]),
        }),
      );
      void page.route('**/functions/v1/**', async (r) => {
        const post = r.request().postData() || '';
        if (post.includes('runtime-chat-stream') || post.includes('"stream":true')) {
          await new Promise((resolve) => setTimeout(resolve, 700));
          await r.fulfill({ status: 200, contentType: 'text/event-stream', body: SSE_BODY });
          return;
        }
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
        await r.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' });
      });
    },
  },
);

// ============================================================
// 组 2：竖屏（下拉唤起 + 点空白收回 + 键盘态）
// ============================================================

/** 在导航表面模拟一次竖向触摸拖动（合成 TouchEvent，走真实 handler） */
const pullNav = async (page, dy) => {
  await page.evaluate(async (delta) => {
    const el = document.querySelector('.unified-nav-surface');
    const makeTouch = (y) =>
      new Touch({ identifier: 1, target: el, clientX: 195, clientY: y, pageX: 195, pageY: y });
    const fire = (type, y, withTouch = true) => {
      const touch = makeTouch(y);
      el.dispatchEvent(
        new TouchEvent(type, {
          touches: withTouch ? [touch] : [],
          targetTouches: withTouch ? [touch] : [],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    const from = 40;
    fire('touchstart', from);
    for (let i = 1; i <= 6; i += 1) {
      fire('touchmove', from + (delta * i) / 6);
      await new Promise((r) => setTimeout(r, 16));
    }
    fire('touchend', from + delta, false);
  }, dy);
};

await withPage(
  async (page, errs) => {
    await page.waitForTimeout(600);
    check(
      '⑫ 竖屏没有常驻悬浮气泡（问一句已下线）',
      await page.evaluate(() => !document.querySelector('.boh-pill')),
    );

    await pullNav(page, 24);
    await page.waitForTimeout(500);
    check('⑬ 轻拉 24px 不开岛', (await islandOpen(page)) === false);

    await pullNav(page, 80);
    await page.waitForTimeout(700);
    const chat = await page.evaluate(() => ({
      open: !!document.querySelector('.boh-card'),
      input: !!document.querySelector('.boh-answer-input'),
      focused: document.activeElement?.className === 'boh-answer-input',
      placeholder: document.querySelector('.boh-answer-input')?.getAttribute('placeholder') || '',
    }));
    check(
      '⑭ 下拉 80px → 开岛且落在对话输入框',
      chat.open && chat.input && chat.focused && chat.placeholder === '问 BOHAI…',
      JSON.stringify(chat),
    );

    // 页面类问题 → 对话回复「为你找到以下页面」
    await answerInput(page).fill('论坛');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const nav = await page.evaluate(() => ({
      title: document.querySelector('.boh-pages-title')?.textContent?.trim() || '',
      links: [...document.querySelectorAll('.boh-page-link')].map((b) => b.textContent.trim()),
    }));
    check(
      '⑮ 页面类问题 → 「为你找到以下页面：」+ 可点页面',
      nav.title === '为你找到以下页面：' && nav.links.includes('论坛'),
      JSON.stringify(nav),
    );

    // 点空白收回（竖屏）
    await page.mouse.click(195, 700);
    await page.waitForTimeout(600);
    check('⑯ 竖屏点空白收回', (await islandOpen(page)) === false);

    // 键盘态：注入 --kb-inset 后输入框底边让位
    await pullNav(page, 80);
    await page.waitForTimeout(700);
    const kb = await page.evaluate(() => {
      document.documentElement.style.setProperty('--kb-inset', '336px');
      const input = document.querySelector('.boh-answer-input');
      return {
        inputBottom: Math.round(input?.getBoundingClientRect().bottom || -1),
        vh: innerHeight,
      };
    });
    check(
      '⑰ 竖屏键盘态：输入框在键盘上方',
      kb.inputBottom <= kb.vh - 336 + 2 && kb.inputBottom > 0,
      JSON.stringify(kb),
    );

    check('⑱ 组 2 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
  },
  { viewport: { width: 390, height: 844 } },
);

// ============================================================
// 组 3：无导航栏路由（Teleport 的存在理由）
// ============================================================
await withPage(
  async (page, errs) => {
    await page.evaluate(() => {
      location.hash = '#/ai-chat';
    });
    await page.waitForTimeout(1200);
    // /ai-chat 页按设计不响应；换到 hideNavbar 的详情路由再验
    await page.evaluate(() => {
      location.hash = '#/';
    });
    await page.waitForTimeout(800);
    check(
      '⑲ 首页 `/` 仍可召唤（不依赖导航栏搜索按钮）',
      (await pressSlash(page)) && (await islandOpen(page)),
    );
    check('⑳ 组 3 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
  },
  { viewport: { width: 1440, height: 900 } },
);

// ============================================================
// 组 4：材质与主题跟随（与公共导航栏同色）
// ============================================================
await withPage(async (page) => {
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(400);
  const light = await page.evaluate(() => ({
    rootTheme: document.querySelector('.boh-island-root')?.getAttribute('data-theme'),
    surfaceBg: getComputedStyle(document.querySelector('.unified-nav-surface')).backgroundColor,
    surfaceImg: getComputedStyle(document.querySelector('.unified-nav-surface')).backgroundImage,
    cardTransparent:
      getComputedStyle(document.querySelector('.boh-card')).backgroundColor === 'rgba(0, 0, 0, 0)',
    docked: document.querySelector('.unified-nav-surface')?.classList.contains('has-boh-island'),
  }));
  check(
    '㉑ 浅色站点：唤起后整块岛变深色（卡片仍透明、surface 撑高）',
    light.rootTheme === 'light' &&
      light.surfaceImg.includes('linear-gradient') &&
      light.surfaceImg.includes('rgba(0, 0, 0, 0.08)') &&
      light.cardTransparent &&
      light.docked === true,
    JSON.stringify(light),
  );

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(400);
  const dark = await page.evaluate(() => ({
    rootTheme: document.querySelector('.boh-island-root')?.getAttribute('data-theme'),
    surfaceImg: getComputedStyle(document.querySelector('.unified-nav-surface')).backgroundImage,
  }));
  check(
    '㉒ 深色站点：同一块深色岛（不再跟站点主题分叉）',
    dark.rootTheme === 'dark' && dark.surfaceImg.includes('linear-gradient'),
    JSON.stringify(dark),
  );
});

// ============================================================
// 组 5：开/退场过渡 + 快速会话闭环
// ============================================================
await withPage(async (page, errs) => {
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(600);
  // 退场过渡：关岛后 surface 高度应逐帧回落（不是硬切）
  const timeline = await page.evaluate(async () => {
    const surface = document.querySelector('.unified-nav-surface');
    const samples = [];
    const t0 = performance.now();
    const tick = () => {
      samples.push(Math.round(surface.getBoundingClientRect().height));
      if (performance.now() - t0 < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 650));
    return samples;
  });
  const distinct = new Set(timeline).size;
  check(
    '㉓ 退场有过渡（surface 高度多帧回落，不是硬切）',
    distinct >= 4 && timeline[0] > timeline[timeline.length - 1],
    `frames=${distinct} ${timeline[0]}→${timeline[timeline.length - 1]}`,
  );

  // 快速会话 origin 落账（岛内问答归「在搜索里问过」）
  await page.waitForTimeout(300);
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  await answerInput(page).fill('八周年庆典什么时候');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const originDiag = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('boh_chat_sessions') || '[]');
    return rows.some((s) => s.origin === 'quick-ask') ? 'found' : 'missing';
  });
  check('㉔ 快速会话已落 origin=quick-ask', originDiag === 'found', originDiag);

  // ── 组 6：跳页即关岛（2026-11-05 用户报障「从帖子详情返回后多出一个空的黑岛」）
  //   `/forum/post/:id` 是 hideNavbar 路由：导航栏整个卸载，岛会退成 top:12 的悬浮胶囊，
  //   返回时导航是新建 DOM，若不复位就停在那副形态上 —— 一块只剩输入条的空黑岛。
  await page.goto(`${BASE}/#/forum/post/1`);
  await page.waitForTimeout(1400);
  const onPost = await page.evaluate(() => ({
    open: document.querySelector('.boh-island-root')?.classList.contains('open') ?? false,
    card: !!document.querySelector('.boh-island-root .boh-card'),
  }));
  check(
    '㉕ 切到 hideNavbar 详情页：岛随即关闭、卡片卸载（不留悬浮态）',
    !onPost.open && !onPost.card,
    JSON.stringify(onPost),
  );

  await page.goBack();
  await page.waitForTimeout(1600);
  const backHome = await page.evaluate(() => {
    const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
    return {
      open: document.querySelector('.boh-island-root')?.classList.contains('open') ?? false,
      card: !!document.querySelector('.boh-island-root .boh-card'),
      hasIsland: surface?.classList.contains('has-boh-island') ?? null,
      surfaceH: surface ? Math.round(surface.getBoundingClientRect().height) : 0,
    };
  });
  check(
    '㉖ 返回后没有残留的空黑岛（无卡片、surface 回常态高度）',
    !backHome.open && !backHome.card && backHome.hasIsland === false && backHome.surfaceH < 100,
    JSON.stringify(backHome),
  );

  // ── 组 7：开合竞态（2026-11-05 复核发现）
  //   退场是异步的（playClose 最长 320ms）。这期间再唤起，旧实现会照常
  //   clearDock + rendered=false ⇒ 把刚打开的新岛一起收掉（表现为「岛开着但什么都没有」）。
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(1000);
  const reopen = await page.evaluate(() => {
    const root = document.querySelector('.boh-island-root');
    const card = document.querySelector('.boh-island-root .boh-card');
    const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
    return {
      open: root?.classList.contains('open') ?? false,
      card: !!card,
      opacity: card ? Number(getComputedStyle(card).opacity) : 0,
      hasIsland: surface?.classList.contains('has-boh-island') ?? false,
      input: !!document.querySelector('.boh-answer-input'),
    };
  });
  check(
    '㉗ 退场动画期间重新开岛：岛还在、可见、仍停靠（不被上一次收尾吞掉）',
    reopen.open && reopen.card && reopen.opacity > 0.9 && reopen.hasIsland && reopen.input,
    JSON.stringify(reopen),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  check('㉘ 组 5 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
});

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
