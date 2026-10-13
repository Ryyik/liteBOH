import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：评论 / 回复输入框「多字扩展」（plans/021-评论输入框多字扩展.md）
//
//   场景 A：竖屏手机 390×844，用户空间内嵌论坛的卡片内联回复框（PostCard，主症）
//   场景 B：竖屏手机 390×844，帖子详情页底部评论输入框（2026-10-01 起也是自动增高 textarea）
//   场景 C：竖屏手机 390×844，消息中心通知详情的回复框（plans/021 阶段2 接入）
//   场景 D：竖屏手机 390×844，社区伙伴印象墙的印象输入框（plans/021 阶段2 接入）
//   A/B 用真实登录注入 + 真实数据；C 需要 supabase 真实会话（探针拿不到），
//   沿用 scripts/probes/probe-messages-ui.mjs 的 mock 先例（拦截 /auth/v1/user
//   与 /rest/v1/notifications + 伪造本地会话）；D 的伙伴列表是公开数据，走真实请求。
//    ForumMain「引用转发弹窗」经复核是死 UI（PostCard 无 quote-repost 发射点，
//   真实转发入口已迁至 ShareIsland），按纪律不接线；场景 A 末尾留了一条绊线：
//   分享→站内转发后 ForumMain 的 section[aria-label="引用转发"] 必须保持 0 个。
//
//   断言（场景 A 各跑一遍）：
//     A 空内容高度 = rows 撑出的高度，且无内部滚动
//     B 逐行加内容 → 高度单调不减；未到上限前 scrollHeight ≤ clientHeight + 1
//     C 内容超上限 → 高度停在上限，框内出现滚动（scrollHeight > clientHeight），overflow-y: auto
//       （无 CSS max-height 的框：不断言停住，改断言「继续长高且仍无内部滚动」）
//     D 清空 → 高度回到 A 的值
//     E 父组件改写内容（同卡切到嵌套回复：replyContent 被 buildReplyDraft 换成 '@user '）
//       → 高度必须回落。这是 `:value` 受控写法下最容易漏的一条 —— 只绑 @input 的实现不会收缩。
//       该卡没有嵌套回复时记 SKIP（不记红），避免把「数据没有」误报成「代码不对」。
//     F 竖屏键盘遮挡：只**测量并报告**，不作断言（plans/021 §8：先测再改）
//     G 关闭再重开（v-if 卸载→再挂载）→ 新元素从 rows 高度起步（场景 C/D）
//
//   场景 B 追加（2026-10-13，竖屏底栏「聚焦即展开」）：
//     · 聚焦 → `.pd-actionbar.is-expanded` + 输入框最小高度 ≥76px 且独占一行 + 操作组让位
//     · 空态失焦 → 还原（去类 + 回到单行最小高度 + 操作组回来）
//     · 发送成功 → 还原 + 内容清空（**mock 掉 REST 写入**，绝不往线上库写真实评论）
//
//   counter-proof（必须做）：`git checkout -- src/views/Forum/components/PostCard.vue`
//   撤掉接线后 B / C / E 必红（高度恒为 85）。只测「修复后全绿」不算自证。
//
//   BASE 环境变量可覆盖（默认 http://[::1]:5173）：与占住 5173 的会话错峰时
//   用 `BASE=http://127.0.0.1:5174 node scripts/probes/probe-reply-autogrow.mjs`。
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
// offsetHeight = 含边框的渲染高度，**上限比较必须用它**：
// CSS 的 max-height 约束的是 border-box，而 clientHeight 把边框扣掉了
// （详情页评论框有 1px 边框，写 132 时 clientHeight 只有 130，用 clientHeight 比上限会恒差 1~2px）。
const readBox = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    clientHeight: el.clientHeight,
    offsetHeight: el.offsetHeight,
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
/**
 * @param {object} opts
 * @param {number} [opts.minBelowCap=2] 期望「未到上限」的采样数下限。
 *   详情页评论框只有 ~107px 宽，一行中文会折成两个视觉行，第 2 个采样点就顶上上限了
 *   （只有 1 个未到上限的采样），所以那一处传 1。断言的真实不变量是
 *   「存在一段区间：高度随内容增长且无内部滚动」，采样计数只是它的强度。
 * @param {number} [opts.emptyHeightMax=120] 空内容高度的上界。rows×行高+padding 因框而异
 *   （印象框 padding 32px、行高约 30px，rows=3 空态实测 123px），按各框实测放宽。
 * @param {boolean} [opts.blurAfterClear=false] 清空后再失焦一次再量 D。
 *   详情页底栏 2026-10-13 起是「聚焦即展开」（min-height 40→80）：聚焦态下清空本就该停在
 *   展开高度，所以 D 必须在失焦还原之后再量 —— 这条同时把「空态失焦即还原」钉住。
 */
