import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：AI 岛展开时左侧横屏栏不随容器高度下移（--userspace-rail-top-h）
//   A 关闭态 → B 展开态 → C 收起态
//   断言：B 的左栏首项 top ≈ A；容器高度显著变大；页签**不被顶动**；C 回到 A
//   ⚠️ 2026-10-08：末项由「页签避让仍然生效（+40px 下移）」更正为「页签不许被顶动」——
//      依据见下方 `B_tabs_not_pushed` 的注释（与 UserSpaceMain 的 2026-09-27 口径一致）。
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

const measure = () =>
  page.evaluate(() => {
    const root = document.querySelector('.user-space-page');
    const cs = root ? getComputedStyle(root) : null;
    const island = document.getElementById('unified-nav-container');
    const surface = island ? island.querySelector('.unified-nav-surface') : null;
    const rail = document.querySelector('.userspace-rail');
    const railItem = document.querySelector('.userspace-rail-item');
    const tabs = document.querySelector('.segment-tabs');
    return {
      navH: cs ? cs.getPropertyValue('--userspace-nav-h').trim() : null,
      railTopH: cs ? cs.getPropertyValue('--userspace-rail-top-h').trim() : null,
      railPadTop: rail ? getComputedStyle(rail).paddingTop : null,
      containerH: island ? Math.round(island.getBoundingClientRect().height) : null,
      hasBohaiIsland: !!(surface && surface.classList.contains('has-bohai-island')),
      railItemTop: railItem ? Math.round(railItem.getBoundingClientRect().top) : null,
      tabsTop: (() => {
        const t = document.querySelector('.segment-tab');
        return t ? Math.round(t.getBoundingClientRect().top) : null;
      })(),
    };
  });

await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(600);
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
await page.waitForSelector('.user-space-page', { timeout: 20000 });
await page.waitForSelector('.userspace-rail-item', { timeout: 20000 });
await page.waitForTimeout(2200);

// ---- A：AI 岛关闭态 ----
const A = await measure();
await page.screenshot({ path: `${OUT}/ai-island-rail-A-closed.png` });

// ---- 打开 AI 岛（走调度中心同一模块单例） ----
const opened = await page.evaluate(async () => {
  const mod = await import('/src/composables/useIsland.js');
  return mod.showIsland.ai();
});
await page
  .waitForSelector('.unified-nav-surface.has-bohai-island', { timeout: 8000 })
  .catch(() => {});
await page.waitForTimeout(1000); // surface 500ms 高度过渡走完

// ---- B：AI 岛展开态 ----
const B = await measure();
await page.screenshot({ path: `${OUT}/ai-island-rail-B-open.png` });

// ---- 关闭 AI 岛（走 useGlobalAiOverlay 单例，避免依赖岛内 UI） ----
await page.evaluate(async () => {
  const mod = await import('/src/composables/useGlobalAiOverlay.js');
  mod.useGlobalAiOverlay().close();
});
await page.waitForTimeout(1500); // 500ms 过渡 + 600ms 恢复跟随定时器 + 余量

// ---- C：收起态 ----
const C = await measure();
await page.screenshot({ path: `${OUT}/ai-island-rail-C-reclosed.png` });

const num = (v) => (v == null ? NaN : parseFloat(v));
const report = {
  A_closed: A,
  B_open: B,
  C_reclosed: C,
  openedViaShowIsland: opened,
  checks: {
    B_island_open: B.hasBohaiIsland === true,
    B_container_grew: num(B.containerH) - num(A.containerH) > 100,
    B_rail_holds: Math.abs(num(B.railItemTop) - num(A.railItemTop)) <= 2,
    B_rail_var_frozen: Math.abs(num(B.railTopH) - num(A.railTopH)) <= 1,
    /* ⚠️ 2026-10-08 更正（原断言为 `B.tabsTop > A.tabsTop + 40`，即「岛展开要把页签顶下去」）。
       那条断言与 UserSpaceMain.vue:3114-3120 的**既定口径相反**：
         「只上报**收起态**高度（钳制到 container 的 min-height）：岛展开 —— 不管 AI 岛、
          状态卡还是全局搜索面板 —— 都是悬浮层，页面内容不应为它让位。
          2026-09-27 用户实测：全局搜索一出结果，内容区被推下去 200px+。」
       实测：`--segment-tabs-inset` 全仓**无任何写入点**（Grep 工具核过），SegmentTabs 恒走
       默认 `--userspace-nav-h + 4px`；而 `--userspace-nav-h` 被上面那段钳制逻辑钉死在收起态
       ⇒ 「+40px 下移」在结构上**永远不可能成立**，是过期断言（与本次 UI 重写无关）。
       现在锁**真正的不变量**：岛展开不许顶动页签。 */
    B_tabs_not_pushed: Math.abs(num(B.tabsTop) - num(A.tabsTop)) <= 2,
    C_rail_restored: Math.abs(num(C.railItemTop) - num(A.railItemTop)) <= 2,
    C_container_restored: Math.abs(num(C.containerH) - num(A.containerH)) <= 3,
  },
  pageErrors,
};
report.pass = Object.values(report.checks).every(Boolean);

fs.writeFileSync(`${OUT}/ai-island-rail-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.pass && pageErrors.length === 0 ? 0 : 1);
