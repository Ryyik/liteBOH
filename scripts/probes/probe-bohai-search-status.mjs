/**
 * probe-bohai-search-status.mjs — BOH AI「联网搜索状态」端到端探针（2026-10-08）
 *
 * 用户口径：
 *   ① 搜索到的网页标题要**实时**显示在消息流里并**轮换**；
 *   ② 面板**默认折叠**（一行），可展开看全部网页；
 *   ③ **网络搜索期间不显示思考黑点**，黑点只在模型思考（搜索结束→首 token 前）
 *      与流式回复（isLoading）时出现。
 *
 * 手法：拦 `api-key-vault` 按 action 分流 ——
 *   · runtime-search：延迟 1.2s 后返回 3 条带标题/链接的结果（搜索窗口可观察）；
 *   · runtime-chat-stream：延迟 1.5s 后回 SSE —— 「搜索结束→首 token」的思考窗口同样可观察；
 *   · quota-status / user-endpoint-list：常规 mock。
 * 知识检索 RPC 一律回 `[]`（失败被 stage 容忍，不影响本探针）。
 *
 * 用法：BASE=http://localhost:5173 node scripts/probes/probe-bohai-search-status.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || 'debug-screenshots';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 220) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const MOCK_PAGES = [
  { title: '方块之家 BOH 官方发布公告', url: 'https://example.com/boh-announcement' },
  { title: 'BOH AI 使用指南：联网搜索篇', url: 'https://docs.example.org/guide/web-search' },
  { title: '第三方评测：BOH AI 2.5 Beta 体验', url: 'https://review.example.net/boh-2-5' },
];

// ⚠️ 模式表必须给合法清单（mode_id/model_id/display_name 缺一整条被丢）：
// `sendMessage` 在 runtimeAvailableModels 为空时**静默中止**（等 8s 后放弃，只留 warn）——
// 全部 RPC 兜成 [] 会让消息根本不进流（实测踩过）。
const MOCK_MODES = [
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
  // 模式表给合法清单（sendMessage 对空模式表静默中止）；其余 RPC 一律空数组（知识检索失败被 stage 容忍）
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
    return respond({ usedTokens: 12000, tokenLimit: 100000, webSearchUsed: 1, webSearchLimit: 10 });
  }
  if (body.action === 'user-endpoint-list') {
    return respond({ endpoints: [], limits: { endpoints: 8, modelsPerEndpoint: 12 } });
  }
  if (body.action === 'runtime-search') {
    await new Promise((r) => setTimeout(r, 1200)); // 搜索窗口：可观察「检索中、无标题、无黑点」
    return respond({ results: MOCK_PAGES, answer: '' });
  }
  if (body.action === 'runtime-chat-stream') {
    await new Promise((r) => setTimeout(r, 1500)); // 思考窗口：搜索已结束、首 token 未到
    const sse = [
      'data: {"choices":[{"delta":{"content":"根据搜索结果："}}]}',
      'data: {"choices":[{"delta":{"content":"方块之家（BOH）是一个社区产品，"}}]}',
      'data: {"choices":[{"delta":{"content":"本轮联网检索到了 3 篇相关网页。"}}]}',
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
// ⚠️ 伪造登录必须**全程保活**：auth store 的会话同步（auth.ts:776）由 supabase 监听器驱动，
// 沙箱网络黑洞让该回调迟到数秒 ⇒ 「注入-复核两次」仍会被盖回 false（实测：消息根本没发出去、
// 页脚显示未登录）。改为每 400ms 补注一次（只在 false 时翻 true，不重复触发引擎 watcher）。
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
await page.waitForTimeout(400);

await page.waitForSelector('.boh-composer-input', { timeout: 20000 });

// A1 开启联网搜索开关
await page.locator('.boh-cp-icon').first().click();
await page.waitForTimeout(220);
const webOn = await page.evaluate(
  () => document.querySelector('.boh-cp-icon')?.classList.contains('is-on') || false,
);
check('A1 联网开关呈开启态', webOn, `is-on=${webOn}`);

await page.fill('.boh-composer-input', '介绍一下方块之家最近的动态');
await page.locator('.boh-send').click();

// A2 搜索在途：面板可见 + 无标题（检索文案）+ **无黑点**
await page.waitForSelector('.boh-search-row.is-web', { timeout: 8000 });
const duringSearch = await page.evaluate(() => {
  const line = document.querySelector('.boh-search-line');
  const dot = document.querySelector('.boh-thinking-dot');
  return {
    line: line?.textContent.trim() || '',
    dotPresent: !!dot,
    collapsedByDefault: !document.querySelector('.boh-search-pages')?.checkVisibility(),
  };
});
check(
  'A2 搜索在途：纯文本行出现且默认折叠 + 「网页搜索」+ **无黑点**',
  duringSearch.line === '网页搜索' && !duringSearch.dotPresent && duringSearch.collapsedByDefault,
  JSON.stringify(duringSearch),
);

// A3 结果到达：轮换行立刻变成真实网页标题（「实时」= 一次性结果到达即上屏）
await page.waitForFunction(
  () => document.querySelector('.boh-search-line')?.textContent.trim() !== '网页搜索',
  null,
  { timeout: 10000 },
);
const titleShown = await page.evaluate(() =>
  document.querySelector('.boh-search-line')?.textContent.trim(),
);
check(
  'A3 结果到达：轮换行实时显示网页标题',
  MOCK_PAGES.some((p) => p.title === titleShown),
  `「${titleShown}」`,
);

// A4 思考窗口（stream 延迟 1.5s）：搜索已结束 → **黑点出现**，面板仍在轮换
await page.waitForSelector('.boh-thinking-dot', { timeout: 6000 });
const thinkingState = await page.evaluate(() => ({
  dotPresent: !!document.querySelector('.boh-thinking-dot'),
  pillVisible: !!document.querySelector('.boh-search-row.is-web')?.checkVisibility(),
}));
check(
  'A4 思考期：黑点出现（搜索已结束）+ 搜索面板仍在',
  thinkingState.dotPresent && thinkingState.pillVisible,
  JSON.stringify(thinkingState),
);
await page.screenshot({ path: `${OUT}/bohai-search-status-rotating.png` });

// A5 展开清单：3 行、含标题与域名
await page.locator('.boh-search-head').click();
await page.waitForTimeout(240);
const expanded = await page.evaluate(
  (wantTitles) => {
    const pages = document.querySelector('.boh-search-pages');
    const items = [...(pages?.querySelectorAll('li') || [])];
    return {
      visible: !!pages?.checkVisibility(),
      count: items.length,
      hasTitles: wantTitles.every((t) => items.some((li) => li.textContent.includes(t))),
      hasHosts: items.some((li) => /example\.(com|org|net)/.test(li.textContent)),
      links: items.filter((li) => li.querySelector('a[target="_blank"]')).length,
    };
  },
  MOCK_PAGES.map((p) => p.title),
);
check(
  'A5 展开清单：3 条网页、标题与域名齐全、可点出原文',
  expanded.visible &&
    expanded.count === 3 &&
    expanded.hasTitles &&
    expanded.hasHosts &&
    expanded.links === 3,
  JSON.stringify(expanded),
);

// A6 收起：清单隐藏（默认折叠态可往返）
await page.locator('.boh-search-head').click();
await page.waitForTimeout(240);
const collapsedAgain = await page.evaluate(() => {
  const pages = document.querySelector('.boh-search-pages');
  return !pages || !pages.checkVisibility();
});
check('A6 收起后清单隐藏（折叠态往返）', collapsedAgain);

// A7 回复完成：面板整个退场（来源 chip 接管），黑点消失
await page.waitForSelector('.boh-msg-actions', { timeout: 30000 });
await page.waitForTimeout(600);
const afterDone = await page.evaluate(() => {
  const pill = document.querySelector('.boh-search-row.is-web');
  const dot = document.querySelector('.boh-thinking-dot');
  // ⚠️ 不用 :last-of-type —— ai-body 后面还有 chips/actions 的 div，恒匹配不上
  const replyText = [...document.querySelectorAll('.boh-ai-body')]
    .map((el) => el.textContent || '')
    .join('');
  return {
    pillGone: !pill || !pill.checkVisibility(),
    dotGone: !dot,
    replyShown: replyText.includes('方块之家'),
  };
});
check(
  'A7 回复完成：面板退场 + 黑点消失 + 回复正文在场',
  afterDone.pillGone && afterDone.dotGone && afterDone.replyShown,
  JSON.stringify(afterDone),
);
await page.screenshot({ path: `${OUT}/bohai-search-status-done.png` });

check('A8 零 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

clearInterval(keepAuthTimer);
await ctx.close();
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
if (failed.length) {
  failed.forEach((f) => console.log(`FAIL  ${f.name}  --  ${f.detail}`));
  process.exitCode = 1;
}
