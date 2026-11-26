#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error.message).slice(0, 180)));

const results = [];
const check = (name, condition, detail = '') => {
  results.push({ name, pass: Boolean(condition) });
  console.log(`${condition ? '✓' : '✗'} ${name}${detail ? `  —— ${detail}` : ''}`);
};

await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.home-gate', { timeout: 20000 });

const readState = () =>
  page.evaluate(() => ({
    scrollY: window.scrollY,
    gateAlive: Boolean(document.querySelector('.home-gate')),
    leaving: Boolean(document.querySelector('.home-gate.is-leaving')),
    overflow: document.documentElement.style.getPropertyValue('overflow') || '',
    stageInert: document.querySelector('.home-forum-stage')?.inert ?? null,
  }));

await page.mouse.move(215, 450);
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(100);
const held = await readState();
check('遮罩完整展示期间锁住文档滚动', held.scrollY === 0 && held.overflow === 'hidden');
check('遮罩完整展示期间不响应下拉', held.gateAlive && !held.leaving);

await page.locator('.home-gate-skip').click();
await page.waitForSelector('.home-gate.is-leaving', { timeout: 1000 });
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(120);
const fading = await readState();
check('渐隐期间继续保持滚动锁', fading.scrollY === 0 && fading.overflow === 'hidden');
check('渐隐期间论坛层仍不可操作', fading.stageInert === true && fading.gateAlive);

await page.waitForSelector('.home-gate', { state: 'detached', timeout: 2500 });
const done = await readState();
check('渐隐结束后解除滚动锁与 inert', done.overflow === '' && done.stageInert === false);
check('论坛从顶部开始', done.scrollY === 0);

await page.mouse.wheel(0, 500);
await page.waitForTimeout(400);
check('落定后滚动权交还', (await readState()).scrollY > 100);
check('全程无 pageerror', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const pass = results.filter((result) => result.pass).length;
console.log(`\n遮罩滚动锁探针：${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
