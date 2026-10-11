/**
 * probe-bohai-jump-glass.mjs — 消息流右侧「跳转导航」的**液态玻璃 hover** 探针（2026-10-10）
 *
 * 用户口径：「默认就像几根光秃秃的小横条；hover 变为一个**液态玻璃小圆角**」。
 * 追加（同日）：**「竖屏不需要跳转对话的东西」** ⇒ 场景 B/C 断言竖屏整条隐掉、
 *   横屏（含矮横屏 844×390）仍在 —— 隐掉的只是竖屏，别把横屏一起误伤。
 *
 * ── 为什么值得单独一个探针 ────────────────────────────────────────────
 * 单测（`tests/unit/bohai-quick-sidebar.test.js`）只能锁**源码文本**，锁不住三件事：
 *   ① `backdrop-filter` 是否**真的被应用**（令牌写对了也可能因合成层/降级而不生效）；
 *   ② hover 前后**几何不跳变** —— padding / 圆角 / 边框都必须**常态就占位**；
 *   ③ 常态确实**没有**底色（只有横条）。
 * 该单测里原本就写着「运行时判据实测过（常态 navW≈25 / hover≈148），但因要造会话，
 * 未固化成探针」—— 本文件把那个缺口补上：造 3 轮对话 ⇒ `navItems.length > 1`
 * ⇒ `.boh-jump` 才会出现（`v-if="navItems.length > 1"`）。
 *
 * 手法：拦 `api-key-vault` 与 `rest/v1/rpc/**`，模型回固定 SSE（不调真模型）。
 * 用法：BASE=http://localhost:5173 node scripts/probes/probe-bohai-jump-glass.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 240) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

// ⚠️ 模式表必须给合法清单：`sendMessage` 在可用模式为空时**静默中止**（等 8s 后放弃）。
const MOCK_MODES = [
  {
    id: 'air',
    mode_id: 'air',
    model_id: 'deepseek-ai/DeepSeek-V3',
    name: 'Air',
    display_name: 'Air',
    tagline: '均衡',
    min_tier: 'free',
    status: 'active',
    sort_order: 20,
    quota_multiplier: 1,
  },
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

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));

await page.route('**/rest/v1/rpc/**', (route) => {
  if (route.request().url().includes('list_public_bohai_modes')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MODES),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});

await page.route('**/functions/v1/api-key-vault**', async (route) => {
  let body = {};
  try {
    body = route.request().postDataJSON() || {};
  } catch {
    body = {};
  }
  const respond = (data) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });

  if (body.action === 'quota-status') {
    return respond({ usedTokens: 12000, tokenLimit: 100000, webSearchUsed: 0, webSearchLimit: 10 });
  }
  if (body.action === 'user-endpoint-list') {
    return respond({ endpoints: [], limits: { endpoints: 8, modelsPerEndpoint: 12 } });
  }
  if (body.action === 'runtime-chat-stream') {
    const sse = [
      'data: {"choices":[{"delta":{"content":"这是第 N 条回复，用来凑出多条用户消息。"}}]}',
      'data: [DONE]',
      '',
    ].join('\n\n');
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, message: '探针未 mock 的 action' }),
  });
});

await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
// ⚠️ 伪造登录必须**全程保活**：会话同步由 supabase 监听器驱动，沙箱网络黑洞会让回调迟到数秒，
// 只注入一次会被盖回 false（表现为消息根本没发出去）。
const keepAuthTimer = setInterval(() => {
  page
    .evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
      const auth = pinia?.state.value?.auth;
      if (auth && !auth.isLoggedIn) {
        auth.isLoggedIn = true;
        if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user' });
      }
    })
    .catch(() => {});
}, 400);
await page.waitForTimeout(1100);
const authStuck = await page.evaluate(() => {
  const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
  return pinia?.state.value?.auth?.isLoggedIn === true;
});
check('A0 伪造登录站稳（保活定时器覆盖迟到的会话同步）', authStuck);

await page.waitForSelector('.boh-composer-input', { timeout: 20000 });

