/**
 * probe-bottomnav-switch-timeline.mjs — 点底栏「图库」那一拍，屏幕上到底发生了什么？
 *
 * 用户报障（2026-11-16）：「底部导航栏切换到图库还是会卡一下，然后导航栏重新出现；
 * 进入网页第一次来回切的时候整体都不流畅」。
 *
 * 这条探针**逐帧**记录一次跨路由切换的时间线，用来区分三种完全不同的病因：
 *   · 空窗（chunk 下载 / Suspense fallback 期间屏幕没内容）—— 表现为 content=false 的帧
 *   · 底栏重建（旧页卸载 → 新页挂载，中间有几帧根本没有底栏）—— 表现为 nav=0 的帧
 *   · 掉帧（主线程长任务）—— 表现为帧间隔 > 100ms 的「卡」
 * 三者修法完全不同，靠肉眼「感觉卡」分不出来，所以必须先量化。
 *
 * 判据全部来自实际渲染结果（元素在不在、rect、computedStyle），不看路由状态：
 * 路由变了但屏幕没变，正是用户说的「点了没反应」。
 *
 * ── 2026-11-16 实测基线（4G 限速 1.6Mbps，`--slow`）────────────────────
 *   修前（路由只等薄壳，内层重面板 commit 后再等）：
 *     A 首切：底栏缺失 **349ms**（179→512ms），21 帧只有 `cp-suspense` 骨架，
 *             全页最少时只剩 19 个字 —— 「卡一下 + 导航栏消失又长回来」。
 *   修后（routes/user-space.ts 的 loadCloudPlusPage 把内层一起 await）：
 *     A 首切：底栏缺失 **16ms**（1 帧），骨架 1 帧。剩下那 350ms 是网络本身，
 *             屏幕停在旧页（内容 + 底栏都在），到齐后一次切到位。
 *   所以本探针的断言线定在 50ms（3 帧）：修前必然红、修后稳定绿。
 *
 * ⚠️ 必须带 `--slow`：本地 preview 从 dist 读盘，不限速时两种实现都只缺 1 帧，
 *   断言等于没有牙（这是本探针存在的意义 —— 别为了「跑得快」去掉限速）。
 *
 * 用法：
 *   npx vite preview --outDir dist --port 4180 --strictPort
 *   node scripts/probes/probe-bottomnav-switch-timeline.mjs http://[::1]:4180 --slow
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';
/* `--slow`：4G 档限速（1.6Mbps / 150ms RTT），复现用户真实网络。
   ⚠️ 本地 preview 读 dist 是磁盘速度，不限期测出来底栏只缺 1 帧（16ms）——
   「感觉卡」在本地是测不出来的，必须先限速，否则会误判成「没问题」。 */
const SLOW = process.argv.includes('--slow');

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 160)));

