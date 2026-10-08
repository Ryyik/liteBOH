/**
 * probe-bohai-composer.mjs — BOH AI 输入区（composer）探针
 *
 * 背景：2026-10-08（plans/025 v2 · Step 6-4）输入区整体重绘为 `BohComposer.vue`：
 *   「模式名 · 强度」胶囊 + 单层面板（模式清单 / 强度分段 / 高级四工具）
 *   + 用量圆钮与浮层 + 斜杠菜单 + 圆形发送键 + 底部「内容由 AI 生成」说明。
 * 旧版的三行面板 + 左右二级菜单结构已随旧 DOM 删除，断言随之改锁新落点。
 *
 * 2026-10-08 晚（用户样稿第二轮）：面板改**两视图**（v-show 切换，DOM 常驻）——
 *   视图一「强度」= 大字档位（品牌蓝）+ 模型行（点进视图二）+ 三档滑杆 + 右上角重置；
 *   视图二「模型」= 可返回标题行 + 分组头（默认 / 数据库配置）+ 纯文本行 + 选中勾。
 *   契约变化：**换强度不收面板**（滑杆拖一半面板关掉 = 坏了），选模式仍收（pickMode 不变）。
 *   胶囊文案从「模式 · 强度」改为「模式名 强度名」（样稿的「5.5 高」形态）。
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
 *   · 把 `setEffortIndex` 里的 emit 去掉 → A4 必红；
 *   · 把 `menuView` 归位从 `closePanel()` 里删掉 → 重开面板停在模型视图 → A2a 必红；
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
  pill: '.boh-mode-pill',
  panel: '.boh-mode-menu',
  modeLink: '.boh-effort-mode',
  modeBack: '.boh-mm-back',
  modeItem: '.boh-mm-item[data-mode-id]',
  effortDot: '.boh-effort-dot[data-thinking-speed-id]',
  effortWord: '.boh-effort-word',
  effortTrack: '.boh-effort-track-wrap',
  advRow: '.boh-mm-item.is-adv',
  advBox: '.boh-mm-adv',
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

const openPanel = async (page, scope = '') => {
  await page.locator(`${scope} ${SEL.pill}`.trim()).first().click();
  await page.waitForTimeout(280);
};

/** A4 之后面板可能仍开着（新契约：换强度不收面板）—— 没开才点胶囊，开了直接用 */
const ensurePanelOpen = async (page) => {
  const open = await page.evaluate(rectOf(SEL.panel));
  if (!open) await openPanel(page);
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

  // A1 胶囊 = 「模型名 强度名」（样稿「5.5 高」形态，不再有 · 分隔）
  const pillText = await page.evaluate(
    (sel) => document.querySelector(sel)?.textContent.trim() || '',
    SEL.pill,
  );
  check('A1 底行胶囊渲染（模型名 + 强度名）', /^(.+)\s(低|中|高)$/.test(pillText), pillText);

  // A2a 强度视图（默认视图）：大字档位 / 模型行 / 三档滑点 / 高级行
  await openPanel(page);
  const effortView = await page.evaluate(
    ([panelSel, dotSel, wordSel, advSel, linkSel]) => {
      const el = document.querySelector(panelSel);
      if (!el || getComputedStyle(el).display === 'none') return null;
      return {
        dots: [...el.querySelectorAll(dotSel)].map((n) => n.dataset.thinkingSpeedId),
        word: el.querySelector(wordSel)?.textContent.trim() || '',
        adv: !!el.querySelector(advSel),
        link: el.querySelector(linkSel)?.textContent.trim() || '',
      };
    },
    [SEL.panel, SEL.effortDot, SEL.effortWord, SEL.advRow, SEL.modeLink],
  );
  check(
    'A2a 强度视图齐全（大字档位 / 模型行 / 三档滑点 / 高级行）',
    !!effortView &&
      effortView.dots.length === 3 &&
      !!effortView.word &&
      !!effortView.link &&
      effortView.adv,
    JSON.stringify(effortView),
  );

  // A2b 点「模型名 ›」→ 模型视图（清单 / 返回行 / 分组头；v-show 切换，DOM 常驻）
  await page.locator(SEL.modeLink).first().click();
  await page.waitForTimeout(240);
  const modelView = await page.evaluate(
    ([panelSel, modeSel, backSel]) => {
      const el = document.querySelector(panelSel);
      if (!el || getComputedStyle(el).display === 'none') return null;
      return {
        modes: [...el.querySelectorAll(modeSel)].map((n) => n.dataset.modeId),
        back: !!el.querySelector(backSel),
        groupHead: el.querySelector('.boh-mm-group-name')?.textContent.trim() || '',
      };
    },
    [SEL.panel, SEL.modeItem, SEL.modeBack],
  );
  check(
    'A2b 模型视图（点「模型名 ›」进入：清单 / 返回行 / 分组头）',
    !!modelView && modelView.modes.length >= 1 && modelView.back && modelView.groupHead === '默认',
    JSON.stringify(modelView),
  );

  // A3 面板贴在胶囊上方（不压输入框）
  const panelRect = await page.evaluate(rectOf(SEL.panel));
  const pillRect = await page.evaluate(rectOf(SEL.pill));
  check(
    'A3 面板向上弹出且不与胶囊重叠',
    !!panelRect && !!pillRect && panelRect.bottom <= pillRect.y + 2,
    `panel.bottom=${panelRect?.bottom} pill.y=${pillRect?.y}`,
  );

  // A4 换强度 → **面板保持打开**（2026-10-08 样稿契约：拖一半关掉 = 滑杆坏了）
  //    + 大字档位/胶囊更新 + 落盘。先从模型视图返回强度视图。
  //    滑杆是全自绘的（用户口径「不要原生拖动条」）⇒ 走真实指针路径点轨道目标档。
  await page.locator(SEL.modeBack).first().click();
  await page.waitForTimeout(240);
  const wordBefore = effortView?.word || '';
  const pillBefore = pillText;
  const dots = effortView?.dots || [];
  const curIdx = await page.evaluate(
    (sel) => Number(document.querySelector(sel)?.getAttribute('aria-valuenow') || 0),
    SEL.effortTrack,
  );
  const otherIdx = dots.length > 1 ? (curIdx + 1) % dots.length : -1;
  if (otherIdx >= 0) {
    const otherId = dots[otherIdx];
    const trackBox = await page.locator(SEL.effortTrack).first().boundingBox();
    // ⚠️ 目标档在 0% / 100% 时点击点正好压在边界上，亚像素可能落空（实测 A4 假红）⇒ 向内收 2px
    const rawX = (trackBox.width * otherIdx) / (dots.length - 1);
    const targetX = trackBox.x + Math.min(Math.max(rawX, 2), trackBox.width - 2);
    await page.mouse.click(targetX, trackBox.y + trackBox.height / 2);
    await page.waitForTimeout(420);
    const panelAfter = await page.evaluate(rectOf(SEL.panel));
    const wordAfter = await page.evaluate(
      (sel) => document.querySelector(sel)?.textContent.trim() || '',
      SEL.effortWord,
    );
    const pillAfter = await page.evaluate(
      (sel) => document.querySelector(sel)?.textContent.trim() || '',
      SEL.pill,
    );
    const stored = await page.evaluate(() => localStorage.getItem('boh_ai_thinking_speed_v1'));
    check(
      'A4 换强度 → 面板保持打开 + 大字/胶囊更新 + 落盘',
      !!panelAfter && wordAfter !== wordBefore && pillAfter !== pillBefore && stored === otherId,
      `panel=${panelAfter ? 'open' : 'closed'} ${wordBefore}→${wordAfter} ${pillBefore}→${pillAfter} stored=${stored}`,
    );
  } else {
    check('A4 换强度 → 面板保持打开 + 大字/胶囊更新 + 落盘', false, '没有可切换的强度档');
  }

  // A5 选模式 → 面板收起 + 胶囊模式名变（先进模型视图再选）
  await ensurePanelOpen(page);
  await page.locator(SEL.modeLink).first().click();
  await page.waitForTimeout(240);
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
    const panelAfter = await page.evaluate(rectOf(SEL.panel));
    const pillAfter = await page.evaluate(
      (sel) => document.querySelector(sel)?.textContent.trim() || '',
      SEL.pill,
    );
    check(
      'A5 选完模式 → 面板收起 + 胶囊模式名更新',
      !panelAfter && !pillAfter.startsWith(modes.find((m) => m.on)?.id || ' '),
      `${modes.find((m) => m.on)?.id} → ${pillAfter} (panel=${panelAfter ? 'open' : 'closed'})`,
    );
  } else {
    check('A5 选完模式 → 面板收起 + 胶囊模式名更新', false, '只有一个模式可选，无法测切换');
  }

  // A6 高级区四个工具
  await openPanel(page);
  await page.locator(SEL.advRow).first().click();
  await page.waitForTimeout(240);
  const toolNames = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map(
        (el) => el.querySelector('strong')?.textContent.trim() || '',
      ),
    SEL.tool,
  );
  const wantTools = ['社区搜索', '个人 Cloud+', '健康分析', '心理分析'];
  const missing = wantTools.filter((n) => !toolNames.includes(n));
  check(
    'A6 高级区四个工具齐全',
    missing.length === 0,
    `缺 ${missing.join('/') || '无'}；实得 ${toolNames.join(' / ')}`,
  );

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
    'A8 斜杠菜单（/web /community /cloud /health）',
    Array.isArray(slashCmds) &&
      ['/web', '/community', '/cloud', '/health'].every((c) => slashCmds.includes(c)),
    (slashCmds || []).join(' '),
  );
  await page.fill(SEL.input, '');
  await page.waitForTimeout(240);

  // A9 发送键为圆形 + 底部说明在场
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
  const noteText = await page.evaluate(
    (sel) => document.querySelector(sel)?.textContent.trim() || '',
    SEL.note,
  );
  check(
    'A9 发送键为圆形 + 底部「内容由 AI 生成」说明在场',
    !!sendShape &&
      Math.abs(sendShape.w - sendShape.h) <= 1 &&
      /999px|50%/.test(sendShape.radius) &&
      /AI 生成/.test(noteText),
    `${JSON.stringify(sendShape)} note=「${noteText}」`,
  );

  // ── A10-A13 用量圆钮（发送一条消息后才渲染） ──
  await mockQuota(page);
  await page.fill(SEL.input, '探针：验证用量圆钮');
  await page.locator(SEL.send).click();
  await page.waitForSelector(SEL.usage, { timeout: 15000 });
  await page.waitForTimeout(2200); // 等 fetchTodayQuota（发送后 1.5s）吃到 mock 值

  const orbShape = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const ring = el.querySelector('i');
    return {
      hasRing: !!ring,
      pct: el.querySelector('b')?.textContent.trim() || '',
      warn: el.classList.contains('is-warn'),
    };
  }, SEL.usage);
  check(
    'A10 用量圆钮 = 环 + 百分比数字，且额度 88% 时挂 is-warn',
    !!orbShape && orbShape.hasRing && /%$/.test(orbShape.pct) && orbShape.warn,
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
  await page.waitForTimeout(700);

  const settingsShape = await page.evaluate(() => {
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
    'A17 退役的额度侧板已消失 + 思考强度不再有第二入口',
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
    ([composerSel, inputSel, sendSel, webSel, pillSel, topbarSel, sidebarSel, menuBtnSel]) => {
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
    'B2 底行三件套齐全（联网 / 模式胶囊 / 发送）',
    portrait.hasWeb && portrait.hasPill && Math.abs(portrait.sendW - portrait.sendH) <= 1,
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
  check(
    'C2 矮横屏隐藏底部说明（省纵向空间）',
    !short.hasNote || short.noteDisplay === 'none',
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
