/**
 * probe-bohai-composer.mjs — BOH AI 输入区（composer）探针
 *
 * 背景：2026-10-08（plans/025 v2 · Step 6-4）输入区整体重绘为 `BohComposer.vue`：
 *   模式胶囊 + 浮层面板（模型清单 / 工具两件）+ 用量圆钮与浮层 + 斜杠菜单
 *   + 圆形发送键（底部「内容由 AI 生成」说明已于 2026-10-13 按用户口径删除）。
 * 旧版的三行面板 + 左右二级菜单结构已随旧 DOM 删除，断言随之改锁新落点。
 *
 * 2026-10-11：底行拆成**两颗独立胶囊**（模型 / 工具），各点各的浮层，互斥由
 *   `activeMenu` 单状态锁死；hover 详情卡挂在 `.boh-mm-body` 外面。
 * ⚠️ 2026-10-11 同日：**思考强度控件整体下线**（用户口径「不做，直接隐藏」）——
 *   在用模式里只有 gemini 支持调思考强度，且服务端 `buildRuntimePayload` 会用 DB 值
 *   覆盖客户端采样参数 ⇒ 该控件空转。A1 不再断言强度胶囊，A4（换档）整条已删。
 *
 * ⚠️ **本探针必须覆盖三档视口**（DESIGN §10）：现状旧版 22 条**全在桌面档**，
 *   竖屏与矮横屏零覆盖 —— 这是本次必须补的缺口。
 *     1440×900（桌面 ≥1024×600） / 390×844（竖屏 ≤768） / 844×390（矮横屏 ≤600 高）
 *
 * 用法（dev server 需在 5173；脚本自带登录注入，不需要真账号）：
 *   node scripts/probes/probe-bohai-composer.mjs
 *   BASE=http://[::1]:5173 node scripts/probes/probe-bohai-composer.mjs
 *
 * 反证（必须做，否则不算自证）：
 *   · 把 `.boh-tools-pill` 的 `@click="toggleMenu('tools')"` 改成 `toggleMenu('model')` → A1/A5 必红；
 *   · 把 `.boh-usage-pop` 的 `v-show` 改成恒真 → A11 必红；
 *   · 把 `openUsageInSettings` 的 `settingsFocusSection = 'usage'` 改回 `''` → A12 必红。
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
  shell: '.boh-shell',
  main: '.boh-main',
  // 2026-10-08：顶栏整条已删（用户口径「整体布局参考 Codex」），侧栏展开入口收成
  // 主区右上角的浮动操作组 ⇒ 这两个 key 名保留（下游断言只认值），指向新落点。
  topbar: '.boh-float-actions',
  topbarMenuBtn: '.boh-float-actions [title="打开侧栏"]',
  sidebar: '.boh-sidebar',
  composer: '.boh-composer',
  input: '.boh-composer-input',
  // 2026-10-11：底行拆成两颗**独立**胶囊，各点各的浮层（原先只有一颗「模型名 强度」）
  pill: '.boh-mode-pill',
  toolsPill: '.boh-tools-pill',
  panel: '.boh-mode-menu',
  toolsMenu: '.boh-tools-menu',
  modeItem: '.boh-mm-item[data-mode-id]',
  // ⚠️ `modeBack`（`.boh-mm-back`）已随「两视图」下线：A2a 断言它**不存在**，
  //    留着这条选择器是为了能断言它真的没了，别顺手删掉。
  modeBack: '.boh-mm-back',
  mmCustom: '.boh-mm-custom',
  tool: '.boh-mm-tool',
  webToggle: '.boh-cp-icon',
  send: '.boh-send',
  usage: '.boh-usage',
  usagePop: '.boh-usage-pop',
  slash: '.boh-slash',
  note: '.boh-cp-note',
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

/** 浮层都是 v-show ⇒ 必须看 computed display，不能只看元素在不在 */
const rectOf = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  if (getComputedStyle(el).display === 'none') return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
           right: Math.round(r.right), bottom: Math.round(r.bottom) };
})()`;

/**
 * 只把**未捕获异常**与 Vue「模板引用未定义绑定」当红。console.error 里有稳定噪声：
 * 伪造登录后 `get_unread_notification_count` 一定回 P0001、以及若干 4xx 资源加载失败。
 */
const newPage = async (ctx, bucket) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => bucket.errors.push(`pageerror: ${String(e).slice(0, 180)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') bucket.console.push(m.text().slice(0, 180));
    // ⚠️ Vue 对「模板里用了 setup 作用域中不存在的绑定」只发 warning、不抛错，
    // 渲染出来是 `undefined || 兜底值` —— 静默、肉眼难发现。2026-10-01 就靠这条抓到
    // BOHAIMain 漏解构一个被模板读到的状态（当时是胶囊的强度档位）。
    if (
      m.type() === 'warning' &&
      /is not defined on instance|accessed during render/i.test(m.text())
    ) {
      bucket.vueWarn.push(m.text().slice(0, 180));
    }
  });
  return page;
};