if (SLOW) {
  const client = await ctx.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

const injectLogin = () =>
  page.evaluate(() => {
    try {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      auth.isInitialized = true;
      Object.assign(auth.userInfo, {
        id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
        username: 'probe_user',
        role: 'user',
        points: 42,
      });
      return true;
    } catch {
      return false;
    }
  });

/** 逐帧采样器：点击前装好，点击后收口。全部在页面内跑，避免 CDP 往返抖动。 */
const installSampler = () =>
  page.evaluate(() => {
    const samples = [];
    const longTasks = [];
    let running = true;
    let t0 = 0;
    /* 长任务单独观测：帧间隔只能说明「有一顿」，longtask 能给出它有多长、
       发生在切换的哪个阶段（chunk 到齐那一拍 vs 页面挂载之后）。 */
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({
            start: t0 ? Math.round(entry.startTime - t0) : Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      /* 老浏览器没有 longtask，忽略 */
    }
    const frame = (now) => {
      if (!running) return;
      const nav = document.querySelector('.bottom-nav-glass');
      const navRect = nav ? nav.getBoundingClientRect() : null;
      const navStyle = nav ? getComputedStyle(nav) : null;
      const navVisible = Boolean(
        nav &&
        navRect &&
        navRect.height > 8 &&
        navStyle &&
        navStyle.display !== 'none' &&
        navStyle.visibility !== 'hidden' &&
        Number(navStyle.opacity) > 0.05,
      );
      /* 主内容区：路由出口的可见文字量。骨架/空容器都算「没内容」，
         因为我们关心的是「用户眼前有没有东西」，不是「DOM 在不在」。 */
      const main = document.querySelector('#app');
      const textLen = main ? (main.innerText || '').replace(/\s+/g, '').length : 0;
      samples.push({
        t: t0 ? Math.round(now - t0) : 0,
        nav: navVisible ? 1 : 0,
        navCount: document.querySelectorAll('.bottom-nav-glass').length,
        entering: nav ? nav.classList.contains('is-entering') : false,
        collapsed: nav ? nav.classList.contains('is-collapsed') : false,
        cp: document.querySelectorAll('.cloud-page').length,
        cpSuspense: document.querySelectorAll('.cp-suspense').length,
        text: textLen,
        hash: location.hash,
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    window.__probeSampler = {
      start: () => {
        t0 = performance.now();
      },
      stop: () => {
        running = false;
        return { samples, longTasks };
      },
    };
  });

const clickNav = async (label) => {
  await page.evaluate(() => window.__probeSampler.start());
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('.bottom-nav-glass .nav-item')].find((el) =>
      (el.textContent || '').includes(text),
    );
    if (!button) return false;
    button.click();
    return true;
  }, label);
  await page.waitForTimeout(SLOW ? 4500 : 2000);
  const { samples, longTasks } = await page.evaluate(() => window.__probeSampler.stop());
  return { clicked, samples, longTasks };
};

const summarize = (samples) => {
  const gaps = [];
  for (let i = 1; i < samples.length; i += 1) {
    gaps.push(samples[i].t - samples[i - 1].t);
  }
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const navOff = samples.filter((s) => s.nav === 0);
  const firstNavOff = navOff.length ? navOff[0].t : null;
  const lastNavOff = navOff.length ? navOff[navOff.length - 1].t : null;
  const firstText = samples.find((s) => s.t > 0 && s.text > 40);
  const firstCp = samples.find((s) => s.cp > 0 && s.cpSuspense === 0);
  const minText = Math.min(...samples.filter((s) => s.t > 0).map((s) => s.text));
  const enteredFrames = samples.filter((s) => s.entering).length;
  const suspenseFrames = samples.filter((s) => s.cpSuspense > 0).length;
  /* 底栏缺失的那些帧里，屏幕上是骨架还是空白？分开数才知道该补什么。 */
  const navOffWithSkeleton = navOff.filter((s) => s.cpSuspense > 0).length;
  return {
    frames: samples.length,
    maxGap,
    navMissingMs: navOff.length ? lastNavOff - firstNavOff + 16 : 0,
    firstNavOff,
    lastNavOff,
    firstContentT: firstText ? firstText.t : null,
    firstCloudT: firstCp ? firstCp.t : null,
    minText,
    enteredFrames,
    suspenseFrames,
    navOffWithSkeleton,
    repeatedNavInstances: Math.max(...samples.map((s) => s.navCount)),
  };
};

const violations = [];

const report = (name, res) => {
  const s = summarize(res.samples);
  console.log(`\n── ${name} ──`);
  console.log(`  点击命中: ${res.clicked}`);
  console.log(`  采样帧数: ${s.frames}（最长帧间隔 ${s.maxGap}ms）`);
  const tasks = (res.longTasks || []).filter((task) => task.duration >= 50);
  if (tasks.length) {
    console.log(
      `  长任务: ${tasks.map((task) => `${task.start}ms+${task.duration}ms`).join(', ')}`,
    );
  }
  console.log(
    `  底栏缺失: ${s.navMissingMs}ms${s.firstNavOff === null ? '（全程都在）' : `（${s.firstNavOff} → ${s.lastNavOff}ms）`}`,
  );
  console.log(`  首次有内容: ${s.firstContentT}ms   图库根出现: ${s.firstCloudT}ms`);
  console.log(`  内容最少时字数: ${s.minText}   入场动画帧: ${s.enteredFrames}`);
  console.log(`  骨架帧: ${s.suspenseFrames}（其中底栏同时缺失 ${s.navOffWithSkeleton} 帧）`);
  const sparse = res.samples
    .filter((_, i) => i % 6 === 0)
    .map((s) => `${s.t}:${s.nav ? 'N' : '-'}${s.cp ? 'C' : ''}${s.text > 40 ? 'T' : '.'}`)
    .join(' ');
  console.log(`  时间轴: ${sparse}`);

  if (!res.clicked) violations.push(`${name}：没点到目标席位，本组数据不可用`);
  /* 底栏缺失上限 50ms（约 3 帧）。修前实测 349ms（21 帧），修后 16ms（1 帧）。
     这个上限是「一帧交接」与「半秒空窗」之间的分界，不是随便取的。 */
  if (s.navMissingMs > 50) {
    violations.push(`${name}：底栏缺失 ${s.navMissingMs}ms（上限 50ms）—— 切换期间屏幕上没有底栏`);
  }
  if (s.suspenseFrames > 3) {
    violations.push(
      `${name}：出现 ${s.suspenseFrames} 帧图库骨架（上限 3）—— 说明导航是两段式的，内层 chunk 没被 loader 等住`,
    );
  }
  /* 200ms 而不是 100ms：共享机上偶发过一次 167ms（同一构建连跑复现不出来，
     属测量噪声），而这条要抓的是「用户明确能感觉到的一顿」。
     修前那条空窗是 349ms 起步，200ms 的线照样抓得到它。 */
  if (s.maxGap > 200) {
    violations.push(`${name}：最长帧间隔 ${s.maxGap}ms（上限 200ms）—— 主线程有长任务`);
  }
  return s;
};

/* ── 起手：首页、伪造登录、解锁开场画 ── */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const bootWait = SLOW ? 9000 : 2400;
await page.waitForTimeout(bootWait);
await injectLogin();
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
});
await page.waitForTimeout(SLOW ? 7000 : 3000);

await installSampler();

/* A. 首次：进入网页后第一次点「图库」 */
report('A 首页 → 图库（本次会话首切）', await clickNav('图库'));

/* B. 回首页再切一次（chunk 已有缓存 / 页面已缓存） */
await clickNav('内容');
await page.waitForTimeout(400);
await installSampler();
report('B 首页 → 图库（第二次）', await clickNav('图库'));

/* C. 我 → 图库（相邻两席，热点路径） */
await page.evaluate(() => {
  window.location.hash = '#/user-space?tab=posts';
});
await page.waitForTimeout(1800);
await installSampler();
report('C 我 → 图库', await clickNav('图库'));

/* D. 图库 → 我（反向） */
await installSampler();
report('D 图库 → 我', await clickNav('我'));

if (pageErrors.length) {
  console.log('\n⚠️ 页面报错:');
  for (const err of pageErrors) console.log(`  · ${err}`);
}

await browser.close();

if (violations.length) {
  console.log(`\n❌ ${violations.length} 项不达标：`);
  for (const item of violations) console.log(`  · ${item}`);
  process.exitCode = 1;
} else {
  console.log('\n✅ 底栏跨页切换连续：无 >50ms 缺失、无两段式骨架、无长任务');
}
