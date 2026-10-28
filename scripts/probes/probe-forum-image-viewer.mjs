#!/usr/bin/env node
/**
 * probe-forum-image-viewer.mjs — 论坛帖子列表「大图浏览」翻页箭头层级 + 点空白关闭（2026-10-28）
 *
 * 用户报障（2026-10-28）：
 *   1. 「翻页会出现没法返回，即左箭头消失」；
 *   2. 「想点空白处就退出大图浏览」。
 *
 * 根因（实测）：
 *   ① `.forum-image-viewer` 的子元素顺序是 close / toolbar / prev / stage / next / count。
 *      stage 是 `position: relative` 且铺满遮罩，同级定位元素按**源序**绘制 ⇒ 排在 stage
 *      之前的「上一张」按钮被 stage（及其里的 img）整个盖住。close(2) / toolbar(1) 各自
 *      带了 z-index 所以没事，只有 nav 漏了 ⇒ **只有左箭头消失、右箭头正常**。
 *      翻到横图时图片占满整宽，左箭头就彻底看不见、也点不到。
 *   ② 遮罩上的 `@click.self` 永远收不到空白点击 —— stage 铺满遮罩（width/height 100%），
 *      空白处的 target 是 stage，不是遮罩。
 *
 * 判据：
 *   A. 层级：prev 中心点 `elementFromPoint` 必须命中 prev 按钮本身（不是 img / stage）；
 *      真实点击 prev 能翻页。
 *   B. 点空白关闭：点图片外的空白关闭；点图片本身不关闭；拖拽平移不误关；Esc 仍关闭。
 *
 * 用法：node scripts/probes/probe-forum-image-viewer.mjs
 *   环境：先 `npm run dev`（默认 http://[::1]:5173）。
 *   网络全程 mock（列表 RPC 返回一条 3 图帖），不依赖线上数据。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
// 视口：默认竖屏 390×844（用户报障的那档）。宽屏用 `VIEWPORT=1440x900 node ...` 再跑一遍。
// ⚠️ 宽屏下 96vw/92vh 的图片几乎占满 stage，可能没有「空白带」⇒ B 组会标跳过（A 组照常判）。
const [VW, VH] = (process.env.VIEWPORT || '390x844').split('x').map(Number);

let pass = 0;
let fail = 0;
const results = [];
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// 三张不同长宽比的内联 SVG（宽图会占满整宽，正是遮住左箭头的场景）
const svgImage = (w, h, color, label) => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${color}"/>` +
    `<text x="${w / 2}" y="${h / 2}" font-size="${Math.round(h / 6)}" fill="#ffffff" ` +
    `text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const IMAGE_SPECS = [
  { w: 1600, h: 900, color: '#1f6feb', label: '1' },
  { w: 1600, h: 1000, color: '#2da44e', label: '2' },
  { w: 1600, h: 800, color: '#bf3989', label: '3' },
];

const MOCK_ROW = {
  id: '00000000-0000-0000-0000-0000000000c1',
  content: '探针帖：多图大图浏览',
  title: '探针多图帖',
  body: '探针帖：多图大图浏览',
  tag: 'daily',
  author_id: '00000000-0000-0000-0000-0000000000d1',
  author_username: 'probe_viewer_user',
  author_avatar_url: '',
  author_avatar_frame_url: null,
  created_at: '2026-10-28T00:00:00Z',
  updated_at: '2026-10-28T00:00:00Z',
  status: 'approved',
  comment_count: 0,
  like_count: 0,
  is_liked: false,
  image_count: IMAGE_SPECS.length,
  cover_image_url: '',
  images: IMAGE_SPECS.map((spec, index) => ({
    id: `probe-img-${index}`,
    url: svgImage(spec.w, spec.h, spec.color, spec.label),
    originalUrl: svgImage(spec.w, spec.h, spec.color, spec.label),
    width: spec.w,
    height: spec.h,
    sortOrder: index,
  })),
  replies: [],
  replies_has_more: false,
  hot_score: 0,
  has_more: false,
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const context = await browser.newContext({ viewport: { width: VW, height: VH } });
await context.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem('boh-home-gate-passed', String(Date.now()));
  } catch {}
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));

const rows = [MOCK_ROW];
const json = { status: 200, contentType: 'application/json', body: JSON.stringify(rows) };
await page.route('**/rest/v1/rpc/list_forum_posts', (route) => route.fulfill(json));
await page.route('**/rest/v1/posts*', (route) =>
  route.fulfill({
    ...json,
    headers: {
      'Access-Control-Expose-Headers': 'Content-Range',
      'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
    },
  }),
);

