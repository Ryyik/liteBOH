#!/usr/bin/env node
/**
 * 品牌兜底首屏（白底 + 红苹果 logo + 黑字）视觉专项探针。
 *
 * 场景：
 *   A 竖屏（无街景图）：纯白底、logo 居中且完整、问候/提示为黑色且无阴影、无黑色渐晕
 *   B 横屏（无街景图）：logo 收一档但依旧居中不溢出、文字仍黑
 *   C 竖屏（mock 配了街景图）：切换到照片形态 —— 街景图渲染、scrim 回来、文字回白
 *
 * 用法：node scripts/probes/probe-street-scene-brand.mjs
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
  id: '22222222-2222-4222-8222-222222222222',
  sort_order: -5,
  is_archived: false,
  template: 'street-scene',
  variant: 'light',
  title: '探针首屏街景',
  image_config: {},
  links: [],
  split_cards: null,
  showcase_config: {},
  image_portrait: null,
  image_landscape: null,
  greeting_text: null,
  hint_text: null,
  status: 'published',
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
  ...over
});

/** 打开首页并等开场画稳定，返回关键视觉量 */
const measure = async (browser, { viewport, heroRows, tag }) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));

  await page.route('**/rest/v1/home_heroes*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': heroRows.length ? `0-${heroRows.length - 1}/${heroRows.length}` : '*/0',
        'access-control-expose-headers': 'Content-Range'
      },
      body: JSON.stringify(heroRows)
    });
  });

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.home-gate .street-hero', { timeout: 20000 });
  await page.waitForTimeout(3000); // 等 hero store 拉取 + 入场动画结束

  const m = await page.evaluate(() => {
    const root = document.querySelector('.home-gate .street-hero');
    if (!root) return null;
    const cs = (sel) => {
      const el = root.querySelector(sel);
      return el ? getComputedStyle(el) : null;
    };
    const rect = (sel) => root.querySelector(sel)?.getBoundingClientRect() ?? null;
    const brand = rect('.street-hero-brand');
    const logo = rect('.street-hero-brand-logo');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const brandBg = cs('.street-hero-brand')?.backgroundColor ?? '';
    const logoSrc = root.querySelector('.street-hero-brand-logo')?.getAttribute('src') ?? '';
    const imgSrc = root.querySelector('.street-hero-img')?.getAttribute('src') ?? '';
    const greeting = cs('.street-hero-greeting');
    const hint = cs('.street-hero-hint');
    const scrim = root.querySelector('.street-hero-scrim');
    // logo 中心与视口中心的偏差
    const logoCenter = logo ? { x: logo.left + logo.width / 2, y: logo.top + logo.height / 2 } : null;
    const offCenter = logoCenter
      ? { x: Math.abs(logoCenter.x - vw / 2), y: Math.abs(logoCenter.y - vh / 2) }
      : null;
    return {
      onBrand: root.classList.contains('on-brand'),
      brandBg,
      logoSrc,
      imgSrc,
      logoBox: logo ? { w: Math.round(logo.width), h: Math.round(logo.height) } : null,
      offCenter,
      logoFits: logo ? logo.top >= 0 && logo.bottom <= vh && logo.left >= 0 && logo.right <= vw : false,
      greetingColor: greeting?.color ?? '',
      greetingShadow: greeting?.textShadow ?? '',
      hintColor: hint?.color ?? '',
      hintShadow: hint?.textShadow ?? '',
      hasScrim: Boolean(scrim),
      scrimOpacity: scrim ? getComputedStyle(scrim).opacity : ''
    };
  });

  await page.screenshot({ path: `${OUT}/street-scene-brand-${tag}.png` });
  await context.close();
  return { ...m, errs };
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});

