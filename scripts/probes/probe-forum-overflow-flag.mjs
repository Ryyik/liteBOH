#!/usr/bin/env node
/**
 * probe-forum-overflow-flag.mjs — 论坛长帖「...」判定与 CSS 截断同源（2026-10-17 P2-4 回归锁）
 *
 * 报障：`.post-text-v2` 由 CSS `max-height`（5 行）截断，而「...」是否出现由
 * 字数/行数**估算**决定 —— 两套判据不同源，边界处文字被静默切断在句中、连省略号都没有
 * （实测有 ch=67/sh=90 的卡片）。
 *
 * 修复后：`is-overflowing` 由 PostCard 实测 `scrollHeight > clientHeight + 1` 决定，
 * 与 CSS 同一条约束源。本探针逐卡比对「实际是否溢出」与「类是否挂上」。
 *
 * 前置：dev server 在 5173（BASE 可覆盖）。运行：node scripts/probes/probe-forum-overflow-flag.mjs
 *
 * 反证（必须做，否则不算自证）：
 *   把 PostCard.vue 的 `measureBodyOverflow` 改回 `bodyOverflowing.value = props.post?.isBodyOverflowLikely`
 *   （或任何常量 true）⇒ O2「未溢出卡片不得挂类」必红；
 *   改成恒 false ⇒ O1 必红。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || 'debug-screenshots';
const FORUM_URL = `${BASE}/#/user-space?tab=community`;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 260) });
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
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 140)));

await page.goto(FORUM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
// 伪造登录（探针惯例：reactive 对象必须 Object.assign 原地改）
await page.waitForFunction(
  () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
  null,
  { timeout: 30000 },
);
await page.waitForTimeout(600);
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const auth = pinia.state.value.auth;
  auth.isLoggedIn = true;
  Object.assign(auth.userInfo, {
    id: 'a1b2c3d4-0000-4000-8000-000000000002',
    username: 'probe_overflow_user',
    role: 'user',
    points: 42,
  });
});
await page.waitForSelector('.post-text-v2', { timeout: 30000 });
await page.waitForTimeout(1200); // 等首批卡片渲染 + RO/测量跑完

// 首页前 10 张卡可能全是短帖 ⇒ 滚动加载更多，直到出现溢出样本或次数用尽。
// ⚠️ 窗口本身不滚（body 高度=视口），feed 的滚动容器是 `.community-shell`（实测）。
for (let i = 0; i < 10; i += 1) {
  const has = await page.evaluate(() =>
    [...document.querySelectorAll('.post-text-v2')].some(
      (el) => el.scrollHeight > el.clientHeight + 1,
    ),
  );
  if (has) break;
  await page.evaluate(() => {
    const scroller =
      document.querySelector('.community-shell') ||
      [...document.querySelectorAll('*')].find(
        (el) =>
          el.scrollHeight > el.clientHeight + 100 &&
          /(auto|scroll)/.test(getComputedStyle(el).overflowY),
      );
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(1500);
}

const audit = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.post-text-v2')];
  return cards.map((el) => ({
    overflow: el.scrollHeight > el.clientHeight + 1,
    flagged: el.classList.contains('is-overflowing'),
    ch: el.clientHeight,
    sh: el.scrollHeight,
    text: (el.textContent || '').trim().slice(0, 24),
  }));
});

const overflowMisflagged = audit.filter((c) => c.overflow && !c.flagged);
const cleanMisflagged = audit.filter((c) => !c.overflow && c.flagged);

check(
  `O1 溢出的卡片必须挂 is-overflowing（样本 ${audit.filter((c) => c.overflow).length}/${audit.length}）`,
  audit.length > 0 && overflowMisflagged.length === 0 && audit.some((c) => c.overflow),
  overflowMisflagged.length
    ? JSON.stringify(overflowMisflagged.slice(0, 3))
    : `溢出样本不足：${audit.length} 卡里 ${audit.filter((c) => c.overflow).length} 张溢出`,
);
check(
  `O2 未溢出的卡片不得挂 is-overflowing`,
  audit.length > 0 && cleanMisflagged.length === 0,
  JSON.stringify(cleanMisflagged.slice(0, 3)),
);
check(
  'O3 判定与 CSS 同源（两类都各有样本，避免整页假绿）',
  audit.some((c) => c.overflow) && audit.some((c) => !c.overflow),
  `溢出 ${audit.filter((c) => c.overflow).length} / 正常 ${audit.filter((c) => !c.overflow).length}`,
);
check('O4 零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await page.screenshot({ path: `${OUT}/forum-overflow-flag.png`, fullPage: false });

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
if (failed.length) failed.forEach((f) => console.log(`FAIL  ${f.name}  --  ${f.detail}`));

await browser.close();
process.exit(failed.length ? 1 : 0);
