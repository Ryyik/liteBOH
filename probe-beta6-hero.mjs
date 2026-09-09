import { chromium } from 'playwright';

// BETA 6 焕新 Hero 探针：
//  1) 首屏第一位 = beta6-renewal（DB sort_order=5，mascot-new 之前）
//  2) 玻璃卡 / eyebrow / headline / 双 CTA 均渲染
//  3) 液态玻璃材质生效：backdrop-filter 为 blur(36px)，卡片实际背景为半透白
//  4) CTA 路由正确（/download、/newsroom）
//  5) 暗色模式下组件根 data-theme=dark 且文字翻转为浅色

const BASE = 'http://localhost:5173';
// 岛内详情长文案（与 Beta6RenewalHero.vue 的 BETA6_DETAIL_TEXT 保持一致）
const BETA6_FULL = [
  '新设计语言，来亮眼。',
  '社区体验，更更更上一层楼。',
  '',
  '亮点，逐个看：',
  '· 液态玻璃，全面焕新，越看越顺眼。',
  '· 积分账本，笔笔透明，心里有数。',
  '· 活动沉淀成帖子，好内容永不过期。',
  '· 首页只讲一件事，专注，就是快。',
  '',
  '还有这些，样样都来劲：',
  '· 顶部灵动岛：重要动态，第一时间亮相。',
  '· 发帖流程：多图上传，一气呵成。',
  '· 用户空间：方块主页，清爽分明。',
  '· 通知中心：未读动态，一眼看清。',
  '· 深色模式：夜再深，也纯粹。',
  '· 论坛体验：越逛越顺手。',
  '',
  '下滑，看完所有亮点；或点「查看详情」，读完整发布说明。',
].join('\n');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

// ---------- 亮色 ----------
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.goto(BASE + '/#/home', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForSelector('.beta6-hero', { timeout: 15000 });

// 1. 序列首位
const firstKey = await page.evaluate(() => {
  const rows = document.querySelectorAll('.home-hero-content .home-hero-row');
  return rows.length ? rows[0].querySelector('.beta6-hero') ? 'beta6-renewal' : rows[0].className : 'no-rows';
});
check('首屏第一位是 beta6-renewal', firstKey === 'beta6-renewal', String(firstKey));

// 2. 结构完整
const structure = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return {
    card: !!q('.beta6-hero-card'),
    eyebrow: q('.beta6-hero-eyebrow')?.textContent.trim() || '',
    headline: q('.beta6-hero-headline')?.textContent.replace(/\s+/g, '') || '',
    sub: !!q('.beta6-hero-sub'),
    primary: q('.beta6-hero-btn-primary')?.getAttribute('href') || '',
    ghost: q('.beta6-hero-btn-ghost')?.tagName?.toLowerCase() || '',
    blobs: document.querySelectorAll('.beta6-hero-blob').length,
  };
});
check('玻璃卡渲染', structure.card);
check('eyebrow 文案', structure.eyebrow.includes('BETA 6') && structure.eyebrow.includes('焕新体验'), structure.eyebrow);
check('headline 文案', structure.headline.includes('焕然一新') && structure.headline.includes('即刻相见'), structure.headline);
check('副标题渲染', structure.sub);
check('主 CTA → /download', structure.primary.includes('/download'), structure.primary);
check('从 CTA 为弹岛按钮', structure.ghost === 'button', structure.ghost);
check('色晕 5 个', structure.blobs === 5, String(structure.blobs));

// 3. 液态玻璃材质
const glass = await page.evaluate(() => {
  const card = document.querySelector('.beta6-hero-card');
  const cs = getComputedStyle(card);
  const bg = cs.backgroundColor;
  return {
    backdrop: cs.backdropFilter || cs.webkitBackdropFilter || '',
    bg,
    radius: cs.borderRadius,
  };
});
check('backdrop-filter blur(36px)', glass.backdrop.includes('blur(36px)'), glass.backdrop);
check('卡片半透白玻璃底', glass.bg.includes('0.72'), glass.bg);
check('28px 大圆角', glass.radius.startsWith('28px'), glass.radius);

