/**
 * probe-css-visual-check.mjs — 路由 CSS 故障的**视觉**留证（截图三态对比）
 *
 * 为什么要单独有这一支：probe-css-load-failure.mjs 的判据全是程序化的
 * （getComputedStyle 差分 / link.sheet.cssRules.length / 布尔挂载位）。
 * 它们能证明「规则生效与否」，但**证不了「页面看起来对不对」**。
 * 本项目的页面大量用液态玻璃（backdrop-filter + color-mix），属性值全对
 * 而合成结果未必对（既有教训：「白玻璃要看元素自身 background-color，
 * 合成亮度会骗人」）。所以视觉结论必须由**人眼看图**得出，不能只看断言。
 *
 * 五态：
 *   A  健康「我的」页     参考系
 *   B  健康「成员」分区   参考系
 *   C  我的页 profile CSS 持续失败 + 恢复链限流  → 期望：半样式塌陷（肉眼可见）
 *   D  成员分区路由 CSS 失败                     → 期望：网格塌成流式
 *   E  瞬时失败 + 恢复链限流 → 页内自愈          → 期望：肉眼与 A 无法区分
 *
 * 用法：
 *   ./node_modules/.bin/vite preview --outDir dist-check --port 4180 --strictPort --host ::
 *   node scripts/probes/probe-css-visual-check.mjs http://[::1]:4180 [输出目录]
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://[::1]:4180';
const OUT = process.argv[3] || `/tmp/css-visual-${Date.now()}`;
mkdirSync(OUT, { recursive: true });

const PROFILE_CSS_PATTERNS = [
  '**/static/css/profile-base-*.css',
  '**/static/css/profile-panels-*.css',
  '**/static/css/responsive-integrations-*.css',
];

const log = (m) => console.log(`[css-visual] ${m}`);

// 视觉/就绪门判据：有任一不满足即 exit 1（本探针同时承担就绪门的端到端验收）
const violations = [];
const fail = (m) => violations.push(m);
const note = (m) => log(m);

/** 登录态注入：initLoginState() 会把无会话的 isLoggedIn 打回 false ⇒ 必须幂等补打 */
const loginInit = () => {
  const inject = () => {
    try {
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
      const auth = pinia?.state?.value?.auth;
      if (!auth) return;
      auth.isLoggedIn = true;
      auth.isInitialized = true;
      Object.assign(auth.userInfo, {
        id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
        username: 'probe_user',
        role: 'user',
        points: 42,
      });
    } catch {
      /* 还没挂载，下一轮再试 */
    }
  };
  const timer = setInterval(inject, 400);
  setTimeout(() => clearInterval(timer), 60000);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const newPage = async ({ width = 1440, height = 1000 } = {}) => {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    serviceWorkers: 'block', // 隔离 SW，专测应用层表现（SW 代发请求拦不到，见既有教训）
  });
  const page = await ctx.newPage();
  await page.addInitScript(loginInit);
  return { ctx, page };
};

const shot = async (page, name) => {
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  log(`  截图 → ${path}`);
  return path;
};

/** 就绪门采样：posts 面板的可见性 + data-styles-ready 标记 */
const probeProfileVisibility = () => {
  const host = document.querySelector('.content-home-host');
  return {
    hostFound: Boolean(host),
    hostVisibility: host ? getComputedStyle(host).visibility : null,
    dataStylesReady: host ? host.getAttribute('data-styles-ready') : null,
    shellFound: Boolean(document.querySelector('.profile-home-shell')),
  };
};

/** 进入「我的」页（posts 分区） */
const gotoProfile = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.location.hash = '#/user-space?tab=posts';
  });
  await page.waitForSelector('.profile-home-shell', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(3000);
};

