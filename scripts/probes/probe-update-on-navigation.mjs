/**
 * probe-update-on-navigation.mjs —— 「导航时先切构建」的端到端验收
 *
 * 背景（2026-10-13）：用户一直开着页面时，version-checker 的轮询/可见性检查发现新构建
 * 只弹 toast、不刷新，页面继续跑旧构建；而他下一次点导航正好去请求**已被新部署删掉的
 * hash 资源**（实测：点底栏毫无反应 / 半样式，只能等恢复链整页兜）。
 * 修法是把强刷放到「用户本来就要换页的那一拍」（router.beforeEach 最前面），
 * 同一目标 buildId 只试一次（沿用 boh_version_reload_target 护栏）。
 *
 * 本探针要证四件事：
 *   ① 远端与当前一致时，导航**不**触发任何刷新（不能影响正常导航）；
 *   ② 远端更新后（轮询/可见性发现），**下一次导航**触发一次整页切换；
 *   ③ 切换 URL 带目标 buildId，且**保留 hash 落点**；
 *   ④ 之后再导航**不再刷**（防循环）。
 *
 * 用法：
 *   ./node_modules/.bin/vite preview --outDir dist-check --port 4180 --strictPort --host ::
 *   node scripts/probes/probe-update-on-navigation.mjs http://[::1]:4180
 */

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';

const violations = [];
const fail = (m) => violations.push(m);
const note = (m) => console.log(`[update-nav] ${m}`);

const entryHtml = await (await fetch(`${BASE}/`)).text();
const currentBuildId = entryHtml.match(/name="boh-build-id" content="([^"]+)"/)?.[1] || '';
const currentVersion = entryHtml.match(/name="boh-version" content="([^"]+)"/)?.[1] || '0.0.0';
if (!currentBuildId) fail('读不到 index.html 里的 boh-build-id，探针无法构造「与当前一致」的基线');
note(`当前构建：${currentVersion} / ${currentBuildId}`);

/** 远端版本号的唯一开关：null = 与当前一致，字符串 = 假装部署了新构建 */
let remoteBuildId = null;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block', // 隔离 SW，专测应用层行为
  });
  const page = await ctx.newPage();

  const loads = [];
  page.on('load', () => loads.push(page.url()));

  await page.route('**/version.json*', (route) => {
    const buildId = remoteBuildId || currentBuildId;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: currentVersion, buildId, commitHash: 'probe', timestamp: 0 }),
    });
  });

  await page.addInitScript(() => {
    window.__bohUpdateEvents = [];
    window.addEventListener('boh:update-available', (e) => {
      window.__bohUpdateEvents.push(e?.detail?.remoteBuildId || 'unknown');
    });
  });

  // ---- ① 远端一致：启动 + 两次导航都不该有额外刷新 ----
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(6000); // 等启动那条 autoCheck（idle 后触发）跑完
  const loadsAfterBoot = loads.length;
  await page.evaluate(() => {
    window.location.hash = '#/forum';
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.location.hash = '#/activities-wall';
  });
  await page.waitForTimeout(2000);
  note(
    `远端一致时：整页加载 ${loads.length} 次（启动 ${loadsAfterBoot} 次），更新事件 ${await page.evaluate(() => window.__bohUpdateEvents.length)} 个`,
  );
  if (loads.length > loadsAfterBoot) fail('远端一致时导航却触发了整页刷新（不该影响正常导航）');

  // ---- ② 远端更新 → 可见性检查发现 → 下一次导航触发一次切换 ----
  remoteBuildId = `probe-${Date.now()}`;
  note(`把远端切成新构建：${remoteBuildId}`);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page
    .waitForFunction(() => window.__bohUpdateEvents.length > 0, { timeout: 12000 })
    .catch(() => fail('可见性检查没有发现新构建（挂起态没建立，后续断言无意义）'));

  const beforeNav = loads.length;
  await page.evaluate(() => {
    window.location.hash = '#/user-space?theme=light';
  }); // 换一个 hash 目标，顺便看落点是否保留
  await page.waitForTimeout(4000);

  const newLoads = loads.slice(beforeNav);
  note(
    `导航后新增整页加载：${newLoads.length} 次${newLoads.length ? ` → ${newLoads[0].split('#')[1] || '（无 hash）'}` : ''}`,
  );
  if (newLoads.length !== 1) {
    fail(`新构建已知时，导航应恰好触发 1 次整页切换，实测 ${newLoads.length} 次`);
  } else {
    const url = newLoads[0];
    if (!url.includes(`__boh_update=${remoteBuildId}`))
      fail(`切换 URL 没带目标 buildId（${remoteBuildId}）：${url}`);
    else note('  ✔ 切换 URL 带了目标 buildId');
    if (!url.includes('#/user-space')) fail(`切换丢失了落点（hash 未保留）：${url}`);
    else note('  ✔ 目标落点（hash）被保留');
  }

  // ---- ④ 继续导航不再刷（防循环）----
  const beforeSecond = loads.length;
  await page.evaluate(() => {
    window.location.hash = '#/forum';
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.waitForTimeout(3000);
  note(`随后两次导航新增整页加载：${loads.length - beforeSecond} 次（应为 0）`);
  if (loads.length !== beforeSecond)
    fail(`同一目标 buildId 被反复刷新（循环风险）：又刷了 ${loads.length - beforeSecond} 次`);

  await ctx.close();
} finally {
  await browser.close();
}

console.log('');
if (violations.length) {
  console.error('[update-nav] 未通过：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log(
    '[update-nav] 验收通过：导航时切构建只在「有新构建 + 首次导航」发生一次，且落点保留、不循环。',
  );
}
