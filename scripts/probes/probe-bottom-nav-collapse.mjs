#!/usr/bin/env node
/**
 * probe-bottom-nav-collapse.mjs —— 底栏「下滑收成左下圆 / 上滑或点击展开」验收（2026-11-14）
 *
 * 契约（用户口径）：
 *   · 展开 = 拉满的玻璃胶囊（宽度 ≈ 视口 - 40，左 20）
 *   · 下滑 = 收成左下角一颗正圆（直径 == 展开态高度），5 席随之退场
 *   · 上滑 = 原地铺回来；点那颗圆也铺回来，且**不导航**
 *   · 键盘 / 消息选择态仍是「真消失」（.is-hidden），两者不能混用
 *
 * 为什么断言要量几何而不只量 class：仓库已踩过「加了 class 但看不出变化」的假绿
 * （见 AGENTS.md 左栏选中态那条）。收了但宽度没变，class 断言一样全绿。
 *
 * 组：
 *   A 竖屏 390×844 初始展开
 *   B 下滑 → 收起：宽 == 高、左边不动、高度不变
 *   C 上滑 → 恢复
 *   D 收起态点圆 → 展开，且 hash 不变（不导航）
 *   E 收起态 5 席不可点 / 不可聚焦（inert）
 *   F 点开之后还能再收（防「点一次就锁死」）
 *   G 平板 744×1000：展开居中、收起时左边缘原地不动
 *   H 暗色下圆内图标为浅色
 *
 * 前置：dev server 在 5173（BASE 可覆盖）
 * 用法：node scripts/probes/probe-bottom-nav-collapse.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = path.resolve('debug-screenshots/bottom-nav-collapse');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

const injectLogin = (page) =>
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

const openPage = async (viewport, hash) => {
  const ctx = await browser.newContext({ viewport, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const ok = await injectLogin(page);
  if (!ok) console.log('WARN  登录态注入失败');
  await page.evaluate((t) => {
    window.location.hash = t;
  }, hash);
  await page.waitForTimeout(1800);
  return { ctx, page };
};

const navState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.bottom-nav-glass');
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    const compact = el.querySelector('.nav-compact');
    const items = el.querySelector('.nav-items');
    return {
      present: true,
      collapsed: el.classList.contains('is-collapsed'),
      hidden: el.classList.contains('is-hidden'),
      rect: {
        x: +r.x.toFixed(1),
        y: +r.y.toFixed(1),
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
      },
      compactOpacity: compact ? getComputedStyle(compact).opacity : null,
      itemsInert: items ? items.hasAttribute('inert') : null,
      itemsVisibility: items ? getComputedStyle(items).visibility : null,
      hash: window.location.hash,
    };
  });

const scrollTo = async (page, y) => {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(520);
};

/* 预热一条 scroll：composable 的第一条事件只当基线（容器判定用），不判方向。
   真实用户是连续滚动，看不出差别；探针是一次性跳转，必须显式补这一下。 */
const warmUp = async (page) => {
  await page.evaluate(() => window.scrollTo(0, 40));
  await page.waitForTimeout(420);
};

/* ── A / B / C / D / E / F：竖屏 ───────────────────────────────────── */
console.log('\n[A–F] 竖屏 390×844');
const { ctx: phoneCtx, page: phone } = await openPage(
  { width: 390, height: 844 },
  '/user-space?tab=posts',
);

const expanded = await navState(phone);
check(
  'A 初始为展开态：宽 ≥ 340、左 20、高度 > 56',
  expanded.present &&
    !expanded.collapsed &&
    expanded.rect.w >= 340 &&
    Math.abs(expanded.rect.x - 20) <= 1 &&
    expanded.rect.h > 56,
  JSON.stringify(expanded.rect),
);

await phone.screenshot({ path: path.join(OUT, '01-expanded-390.png') });