/** 进入「成员」分区 */
const gotoCommunity = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.location.hash = '#/user-space?tab=community';
  });
  await page.waitForTimeout(2500);
  const btn = page.locator('button.segment-tab', { hasText: '成员' }).first();
  if (await btn.count()) await btn.click().catch(() => {});
  await page.waitForSelector('.community-page-grid', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

/** 恢复链限流：vite:preloadError 预置冷却戳 + URL 带 bohAssetRecovery（link-error 监听全程惰性） */
const throttleRecovery = async (page) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('boh_vite_preload_reload_ts', String(Date.now()));
    } catch {
      /* 忽略 */
    }
  });
};

const results = {};

try {
  // ---------- A / B：健康参考系 ----------
  log('场景 A —— 健康「我的」页');
  {
    const { ctx, page } = await newPage();
    await gotoProfile(page);
    results.A = await shot(page, 'A-healthy-profile');
    await ctx.close();
  }

  log('场景 B —— 健康「成员」分区');
  {
    const { ctx, page } = await newPage();
    await gotoCommunity(page);
    results.B = await shot(page, 'B-healthy-community');
    await ctx.close();
  }

  // ---------- C：我的页三样式持续失败（半样式塌陷） ----------
  log('场景 C —— 我的页 profile CSS 持续失败 + 恢复链限流');
  {
    const { ctx, page } = await newPage();
    await throttleRecovery(page);
    for (const pattern of PROFILE_CSS_PATTERNS) {
      await page.route(pattern, (route) => route.abort());
    }
    await gotoProfile(page);
    await page.waitForTimeout(6000);
    results.C = await shot(page, 'C-broken-profile');
    await ctx.close();
  }

  // ---------- D：成员分区路由 CSS 失败 ----------
  log('场景 D —— 成员分区路由 CSS 失败');
  {
    const { ctx, page } = await newPage();
    // 运行时反查承载 .community-page-grid 的 index-<hash>.css
    const html = await (await fetch(`${BASE}/`)).text();
    const appJs = html.match(/src="\.\/(static\/js\/app-[^"]+\.js)"/)?.[1];
    const targets = [];
    if (appJs) {
      const chunk = await (await fetch(`${BASE}/${appJs}`)).text();
      const candidates = [
        ...new Set(
          [...chunk.matchAll(/"(\.\.\/css\/index-[A-Za-z0-9_-]+\.css)"/g)].map((m) => m[1]),
        ),
      ];
      for (const rel of candidates) {
        const css = await (await fetch(`${BASE}/static/js/${rel}`)).text();
        if (css.includes('.community-page-grid{')) targets.push(rel.split('/').pop());
      }
    }
    log(`  拦截目标：${targets.join(', ') || '（未找到）'}`);
    await throttleRecovery(page);
    for (const f of targets) await page.route(`**/static/css/${f}`, (route) => route.abort());
    await gotoCommunity(page);
    await page.waitForTimeout(6000);
    results.D = await shot(page, 'D-broken-community');
    await ctx.close();
  }

  // ---------- E：瞬时失败 → 页内自愈（肉眼应与 A 无差） ----------
  log('场景 E —— 我的页瞬时失败 + 恢复链限流 → 页内自愈');
  {
    const { ctx, page } = await newPage();
    await throttleRecovery(page);
    const counters = new Map();
    for (const pattern of PROFILE_CSS_PATTERNS) {
      await page.route(pattern, (route) => {
        const n = (counters.get(pattern) || 0) + 1;
        counters.set(pattern, n);
        if (n <= 1) route.abort();
        else route.continue();
      });
    }
    await page.goto(`${BASE}/?bohAssetRecovery=1`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      window.location.hash = '#/user-space?tab=posts';
    });
    await page.waitForSelector('.profile-home-shell', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(12000); // 退避窗口 700ms / 1.8s / 4s
    results.E = await shot(page, 'E-healed-profile');
    await ctx.close();
  }
  // ============================================================
  // 场景 F：冷启动直达 posts 的「就绪门」—— 样式未就位前不亮内容
  // ============================================================
  const runReadyGate = async ({ name, cssDelayMs, earlyWaitMs = 0, extraWaitMs = 2500 }) => {
    log(`场景 F(${name}) —— profile CSS 延迟 ${cssDelayMs}ms`);
    const { ctx, page } = await newPage();
    for (const pattern of PROFILE_CSS_PATTERNS) {
      await page.route(pattern, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, cssDelayMs));
        await route.continue();
      });
    }
    // 冷启动直达：直接落在 posts（区别于「从首页点进来」那条已被 await 预载的路径）
    await page.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'commit' });
    // ⚠️ 必须等面板**挂载**后再采样：「host 还没渲染」不算证据，
    //    要看到「渲染出来了、但被就绪门按住」才是就绪门生效（首版就弱通过在这里）。
    const appeared = await page
      .waitForSelector('.content-home-host', { timeout: 5000, state: 'attached' })
      .then(() => true)
      .catch(() => false);
    if (earlyWaitMs) await page.waitForTimeout(earlyWaitMs);
    const early = await page
      .evaluate(probeProfileVisibility)
      .catch((err) => ({ err: String(err) }));
    results[`F-${name}-early`] = await shot(page, `F-${name}-early`);
    await page.waitForTimeout(extraWaitMs);
    const late = await page.evaluate(probeProfileVisibility).catch((err) => ({ err: String(err) }));
    results[`F-${name}-late`] = await shot(page, `F-${name}-late`);
    await ctx.close();
    return { appeared, early, late };
  };

  {
    // F1：CSS 延迟 2500ms（> 1000ms 兜底）⇒ 面板挂上那一刻应仍被按住
    const { appeared, early, late } = await runReadyGate({
      name: 'in-window',
      cssDelayMs: 2500,
      extraWaitMs: 2600,
    });
    log(`  面板已挂载：${appeared}`);
    log(`  早期：${JSON.stringify(early)}`);
    log(`  晚期：${JSON.stringify(late)}`);
    if (!appeared) {
      fail('场景 F1：posts 面板始终没挂载，就绪门无法判定（探针基线失效）');
    } else if (early.dataStylesReady === null) {
      fail(
        `场景 F1：面板没有 data-styles-ready 标记（${JSON.stringify(early)}）—— 就绪门未实现，` +
          '样式未就位时内容会直接可见（即「先裸后穿」）',
      );
    } else if (early.dataStylesReady === 'false' && early.hostVisibility !== 'hidden') {
      fail(`场景 F1：未就绪却已可见（${JSON.stringify(early)}）—— 就绪门没生效，仍会「先裸后穿」`);
    } else if (early.dataStylesReady === 'false') {
      note('  ✔ F1：面板挂载后先被按住（visibility:hidden + data-styles-ready=false）');
    } else {
      note('  （采样点已越过兜底窗口，本档未观测到按住态 —— 兜底路径由 F2 覆盖）');
    }
    if (late.hostVisibility !== 'visible' || late.dataStylesReady !== 'true')
      fail(`场景 F1：晚期仍不可见/未就绪（${JSON.stringify(late)}）—— 内容被永久挡住`);
    else note('  ✔ F1 晚期：样式就位后正常亮出');
  }

  {
    // F2：CSS 延迟 8000ms（远超兜底）⇒ 兜底必须在窗口后放行，绝不永久空白
    const { early } = await runReadyGate({
      name: 'past-fallback',
      cssDelayMs: 8000,
      earlyWaitMs: 1600,
      extraWaitMs: 50,
    });
    log(`  兜底窗口后：${JSON.stringify(early)}`);
    if (early.hostVisibility === 'visible') note('  ✔ F2：超出兜底窗口后被放行（不会永久空白）');
    else fail(`场景 F2：样式迟到时内容一直不可见（${JSON.stringify(early)}）—— 兜底失效`);
  }
} finally {
  await browser.close();
}

log('输出目录：' + OUT);
console.log(JSON.stringify(results, null, 2));

if (violations.length) {
  console.error(`\n[css-visual] 未通过 ${violations.length} 项：`);
  violations.forEach((v) => console.error(`  ✘ ${v}`));
  process.exitCode = 1;
} else {
  console.log('\n[css-visual] 视觉留证 + 就绪门验收全部通过 ✔');
}
