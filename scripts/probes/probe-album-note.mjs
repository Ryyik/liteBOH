// =====================================================================
// 探针：影集「笔记版式」阅读页（2026-11-14）
//
//   参考图口径：小红书图文笔记 —— 白纸、顶部大图、图下左标题右正文、
//   标题为宋体、元信息是「日期 地点」、无书脊/无品牌蓝。
//
//   为什么能直接测：示例影集 /albums/demo 是纯前端静态数据（demo-album.js），
//   不查库、不依赖登录；demo 里同时有横图笔记页与竖图笔记页，正好覆盖两种变体。
//
//   锁死七件事：
//     ① 阅读页只剩单页纸面：`.ar-spread` / `.ar-spine` 必须不存在（旧双页书已退场）；
//        纸面高度:100% + 顶部避让 padding 不能恒溢出（border-box），否则右侧永远挂一条空滚动条
//     ② 横图笔记：图在文字上方，标题列在正文列左侧（两栏几何，不靠 class 自证）
//     ③ 竖图笔记：宽容器下左图右文；窄容器下图置顶（容器查询的两档）
//     ④ 字体：标题/正文计算后的 font-family 落在宋体栈上
//     ⑤ 字号：宽容器标题 ≥28px、窄容器 ≥20px；正文 ≥14px
//     ⑥ 纸面纯白 + 进度条不再是品牌蓝
//     ⑦ 两图页：两张上下堆叠，且仍用同一套「图在上 / 左标题右正文」——没有网格版式
//
//   反证（改坏 → 必红）：把 `@container (min-width:720px)` 块删掉 → ③ 的宽容器断言红；
//   把 .note-title 的 font-family 去掉 → ④ 红；把标题列/正文列合并成一栏 → ② 红。
// =====================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

/**
 * 宋体判定：不能只测 /serif/i —— "sans-serif" 里也含 "serif"，会把无衬线误判成通过。
 * 只认具体宋体族名；系统兜底的 generic serif 不单独放行。
 */
const isSerifStack = (fontFamily) =>
  /Songti|STSong|SimSun|Noto Serif|Source Han Serif/i.test(String(fontFamily || ''));

const readNote = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('.note-sheet');
    if (!sheet) return null;
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const title = sheet.querySelector('.note-title');
    const body = sheet.querySelector('.note-body');
    const meta = sheet.querySelector('.note-meta');
    const photo = sheet.querySelector('.note-photo');
    const img = photo?.querySelector('img');
    return {
      classes: String(sheet.className),
      titleText: title?.textContent?.trim() || '',
      metaText: meta?.textContent?.trim() || '',
      titleFont: title ? getComputedStyle(title).fontFamily : '',
      titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
      bodyFont: body ? getComputedStyle(body).fontFamily : '',
      bodySize: body ? parseFloat(getComputedStyle(body).fontSize) : 0,
      imgFit: img ? getComputedStyle(img).objectFit : '',
      sheetBg: getComputedStyle(document.querySelector('.ar-page-scroll') || sheet).backgroundColor,
      titleRect: rect(title),
      bodyRect: rect(body),
      photoRect: rect(photo),
      hasSpread: Boolean(document.querySelector('.ar-spread')),
      hasSpine: Boolean(document.querySelector('.ar-spine')),
      progressColor: (() => {
        const fill = document.querySelector('.ar-progress-fill');
        return fill ? getComputedStyle(fill).backgroundColor : '';
      })(),
    };
  });