const mockQuota = async (page) => {
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
};

/** 点模型胶囊（`.boh-mode-pill`）打开模型菜单 —— 三颗胶囊里只有它带模型清单 */
const openPanel = async (page, scope = '') => {
  await page.locator(`${scope} ${SEL.pill}`.trim()).first().click();
  await page.waitForTimeout(280);
};

// ===================== 场景 A：独立页 1440×900（全量交互） =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const errors = { errors: [], console: [], vueWarn: [] };
  const page = await newPage(ctx, errors);

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector(SEL.pill, { timeout: 20000 });

  // A1 两颗独立胶囊：模型（左，图标 + 模型名 + ⌄）/ 工具（图标）
  //    2026-10-11 拆胶囊：原先是**一颗**「模型名 强度名」，点开一个装两视图的浮层。
  //    ⚠️ 同日「思考强度」整体下线 ⇒ 这里**不再**断言强度胶囊（旧 A1 的第二半条）。
  const pills = await page.evaluate(
    ([modeSel, toolSel]) => {
      const text = (s) => document.querySelector(s)?.textContent.trim() || '';
      const has = (s) => !!document.querySelector(s);
      return {
        mode: text(modeSel),
        modeIcon: !!document.querySelector(`${modeSel} > svg`),
        tools: has(toolSel),
        // 已下线的强度控件必须一个都查不到（含菜单与档位按钮）
        staleEffort: !!document.querySelector(
          '.boh-effort-pill, .boh-effort-menu, .boh-effort-option',
        ),
      };
    },
    [SEL.pill, SEL.toolsPill],
  );
  check(
    'A1 底行两颗独立胶囊（模型名 / 工具），且强度控件已彻底下线',
    pills.mode.length > 0 && pills.modeIcon && pills.tools && !pills.staleEffort,
    JSON.stringify(pills),
  );

  // A2a 点模型胶囊 → 模型菜单（扁平清单 + 每行倍率 + 底部配置入口；**无返回行**）
  await openPanel(page);
  // ⚠️ 必须等清单落地再读：模式表是**异步**拉的，开面板那一刻往往还在骨架态，
  // 直接读会拿到 `modes: []` —— 那是竞态，不是「菜单坏了」（实测间歇假红）。
  const modesLanded = await page
    .waitForSelector('.boh-mm-item[data-mode-id]', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const modelView = await page.evaluate(
    ([panelSel, modeSel, backSel, customSel]) => {
      const el = document.querySelector(panelSel);
      if (!el || getComputedStyle(el).display === 'none') return null;
      const rows = [...el.querySelectorAll(modeSel)];
      return {
        modes: rows.map((n) => n.dataset.modeId),
        // 2026-10-11：三颗胶囊各自独立 ⇒ 没有「上一层视图」，返回行必须消失
        back: !!el.querySelector(backSel),
        rates: rows.map((n) => !!n.querySelector('.boh-mm-rate')),
        custom: !!el.querySelector(customSel),
        // 详情卡里只有描述 / 消耗速度 / 使用此模式（强度控件已整体下线）
        staleEffort: !!el.querySelector('.boh-mm-detail-effort'),
      };
    },
    [SEL.panel, SEL.modeItem, SEL.modeBack, SEL.mmCustom],
  );
  check(
    'A2a 模型菜单（清单 / 每行倍率 / 配置自定义模型 / 无返回行）',
    modesLanded &&
      !!modelView &&
      modelView.modes.length >= 1 &&
      !modelView.back &&
      !modelView.staleEffort &&
      modelView.rates.length === modelView.modes.length &&
      modelView.rates.every(Boolean) &&
      modelView.custom,
    JSON.stringify(modelView),
  );

  // A2b hover 任一**未选中**模型行 → 右侧详情卡显示描述/消耗速度/使用此模式。
  //     2026-10-11：卡片随面板左对齐而**镜像到右侧**，放不下时 `is-flipped` 翻回左侧。
  const unselectedRows = page
    .locator('.boh-mm-row')
    .filter({ has: page.locator('.boh-mm-item:not(.is-on)') });
  const hasOtherMode = (await unselectedRows.count()) > 0;
  await (hasOtherMode ? unselectedRows.first() : page.locator('.boh-mm-row').first()).hover();
  await page.waitForSelector('.boh-mm-detail', { timeout: 4000 });
  // 从行挪到卡（240ms 延迟收起）—— 卡片不能因为指针离开行就消失
  const cardBox = await page.locator('.boh-mm-detail').boundingBox();
  if (cardBox) await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 12);
  await page.waitForTimeout(360);
  const detail = await page.evaluate(
    ([panelSel]) => {
      const card = document.querySelector('.boh-mm-detail');
      const panel = document.querySelector(panelSel);
      const cr = card?.getBoundingClientRect();
      const pr = panel?.getBoundingClientRect();
      return {
        visible: !!card?.checkVisibility(),
        flipped: !!card?.classList.contains('is-flipped'),
        text: card?.textContent?.replace(/\s+/g, ' ').trim() || '',
        useButton: !!card?.querySelector('.boh-mm-detail-use'),
        useDisabled: card?.querySelector('.boh-mm-detail-use')?.disabled ?? true,
        detailLabels: [...(card?.querySelectorAll('.boh-mm-detail-row span') || [])].map((n) =>
          n.textContent.trim(),
        ),
        // 默认贴面板右侧（面板左对齐）；翻到左侧时也必须仍然完整落在视口内
        side:
          cr && pr ? (cr.left >= pr.right ? 'right' : cr.right <= pr.left ? 'left' : 'over') : '',
        inViewport: cr ? cr.left >= 0 && cr.right <= window.innerWidth : false,
      };
    },
    [SEL.panel],
  );
  check(
    'A2b hover 详情卡：描述/消耗速度齐全、可使用此模式、不越视口、指针移入不消失',
    detail.visible &&
      detail.useButton &&
      detail.useDisabled === !hasOtherMode &&
      detail.detailLabels.join('/') === '消耗速度' &&
      detail.text.length > detail.detailLabels.join('/').length &&
      detail.side !== 'over' &&
      detail.inViewport,
    JSON.stringify(detail),
  );

  // A3 面板贴在胶囊上方 (不压输入框)
  const panelRect = await page.evaluate(rectOf(SEL.panel));
  const pillRect = await page.evaluate(rectOf(SEL.pill));
  check(
    'A3 面板向上弹出且不与胶囊重叠',
    !!panelRect && !!pillRect && panelRect.bottom <= pillRect.y + 2,
    `panel.bottom=${panelRect?.bottom} pill.y=${pillRect?.y}`,
  );

  // A4 两颗胶囊**互斥**：模型面板开着时点工具胶囊 ⇒ 模型面板必须收起、工具菜单接管。
  //    （原 A4 是「点强度胶囊 → 换档」；强度控件 2026-10-11 整体下线后，这条改锁互斥契约。）
  await openPanel(page);
  await page.waitForTimeout(200);
  await page.locator(SEL.toolsPill).first().click();
  await page.waitForTimeout(260);
  const exclusivity = await page.evaluate(
    ([panelSel, menuSel, toolSel]) => {
      const display = (s) => {
        const el = document.querySelector(s);
        return el ? getComputedStyle(el).display : 'missing';
      };
      return {
        modelClosed: display(panelSel) === 'none',
        toolsOpen: display(menuSel) !== 'none',
        toolCount: document.querySelectorAll(toolSel).length,
      };
    },
    [SEL.panel, SEL.toolsMenu, SEL.tool],
  );
  check(
    'A4 两颗胶囊互斥：开工具菜单后模型面板收起',
    exclusivity.modelClosed && exclusivity.toolsOpen && exclusivity.toolCount === 2,
    // ⚠️ 2026-10-19：2 = 「社区搜索」并入官方记忆总开关后下线，工具只剩（个人 Cloud+ / 心理分析）。
    //    此前 3（社区搜索 / 个人 Cloud+ / 心理分析）、更早 4（含健康分析）。
    JSON.stringify(exclusivity),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // A5 选模式 → 面板收起 + 模型胶囊更新
  await openPanel(page);
  const modes = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((n) => ({
        id: n.dataset.modeId,
        on: n.classList.contains('is-on'),
      })),
    SEL.modeItem,
  );
  const otherMode = modes.find((m) => !m.on);
  if (otherMode) {
    await page.evaluate(
      ([sel, id]) => document.querySelector(`${sel}[data-mode-id="${id}"]`)?.click(),
      [SEL.modeItem, otherMode.id],
    );
    await page.waitForTimeout(560);
    const after = await page.evaluate(
      ([panelSel, pillSel]) => ({
        panelOpen: getComputedStyle(document.querySelector(panelSel)).display !== 'none',
        pill: document.querySelector(pillSel)?.textContent.trim() || '',
      }),
      [SEL.panel, SEL.pill],
    );
    check(
      'A5 选完模式 → 面板收起 + 模型胶囊更新',
      !after.panelOpen && after.pill !== modes.find((m) => m.on)?.id,
      `${modes.find((m) => m.on)?.id} → ${after.pill} (panel=${after.panelOpen ? 'open' : 'closed'})`,
    );
  } else {
    check('A5 选完模式 → 面板收起 + 模型胶囊更新', false, '只有一个模式可选，无法测切换');
  }

  // A6 工具菜单（第三颗胶囊）：两件齐全，且不收浮层（用户常接着改第二项）。
  // ⚠️ 2026-10-19：「社区搜索」并入官方记忆总开关后下线 ⇒ 由三件变两件
  //     （原断言还在找「社区搜索」⇒ 假红）。
  await page.locator(SEL.toolsPill).first().click();
  await page.waitForTimeout(260);
  const toolNames = await page.evaluate(
    ([menuSel, toolSel]) => {
      const menu = document.querySelector(menuSel);
      return {
        open: !!menu && getComputedStyle(menu).display !== 'none',
        names: [...menu.querySelectorAll(toolSel)].map(
          (el) => el.querySelector('strong')?.textContent.trim() || '',
        ),
      };
    },
    [SEL.toolsMenu, SEL.tool],
  );
  const wantTools = ['个人 Cloud+', '心理分析'];
  const missing = wantTools.filter((n) => !toolNames.names.includes(n));
  check(
    'A6 工具胶囊 → 两件工具齐全',
    toolNames.open && missing.length === 0 && toolNames.names.length === wantTools.length,
    `缺 ${missing.join('/') || '无'}；实得 ${toolNames.names.join(' / ')}`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // A7 联网单键：点击后呈开启态
  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  await page.locator(SEL.webToggle).first().click();
  await page.waitForTimeout(220);
  const webOn = await page.evaluate(
    (sel) => document.querySelector(sel)?.classList.contains('is-on') || false,
    SEL.webToggle,
  );
  check('A7 联网单键点击后呈开启态', webOn, `is-on=${webOn}`);
  await page.locator(SEL.webToggle).first().click();
  await page.waitForTimeout(200);

  // A8 斜杠菜单：输入 `/` 唤起，含 4 条基础命令
  await page.fill(SEL.input, '/');
  await page.waitForTimeout(320);
  const slashCmds = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || getComputedStyle(el).display === 'none') return null;
    return [...el.querySelectorAll('.boh-slash-cmd')].map((n) => n.textContent.trim());
  }, SEL.slash);
  check(
    'A8 斜杠菜单（/web /community /cloud）',
    Array.isArray(slashCmds) &&
      ['/web', '/community', '/cloud'].every((c) => slashCmds.includes(c)),
    (slashCmds || []).join(' '),
  );

  // A8b 斜杠菜单几何（2026-10-11 紧凑档 + 上方可用高度上限）。
  //     ⚠️ 为什么必须量几何：A8 只判「文案在不在」，菜单被裁 / 顶端被推出视口 / 宽度没生效
  //     它**全绿** —— 实测过：`/web`…`/new` 7 条命令完全看不见也够不到时 A8 依然 PASS。
  const slashGeo = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || getComputedStyle(el).display === 'none') return null;
    const r = el.getBoundingClientRect();
    const composer = document.querySelector('.boh-composer').getBoundingClientRect();
    const items = [...el.querySelectorAll('.boh-slash-item')];
    const heights = items.map((n) => n.getBoundingClientRect().height);
    return {
      w: Math.round(r.width),
      top: Math.round(r.top),
      right: Math.round(r.right),
      // `left: 10px` 的参照是输入框的 padding box ⇒ 加上外壳 1px 边框，实测恒 11
      leftOffset: Math.round(r.left - composer.left),
      itemH: Math.round(Math.max(...heights) * 10) / 10,
      rows: items.length,
      // ⚠️ 「无滚动条」只能读 CSS 属性，**不能量布局宽度**：headless Chrome 是 overlay 滚动条，
      //    `offsetWidth - clientWidth` 在有/无滚动条两种状态下**都是 2（两侧边框）** ⇒ 量宽度是假绿。
      scrollbarWidth: getComputedStyle(el).scrollbarWidth,
      vw: window.innerWidth,
    };
  }, SEL.slash);
  check(
    'A8b 斜杠菜单几何（宽 420 左对齐 / 行高 <48 / 顶端不越出视口 / 无滚动条）',
    !!slashGeo &&
      slashGeo.w === 420 &&
      slashGeo.leftOffset >= 10 &&
      slashGeo.leftOffset <= 12 &&
      slashGeo.itemH >= 36 &&
      slashGeo.itemH < 48 &&
      slashGeo.top >= 0 &&
      slashGeo.right <= slashGeo.vw &&
      slashGeo.scrollbarWidth === 'none',
    JSON.stringify(slashGeo),
  );
  await page.fill(SEL.input, '');
  await page.waitForTimeout(240);

  // A9 发送键为圆形（底部「内容由 AI 生成」说明已于 2026-10-13 按用户口径删除）
  const sendShape = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      radius: getComputedStyle(el).borderRadius,
    };
  }, SEL.send);
  // 负向绊线：说明被删是刻意口径，重新加回来必须同步本探针（别让它悄悄回潮）
  const noteGone = await page.evaluate(() => !document.querySelector('.boh-cp-note'));
  check(
    'A9 发送键为圆形 + 底部说明已按口径删除',
    !!sendShape &&
      Math.abs(sendShape.w - sendShape.h) <= 1 &&
      /999px|50%/.test(sendShape.radius) &&
      noteGone,
    `${JSON.stringify(sendShape)} note已删除=${noteGone}`,
  );

  // ── A10-A13 用量圆钮（发送一条消息后才渲染） ──
  await mockQuota(page);
  await page.fill(SEL.input, '探针：验证用量圆钮');
  await page.locator(SEL.send).click();
  await page.waitForSelector(SEL.usage, { timeout: 15000 });

  /* ⚠️ 圆钮**渲染**和「额度压力分档」是两条时间线，不能读一次就断言：
       · `.boh-usage` 的 `v-if` 只看 `messages.length > 0` ⇒ 发送后立刻出现；
       · `is-warn` 来自 `quotaLevelClass`，它依赖 `todayTokenUsage`，而这个值只有
         `fetchTodayQuota()` 落地后才有 —— 那条链是「流结束（isThinking true→false）
         + setTimeout 1500ms + quota-status 请求返回」。
     2026-10-17 之前这里写死 `waitForTimeout(2200)`，实测 warn 要到 ~3.4s 才挂上
     （流失败后引擎有多次重试才把 isThinking 放下），于是 A10 **稳定红**、
     报障详情是「pct 0% / warn false」—— 看着像配额链路坏了，其实是探针读太早。
     改成轮询到出现为止（上限 9s），读的是同一个 DOM 事实，只是不再赌固定时长。 */
  let orbShape = null;
  for (let attempt = 0; attempt < 36; attempt += 1) {
    orbShape = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const ring = el.querySelector('i');
      return {
        hasRing: !!ring,
        // 圆钮上的数字是「对话上下文」占比（空对话≈0%），额度压力只体现在 class 上
        pct: el.querySelector('b')?.textContent.trim() || '',
        warn: el.classList.contains('is-warn'),
      };
    }, SEL.usage);
    if (orbShape?.warn) break;
    await page.waitForTimeout(250);
  }
  check(
    'A10 用量圆钮 = 环 + 百分比数字，且额度 88% 时挂 is-warn',
    !!orbShape && orbShape.hasRing && /^\d+(\.\d+)?%$/.test(orbShape.pct) && orbShape.warn,
    JSON.stringify(orbShape),
  );

  await page.hover(SEL.usage);
  await page.waitForTimeout(340);
  const popOpen = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!el && getComputedStyle(el).display !== 'none';
  }, SEL.usagePop);
  check('A11 hover 圆钮 → 用量浮层打开', popOpen, `open=${popOpen}`);

  const popRows = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return [...el.querySelectorAll('.boh-usage-row > span:nth-child(2)')].map((n) =>
      n.textContent.trim(),
    );
  }, SEL.usagePop);
  check(
    // 2026-10-08 额度口径改版：第二行从「今日额度」改为「今日剩余」（值 = quotaRemainingText 百分比）
    'A12 浮层含「对话上下文」与「今日剩余」两行',
    Array.isArray(popRows) && popRows.includes('对话上下文') && popRows.includes('今日剩余'),
    (popRows || []).join(' / '),
  );

  await page.mouse.move(400, 300);
  await page.waitForTimeout(560);
  const popClosed = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !el || getComputedStyle(el).display === 'none';
  }, SEL.usagePop);
  check('A13 移开鼠标 → 浮层延迟收起', popClosed, `closed=${popClosed}`);

  // ── A14-A16 设置面板（用量卡仍承接退役的额度侧板） ──
  await page.hover(SEL.usage);
  await page.waitForTimeout(340);
  await page.locator('.boh-usage-pop-head button').first().click();
  await page.waitForSelector('.ai-settings-drawer', { timeout: 8000 });
  // ⚠️ 用量卡是**数据到了才变高**的（quota 落定后卡片才填内容），打开时那一次
  // scrollIntoView 会停在半路 —— 症状是 `usageVisible=false` 而设置面板其实正常。
  // 固定 waitForTimeout 等不到这个竞态（实测时红时绿），改成「读一次 → 没到位就补滚」。
  let settingsShape = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForTimeout(500);
    settingsShape = await page.evaluate(() => {
      const body = document.querySelector('.ai-settings-body');
      const usageSection = document.querySelector('.ai-settings-usage-section');
      const usageRect = usageSection?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      return {
        titles: [...document.querySelectorAll('.ai-settings-group-title')].map((el) =>
          el.textContent.trim(),
        ),
        collapseHead: !!document.querySelector('.ai-settings-collapse-head'),
        usageVisible:
          !!usageRect &&
          !!bodyRect &&
          usageRect.top < bodyRect.bottom &&
          usageRect.bottom > bodyRect.top,
        scrollTop: body?.scrollTop || 0,
        legacyQuotaDrawer: document.querySelectorAll('.quota-drawer, .quota-backdrop').length,
        text: (document.querySelector('.ai-settings-drawer')?.innerText || '').replace(/\s+/g, ' '),
      };
    });
    if (settingsShape.usageVisible && settingsShape.scrollTop > 0) break;
    await page.evaluate(() => {
      document.querySelector('.ai-settings-usage-section')?.scrollIntoView({ block: 'start' });
    });
  }
  check(
    'A14 圆钮浮层「完整用量」→ 打开设置面板并滚到用量卡',
    settingsShape.usageVisible && settingsShape.scrollTop > 0,
    `scrollTop=${settingsShape.scrollTop} usageVisible=${settingsShape.usageVisible}`,
  );
  // 2026-10-08：设置面板重写为「全屏设置页」—— 由「4 卡 + 折叠高级」改为
  // **6 个分区 + 左侧分组导航**（右侧同一滚动容器里滚动定位，折叠头随之取消）。
  check(
    'A15 设置页含 6 个分区',
    ['对话偏好', '记忆与上下文', '外观', '用量', '呼出方式', '数据'].every((t) =>
      settingsShape.titles.includes(t),
    ),
    settingsShape.titles.join(' / '),
  );
  // ⚠️ 断言只认**数据**不认文案：面板底部那句说明也含「Web Searching」，
  // 早先写 `includes('Web Searching')` 时 C3 是假绿（把段标题改成 WEB SEARCH 仍 PASS）。
  check(
    'A16 用量卡读到 quota-status 的 mock 值（88% + 已用 3 次 / 共 10 次）',
    settingsShape.text.includes('88%') &&
      settingsShape.text.includes('已用 3 次') &&
      settingsShape.text.includes('共 10 次'),
    settingsShape.text.slice(0, 160),
  );
  check(
    'A17 退役的额度侧板已消失 + 思考强度控件整体下线',
    settingsShape.legacyQuotaDrawer === 0 && !settingsShape.text.includes('思考速度'),
    `legacy=${settingsShape.legacyQuotaDrawer}`,
  );

  await page.screenshot({ path: `${OUT}/bohai-composer-standalone.png` });
  check(
    'A18 独立页零 pageerror',
    errors.errors.length === 0,
    errors.errors.slice(0, 3).join(' | '),
  );
  check(
    'A19 零「模板引用未定义绑定」的 Vue 警告',
    errors.vueWarn.length === 0,
    errors.vueWarn.slice(0, 2).join(' | '),
  );
  console.log(`      （console.error ${errors.console.length} 条，探针噪声，不计红）`);

  await page.unroute('**/functions/v1/api-key-vault**');
  await ctx.close();
}