// ── 造 2 轮对话：`navItems.length > 1` 才会渲染 `.boh-jump` ──
// ⚠️ **必须遵守 `MIN_INTERVAL_MS`（1000ms，见 `chat-engine-config.js`）**：
//    `sendMessage` 里有 `checkRateLimit()`，间隔不够会被**静默拦截**（输入框内容保留、
//    不报错、不产生气泡）—— 实测 400ms 间隔时第 2 条永远发不出去。
// ⚠️ 发失败时**不能崩**：探针的职责是「红」，不是抛异常（否则后面的汇总行都打不出来）。
let sent = 0;
for (const n of [1, 2]) {
  await page.fill('.boh-composer-input', `第 ${n} 条问题`);
  await page.click('.boh-send');
  try {
    await page.waitForFunction(
      (want) => document.querySelectorAll('.boh-msg.is-user').length >= want,
      n,
      { timeout: 9000 },
    );
    sent = n;
    await page.waitForSelector('.boh-msg-actions', { timeout: 15000 });
    await page.waitForTimeout(1400); // > MIN_INTERVAL_MS，给下一条留出发送窗口
  } catch {
    break;
  }
}

const diag = await page.evaluate(() => ({
  msgs: document.querySelectorAll('.boh-msg').length,
  users: document.querySelectorAll('.boh-msg.is-user').length,
  input: document.querySelector('.boh-composer-input')?.value ?? null,
  sendDisabled: document.querySelector('.boh-send')?.disabled ?? null,
  rateLimited: document.querySelector('.boh-cp-alert')?.textContent?.trim() || '',
}));
check(
  'A1 造出 2 轮对话（每轮都真的进了消息流）',
  sent === 2,
  `sent=${sent} ${JSON.stringify(diag)}`,
);

const jumpCount = await page.locator('.boh-jump').count();
check('A2 跳转导航出现（navItems.length > 1）', jumpCount === 1, `count=${jumpCount}`);

/** 读「卡片几何」——hover 前后必须完全一致（跳变 = 卡片样式没在常态占位） */
const geometry = () =>
  page.evaluate(() => {
    const el = document.querySelector('.boh-jump');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
      borderWidth: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
    };
  });

/** 读「卡片材质 + 摘要展开度」 */
const material = () =>
  page.evaluate(() => {
    const el = document.querySelector('.boh-jump');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const label = document.querySelector('.boh-jump-label');
    return {
      bg: cs.backgroundColor,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
      labelMaxWidth: label ? parseFloat(getComputedStyle(label).maxWidth) : -1,
    };
  });

const alphaOf = (color) => {
  const m = String(color).match(/rgba?\(([^)]+)\)/);
  if (!m) return -1;
  const parts = m[1].split(',').map((v) => parseFloat(v));
  return parts.length === 4 ? parts[3] : 1;
};