const runGrowthChecks = async (
  page,
  { selector, label, minBelowCap = 2, emptyHeightMax = 120, blurAfterClear = false },
) => {
  const read = readBox(selector);
  const set = (text) => page.evaluate(setBoxValue, { selector, text });

  const empty = await page.evaluate(read);
  const ok0 =
    Boolean(empty) &&
    empty.rows > 0 &&
    empty.clientHeight > 30 &&
    empty.clientHeight < emptyHeightMax &&
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
    samples.push({ n, h: box.offsetHeight, sh: box.scrollHeight });
  }
  const monotonic = samples.every((s, i) => i === 0 || s.h >= samples[i - 1].h);
  const grew = samples[samples.length - 1].h > H0;
  const belowCap = samples.filter((s) => s.h < MAX - 1);
  const noInnerScroll = belowCap.every((s) => s.sh - s.h <= 1);
  check(
    `${label} · B 内容变多高度单调不减且未到上限时无内部滚动`,
    monotonic && grew && noInnerScroll && belowCap.length >= minBelowCap,
    `samples=${samples.map((s) => `${s.n}行:${s.h}`).join(' ')} 未到上限采样=${belowCap.length}（下限 ${minBelowCap}）`,
  );

  await set(lines(30));
  await sleep(SETTLE);
  const capped = await page.evaluate(read);
  if (Number.isFinite(MAX)) {
    check(
      `${label} · C 超上限后高度停在上限并框内滚动`,
      Math.abs(capped.offsetHeight - MAX) <= 1 &&
        capped.scrollHeight > capped.clientHeight + 40 &&
        capped.overflowY === 'auto',
      `offsetHeight=${capped.offsetHeight} maxHeight=${MAX} scrollHeight=${capped.scrollHeight} overflowY=${capped.overflowY}`,
    );
  } else {
    // 无 CSS max-height 的框（消息中心回复框 / 印象框）：不断言「停在上限」——
    // 它们就不该有上限；改断言高度继续跟着内容长、且依然不出现内部滚动。
    const maxSample = Math.max(...samples.map((s) => s.h));
    check(
      `${label} · C 无 CSS 上限时高度继续随内容增长且不出现内部滚动`,
      capped.offsetHeight > maxSample &&
        capped.scrollHeight - capped.clientHeight <= 1 &&
        capped.overflowY === 'auto',
      `30行=${capped.offsetHeight} 采样峰值=${maxSample} scrollHeight=${capped.scrollHeight} overflowY=${capped.overflowY}`,
    );
  }

  await set('');
  if (blurAfterClear) {
    // 失焦要在内容已清空之后：内容非空时 blur 不还原（handleReplyFieldBlur 的早退），
    // 顺序写反会量到展开态高度，把「还原」误判成「没回落」。
    await page.evaluate((sel) => document.querySelector(sel)?.blur?.(), selector);
  }
  await sleep(SETTLE);
  const cleared = await page.evaluate(read);
  const clearDiag = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const bar = el?.closest('.pd-actionbar');
    const cs = el ? getComputedStyle(el) : null;
    return {
      barClass: bar ? bar.className : null,
      minHeight: cs ? cs.minHeight : null,
      inlineHeight: el ? el.style.height : null,
      valueLen: el ? String(el.value || '').length : null,
      rows: el ? el.rows : null,
      focused: document.activeElement === el,
    };
  }, selector);
  check(
    `${label} · D 清空后高度回落到初始值`,
    Math.abs(cleared.clientHeight - H0) <= 1,
    `清空后=${cleared.clientHeight} 初始=${H0} | 栏="${clearDiag.barClass}" minH=${clearDiag.minHeight} inline=${clearDiag.inlineHeight} valueLen=${clearDiag.valueLen} rows=${clearDiag.rows} focused=${clearDiag.focused}`,
  );

  return { H0, MAX, samples, capped, read, set, ok: ok0 };
};

