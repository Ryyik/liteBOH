import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：关于我们页（/about）· GitHub 热力图加入后的回归
//   A. sticky 滚动固定（manifesto 逐字点亮 + chapters 三章轮换）
//   B. 热力图形状与数据（mock api.github.com，本机被 SNI 阻断）
//   C. 横竖屏（竖屏 390 / 横屏 844）下的热力图与排版
//
//   反证：把 GitHubHeatmap 的 gridTemplateColumns 改回 repeat(7,...)
//        B 组「轨道=格子尺寸」必红（7 列竖条，53 行高）。
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/about-heatmap';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
let skip = 0;
const check = (name, cond, detail) => {
  if (cond) { pass += 1; console.log('PASS ', name, detail === undefined ? '' : '— ' + detail); }
  else { fail += 1; console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail); }
};
const skipCheck = (name, why) => { skip += 1; console.log('SKIP ', name, '— ' + why); };

// mock GitHub commits API：60 条分布在近 300 天（本机 api.github.com 被阻断，必须 mock）
function mockCommits() {
  const commits = [];
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const ts = now - Math.floor((i * 4.7 + (i % 7) * 13) % 300) * 86400_000;
    commits.push({ commit: { author: { date: new Date(ts).toISOString() } } });
  }
  return commits;
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

async function newScene(name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  // 同一 path 只注册一条 route；github API mock 返回分页第二页为空结束
  await page.route('**/api.github.com/**', async (route) => {
    const url = route.request().url();
    const pageNum = Number(new URL(url).searchParams.get('page') || '1');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(pageNum === 1 ? mockCommits() : []),
    });
  });
  await page.goto(`${BASE}/#/about`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForSelector('.about-us-page', { timeout: 20000 });
  await page.waitForSelector('.github-heatmap', { timeout: 20000 });
  // 等热力图加载结束（mock 下应转成功态）
  await page.waitForFunction(() => !document.querySelector('.heatmap-skeleton'), null, { timeout: 15000 }).catch(() => {});
  // 点掉残留 vite-error-overlay
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  return { context, page };
}

