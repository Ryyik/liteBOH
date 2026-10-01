import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：评论 / 回复输入框「多字扩展」（plans/021-评论输入框多字扩展.md）
//
//   场景 A：竖屏手机 390×844，用户空间内嵌论坛的卡片内联回复框（PostCard，主症）
//   场景 B：竖屏手机 390×844，帖子详情页的评论输入形态 —— 一条**绊线**（见该段注释），不跑 A–D
//   真实登录注入 + 真实数据（不做 RPC mock）。
//
//   断言（场景 A 各跑一遍）：
//     A 空内容高度 = rows 撑出的高度，且无内部滚动
//     B 逐行加内容 → 高度单调不减；未到上限前 scrollHeight ≤ clientHeight + 1
//     C 内容超上限 → 高度停在上限，框内出现滚动（scrollHeight > clientHeight），overflow-y: auto
//     D 清空 → 高度回到 A 的值
//     E 父组件改写内容（同卡切到嵌套回复：replyContent 被 buildReplyDraft 换成 '@user '）
//       → 高度必须回落。这是 `:value` 受控写法下最容易漏的一条 —— 只绑 @input 的实现不会收缩。
//       该卡没有嵌套回复时记 SKIP（不记红），避免把「数据没有」误报成「代码不对」。
//     F 竖屏键盘遮挡：只**测量并报告**，不作断言（plans/021 §8：先测再改）
//
//   counter-proof（必须做）：`git checkout -- src/views/Forum/components/PostCard.vue`
//   撤掉接线后 B / C / E 必红（高度恒为 85）。只测「修复后全绿」不算自证。
// =====================================================================

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 390, height: 844 };
const SETTLE = 420; // 高度过渡 180ms（tokens --duration-fast）+ 余量

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const skip = (name, detail = '') => {
  results.push({ name, pass: null, detail });
  console.log(`SKIP  ${name}${detail ? '  -- ' + detail : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pinia 伪造登录（探针惯例：reactive 须 Object.assign，id 用合法 UUID）
const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
      points: 42,
    });
  });
};

/** 轮询直到条件满足 */
const waitForInPage = async (
  page,
  fn,
  { timeout = 12000, interval = 200, arg = undefined } = {},
) => {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(fn, arg);
    if (last && last.done) return last;
    await sleep(interval);
  }
  return last;
};

// ---------- 按选择器生成页面内读数 / 写入 ----------
// 读数写成字符串（page.evaluate 传字符串即当作表达式求值），写入用函数 + 参数。
const readBox = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    maxHeight: parseFloat(cs.maxHeight),
    overflowY: cs.overflowY,
    rows: Number(el.getAttribute('rows')),
    value: el.value
  };
})()`;

const setBoxValue = ({ selector, text }) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

const lines = (n) => Array.from({ length: n }, (_, i) => `第${i + 1}行内容`).join('\n');

/** 对任意一个 textarea 跑 A–D 四条：返回是否全绿 + 关键读数 */
const runGrowthChecks = async (page, { selector, label }) => {
  const read = readBox(selector);
  const set = (text) => page.evaluate(setBoxValue, { selector, text });

  const empty = await page.evaluate(read);
  const ok0 =
    Boolean(empty) &&
    empty.rows > 0 &&
    empty.clientHeight > 30 &&
    empty.clientHeight < 120 &&
    empty.scrollHeight - empty.clientHeight <= 1 &&
    empty.overflowY === 'auto';
  check(
    `${label} · A 空内容高度 = rows 撑出的高度且无内部滚动`,
    ok0,
    `clientHeight=${empty?.clientHeight} scrollHeight=${empty?.scrollHeight} rows=${empty?.rows} overflowY=${empty?.overflowY}`,
  );
  const H0 = empty?.clientHeight ?? 0;
  const MAX = Number.isFinite(empty?.maxHeight) ? empty.maxHeight : Infinity;

  const samples = [];
  for (const n of [2, 3, 4, 5, 6, 8]) {
    await set(lines(n));
    await sleep(SETTLE);
    const box = await page.evaluate(read);
    samples.push({ n, h: box.clientHeight, sh: box.scrollHeight });
  }
  const monotonic = samples.every((s, i) => i === 0 || s.h >= samples[i - 1].h);
  const grew = samples[samples.length - 1].h > H0;
  const belowCap = samples.filter((s) => s.h < MAX - 1);
  const noInnerScroll = belowCap.every((s) => s.sh - s.h <= 1);
  check(
    `${label} · B 内容变多高度单调不减且未到上限时无内部滚动`,
    monotonic && grew && noInnerScroll && belowCap.length >= 2,
    `samples=${samples.map((s) => `${s.n}行:${s.h}`).join(' ')} 未到上限采样=${belowCap.length}`,
  );

  await set(lines(30));
  await sleep(SETTLE);
  const capped = await page.evaluate(read);
  check(
    `${label} · C 超上限后高度停在上限并框内滚动`,
    Math.abs(capped.clientHeight - MAX) <= 1 &&
      capped.scrollHeight > capped.clientHeight + 40 &&
      capped.overflowY === 'auto',
    `clientHeight=${capped.clientHeight} maxHeight=${MAX} scrollHeight=${capped.scrollHeight} overflowY=${capped.overflowY}`,
  );

  await set('');
  await sleep(SETTLE);
  const cleared = await page.evaluate(read);
  check(
    `${label} · D 清空后高度回落到初始值`,
    Math.abs(cleared.clientHeight - H0) <= 1,
    `清空后=${cleared.clientHeight} 初始=${H0}`,
  );

  return { H0, MAX, samples, capped, read, set, ok: ok0 };
};

const openCommunity = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.community-shell', { timeout: 25000 });
  await page.waitForSelector('.post-card-v2', { timeout: 25000 });
  await page.waitForTimeout(1200);
};

const newPage = async (browser) => {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));
  return { ctx, page, consoleErrors };
};

