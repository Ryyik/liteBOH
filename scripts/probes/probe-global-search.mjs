import { chromium } from 'playwright';

// 探针：全局搜索（导航栏灵动岛形态）—— plans/020-site-global-search.md
//   1) 入口可达 + 点击展开 + surface 高度上报 + 输入框自动聚焦
//   2) 本地索引源命中（教程 / 页面 / 下载 / 设定集 / MBTI 不依赖网络）
//   3) 「全部」视图每组上限 3 条；类型 chip 切换后只展示该组
//   4) 点结果跳转 + 面板自动关闭
//   5) 键盘：↑↓ 选择 / Enter 打开 / Esc 关闭
//   6) ⌘K / Ctrl+K 开关
//   7) ⚠️ 仲裁：通知岛在场时打开搜索仍可见（守 showIsland.preempt —— 去掉它这条必红）
//   8) 竖屏 mini 未展开态隐藏按钮（否则会撑爆精算过的胶囊宽度）
//   9) hideNavbar 路由下无宿主、⌘K 不响应
//  10) 暗色底色 + 零 pageerror
//  11) Spotlight 式优化：动作搜索（搜到即执行）/ Alt+数字切类型 / 常驻 AI 入口 / 点击频率排序
//  12) Spotlight 第三批：MC 速查卡（版本→Java 即答）/ 复制链接 / 搜索历史（落账·回填·清除）
//  13) Spotlight 第四批：计算器即答 / 关键词高亮 / 空态热门词+猜你想去 / 评论与笔记源 /
//      Modrinth（deferred 常驻 chip 显式触发 + 外链新标签）/ @与# 前缀指令
//
// ⚠️ Playwright 的 page.route 按「注册逆序」匹配：catch-all 必须最先注册。
// 全程 mock 后端（返回空数组），所以只有「本地索引」来源会出结果 —— 这正是要测的那部分。

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

const panelOpen = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.global-search');
    return !!el && el.getBoundingClientRect().height > 0;
  });

const groupTitles = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.gs-group-title')].map((e) => e.textContent.trim()),
  );