// ---------- A. 竖屏 · 无街景图（默认形态） ----------
{
  const m = await measure(browser, {
    viewport: { width: 430, height: 900 },
    heroRows: [baseHero()],
    tag: 'portrait-default'
  });
  check('A1 进入品牌兜底形态（on-brand）', m.onBrand === true);
  check('A2 兜底层纯白背景', m.brandBg === 'rgb(255, 255, 255)', m.brandBg);
  check('A3 logo 来自 BOH 红苹果图标', m.logoSrc.includes('/icons/icon-512.png'), m.logoSrc);
  check('A4 logo 完整居中（中心偏差 ≤ 4px）',
    m.offCenter && m.offCenter.x <= 4 && m.offCenter.y <= 4,
    m.offCenter ? `dx=${m.offCenter.x.toFixed(1)} dy=${m.offCenter.y.toFixed(1)}` : '无 logo');
  check('A5 logo 不溢出视口', m.logoFits === true, JSON.stringify(m.logoBox));
  check('A6 问候语为黑色且无阴影',
    m.greetingColor === 'rgb(23, 19, 14)' && m.greetingShadow === 'none',
    `${m.greetingColor} / shadow=${m.greetingShadow}`);
  check('A7 提示为次级黑且无阴影',
    m.hintColor === 'rgb(82, 72, 60)' && m.hintShadow === 'none',
    `${m.hintColor} / shadow=${m.hintShadow}`);
  check('A8 无黑色渐晕（scrim 不渲染）', m.hasScrim === false);
  check('A9 无运行时错误', m.errs.length === 0, m.errs.slice(0, 2).join(' | '));
}

// ---------- B. 横屏 · 无街景图 ----------
{
  const m = await measure(browser, {
    viewport: { width: 900, height: 430 },
    heroRows: [baseHero()],
    tag: 'landscape-default'
  });
  check('B1 横屏仍为品牌兜底形态', m.onBrand === true && m.brandBg === 'rgb(255, 255, 255)', m.brandBg);
  check('B2 logo 居中且不溢出',
    m.offCenter && m.offCenter.x <= 4 && m.offCenter.y <= 4 && m.logoFits,
    m.offCenter ? `dx=${m.offCenter.x.toFixed(1)} dy=${m.offCenter.y.toFixed(1)} box=${JSON.stringify(m.logoBox)}` : '无 logo');
  check('B3 横屏 logo 收一档（高 ≤ 176px）', m.logoBox && m.logoBox.h <= 176, JSON.stringify(m.logoBox));
  check('B4 文字仍为黑色', m.greetingColor === 'rgb(23, 19, 14)', m.greetingColor);
  check('B5 无运行时错误', m.errs.length === 0, m.errs.slice(0, 2).join(' | '));
}

// ---------- C. 竖屏 · 配了街景图（照片形态回归） ----------
{
  /* 街景图用 data URI（真实可加载），否则图 404 → 按设计回落品牌兜底，测不到照片形态。 */
  const fakePhoto = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1170' height='2532'%3E%3Crect width='100%25' height='100%25' fill='%237a8ba3'/%3E%3C/svg%3E";
  const m = await measure(browser, {
    viewport: { width: 430, height: 900 },
    heroRows: [baseHero({ image_portrait: fakePhoto })],
    tag: 'portrait-with-photo'
  });
  check('C1 退出品牌兜底（on-brand 移除）', m.onBrand === false);
  check('C2 不再渲染 logo 层', !m.logoSrc);
  check('C3 街景图渲染', Boolean(m.imgSrc), m.imgSrc.slice(0, 90));
  check('C4 scrim 回归（照片态需要渐晕）', m.hasScrim === true);
  check('C5 文字回白 + 阴影', m.greetingColor === 'rgb(255, 255, 255)' && m.greetingShadow !== 'none',
    `${m.greetingColor} / shadow=${m.greetingShadow}`);
  check('C6 无运行时错误', m.errs.length === 0, m.errs.slice(0, 2).join(' | '));
}

await browser.close();

console.log('\n' + '='.repeat(72));
const pass = results.filter((r) => r.pass).length;
console.log(`品牌兜底首屏探针：${pass}/${results.length} 通过`);
fs.writeFileSync(
  'output/street-scene-brand-scan.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
);
console.log('明细已写入 output/street-scene-brand-scan.json');
process.exit(pass === results.length ? 0 : 1);
