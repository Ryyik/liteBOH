#!/usr/bin/env node
/**
 * 首屏可编辑性探针 —— 验证「数据管理 → 首页装修 → 首屏街景」这条控制链路是否真的可点通。
 *
 * 覆盖：
 *   1) 装修台能新建一条 hero
 *   2) 模板下拉含「首屏街景（street-scene）」，选中后出现双构图编辑区
 *   3) 竖屏 / 横屏两个 URL 输入存在（这就是首屏唯一的可配内容）
 *   4) 实时预览渲染出问候语 + 「往下逛逛 ↓」（提示这两项是代码硬编码，不可配）
 *   5) 单例约束说明文案在位
 *   6) 全程无 pageerror
 *
 * 不做真实上传 / 不写库，只验证 UI 可达。
 * 用法：node scripts/probes/probe-hero-console-street-scene.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 240)));

await page.route('**/rest/v1/rpc/**', async (route) => {
  const url = route.request().url();
  const listShaped = /list_users|existing_subscribers|grant_batches|sensitive|counts/i.test(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': listShaped ? '0--1/*' : '0-0/0' },
    body: listShaped ? '[]' : '{}'
  });
});

const armAdminGuard = () =>
  page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
    if (!pinia) return false;
    const apply = () => {
      const s = pinia.state.value.auth;
      if (!s) return;
      s.isLoggedIn = true;
      s.isInitialized = true;
      if (s.userInfo) Object.assign(s.userInfo, { username: '探针', role: 'admin' });
    };
    apply();
    if (!window.__bohSsProbeGuard) window.__bohSsProbeGuard = setInterval(apply, 120);
    return true;
  });

// ---- 进装修台 ----
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(4000);
await armAdminGuard();
await page.evaluate(() => { location.hash = '#/admin/hero-console'; });
await page.waitForSelector('.hero-console', { timeout: 30000 });
await page.waitForTimeout(2500);
await armAdminGuard();
await page.waitForTimeout(800);

check('装修台已打开', await page.locator('.hero-console').isVisible().catch(() => false));

// ---- 新建一条 hero ----
await page.locator('.hero-console button', { hasText: '新建英雄区' }).first().click({ timeout: 8000 });
await page.waitForTimeout(1500);

const totalText = await page.locator('.console-toolbar p').first().textContent().catch(() => '');
check('新建后出现草稿（工具条计数已更新）', /英雄区/.test(totalText), totalText.trim());

// ---- 模板下拉选 street-scene ----
const templateSelect = page.locator('.hero-console select:has(option[value="street-scene"])').first();
const hasTemplateOption = await templateSelect.count();
check('模板下拉含「首屏街景」选项', hasTemplateOption > 0, hasTemplateOption ? '' : '未找到含 street-scene 的 select');

if (hasTemplateOption > 0) {
  await templateSelect.selectOption('street-scene');
  await page.waitForTimeout(1200);
}

// ---- 双构图编辑区 ----
const imageSection = page.locator('.hero-console .image-section').filter({ hasText: '首屏双构图' }).first();
check('出现「首屏双构图」编辑区', await imageSection.isVisible().catch(() => false));

const urlInputs = imageSection.locator('input[type="url"]');
const urlCount = await urlInputs.count();
check('竖屏 / 横屏两个图片地址输入在位', urlCount === 2, `找到 ${urlCount} 个 url 输入`);

const labels = await imageSection.locator('summary').allTextContents().catch(() => []);
check('两个构图分组标注正确方向',
  labels.some((t) => t.includes('竖屏')) && labels.some((t) => t.includes('横屏')),
  labels.map((t) => t.trim()).join(' / '));

const specText = await imageSection.textContent().catch(() => '');
check('规格提示到位（1170×2532 / 2560×1440）',
  specText.includes('1170') && specText.includes('2532') && specText.includes('2560') && specText.includes('1440'));
check('单例约束说明到位', /只允许一条/.test(specText));

// ---- 实时预览 ----
const preview = page.locator('.hero-console .street-scene-preview').first();
const previewVisible = await preview.isVisible().catch(() => false);
check('实时预览渲染', previewVisible);

if (previewVisible) {
  const greeting = (await preview.locator('.street-scene-preview-greeting').textContent().catch(() => '')) || '';
  check('预览含时段问候语', greeting.trim().length > 0, greeting.trim());
  const hint = (await preview.locator('.street-scene-preview-hint').textContent().catch(() => '')) || '';
  check('预览含「往下逛逛」提示', hint.includes('往下逛逛'), hint.trim());
  const fallback = await preview.locator('.street-scene-preview-fallback').count();
  check('未配图时显示回落品牌图提示', fallback > 0, fallback > 0 ? '' : '未出现回落提示');
}

// ---- 不保存，直接离开（避免写库）----
check('全程无运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
await page.screenshot({ path: `${OUT}/hero-console-street-scene.png` });

await browser.close();

console.log('\n' + '='.repeat(72));
const pass = results.filter((r) => r.pass).length;
console.log(`首屏可编辑性探针：${pass}/${results.length} 通过`);
fs.writeFileSync(
  'output/hero-console-street-scene.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), results, pageErrors: errs }, null, 2)
);
console.log('明细已写入 output/hero-console-street-scene.json');
process.exit(pass === results.length ? 0 : 1);
