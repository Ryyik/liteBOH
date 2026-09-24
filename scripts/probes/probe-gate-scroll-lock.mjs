#!/usr/bin/env node
/**
 * 过渡期滚动锁 + 模糊渐显 验证探针。
 *
 * 断言：
 *   1 触发进论坛后立刻猛滚（模拟长滑/惯性），滚动锁期间 scrollY 恒为 0
 *   2 论坛层入场动画中带 blur（模糊渐显生效）
 *   3 动画结束（gate 卸载后）：论坛从顶部开始（scrollY=0、stage 顶对齐）、filter 归零（清晰）
 *   4 动画结束后滚动权交还：再滚 → scrollY 变化
 *   5 全程无 pageerror
 * 用法：node scripts/probes/probe-gate-scroll-lock.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 180)));

let results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
};

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.home-gate .street-hero', { timeout: 20000 });
await page.waitForTimeout(2800);

// 触发 + 立刻猛滚（长滑 + 连滚几下）
const t0 = Date.now();
await page.mouse.wheel(0, 120);
for (let i = 0; i < 5; i += 1) {
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(60);
}

// 1) 锁定期（动画中段）：scrollY 必须恒 0，论坛层带 blur
await page.waitForTimeout(320);
const mid = await page.evaluate(() => ({
  scrollY: window.scrollY,
  gateAlive: Boolean(document.querySelector('.home-gate')),
  stageFilter: getComputedStyle(document.querySelector('.home-forum-stage')).filter,
  stageOpacity: getComputedStyle(document.querySelector('.home-forum-stage')).opacity
}));
check('锁定期猛滚后 scrollY 仍为 0（文档带不动）', mid.scrollY === 0, `scrollY=${mid.scrollY}`);
check('开场画仍在播放（动画不被手势打断）', mid.gateAlive === true);
check('论坛层处于模糊渐显中（filter 带 blur）', /blur\((?!0px)/.test(mid.stageFilter), mid.stageFilter);

// 2) 动画结束：gate 卸载、论坛从顶部开始、filter 归零
await page.waitForTimeout(1300);
const done = await page.evaluate(() => ({
  scrollY: window.scrollY,
  gateGone: !document.querySelector('.home-gate'),
  stageTop: Math.round(document.querySelector('.home-forum-stage')?.getBoundingClientRect().top ?? -999),
  stageFilter: getComputedStyle(document.querySelector('.home-forum-stage')).filter
}));
check('gate 卸载后 scrollY 仍为 0（论坛从顶部开始）', done.scrollY === 0, `scrollY=${done.scrollY}`);
check('论坛层顶对齐视口', done.stageTop === 0, `stageTop=${done.stageTop}`);
check('模糊已归零（清晰落定，无常驻 filter）', done.stageFilter === 'none', done.stageFilter);

// 3) 滚动权交还：现在滚动应该生效
await page.mouse.wheel(0, 420);
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.scrollY);
check('动画结束后滚动权交还（scrollY > 0）', after > 0, `scrollY=${after}`);
await page.evaluate(() => window.scrollTo(0, 0));

check('全程无 pageerror', errs.length === 0, errs.slice(0, 2).join(' | '));

await page.screenshot({ path: 'debug-screenshots/gate-scroll-lock.png' });
await browser.close();

const pass = results.filter((r) => r.pass).length;
console.log(`\n滚动锁 + 模糊渐显探针：${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
