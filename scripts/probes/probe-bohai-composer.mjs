/**
 * probe-bohai-composer.mjs — BOH AI 输入区（composer）新面板探针
 *
 * 背景：2026-09-30 夜～10-01 把输入区从「上下文环 + 三个平铺组 + 就地模式浮层」
 * 改成「38px 双环圆钮 + 用量浮层 + 三行面板（模式 › / 推理强度 › / 分隔 / 高级 ⌃）
 * + 左右二级菜单」，胶囊文案改「模式名 · 强度」。本探针锁住这次改版的交互契约。
 *
 * 覆盖两种现存形态（第三种「用户空间内嵌 / ai-tab」已随底栏收席一并下线 ——
 *   UserSpace 的 AsyncBOHAI 已是零引用死导出，`ai-tab` 只剩 CSS，故不设场景）：
 *   A. 独立页  /#/ai-chat        —— 全量交互断言
 *   B. AI 岛   BOHAIIsland       —— 岛内面板是否被 overflow 裁切
 *
 * 用法（dev server 需在 5173；脚本自带登录注入，不需要真账号）：
 *   node scripts/probes/probe-bohai-composer.mjs
 *   BASE=http://[::1]:5173 node scripts/probes/probe-bohai-composer.mjs
 *
 * 断言清单
 *   A1 底行胶囊渲染（模式名 + 强度两段）
 *   A2 点胶囊 → 面板可见，且三行（模式 / 推理强度 / 高级）齐全
 *   A3 模式二级菜单向左弹出，与主面板不重叠
 *   A4 推理强度二级菜单向右弹出，与主面板不重叠
 *   A5 选完推理强度 → **整个面板收起**（2026-10-01 用户拍板与 selectMode 对齐）
 *   A6 选完模式 → 面板收起 + 胶囊文案跟着换
 *   A7 「高级」区四个工具都在（社区搜索 / 个人 Cloud+ / 健康分析 / 心理分析）
 *   A8 零 pageerror
 *   A9 零「模板引用未定义绑定」的 Vue 警告
 *   A10 用量圆钮单环（1 轨 1 进度，2026-10-02 双环改单环，内环已删）+ 额度 88% 时挂 quota-warn
 *   A11 hover 圆钮 → 用量浮层打开（mouseenter 挂在 .usage-orb-wrap 上）
 *   A12 浮层同时含「对话上下文」「今日额度」两行
 *   A13 移开鼠标 → 浮层 180ms 延迟收起
 *   （A10-A13 依赖发送一条消息触发 orb 渲染；模型与 quota-status 均被 mock）
 *   B1 ⌘K（真实快捷键，走 App.vue 的 handleGlobalAiKeydown）→ AI 岛展开
 *   B2 岛内渲染出 composer 胶囊
 *   B3 岛内打开面板后，面板与二级菜单都完整落在视口内（没被岛的 overflow:hidden 裁掉）
 *
 * 反证（必须做，否则不算自证）：
 *   把 `selectThinkingSpeed` 改回「只收二级菜单」（composerSubOpen.value = ''），
 *   A5 必红；把 BOHAIIsland 的紧凑面板覆盖加回去，B3 的位置读数会变 —— 两侧都要能红。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || 'debug-screenshots';

const PROBE_UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 220) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const SEL = {
  trigger: '.composer-panel-trigger',
  triggerLabel: '.composer-panel-trigger-label',
  triggerEffort: '.composer-panel-trigger-effort',
  panel: '.composer-panel',
  row: '.composer-panel-row',
  rowKey: '.composer-panel-row-key',
  adv: '.composer-panel-row.is-adv',
  advBox: '.composer-panel-adv',
  tool: '.composer-panel-tool',
  subLeft: '.composer-submenu.is-left',
  subRight: '.composer-submenu.is-right',
  subItem: '.composer-submenu-item',
  island: '.bohai-island',
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user', id: uid });
  }, PROBE_UID);
  await page.waitForTimeout(600);
};

/** 面板/子菜单都是 v-show，必须看 computed display，不能只看元素在不在 */
const rectOf = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  if (getComputedStyle(el).display === 'none') return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
           right: Math.round(r.right), bottom: Math.round(r.bottom) };
})()`;

const openPanel = async (page, scope = '') => {
  await page.locator(`${scope} ${SEL.trigger}`.trim()).first().click();
  await page.waitForTimeout(280);
};

/**
 * 只把**未捕获异常**当红。console.error 里有稳定的探针噪声：伪造登录后
 * `get_unread_notification_count` 一定回 P0001「用户未认证」、以及若干 4xx 资源加载失败，
 * 那是探针自己没带真 token 造成的，跟被测交互无关。
 */
const newPage = async (ctx, bucket) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bucket.errors.push(`pageerror: ${String(e).slice(0, 180)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') bucket.console.push(m.text().slice(0, 180));
    // ⚠️ Vue 对「模板里用了 setup 作用域中不存在的绑定」只发 warning、不抛错，
    // 渲染出来是 `undefined || 兜底值` —— 静默、肉眼难发现。2026-10-01 就靠这条抓到
    // BOHAIMain 漏解构 currentThinkingSpeed（胶囊强度段永远显示「中」）。
    if (
      m.type() === 'warning' &&
      /is not defined on instance|accessed during render/i.test(m.text())
    ) {
      bucket.vueWarn.push(m.text().slice(0, 180));
    }
  });
  return page;
};