for (const vp of [
  { n: '1440x900', w: 1440, h: 900, wide: true },
  { n: '390x844', w: 390, h: 844, wide: false },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    hasTouch: !vp.wide,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/#/albums/demo`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ar-page-scroll', { timeout: 15000 });
  await page.waitForTimeout(700);

  // ① 单页纸面
  const coverState = await page.evaluate(() => ({
    hasSpread: Boolean(document.querySelector('.ar-spread')),
    hasSpine: Boolean(document.querySelector('.ar-spine')),
    hasBook: Boolean(document.querySelector('.ar-book')),
  }));
  check(
    `${vp.n} ① 旧双页书结构已退场`,
    !coverState.hasSpread && !coverState.hasSpine && !coverState.hasBook,
    JSON.stringify(coverState),
  );
  await page.screenshot({ path: `${OUT}/probe-album-note-${vp.n}-cover.png` });

  // ①b 纸面不再挂「恒溢出」的空滚动条：height:100% + padding-top 必须走 border-box
  const scrollInfo = await page.$eval('.ar-page-scroll', (el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
  check(
    `${vp.n} ① 纸面没有空滚动条（无纵向溢出）`,
    scrollInfo.scrollHeight <= scrollInfo.clientHeight + 1 &&
      scrollInfo.scrollWidth <= scrollInfo.clientWidth + 1,
    `${scrollInfo.scrollWidth}x${scrollInfo.scrollHeight} / 视口 ${scrollInfo.clientWidth}x${scrollInfo.clientHeight}`,
  );

  // 第二页 = 横图笔记
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('.note-sheet:not(.is-portrait)', { timeout: 10000 });
  // 翻页过渡 260ms：等落定再量/截图，否则量到的是 opacity 0 的进场帧
  await page.waitForTimeout(400);
  const landscape = await readNote(page);
  await page.screenshot({ path: `${OUT}/probe-album-note-${vp.n}-landscape.png` });

  check(
    `${vp.n} ② 横图笔记：图在文字上方`,
    landscape.photoRect.bottom <= landscape.titleRect.top + 1,
    `photo.bottom=${landscape.photoRect.bottom.toFixed(1)} title.top=${landscape.titleRect.top.toFixed(1)}`,
  );
  check(
    `${vp.n} ② 横图笔记：标题列在正文列左侧`,
    landscape.titleRect.right <= landscape.bodyRect.left + 1,
    `title.right=${landscape.titleRect.right.toFixed(1)} body.left=${landscape.bodyRect.left.toFixed(1)}`,
  );
  check(`${vp.n} ④ 标题使用宋体栈`, isSerifStack(landscape.titleFont), landscape.titleFont);
  check(`${vp.n} ④ 正文使用宋体栈`, isSerifStack(landscape.bodyFont), landscape.bodyFont);
  check(
    `${vp.n} ⑤ 标题字号达标`,
    landscape.titleSize >= (vp.wide ? 28 : 20),
    `${landscape.titleSize}px`,
  );
  check(`${vp.n} ⑤ 正文字号达标`, landscape.bodySize >= 14, `${landscape.bodySize}px`);
  check(`${vp.n} ⑥ 纸面纯白`, landscape.sheetBg === 'rgb(255, 255, 255)', landscape.sheetBg);
  check(
    `${vp.n} ⑥ 进度条不再是品牌蓝`,
    landscape.progressColor !== 'rgb(10, 132, 255)' &&
      landscape.progressColor !== 'rgba(10, 132, 255, 1)',
    landscape.progressColor,
  );
  check(
    `${vp.n} 元信息为「日期 地点」`,
    /2026\.10\.01\s+雾岭/.test(landscape.metaText),
    landscape.metaText,
  );

  // 第三页 = 竖图笔记
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('.note-sheet.is-portrait', { timeout: 10000 });
  await page.waitForTimeout(400);
  const portrait = await readNote(page);
  await page.screenshot({ path: `${OUT}/probe-album-note-${vp.n}-portrait.png` });

  if (vp.wide) {
    check(
      `${vp.n} ③ 竖图宽容器：左图右文`,
      portrait.photoRect.right <= portrait.titleRect.left + 1 &&
        portrait.titleRect.left > portrait.photoRect.left + 10,
      `photo.right=${portrait.photoRect.right.toFixed(1)} title.left=${portrait.titleRect.left.toFixed(1)}`,
    );
    check(`${vp.n} ③ 竖图完整显示（contain）`, portrait.imgFit === 'contain', portrait.imgFit);
  } else {
    check(
      `${vp.n} ③ 竖图窄容器：图仍在文字上方`,
      portrait.photoRect.bottom <= portrait.titleRect.top + 1,
      `photo.bottom=${portrait.photoRect.bottom.toFixed(1)} title.top=${portrait.titleRect.top.toFixed(1)}`,
    );
    check(`${vp.n} ③ 竖图完整显示（contain）`, portrait.imgFit === 'contain', portrait.imgFit);
  }

  // 竖图必须保持原比例（防 4:3 定比例残留把它压成矮框）
  check(
    `${vp.n} ③ 竖图按原比例（高 > 宽）`,
    portrait.photoRect.height > portrait.photoRect.width,
    `${portrait.photoRect.width.toFixed(1)}x${portrait.photoRect.height.toFixed(1)}`,
  );

  // 第四页 = 两图笔记页（一页最多两图，仍用同一套文字区）
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('.note-photo.is-pair', { timeout: 10000 });
  await page.waitForTimeout(400);
  const pair = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.note-photo.is-pair img')];
    const rects = imgs.map((img) => img.getBoundingClientRect());
    const title = document.querySelector('.note-title')?.getBoundingClientRect();
    return {
      count: imgs.length,
      rects,
      titleTop: title?.top ?? 0,
      hasGrid: Boolean(document.querySelector('.sheet-grid')),
    };
  });
  await page.screenshot({ path: `${OUT}/probe-album-note-${vp.n}-pair.png` });

  check(
    `${vp.n} ⑦ 两图页：两张上下堆叠、等宽同左`,
    pair.count === 2 &&
      pair.rects[1].top >= pair.rects[0].bottom - 1 &&
      Math.abs(pair.rects[0].left - pair.rects[1].left) < 1 &&
      Math.abs(pair.rects[0].width - pair.rects[1].width) < 2,
    `${pair.count} 张`,
  );
  check(
    `${vp.n} ⑦ 两图页仍用笔记排版（无网格版式、图在标题上方）`,
    !pair.hasGrid && pair.titleTop > pair.rects[1].bottom,
    `title.top=${pair.titleTop.toFixed(1)} img.bottom=${pair.rects[1]?.bottom.toFixed(1)}`,
  );

  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 断言通过`);
if (failed.length) {
  console.log(failed.map((r) => `FAIL ${r.name}`).join('\n'));
  process.exit(1);
}
