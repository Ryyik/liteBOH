#!/usr/bin/env node
/**
 * 首屏底栏浮现诊断：量化「位置偏移」到底偏在哪。
 *
 * 流程：新会话打开首页 → 滚轮触发进论坛 → 在底栏浮现动画的多个时刻采样
 *   .bottom-nav-glass 的 rect / transform / 水平中心偏差 / 距底间隙，
 *   再与 UserSpace 页的同款底栏对照。
 * 用法：node scripts/probes/probe-gate-bottomnav.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const context = await browser.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true });
const page = await context.newPage();

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.home-gate .street-hero', { timeout: 20000 });
await page.waitForTimeout(2800);

const sample = () =>
  page.evaluate(() => {
    const el = document.querySelector('.bottom-nav-glass');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      cls: el.className.replace(/\s+/g, ' ').trim(),
      left: +r.left.toFixed(1),
      right: +r.right.toFixed(1),
      top: +r.top.toFixed(1),
      bottomPx: +r.bottom.toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      offX: +((r.left + r.right) / 2 - window.innerWidth / 2).toFixed(1),
      gapBottom: +(window.innerHeight - r.bottom).toFixed(1),
      transform: cs.transform,
      lift: cs.getPropertyValue('--bottom-nav-lift').trim(),
      vh: window.innerHeight,
      vw: window.innerWidth
    };
  });

const t0 = Date.now();
await page.mouse.wheel(0, 240);

const samples = [];
for (const at of [850, 1050, 1250, 1450, 1700, 2000, 2600, 3200]) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const s = await sample();
  samples.push({ t: Date.now() - t0, ...s });
}

console.log('== 首页：底栏浮现时间线（触发时刻 = 0） ==');
for (const s of samples) console.log(JSON.stringify(s));

// 滚动一下，看 hidden 态（lift 生效）之后的行为
await page.mouse.wheel(0, 400);
await page.waitForTimeout(700);
console.log('== 首页：下滑一段后（hidden 生效） ==');
console.log(JSON.stringify(await sample()));

// 对照：UserSpace 底栏
await page.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2800);
console.log('== 对照：UserSpace 底栏最终态 ==');
console.log(JSON.stringify(await sample()));

await page.screenshot({ path: 'debug-screenshots/gate-bottomnav-compare.png' });
await browser.close();