const withPage = async (
  fn,
  { viewport = { width: 1440, height: 900 }, reducedMotion, permissions } = {},
) => {
  const context = await browser.newContext({
    viewport,
    ...(reducedMotion ? { reducedMotion } : {}),
  });
  if (permissions?.length) await context.grantPermissions(permissions);
  await context.addInitScript(() => {
    // 跳过首页开场画（localStorage + 24h 窗，dev 无构建指纹后缀）。
    // 开场画在场时搜索按设计不响应（fixed 覆盖层 + 锁滚动会层叠错位），此处必须跳过。
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
  check('① 导航栏存在搜索入口', (await page.locator('.nav-search-btn').count()) > 0);

  const surfaceRest = await page.evaluate(
    () => document.querySelector('.unified-nav-surface')?.getBoundingClientRect().height || 0,
  );

  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  check('② 点击后搜索面板展开', await panelOpen(page));

  const surfaceOpen = await page.evaluate(
    () => document.querySelector('.unified-nav-surface')?.getBoundingClientRect().height || 0,
  );
  check(
    '③ surface 高度被撑开（> 静止高度）',
    surfaceOpen > surfaceRest + 60,
    `rest=${surfaceRest} open=${surfaceOpen}`,
  );

  check(
    '④ 输入框自动聚焦',
    await page.evaluate(() => document.activeElement?.classList?.contains('gs-input') === true),
  );

  // ---- 本地索引搜索 ----
  await page.locator('.gs-input').fill('教程');
  await page.waitForTimeout(800);
  const titles = await groupTitles(page);
  check('⑤ 输入「教程」出结果组', titles.length > 0, JSON.stringify(titles));
  check('⑥ 命中「教程」组（本地索引）', titles.includes('教程'), JSON.stringify(titles));

  const perGroup = await page.evaluate(() =>
    [...document.querySelectorAll('.gs-group')].map((g) => ({
      title: g.querySelector('.gs-group-title')?.textContent.trim() || '',
      hits: g.querySelectorAll('.gs-hit').length,
    })),
  );
  check(
    '⑦ 「全部」视图每组 ≤3 条',
    perGroup.every((g) => g.hits <= 3 && g.hits > 0),
    JSON.stringify(perGroup),
  );

  const chipCount = await page.locator('.gs-chip').count();
  check('⑧ 有类型 chip（含「全部」）', chipCount > 1, `chips=${chipCount}`);

  // ---- 切组：只展示该组 ----
  await page.locator('.gs-chip', { hasText: '教程' }).first().click();
  await page.waitForTimeout(700);
  const soloTitles = await groupTitles(page);
  check(
    '⑨ 切到「教程」组后只展示该组',
    soloTitles.length === 1 && soloTitles[0] === '教程',
    JSON.stringify(soloTitles),
  );

  // ---- 点结果 → 跳转 + 关闭 ----
  await page.locator('.gs-hit').first().click();
  await page.waitForTimeout(1000);
  const hash = await page.evaluate(() => location.hash);
  check('⑩ 点教程结果跳到资源中心', hash.startsWith('#/download'), hash);
  check('⑪ 跳转后面板自动关闭', (await panelOpen(page)) === false);

  // ---- 键盘导航 ----
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(400);
  await page.locator('.gs-input').fill('光影');
  await page.waitForTimeout(800);
  const firstActive = await page.evaluate(
    () => document.querySelector('.gs-hit.active')?.textContent || '',
  );
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const secondActive = await page.evaluate(
    () => document.querySelector('.gs-hit.active')?.textContent || '',
  );
  check(
    '⑫ ↓ 键在同一结果集内切换选中项',
    Boolean(firstActive) && secondActive !== firstActive,
    `${firstActive.slice(0, 18)} → ${secondActive.slice(0, 18)}`,
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  check('⑬ Esc 关闭面板', (await panelOpen(page)) === false);

  // ---- ⌘K / Ctrl+K ----
  // ⚠️ 用 DOM 派发而不是 page.keyboard.press('Meta+k')：macOS 上 Cmd+K 是 Chrome 的
  // 「地址栏搜索」浏览器级快捷键，会被浏览器抢先吃掉，页面根本收不到这个 keydown
  // （实测 page.keyboard.press('Meta+k') 恒失败）。这里要测的是自家 handler 的分支逻辑，
  // 所以直接派发等价事件。
  // ---- 快捷键 `/` ----
  // ⚠️ 用 DOM 派发而不是 page.keyboard.press：macOS 上带修饰键的组合会被浏览器抢先处理。
  // 快捷键选 `/` 而不是 ⌘K —— 后者已被 BOH AI 岛占用（useGlobalAiPreferences 默认
  // shortcut='mod+k'，App.vue 全局监听唤起 AI 岛，且不判 shiftKey；两边都在 window 上，
  // preventDefault 挡不住对方）。见 useGlobalSearch.js 的注释。
  const pressSearchShortcut = () =>
    page.evaluate(() => {
      const evt = new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(evt);
      // defaultPrevented = 自家 handler 确实收到并处理了（handler 内会 preventDefault）
      return evt.defaultPrevented;
    });

  const handled = await pressSearchShortcut();
  await page.waitForTimeout(450);
  const shortcutDiag = await page.evaluate(() => {
    const host = document.querySelector('.island-custom-host');
    const btn = document.querySelector('.nav-search-btn');
    const surface = document.querySelector('.unified-nav-surface');
    return {
      hash: location.hash,
      homeGate: !!document.querySelector('.home-gate'),
      navCount: document.querySelectorAll('#unified-nav-container').length,
      // 按钮的 .active 直接反映 isSearchOpen（逻辑开关），可与 DOM 可见性对照
      btnActive: btn ? btn.classList.contains('active') : null,
      hostExists: !!host,
      hostDisplay: host ? getComputedStyle(host).display : '',
      hostH: host ? Math.round(host.getBoundingClientRect().height) : 0,
      innerSearch: !!document.querySelector('.global-search'),
      innerH: Math.round(
        document.querySelector('.global-search')?.getBoundingClientRect().height || 0,
      ),
      surfaceCls: surface ? surface.className : '',
      hasTaskCard: !!document.querySelector('.global-nav-task-card'),
      hasStatusCard: !!document.querySelector('.global-nav-status-card'),
      hasBohaiIsland: surface ? surface.classList.contains('has-bohai-island') : null,
    };
  });
  check(
    '⑭ / 键打开面板',
    await panelOpen(page),
    `handler 收到事件=${handled} ${JSON.stringify(shortcutDiag)}`,
  );
  await pressSearchShortcut();
  await page.waitForTimeout(450);
  check('⑮ / 键再按一次关闭', (await panelOpen(page)) === false);

  // 守卫：⌘K 必须留给 BOH AI 岛。若将来有人给搜索也挂上 ⌘K，两边会互相顶掉
  // （搜索面板刚开就被 AI 岛以 has-bohai-island 盖住、custom 槽位让位），这条立刻变红。
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    );
  });
  await page.waitForTimeout(600);
  check('⑮b ⌘K 不打开搜索面板（该键归 BOH AI 岛）', (await panelOpen(page)) === false);

  // ---- 点外部关闭 ----
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(450);
  await page.mouse.click(24, 760);
  await page.waitForTimeout(450);
  check('⑯ 点面板外部关闭', (await panelOpen(page)) === false);

  // ---- ⚠️ 仲裁 ----
  // 注意两个对手的性质不同：
  //   · 通知岛：custom 槽位的 v-show（`!isTaskCardShown && !isBohaiIslandOpen`）**不看它**，
  //     所以它本来就不会挡住面板 —— preempt 对它的作用是「清掉通知卡与队列」，
  //     否则面板打开后队列里的下一条会冒出来盖住面板。判据是「通知卡被清掉」。
  //   · AI 岛 / 任务岛：优先级高于 custom 槽位，会让面板 v-show 让位隐藏 —— 必须主动收起。
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('boh_global_nav_status', {
        detail: { title: '仲裁测试通知', message: '占位中' },
      }),
    );
  });
  await page.waitForTimeout(600);
  const notifyShown =
    (await page.evaluate(() => document.querySelectorAll('.global-nav-status-card').length)) > 0;
  check('⑰ 通知岛已展示（仲裁前置条件）', notifyShown);

  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(700);
  check('⑱ 通知岛在场时搜索面板可见', await panelOpen(page));
  const notifyCleared =
    (await page.evaluate(() => document.querySelectorAll('.global-nav-status-card').length)) === 0;
  // ⚠️ 必须带上前置条件：只判「现在没有通知卡」的话，通知卡压根没出现过时也会假通过 ——
  // 那样这条就守不住 preempt（反证实测过：停用 preempt 时它会假绿）。
  check(
    '⑱b preempt 清掉了通知卡（队列不会在面板打开后冒出来盖住它）',
    notifyShown && notifyCleared,
    `shown=${notifyShown} cleared=${notifyCleared}`,
  );

  // 收起面板，进入 AI 岛场景
  await page.mouse.click(24, 760);
  await page.waitForTimeout(450);

  // AI 岛：⌘K 是它的既有快捷键（见 useGlobalAiPreferences）
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    );
  });
  await page.waitForTimeout(800);
  check(
    '⑱c AI 岛已被唤起（仲裁前置条件）',
    await page.evaluate(
      () =>
        !!document.querySelector('.unified-nav-surface')?.classList.contains('has-bohai-island'),
    ),
  );

  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(800);
  check('⑱d AI 岛在场时搜索面板仍可见（AI 岛已让位给搜索）', await panelOpen(page));

  check('⑲ 组 1 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 180));
});

