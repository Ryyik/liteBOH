import { chromium } from 'playwright';

// 探针：BohIsland —— 搜索 + 「问一句」独立悬浮岛（plans/038 P1）
//   1) `/` 与导航栏按钮召唤的是同一颗岛（同一 DOM 根，全局仅一个 .boh-island-root）
//   2) 输入条 top 恒定：空态 → 出结果，.gs-bar top 差值 ≤ 1px（本方案唯一的硬视觉契约）
//   3) 默认高亮两档（§3.2，缺一即假绿）：
//        非问句 + 有结果 → 第一个搜索结果；问句 / 零结果 → 第 0 项「问 BOHAI」
//   4) 零结果文案「站内没找到，问一下 BOHAI」
//   5) ⌘↵ 强制问 AI（岛关、旧 AI 岛开）
//   6) 键盘：注入 --kb-inset 后卡片底边 ≤ 视口 − 键盘高（卡片消费键盘真源）
//   7) 竖屏：常驻胶囊可见、点击展开
//   8) 无导航栏路由（hideNavbar）上 `/` 仍可召唤 —— Teleport 的存在理由
//   9) 深色岛材质：根节点恒 data-theme=dark，面板底色为低透明叠色
//  10) 零 pageerror

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

const withPage = async (fn, { viewport = { width: 1440, height: 900 } } = {}) => {
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

  // ---- 键盘真源：注入 --kb-inset 后卡片底边让位（放在 ⌘↵ 之前 —— 旧 AI 岛的
  //      输入框若在焦点上会吞掉 `/` 的输入态豁免，污染后续步骤）----
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

  // ---- ⌘↵ 强制问 AI（放组尾：会唤起旧 AI 岛并占据输入焦点）----
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
  await page.waitForTimeout(900);
  const afterCmd = await page.evaluate(() => ({
    islandOpen: !!document.querySelector('.boh-island-root')?.classList.contains('open'),
    oldAiOpen:
      document.querySelector('.unified-nav-surface')?.className.includes('has-bohai-island') ||
      false,
  }));
  check(
    '⑩ ⌘↵ 强制问 AI：岛关、AI 岛开',
    !afterCmd.islandOpen && afterCmd.oldAiOpen,
    JSON.stringify(afterCmd),
  );

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
