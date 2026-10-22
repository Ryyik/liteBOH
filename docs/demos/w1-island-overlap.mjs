#!/usr/bin/env node
/**
 * w1-island-overlap.mjs — 量「导航岛展开时是否压住 uspace 顶部内容」（2026-10-22）
 *
 * **这是诊断脚本，不是探针**（不做断言、不设退出码），按 docs/demos/README.md 的口径放这里。
 *
 * 为什么存在：`docs/2026-10-22-竖屏全宽与加载提示洞察.md` 的 W1 原来判定
 * 「uspace 页面顶部没给导航岛留安全区，第一个内容块被切」并给了 P1。
 * 复核发现被切的那行字是**灵动岛通知卡的标题**，不是页面内容；而通知卡只在
 * 「岛展开」时出现。于是写这个脚本，用同一页面两个场景（首次访问 / 已看过引导）
 * 的数值对照来判断到底是布局缺陷还是浮层代价。
 *
 * 判据（390×844）：
 *   · 折叠态（岛 h≈50）应满足：岛下缘→tabs ≥ 16px、岛下缘→封面 ≥ 40px
 *   · 展开态（岛 h≈130）tabs 会落进岛内 —— 这是浮层的正常行为，不是布局错
 *
 * 前置：dev server 在 5199。⚠️ vite 默认只绑 IPv6（`[::1]`），用 `localhost` 而不是 127.0.0.1。
 * 运行：node docs/demos/w1-island-overlap.mjs [--base=http://localhost:5199]
 * 产物：debug-screenshots/w1-island/<label>.png
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE =
  (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7) || 'http://localhost:5199';
const OUT = path.resolve('debug-screenshots/w1-island');
fs.mkdirSync(OUT, { recursive: true });

// 伪会话：真实登录态拿不到，注入 pinia 让 uspace 渲染出来（同 portrait-adaptive-audit 的做法）
const UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const armGuard = ({ uid }) => {
  const app = document.querySelector('#app')?.__vue_app__;
  const pinia = app?.config?.globalProperties?.$pinia;
  if (!pinia) return 'no-pinia';
  const apply = () => {
    const s = pinia.state.value.auth;
    if (!s) return;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo)
      Object.assign(s.userInfo, { id: uid, username: '竖屏体检', role: 'admin', points: 42 });
  };
  apply();
  if (!window.__g) window.__g = setInterval(apply, 200);
  return 'armed';
};

const measure = () => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      h: Math.round(r.height),
      left: Math.round(r.left),
      w: Math.round(r.width),
    };
  };
  const q = (s) => document.querySelector(s);

  /* 岛：`.unified-nav-surface` 是可见面，`#unified-nav-container` 是会随展开撑高的容器 */
  const island = q('.unified-nav-surface');
  const container = q('#unified-nav-container');
  /* 通知卡：GlobalNavStatusCard 的根元素，岛展开就是它撑的 */
  const card = q('.global-nav-status-card');

  const tabs =
    [...document.querySelectorAll('.segment-tabs, .segment-tabs *, [class*=segment-tab]')]
      .filter((el) => el.textContent?.trim() === '空间')
      .map((el) => ({ cls: String(el.className).slice(0, 60), ...box(el) }))[0] || null;

  return {
    island: box(island),
    islandPos: island ? getComputedStyle(island).position : null,
    container: box(container),
    card: card
      ? {
          ...box(card),
          pos: getComputedStyle(card).position,
          z: getComputedStyle(card).zIndex,
          vis: getComputedStyle(card).visibility,
        }
      : null,
    tabs,
    cover: box(q('.profile-cover-band')),
    hero: box(q('.profile-hero-panel')),
    scrollY: Math.round(window.scrollY),
  };
};

const overlap = (a, b) => (a && b ? a.bottom > b.top && a.top < b.bottom : null);

const run = async ({ label, seedSeen }) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  if (seedSeen) {
    /* 预置「已看过引导」标记 → maybeShowGlobalNavOnboardingNotice 不再弹卡，岛保持折叠 */
    await page.evaluate((uid) => {
      localStorage.setItem(`boh-global-nav-onboarding-v2-${uid}`, '1');
    }, UID);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
  }

  await page.evaluate(armGuard, { uid: UID });
  await page.waitForTimeout(2200);

  const m = await page.evaluate(measure);
  await page.screenshot({ path: path.join(OUT, `${label}.png`) });

  const gapTab = m.tabs && m.island ? m.tabs.top - m.island.bottom : null;
  const gapCover = m.cover && m.island ? m.cover.top - m.island.bottom : null;

  console.log(`\n===== ${label} =====`);
  console.log('island   ', JSON.stringify(m.island), m.islandPos);
  console.log('container', JSON.stringify(m.container));
  console.log('card     ', JSON.stringify(m.card));
  console.log('tabs(空间)', JSON.stringify(m.tabs));
  console.log('cover    ', JSON.stringify(m.cover));
  console.log(
    '重叠 card↔island =',
    overlap(m.card, m.island),
    ' card↔tabs =',
    overlap(m.card, m.tabs),
  );
  console.log('岛下缘 → tabs  =', gapTab, 'px');
  console.log('岛下缘 → cover =', gapCover, 'px');
  console.log(`截图: ${path.join(OUT, `${label}.png`)}`);

  await browser.close();
};

await run({ label: 'first-visit', seedSeen: false });
await run({ label: 'seen-before', seedSeen: true });