// ===================== 场景 B：竖屏 390×844 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const errors = { errors: [], console: [], vueWarn: [] };
  const page = await newPage(ctx, errors);
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector(SEL.pill, { timeout: 20000 });
  await page.waitForTimeout(400);

  const portrait = await page.evaluate(
    ([
      composerSel,
      inputSel,
      sendSel,
      webSel,
      pillSel,
      toolsSel,
      topbarSel,
      sidebarSel,
      menuBtnSel,
    ]) => {
      const rect = (s) => {
        const el = document.querySelector(s);
        return el ? el.getBoundingClientRect() : null;
      };
      const c = rect(composerSel);
      const s = rect(sendSel);
      return {
        composerRight: Math.round(c?.right ?? 0),
        composerLeft: Math.round(c?.left ?? 0),
        hasInput: !!document.querySelector(inputSel),
        hasWeb: !!document.querySelector(webSel),
        hasPill: !!document.querySelector(pillSel),
        hasTools: !!document.querySelector(toolsSel),
        sendW: Math.round(s?.width ?? 0),
        sendH: Math.round(s?.height ?? 0),
        topbarH: Math.round(rect(topbarSel)?.height ?? 0),
        sidebarOpen: document.querySelector(sidebarSel)?.classList.contains('is-open') || false,
        hasMenuBtn: !!document.querySelector(menuBtnSel),
      };
    },
    [
      SEL.composer,
      SEL.input,
      SEL.send,
      SEL.webToggle,
      SEL.pill,
      SEL.toolsPill,
      SEL.topbar,
      SEL.sidebar,
      SEL.topbarMenuBtn,
    ],
  );
  check(
    'B1 输入区不溢出视口',
    portrait.composerLeft >= 0 && portrait.composerRight <= 390,
    `left=${portrait.composerLeft} right=${portrait.composerRight}`,
  );
  check(
    // 2026-10-11：两颗胶囊 + 联网 + 发送。⚠️ 390px 下模型名必须靠省略号收窄才挤得下，
    // 这条断言就是防「有人把模型名改成不截断」把底行撑破。
    'B2 底行齐全（联网 / 模型 / 工具 / 发送）',
    portrait.hasWeb &&
      portrait.hasPill &&
      portrait.hasTools &&
      Math.abs(portrait.sendW - portrait.sendH) <= 1,
    JSON.stringify(portrait),
  );
  // 2026-10-08：顶栏已删 ⇒ 竖屏不再有 46px 横条，改为「右上角浮动操作在场且含侧栏入口」。
  // 页签在竖屏默认收起会话侧栏，所以「打开侧栏」按钮此时应当真的渲染出来。
  check(
    'B3 竖屏：浮动操作在场且含侧栏入口（顶栏已删）',
    portrait.topbarH > 0 && portrait.hasMenuBtn,
    `h=${portrait.topbarH} menuBtn=${portrait.hasMenuBtn}`,
  );

  await page.locator(SEL.topbarMenuBtn).click();
  await page.waitForTimeout(420);
  const drawerOpen = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      open: el.classList.contains('is-open'),
      left: Math.round(r.left),
      w: Math.round(r.width),
    };
  }, SEL.sidebar);
  check(
    'B4 顶栏汉堡 → 侧栏抽屉打开（贴左、宽度 ≤ 78vw）',
    !!drawerOpen &&
      drawerOpen.open &&
      drawerOpen.left === 0 &&
      drawerOpen.w <= Math.round(390 * 0.78) + 1,
    JSON.stringify(drawerOpen),
  );

  // B5 竖屏下面板完整落在视口内
  // ⚠️ 抽屉展开时它自己（z-index 极高、贴左 280px）会盖住顶栏的汉堡键 ——
  // 收起要走抽屉内的「收起侧栏」键或遮罩，不能点汉堡（会一直卡在 hit-target 检查）。
  await page.locator(`${SEL.sidebar} [title="收起侧栏"]`).first().click();
  await page.waitForTimeout(420);
  await openPanel(page);
  const panelRect = await page.evaluate(rectOf(SEL.panel));
  check(
    'B5 竖屏下面板完整落在视口内',
    !!panelRect && panelRect.x >= 0 && panelRect.right <= 391 && panelRect.y >= 0,
    JSON.stringify(panelRect),
  );

  await page.screenshot({ path: `${OUT}/bohai-composer-phone.png` });
  check('B6 竖屏零 pageerror', errors.errors.length === 0, errors.errors.slice(0, 3).join(' | '));

  // ── B7 竖屏设置抽屉内容可滚动（2026-10-17 P0-1 回归锁）──
  // 竖屏抽屉转纵向 flex 后，`.ai-settings-main` 若缺 `min-height: 0` 会被内容撑高，
  // body（flex:1 + min-height:0 + overflow-y:auto）拿不到受限高度 ⇒ 整条滚动链断裂、
  // 「外观 / 用量与订阅 / 呼出方式 / 数据」四个分区不可达（2026-10-13 报告 A1，
  // 2026-10-17 复测 body 2918/2918 卡死后已修）。断言抓「可滚」这一行为事实。
  // 竖屏没有用量圆钮（.boh-usage 只在桌面档渲染），走账号浮层的「设置」入口
  // （与 2026-10-17 手工复测同一通道）。用 DOM click 避免遮挡命中检查。
  const settingsOpened = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role="button"]')];
    const b =
      btns.find((x) => /设置/.test(x.textContent || '') && x.offsetParent !== null) ||
      btns.find((x) => /设置/.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  await page.waitForSelector('.ai-settings-drawer', { timeout: 8000 });
  await page.waitForTimeout(600);
  const drawerScroll = await page.evaluate(() => {
    const body = document.querySelector('.ai-settings-body');
    if (!body) return null;
    const before = body.scrollTop;
    body.scrollTop = 300;
    const scrolled = body.scrollTop;
    body.scrollTop = before;
    return { sh: body.scrollHeight, ch: body.clientHeight, scrolled: scrolled > before };
  });
  check(
    'B7 竖屏设置抽屉内容可滚动（P0-1 回归锁）',
    settingsOpened === true &&
      !!drawerScroll &&
      drawerScroll.sh > drawerScroll.ch &&
      drawerScroll.scrolled,
    `opened=${settingsOpened} ${JSON.stringify(drawerScroll)}`,
  );
  await ctx.close();
}

