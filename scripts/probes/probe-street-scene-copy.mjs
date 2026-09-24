#!/usr/bin/env node
/**
 * 首屏文案可配 ── 端到端探针（不写库，靠 mock home_heroes 响应驱动）
 *
 * 两个场景：
 *   A 配了 greeting_text / hint_text  → 首屏显示自定义文案，{greeting} 替换为时段词
 *   B 两字段留空（含 DB 里压根没有 street-scene 行的现状）→ 回落默认，与可配上线前逐字一致
 *
 * 用法：node scripts/probes/probe-street-scene-copy.mjs
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

const baseHero = (over = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  sort_order: -5,
  is_archived: false,
  template: 'street-scene',
  variant: 'light',
  builtin_key: null,
  eyebrow: null,
  title: '探针首屏街景',
  subtitle: null,
  image_config: {},
  content_layout: null,
  links: [],
  split_cards: null,
  showcase_config: {},
  image_portrait: null,
  image_landscape: null,
  greeting_text: null,
  hint_text: null,
  label: null,
  aria_label: null,
  status: 'published',
  published_at: '2026-09-24T00:00:00.000Z',
  published_by: 'probe',
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
  created_by: null,
  updated_by: null,
  ...over
});

const runScenario = async (name, rows, expect) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
  });
  const context = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await context.newPage();

  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));

  // mock home_heroes（Supabase PostgREST；必须回 Content-Range，否则客户端解析异常）
  await page.route('**/rest/v1/home_heroes*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
        'access-control-expose-headers': 'Content-Range'
      },
      body: JSON.stringify(rows)
    });
  });

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.home-gate .street-hero', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3500); // 等 hero store 异步拉取 + 问候词回填

  const text = await page
    .locator('.home-gate .street-hero-greeting')
    .textContent({ timeout: 8000 })
    .catch(() => '');
  const hint = await page
    .locator('.home-gate .street-hero-hint-text')
    .textContent({ timeout: 8000 })
    .catch(() => '');

  const greeting = (text || '').trim();
  const hintText = (hint || '').trim();

  check(`${name} · 问候语`, expect.greeting(greeting), `实际「${greeting}」`);
  check(`${name} · 底部提示`, expect.hint(hintText), `实际「${hintText}」`);
  check(`${name} · 无运行时错误`, errs.length === 0, errs.slice(0, 2).join(' | '));

  await page.screenshot({ path: `${OUT}/street-scene-copy-${name}.png` });
  await browser.close();
};

// ── A. 配了自定义文案 ──
await runScenario(
  'A-自定义',
  [baseHero({ greeting_text: '{greeting}，这里是自定义问候', hint_text: '下滑探索' })],
  {
    greeting: (t) => /这里是自定义问候$/.test(t) && /^(早上好|中午好|下午好|晚上好)，/.test(t),
    hint: (t) => t === '下滑探索'
  }
);

// ── B. 留空 → 回落默认（等价于 DB 里没有 street-scene 行的现状）──
await runScenario(
  'B-回落默认',
  [baseHero()],
  {
    greeting: (t) => t === '早上好，欢迎回到方块街' || /^(早上好|中午好|下午好|晚上好)，欢迎回到方块街$/.test(t),
    hint: (t) => t === '往下逛逛'
  }
);

// ── C. 完全没有 street-scene 行（当前线上真实状态）──
await runScenario('C-无行', [], {
  greeting: (t) => /，欢迎回到方块街$/.test(t),
  hint: (t) => t === '往下逛逛'
});

console.log('\n' + '='.repeat(72));
const pass = results.filter((r) => r.pass).length;
console.log(`首屏文案可配探针：${pass}/${results.length} 通过`);
fs.writeFileSync(
  'output/street-scene-copy-scan.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
);
console.log('明细已写入 output/street-scene-copy-scan.json');
process.exit(pass === results.length ? 0 : 1);
