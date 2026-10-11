/**
 * probe-bohai-keepalive-stream.mjs — 「切走页面不掐流」探针（2026-10-11，方案 A）
 *
 * 要证明的那条因果链（每一步都能单独回归，缺一步结论就不成立）：
 *   ① `/ai-chat` 的 meta 带 `keepAlive` ⇒ App.vue 走 `<KeepAlive>` 那条分支
 *      ⇒ 切页是 **deactivated** 而不是 unmount；
 *   ② 没有 keepAlive 时，unmount 会触发 `useChatEngine` 的 `onScopeDispose`
 *      → `abortController.abort()` ⇒ **流被硬中止**（这是 2026-10-11 之前的真实行为）；
 *   ③ 有 keepAlive 时流继续跑完，回来是**完整**答案。
 *
 * ⚠️ 为什么必须有一条**慢流**：真模型要联网、要钱、耗时不可控；而本探针要断的是
 *    「请求还在不在飞」。更关键的是 —— `route.fulfill` 是**一次性**把 body 给完的，
 *    流会在断言之前就结束，「回来后有内容」就成了恒真的假绿。
 *    哨兵 `KEEPALIVE-SENTINEL` 放在**最后一段** —— 只看「有内容」会假绿
 *    （中止前也已经吐了几段），必须断言哨兵到达 = 流跑到了自然结束。
 *
 * ⚠️ 「慢」是怎么造出来的（不是本地 SSE 服务）：
 *    `route.continue({ url })` 改指协议不被 Playwright 允许（New URL must have same
 *    protocol），而为此在本机起 HTTPS + 自签证书太重。改用 `addInitScript` 注入一个
 *    **fetch 包装**：把一次性拿到的 SSE 文本按事件切开，逐块 `enqueue` 并真的等 320ms。
 *    app 侧读的是标准 `ReadableStream`，对它来说这就是一条正常慢流。
 *
 * ⚠️ 反证（改本探针时必做）：把路由 meta 的 `keepAlive` 去掉再跑，
 *    「A4 回来后含哨兵」必须 FAIL —— 那才说明这条断言真的有牙。
 *
 * 用法：BASE=http://localhost:5173 node scripts/probes/probe-bohai-keepalive-stream.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const SENTINEL = 'KEEPALIVE-SENTINEL';
/** 段数 × 段间隔 ≈ 流的总时长；必须明显长于「切走 + 等一会」的窗口 */
const CHUNKS = ['这', '是', '一', '条', '被', '慢', '慢', '吐', '出', '的', '答', '案', SENTINEL];
const CHUNK_GAP_MS = 320;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + String(detail).slice(0, 200) : ''}`,
  );
};

const SEL = {
  input: '.boh-composer-input',
  send: '.boh-send',
  stop: '.boh-send.is-stop',
  aiBody: '.boh-ai-body',
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
const consoleErrs = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
// 发送失败时引擎只 warn 不抛 —— 不收 console 就只能看到「停止键不出现」，无从判断原因
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrs.push(m.text().slice(0, 140));
});

/** 模式清单 mock（`list_public_bohai_modes`）。⚠️ 必填 `model_id`：normalizeBohaiModelConfigRow
 *  会把缺 model_id 的行整条丢掉 ⇒ `availableModels` 为空 ⇒ `callModelStream` 直接抛
 *  「Model not found」，流根本没起来（症状是「停止键不出现」，很容易误判成 keepAlive 没生效）。 */
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
];

// ⚠️ 同一 path 只注册一条 route（逆序匹配）；catch-all 必须最先注册。
await page.route('**/rest/v1/rpc/list_public_bohai_modes*', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(MOCK_MODES),
  });
});
// SSE 正文一次性给（见文件头：慢速由注入的 fetch 包装重放，不是靠网络）
const SSE_BODY =
  CHUNKS.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join(
    '',
  ) + 'data: [DONE]\n\n';

await page.addInitScript(
  ({ gapMs }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const signal = args[1]?.signal;
      const response = await originalFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (!String(url).includes('api-key-vault')) return response;
      // 只对流式对话重放：quota-status / user-endpoint-list 原样返回
      if (!response.headers.get('content-type')?.includes('text/event-stream')) return response;
      const text = await response.text();
      // 按 SSE 的空行切事件（`data: …\n\n`），逐块喂给 app
      const parts = text.split(/(?<=\n\n)/).filter(Boolean);
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          // ⚠️ 必须接住 abort 信号：app 是 fetch **之后**自己 `response.body.getReader()` 读流的，
          //    真实网络下这条流会被 signal 掐断；不接的话这条 mock 流就**免疫于 abort** ——
          //    探针会变成「有没有 keepAlive 都绿」的假牙（实测踩过，去掉 keepAlive 后照样 PASS）。
          const onAbort = () => {
            try {
              controller.error(new DOMException('Aborted', 'AbortError'));
            } catch {
              /* 流已关闭 */
            }
          };
          if (signal?.aborted) return onAbort();
          signal?.addEventListener('abort', onAbort, { once: true });
          for (const part of parts) {
            if (signal?.aborted) return;
            controller.enqueue(encoder.encode(part));
            await new Promise((resolve) => setTimeout(resolve, gapMs));
          }
          if (!signal?.aborted) controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };
  },
  { gapMs: CHUNK_GAP_MS },
);

await page.route('**/functions/v1/api-key-vault**', async (route) => {
  const body = route.request().postData() || '';
  if (!body.includes('runtime-chat-stream')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: {} }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    body: SSE_BODY,
  });
});

await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(900);

// ── A1 路由 meta 带 keepAlive（源头，改路由的人一眼能看见）────────────────
const meta = await page.evaluate(() => {
  // ⚠️ 路由实例只挂在 app 的 globalProperties 上（`window.__vue_router__` 不存在）
  const app = document.querySelector('#app').__vue_app__;
  const router = app?.config?.globalProperties?.$router;
  const hit = router?.getRoutes?.().find((r) => r.path === '/ai-chat');
  return hit ? { path: hit.path, keepAlive: hit.meta?.keepAlive === true } : null;
});
check('A1 /ai-chat 路由 meta.keepAlive 为 true', !!meta?.keepAlive, JSON.stringify(meta));

// ── A2 发一条，流开始（停止键出现 = 还在飞）──────────────────────────────
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
});
await page.waitForSelector(SEL.input, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.fill(SEL.input, '探针：切走页面时回答不该中断');
await page.locator(SEL.send).click();
const inFlight = await page
  .waitForSelector(SEL.stop, { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(
  'A2 发送后进入生成态（停止键在场 = 流还在飞）',
  inFlight,
  consoleErrs.slice(0, 3).join(' | '),
);

if (!inFlight) {
  console.log('\n[调试] 全部 console 记录：');
  consoleErrs.slice(0, 20).forEach((m) => console.log('   ' + m));
  console.log('流没起来，后面的断言无意义，提前收工');
  await browser.close();
  process.exit(1);
}

// ── A3 只等一小会儿就切走：确保切页发生在哨兵到达**之前** ────────────────
const halfText = await page.evaluate(
  (sel) => [...document.querySelectorAll(sel)].map((n) => n.textContent).join(''),
  SEL.aiBody,
);
// ⚠️ 目标页不能写死 `/forum`：IA 改版后它 302 到 `/#/user-space?tab=posts`（2026-10 实测），
// 断言 hash 字面量会假红。判据用「已经不是 ai-chat」。
await page.evaluate(() => {
  location.hash = '#/forum';
});
await page.waitForTimeout(700);
const onForum = await page.evaluate(() => ({
  hash: location.hash,
  stillAi: document.body.innerText.includes('内容由 AI 生成，请注意核实'),
}));
check(
  'A3 切走后确实离开了 AI 页（此刻哨兵还没到）',
  !onForum.hash.includes('/ai-chat') && !onForum.stillAi && !halfText.includes(SENTINEL),
  JSON.stringify(onForum) + ` half=${halfText.slice(-12)}`,
);

// ── A4 留在别的页面，等后台那条流跑完，再回来 ────────────────────────────
await page.waitForTimeout(CHUNKS.length * CHUNK_GAP_MS + 1200);
await page.evaluate(() => {
  location.hash = '#/ai-chat';
});
await page.waitForSelector(SEL.input, { timeout: 15000 });
await page.waitForTimeout(1200);
const after = await page.evaluate(
  (sel) => ({
    body: [...document.querySelectorAll(sel)].map((n) => n.textContent).join(' | '),
    stillGenerating: !!document.querySelector('.boh-send.is-stop'),
  }),
  SEL.aiBody,
);
check(
  'A4 回来后回答跑到了自然结束（末尾哨兵在场）—— 没有 keepAlive 时这条必 FAIL',
  after.body.includes(SENTINEL) && !after.stillGenerating,
  `body=…${after.body.slice(-60)} stillGenerating=${after.stillGenerating}`,
);

check('A5 全程零 pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(
  `\n──── 合计 ${results.length} 条，失败 ${results.filter((r) => !r.pass).length} 条 ────`,
);
await browser.close();
process.exit(results.some((r) => !r.pass) ? 1 : 0);
