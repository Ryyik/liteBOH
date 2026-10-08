/**
 * probe-bohai-quota-percent.mjs — 额度**只显示百分比 + 主指标是剩余**的口径探针
 *
 * 用户口径（2026-10-08，第二版）：
 *   「订阅页面、AI 页面统一不再展示额度，只用百分比显示，不再展示你还有多少 token；
 *     若有附加包，则可以显示 150%，以此类推。」
 *   →「还是显示用户当日剩余百分比额度比较好，Max 就显示剩余 625%。」
 *
 * 尺子是**唯一的**：最低付费档 Plus = 100% ⇒ Pro 250% / Max 625% / Ultra 1250%，
 * 附加包在同一把尺子上相加。所以「Max 刚过 0 点、没消耗」必须显示 **剩余 625%**。
 *
 * 这条口径有四个**截图看不出来**的坑，本探针逐个打：
 *   ① 尺子选错看不出来：同一个 Max 账号，用「以自己额度为 100%」的旧尺子会得到
 *      「剩余 100%」，用「Plus = 100%」才是 625% —— 两个数都像「合理的百分比」，
 *      只有断言能分辨（用户就是被前者误导，连问两次「为啥 Max 也是 100%」）。
 *   ② 分母错了看不出来：percent 必须相对**基础额度**（625 × 220/2500k = 138%），
 *      相对总量算会得到 125% 一类的另一个「合理」数。
 *   ③ 剩余是 625% 这种三位数，若被直接当进度条 width，条会长到容器外 6 倍；
 *      必须用归一后的 meterPercent（已用 ÷ 总额）。
 *   ④ 「不再展示 token」是**否定断言**：要真的去文本里搜 Token 数字，
 *      否则改回 `已用 123,456` 这行也没人拦（这类"删掉某个东西"的需求只能反着测）。
 *
 * 四个场景：Max 无消耗（625%）/ Max 带附加包且有消耗 / 老 EF 形状降级 / 不限量。
 *
 * 用法：先起 dev（vite dev 只绑 IPv6 ⇒ `--host ::`），再
 *   node scripts/probes/probe-bohai-quota-percent.mjs http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:5173';
const OUT = process.argv[3] || 'debug-screenshots';

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

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/** 任何形如 123,456 / '+25 万 Token' / 'Tokens' 的痕迹都算「又暴露了绝对额度」 */
const ABSOLUTE_QUOTA = /Tokens|万\s*Token|\d{1,3},\d{3}/;

const routeVault = async (page, quotaData) => {
  await page.route('**/functions/v1/api-key-vault**', async (route) => {
    let action = '';
    try {
      action = JSON.parse(route.request().postData() || '{}')?.action || '';
    } catch {
      action = '';
    }
    if (action === 'quota-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: quotaData }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, message: '探针环境不调用真实后端' }),
    });
  });
};

const openAiChat = async (page) => {
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boh-shell', { timeout: 30000 });
  await page.waitForSelector('.boh-account-btn', { timeout: 15000 });
  await page.waitForTimeout(1200); // 等 onMounted 的 fetchTodayQuota 落地
};

const readAccountPop = async (page) => {
  await page.locator('.boh-account-btn').first().hover();
  await page.waitForTimeout(360);
  return page.evaluate(() => {
    const pop = document.querySelector('.boh-account-pop');
    if (!pop) return null;
    const bar = pop.querySelector('.boh-account-quota-track i');
    return {
      label: pop.querySelector('.boh-account-quota-head span')?.textContent.trim() || '',
      value: pop.querySelector('.boh-account-quota-head b')?.textContent.trim() || '',
      foot: pop.querySelector('.boh-account-quota-foot')?.textContent.trim() || '',
      barWidth: bar?.style.width || '',
      text: (pop.innerText || '').replace(/\s+/g, ' '),
    };
  });
};

