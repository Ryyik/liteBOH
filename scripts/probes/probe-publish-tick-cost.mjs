/**
 * 探针：发帖进度 tick 引发的「虚拟列表 observer 重建」真实成本（Chromium 实测）
 *
 * 背景：发布进度 ticker 每 300ms 一次；旧实现的 `watch(visibleForumPosts)` 按数组引用
 * 比较，每次 tick 都 `disconnect() + querySelectorAll('[data-forum-virtual-index]') +
 * 重新 observe` 全部节点。本探针在**真实页面**上量这一次重建花多少主线程时间，
 * 用「次数 × 单位成本」给出可核对的量级（次数由 tests/unit/forum-feed-observer-churn 保证）。
 *
 * 用法：先 `npm run dev`，然后 `node scripts/probes/probe-publish-tick-cost.mjs`
 *      PROBE_BASE 默认 http://[::1]:5173（本机 dev 只监听 IPv6 回环，128.0.0.1 连不上）
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://[::1]:5173';
const ITERATIONS = Number(process.env.PROBE_ITERATIONS || 200);

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const MEASURE = async ({ iterations }) => {
  const stats = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3),
      p50: +at(0.5).toFixed(3),
      p95: +at(0.95).toFixed(3),
    };
  };

  // 真实虚拟窗口大小（用于取 N）；测量本身在**自建容器**里做 ——
  // 线上 feed 会随滚动/加载变化节点数，直接测真实列表会让样本不可比。
  const realVirtualCards = document.querySelectorAll('[data-forum-virtual-index]').length;
  const cardCount = Math.max(20, Math.min(50, realVirtualCards || 50));
  const source = realVirtualCards ? 'real-count' : 'synthetic-count';

  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:600px';
  for (let i = 0; i < cardCount; i += 1) {
    const card = document.createElement('article');
    card.setAttribute('data-forum-virtual-index', String(i));
    card.style.cssText = 'height:180px;margin:8px 0;border-radius:14px;background:#eef1f5';
    host.appendChild(card);
  }
  document.body.appendChild(host);
  const nodes = [...host.querySelectorAll('[data-forum-virtual-index]')];
  const count = nodes.length;

  // ① 只 querySelectorAll
  const queryOnly = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    const found = host.querySelectorAll('[data-forum-virtual-index]');
    if (found.length !== count) throw new Error('节点数变化，测量作废');
    queryOnly.push(performance.now() - t0);
  }

  // ② 完整重建：disconnect + querySelectorAll + observe 全部（旧实现每 tick 做的事）
  const fullRebuild = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    const observer = new IntersectionObserver(() => {}, {
      root: null,
      rootMargin: '900px 0px',
      threshold: 0.01,
    });
    host.querySelectorAll('[data-forum-virtual-index]').forEach((el) => observer.observe(el));
    // 读一次几何：真实重建里 observe 之后浏览器要重新计算交叉区域
    void document.body.offsetHeight;
    observer.disconnect();
    fullRebuild.push(performance.now() - t0);
  }

  host.remove();
  return {
    source,
    count,
    realVirtualCards,
    queryOnly: stats(queryOnly),
    fullRebuild: stats(fullRebuild),
  };
};

const main = async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 等帖子渲染出来（虚拟化只在 >40 帖时开启；不够也只是退化成 synthetic）
    await page
      .waitForSelector('[data-forum-virtual-index], .forum-post-card, article', { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    const result = await page.evaluate(MEASURE, { iterations: ITERATIONS });
    const tickMs = 300;
    const ticksPer20s = Math.ceil(20000 / tickMs);

    console.log('\n=== 发帖进度 tick → observer 重建成本（真实 Chromium）===');
    console.log(`节点 N=${result.count}（页面真实虚拟卡 ${result.realVirtualCards} 张）`);
    console.log(
      `querySelectorAll 单次:  mean ${result.queryOnly.mean}ms / p95 ${result.queryOnly.p95}ms`,
    );
    console.log(
      `完整重建单次:          mean ${result.fullRebuild.mean}ms / p95 ${result.fullRebuild.p95}ms`,
    );
    console.log(
      `\n按 20s 带图发布（${ticksPer20s} 次 tick）:` +
        `\n  旧实现 ≈ ${(ticksPer20s * result.fullRebuild.mean).toFixed(0)}ms 主线程纯开销` +
        `（p95 口径 ${(ticksPer20s * result.fullRebuild.p95).toFixed(0)}ms）` +
        `\n  新实现 = 0ms（进度 tick 不再触发重建；仅状态变化时约 3 次）`,
    );
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error('探针失败:', error);
  process.exit(1);
});