// ===================== 场景 A：独立页 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const errors = { errors: [], console: [], vueWarn: [] };
  const page = await newPage(ctx, errors);

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector(SEL.trigger, { timeout: 20000 });

  // A1 胶囊两段
  const pill = await page.evaluate((SEL) => {
    const t = document.querySelector(SEL.trigger);
    return {
      label: t?.querySelector(SEL.triggerLabel)?.textContent.trim() || '',
      effort: t?.querySelector(SEL.triggerEffort)?.textContent.trim() || '',
    };
  }, SEL);
  check('A1 底行胶囊渲染（模式名 + 强度）', !!pill.label && !!pill.effort, JSON.stringify(pill));

  // A2 面板三行
  await openPanel(page);
  const rows = await page.evaluate((SEL) => {
    const panel = document.querySelector(SEL.panel);
    if (!panel || getComputedStyle(panel).display === 'none') return null;
    return [...panel.querySelectorAll(SEL.row)].map((el) => ({
      key: el.querySelector(SEL.rowKey)?.textContent.trim() || '',
      adv: el.classList.contains('is-adv'),
    }));
  }, SEL);
  const keys = (rows || []).map((r) => r.key);
  check(
    'A2 面板三行齐全（模式 / 推理强度 / 高级）',
    keys.includes('模式') && keys.includes('推理强度') && keys.includes('高级'),
    keys.join(' / '),
  );
  const panelRect = await page.evaluate(rectOf(SEL.panel));

  // A3 模式二级菜单向左弹，不压面板
  await page.locator(`${SEL.row}:not(.is-adv)`).first().click();
  await page.waitForTimeout(260);
  const subLeftRect = await page.evaluate(rectOf(SEL.subLeft));
  check(
    'A3 模式二级菜单向左弹出且与面板不重叠',
    !!subLeftRect && !!panelRect && subLeftRect.right <= panelRect.x + 2,
    `submenu.right=${subLeftRect?.right} panel.x=${panelRect?.x}`,
  );

  // A4 推理强度二级菜单向右弹，不压面板
  await page.locator(`${SEL.row}:not(.is-adv)`).nth(1).click();
  await page.waitForTimeout(260);
  const subRightRect = await page.evaluate(rectOf(SEL.subRight));
  check(
    'A4 推理强度二级菜单向右弹出且与面板不重叠',
    !!subRightRect && !!panelRect && subRightRect.x >= panelRect.right - 2,
    `submenu.x=${subRightRect?.x} panel.right=${panelRect?.right}`,
  );

  // A5 选完推理强度 → 整个面板收起
  const effortBefore = await page.evaluate(
    (SEL) =>
      document.querySelector(SEL.trigger)?.querySelector(SEL.triggerEffort)?.textContent.trim(),
    SEL,
  );
  const effortNames = await page.evaluate(
    (SEL) =>
      [
        ...document.querySelectorAll(`${SEL.subRight} ${SEL.subItem} .composer-submenu-item-name`),
      ].map((el) => el.textContent.trim()),
    SEL,
  );
  const targetIdx = effortNames.findIndex((n) => n && n !== effortBefore);
  if (targetIdx >= 0) {
    // 用页面内 click 而不是 Playwright 的坐标点击：面板是 248px 窄浮层，
    // 坐标点击在天窗边缘偶发落到遮罩上 —— 那样会被 handleClickOutside 关掉面板，
    // 看起来「面板收起了」但推理强度其实没换。这里要测的是 selectThinkingSpeed 本身。
    await page.evaluate(
      ([sel, idx]) => {
        document.querySelectorAll(sel)[idx]?.click();
      },
      [`${SEL.subRight} ${SEL.subItem}`, targetIdx],
    );
    await page.waitForTimeout(500);
    const panelAfter = await page.evaluate(rectOf(SEL.panel));
    const subAfter = await page.evaluate(rectOf(SEL.subRight));
    const effortAfter = await page.evaluate(
      (SEL) =>
        document.querySelector(SEL.trigger)?.querySelector(SEL.triggerEffort)?.textContent.trim(),
      SEL,
    );
    const stored = await page.evaluate(() => localStorage.getItem('boh_ai_thinking_speed_v1'));
    check(
      'A5 选完推理强度 → 整个面板收起（与 selectMode 对齐）',
      !panelAfter && !subAfter && effortAfter !== effortBefore,
      `panel=${panelAfter ? 'still-open' : 'closed'} sub=${subAfter ? 'still-open' : 'closed'} ${effortBefore}→${effortAfter} ids=${effortNames.join('/')} idx=${targetIdx} stored=${stored}`,
    );
  } else {
    check(
      'A5 选完推理强度 → 整个面板收起（与 selectMode 对齐）',
      false,
      `没有与当前「${effortBefore}」不同的推理强度可选：${effortNames.join('/')}`,
    );
  }

  // A6 选完模式 → 面板收起 + 胶囊文案换
  await openPanel(page);
  const labelBefore = await page.evaluate(
    (SEL) =>
      document.querySelector(SEL.trigger)?.querySelector(SEL.triggerLabel)?.textContent.trim(),
    SEL,
  );
  await page.locator(`${SEL.row}:not(.is-adv)`).first().click();
  await page.waitForTimeout(260);
  const modeItems = page.locator(`${SEL.subLeft} ${SEL.subItem}`);
  const modeCount = await modeItems.count();
  if (modeCount > 1) {
    await modeItems.nth(1).click();
    await page.waitForTimeout(420);
    const panelAfter = await page.evaluate(rectOf(SEL.panel));
    const labelAfter = await page.evaluate(
      (SEL) =>
        document.querySelector(SEL.trigger)?.querySelector(SEL.triggerLabel)?.textContent.trim(),
      SEL,
    );
    check(
      'A6 选完模式 → 面板收起 + 胶囊文案更新',
      !panelAfter && labelAfter !== labelBefore,
      `${labelBefore}→${labelAfter}`,
    );
  } else {
    check(
      'A6 选完模式 → 面板收起 + 胶囊文案更新',
      false,
      `模式选项只有 ${modeCount} 个，无法测切换`,
    );
  }

  // A7 高级区四个工具
  await openPanel(page);
  await page.locator(SEL.adv).first().click();
  await page.waitForTimeout(240);
  const toolNames = await page.evaluate(
    (SEL) =>
      [...document.querySelectorAll(SEL.tool)].map(
        (el) => el.querySelector('strong')?.textContent.trim() || '',
      ),
    SEL,
  );
  const wantTools = ['社区搜索', '个人 Cloud+', '健康分析', '心理分析'];
  const missing = wantTools.filter((n) => !toolNames.includes(n));
  check(
    'A7 高级区四个工具齐全',
    missing.length === 0,
    `缺 ${missing.join('/') || '无'}；实得 ${toolNames.join(' / ')}`,
  );

  await page.screenshot({ path: `${OUT}/bohai-composer-standalone.png` });
  check('A8 独立页零 pageerror', errors.errors.length === 0, errors.errors.slice(0, 3).join(' | '));
  check(
    'A9 零「模板引用未定义绑定」的 Vue 警告',
    errors.vueWarn.length === 0,
    errors.vueWarn.slice(0, 2).join(' | '),
  );
  console.log(`      （console.error ${errors.console.length} 条，探针噪声，不计红）`);

  // ── A10-A13 用量圆钮（usage-orb）─────────────────────────────────────
  // 2026-10-02 起圆钮从「双环」改「单环 = 上下文」，额度收进 hover / 点击浮层。
  // orb 只在 messages.length > 0 后渲染，所以先发一条消息；模型调用与 quota-status
  // 一并 mock（伪造登录没有真 token，线上调用必然 401，等它超时太慢）。
  // 额度 mock 成 88000/100000 = 88%：顺带让 quota-warn（≥85%）真实在场。
  await page.route('**/functions/v1/api-key-vault**', async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() || {};
    } catch {
      body = {};
    }
    if (body?.action === 'quota-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { usedTokens: 88000, tokenLimit: 100000, webSearchUsed: 3, webSearchLimit: 10 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, message: '探针环境不调用真实模型' }),
    });
  });
  await page.fill('.input-textarea', '探针：验证用量圆钮');
  await page.locator('.send-btn').click();
  await page.waitForSelector('.usage-orb', { timeout: 15000 });
  // 发送后 1.5s 有一次 fetchTodayQuota（quotaRefreshTimer），等它吃到 mock 值
  await page.waitForTimeout(2200);

  // A10 单环：SVG 只有 1 轨 + 1 进度，旧内环（orb-quota）已删；额度吃紧 → quota-warn 在场
  const orbShape = await page.evaluate(() => {
    const svg = document.querySelector('.usage-orb-svg');
    const circles = svg ? [...svg.querySelectorAll('circle')] : [];
    const orb = document.querySelector('.usage-orb');
    return {
      total: circles.length,
      tracks: circles.filter((c) => c.classList.contains('orb-track')).length,
      fills: circles.filter((c) => c.classList.contains('orb-fill')).length,
      quotaLeft: circles.filter((c) => c.classList.contains('orb-quota')).length,
      warnClass: orb?.classList.contains('quota-warn') || false,
    };
  });
  check(
    'A10 用量圆钮单环（1 轨 1 进度、内环已删）且额度 88% 时挂 quota-warn',
    orbShape.total === 2 &&
      orbShape.tracks === 1 &&
      orbShape.fills === 1 &&
      orbShape.quotaLeft === 0 &&
      orbShape.warnClass,
    JSON.stringify(orbShape),
  );

  // A11 hover 打开浮层（mouseenter 挂在 .usage-orb-wrap 上，按钮与浮层共用容器）
  await page.hover('.usage-orb');
  await page.waitForTimeout(320);
  const hoverOpen = await page.evaluate(() => {
    const pop = document.querySelector('.usage-pop');
    return !!pop && getComputedStyle(pop).display !== 'none';
  });
  check('A11 hover 圆钮 → 用量浮层打开', hoverOpen, `open=${hoverOpen}`);

  // A12 浮层同时含「对话上下文」「今日额度」两行
  const popRows = await page.evaluate(() => {
    const pop = document.querySelector('.usage-pop');
    if (!pop) return null;
    return [...pop.querySelectorAll('.usage-row-label')].map((el) => el.textContent.trim());
  });
  check(
    'A12 浮层含上下文与额度两行详情',
    Array.isArray(popRows) && popRows.includes('对话上下文') && popRows.includes('今日额度'),
    (popRows || []).join(' / '),
  );

  // A13 移开鼠标 → 180ms 延迟后浮层自动收起
  await page.mouse.move(400, 300);
  await page.waitForTimeout(560);
  const hoverClosed = await page.evaluate(() => {
    const pop = document.querySelector('.usage-pop');
    return !pop || getComputedStyle(pop).display === 'none';
  });
  check('A13 移开鼠标 → 浮层延迟收起', hoverClosed, `closed=${hoverClosed}`);

  await page.unroute('**/functions/v1/api-key-vault**');
  await page.screenshot({ path: `${OUT}/bohai-usage-orb-single.png` });
  await ctx.close();
}

