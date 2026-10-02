// =====================================================================
// 探针：Cloud+ 相册（图库）形态 —— 「iOS 图库式密铺」+ 多图铺开 + 捏合切列
//      （2026-10-02 新增，产品口径：参考 iPhone / iPad 图库）
//
//   三件事一起锁（用户一轮之内提的，互相耦合）：
//     ① 去日期分组：相册是一整片连续密铺，没有月份段标题
//     ② 多图贴铺开：一条含 N 张图的内容 → N 个格子（不再是「封面 + N 图角标」）
//     ③ 捏合切列：两指张开/收拢（Mac 触控板是 ctrl+wheel）切列数，并落盘记住
//
//   为什么必须 mock：探测账号的 Cloud+ 是 0 条内容，空态根本不渲染网格。
//   这里用 page.route 拦 `boh_cloud_entries` 回 23 条（20 单图 + 3 图 + 2 图 + 1 纯文字），
//   期望渲染 26 格 —— 这个数字同时验证「多图摊平」与「纯文字占 1 格」两件事。
//   ⚠️ 图片用 data:image/svg+xml（每格带序号），不依赖外网，也不受
//   `utils/db-image-url.js` 的别名/Cloudinary 改写影响。
//
//   反证（必须做）：把 CSS 的列数改回写死的 `repeat(5, …)` → 「列数由变量驱动」那条
//   （单测 cloud-album-order.test.js）会红、本探针的捏合断言也会红；
//   把 albumTiles 的 flatMap 换成直接遍历 entries → 「多图贴铺开」当场变红（26 → 23）。
//
//   counter-proof 实测：见 .workbuddy/memory/2026-10-02.md。
// =====================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const COLORS = ['e5732f', '3f7fd4', '5aa86a', 'b4553f', '7a6bd6', 'c9a227', '2f8f8f', 'a34d8e'];
const svgUrl = (label, color) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>` +
  `<rect width='240' height='240' fill='%23${color}'/>` +
  `<text x='120' y='152' font-size='92' font-family='sans-serif' text-anchor='middle' fill='white'>${label}</text>` +
  `</svg>`;

const imgBlock = (n) => ({ type: 'image', url: svgUrl(n, COLORS[n % COLORS.length]), alt: '' });
const row = (i, blocks, over = {}) => ({
  id: `1111111${String(i).padStart(2, '0')}-1111-4111-8111-111111111111`,
  user_id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
  entry_date: `2026-0${(i % 3) + 7}-${String((i % 28) + 1).padStart(2, '0')}`,
  legacy_note_date: null,
  title: `第 ${i} 条`,
  entry_type: blocks.some((b) => b.type === 'image') ? 'image' : 'text',
  visibility: 'private',
  content_text: '',
  content_blocks: blocks,
  cover_image_url: blocks.find((b) => b.type === 'image')?.url || '',
  mood: null,
  source: 'app',
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
  ...over,
});

// 20 条单图 + 1 条三图 + 1 条两图 + 1 条纯文字  ⇒ 期望格子数 = 20 + 3 + 2 + 1 = 26
const rows = [
  ...Array.from({ length: 20 }, (_, i) => row(i + 1, [imgBlock(i + 1)])),
  row(21, [imgBlock(21), imgBlock(22), imgBlock(23)], { title: '三图贴' }),
  row(22, [imgBlock(24), imgBlock(25)], { title: '两图贴' }),
  row(23, [{ type: 'text', text: '这是一条纯文字记录，用来占一个纸片格。' }], { title: '纯文字' }),
];
const EXPECTED_TILES = 26;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

for (const vp of [
  { n: '390x844', w: 390, h: 844 },
  { n: '1280x900', w: 1280, h: 900 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    hasTouch: vp.w < 700,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const jsonHeaders = (count) => ({
    'content-type': 'application/json',
    'content-range': `0-${Math.max(count - 1, 0)}/${count}`,
  });
  await page.route('**/rest/v1/boh_cloud_entries*', (r) =>
    r.fulfill({ status: 200, headers: jsonHeaders(rows.length), body: JSON.stringify(rows) }),
  );
  for (const t of ['boh_note_entries', 'boh_cloud_share_channels']) {
    await page.route(`**/rest/v1/${t}*`, (r) =>
      r.fulfill({ status: 200, headers: jsonHeaders(0), body: '[]' }),
    );
  }

  // 列数会落盘（捏合后记住），探针必须从「未手动调过」的干净起点跑，
  // 否则上一轮跑出的 4 列会被读回来，5 列的断言假红。
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('boh-cloud-album-columns');
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    Object.assign(pinia.state.value.auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
    });
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.settings-shell button')].find((b) =>
      /Cloud\s*\+?/i.test(b.textContent || ''),
    );
    btn?.click();
  });
  await page.waitForTimeout(4500);
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.cloud-bottom-nav-item')].find(
      (b) => b.textContent.trim() === '内容',
    );
    item?.click();
  });
  await page.waitForTimeout(4500);

  const read = () =>
    page.evaluate(() => {
      const grid = document.querySelector('.album-tile-grid');
      if (!grid) return { err: 'no grid' };
      const tiles = [...grid.querySelectorAll('.gallery-tile')];
      const cs = getComputedStyle(grid);
      const r = grid.getBoundingClientRect();
      const t0 = tiles[0]?.getBoundingClientRect();
      const t1 = tiles[1]?.getBoundingClientRect();
      const rowTop = t0?.top ?? 0;
      const firstRow = tiles.filter((el) => Math.abs(el.getBoundingClientRect().top - rowTop) < 2);
      const imgs = [...grid.querySelectorAll('.tile-cover')];
      const papers = grid.querySelectorAll('.tile-paper').length;
      return {
        cols: cs.gridTemplateColumns.split(' ').length,
        colsVar: getComputedStyle(grid.parentElement?.closest('.album-gallery-section') || grid)
          .getPropertyValue('--album-columns')
          .trim(),
        gap: cs.gap,
        tiles: tiles.length,
        firstRowCount: firstRow.length,
        tileW: t0 ? +t0.width.toFixed(1) : 0,
        tileH: t0 ? +t0.height.toFixed(1) : 0,
        gapX: t0 && t1 ? +(t1.left - t0.right).toFixed(2) : 0,
        flushLeft: Math.round(r.left) === 0,
        flushRight: Math.round(r.right) === window.innerWidth,
        monthHeadings: document.querySelectorAll('.album-month-heading').length,
        countBadges: grid.querySelectorAll('.tile-count-badge').length,
        papers,
        imgsLoaded: imgs.filter((im) => im.complete && im.naturalWidth > 0).length,
        imgsTotal: imgs.length,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        radius: tiles[0] ? getComputedStyle(tiles[0]).borderRadius : '',
      };
    });

  const m = await read();
  const p = (s) => `[${vp.n}] ${s}`;
  if (m.err) {
    check(p('网格渲染'), false, JSON.stringify(m));
    await ctx.close();
    continue;
  }
  check(p('去日期分组（无月份标题）'), m.monthHeadings === 0, `monthHeadings=${m.monthHeadings}`);
  check(
    p(`多图贴铺开（期望 ${EXPECTED_TILES} 格）`),
    m.tiles === EXPECTED_TILES,
    `tiles=${m.tiles} 期望=${EXPECTED_TILES}（20 单图 + 3 + 2 + 1 纸片）`,
  );
  check(p('无「N 图」角标'), m.countBadges === 0, `countBadges=${m.countBadges}`);
  check(p('纯文字条目仍占 1 格纸片'), m.papers === 1, `papers=${m.papers}`);
  check(p('格子为正方形'), Math.abs(m.tileW - m.tileH) <= 1, `${m.tileW}x${m.tileH}`);
  check(p('直角（无圆角）'), m.radius === '0px', `radius=${m.radius}`);
  check(p('无横向滚动'), m.overflowX === false, `overflowX=${m.overflowX}`);
  check(
    p('图片全部加载'),
    m.imgsLoaded === m.imgsTotal && m.imgsTotal > 0,
    `${m.imgsLoaded}/${m.imgsTotal}`,
  );
  if (vp.w < 700) {
    check(
      p('竖屏固定 5 列'),
      m.cols === 5,
      `cols=${m.cols} 首行=${m.firstRowCount} 格宽=${m.tileW}`,
    );
    check(
      p('通栏贴边（首尾顶到屏幕）'),
      m.flushLeft && m.flushRight,
      `left=${m.flushLeft} right=${m.flushRight}`,
    );
    check(p('缝隙 1px'), m.gap === '1px', `gap=${m.gap} 实测缝=${m.gapX}`);
  } else {
    check(p('宽屏自适应多列（>5）'), m.cols > 5, `cols=${m.cols} 格宽=${m.tileW}`);
  }

  await page.screenshot({ path: `${OUT}/album5-${vp.n}.png` });

  // ---- 捏合切列（仅竖屏档；用页面内 TouchEvent 模拟两指）----
  if (vp.w < 700) {
    const pinch = await page.evaluate(async () => {
      const host = document.querySelector('.album-gallery-section');
      const grid = document.querySelector('.album-tile-grid');
      const colsOf = () => getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const varsOf = () => getComputedStyle(host).getPropertyValue('--album-columns').trim();
      const mkTouch = (id, x, y) =>
        new Touch({ identifier: id, target: host, clientX: x, clientY: y });
      const fire = (type, list) =>
        host.dispatchEvent(
          new TouchEvent(type, { touches: list, bubbles: true, cancelable: true }),
        );
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

      const seq = [];
      seq.push({ step: 'init', cols: colsOf(), cssVar: varsOf() });

      // 张开：距离 100 → 150（scale 1.5 ≥ 1.25 ⇒ 5 → 4）
      fire('touchstart', [mkTouch(1, 100, 300), mkTouch(2, 200, 300)]);
      fire('touchmove', [mkTouch(1, 75, 300), mkTouch(2, 225, 300)]);
      await frame();
      seq.push({ step: '张开1', cols: colsOf(), cssVar: varsOf() });

      // 继续张开：距离 150 → 225（重新基线，再切一档 ⇒ 4 → 3）
      fire('touchmove', [mkTouch(1, 37, 300), mkTouch(2, 262, 300)]);
      await frame();
      seq.push({ step: '张开2', cols: colsOf(), cssVar: varsOf() });

      // 收拢：距离 225 → 112（scale 0.5 ≤ 0.8 ⇒ 3 → 4）
      fire('touchmove', [mkTouch(1, 137, 300), mkTouch(2, 249, 300)]);
      await frame();
      seq.push({ step: '收拢', cols: colsOf(), cssVar: varsOf() });

      fire('touchend', []);
      const stored = window.localStorage.getItem('boh-cloud-album-columns');
      return { seq, stored };
    });
    const after = pinch.seq.map((s) => `${s.step}:${s.cols}`).join(' → ');
    check(
      p('捏合切列 5→4→3→4'),
      pinch.seq[0].cols === 5 &&
        pinch.seq[1].cols === 4 &&
        pinch.seq[2].cols === 3 &&
        pinch.seq[3].cols === 4,
      after,
    );
    check(p('列数落盘持久化'), pinch.stored === '4', `localStorage=${pinch.stored}`);
    await page.screenshot({ path: `${OUT}/album5-${vp.n}-pinch.png` });
  }

  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n相册改造：${results.length - failed} PASS / ${failed} FAIL`);
process.exit(failed > 0 ? 1 : 0);