const viewerCount = () => page.locator('.forum-image-viewer').count();
const counterText = () =>
  page.locator('.forum-image-viewer-count').innerText().catch(() => '');

/** 打开大图（点卡片第一张缩略图）。
 *  ⚠️ 先确保大图是关着的：如果上一条断言（点空白关闭）失败、遮罩还开着，
 *  直接点缩略图会被 stage/图片拦截 → 抛 TimeoutError，后面的断言全部跑不到。 */
const openViewer = async (thumbIndex = 0) => {
  if (await page.locator('.forum-image-viewer').count()) {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.forum-image-viewer', { state: 'detached', timeout: 3000 }).catch(() => {});
  }
  await page.locator('.post-card-v2 .image-post-thumb-shell').nth(thumbIndex).click();
  await page.waitForSelector('.forum-image-viewer', { timeout: 8000 });
  await page.waitForTimeout(400);
};

/** 装一个 rAF 采样器：把开 / 合过程中的 scale 与 opacity **逐帧**记下来。
 *  动效只存在几百毫秒，固定时刻读会踩空（`*-enter-active` 到点就被摘掉），
 *  见 skills/playwright-animation-probe 坑 1。采样窗口 900ms，覆盖入场 260 / 退场 180。 */
const installSampler = () =>
  page.evaluate(() => {
    window.__samples = [];
    const t0 = performance.now();
    const tick = () => {
      const root = document.querySelector('.forum-image-viewer');
      const stage = document.querySelector('.forum-image-viewer-stage');
      const closeBtn = document.querySelector('.forum-image-viewer-close');
      if (root && stage) {
        const m = new DOMMatrixReadOnly(getComputedStyle(stage).transform);
        window.__samples.push({
          t: Math.round(performance.now() - t0),
          scale: +m.a.toFixed(4),
          opacity: +Number(getComputedStyle(root).opacity).toFixed(3),
          close: closeBtn ? +Number(getComputedStyle(closeBtn).opacity).toFixed(3) : -1,
        });
      } else {
        window.__samples.push({ t: Math.round(performance.now() - t0), gone: true });
      }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const readSamples = () => page.evaluate(() => window.__samples || []);

/** 在 stage 内找一块「图片外的空白」：优先图片上方那条带，不够就用下方 */
const findBlankPoint = () =>
  page.evaluate(() => {
    const stage = document.querySelector('.forum-image-viewer-stage');
    const img = document.querySelector('.forum-image-viewer-img');
    if (!stage || !img) return null;
    const sr = stage.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const topGap = ir.top - sr.top;
    const bottomGap = sr.bottom - ir.bottom;
    // 顶部 100px 内被 toolbar / close 占着，避开
    const safeTop = sr.top + 110;
    const x = sr.left + 26;
    let y = null;
    if (ir.top - safeTop >= 50) y = (safeTop + ir.top) / 2;
    else if (bottomGap >= 50) y = (ir.bottom + sr.bottom) / 2;
    if (y === null) return null;
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      topGap: +topGap.toFixed(1),
      bottomGap: +bottomGap.toFixed(1),
      hitClass: hit ? hit.className || hit.tagName : 'none',
      hitIsStage: hit === stage,
    };
  });

/** prev 按钮中心点被谁挡着 */
const hitAtNavCenter = (sel) =>
  page.evaluate((selector) => {
    const nav = document.querySelector(selector);
    if (!nav) return { found: false };
    const r = nav.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      found: true,
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      hitTag: hit ? hit.tagName : 'none',
      hitClass: hit ? String(hit.className || '') : 'none',
      hitsSelf: hit === nav || nav.contains(hit),
    };
  }, sel);

try {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.post-card-v2 .image-post-thumb-shell', { timeout: 30000 });
  await page.waitForTimeout(800);

  // ---------------- A：左箭头层级（本次回归主判据） ----------------
  console.log('\n--- A 翻页箭头层级 ---');
  await openViewer(0);
  check('A0 大图已打开', (await viewerCount()) === 1);
  check('A1 三张图计数正确', (await counterText()).replace(/\s/g, '') === '1/3', await counterText());

  const prevHit = await hitAtNavCenter('.forum-image-viewer-nav.prev');
  check(
    'A2 左箭头中心点未被 stage/图片遮挡',
    prevHit.found && prevHit.hitsSelf,
    prevHit.found
      ? `命中 ${prevHit.hitTag}.${prevHit.hitClass}（rect ${JSON.stringify(prevHit.rect)}）`
      : '左箭头不存在',
  );
  const nextHit = await hitAtNavCenter('.forum-image-viewer-nav.next');
  check('A3 右箭头中心点未被遮挡（对照组）', nextHit.found && nextHit.hitsSelf, nextHit.hitClass);

  // 真实点击左箭头（用坐标点，被遮挡时会点到图片上，翻页不发生）
  const prevRect = prevHit.rect || { x: 0, y: 0, w: 0, h: 0 };
  await page.mouse.click(prevRect.x + prevRect.w / 2, prevRect.y + prevRect.h / 2);
  await page.waitForTimeout(450);
  check(
    'A4 点左箭头能翻到上一张（1 → 3 循环）',
    (await counterText()).replace(/\s/g, '') === '3/3',
    await counterText(),
  );

  // 翻到宽图后再验一次（图片占满整宽，最容易遮住左箭头）
  const prevHitAfter = await hitAtNavCenter('.forum-image-viewer-nav.prev');
  check(
    'A5 翻页后左箭头仍未被遮挡',
    prevHitAfter.found && prevHitAfter.hitsSelf,
    `命中 ${prevHitAfter.hitTag}.${prevHitAfter.hitClass}`,
  );
  await page.screenshot({ path: `${OUT}/forum-image-viewer-arrows.png` });

  // ---------------- B：点空白关闭 ----------------
  console.log('\n--- B 点空白关闭 ---');
  const blank = await findBlankPoint();
  check(
    'B0 空白点确实落在 stage 上（不是图片）',
    Boolean(blank) && blank.hitIsStage,
    blank ? `(${blank.x.toFixed(0)}, ${blank.y.toFixed(0)}) 命中 ${blank.hitClass}` : '找不到空白带',
  );

  if (blank && blank.hitIsStage) {
    await page.mouse.click(blank.x, blank.y);
    await page.waitForTimeout(500);
    check('B1 点空白处关闭大图', (await viewerCount()) === 0, `viewer=${await viewerCount()}`);
  } else if (!blank) {
    // 宽屏档：图片几乎占满 stage，没有空白带 —— 这一档跳过（竖屏档才是主判据）
    check('B1 点空白处关闭大图', true, '本档视口无空白带，跳过');
  } else {
    check('B1 点空白处关闭大图', false, `空白点没落在 stage 上（命中 ${blank.hitClass}）`);
  }

  // 点图片本体不关闭
  await openViewer(0);
  const imgCenter = await page.evaluate(() => {
    const r = document.querySelector('.forum-image-viewer-img').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(imgCenter.x, imgCenter.y);
  await page.waitForTimeout(450);
  check('B2 点图片本体不关闭', (await viewerCount()) === 1, `viewer=${await viewerCount()}`);

  // 放大后拖拽平移，不应被当成「点击空白」误关
  await page.locator('.forum-image-viewer-tool[aria-label="放大图片"]').click();
  await page.locator('.forum-image-viewer-tool[aria-label="放大图片"]').click();
  await page.waitForTimeout(250);
  await page.mouse.move(imgCenter.x, imgCenter.y);
  await page.mouse.down();
  await page.mouse.move(imgCenter.x + 70, imgCenter.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  check('B3 拖拽平移后不误关', (await viewerCount()) === 1, `viewer=${await viewerCount()}`);

  // 缩放态下「点图片」也不能关：startPan 会 setPointerCapture，click 的目标会被改派到
  // stage（target === currentTarget），只靠 target 判定会误关 —— 所以还要看按下时落在哪
  await page.mouse.click(imgCenter.x, imgCenter.y);
  await page.waitForTimeout(400);
  check('B3b 缩放态点图片不误关（指针捕获改派 target 也不关）', (await viewerCount()) === 1, `viewer=${await viewerCount()}`);

  // 缩放态下点空白也关闭（用户口径：点空白就退出）
  const blankZoomed = await findBlankPoint();
  if (blankZoomed && blankZoomed.hitIsStage) {
    await page.mouse.click(blankZoomed.x, blankZoomed.y);
    await page.waitForTimeout(500);
    check('B4 缩放态点空白也关闭', (await viewerCount()) === 0, `viewer=${await viewerCount()}`);
  } else {
    check('B4 缩放态点空白也关闭', true, '缩放后无空白带（整屏被图片占满），跳过');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // Esc 仍关闭（回归守卫）
  await openViewer(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  check('B5 Esc 仍能关闭', (await viewerCount()) === 0, `viewer=${await viewerCount()}`);

  // ---------------- E：重新打开不继承上次的缩放/平移 ----------------
  // 组件是常驻挂载（v-model:open），zoom/pan 是组件内状态。当前之所以能从 100% 起，
  // 是因为父层每次打开都 `forumImageViewerImages.value = post.allImages.filter(...)`（新数组）
  // ⇒ 命中组件里 `watch(() => props.images)` 的 resetTransform。**这条链很脆**：
  // 谁把父层优化成「同引用不换数组」，重开就会带着上次的 2x 缩放 + 平移出现，所以钉住它。
  console.log('\n--- E 重开状态 ---');
  await openViewer(0);
  await page.locator('.forum-image-viewer-tool[aria-label="放大图片"]').click();
  await page.locator('.forum-image-viewer-tool[aria-label="放大图片"]').click();
  await page.waitForTimeout(200);
  const zoomedLabel = (await page.locator('.forum-image-viewer-zoom').innerText()).trim();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await openViewer(0);
  const reopenLabel = (await page.locator('.forum-image-viewer-zoom').innerText()).trim();
  const reopenTransform = await page.evaluate(() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.forum-image-viewer-img')).transform);
    return { scale: +m.a.toFixed(3), x: +m.e.toFixed(1), y: +m.f.toFixed(1) };
  });
  check(
    'E1 重新打开从 100% 起（不继承上次缩放）',
    reopenLabel === '100%' && reopenTransform.scale === 1,
    `放大到 ${zoomedLabel} → 重开 ${reopenLabel}（transform scale=${reopenTransform.scale}）`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---------------- C：开合动效（逐帧采样） ----------------
  console.log('\n--- C 开合动效 ---');
  await installSampler();
  await page.locator('.post-card-v2 .image-post-thumb-shell').nth(0).click();
  await page.waitForTimeout(950);
  const enterFrames = (await readSamples()).filter((s) => !s.gone);
  const enterMinScale = enterFrames.length ? Math.min(...enterFrames.map((s) => s.scale)) : 1;
  const enterMinClose = enterFrames.length ? Math.min(...enterFrames.map((s) => s.close)) : 1;
  const enterFirstOpacity = enterFrames.length ? enterFrames[0].opacity : 1;
  const enterLast = enterFrames[enterFrames.length - 1] || {};
  const settledAt = enterFrames.find((s) => s.scale >= 0.999)?.t;
  const enterDuration = settledAt !== undefined && enterFrames.length
    ? settledAt - enterFrames[0].t
    : -1;

  check(
    'C1 入场图片从缩放态浮起（不是硬出现）',
    enterMinScale <= 0.96,
    `逐帧最小 scale=${enterMinScale}（帧数 ${enterFrames.length}）`,
  );
  check(
    'C2 入场落定在 100%',
    Math.abs(Number(enterLast.scale) - 1) < 0.005,
    `末帧 scale=${enterLast.scale}`,
  );
  check(
    'C3 遮罩淡入（首帧非全不透明）',
    enterFirstOpacity < 0.6,
    `首帧 opacity=${enterFirstOpacity}`,
  );
  check(
    'C4 控件晚一拍淡入（存在 opacity=0 的帧）',
    enterMinClose < 0.15,
    `控件最小 opacity=${enterMinClose}`,
  );
  check('C5 控件最终完全可见', Number(enterLast.close) === 1, `末帧 opacity=${enterLast.close}`);
  check(
    'C6 入场时长在 150~450ms（对齐 --duration-base 量级）',
    enterDuration >= 150 && enterDuration <= 450,
    `实测 ${enterDuration}ms`,
  );
  await page.screenshot({ path: `${OUT}/forum-image-viewer-open.png` });

  // 退场：点关闭按钮，采 900ms
  await installSampler();
  await page.locator('.forum-image-viewer-close').click();
  await page.waitForTimeout(950);
  const leaveAll = await readSamples();
  const leaveFrames = leaveAll.filter((s) => !s.gone);
  const leaveMid = leaveFrames.filter((s) => s.opacity > 0.02 && s.opacity < 0.98);
  const leaveMinScale = leaveFrames.length ? Math.min(...leaveFrames.map((s) => s.scale)) : 1;
  check(
    'C7 退场不是瞬消（存在可见的中间帧）',
    leaveFrames.length >= 3,
    `可见帧 ${leaveFrames.length}`,
  );
  check('C8 退场有透明度渐变', leaveMid.length >= 2, `中间帧 ${leaveMid.length}`);
  check(
    'C9 退场图片轻微缩回',
    leaveFrames.length > 0 && leaveMinScale < 0.999,
    `最小 scale=${leaveMinScale}`,
  );
  check(
    'C10 退场结束后节点已卸载',
    leaveAll.length > 0 && leaveAll[leaveAll.length - 1].gone === true,
    `末帧 ${JSON.stringify(leaveAll[leaveAll.length - 1])}`,
  );

  // ---------------- D：reduce-motion 口径 ----------------
  console.log('\n--- D reduce-motion ---');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSampler();
  await page.locator('.post-card-v2 .image-post-thumb-shell').nth(0).click();
  await page.waitForTimeout(950);
  const reduceFrames = (await readSamples()).filter((s) => !s.gone);
  const reduceScales = [...new Set(reduceFrames.map((s) => s.scale))];
  const reduceMid = reduceFrames.filter((s) => s.opacity > 0.02 && s.opacity < 0.98);
  check(
    'D1 reduce 下不再缩放（只剩 opacity）',
    reduceScales.length > 0 && reduceScales.every((v) => v === 1),
    `出现过的 scale 值 ${JSON.stringify(reduceScales)}`,
  );
  check(
    'D2 reduce 下仍保留可感知的淡入（不是瞬现）',
    reduceMid.length >= 1,
    `中间透明度帧 ${reduceMid.length}`,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);

  check('B6 无运行期报错', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
} finally {
  console.log('\n' + results.join('\n'));
  console.log(`\n合计：${pass} PASS / ${fail} FAIL`);
  if (pageErrors.length) console.log('pageerror:', pageErrors.slice(0, 3));
  await browser.close();
}

process.exit(fail ? 1 : 0);