await warmUp(phone);
await scrollTo(phone, 700);
const collapsed = await navState(phone);
check(
  'B 下滑 → 收起为正圆（宽 == 高 == 60）、左边 20 不动',
  collapsed.collapsed &&
    Math.abs(collapsed.rect.w - collapsed.rect.h) <= 1 &&
    Math.abs(collapsed.rect.w - 60) <= 1 &&
    Math.abs(collapsed.rect.x - 20) <= 1,
  JSON.stringify(collapsed.rect),
);
check(
  'B2 收起态：5 席退场（visible→hidden）且圆图标入场（opacity 1）',
  collapsed.itemsVisibility === 'hidden' && Number(collapsed.compactOpacity) === 1,
  `items=${collapsed.itemsVisibility} compact=${collapsed.compactOpacity}`,
);

await phone.screenshot({ path: path.join(OUT, '02-collapsed-390.png') });

await scrollTo(phone, 420);
const back = await navState(phone);
check(
  'C 上滑 → 铺回来（宽 ≥ 340，无 is-collapsed）',
  !back.collapsed && back.rect.w >= 340,
  `w=${back.rect.w} collapsed=${back.collapsed}`,
);
await phone.screenshot({ path: path.join(OUT, '03-expanded-again-390.png') });

await scrollTo(phone, 900);
const beforeClick = await navState(phone);

/* E 必须在**收起态**量：展开态下 5 席本来就该可点，量了等于没测 */
const hit = await phone.evaluate(() => {
  const items = document.querySelectorAll('.nav-item');
  const second = items[1];
  if (!second) return { hit: 'no-item' };
  const r = second.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const el = document.querySelector('.nav-item');
  el?.focus();
  return {
    inert: document.querySelector('.nav-items')?.hasAttribute('inert'),
    topIsCompact: Boolean(top?.closest('.nav-compact')),
    focusable: document.activeElement === el ? 'focusable' : 'blocked',
  };
});
check(
  'E 收起态 5 席不可点 / 不可聚焦（inert + 命中落到圆上）',
  beforeClick.collapsed && hit.inert === true && hit.topIsCompact === true,
  JSON.stringify(hit),
);
check('E2 收起态 .nav-item 不可聚焦', hit.focusable === 'blocked', String(hit.focusable));

await phone.evaluate(() => document.querySelector('.nav-compact')?.click());
await phone.waitForTimeout(520);
const afterClick = await navState(phone);
check(
  'D 点圆 → 展开，且 hash 不变（点击不导航）',
  beforeClick.collapsed &&
    !afterClick.collapsed &&
    afterClick.rect.w >= 340 &&
    afterClick.hash === beforeClick.hash,
  `w=${afterClick.rect.w} hash=${afterClick.hash}`,
);

await scrollTo(phone, 1300);
const again = await navState(phone);
check(
  'F 点开之后仍能再次收起（防「点一次就锁死」）',
  again.collapsed === true,
  `collapsed=${again.collapsed} w=${again.rect.w}`,
);

/* ── G：平板 744×1000 ─────────────────────────────────────────────── */
console.log('\n[G] 平板 744×1000');
const { ctx: padCtx, page: pad } = await openPage(
  { width: 744, height: 1000 },
  '/user-space?tab=posts',
);
const padExpanded = await navState(pad);
const padCenter = padExpanded.present ? padExpanded.rect.x + padExpanded.rect.w / 2 : 0;
check(
  'G 平板展开：居中（中心偏差 ≤ 2）',
  padExpanded.present && Math.abs(padCenter - 744 / 2) <= 2,
  `x=${padExpanded.rect.x} w=${padExpanded.rect.w} center=${padCenter}`,
);
await pad.screenshot({ path: path.join(OUT, '04-expanded-744.png') });

await warmUp(pad);
await scrollTo(pad, 700);
const padCollapsed = await navState(pad);
check(
  'G2 平板收起：圆左边缘 == 展开态左边缘（原地收）',
  padCollapsed.collapsed && Math.abs(padCollapsed.rect.x - padExpanded.rect.x) <= 1.5,
  `expandedX=${padExpanded.rect.x} collapsedX=${padCollapsed.rect.x} w=${padCollapsed.rect.w}`,
);
await pad.screenshot({ path: path.join(OUT, '05-collapsed-744.png') });

