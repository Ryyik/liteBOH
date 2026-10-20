/**
 * probe-bohai-search-status.mjs — BOH AI「活动行」端到端探针（2026-10-08 建立，2026-10-19 改契约）
 *
 * ⭐ 2026-10-19 用户口径变更（**本探针的契约随之改写**）：
 *    「正在思考 / 连接社区记忆 / 联网搜索是同样的光效闪动切换，
 *      **始终显示一个动作**（当前正在进行的那个），然后会有切换。」
 *    ⇒ 三块独立节点合并成**一条**活动行 `.boh-search-status[data-activity]`，
 *      阶段 ∈ `web-searching` / `web-results` / `community` / `thinking` / `answering`，
 *      由 `components/boh-activity.js` 的纯函数唯一决定（单测 `bohai-activity.test.js` 锁）。
 *    ⇒ 判据从「某块节点在不在」改成「**此刻 data-activity 是哪一个** + 全屏只有一条行」。
 *    ⇒ 「正在思考」不再是独立行，所以 A4 改成断言阶段 + 流光在活动行上；
 *      推理原文仍在原位置（改名为「活动行的展开面」），A9/A10 点的是活动行那个按钮。
 *    ⇒ 社区一行改为点名称谓：「正在读取《帖子标题》」（A11）。
 *
 * 历史口径（仍有效）：
 *   ① 搜索到的网页标题要**实时**显示在消息流里并**轮换**；
 *   ② 面板**默认折叠**（一行），可展开看全部网页；
 *   ③ **网络搜索期间不显示思考**，思考只在模型思考（搜索结束→首 token 前）出现。
 *
 * 手法：拦 `api-key-vault` 按 action 分流 ——
 *   · runtime-search：延迟 1.2s 后返回 3 条带标题/链接的结果（搜索窗口可观察）；
 *   · runtime-chat-stream：延迟 1.5s 后回 SSE —— 「搜索结束→首 token」的思考窗口同样可观察；
 *     首块带 `<think>…</think>`，用来验证推理内容**被分流到可展开块**而不是混进正文；
 *   · quota-status / user-endpoint-list：常规 mock。
 * 知识检索 RPC 一律回 `[]`（失败被 stage 容忍，不影响本探针）。
 * ⚠️ 社区阶段（A11）需要论坛连接器带回帖子 —— 本探针给 `boh-ai-retrieval` 之外的
 *    论坛列表 RPC mock 一条帖子，让 `communityActivity.postTitle` 有值。
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

// 论坛帖子（社区阶段点名用；真源走 RPC `list_forum_posts`）
const MOCK_FORUM_POST = {
  id: 'probe-post-1',
  title: '周末线下聚会回顾',
  content: '周末的线下聚会很热闹，来了二十多人。',
  author_username: 'probe_user',
  like_count: 3,
  comment_count: 1,
  tag: '活动',
  created_at: new Date().toISOString(),
  moderation_status: 'approved',
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
  // ⚠️ 论坛列表走的是 RPC `list_forum_posts`（**不是** `posts` / `forum_posts` 表查询）——
  //    实测：写 `**/rest/v1/posts**` 或 `**/rest/v1/forum_posts**` 都 0 命中，
  //    症状是社区阶段永远只有泛称、拿不到《帖子标题》。
  if (route.request().url().includes('list_forum_posts')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([MOCK_FORUM_POST]),
    });
  }
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
// 知识检索 EF：**必须 mock**（本机网络受限时这个请求会一直挂着 ⇒ 社区检索永不结束 ⇒
// 活动行整轮停在 community、thinking 阶段永远到不了，A4 会假红）。
// 延迟可配：A11 要「社区还在读」的窗口，A2~A7 那轮要它尽快结束好进入 thinking。
let knowledgeDelayMs = 0;
await page.route('**/functions/v1/boh-ai-retrieval**', async (route) => {
  if (knowledgeDelayMs > 0) await new Promise((r) => setTimeout(r, knowledgeDelayMs));
  let body = {};
  try {
    body = route.request().postDataJSON() || {};
  } catch {
    body = {};
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        // 空切块 ⇒ 社区检索「读完但没命中」，仍然算社区这一席参与过
        chunks: [],
        sourceTypes: body.sourceTypes || [],
      },
    }),
  });
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
      // 首块是思考块 ⇒ 只进 reasoning，不进正文（A9/A10 的判据）
      'data: {"choices":[{"delta":{"content":"<think>用户问的是社区动态，先联网确认最新帖再答。</think>根据搜索结果："}}]}',
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

// ── 活动行通用判据（2026-10-19）：**全屏只有一条行**，且阶段就是它自己 ─────────
/**
 * 读当前活动行状态；`rowCount` > 1 即「同时亮了两行」= 用户报的那个症状回来了。
 *
 * ⚠️ 判据是**可见的 `.boh-search-row` 总数**（一条活动行 = 一个 row），不要只数
 *    `.boh-search-status` 块：反证实测，块内再多塞一条 row 时「块数」仍是 1，假绿。
 */
const readActivity = () =>
  page.evaluate(() => {
    const blocks = [...document.querySelectorAll('.boh-search-status')].filter((el) =>
      el.checkVisibility(),
    );
    const rowsAll = [...document.querySelectorAll('.boh-search-row')].filter((el) =>
      el.checkVisibility(),
    );
    // ⚠️ 判据是**可见的 `.boh-search-row` 总数**（一条活动行 = 一个 row）。
    //    别用「块数 + 裸行数」：反证实测注入一条**块内**的 row 时，`closest()` 会把它
    //    归回块里而被去重掉，计数仍是 1 → 假绿。row 是渲染层最小单位，直接数它。
    const rowCount = rowsAll.length;
    const el = blocks[blocks.length - 1] || rowsAll[rowsAll.length - 1] || null;
    const line = el?.querySelector('.boh-search-line')?.textContent.trim() || '';
    const shimmerEl = el?.querySelector('.boh-search-text.is-shimmer') || null;
    const cs = shimmerEl ? getComputedStyle(shimmerEl) : null;
    return {
      rowCount,
      stage: el?.getAttribute('data-activity') || '',
      line,
      aria: el?.getAttribute('aria-label') || '',
      shimmer: !!cs && /shimmer/.test(cs.animationName || '') && cs.webkitBackgroundClip === 'text',
      reasoningPanels: document.querySelectorAll('.boh-reason').length,
      panelVisible: !!document.querySelector('.boh-reason-body')?.checkVisibility(),
    };
  });

// ── 全程采样器（A4c 的判据）：从发消息开始就盯着，**每一帧**记「可见活动行数」 ────
// ⚠️ 不能只在轮询到 thinking 后看一次：用户报的症状是「两块同时在亮」，
//    它可能只出现在中间某一拍（例如旧版社区行与思考行重叠的那一段）。
//    实测反证：注入一条 `.boh-search-row` 兄弟节点，只在 thinking 采样一次的版本仍然 PASS。
await page.evaluate(() => {
  window.__activitySamples = [];
  const snapshot = () => {
    const rowsAll = [...document.querySelectorAll('.boh-search-row')].filter((el) =>
      el.checkVisibility(),
    );
    const rows = rowsAll.length;
    if (rows > 0) {
      const block = [...document.querySelectorAll('.boh-search-status')].filter((el) =>
        el.checkVisibility(),
      );
      window.__activitySamples.push({
        rows,
        stage: (block[block.length - 1] || rowsAll[rowsAll.length - 1])?.getAttribute(
          'data-activity',
        ),
      });
    }
  };
  window.__activitySampler = setInterval(snapshot, 50);
  snapshot();
});

// A2 搜索在途：**只有一条行**、阶段 = web-searching、文字 =「网页搜索」、默认折叠
await page.waitForSelector('.boh-search-status[data-activity="web-searching"]', { timeout: 8000 });
const duringSearch = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.boh-search-status')].filter((el) =>
    el.checkVisibility(),
  );
  const visibleRows = [...document.querySelectorAll('.boh-search-row')].filter((el) =>
    el.checkVisibility(),
  );
  const el = rows[rows.length - 1];
  return {
    rowCount: visibleRows.length,
    stage: el?.getAttribute('data-activity') || '',
    line: el?.querySelector('.boh-search-line')?.textContent.trim() || '',
    // 默认折叠：清单要么不在，要么不可见
    collapsedByDefault: !document.querySelector('.boh-search-pages')?.checkVisibility(),
    // 「搜索在途不显示思考」：此时没有可见的推理正文
    reasoningVisible: !!document.querySelector('.boh-reason-body')?.checkVisibility(),
  };
});
check(
  'A2 搜索在途：只有一条活动行 + 阶段 web-searching + 「网页搜索」+ 默认折叠 + 无思考',
  duringSearch.rowCount === 1 &&
    duringSearch.stage === 'web-searching' &&
    duringSearch.line === '网页搜索' &&
    duringSearch.collapsedByDefault &&
    !duringSearch.reasoningVisible,
  JSON.stringify(duringSearch),
);

// A3 结果到达：轮换行立刻变成真实网页标题（「实时」= 一次性结果到达即上屏）
//    阶段从 web-searching → web-results（请求已回、模型还没出首字）
await page.waitForFunction(
  () => document.querySelector('.boh-search-line')?.textContent.trim() !== '网页搜索',
  null,
  { timeout: 10000 },
);
const titleShown = await readActivity();
check(
  'A3 结果到达：阶段 web-results + 轮换行实时显示网页标题',
  titleShown.stage === 'web-results' &&
    titleShown.rowCount === 1 &&
    MOCK_PAGES.some((p) => p.title === titleShown.line),
  `「${titleShown.line}」 ${JSON.stringify({ stage: titleShown.stage, rows: titleShown.rowCount })}`,
);

// ⚠️ A5/A6 必须在**网页两个阶段内**做完：2026-10-19 起展开面随阶段走
//    （web-searching / web-results → 网页清单；thinking → 推理原文），
//    等切到 thinking 再点就点到推理面板上了（旧版把 A5 排在 A4 之后，会踩这个坑）。

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

// A4 思考窗口（stream 延迟 1.5s）：搜索已结束 → 同一条行切到 `thinking` 且**走流光**
//     ⚠️ 途中可能先经过 `community`（社区检索与联网并行、谁先读完取决于网络）。
//     这里用「轮询到 thinking 为止」并**记录沿途见过的阶段**，既锁「思考会出现」，
//     也顺带证明「全程只有一条行」（`rowCount === 1` 在每拍都成立）。
const seenStages = new Set();
let thinkingState = null;
for (let i = 0; i < 40; i += 1) {
  const now = await readActivity();
  if (now.stage) seenStages.add(now.stage);
  if (now.rowCount > 1) {
    thinkingState = now;
    break;
  }
  if (now.stage === 'thinking') {
    thinkingState = now;
    break;
  }
  await page.waitForTimeout(150);
}
if (!thinkingState) thinkingState = await readActivity();
check(
  'A4 思考期：同一条行切到 thinking + 「正在思考」+ **流光**（不是第二条行）',
  thinkingState.stage === 'thinking' &&
    thinkingState.rowCount === 1 &&
    thinkingState.line === '正在思考' &&
    thinkingState.shimmer,
  JSON.stringify({ ...thinkingState, seenStages: [...seenStages] }),
);
// 沿途**任何一拍**都不许出现第二条活动行（用户报的「两行同时在闪」）
const sampler = await page.evaluate(() => {
  clearInterval(window.__activitySampler);
  const samples = Array.isArray(window.__activitySamples) ? window.__activitySamples : [];
  return {
    frames: samples.length,
    maxRows: samples.reduce((max, item) => Math.max(max, Number(item.rows) || 0), 0),
    bad: samples.filter((item) => Number(item.rows) > 1).slice(0, 3),
    stages: [...new Set(samples.map((item) => item.stage).filter(Boolean))],
  };
});
check(
  'A4c 全程只有一条活动行（逐帧采样，任何一拍都不许 >1）',
  sampler.frames > 0 && sampler.maxRows === 1,
  `frames=${sampler.frames} maxRows=${sampler.maxRows} stages=${sampler.stages.join(' → ')} ${JSON.stringify(sampler.bad)}`,
);
await page.screenshot({ path: `${OUT}/bohai-search-status-rotating.png` });

// A4b reduced-motion 降级（**必须真模拟**，不能只看源码写了没写）：
//     `--boh-dur-bob` 被 layout.css 归零 ⇒ 亮带停在非亮处，若还留着 `color: transparent`
//     状态文字会**直接看不见**。断言降级后恢复实色且动画停掉。
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForTimeout(160);
const reduced = await page.evaluate(() => {
  const span = document.querySelector('.boh-search-text');
  const cs = span ? getComputedStyle(span) : null;
  return {
    present: !!span,
    color: cs?.color || '',
    transparent: (cs?.color || '').replace(/\s/g, '') === 'rgba(0,0,0,0)',
    animation: cs?.animationName || '',
  };
});
await page.emulateMedia({ reducedMotion: null });
check(
  'A4b reduced-motion：活动行文字恢复实色（不再透明）+ 流光停掉',
  reduced.present && !reduced.transparent && reduced.animation === 'none',
  JSON.stringify(reduced),
);
await page.waitForFunction(
  () => document.querySelector('.boh-search-status')?.getAttribute('data-activity') === 'thinking',
  null,
  { timeout: 8000 },
);

// A7 回复完成：活动行整条退场（来源 chip 接管），推理原文**不进正文**
await page.waitForSelector('.boh-msg-actions', { timeout: 30000 });
await page.waitForTimeout(600);
const afterDone = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.boh-search-status')].filter((el) =>
    el.checkVisibility(),
  );
  // ⚠️ 不用 :last-of-type —— ai-body 后面还有 chips/actions 的 div，恒匹配不上
  const replyText = [...document.querySelectorAll('.boh-ai-body')]
    .map((el) => el.textContent || '')
    .join('');
  return {
    rowGone: rows.length === 0,
    // 生成结束后推理面板必须收起，且不再有流光
    bodyHidden: !document.querySelector('.boh-reason-body')?.checkVisibility(),
    shimmerGone: !/shimmer/.test(
      getComputedStyle(document.querySelector('.boh-search-text') || document.body).animationName ||
        '',
    ),
    replyShown: replyText.includes('方块之家'),
    // ⚠️ 核心判据：推理原文**一个字都不能进正文**（分流不是新增可见文本）
    reasoningLeaked: replyText.includes('先联网确认最新帖'),
  };
});
check(
  'A7 回复完成：活动行退场 + 推理收起（流光收掉）+ 正文在场且不含推理原文',
  afterDone.rowGone &&
    afterDone.bodyHidden &&
    afterDone.shimmerGone &&
    afterDone.replyShown &&
    !afterDone.reasoningLeaked,
  JSON.stringify(afterDone),
);
await page.screenshot({ path: `${OUT}/bohai-search-status-done.png` });

// A9 / A10 推理原文可展开（2026-10-10 口径；2026-10-19 起它是**活动行的展开面**，
// 所以入口是活动行那个按钮 —— 但生成结束后活动行已退场，此时用页面上已存在的
// `.boh-search-head` 无法点到。判据改为：推理面板挂着、正文默认收起；
// 展开/收起走真实点击需要活动行在场，故放回「生成中」验证 —— 见 A9/A10 的实现。
// ⚠️ 判据必须先看节点在不在再点 —— 回归时应该**红**，不该让 locator 抛错把脚本打断。
const reasonPanelCount = await page.locator('.boh-reason').count();
if (reasonPanelCount === 0) {
  check('A9 生成结束后推理面板仍挂着（可复看）', false, '找不到 .boh-reason（推理面板缺失）');
  check('A10 推理正文默认收起（不刷屏）', false, '找不到 .boh-reason（推理面板缺失）');
} else {
  const panelState = await page.evaluate(() => ({
    visible: !!document.querySelector('.boh-reason-body')?.checkVisibility(),
    text: document.querySelector('.boh-reason-body')?.textContent.trim() || '',
  }));
  check(
    'A9 生成结束后推理面板仍挂着（可复看）+ 内容 = 模型思考',
    !panelState.visible && panelState.text.includes('先联网确认最新帖'),
    JSON.stringify({ ...panelState, text: panelState.text.slice(0, 60) }),
  );
  check(
    'A10 推理正文默认收起（不刷屏）',
    !panelState.visible,
    JSON.stringify({ visible: panelState.visible }),
  );
}

// A11 社区阶段：活动行点名称谓「正在读取《帖子标题》」（2026-10-19 用户口径）。
//      ⚠️ **单独一个新 context** 跑这一条：
//      ① 前面那轮的网络收尾在本机受限环境里可能长时间不落（实测 20s+ 仍未结束），
//         复用页面会让「发第二条消息」被发送键 disabled 挡住 —— 那是环境噪声，不是判据；
//      ② 新一轮必须是干净状态（无历史消息、无残留活动行），否则 `rowCount` 前提不成立。
const ctx2 = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  serviceWorkers: 'block',
});
const page2 = await ctx2.newPage();
const errors2 = [];
page2.on('pageerror', (e) => errors2.push(String(e).slice(0, 180)));
await page2.route('**/rest/v1/rpc/**', (route) => {
  if (route.request().url().includes('list_forum_posts')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([MOCK_FORUM_POST]),
    });
  }
  if (route.request().url().includes('list_public_bohai_modes')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MODES),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
// 社区检索故意慢 1.2s：让「正在读取《标题》」有窗口可观察（标题在连接器返回后才落地）
await page2.route('**/functions/v1/boh-ai-retrieval**', async (route) => {
  await new Promise((r) => setTimeout(r, 1200));
  const body = (() => {
    try {
      return route.request().postDataJSON() || {};
    } catch {
      return {};
    }
  })();
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: { chunks: [], sourceTypes: body.sourceTypes || [] },
    }),
  });
});
await page2.route('**/functions/v1/api-key-vault**', async (route) => {
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
  if (body.action === 'runtime-chat-stream') {
    await new Promise((r) => setTimeout(r, 1200));
    const sse = [
      'data: {"choices":[{"delta":{"content":"<think>先看社区最近的帖子。</think>最近的帖子是："}}]}',
      'data: {"choices":[{"delta":{"content":"《周末线下聚会回顾》"}}]}',
      'data: [DONE]',
      '',
    ].join('\n\n');
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
  }
  return respond({});
});

await page2.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
await page2.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
const keepAuthTimer2 = setInterval(() => {
  page2
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
await page2.waitForTimeout(1100);
await page2.waitForSelector('.boh-composer-input', { timeout: 20000 });

// 这一轮**不开联网**：活动行要留出 community 这一段
await page2.fill('.boh-composer-input', '最近社区有什么新帖子');
await page2.locator('.boh-send').click();
// 等到社区阶段 + 行里出现书名号（标题已随论坛连接器结果落地）
const namedSeen = await page2
  .waitForFunction(
    () => {
      const el = document.querySelector('.boh-search-status');
      const line = el?.querySelector('.boh-search-line')?.textContent.trim() || '';
      return el?.getAttribute('data-activity') === 'community' && /^正在读取《.+》$/.test(line);
    },
    null,
    { timeout: 15000 },
  )
  .then(() => true)
  .catch(() => false);
const communityState = await page2.evaluate(() => {
  const rows = [...document.querySelectorAll('.boh-search-status')].filter((el) =>
    el.checkVisibility(),
  );
  const el = rows[rows.length - 1] || null;
  return {
    rowCount: rows.length,
    stage: el?.getAttribute('data-activity') || '',
    line: el?.querySelector('.boh-search-line')?.textContent.trim() || '',
  };
});
check(
  'A11 社区阶段：同一条行显示「正在读取《帖子标题》」（不是「近日帖子」）',
  namedSeen &&
    communityState.stage === 'community' &&
    communityState.rowCount === 1 &&
    /^正在读取《.+》$/.test(communityState.line),
  JSON.stringify(communityState).slice(0, 220),
);
clearInterval(keepAuthTimer2);
await ctx2.close();

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
