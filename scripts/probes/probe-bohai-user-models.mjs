/**
 * probe-bohai-user-models.mjs — 用户自定义厂商 / 模型（BYOK）端到端探针
 *
 * 需求（2026-10-08）：「支持自定义模型厂商和模型，支持填入 Baseurl 与 apikey」。
 * 用户选定的四条口径：用户级自带 Key / 不扣 BOH 额度 / 服务端加密存储 / 混进现有模式选择器。
 *
 * 本探针盯的是**只看截图会漏**的四件事：
 *   ① 上行是否真把 Key 发出去、并原样回来的是**掩码**（不是明文）；
 *   ② 保存后模型是否真的出现在**输入框的模式选择器**里（不是只在设置页列出来）；
 *   ③ 模式行右侧是否写「自有 Key」而不是「免费」（quotaMultiplier 也是 0，极易混）；
 *   ④ 服务端的校验文案是否**原样**展示（换成通用文案用户永远改不对 Base URL）。
 *
 * 未登录场景单独一档：入口必须提示登录，且**不发** user-endpoint-list（省一次 401）。
 *
 * 用法：BASE=http://localhost:5173 node scripts/probes/probe-bohai-user-models.mjs
 *      （或 node scripts/probes/probe-bohai-user-models.mjs http://localhost:5173）
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.BASE || 'http://localhost:5173';
const OUT = 'debug-screenshots';

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail === undefined ? '' : '— ' + detail);
  } else {
    fail += 1;
    console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail);
  }
};

const SEL = {
  modeTrigger: '.boh-mode-pill',
  modePanel: '.boh-mode-menu',
  modeItem: '.boh-mm-item[data-mode-id]',
  modeName: '.boh-mm-name',
  modeRate: '.boh-mm-rate',
  settingsNavItem: '.ai-settings-nav-item',
  modelsSection: '.ai-settings-section[data-section="models"]',
  endpointCard: '.ai-custom-endpoint',
  addButton: '.ai-custom-add button',
  form: '.ai-custom-form',
  saveButton: '.ai-custom-form-actions button.is-primary',
};

const MOCK_MODES = [
  {
    id: 'fast',
    mode_id: 'fast',
    name: 'Fast',
    display_name: 'Fast',
    tagline: '极速响应',
    min_tier: 'free',
    sort_order: 10,
    quota_multiplier: 1,
  },
];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/** 伪造登录：EF 侧被 mock 掉，这里只需要壳认为「已登录」 */
const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user' });
  });
  await page.waitForTimeout(400);
};

/** 打开设置页（入口在侧栏左下角账号浮层里 —— 与 probe-ai-panels 同一套路径） */
const openSettings = async (page) => {
  await page.locator('.boh-account-btn').first().hover();
  await page.waitForTimeout(360);
  await page.locator('.boh-account-actions button', { hasText: '设置' }).first().click();
  await page.waitForSelector('.ai-settings-drawer', { timeout: 8000 });
  await page.waitForTimeout(600);
};

const openModelsSection = async (page) => {
  await page.locator(SEL.settingsNavItem, { hasText: '模型与厂商' }).first().click();
  await page.waitForTimeout(700); // 滚动定位
  return page.evaluate((sel) => {
    const section = document.querySelector(sel);
    if (!section) return null;
    const body = document.querySelector('.ai-settings-body');
    const rect = section.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    return {
      exists: true,
      visible: !!bodyRect && rect.top < bodyRect.bottom && rect.bottom > bodyRect.top,
      text: (section.innerText || '').replace(/\s+/g, ' '),
    };
  }, SEL.modelsSection);
};

// ═════════════════ 场景 A：未登录 ═════════════════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const listed = [];
  await page.route('**/rest/v1/rpc/list_public_bohai_modes*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MODES),
    }),
  );
  await page.route('**/functions/v1/api-key-vault**', async (route) => {
    let action = '';
    try {
      action = JSON.parse(route.request().postData() || '{}')?.action || '';
    } catch {
      action = '';
    }
    if (action === 'user-endpoint-list') listed.push(action);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        action === 'quota-status'
          ? { ok: true, data: { tier: 'guest', usedTokens: 0, tokenLimit: 30000 } }
          : { ok: true, data: { endpoints: [], limits: { endpoints: 8, modelsPerEndpoint: 12 } } },
      ),
    });
  });

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boh-shell', { timeout: 30000 });
  await openSettings(page);
  const section = await openModelsSection(page);
  check(
    'A1 未登录：模型分区存在且可见',
    !!section?.exists && section.visible,
    section?.text?.slice(0, 60),
  );
  check(
    'A2 未登录：提示登录而不是显示表单',
    !!section && section.text.includes('接入你自己的模型') && section.text.includes('登录'),
    section?.text?.slice(0, 80),
  );
  check(
    'A3 未登录：不发 user-endpoint-list（省一次必定 401 的请求）',
    listed.length === 0,
    `调用 ${listed.length} 次`,
  );
  await page.screenshot({ path: `${OUT}/bohai-user-models-guest.png` });
  await ctx.close();
}