// ============================================================
// 组 2：竖屏 mini 形态
// ============================================================
await withPage(
  async (page) => {
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => {
      const btn = document.querySelector('.nav-search-btn');
      const surface = document.querySelector('.unified-nav-surface');
      return {
        btnExists: !!btn,
        btnDisplay: btn ? getComputedStyle(btn).display : '',
        miniCaps: surface?.classList.contains('nav-mini-caps') || false,
        expanded: surface?.classList.contains('nav-expanded') || false,
      };
    });
    check('⑳ 竖屏进入 mini 胶囊形态', state.miniCaps && !state.expanded, JSON.stringify(state));
    check(
      '㉑ mini 未展开态隐藏搜索按钮（不撑爆胶囊）',
      state.btnExists && state.btnDisplay === 'none',
      JSON.stringify(state),
    );
  },
  { viewport: { width: 375, height: 812 } },
);

// ============================================================
// 组 3：hideNavbar 路由
// ============================================================
await withPage(async (page) => {
  await page.evaluate(() => {
    location.hash = '#/profile/probe-user';
  });
  await page.waitForTimeout(2000);
  const noHost = await page.evaluate(
    () => !document.querySelector('#unified-nav-container .nav-search-btn'),
  );
  check('㉒ hideNavbar 路由下没有搜索入口（无导航宿主）', noHost);

  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(500);
  check('㉓ hideNavbar 路由下 ⌘K 不打开面板', (await panelOpen(page)) === false);
});