// 入场动画编排：等 3s 全部播完后，卡内各层必须回到完全可见
await page.waitForTimeout(3000);
const afterIn = await page.evaluate(() => {
  const pick = (s) => {
    const el = document.querySelector(s);
    if (!el) return -1;
    const cs = getComputedStyle(el);
    return Number(cs.opacity);
  };
  return {
    card: pick('.beta6-hero-card'),
    eyebrow: pick('.beta6-hero-eyebrow'),
    headline: pick('.beta6-hero-headline'),
    sub: pick('.beta6-hero-sub'),
    actions: pick('.beta6-hero-actions'),
    blob: pick('.beta6-hero-blob-1'),
  };
});
check('入场动画结束：玻璃卡完全可见', afterIn.card === 1, String(afterIn.card));
check('入场动画结束：eyebrow 可见', afterIn.eyebrow === 1, String(afterIn.eyebrow));
check('入场动画结束：headline 可见', afterIn.headline === 1, String(afterIn.headline));
check('入场动画结束：副标可见', afterIn.sub === 1, String(afterIn.sub));
check('入场动画结束：CTA 可见', afterIn.actions === 1, String(afterIn.actions));
check('入场动画结束：色晕回到目标透明度', afterIn.blob === 0.5, String(afterIn.blob));

// 逐字入场：10 个字 span 全部就位且动画完成后完全可见
const chars = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.beta6-hero-char')];
  return {
    count: els.length,
    text: els.map((el) => el.textContent).join(''),
    lastOpacity: els.length ? Number(getComputedStyle(els[els.length - 1]).opacity) : -1,
  };
});
check('headline 拆字 10 个', chars.count === 10, String(chars.count));
check('逐字文本完整', chars.text === '焕然一新，即刻相见。', chars.text);
check('入场动画结束：末字可见', chars.lastOpacity === 1, String(chars.lastOpacity));

await page.screenshot({ path: 'debug-screenshots/beta6-hero-light.png' });

// ---------- 灵动岛：点击「了解焕新详情」→ 顶部导航栏打字机显示详情 ----------
await page.click('.beta6-hero-btn-ghost');
await page.waitForSelector('.beta6-island-card', { timeout: 8000 });
const islandHosted = await page.evaluate(() => {
  const card = document.querySelector('.beta6-island-card');
  return {
    inNav: !!card?.closest('#unified-nav-container'),
    cta: card?.querySelector('.bi-cta')?.textContent.trim() || '',
  };
});
check('灵动岛渲染在顶部公共导航栏内', islandHosted.inNav, String(islandHosted.inNav));
check('岛内「查看详情」按钮', islandHosted.cta === '查看详情', islandHosted.cta);

// 详情全文直接呈现（无打字机）+ 高身滚动区可下滑
await page.waitForTimeout(400);
const fullText = await page.evaluate(() => document.querySelector('.bi-text')?.textContent.trim() || '');
check('详情全文直接呈现（无打字机）', fullText === BETA6_FULL, fullText.slice(0, 12) + '…');

const scrollState = await page.evaluate(() => {
  const el = document.querySelector('.bi-scroll');
  return {
    scrollable: !!el && el.scrollHeight > el.clientHeight + 4,
    atTop: !!el && el.scrollTop < 8,
    hint: !!document.querySelector('.bi-hint'),
  };
});
check('详情区可下滑查看', scrollState.scrollable, JSON.stringify(scrollState));
check('打开即在顶部', scrollState.atTop, String(scrollState.atTop));
check('「下滑查看更多」提示出现', scrollState.hint, String(scrollState.hint));

// 岛内「查看详情」→ /newsroom
await page.click('.bi-cta');
await page.waitForTimeout(800);
const hash = await page.evaluate(() => location.hash);
check('岛内按钮跳转 /newsroom', hash.includes('/newsroom'), String(hash));

// ---------- 暗色（新开页面以暗色启动，保证 themeManager 原生初始化） ----------
const darkPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await darkPage.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
await darkPage.goto(BASE + '/#/home', { waitUntil: 'networkidle', timeout: 45000 });
await darkPage.waitForSelector('.beta6-hero', { state: 'attached', timeout: 30000 });
await darkPage.waitForTimeout(1200);
const dark = await darkPage.evaluate(() => {
  const hero = document.querySelector('.beta6-hero');
  const headline = document.querySelector('.beta6-hero-headline');
  return {
    theme: hero?.getAttribute('data-theme'),
    color: headline ? getComputedStyle(headline).color : '',
    visible: hero ? hero.offsetHeight > 100 : false,
  };
});
check('暗色根节点 data-theme=dark', dark.theme === 'dark', String(dark.theme));
check('暗色 headline 浅色文字', dark.color === 'rgb(245, 245, 247)', dark.color);
check('暗色 hero 可见', dark.visible, String(dark.visible));

await darkPage.screenshot({ path: 'debug-screenshots/beta6-hero-dark.png' });
await darkPage.close();

check('无页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
process.exit(failed.length ? 1 : 0);