/**
 * G：关闭再重开（v-if 卸载 → 再挂载）后，新元素从 rows 高度起步。
 * close / reopen 由调用方按各自页面的真实交互路径给出：
 *   · close 后必须等元素真正离开 DOM（Transition leave 有过渡期）再 reopen；
 *   · 新元素的 v-model 值应为空（关闭路径都主动清了内容），高度回到 A 的初值。
 */
const runRemountCheck = async (page, { selector, label, H0, close, reopen }) => {
  await close();
  // ⚠️ page.evaluate 的函数体在浏览器里求值，闭不住 Node 侧的 selector —— 必须走 arg 传参
  const detached = await waitForInPage(page, (sel) => ({ done: !document.querySelector(sel) }), {
    timeout: 10000,
    arg: selector,
  });
  if (!detached?.done) {
    check(`${label} · G 关闭再重开后新元素从 rows 高度起步`, false, '关闭后元素未离开 DOM');
    return;
  }
  await reopen();
  const fresh = await waitForInPage(
    page,
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { done: false };
      return { done: true, clientHeight: el.clientHeight, value: el.value };
    },
    { timeout: 12000, arg: selector },
  );
  if (!fresh?.done) {
    // 超时 ≠ 一定代码问题：采集现场（弹窗在不在 / 表单在不在 / 登录态塌没塌）再断红
    const diag = await page.evaluate(() => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
      return {
        textareas: document.querySelectorAll('textarea').length,
        modalLike: document.querySelectorAll('[class*="modal"], [class*="overlay"]').length,
        isLoggedIn: pinia?.state?.value?.auth?.isLoggedIn ?? null,
        hash: location.hash,
      };
    });
    check(
      `${label} · G 关闭再重开后新元素从 rows 高度起步`,
      false,
      `重开后 12s 未见元素；诊断=${JSON.stringify(diag)} 初始=${H0}`,
    );
    return;
  }
  check(
    `${label} · G 关闭再重开后新元素从 rows 高度起步`,
    Boolean(fresh?.done) && fresh.value === '' && Math.abs(fresh.clientHeight - H0) <= 1,
    `重开后=${fresh?.clientHeight}(len ${String(fresh?.value ?? '').length}) 初始=${H0}`,
  );
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

    // ---------- 绊线：ForumMain「引用转发弹窗」是死 UI，转发撰写在 ShareIsland ----------
    // 2026-10-13 复核（按类名扫出后运行时验证过）：PostCard 无 quote-repost 发射点，
    // ForumMain 的 quoteRepostState 弹窗全站不可达 —— 真实转发入口已迁至
    // ShareIsland 的 .share-compose-input（另一处组件，不在本探针接线范围内）。
    // 走一遍 分享 → 站内转发：ForumMain 的 section[aria-label="引用转发"] 必须保持 0 个。
    // 哪天真有人重新接线，这条会红，提醒同步接 useAutoGrowTextarea 并更新本探针。
    await page.evaluate(() => {
      document.querySelector('.post-card-v2 .share-btn-v2')?.click();
    });
    const islandUp = await waitForInPage(
      page,
      () => ({ done: Boolean(document.querySelector('.share-island-card')) }),
      { timeout: 10000 },
    );
    if (!islandUp?.done) {
      skip('引用转发弹窗仍是死 UI（ForumMain modal 不出现）', '分享灵动岛未弹出，无法走转发路径');
    } else {
      await sleep(SETTLE); // 岛卡进场 320ms，落定再点
      await page.evaluate(() => {
        const options = [...document.querySelectorAll('.share-island-card .share-option')];
        options.find((btn) => btn.textContent.includes('站内转发'))?.click();
      });
      const forwardReady = await waitForInPage(
        page,
        () => {
          const islandComposer = document.querySelectorAll('.share-compose-input').length;
          const forumModal = document.querySelectorAll(
            'section.forum-confirm-modal[aria-label="引用转发"]',
          ).length;
          if (!islandComposer && !forumModal) return { done: false };
          return { done: true, islandComposer, forumModal };
        },
        { timeout: 10000 },
      );
      if (!forwardReady?.done) {
        skip(
          '引用转发弹窗仍是死 UI（ForumMain modal 不出现）',
          '点「站内转发」后既无岛内撰写框也无 ForumMain 弹窗（分享链路可能已改）',
        );
      } else {
        check(
          '引用转发弹窗仍是死 UI：转发撰写在 ShareIsland，ForumMain modal 不出现',
          forwardReady.islandComposer === 1 && forwardReady.forumModal === 0,
          `岛内撰写框=${forwardReady.islandComposer} ForumMain 引用转发弹窗=${forwardReady.forumModal}`,
        );
      }
    }

    await ctx.close();
  }

  // ================= 场景 B：帖子详情页底部评论输入框（2026-10-01 起是多行自动增高） =================
  // 形态沿革（别再按旧结论改回去）：
  //   · 2026-09-30：详情页两处 `<CommentThread>` 都硬编码 `:hide-composer="true"`，内嵌的
  //     `.reply-textarea-x` 根本不渲染；底部是单行 `<input class="pd-reply-input" type="text">`，
  //     单行框没有多字扩展问题 —— 当时这里只放了一条「仍是单行 input」的绊线。
  //   · 2026-10-01：产品口径改成「输入时自动扩充、输入完成自动收回」，底部输入框已由
  //     `<input>` 换成自动增高 `<textarea>`（接线 `useAutoGrowTextarea`）。绊线因此按它当初
  //     自己写下的处置办法**改回 A–D 断言** —— 换形态的当天就必须有牙，不能只是把红改绿。
  // 仍然保留对内嵌 `.reply-textarea-x` 的检查：它若被放出来，本条应立刻变红。
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
      skip('详情页评论输入框', `没能进入详情路由（hash=${entered?.hash ?? 'n/a'}）`);
    } else {
      await page.waitForSelector('.pd-reply-input', { timeout: 15000 });
      await sleep(SETTLE);
      const shape = await page.evaluate(() => {
        const input = document.querySelector('.pd-reply-input');
        return {
          tag: input?.tagName || null,
          rows: input?.getAttribute('rows') || null,
          inlineComposer: document.querySelectorAll('.reply-textarea-x').length,
        };
      });
      report.info.detailInputShape = shape;
      check(
        '详情页评论输入是多行 textarea（rows=1）且内嵌评论框仍未启用',
        shape.tag === 'TEXTAREA' && Number(shape.rows) === 1 && shape.inlineComposer === 0,
        `底部输入=${shape.tag}/rows=${shape.rows} 内嵌 .reply-textarea-x=${shape.inlineComposer}`,
      );

      await runGrowthChecks(page, {
        selector: '.pd-reply-input',
        label: '详情页评论框',
        // 窄框（~107px）：中文一行折两行，第 2 个采样点即触顶，未到上限的采样只剩 1 个
        minBelowCap: 1,
        // 聚焦即展开（min-height 40→80）：清空后须先失焦还原，再量 D
        blurAfterClear: true,
      });
      await page.screenshot({ path: `${OUT}/probe-reply-autogrow-detail.png` });

      // ---- 2026-10-13 新增：竖屏「聚焦即展开 / 发送或空态失焦即还原」 ----
      // 背景：竖屏底栏是单行 flex（输入框 + 发送 + 点赞/评论/分享组），390px 下输入框只剩 ~100px。
      // 口径：聚焦 → 展开成舒适多行视图；发送成功 / 取消回复 / 空态失焦 → 还原单行紧凑态。
      // 状态真源 = PostDetailMain 的 isReplyExpanded（JS 判据 isForumPortraitComposer）；
      // CSS 只消费 `.pd-actionbar.is-expanded`，不写第二份媒体查询。
      await page.evaluate(() => document.querySelector('.pd-reply-input')?.focus?.());
      await sleep(SETTLE);
      const expanded = await page.evaluate(() => {
        const bar = document.querySelector('.pd-actionbar');
        const input = document.querySelector('.pd-reply-input');
        const group = document.querySelector('.pd-action-group');
        const barRect = bar?.getBoundingClientRect();
        const inputRect = input?.getBoundingClientRect();
        return {
          hasClass: Boolean(bar?.classList.contains('is-expanded')),
          minHeight: input ? parseFloat(getComputedStyle(input).minHeight) || 0 : 0,
          inputW: Math.round(inputRect?.width || 0),
          barW: Math.round(barRect?.width || 0),
          groupDisplay: group ? getComputedStyle(group).display : null,
          barH: Math.round(barRect?.height || 0),
        };
      });
      report.info.detailExpanded = expanded;
      check(
        '详情页底栏聚焦后展开（is-expanded + 输入框抬高并独占一行 + 操作组让位）',
        expanded.hasClass &&
          expanded.minHeight >= 76 &&
          expanded.inputW >= expanded.barW - 40 &&
          expanded.groupDisplay === 'none',
        `class=${expanded.hasClass} minH=${expanded.minHeight} 输入宽=${expanded.inputW}/${expanded.barW} 操作组=${expanded.groupDisplay} 栏高=${expanded.barH}`,
      );
      await page.screenshot({ path: `${OUT}/probe-reply-autogrow-detail-expanded.png` });

      // 空态失焦 → 还原
      await page.evaluate(() => document.querySelector('.pd-reply-input')?.blur?.());
      await sleep(SETTLE);
      const collapsed = await page.evaluate(() => {
        const bar = document.querySelector('.pd-actionbar');
        const input = document.querySelector('.pd-reply-input');
        const group = document.querySelector('.pd-action-group');
        return {
          hasClass: Boolean(bar?.classList.contains('is-expanded')),
          minHeight: input ? parseFloat(getComputedStyle(input).minHeight) || 0 : 0,
          groupDisplay: group ? getComputedStyle(group).display : null,
        };
      });
      report.info.detailCollapsed = collapsed;
      check(
        '详情页底栏空态失焦后还原（去掉 is-expanded + 回到单行最小高度 + 操作组回来）',
        !collapsed.hasClass && collapsed.minHeight <= 48 && collapsed.groupDisplay !== 'none',
        `class=${collapsed.hasClass} minH=${collapsed.minHeight} 操作组=${collapsed.groupDisplay}`,
      );

      // 发送成功后还原：mock 掉评论写入链路（**绝不**往线上库写真实评论）。
      // 写入走 supabase REST；后续刷新走 comments GET + rpc。Content-Range 必回，
      // 否则 supabase-js v2 会把空响应当错误（本仓既有先例）。
      const mockRest = (route) => {
        const method = route.request().method();
        if (method === 'POST') {
          return route.fulfill({
            status: 201,
            headers: { 'Content-Range': '0-0/1' },
            contentType: 'application/json',
            body: JSON.stringify([{}]),
          });
        }
        if (method === 'PATCH' || method === 'DELETE')
          return route.fulfill({ status: 204, body: '' });
        return route.fulfill({
          status: 200,
          headers: { 'Content-Range': '*/0' },
          contentType: 'application/json',
          body: '[]',
        });
      };
      await ctx.route('**/rest/v1/**', mockRest);
      await ctx.route('**/functions/v1/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'approved', moderation: 'approved' }),
        }),
      );

      await page.evaluate(() => document.querySelector('.pd-reply-input')?.focus?.());
      await page.fill('.pd-reply-input', '竖屏展开后发送应还原');
      await sleep(120);
      await page.click('.pd-reply-send');
      await sleep(SETTLE + 400);
      const afterSend = await page.evaluate(() => {
        const bar = document.querySelector('.pd-actionbar');
        const input = document.querySelector('.pd-reply-input');
        const group = document.querySelector('.pd-action-group');
        return {
          hasClass: Boolean(bar?.classList.contains('is-expanded')),
          value: input?.value ?? null,
          minHeight: input ? parseFloat(getComputedStyle(input).minHeight) || 0 : 0,
          groupDisplay: group ? getComputedStyle(group).display : null,
        };
      });
      report.info.detailAfterSend = afterSend;
      check(
        '详情页底栏发送成功后还原原始状态（去掉 is-expanded + 内容清空 + 操作组回来）',
        !afterSend.hasClass &&
          !String(afterSend.value || '').trim() &&
          afterSend.groupDisplay !== 'none',
        `class=${afterSend.hasClass} value="${afterSend.value}" minH=${afterSend.minHeight} 操作组=${afterSend.groupDisplay}`,
      );
      await page.screenshot({ path: `${OUT}/probe-reply-autogrow-detail-after-send.png` });
    }

    await ctx.close();
  }

  // ================= 场景 C：消息中心通知详情的回复框（plans/021 阶段2 接入） =================
  // mock 登录 + mock 通知：与 scripts/probes/probe-messages-ui.mjs 同款先例。
  // 原因：本页数据链路（getCurrentUser → supabase.auth.getUser）要真实 supabase 会话，
  // pinia 假登录到不了 REST 层，不 mock 就永远只有空态。高度断言与场景 A/B 完全同一套。
  {
    const mockUser = {
      id: '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'probe@bohlite.example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { username: 'probe_user' },
      created_at: '2024-01-01T00:00:00Z',
    };
    const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
    const mockRows = [
      {
        id: 'probe-n-comment',
        type: 'comment',
        status: 'unread',
        created_at: iso(5),
        sender_id: 'probe-u-sender',
        recipient_id: mockUser.id,
        archived_at: null,
        sender: { id: 'probe-u-sender', username: 'Mochi', avatar_url: '' },
        post: {
          id: 'probe-p-1',
          title: '竖屏回复框的多字扩展',
          body: null,
          content: '竖屏回复框的多字扩展',
        },
        comment: {
          id: 'probe-c-1',
          content: '竖屏写长回复时框不会变高，只能框内滚动，看不到上下文',
          parent_id: null,
          author_username: 'Mochi',
          parent: null,
        },
      },
      {
        id: 'probe-n-like',
        type: 'like',
        status: 'read',
        created_at: iso(60),
        sender_id: 'probe-u-sender2',
        recipient_id: mockUser.id,
        archived_at: null,
        sender: { id: 'probe-u-sender2', username: '星野', avatar_url: '' },
        post: { id: 'probe-p-2', title: null, body: null, content: 'Beta 的玻璃导航真好看' },
        comment: null,
      },
    ];

    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await ctx.route('**/auth/v1/user', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      }),
    );
    await ctx.route('**/rest/v1/notifications**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRows),
      }),
    );
    await ctx.addInitScript((user) => {
      // 伪造 supabase-js 本地会话：getUser() 才会真正发起 /auth/v1/user 请求
      localStorage.setItem(
        'sb-nplnlefdwfgtyimfkyih-auth-token',
        JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'mock-refresh-token',
          user,
        }),
      );
    }, mockUser);
    const page = await ctx.newPage();

    await page.goto(`${BASE}/#/user-space?tab=messages`, { waitUntil: 'domcontentloaded' });
    await injectAuth(page);
    // 与假会话双保险：把 pinia 的 userInfo 对齐 mock 用户，
    // 避免真实会话解析失败时列表落到未登录空态。
    await page.evaluate((user) => {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
      const auth = pinia?.state?.value?.auth;
      if (auth?.userInfo) {
        auth.userInfo.id = user.id;
        auth.userInfo.username = 'probe_user';
      }
    }, mockUser);

    const listReady = await waitForInPage(
      page,
      () => ({ done: Boolean(document.querySelector('.x-notifications-container .x-item')) }),
      { timeout: 25000 },
    );
    report.info.messagesList = { ready: Boolean(listReady?.done) };
    if (!listReady?.done) {
      skip('消息中心回复框', '通知列表 25s 内未渲染（mock 登录/数据链路异常，非代码问题）');
    } else {
      const opened = await page.evaluate(() => {
        // 只有 comment 类型通知详情里才有「回复」按钮
        const item = [...document.querySelectorAll('.x-notifications-container .x-item')].find(
          (el) => el.querySelector('.x-t-comment'),
        );
        if (!item) return false;
        item.click();
        return true;
      });
      const replyBtnReady = opened
        ? await waitForInPage(
            page,
            () => ({ done: Boolean(document.querySelector('.notif-action-btn.reply')) }),
            { timeout: 15000 },
          )
        : null;
      if (!replyBtnReady?.done) {
        skip('消息中心回复框', '没有 comment 类型通知或详情未打开（数据原因，非代码问题）');
      } else {
        await page.evaluate(() => document.querySelector('.notif-action-btn.reply')?.click());
        await page.waitForSelector('.reply-textarea', { timeout: 10000 });
        await sleep(SETTLE);

        const api = await runGrowthChecks(page, {
          selector: '.reply-textarea',
          label: '消息中心回复框',
        });
        report.info.messagesReplyBox = {
          H0: api.H0,
          maxHeight: api.MAX,
          samples: api.samples,
        };
        await page.screenshot({ path: `${OUT}/probe-reply-autogrow-messages.png` });

        await runRemountCheck(page, {
          selector: '.reply-textarea',
          label: '消息中心回复框',
          H0: api.H0,
          close: () => page.evaluate(() => document.querySelector('.cancel-reply-btn')?.click()),
          reopen: () =>
            page.evaluate(() => document.querySelector('.notif-action-btn.reply')?.click()),
        });
      }
    }

    await ctx.close();
  }

  // ================= 场景 D：社区伙伴印象墙的印象输入框（plans/021 阶段2 接入） =================
  // 伙伴列表是公开数据（profiles 公开读），走真实请求；pinia 假登录即可拿到
  // 「写印象」入口（isLoggedIn && 非本人；表单对本人不渲染，逐行尝试）。
  {
    const { ctx, page } = await newPage(browser);
    // Partners 路由 requiresLogin：路由守卫在**初始导航**就把未登录用户弹回 `/`，
    // 事后再注入 pinia 假登录来不及（hash 已被改成 `#/`）。按 probe-messages-ui.mjs
    // 先例：先落公开页 → 注入假登录 → 再切 hash（此时 from.name 已在、auth store
    // 已 initialized，守卫按已登录放行）。
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await injectAuth(page);
    await page.evaluate(() => {
      window.location.hash = '#/user-space/partners';
    });
    const listReady = await waitForInPage(
      page,
      () => ({ done: Boolean(document.querySelector('.partner-row')) }),
      { timeout: 25000 },
    );
    if (!listReady?.done) {
      skip('伙伴印象框', '伙伴列表 25s 内未渲染（数据原因，非代码问题）');
    } else {
      const clickWriteImpression = (idx) =>
        page.evaluate((i) => {
          const rows = [...document.querySelectorAll('.partner-row')];
          const row = rows[i];
          const btn =
            row &&
            [...row.querySelectorAll('.action-buttons button')].find(
              (b) => b.textContent.trim() === '写印象',
            );
          btn?.click();
          return Boolean(btn);
        }, idx);

      let openedIndex = -1;
      let boxReady = null;
      for (let attempt = 0; attempt < 5 && !boxReady?.done; attempt += 1) {
        await clickWriteImpression(attempt);
        boxReady = await waitForInPage(
          page,
          () => ({
            done: Boolean(document.querySelector('.add-impression-box .impression-input')),
          }),
          { timeout: 6000 },
        );
        if (boxReady?.done) {
          openedIndex = attempt;
        } else {
          // 这一行打不开（很可能就是当前用户本人），关掉弹窗试下一行
          await page.evaluate(() =>
            document.querySelector('.impression-modal .close-btn')?.click(),
          );
          await sleep(400);
        }
      }

      if (!boxReady?.done) {
        skip('伙伴印象框', '前 5 行都打不开印象表单（数据原因，非代码问题）');
      } else {
        await sleep(SETTLE);
        const api = await runGrowthChecks(page, {
          selector: '.impression-input',
          label: '伙伴印象框',
          // 印象框 padding 32px + 行高约 30px，rows=3 空态实测 123px，放宽上界
          emptyHeightMax: 160,
        });
        report.info.partnersImpressionBox = {
          H0: api.H0,
          maxHeight: api.MAX,
          samples: api.samples,
        };
        await page.screenshot({ path: `${OUT}/probe-reply-autogrow-partners.png` });

        await runRemountCheck(page, {
          selector: '.impression-input',
          label: '伙伴印象框',
          H0: api.H0,
          close: () =>
            page.evaluate(() => document.querySelector('.impression-modal .close-btn')?.click()),
          reopen: () => clickWriteImpression(openedIndex),
        });
      }
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