// ============================================================
// 组 4：暗色
// ============================================================
await withPage(async (page) => {
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.querySelector('#unified-nav-container')?.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(300);
  const bg = await page.evaluate(
    () => getComputedStyle(document.querySelector('.gs-bar')).backgroundColor,
  );
  // 暗色态是「白色低透明度叠色」（叠在暗色 surface 上呈现暗面），不是深色实底，
  // 所以判据是 alpha 低，不是 R 值小。
  const alpha = parseFloat(String(bg).split(',').pop() || '1') || 0;
  const darkDiag = await page.evaluate(() => {
    const found = [];
    for (const sheet of document.styleSheets) {
      let list;
      try {
        list = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of list) {
        const text = rule.cssText || '';
        if (text.includes('gs-bar') && text.includes('dark')) found.push(text.slice(0, 180));
      }
    }
    return found;
  });
  check(
    '㉔ 暗色下面板底色为低透明叠色（alpha < 0.2）',
    alpha < 0.2,
    `${bg} rules=${JSON.stringify(darkDiag)}`,
  );
});

// ============================================================
// 组 5：布局稳定 —— 岛展开与出结果都不得推动页面内容
// （2026-09-27 用户实测「侧边栏被岛带着向下避让」：--userspace-nav-h 曾吃
//   岛展开后的总高度，内容区被推下去 200px+。修复 = Home/index.vue 与
//   UserSpaceMain.vue 的上报高度钳制到 container 的 min-height（收起态）。）
// ============================================================
await withPage(async (page, errs) => {
  const layoutBefore = await page.evaluate(() => ({
    mainTop: Math.round(document.querySelector('main')?.getBoundingClientRect().top ?? -1),
    stageH: Math.round(
      document.querySelector('.home-forum-stage')?.getBoundingClientRect().height ?? -1,
    ),
  }));

  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(900);
  await page.locator('.gs-input').fill('教程');
  await page.waitForTimeout(900);

  const layoutAfter = await page.evaluate(() => ({
    mainTop: Math.round(document.querySelector('main')?.getBoundingClientRect().top ?? -1),
    stageH: Math.round(
      document.querySelector('.home-forum-stage')?.getBoundingClientRect().height ?? -1,
    ),
  }));
  check(
    '㉕ 岛展开与出结果都不推页面内容（避让钳制在收起态）',
    Math.abs(layoutAfter.mainTop - layoutBefore.mainTop) <= 2 &&
      Math.abs(layoutAfter.stageH - layoutBefore.stageH) <= 2,
    JSON.stringify({ before: layoutBefore, after: layoutAfter }),
  );

  check('㉖ 组 5 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
});

// ============================================================
// 组 6：Spotlight 式优化 —— 动作搜索 / Alt+数字切类型 / 常驻 AI 入口 / 频率排序
// ============================================================
await withPage(async (page, errs) => {
  // ---- 动作搜索：命中 + 执行（主题切换实测，不 mock、走真 themeManager）----
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  await page.locator('.gs-input').fill('深色');
  await page.waitForTimeout(600);

  const actionHit = await page.evaluate(() => {
    const titles = [...document.querySelectorAll('.gs-hit-title')].map((e) => e.textContent.trim());
    const badges = [...document.querySelectorAll('.gs-hit-badge')].map((e) => e.textContent.trim());
    return { titles, hasActionGroup: badges.includes('动作') };
  });
  check(
    '㉗ 动作搜索命中（「深色」→ 切换到深色模式，badge=动作）',
    actionHit.hasActionGroup && actionHit.titles.some((t) => t.includes('切换到深色模式')),
    JSON.stringify(actionHit),
  );

  const themeBefore = await page.evaluate(() =>
    document.getElementById('unified-nav-container')?.getAttribute('data-theme'),
  );
  await page.locator('.gs-hit').first().click(); // 动作组排最前，第一条就是主题切换
  await page.waitForTimeout(700);
  const themeAfter = await page.evaluate(() => ({
    theme: document.getElementById('unified-nav-container')?.getAttribute('data-theme'),
    panelOpen: !!document.querySelector('.global-search'),
  }));
  check(
    '㉘ 动作执行：面板关闭且主题真实翻转',
    themeAfter.theme !== themeBefore && !themeAfter.panelOpen,
    `before=${themeBefore} after=${JSON.stringify(themeAfter)}`,
  );

  // ---- Alt+数字切类型（浏览器把 Cmd/Ctrl+数字保留给切标签页，故用 Alt）----
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  await page.locator('.gs-input').fill('教程');
  await page.waitForTimeout(800);
  const chipLabels = await page.evaluate(() =>
    [...document.querySelectorAll('.gs-chip')].map((e) => e.textContent.trim()),
  );
  check(
    '㉙a chip 就位（≥2 个，含「全部」）',
    chipLabels.length >= 2 && chipLabels[0].startsWith('全部'),
    JSON.stringify(chipLabels),
  );

  await page.locator('.gs-input').press('Alt+2');
  await page.waitForTimeout(400);
  const afterAlt = await page.evaluate(() => ({
    active: document.querySelector('.gs-chip.active')?.textContent.trim() || '',
    groupCount: document.querySelectorAll('.gs-group').length,
  }));
  check(
    '㉙b Alt+2 切到第 2 个 chip（单组展示）',
    afterAlt.active.startsWith('教程') && afterAlt.groupCount === 1,
    JSON.stringify(afterAlt),
  );

  // ---- 常驻 AI 入口：有词就在；点击 → 面板关 + AI 岛开 + 点击频率落库 ----
  check(
    '㉚a AI 常驻入口存在且带搜索词',
    await page.evaluate(() => {
      const el = document.querySelector('.gs-ai');
      return !!el && el.textContent.includes('教程');
    }),
  );
  await page.locator('.gs-ai').click();
  await page.waitForTimeout(800);
  const afterAi = await page.evaluate(() => ({
    panelOpen: !!document.querySelector('.global-search'),
    bohaiOpen:
      document.querySelector('.unified-nav-surface')?.className.includes('has-bohai-island') ||
      false,
    clicks: localStorage.getItem('boh-site-search-source-clicks') || '',
  }));
  check(
    '㉚b 点 AI 入口：面板关、AI 岛开、点击频率已记录',
    !afterAi.panelOpen && afterAi.bohaiOpen && afterAi.clicks.includes('ai'),
    JSON.stringify(afterAi),
  );

  // ---- 频率排序：命中的来源（教程）下一轮排到最前 ----
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  await page.locator('.gs-input').fill('教程');
  await page.waitForTimeout(800);
  const firstGroup = await page.evaluate(
    () => document.querySelector('.gs-group-title')?.textContent.trim() || '',
  );
  check('㉚c 频率排序：点击过的「教程」组排最前', firstGroup === '教程', `first=${firstGroup}`);

  check('㉛ 组 6 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
});

// ============================================================
// 组 7：Spotlight 第三批 —— MC 速查卡 / 复制链接 / 搜索历史
// ============================================================
await withPage(
  async (page, errs) => {
    // ---- MC 速查卡：版本号 → Java 环境即答 ----
    await page.locator('.nav-search-btn').click();
    await page.waitForTimeout(500);
    await page.locator('.gs-input').fill('1.20.4 需要什么 java');
    await page.waitForTimeout(700);
    const answer1 = await page.evaluate(() => {
      const group = [...document.querySelectorAll('.gs-group')].find(
        (g) => g.querySelector('.gs-group-title')?.textContent.trim() === '速查',
      );
      return {
        present: !!group,
        title: group?.querySelector('.gs-hit-title')?.textContent.trim() || '',
      };
    });
    check(
      '㉜a MC 速查卡：1.20.4 → Java 17',
      answer1.present && answer1.title.includes('Java 17'),
      JSON.stringify(answer1),
    );

    await page.locator('.gs-input').fill('1.21');
    await page.waitForTimeout(700);
    const answer2 = await page.evaluate(() => {
      const group = [...document.querySelectorAll('.gs-group')].find(
        (g) => g.querySelector('.gs-group-title')?.textContent.trim() === '速查',
      );
      return group?.querySelector('.gs-hit-title')?.textContent.trim() || '';
    });
    check('㉜b 边界正确：1.21 → Java 21', answer2.includes('Java 21'), answer2);

    // ---- 复制链接：悬停浮现 → 点击 → 剪贴板内容 = origin/#/route ----
    // ⚠️ 用「Frp」定位唯一命中（q12 樱花联机教程）：「教程」会命中正文、首条不是 q1，
    // 断言路由会漂；Frp 只在 q12 出现，route 恒为 /download#q12。
    await page.locator('.gs-input').fill('Frp');
    await page.waitForTimeout(800);
    await page.locator('.gs-hit').first().hover();
    await page.waitForTimeout(300);
    await page.locator('.gs-hit-copy').first().click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const copyState = await page.evaluate(() =>
      document.querySelector('.gs-hit-copy')?.textContent.trim(),
    );
    check(
      '㉝a 复制链接：剪贴板 = origin/#/route',
      clip === `${BASE}/#/download#q12`,
      `clip=${clip}`,
    );
    check('㉝b 复制后按钮反馈「已复制」', copyState?.includes('已复制') === true, copyState);

    // ---- 搜索历史：点结果落账 → 空态展示 → 回填 → 清除 ----
    await page.locator('.gs-input').fill('教程'); // 复制测试用的 Frp 不入账，历史记「教程」
    await page.waitForTimeout(800);
    await page.locator('.gs-hit').first().click(); // 打开一条结果（会跳 /download 并关面板）
    await page.waitForTimeout(900);
    const afterOpen = await page.evaluate(() => ({
      panelOpen: !!document.querySelector('.global-search'),
      history: JSON.parse(localStorage.getItem('boh-site-search-history') || '[]'),
    }));
    check(
      '㉞a 点结果落账历史且面板关闭',
      !afterOpen.panelOpen && afterOpen.history.includes('教程'),
      JSON.stringify(afterOpen),
    );

    await page.evaluate(() => {
      location.hash = '#/';
    });
    await page.waitForTimeout(900);
    await page.locator('.nav-search-btn').click();
    await page.waitForTimeout(500);
    const historyBlock = await page.evaluate(() => {
      const block = document.querySelector('.gs-history');
      return {
        present: !!block,
        items: [...(block?.querySelectorAll('.gs-history-item') || [])].map((e) =>
          e.textContent.trim(),
        ),
      };
    });
    check(
      '㉞b 空态展示「最近搜索」且含「教程」',
      historyBlock.present && historyBlock.items.includes('教程'),
      JSON.stringify(historyBlock),
    );

    await page.locator('.gs-history-item', { hasText: '教程' }).first().click();
    await page.waitForTimeout(800);
    const refilled = await page.evaluate(() => ({
      value: document.querySelector('.gs-input')?.value || '',
      groups: [...document.querySelectorAll('.gs-group-title')].map((e) => e.textContent.trim()),
    }));
    check(
      '㉞c 点历史条目回填并出结果',
      refilled.value === '教程' && refilled.groups.includes('教程'),
      JSON.stringify(refilled),
    );

    // 清历史前先回到空态（㉞c 已回填 query，历史块只在空态渲染）
    await page.locator('.gs-clear').click();
    await page.waitForTimeout(400);
    // 清除按钮在「最近搜索」块内 —— 热门词/猜你想去复用 .gs-history 类，须按头文字定位
    await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.gs-history')];
      const block = blocks.find(
        (b) => b.querySelector('.gs-group-title')?.textContent.trim() === '最近搜索',
      );
      block?.querySelector('.gs-history-clear')?.click();
    });
    await page.waitForTimeout(300);
    const cleared = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.gs-history')];
      const historyBlock = blocks.find(
        (b) => b.querySelector('.gs-group-title')?.textContent.trim() === '最近搜索',
      );
      return {
        historyBlock: !!historyBlock,
        stored: localStorage.getItem('boh-site-search-history'),
      };
    });
    check(
      '㉞d 清除历史：块消失且 localStorage 清空',
      !cleared.historyBlock && cleared.stored === null,
      JSON.stringify(cleared),
    );

    check('㉟ 组 7 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
  },
  { permissions: ['clipboard-read', 'clipboard-write'] },
);