const report = { checks: {}, info: {} };
const browser = await launch();

try {
  // ================= 场景 A：论坛卡片内联回复框（PostCard） =================
  {
    const { ctx, page } = await newPage(browser);
    await openCommunity(page);

    const opened = await page.evaluate(() => {
      const btn = document.querySelector('.post-card-v2 .reply-btn-v2');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!opened)
      throw new Error('找不到 .post-card-v2 .reply-btn-v2 —— 论坛卡片未渲染或选择器已改');
    await page.waitForSelector('.reply-input-section-v2 .reply-textarea-v2', { timeout: 10000 });
    await sleep(SETTLE);

    const api = await runGrowthChecks(page, {
      selector: '.reply-input-section-v2 .reply-textarea-v2',
      label: '论坛卡片回复框',
    });
    report.info.cardBox = {
      H0: api.H0,
      maxHeight: api.MAX,
      samples: api.samples,
      capped: api.capped,
    };
    await page.screenshot({ path: `${OUT}/probe-reply-autogrow-capped.png` });

    // ---------- F 竖屏键盘遮挡：只测量并报告 ----------
    const occl = await page.evaluate(() => {
      const el = document.querySelector('.reply-input-section-v2 .reply-textarea-v2');
      const actions = document.querySelector('.reply-input-section-v2 .reply-actions-v2');
      if (!el || !actions) return null;
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      return {
        innerHeight: window.innerHeight,
        visualViewportHeight: vv ? Math.round(vv.height) : null,
        textareaBottom: Math.round(el.getBoundingClientRect().bottom),
        actionsBottom: Math.round(actions.getBoundingClientRect().bottom),
        visibleBottom: Math.round(visibleBottom),
        actionsOccluded: actions.getBoundingClientRect().bottom > visibleBottom,
      };
    });
    report.info.keyboardOcclusion = occl;
    console.log(
      `INFO  键盘遮挡测量（未断言）：textarea 底边 ${occl?.textareaBottom} / 操作行底边 ${occl?.actionsBottom} / 可视底 ${occl?.visibleBottom} → 遮挡=${occl?.actionsOccluded}`,
    );

    // ---------- E 父组件改写内容：切到嵌套回复后必须回落 ----------
    // 路径：同卡点嵌套回复的「回复」按钮 → toggleReplyInput(postId, parentId, username)
    // → postId 不变、v-if 仍成立 → **同一个 textarea 元素**留在原地，但 replyContent 被
    // buildReplyDraft(username) 换成 '@user '。这是 `:value` 受控写法下唯一会命中
    // watch(value) 的真实路径，只绑 @input 的实现在这里不会收缩。
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.post-card-v2')].slice(0, 6);
      for (const card of cards) card.querySelector('.replies-btn-v2')?.click();
    });
    const nestedReady = await waitForInPage(
      page,
      () => {
        const btn = document.querySelector('.reply-item-v2 .reply-action-btn');
        if (!btn) return { done: false };
        const card = btn.closest('.post-card-v2');
        return {
          done: true,
          cardIndex: [...document.querySelectorAll('.post-card-v2')].indexOf(card),
        };
      },
      { timeout: 15000 },
    );

    if (!nestedReady?.done) {
      skip(
        '论坛卡片回复框 · E 父组件改写内容后高度回落',
        '前 6 张卡都没有可展开的回复（数据原因，非代码问题）',
      );
    } else {
      await page.evaluate((idx) => {
        const cards = [...document.querySelectorAll('.post-card-v2')];
        cards[idx]?.querySelector('.reply-btn-v2')?.click();
      }, nestedReady.cardIndex);
      await page.waitForSelector('.reply-input-section-v2 .reply-textarea-v2', { timeout: 10000 });
      await sleep(SETTLE);
      await api.set(lines(30));
      await sleep(SETTLE);
      const beforeSwitch = await page.evaluate(api.read);

      await page.evaluate((idx) => {
        const cards = [...document.querySelectorAll('.post-card-v2')];
        cards[idx]?.querySelector('.reply-item-v2 .reply-action-btn')?.click();
      }, nestedReady.cardIndex);
      await sleep(SETTLE);
      const afterSwitch = await page.evaluate(api.read);
      report.info.switchBox = afterSwitch;

      check(
        '论坛卡片回复框 · E 父组件改写内容后高度回落',
        Boolean(afterSwitch) &&
          afterSwitch.value !== beforeSwitch.value &&
          afterSwitch.clientHeight < beforeSwitch.clientHeight &&
          afterSwitch.clientHeight <= api.H0 + 24,
        `改写前=${beforeSwitch.clientHeight}(len ${beforeSwitch.value.length}) 改写后=${afterSwitch?.clientHeight}(len ${afterSwitch?.value.length} value=${JSON.stringify(afterSwitch?.value?.slice(0, 12))}) 初始=${api.H0}`,
      );
      await page.screenshot({ path: `${OUT}/probe-reply-autogrow-after-switch.png` });
    }

    await ctx.close();
  }

  // ================= 场景 B：帖子详情页的评论输入形态（绊线，不是 A–D 复跑） =================
  // 2026-09-30 实测结论：详情页两处 `<CommentThread>` 都硬编码了 `:hide-composer="true"`，
  // 所以 CommentThread 自己的内嵌评论框（`.reply-textarea-x`）**根本不渲染**；
  // 详情页真正的评论输入是底部操作栏的单行 `<input class="pd-reply-input" type="text">`，
  // 不存在「多字扩展」问题（单行框本来就不该长高）。
  // 这里不跑 A–D（跑了只会 SKIP），改成一条**绊线**：一旦有人把内嵌评论框放出来，
  // 本条立刻变红，逼他把 `useAutoGrowTextarea` 接上并补断言 —— 而不是让一个休眠的输入框悄悄上线。
  {
    const { ctx, page } = await newPage(browser);
    await openCommunity(page);

    const clicked = await page.evaluate(() => {
      const card = document.querySelector('.post-card-v2');
      const target =
        card?.querySelector('.post-title-v2') || card?.querySelector('.post-content-v2');
      if (!target) return false;
      target.click();
      return true;
    });
    const entered = clicked
      ? await waitForInPage(
          page,
          () => ({ done: /\/post\//.test(location.hash), hash: location.hash }),
          { timeout: 15000 },
        )
      : null;
    report.info.detailRoute = entered?.hash || null;

    if (!entered?.done) {
      skip('详情页评论输入形态绊线', `没能进入详情路由（hash=${entered?.hash ?? 'n/a'}）`);
    } else {
      await page.waitForSelector('.pd-reply-input', { timeout: 15000 });
      const shape = await page.evaluate(() => {
        const input = document.querySelector('.pd-reply-input');
        return {
          tag: input?.tagName || null,
          type: input?.getAttribute('type') || null,
          inlineComposer: document.querySelectorAll('.reply-textarea-x').length,
        };
      });
      report.info.detailInputShape = shape;
      check(
        '详情页评论输入仍是单行 input（内嵌多行评论框未启用）',
        shape.tag === 'INPUT' && shape.inlineComposer === 0,
        `底部输入=${shape.tag}/${shape.type} 内嵌 .reply-textarea-x=${shape.inlineComposer} —— 若此项变红，说明内嵌多行评论框被放出来了：请给它接 useAutoGrowTextarea，并把本场景改回 A–D 断言`,
      );
    }

    await ctx.close();
  }
} catch (error) {
  check('探针执行', false, String(error?.message || error).slice(0, 300));
} finally {
  await browser.close();
}

report.checks = results.reduce((acc, r) => {
  acc[r.name] = r.pass;
  return acc;
}, {});
fs.writeFileSync(`${OUT}/probe-reply-autogrow.json`, JSON.stringify(report, null, 2));

const failed = results.filter((r) => r.pass === false);
const skipped = results.filter((r) => r.pass === null);
console.log(
  `\n=== 回复框多字扩展探针：${results.length - failed.length - skipped.length} PASS / ${failed.length} FAIL / ${skipped.length} SKIP ===`,
);
process.exit(failed.length > 0 ? 1 : 0);