// ⚠️ 跳转导航不在时**只报红、不崩**（否则后面的汇总行打不出来）
if (jumpCount !== 1) {
  for (const name of [
    'A3 常态：无底色 + 无 backdrop-filter + 摘要折叠到 0 宽',
    'A4 hover：backdrop-filter 真的生效（blur > 0）+ 底色半透明（不是实心白）',
    'A5 hover：摘要展开（max-width > 0）',
    'A6 几何不跳变：padding / border-width / border-radius 前后一致',
    'A7 移开鼠标：底色收回 + 摘要收起',
  ]) {
    check(name, false, '找不到 .boh-jump（A1/A2 失败导致）');
  }
} else {
  // ── A3 常态：只有横条（无底色、无玻璃、摘要折叠）──
  const before = await material();
  const geomBefore = await geometry();
  check(
    'A3 常态：无底色 + 无 backdrop-filter + 摘要折叠到 0 宽',
    !!before &&
      alphaOf(before.bg) === 0 &&
      /none|^$/.test(before.backdrop) &&
      before.labelMaxWidth === 0,
    JSON.stringify(before),
  );

  // ── A4 hover：液态玻璃小圆角 ──
  await page.hover('.boh-jump');
  await page.waitForTimeout(420); // 200ms 过渡 + 余量
  const after = await material();
  const geomAfter = await geometry();
  const blurPx = parseFloat((String(after?.backdrop).match(/blur\(([\d.]+)px\)/) || [])[1] || '0');
  check(
    'A4 hover：backdrop-filter 真的生效（blur > 0）+ 底色半透明（不是实心白）',
    !!after && blurPx > 0 && alphaOf(after.bg) > 0 && alphaOf(after.bg) < 1,
    `backdrop=${after?.backdrop} bg=${after?.bg} blurPx=${blurPx} alpha=${alphaOf(after?.bg)}`,
  );

  // ── A5 hover 展开摘要（这是 hover 的另一半语义，别被玻璃挤掉）──
  check(
    'A5 hover：摘要展开（max-width > 0）',
    !!after && after.labelMaxWidth > 0,
    `labelMaxWidth=${after?.labelMaxWidth}`,
  );

  // ── A6 几何不跳变：padding / 边框 / 圆角 hover 前后逐字相同 ──
  check(
    'A6 几何不跳变：padding / border-width / border-radius 前后一致',
    !!geomBefore &&
      !!geomAfter &&
      geomBefore.padding === geomAfter.padding &&
      geomBefore.borderWidth === geomAfter.borderWidth &&
      geomBefore.radius === geomAfter.radius,
    `${JSON.stringify(geomBefore)} → ${JSON.stringify(geomAfter)}`,
  );

  // ── A7 移开：收起（回到 A2 的常态）──
  await page.mouse.move(40, 40);
  await page.waitForTimeout(420);
  const away = await material();
  check(
    'A7 移开鼠标：底色收回 + 摘要收起',
    !!away && alphaOf(away.bg) === 0 && away.labelMaxWidth === 0,
    JSON.stringify(away),
  );
}

// ── B / C 竖屏适配（2026-10-10 用户口径「竖屏不需要跳转对话的东西」）──────────
// 用 `setViewportSize` 翻 orientation：媒体查询按视口算，所以同一个页面实例即可。
// ⚠️ 这几条**不放进上面的 if 守卫**：元素缺失时它们应当「红」而不是被静默跳过。
await page.mouse.move(40, 40);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(280);
const portrait = await page.evaluate(() => {
  const el = document.querySelector('.boh-jump');
  return {
    exists: !!el,
    display: el ? getComputedStyle(el).display : 'none',
    visible: !!el?.checkVisibility(),
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
});
check(
  'B1 竖屏 390×844：跳转导航整条隐掉（display:none）',
  portrait.exists && portrait.display === 'none' && !portrait.visible,
  JSON.stringify(portrait),
);
check(
  'B2 竖屏无横向溢出（浮栏撤掉后不该撑破视口）',
  portrait.overflowX <= 1,
  `overflowX=${portrait.overflowX}`,
);

await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(280);
const tabletPortrait = await page.evaluate(() => {
  const el = document.querySelector('.boh-jump');
  return { display: el ? getComputedStyle(el).display : 'none' };
});
check(
  'B3 平板竖屏 768×1024：同样隐掉',
  tabletPortrait.display === 'none',
  JSON.stringify(tabletPortrait),
);

// C 回归：隐掉的**只是竖屏**，横屏（含矮横屏 844×390）必须还在。
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(280);
const landscape = await page.evaluate(() => {
  const el = document.querySelector('.boh-jump');
  return { display: el ? getComputedStyle(el).display : 'none' };
});
check(
  'C1 横屏 844×390：跳转导航仍在（隐掉的只是竖屏）',
  landscape.display === 'flex',
  JSON.stringify(landscape),
);

check('A8 零 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

clearInterval(keepAuthTimer);
await ctx.close();
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('\n失败项：');
  for (const f of failed) console.log(`  · ${f.name}\n    ${f.detail}`);
  process.exitCode = 1;
}