// ===================== 场景 B：AI 岛 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const errors = { errors: [], console: [], vueWarn: [] };
  // 跳过首页开场画（开场画在场时全局快捷键按设计不响应；与 probe-global-search 同法）
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  });
  const page = await newPage(ctx, errors);

  // 岛在「导航栏可见」的路由才开得起来，首页满足（canOpen 与 App.showGlobalNavbar 同源）
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector('#unified-nav-container', { timeout: 20000 });
  await page.waitForTimeout(1200);

  // B1 真实快捷键 ⌘K → App.vue 的 handleGlobalAiKeydown 打开 AI 岛。
  // ⚠️ 必须用 DOM 派发：macOS 上 Cmd+K 是 Chrome 的地址栏搜索，浏览器会抢先吃掉。
  const shortcutHandled = await page.evaluate(() => {
    const evt = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(evt);
    return evt.defaultPrevented;
  });
  await page.waitForSelector(SEL.island, { timeout: 15000 }).catch(() => {});
  const islandRect = await page.evaluate(rectOf(SEL.island));
  check(
    'B1 ⌘K 能展开 AI 岛',
    shortcutHandled && !!islandRect,
    `handled=${shortcutHandled} island=${JSON.stringify(islandRect)}`,
  );

  // B2 岛内 composer 胶囊
  let isTrigger = null;
  try {
    await page.waitForSelector(`${SEL.island} ${SEL.trigger}`, { timeout: 15000 });
    isTrigger = await page.evaluate(rectOf(`${SEL.island} ${SEL.trigger}`));
  } catch {
    isTrigger = null;
  }
  check('B2 岛内渲染出 composer 胶囊', !!isTrigger, JSON.stringify(isTrigger));

  // B3 岛内面板与二级菜单完整落在视口内（没被岛裁掉）
  let within = null;
  if (isTrigger) {
    await page.locator(`${SEL.island} ${SEL.trigger}`).first().click();
    await page.waitForTimeout(300);
    await page.locator(`${SEL.island} ${SEL.row}:not(.is-adv)`).first().click();
    await page.waitForTimeout(300);
    within = await page.evaluate(
      ([panelSel, subSel, islandSel]) => {
        const vis = (s) => {
          const el = document.querySelector(s);
          if (!el || getComputedStyle(el).display === 'none') return null;
          const r = el.getBoundingClientRect();
          return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            right: Math.round(r.right),
            bottom: Math.round(r.bottom),
          };
        };
        const inViewport = (r) =>
          !!r && r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        const islandEl = document.querySelector(islandSel);
        const ir = islandEl ? islandEl.getBoundingClientRect() : null;
        return {
          panel: vis(panelSel),
          sub: vis(subSel),
          panelInViewport: inViewport(vis(panelSel)),
          subInViewport: inViewport(vis(subSel)),
          islandTop: ir ? Math.round(ir.top) : null,
        };
      },
      [SEL.panel, SEL.subLeft, SEL.island],
    );
  }
  check(
    'B3 岛内面板与二级菜单完整落在视口内（未被 overflow:hidden 裁切）',
    !!within && within.panelInViewport && within.subInViewport,
    JSON.stringify(within),
  );

  await page.screenshot({ path: `${OUT}/bohai-composer-island.png` });
  check(
    'B4 AI 岛形态零 pageerror',
    errors.errors.length === 0,
    errors.errors.slice(0, 3).join(' | '),
  );
  check(
    'B5 AI 岛形态零「模板引用未定义绑定」的 Vue 警告',
    errors.vueWarn.length === 0,
    errors.vueWarn.slice(0, 2).join(' | '),
  );
  console.log(`      （console.error ${errors.console.length} 条，探针噪声，不计红）`);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
if (failed.length) {
  failed.forEach((f) => console.log(`FAIL  ${f.name}  -- ${f.detail}`));
  process.exitCode = 1;
}