const openSettingsUsageCard = async (page) => {
  await page.locator('.boh-account-btn').first().hover();
  await page.waitForTimeout(360);
  await page.locator('.boh-account-actions button', { hasText: '设置' }).first().click();
  await page.waitForSelector('.ai-settings-drawer', { timeout: 8000 });
  await page.waitForTimeout(1600); // 面板惰性挂载 + 面板自己那次 quota-status 落地
  return page.evaluate(() => {
    const card = document.querySelector('.ai-settings-quota-overview');
    if (!card) return null;
    const track = card.querySelector('.ai-settings-quota-track');
    const bar = card.querySelector('.ai-settings-quota-track span');
    return {
      label: card.querySelector('.ai-settings-quota-head span')?.textContent.trim() || '',
      value: card.querySelector('.ai-settings-quota-head strong')?.textContent.trim() || '',
      values: [...card.querySelectorAll('.ai-settings-quota-values > span')].map((n) =>
        n.textContent.trim(),
      ),
      foot: [...card.querySelectorAll('.ai-settings-quota-foot > span')].map((n) =>
        n.textContent.trim(),
      ),
      ariaMax: track?.getAttribute('aria-valuemax') || '',
      ariaNow: track?.getAttribute('aria-valuenow') || '',
      barWidth: bar?.style.width || '',
      text: (card.innerText || '').replace(/\s+/g, ' '),
    };
  });
};

/** 每个场景都跑同一套「两个界面 + 三条硬约束」，只有期望值不同 */
const runScenario = async ({ code, title, quotaData, expect, shot }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await routeVault(page, quotaData);
  await openAiChat(page);

  const pop = await readAccountPop(page);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}.png` });
  check(
    `${code}1 ${title}·账号浮层抬头写「今日剩余」且值 = ${expect.remaining}`,
    pop?.label === '今日剩余' && pop?.value === expect.remaining,
    `label=${pop?.label} value=${pop?.value}`,
  );
  check(
    `${code}2 ${title}·账号浮层进度条归一（${expect.meter}）`,
    pop?.barWidth === expect.meter,
    `width=${pop?.barWidth}`,
  );
  check(
    `${code}3 ${title}·账号浮层不出现 Token 绝对数（用户点名去掉）`,
    !!pop && !ABSOLUTE_QUOTA.test(pop.text),
    pop?.text,
  );

  const card = await openSettingsUsageCard(page);
  check(
    `${code}4 ${title}·设置页抬头「今日剩余 ${expect.remaining}」`,
    card?.label === '今日剩余' && card?.value === expect.remaining,
    card ? `${card.label} ${card.value}` : '未找到用量卡',
  );
  check(
    `${code}5 ${title}·设置页已用 ${expect.used}${expect.pack ? ` / ${expect.pack}` : ''}`,
    !!card &&
      card.values[0] === `已用 ${expect.used}` &&
      (expect.pack ? card.values[1] === expect.pack : card.values.length === 1),
    card?.values.join(' | '),
  );
  // 剩余是 625% 这种三位数 ⇒ 条宽必须用归一值，否则条会长到容器外
  check(
    `${code}6 ${title}·设置页条宽归一 ${expect.meter}（不是 ${expect.remaining}）`,
    card?.barWidth === expect.meter,
    `width=${card?.barWidth}`,
  );
  check(
    `${code}7 ${title}·设置页 aria 量程 = 0–100（读屏不会把量程报成 625）`,
    card?.ariaMax === '100',
    `aria-valuemax=${card?.ariaMax} aria-valuenow=${card?.ariaNow}`,
  );
  check(
    `${code}8 ${title}·设置页不出现 Token 绝对数`,
    !!card && !ABSOLUTE_QUOTA.test(card.text),
    card?.text,
  );
  check(`${code}9 ${title}·场景零 pageerror`, errors.length === 0, errors.slice(0, 2).join(' | '));

  if (shot) {
    // 截图前把用量卡滚进视口 —— 否则拍到的永远只是设置页顶部（看截图根本看不出额度口径）
    await page.evaluate(() => {
      document.querySelector('.ai-settings-quota-overview')?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/${shot}-card.png` });
  }
  await ctx.close();
};

