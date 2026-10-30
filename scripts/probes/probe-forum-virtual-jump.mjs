#!/usr/bin/env node
/**
 * probe-forum-virtual-jump.mjs — 虚拟列表「跳跃式滚动」窗口是否跟随（2026-10-30 P1-3）
 *
 * 断言（全部绿才算过）：
 *   J0 虚拟化已开启（前置；不满足时 exit 2，不当作「有 bug」也不当作「已修好」）
 *   J1 跳跃到底后，视口内至少一张卡片（不许整屏空白 spacer）
 *   J2 确实跳进了列表深处（防止「探针根本没滚动」导致 J1 假绿）
 *   J3 从底部跳回顶部后，视口内仍有卡片
 *   J4 无未捕获运行时异常
 *
 * ⚠️ 卡片根类名是 `.post-card-v2`（`PostCard.vue`）；`.post-card` 是历史类名，别混用。
 *
 * 退出码：0 全绿 / 1 有断言红 / 2 前置条件不满足（帖子不足 40 条，虚拟化未开启）
 * —— 用 2 区分「探针没测到」与「真的有 bug」，避免把无效运行当成复现证据。
 *
 * 为什么需要这条：`useForumVirtualFeed` 的窗口索引**只由**「已渲染卡片进入视口」推进
 * （IntersectionObserver 只 observe 已在 DOM 里的卡），渲染窗口 = [idx-20, idx+30]，
 * 上下用固定 300px/条 的 spacer 撑高。用户拖滚动条直达底部时视口落在
 * 「底部 spacer」里 —— 一张卡都没有，而 observer 观测的都是**上方**那些卡，
 * 全部 isIntersecting=false ⇒ 索引不动 ⇒ 空白不会自愈。
 * 现有 `tests/unit/forum-virtual-feed.test.js` 只断言「窗口有界 / 短列表全量渲染」，
 * 覆盖不到这条路径。
 *
 * 前置：dev server（`BASE` 覆盖；vite 只绑 IPv6，用 localhost 即可）
 * 运行：node scripts/probes/probe-forum-virtual-jump.mjs
 * 产物：debug-screenshots/forum-virtual-jump-*.png
 *
 * ⚠️ 反证（必须做，否则不算自证）：修好后把 `useForumVirtualFeed.js` 里的 scroll
 * 兜底注释掉 ⇒ J1 必须变红。只绿未红过的探针没有牙。
 * ⚠️ 阈值与宿主常量同步：`VIRTUAL_FEED_MIN_COUNT = 40`、`POSTS_PER_PAGE = 10`
 * （`src/views/Forum/composables/useForumVirtualFeed.js` / `forum-config.js`）。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || 'debug-screenshots';
const VIRTUAL_FEED_MIN_COUNT = 40; // 与 useForumVirtualFeed.js 保持一致
const MAX_LOAD_MORE_ROUNDS = 12; // 10 条/页，翻到 40+ 留足余量

mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 300) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

try {
  /* 导航重试一次：vite 首次 transform / 连续起多个 headless Chrome 时，
     首屏可能超过 60s 或被中途打断（实测连跑三轮出现过两轮卡在等卡片的阶段）。
     重试只是把「加载期竞态」与「真的有 bug」分开 —— 重试后仍必须过全部断言。 */
  const bootOnce = async () => {
    await page.goto(`${BASE}/#/user-space?tab=community`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(600);
    // 匿名可读（社区 tab 不要求登录）；等首屏卡片出现即代表 Vue 已挂载，
    // 不必再额外等 pinia —— 少一个失败面。
    await page.waitForSelector('.post-card-v2', { timeout: 60000 });
    await page.waitForTimeout(1200);
  };
  try {
    await bootOnce();
  } catch (firstError) {
    console.log(
      `… 首屏加载超时，重试一次（${String(firstError?.message || firstError).slice(0, 80)}）`,
    );
    await page.waitForTimeout(2000);
    await bootOnce();
  }

  /* 注入滚动容器解析器。⚠️ page.evaluate 只序列化函数体、闭包依赖必须当参数传
     （docs/AI-ENV.md），所以这里把实现挂到 window 上一次，后续复用，不重复内联。 */
  await page.evaluate(() => {
    window.__probeScroller = () => {
      const seed =
        document.querySelector('.forum-virtual-spacer') ||
        document.querySelector('[data-forum-virtual-index]') ||
        document.querySelector('.post-card-v2');
      let el = seed?.parentElement || null;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (
          ['auto', 'scroll', 'overlay'].includes(cs.overflowY) &&
          el.scrollHeight > el.clientHeight + 100
        ) {
          return { kind: 'element', el };
        }
        el = el.parentElement;
      }
      return { kind: 'window', el: document.scrollingElement || document.documentElement };
    };
    window.__probeScroll = (where) => {
      const { kind, el } = window.__probeScroller();
      const top = where === 'bottom' ? el.scrollHeight : 0;
      if (kind === 'window') window.scrollTo(0, top);
      else el.scrollTop = top;
    };
    window.__probeMetrics = () => {
      const { kind, el } = window.__probeScroller();
      const vh = kind === 'window' ? window.innerHeight : el.clientHeight;
      const vtop = kind === 'window' ? 0 : el.getBoundingClientRect().top;
      const visibleCards = [...document.querySelectorAll('.post-card-v2')].filter((card) => {
        const r = card.getBoundingClientRect();
        return r.bottom > vtop && r.top < vtop + vh && r.height > 0;
      }).length;
      const scrollTop = kind === 'window' ? window.scrollY : el.scrollTop;
      const maxScroll = Math.max(1, el.scrollHeight - vh);
      return {
        kind,
        scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: vh,
        /* ⚠️ 不能用「是否恰好停在底部」当判据：跳跃到底会触发 loadMore，
           新一页追加到下方把 scrollHeight 撑大，于是 atBottom 立刻变 false
           —— 那是期望行为，不是没滚到位。用「已滚进列表深处」的比例判据。 */
        scrollRatio: scrollTop / maxScroll,
        visibleCards,
        renderedCards: document.querySelectorAll('.post-card-v2').length,
        spacers: [...document.querySelectorAll('.forum-virtual-spacer')].map((n) =>
          Math.round(n.getBoundingClientRect().height),
        ),
      };
    };
    window.__probeVirtualized = () => document.querySelectorAll('.forum-virtual-spacer').length > 0;
  });

  /* ── 阶段一：反复滚到底触发 loadMore，直到虚拟化开启 ──────────────────
     判据用 `.forum-virtual-spacer` 的存在（由 `virtualFeed*SpacerHeight > 0` 渲染），
     这是「窗口已收窄」的唯一 DOM 证据；卡数不能当判据（窗口内恒 ≤50）。 */
  let virtualized = false;
  let rounds = 0;
  for (; rounds < MAX_LOAD_MORE_ROUNDS; rounds += 1) {
    virtualized = await page.evaluate(() => window.__probeVirtualized());
    if (virtualized) break;
    await page.evaluate(() => window.__probeScroll('bottom'));
    await page.waitForTimeout(1500); // 等 onLoadMore 落地 + 卡片渲染
  }

  const m0 = await page.evaluate(() => window.__probeMetrics());
  check(
    `J0 虚拟化已开启（需 > ${VIRTUAL_FEED_MIN_COUNT} 条帖子）`,
    virtualized,
    `rounds=${rounds} kind=${m0.kind} rendered=${m0.renderedCards} spacers=${JSON.stringify(m0.spacers)}`,
  );

  if (virtualized) {
    /* ── 阶段二：跳跃到底 —— 不产生「卡片逐个进入视口」的中间态 ──────── */
    await page.evaluate(() => window.__probeScroll('bottom'));
    await page.waitForTimeout(900); // 给 observer / rAF 兜底一个反应窗口
    const mBottom = await page.evaluate(() => window.__probeMetrics());
    await page.screenshot({ path: `${OUT}/forum-virtual-jump-bottom.png` });

    check(
      'J1 跳跃到底后视口内仍有卡片（不许整屏空白）',
      mBottom.visibleCards > 0,
      `可见=${mBottom.visibleCards} 已渲染=${mBottom.renderedCards} spacers=${JSON.stringify(mBottom.spacers)} scrollTop=${Math.round(mBottom.scrollTop)}/${mBottom.scrollHeight}`,
    );
    check(
      'J2 确实跳进了列表深处（防止 J1 因「根本没滚动」假绿）',
      mBottom.scrollRatio >= 0.6,
      `滚动比例=${mBottom.scrollRatio.toFixed(2)} scrollTop=${Math.round(mBottom.scrollTop)} scrollHeight=${mBottom.scrollHeight} vh=${mBottom.clientHeight}`,
    );

    /* ── 阶段三：从底部跳回顶部 ──────────────────────────────────────── */
    await page.evaluate(() => window.__probeScroll('top'));
    await page.waitForTimeout(900);
    const mTop = await page.evaluate(() => window.__probeMetrics());
    await page.screenshot({ path: `${OUT}/forum-virtual-jump-top.png` });

    check(
      'J3 回顶后视口内仍有卡片',
      mTop.visibleCards > 0,
      `可见=${mTop.visibleCards} 已渲染=${mTop.renderedCards} spacers=${JSON.stringify(mTop.spacers)}`,
    );
  }

  check('J4 无未捕获运行时异常', pageErrors.length === 0, pageErrors.join(' | '));
} catch (error) {
  check('J5 探针自身跑通', false, error?.message || String(error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
const onlyPrecondition = failed.length === 1 && /^J0/.test(failed[0].name);
console.log(
  `\n${failed.length ? '❌' : '✅'} probe-forum-virtual-jump: ${results.length - failed.length}/${results.length} 通过`,
);
if (failed.length) {
  console.log('失败项：' + failed.map((f) => f.name).join(' / '));
  if (onlyPrecondition) {
    console.log('⚠️ 未能判定 P1-3：数据量不足以开启虚拟化，本探针不构成任何结论。');
    process.exit(2);
  }
  process.exit(1);
}