/* ── H：暗色 ──────────────────────────────────────────────────────── */
console.log('\n[H] 暗色');
/* 必须走 localStorage 的 boh-theme 让 themeManager 自己应用：暗色 CSS
   （styles/themes/user-space-dark.css）是**懒加载**的，手工改 data-theme 只会
   换个属性、样式表根本没进来 —— 上一版探针就漏在这，读到的是明色却判「暗色没做」。 */
const darkCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
await darkCtx.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
const dark = await darkCtx.newPage();
await dark.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await dark.waitForTimeout(2400);
await injectLogin(dark);
await dark.evaluate(() => {
  window.location.hash = '/user-space?tab=posts';
});
await dark.waitForTimeout(1800);
await warmUp(dark);
await scrollTo(dark, 700);

const darkInfo = await dark.evaluate(() => {
  const nav = document.querySelector('.bottom-nav-glass');
  const compact = nav?.querySelector('.nav-compact');
  return {
    theme: document.querySelector('.user-space-page')?.getAttribute('data-theme'),
    collapsed: nav?.classList.contains('is-collapsed'),
    color: compact ? getComputedStyle(compact).color : 'none',
  };
});
check(
  'H 暗色：确实处于暗色 + 收起态 + 圆内图标为浅色',
  darkInfo.theme === 'dark' &&
    darkInfo.collapsed === true &&
    /rgb\(2[4-5][0-9], 2[4-5][0-9], 2[4-5][0-9]\)/.test(darkInfo.color),
  JSON.stringify(darkInfo),
);
await dark.screenshot({ path: path.join(OUT, '06-collapsed-dark-390.png') });
await darkCtx.close();

/* ── I：发帖 FAB 跟随（2026-11-14 追加口径）──────────────────────────
   底栏收成球时，右下那颗「+」必须跟着降下来、球心与 FAB 心垂直对齐；
   上滑展开后两者各自回原位。 */
console.log('\n[I] 发帖 FAB 跟随');
const { ctx: fabCtx, page: fab } = await openPage(
  { width: 390, height: 844 },
  '/user-space?tab=community',
);
await fab.waitForTimeout(1600);
await warmUp(fab);

const fabProbe = () =>
  fab.evaluate(() => {
    const nav = document.querySelector('.bottom-nav-glass');
    const btn = document.querySelector('.mobile-compose-fab');
    if (!nav || !btn) return { present: false };
    const n = nav.getBoundingClientRect();
    const f = btn.getBoundingClientRect();
    const vh = window.innerHeight;
    return {
      present: true,
      collapsed: nav.classList.contains('is-collapsed'),
      navBottom: +(vh - n.bottom).toFixed(1),
      navCenter: +(vh - (n.top + n.height / 2)).toFixed(1),
      fabBottom: +(vh - f.bottom).toFixed(1),
      fabCenter: +(vh - (f.top + f.height / 2)).toFixed(1),
      bodyFlag: document.body.classList.contains('boh-bottom-nav-collapsed'),
    };
  });

const fabTop = await fabProbe();
check(
  'I1 展开态：发帖 + 在「避开底栏」的高位',
  fabTop.present && fabTop.fabBottom > 120,
  JSON.stringify(fabTop),
);
await fab.screenshot({ path: path.join(OUT, '07-fab-expanded-390.png') });

await scrollTo(fab, 700);
const fabDown = await fabProbe();
check(
  'I2 收起态：+ 跟着降下来、球心与 FAB 心垂直对齐',
  fabDown.present &&
    fabDown.collapsed &&
    fabDown.fabBottom < 60 &&
    Math.abs(fabDown.fabCenter - fabDown.navCenter) <= 4,
  JSON.stringify(fabDown),
);
await fab.screenshot({ path: path.join(OUT, '08-fab-collapsed-390.png') });

await scrollTo(fab, 380);
const fabUp = await fabProbe();
check(
  'I3 上滑展开：+ 回到高位、body 标记摘掉',
  fabUp.present && !fabUp.collapsed && fabUp.fabBottom > 120 && fabUp.bodyFlag === false,
  JSON.stringify(fabUp),
);

await phoneCtx.close();
await padCtx.close();
await fabCtx.close();
await browser.close();

console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==`);
if (fail > 0) process.exitCode = 1;
