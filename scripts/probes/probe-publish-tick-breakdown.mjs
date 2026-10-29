/**
 * 探针：发帖进度 tick 的**每 tick 真实成本**拆解（真实页面 + 真实组件实例）
 *
 * 为什么要拆：上一步量出「一次 observer 重建」只有 0.014ms，说明它不是卡顿主因。
 * 剩下的两个可疑项必须分别量：
 *   A. `forumData` 整列替换 + triggerRef → Vue 重渲染可见窗口（旧/新实现**都**要做）
 *   B. `buildOptimisticPost`（含 prepareForumPostForDisplay：6 张图 URL 变换 + LQIP）
 *      —— 旧实现每次 tick 都做，新实现只在状态变化时做
 * 本探针从真实组件实例（`<script setup>` 在 dev 下暴露 setupState）里直接取函数与状态来量。
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://[::1]:5173';
const ITERATIONS = Number(process.env.PROBE_ITERATIONS || 120);

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const MEASURE = async ({ iterations }) => {
  const findForumInstance = () => {
    const root = document.querySelector('.forum-page');
    if (!root) return null;
    let inst = root.__vueParentComponent || null;
    while (inst) {
      if (inst.setupState && 'forumData' in inst.setupState) return inst;
      inst = inst.parent;
    }
    return null;
  };

  const inst = findForumInstance();
  if (!inst) return { error: '没找到 ForumMain 组件实例（dev 模式才有 setupState）' };

  const ss = inst.setupState;
  const forumData = ss.forumData; // setupState 代理会自动解包 ref
  const posts = forumData;
  if (!Array.isArray(posts) || posts.length < 2) {
    return { error: `feed 帖数不足（${Array.isArray(posts) ? posts.length : 'not-array'}）` };
  }

  /* Vue 的调度器用 `resolvedPromise.then(flushJobs)` 排队；这里连发两个微任务，
     排在 flushJobs 之后，就能把「重渲染已经跑完」当成时间终点（不依赖 vue 内部 API）。 */
  const tick = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  const stats = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3),
      p50: +at(0.5).toFixed(3),
      p95: +at(0.95).toFixed(3),
    };
  };

  // ── A：整列替换 + 重渲染（旧/新都要做）
  const renderCost = [];
  for (let i = 0; i < iterations; i += 1) {
    const arr = [...posts];
    arr[0] = { ...arr[0], _progress: 10 + (i % 80) };
    const t0 = performance.now();
    ss.forumData = arr;
    await tick();
    renderCost.push(performance.now() - t0);
  }

  // ── B：buildOptimisticPost（旧实现每 tick 都做）。用**构造的 6 图样本**调用，
  //    不往真实队列塞东西（塞了会真的触发发布），避免污染页面状态。
  const sampleItem = {
    id: 'bench-queue-item',
    title: '进度 tick 基准样本标题',
    body: '一段用于测量的正文，长度接近真实发帖，包含标点与换行。',
    tag: 'daily',
    location: null,
    authorId: 'bench-user',
    authorUsername: 'bench_user',
    authorAvatarUrl: '',
    state: 'uploading',
    failedImageIndex: null,
    images: Array.from({ length: 6 }, (_, i) => ({
      uploadId: `bench-img-${i}`,
      localPreviewUrl: `https://res.cloudinary.com/demo/image/upload/v1/sample_${i}.jpg`,
      url: `https://res.cloudinary.com/demo/image/upload/v1/sample_${i}.jpg`,
      width: 1200,
      height: 900,
      uploadStatus: 'approved',
      sortOrder: i,
    })),
  };
  const buildCost = [];
  let buildNote = '';
  if (typeof ss.buildOptimisticPost === 'function') {
    for (let i = 0; i < iterations; i += 1) {
      const t0 = performance.now();
      ss.buildOptimisticPost(sampleItem);
      buildCost.push(performance.now() - t0);
    }
  } else {
    buildNote = 'buildOptimisticPost 未在 setupState 暴露';
  }

  // 页面里真实可见卡数（决定 A 的量级）
  const visibleCards = document.querySelectorAll('[data-forum-virtual-index]').length;
  return {
    totalPosts: posts.length,
    visibleCards,
    render: stats(renderCost),
    build: buildCost.length ? stats(buildCost) : null,
    buildNote,
    sampleImages: sampleItem.images.length,
  };
};

const main = async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('article', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // 虚拟化只在 >40 帖时开启；不多滚几次就量到的是「未虚拟化的短列表」，会低估重渲染成本
    for (let i = 0; i < 6; i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1200);
    }

    const r = await page.evaluate(MEASURE, { iterations: ITERATIONS });
    if (r.error) {
      console.log(`\n[跳过] ${r.error}`);
      return;
    }
    console.log('\n=== 发帖进度 tick 成本拆解（真实 Chromium / 真实组件）===');
    console.log(`列表总帖数 ${r.totalPosts}，可见虚拟卡 ${r.visibleCards}`);
    console.log(
      `A 整列替换+重渲染: mean ${r.render.mean}ms / p50 ${r.render.p50} / p95 ${r.render.p95}`,
    );
    if (r.build) {
      console.log(
        `B 乐观帖重建(旧每 tick 都做): mean ${r.build.mean}ms / p50 ${r.build.p50} / p95 ${r.build.p95}` +
          `（样本图 ${r.sampleImages} 张）`,
      );
      const saved = r.build.mean;
      console.log(
        `\n每次 tick 省下 ≈ ${saved.toFixed(3)}ms（B）+ 0.014ms（observer），` +
          `按 20s 带图发布 67 tick ≈ ${(saved * 67).toFixed(0)}ms`,
      );
    } else {
      console.log(`B 未测到：${r.buildNote}`);
    }
  } finally {
    await browser.close();
  }
};

main().catch((e) => {
  console.error('探针失败:', e);
  process.exit(1);
});