// ═════════════════ 场景 B：登录后完整往返（新增 → 进模式选择器 → 删除） ═════════════════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  const MODEL_UUID = '6f1d2c3b-4a59-4e7d-8c1f-0a2b3c4d5e6f';
  const ENDPOINT_UUID = '11112222-3333-4444-5555-666677778888';
  const state = { endpoints: [], upsertBody: null, deleteCalls: 0 };

  const payloadFor = () => ({
    endpoints: state.endpoints,
    limits: { endpoints: 8, modelsPerEndpoint: 12 },
  });

  await page.route('**/rest/v1/rpc/list_public_bohai_modes*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MODES),
    }),
  );
  await page.route('**/functions/v1/api-key-vault**', async (route) => {
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || '{}') || {};
    } catch {
      body = {};
    }
    const respond = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(status === 200 ? { ok: true, data } : data),
      });

    if (body.action === 'quota-status') {
      return respond({ tier: 'pro', usedTokens: 0, tokenLimit: 1000000, baseTokenLimit: 1000000 });
    }
    if (body.action === 'user-endpoint-list') return respond(payloadFor());
    if (body.action === 'user-endpoint-upsert') {
      state.upsertBody = body;
      state.endpoints = [
        {
          id: ENDPOINT_UUID,
          name: body.name,
          baseUrl: body.baseUrl,
          keyMasked: 'sk-1****cdef',
          status: 'active',
          lastTestStatus: '',
          lastTestMessage: '',
          lastTestedAt: '',
          models: (body.models || []).map((m, i) => ({
            id: MODEL_UUID,
            modeId: `user:${MODEL_UUID}`,
            modelId: m.modelId,
            displayName: m.displayName || m.modelId,
            temperature: null,
            maxTokens: null,
            sortOrder: (i + 1) * 10,
          })),
        },
      ];
      return respond(payloadFor());
    }
    if (body.action === 'user-endpoint-delete') {
      state.deleteCalls += 1;
      state.endpoints = [];
      return respond(payloadFor());
    }
    if (body.action === 'user-endpoint-test') {
      return respond({
        ok: true,
        status: 200,
        latencyMs: 90,
        message: '连接成功，端点已返回可用的响应。',
      });
    }
    return respond({ ok: false, message: '探针未 mock 的 action' });
  });

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boh-shell', { timeout: 30000 });
  await injectAuth(page); // 触发引擎侧 loadUserEndpoints

  await openSettings(page);
  const section = await openModelsSection(page);
  check(
    'B1 登录后：模型分区显示「自定义厂商与模型」',
    !!section?.text.includes('自定义厂商与模型'),
  );

  await page.locator(SEL.addButton).first().click();
  await page.waitForSelector(SEL.form, { timeout: 4000 });
  await page.locator(`${SEL.form} [data-field="name"]`).fill('我的中转站');
  await page.locator(`${SEL.form} [data-field="baseUrl"]`).fill('https://api.example.com/v1');
  await page.locator(`${SEL.form} [data-field="apiKey"]`).fill('sk-1234567890abcdef');
  await page.locator(`${SEL.form} [data-field="modelInput"]`).fill('gpt-4o-mini');
  await page.locator(`${SEL.form} [data-field="modelInput"]`).press('Enter');
  await page.waitForTimeout(200);
  const chipCount = await page.locator(`${SEL.form} .ai-custom-chip.is-editable`).count();
  check('B2 模型 ID 回车即加入表单（chip 出现）', chipCount === 1, `chip=${chipCount}`);

  await page.locator(SEL.saveButton).first().click();
  await page.waitForTimeout(900);
  check(
    'B3 上行确实带上了 Base URL / Key / 模型列表',
    state.upsertBody?.baseUrl === 'https://api.example.com/v1' &&
      state.upsertBody?.apiKey === 'sk-1234567890abcdef' &&
      JSON.stringify(state.upsertBody?.models) ===
        JSON.stringify([{ modelId: 'gpt-4o-mini', displayName: '' }]),
    JSON.stringify(state.upsertBody),
  );

  const card = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return {
      id: el.dataset.endpointId,
      text: (el.innerText || '').replace(/\s+/g, ' '),
      masked: el.querySelector('.ai-custom-mask')?.textContent?.trim() || '',
    };
  }, SEL.endpointCard);
  check('B4 保存后出现厂商卡片', !!card && card.id === ENDPOINT_UUID, card?.text?.slice(0, 80));
  check(
    'B5 卡片只显示掩码（明文 Key 绝不下发到页面）',
    card?.masked === 'sk-1****cdef' && !card.text.includes('sk-1234567890abcdef'),
    card?.masked,
  );

  await page.screenshot({ path: `${OUT}/bohai-user-models-saved.png` });

  // ── 关掉设置，去输入框确认模型真的混进了模式选择器 ──
  await page.locator('.ai-settings-back-app').first().click();
  await page.waitForTimeout(500);
  await page.locator(SEL.modeTrigger).first().click();
  await page.waitForSelector(SEL.modePanel, { timeout: 5000 });
  const userMode = await page.evaluate((sel) => {
    const el = document.querySelector(
      `${sel.modeItem}[data-mode-id="user:6f1d2c3b-4a59-4e7d-8c1f-0a2b3c4d5e6f"]`,
    );
    if (!el) return null;
    return {
      name: el.querySelector('.boh-mm-name')?.textContent?.trim() || '',
      rate: el.querySelector('.boh-mm-rate')?.textContent?.trim() || '',
    };
  }, SEL);
  check(
    'B6 自定义模型出现在输入框的模式选择器里（混进现有模式，不是另开下拉）',
    !!userMode,
    JSON.stringify(userMode),
  );
  check(
    'B7 模式行右侧写「自有 Key」而不是「免费」（quotaMultiplier 同为 0，极易混）',
    userMode?.rate === '自有 Key',
    `rate=${userMode?.rate} name=${userMode?.name}`,
  );
  await page.screenshot({ path: `${OUT}/bohai-user-models-in-picker.png` });

  // ── 删除往返：两段式确认 + 删掉后模式必须从选择器消失 ──
  await page.keyboard.press('Escape');
  await page.mouse.click(720, 300);
  await page.waitForTimeout(300);
  await openSettings(page);
  await openModelsSection(page);
  const deleteBtn = page.locator(`${SEL.endpointCard} .ai-custom-actions button.is-danger`).first();
  await deleteBtn.click();
  await page.waitForTimeout(250);
  const confirmLabel = (await deleteBtn.textContent())?.trim() || '';
  const cardsAfterFirstClick = await page.locator(SEL.endpointCard).count();
  await deleteBtn.click();
  await page.waitForTimeout(800);
  const cardsAfterSecondClick = await page.locator(SEL.endpointCard).count();
  check(
    'B9 删除是两段式确认：第一次点只进入确认态、卡片还在',
    cardsAfterFirstClick === 1 && confirmLabel === '确认删除',
    `label=${confirmLabel} cards=${cardsAfterFirstClick}`,
  );
  check(
    'B10 第二次点才真删（卡片消失 + 只删了一次）',
    cardsAfterSecondClick === 0 && state.deleteCalls === 1,
    `cards=${cardsAfterSecondClick} deleteCalls=${state.deleteCalls}`,
  );

  await page.locator('.ai-settings-back-app').first().click();
  await page.waitForTimeout(500);
  await page.locator(SEL.modeTrigger).first().click();
  await page.waitForSelector(SEL.modePanel, { timeout: 5000 });
  const userModeAfterDelete = await page
    .locator(`${SEL.modeItem}[data-mode-id="user:6f1d2c3b-4a59-4e7d-8c1f-0a2b3c4d5e6f"]`)
    .count();
  check(
    'B11 删除后模式从选择器消失（无需刷新页面）',
    userModeAfterDelete === 0,
    `count=${userModeAfterDelete}`,
  );

  check('B8 场景零 pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// ═════════════════ 场景 C：服务端校验文案必须原样展示 ═════════════════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const SERVER_MESSAGE = 'Base URL 必须是 https 地址（明文 http 会在公网泄露你的 Key）。';

  await page.route('**/rest/v1/rpc/list_public_bohai_modes*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MODES),
    }),
  );
  await page.route('**/functions/v1/api-key-vault**', async (route) => {
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || '{}') || {};
    } catch {
      body = {};
    }
    if (body.action === 'quota-status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { tier: 'pro', usedTokens: 0, tokenLimit: 1000000 },
        }),
      });
    }
    if (body.action === 'user-endpoint-upsert') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'USER_ENDPOINT_ERROR', message: SERVER_MESSAGE }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: { endpoints: [], limits: { endpoints: 8, modelsPerEndpoint: 12 } },
      }),
    });
  });

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boh-shell', { timeout: 30000 });
  await injectAuth(page);
  await openSettings(page);
  await openModelsSection(page);
  await page.locator(SEL.addButton).first().click();
  await page.waitForSelector(SEL.form, { timeout: 4000 });
  await page.locator(`${SEL.form} [data-field="name"]`).fill('坏端点');
  await page.locator(`${SEL.form} [data-field="baseUrl"]`).fill('http://api.example.com/v1');
  await page.locator(`${SEL.form} [data-field="apiKey"]`).fill('sk-abcdefghijk');
  await page.locator(`${SEL.form} [data-field="modelInput"]`).fill('gpt-4o-mini');
  await page.locator(`${SEL.form} [data-field="modelInput"]`).press('Enter');
  await page.locator(SEL.saveButton).first().click();
  await page.waitForTimeout(800);
  const formErrorText = await page.evaluate(
    (sel) => document.querySelector(`${sel} .ai-custom-error`)?.textContent?.trim() || '',
    SEL.form,
  );
  check(
    'C1 服务端校验文案原样展示（不是「保存失败，请稍后再试。」）',
    formErrorText === SERVER_MESSAGE,
    formErrorText,
  );
  await ctx.close();
}

await browser.close();
console.log(`\n=== 自定义模型（BYOK）：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