// ===================== 场景 C：矮横屏 844×390 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    serviceWorkers: 'block',
  });
  const errors = { errors: [], console: [], vueWarn: [] };
  const page = await newPage(ctx, errors);
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector(SEL.pill, { timeout: 20000 });
  await page.waitForTimeout(400);

  const short = await page.evaluate(
    ([topbarSel, noteSel, inputSel]) => {
      const rect = (s) => {
        const el = document.querySelector(s);
        return el ? el.getBoundingClientRect() : null;
      };
      const input = document.querySelector(inputSel);
      return {
        topbarH: Math.round(rect(topbarSel)?.height ?? 0),
        noteDisplay: noteSel
          ? getComputedStyle(document.querySelector(noteSel) || document.body).display
          : '',
        hasNote: !!document.querySelector(noteSel),
        inputMaxH: input ? getComputedStyle(input).maxHeight : '',
      };
    },
    [SEL.topbar, SEL.note, SEL.input],
  );
  check('C1 矮横屏：浮动操作在场（顶栏已删）', short.topbarH > 0, `${short.topbarH}px`);
  // 2026-10-13：底部说明（`.boh-cp-note`）已按用户口径删除 ⇒ 这条从「矮横屏隐藏它」
  // 改成**负向绊线**：元素必须不存在。矮横屏省空间的需求随之消失（本来就没有了）。
  check(
    'C2 底部说明已删除（2026-10-13 用户口径；重新加回需同步本探针）',
    !short.hasNote,
    `has=${short.hasNote} display=${short.noteDisplay}`,
  );
  // 2026-10-08：上限由写死的 60px 提到 `min(38vh, 180px)`（用户口径「输入框随内容自适应」）。
  // 断言口径随之改为「受视口约束的上限，且明显高于旧值」—— 844×390 下即 148.2px。
  check(
    'C3 矮横屏输入框上限收在视口内（38vh / 180px 取小）',
    parseFloat(short.inputMaxH) > 100 && parseFloat(short.inputMaxH) <= 390 * 0.4,
    short.inputMaxH,
  );

  await openPanel(page);
  const panelRect = await page.evaluate(rectOf(SEL.panel));
  check(
    'C4 矮横屏下面板完整落在视口内',
    !!panelRect && panelRect.y >= 0 && panelRect.bottom <= 391 && panelRect.right <= 845,
    JSON.stringify(panelRect),
  );

  await page.screenshot({ path: `${OUT}/bohai-composer-short.png` });
  check('C5 矮横屏零 pageerror', errors.errors.length === 0, errors.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
if (failed.length) {
  failed.forEach((f) => console.log(`FAIL  ${f.name}  --  ${f.detail}`));
  process.exitCode = 1;
}