// ============================================================
// 组 8：Spotlight 第四批 —— 计算器即答 / 关键词高亮 / 空态推荐 / 评论源 / Modrinth 外链 / 前缀指令
// ============================================================
await withPage(async (page, errs) => {
  // 针对性 mock：注册晚于 catch-all → 按「逆序匹配」优先生效
  await page.route('**/rest/v1/comments*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Expose-Headers': 'Content-Range', 'content-range': '0-1/1' },
      body: JSON.stringify([
        {
          id: 'c-1',
          post_id: 'post-9',
          content: '周末一起联机呀',
          author_username: 'tester',
          created_at: '2026-09-27T10:00:00Z',
        },
      ]),
    }),
  );
  await page.route('**/api.modrinth.com/v2/search*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hits: [
          {
            project_id: 'p1',
            title: 'OptiFine',
            description: '性能优化与画质增强',
            author: 'sp614x',
            project_type: 'mod',
            slug: 'optifine',
            downloads: 123456,
          },
        ],
        total_hits: 1,
      }),
    }),
  );

  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);

  // ---- 计算器即答 ----
  await page.locator('.gs-input').fill('25*4+10');
  await page.waitForTimeout(600);
  const calcTitle = await page.evaluate(() => {
    const group = [...document.querySelectorAll('.gs-group')].find(
      (g) => g.querySelector('.gs-group-title')?.textContent.trim() === '速查',
    );
    return group?.querySelector('.gs-hit-title')?.textContent.trim() || '';
  });
  check('㊱ 计算器即答：25*4+10 = 110', calcTitle.includes('= 110'), calcTitle);

  // ---- 关键词高亮：本地来源 excerpt 的 [[..]] 标记渲染成 <mark> ----
  await page.locator('.gs-input').fill('教程');
  await page.waitForTimeout(800);
  const marks = await page.evaluate(() =>
    [...document.querySelectorAll('.gs-mark')].map((e) => e.textContent.trim()),
  );
  check(
    '㊲ 关键词高亮：excerpt 命中处渲染 <mark>',
    marks.length > 0 && marks.every((t) => t.includes('教程')),
    JSON.stringify(marks.slice(0, 4)),
  );

  // ---- 空态推荐：热门词 + 猜你想去 ----
  await page.locator('.gs-clear').click();
  await page.waitForTimeout(400);
  const emptyState = await page.evaluate(() => {
    const countItems = (headText) => {
      const block = [...document.querySelectorAll('.gs-history')].find(
        (b) => b.querySelector('.gs-group-title')?.textContent.trim() === headText,
      );
      return block ? block.querySelectorAll('.gs-history-item').length : 0;
    };
    return {
      hotCount: countItems('热门搜索'),
      guessCount: countItems('猜你想去'),
      chipsRow: !!document.querySelector('.gs-chips'),
    };
  });
  check('㊳a 空态热门词渲染（5 个）', emptyState.hotCount === 5, `hot=${emptyState.hotCount}`);
  check(
    '㊳b 空态猜你想去渲染（兜底 3 个入口）',
    emptyState.guessCount === 3,
    `guess=${emptyState.guessCount}`,
  );
  check('㊳c 空态不渲染 chip 行（有词才出）', !emptyState.chipsRow);

  // ---- 评论源（mock comments 表返回一行）----
  await page.locator('.gs-input').fill('联机');
  await page.waitForTimeout(800);
  const commentHit = await page.evaluate(() => {
    const group = [...document.querySelectorAll('.gs-group')].find(
      (g) => g.querySelector('.gs-group-title')?.textContent.trim() === '评论',
    );
    return group ? group.querySelector('.gs-hit-title')?.textContent.trim() || '' : '';
  });
  check('㊴ 评论源命中（mock 行 + 高亮）', commentHit.includes('联机'), commentHit);

  // ---- Modrinth：deferred chip 常驻可点 → 显式触发 → 外链新标签 ----
  const modChip = page.locator('.gs-chip', { hasText: 'Mod 资源' });
  check('㊵a Modrinth chip 常驻（deferred 显式触发入口）', (await modChip.count()) > 0);
  await modChip.click();
  await page.waitForTimeout(900);
  const modGroup = await page.evaluate(() => {
    const group = [...document.querySelectorAll('.gs-group')].find(
      (g) => g.querySelector('.gs-group-title')?.textContent.trim() === 'Mod 资源',
    );
    return group ? group.querySelector('.gs-hit-title')?.textContent.trim() || '' : '';
  });
  check('㊵b 点 chip 触发 Modrinth 查询', modGroup.includes('OptiFine'), modGroup);

  const popupPromise = page
    .context()
    .waitForEvent('page', { timeout: 8000 })
    .catch(() => null);
  await page.locator('.gs-hit').first().click();
  const popup = await popupPromise;
  const popupUrl = popup ? popup.url() : '';
  check('㊵c 外链新标签打开 modrinth.com', popupUrl.includes('modrinth.com'), popupUrl);
  if (popup) await popup.close();

  // ---- 前缀指令：#教程 联机 → 只搜教程组 ----
  await page.locator('.nav-search-btn').click();
  await page.waitForTimeout(500);
  await page.locator('.gs-input').fill('#教程 联机');
  await page.waitForTimeout(800);
  const scoped = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('.gs-group-title')].map((e) => e.textContent.trim()),
  }));
  check(
    '㊶ 前缀指令 #教程：只搜对应来源（无评论/用户组）',
    scoped.groups.includes('教程') &&
      !scoped.groups.includes('评论') &&
      !scoped.groups.includes('用户'),
    JSON.stringify(scoped),
  );

  check('㊷ 组 8 零 pageerror', errs.length === 0, errs.join(' | ').slice(0, 160));
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