const measureHeatmap = (page) => page.evaluate(() => {
  const grid = document.querySelector('.heatmap-grid');
  const section = document.querySelector('.github-heatmap');
  const container = document.querySelector('.heatmap-container');
  const cell = document.querySelector('.heatmap-cell');
  if (!grid) return null;
  const g = grid.getBoundingClientRect();
  const s = section.getBoundingClientRect();
  const c = cell ? cell.getBoundingClientRect() : null;
  const colTrack = getComputedStyle(grid).gridTemplateColumns;
  return {
    gridW: Math.round(g.width), gridH: Math.round(g.height),
    sectionW: Math.round(s.width), sectionH: Math.round(s.height),
    containerScrollW: container ? container.scrollWidth : -1,
    containerClientW: container ? container.clientWidth : -1,
    cellW: c ? Math.round(c.width) : -1,
    cellH: c ? Math.round(c.height) : -1,
    cellCount: document.querySelectorAll('.heatmap-cell').length,
    colTrack,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

// ============ 场景 1：桌面 1440×900 ============
{
  const { context, page } = await newScene('desktop', { width: 1440, height: 900 });
  console.log('\n===== 场景 1 桌面 1440×900 =====');

  // B. 热力图形状
  const hm = await measureHeatmap(page);
  if (!hm) { skipCheck('B1 热力图测量', 'grid 未渲染'); }
  else {
    console.log('热力图实测:', JSON.stringify(hm));
    check('B1 热力图渲染成功态', hm.cellCount > 300, `${hm.cellCount} cells`);
    const firstTrack = parseFloat(hm.colTrack);
    check('B2 轨道尺寸与格子一致（无错位）', Math.abs(firstTrack - hm.cellW) <= 1,
      `cell=${hm.cellW}px track[0]=${firstTrack}px`);
    check('B3 热力图是横向矩阵（宽>高）', hm.gridW > hm.gridH, `${hm.gridW}×${hm.gridH}`);
    check('B4 不把文档撑出横向滚动', hm.docOverflowX <= 0, `overflowX=${hm.docOverflowX}`);
    check('B5 热力图高度合理（<1.2 屏）', hm.sectionH < 1100, `sectionH=${hm.sectionH}`);
  }

  // A. sticky：manifesto（滚进 sticky 区间中部，不可越过区间末端）
  const mScroll = await page.evaluate(() => {
    const sec = document.querySelector('.manifesto-section').getBoundingClientRect();
    const sticky = document.querySelector('.manifesto-sticky').getBoundingClientRect();
    const travel = sec.height - sticky.height;
    return document.scrollingElement.scrollTop + sec.top + Math.max(travel * 0.5, 60);
  });
  await page.evaluate((y) => window.scrollTo(0, y), mScroll);
  await page.waitForTimeout(300);
  const mStickyTop = await page.evaluate(() => document.querySelector('.manifesto-sticky').getBoundingClientRect().top);
  check('A1 manifesto 钉住（sticky top≈0）', Math.abs(mStickyTop) < 2, `top=${mStickyTop.toFixed(1)}`);

  // A. sticky：chapters（滚到 chapter 1 整点：progress = 0.5）
  const cTop0 = await page.evaluate(() => document.querySelector('.chapters-section').getBoundingClientRect().top + window.scrollY);
  const cScroll = await page.evaluate(() => {
    const sec = document.querySelector('.chapters-section').getBoundingClientRect();
    const sticky = document.querySelector('.chapters-sticky').getBoundingClientRect();
    const travel = sec.height - sticky.height;
    return document.scrollingElement.scrollTop + sec.top + travel * 0.5;
  });
  await page.evaluate((y) => window.scrollTo(0, y), cScroll);
  await page.waitForTimeout(300);
  const cStickyTop = await page.evaluate(() => document.querySelector('.chapters-sticky').getBoundingClientRect().top);
  const chapterVisible = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.chapter')];
    return Math.max(...els.map((el) => Number(getComputedStyle(el).opacity)));
  });
  check('A2 chapters 钉住（sticky top≈0）', Math.abs(cStickyTop) < 2, `top=${cStickyTop.toFixed(1)}`);
  check('A3 chapters 章节整点可见（opacity 峰值）', chapterVisible > 0.95, `max=${chapterVisible.toFixed(2)}`);

  // 祖先 overflow 诊断（sticky 破时的经典原因）
  const overflowChain = await page.evaluate(() => {
    const bad = [];
    let el = document.querySelector('.manifesto-sticky')?.parentElement;
    while (el && el !== document.body) {
      const ov = getComputedStyle(el).overflow + '/' + getComputedStyle(el).overflowX;
      if (/hidden|auto|scroll/.test(ov)) bad.push(`${el.className || el.tagName}:${ov}`);
      el = el.parentElement;
    }
    return bad;
  });
  check('A4 sticky 祖先链无 hidden/auto/scroll', overflowChain.length === 0, overflowChain.join(', ') || 'clean');

  await page.screenshot({ path: `${OUT}/desktop-heatmap.png` });
  await context.close();
}

// ============ 场景 2：竖屏 390×844 ============
{
  const { context, page } = await newScene('portrait', { width: 390, height: 844 });
  console.log('\n===== 场景 2 竖屏 390×844 =====');
  const hm = await measureHeatmap(page);
  if (!hm) { skipCheck('B1p 热力图测量', 'grid 未渲染'); }
  else {
    console.log('热力图实测:', JSON.stringify(hm));
    check('B1p cell 与轨道无错位', hm.colTrack.includes(String(hm.cellW)) || Math.abs(parseInt(hm.colTrack) - hm.cellW) <= 1,
      `cell=${hm.cellW}px track=[${hm.colTrack}]`);
    check('B2p 热力图横向矩阵', hm.gridW > hm.gridH, `${hm.gridW}×${hm.gridH}`);
    check('B3p 区块高度可控（<2 屏）', hm.sectionH < 1700, `sectionH=${hm.sectionH}`);
    check('B4p 不撑出文档横向滚动', hm.docOverflowX <= 0, `overflowX=${hm.docOverflowX}`);
  }
  // 竖屏 sticky 复测
  const cTop0 = await page.evaluate(() => document.querySelector('.chapters-section').getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), cTop0 + 900);
  await page.waitForTimeout(300);
  const cStickyTop = await page.evaluate(() => document.querySelector('.chapters-sticky').getBoundingClientRect().top);
  check('A1p 竖屏 chapters 钉住', Math.abs(cStickyTop) < 2, `top=${cStickyTop.toFixed(1)}`);

  await page.screenshot({ path: `${OUT}/portrait-heatmap.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await context.close();
}

// ============ 场景 3：横屏 844×390 ============
{
  const { context, page } = await newScene('landscape', { width: 844, height: 390 });
  console.log('\n===== 场景 3 横屏 844×390 =====');
  const hm = await measureHeatmap(page);
  if (!hm) { skipCheck('B1l 热力图测量', 'grid 未渲染'); }
  else {
    console.log('热力图实测:', JSON.stringify(hm));
    check('B1l 横屏热力图完整可见（不整条横向溢出视口）', hm.gridW <= hm.sectionW && hm.docOverflowX <= 0,
      `grid=${hm.gridW} section=${hm.sectionW} overflowX=${hm.docOverflowX}`);
    check('B2l 横屏区块高度可控', hm.sectionH < 800, `sectionH=${hm.sectionH}`);
  }
  // 横屏 sticky 内容适配：chapters-sticky 在 390 高度下内容是否溢出
  const cTop0 = await page.evaluate(() => document.querySelector('.chapters-section').getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y), cTop0 + 700);
  await page.waitForTimeout(300);
  const fit = await page.evaluate(() => {
    const st = document.querySelector('.chapters-sticky');
    const r = st.getBoundingClientRect();
    const h2 = document.querySelector('.chapter h2');
    const h2r = h2 ? h2.getBoundingClientRect() : null;
    const media = document.querySelector('.chapter-media img');
    const mr = media ? media.getBoundingClientRect() : null;
    return {
      stickyH: Math.round(r.height),
      h2Bottom: h2r ? Math.round(h2r.bottom) : -1,
      mediaBottom: mr ? Math.round(mr.bottom) : -1,
      h2Font: h2 ? getComputedStyle(h2).fontSize : '?',
    };
  });
  console.log('横屏 chapters 实测:', JSON.stringify(fit));
  check('A1l 横屏 chapters 钉住', Math.abs((await page.evaluate(() => document.querySelector('.chapters-sticky').getBoundingClientRect().top))) < 2);
  check('A2l 横屏章节数值区不越过 sticky 底缘', fit.h2Bottom <= 390, `h2Bottom=${fit.h2Bottom} stickyH=${fit.stickyH}`);
  check('A3l 横屏章节图不越过 sticky 底缘', fit.mediaBottom <= 392, `mediaBottom=${fit.mediaBottom}`);

  await page.screenshot({ path: `${OUT}/landscape-heatmap.png` });
  await context.close();
}

await browser.close();
console.log(`\n结果: ${pass} pass / ${fail} fail / ${skip} skip`);
process.exit(fail > 0 ? 1 : 0);