// ═══════════ 场景 A：Max 无消耗 ⇒ 剩余 625%（用户点名的那个数） ═══════════
// 尺子唯一性的核心场景：旧口径（以自己额度为 100%）在这里会给出「剩余 100%」。
await runScenario({
  code: 'A',
  title: 'Max 无消耗',
  quotaData: {
    unit: 'tokens',
    tier: 'max',
    used: 0,
    limit: 2500000,
    usedTokens: 0,
    tokenLimit: 2500000,
    baseTokenLimit: 2500000,
    bonusTokens: 0,
    remainingTokens: 2500000,
    webSearchUsed: 0,
    webSearchLimit: 120,
    webSearchRemaining: 120,
    resetAt: '',
    pointsMode: false,
  },
  expect: { remaining: '625%', used: '0%', meter: '0%', pack: '' },
  shot: 'bohai-quota-percent-max',
});

// ═══════════ 场景 B：Max + 附加包 + 有消耗 ⇒ 剩余 550% ═══════════
// Max 基础 250 万（= Plus 的 625%）、Coding Lite 加 25 万（= +62.5%）、已用 55 万。
//   已用  = 625 × 55/250  = 137.5% → 138%
//   总额  = 625 × 275/250 = 687.5% → 688%
//   剩余  = 687.5 − 137.5 = 550%
//   条宽  = 137.5 / 687.5 = 20%
await runScenario({
  code: 'B',
  title: 'Max 带附加包且有消耗',
  quotaData: {
    unit: 'tokens',
    tier: 'max',
    used: 550000,
    limit: 2750000,
    usedTokens: 550000,
    tokenLimit: 2750000,
    baseTokenLimit: 2500000,
    bonusTokens: 250000,
    remainingTokens: 2200000,
    webSearchUsed: 3,
    webSearchLimit: 130,
    webSearchRemaining: 127,
    resetAt: '',
    pointsMode: false,
  },
  expect: { remaining: '550%', used: '138%', meter: '20%', pack: '含附加包 · 总额 688%' },
  shot: 'bohai-quota-percent-pack',
});

// ═══════════ 场景 C：老 EF 形状（不返回 baseTokenLimit）⇒ 降级不猜包 ═══════════
// 故意**不返回** baseTokenLimit / bonusTokens —— 老版本 Edge Function 的形状，
// 前端必须降级成「总量即分母、包归零」，绝不能凭空显示一个附加包区段。
// Plus 档：88/100 → 已用 88%，剩余 12%（Plus 的尺子就是 100%）。
await runScenario({
  code: 'C',
  title: '老 EF 形状降级（Plus）',
  quotaData: {
    unit: 'tokens',
    tier: 'plus',
    used: 88000,
    limit: 100000,
    usedTokens: 88000,
    tokenLimit: 100000,
    remainingTokens: 12000,
    webSearchUsed: 9,
    webSearchLimit: 10,
    webSearchRemaining: 1,
    resetAt: '',
    pointsMode: false,
  },
  expect: { remaining: '12%', used: '88%', meter: '88%', pack: '' },
});

// ═══════════ 场景 D：不限量（limit = -1） ═══════════
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await routeVault(page, {
    unit: 'tokens',
    tier: 'max',
    used: 0,
    limit: -1,
    usedTokens: 0,
    tokenLimit: -1,
    baseTokenLimit: -1,
    bonusTokens: 0,
    remainingTokens: -1,
    webSearchUsed: 0,
    webSearchLimit: -1,
    webSearchRemaining: -1,
    resetAt: '',
    pointsMode: false,
  });
  await openAiChat(page);

  const pop = await readAccountPop(page);
  check('D1 不限量·账号浮层显示 ∞（不是 0% / 625%）', pop?.value === '∞', `value=${pop?.value}`);

  const card = await openSettingsUsageCard(page);
  check(
    'D2 不限量·设置页显示 ∞ / 不限用量（且不写 Plus = 100%）',
    !!card &&
      card.value === '∞' &&
      card.text.includes('不限用量') &&
      !card.text.includes('Plus = 100%'),
    card ? `${card.value} | ${card.text.slice(0, 60)}` : '未找到用量卡',
  );
  check('D3 不限量·场景零 pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();

console.log(`\n=== 额度百分比口径：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
