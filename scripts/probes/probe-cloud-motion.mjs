import { chromium } from 'playwright';

// =====================================================================
// 探针：Cloud+ 动效 —— 放大 / 缩小 / 切换（2026-10-03 新增）
//
//   四条一起锁（用户一轮之内提的「灵动一点」）：
//     ① 图库格子 hover 放大 / 按压缩小
//     ② 详情弹窗从**点中的那一格**放大展开、关闭缩回同一处
//     ③ 内容 / 分享 / 设置三档切换的右区过渡
//     ④ 捏合切列的「落定」回弹
//
//   为什么必须 mock：探测账号的 Cloud+ 是 0 条内容，空态根本不渲染格子。
//   这里 `page.route` 拦 `boh_cloud_entries` 回 8 条单图条目，
//   图片用 data:image/svg+xml（不依赖外网、不受 utils/db-image-url.js 改写影响）。
//
//   ⚠️ 三条实测坑（首轮都假红过，别再照错的写法改回来）：
//     ① 瞬时类必须**在动画窗口内读**：进场类由 Vue 在 animationend 后摘掉，
//        在 600ms 才读会拿到 animation:none / 默认 transform-origin（假红）。
//        本探针统一在 120ms 读。
//     ② 按压测试的 mouse.up 落在格子上 = 一次真实点击 → 详情会打开，
//        必须先关掉再继续，否则后续 `tiles[n].click()` 被遮罩拦截而超时。
//     ③ 观察 is-settling 的 MutationObserver 必须在**切回内容档之后**重装 ——
//        切 tab 会让内容档整体 v-else 重建，盯旧节点永远等不到（假红 seen=0）。
//
//   反证（已做）：把 openEntry 里读 rect 的分支改成恒 false（退回「居中展开」）→
//     「展开原点 = 点中格子的中心」「弹窗 transform-origin 用了该原点」两条当场 FAIL。
// =====================================================================
const BASE = process.env.PROBE_BASE || 'http://localhost:5173';

const COLORS = ['e5732f', '3f7fd4', '5aa86a', 'b4553f', '7a6bd6', 'c9a227'];
const svgUrl = (label, color) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>` +
  `<rect width='240' height='240' fill='%23${color}'/>` +
  `<text x='120' y='152' font-size='92' font-family='sans-serif' text-anchor='middle' fill='white'>${label}</text>` +
  `</svg>`;

const row = (i) => ({
  id: `3333333${i}-3333-4333-8333-333333333333`,
  user_id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
  entry_date: `2026-09-${String(20 - i).padStart(2, '0')}`,
  legacy_note_date: null,
  title: `第 ${i} 条`,
  entry_type: 'image',
  visibility: 'private',
  content_text: '',
  content_blocks: [{ type: 'image', url: svgUrl(i, COLORS[i % COLORS.length]), alt: '' }],
  cover_image_url: svgUrl(i, COLORS[i % COLORS.length]),
  mood: null,
  source: 'app',
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
});

const rows = Array.from({ length: 8 }, (_, i) => row(i + 1));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
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

// 记录瞬时类名（进场过渡 / 落定回弹都是短时类，必须用 MutationObserver 抓）
await page.evaluate(() => {
  window.__seen = { viewEntering: 0, settling: 0 };
  const main = document.querySelector('.cloud-main');
  const grid = document.querySelector('.album-tile-grid');
  const watch = (el, cls, key) => {
    if (!el) return;
    new MutationObserver(() => {
      if (el.classList.contains(cls)) window.__seen[key] += 1;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  };
  watch(main, 'is-view-entering', 'viewEntering');
  watch(grid, 'is-settling', 'settling');
});

const tiles = await page.$$('.gallery-tile');
check('图库渲染出格子', tiles.length === rows.length, `tiles=${tiles.length} 期望=${rows.length}`);

// ── ① 放大 / 缩小 ──────────────────────────────────────────────
const hoverMedia = await page.evaluate(() => ({
  hover: matchMedia('(hover: hover)').matches,
  fine: matchMedia('(pointer: fine)').matches,
}));
check(
  'hover 媒体查询可用（headless 需 hover:hover + pointer:fine）',
  hoverMedia.hover && hoverMedia.fine,
  JSON.stringify(hoverMedia),
);

const tileTransition = await page.evaluate(() => {
  const t = document.querySelector('.gallery-tile');
  return getComputedStyle(t).transitionProperty;
});
check('格子本体有 transform 过渡', /transform/.test(tileTransition), tileTransition);

const box = await tiles[1].boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(420);
const hoverScale = await page.evaluate(() => {
  const t = document.querySelectorAll('.gallery-tile')[1];
  const m = new DOMMatrixReadOnly(getComputedStyle(t).transform);
  return { a: m.a, d: m.d, shadow: getComputedStyle(t).boxShadow };
});
check(
  'hover 放大（scale > 1）',
  hoverScale.a > 1.01 && hoverScale.d > 1.01,
  `scale=${hoverScale.a.toFixed(3)}`,
);
check('hover 有上浮投影', hoverScale.shadow !== 'none', hoverScale.shadow.slice(0, 40));

// 按压缩小：mousedown 后立刻读（:active 生效）
await page.mouse.down();
await page.waitForTimeout(180);
const activeScale = await page.evaluate(() => {
  const t = document.querySelectorAll('.gallery-tile')[1];
  const m = new DOMMatrixReadOnly(getComputedStyle(t).transform);
  return m.a;
});
await page.mouse.up();
check('按压缩小（scale < 1）', activeScale < 0.99, `scale=${activeScale.toFixed(3)}`);

// 按压测试的 mouse.up 落在格子上 = 一次真实点击 → 详情已经打开，先关掉再继续
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('.detail-close')?.click());
await page.waitForTimeout(600);

// ── ② 详情：放大展开 / 缩回 ────────────────────────────────────
await page.waitForTimeout(300);
const tileBox = await tiles[2].boundingBox();
await tiles[2].click();
// 进场 380ms，Vue 在 animationend 后摘掉 enter-active 类 —— 必须在动画窗口内读
await page.waitForTimeout(120);
const detail = await page.evaluate(() => {
  const overlay = document.querySelector('.detail-overlay');
  if (!overlay) return { err: 'no overlay' };
  const modal = overlay.querySelector('.detail-modal');
  return {
    originX: overlay.style.getPropertyValue('--detail-origin-x'),
    originY: overlay.style.getPropertyValue('--detail-origin-y'),
    transformOrigin: getComputedStyle(modal).transformOrigin,
    animation: getComputedStyle(modal).animationName,
  };
});
const expectX = Math.round(tileBox.x + tileBox.width / 2);
const expectY = Math.round(tileBox.y + tileBox.height / 2);
check('详情已打开', !detail.err, JSON.stringify(detail).slice(0, 120));
check(
  '展开原点 = 点中格子的中心',
  detail.originX === `${expectX}px` && detail.originY === `${expectY}px`,
  `origin=${detail.originX},${detail.originY} 期望=${expectX}px,${expectY}px`,
);
check(
  '弹窗 transform-origin 用了该原点',
  detail.transformOrigin.startsWith(`${expectX}px ${expectY}px`),
  detail.transformOrigin,
);
check('进场动画 = 放大展开', /cloudDetailZoomIn/.test(detail.animation), detail.animation);

await page.evaluate(() => document.querySelector('.detail-close')?.click());
// 退场 220ms：读「离场中」的动画名 + 之后确实移除
await page.waitForTimeout(90);
const leaving = await page.evaluate(() => {
  const overlay = document.querySelector('.detail-overlay');
  if (!overlay) return { gone: true };
  const modal = overlay.querySelector('.detail-modal');
  return {
    leavingClass: overlay.classList.contains('cloud-detail-leave-active'),
    animation: getComputedStyle(modal).animationName,
  };
});
await page.waitForTimeout(500);
const closed = await page.evaluate(() => !document.querySelector('.detail-overlay'));
check(
  '退场动画 = 缩回',
  leaving.leavingClass && /cloudDetailZoomOut/.test(leaving.animation || ''),
  JSON.stringify(leaving),
);
check('退场结束后弹窗已移除', closed);

// ── ③ 切换：tab 过渡 + 捏合落定 ────────────────────────────────
await page.evaluate(() => {
  const item = [...document.querySelectorAll('.cloud-bottom-nav-item')].find(
    (b) => b.textContent.trim() === '设置',
  );
  item?.click();
});
// 进场 320ms：同样在动画窗口内读
await page.waitForTimeout(120);
const viewEnter = await page.evaluate(() => ({
  seen: window.__seen.viewEntering,
  animation: getComputedStyle(document.querySelector('.cloud-main')).animationName,
}));
check('tab 切换触发进场过渡类', viewEnter.seen > 0, JSON.stringify(viewEnter));
check(
  'tab 进场动画名 = cloudViewEnter',
  /cloudViewEnter/.test(viewEnter.animation),
  viewEnter.animation,
);

// 回到内容档，再捏合切列
await page.evaluate(() => {
  const item = [...document.querySelectorAll('.cloud-bottom-nav-item')].find(
    (b) => b.textContent.trim() === '内容',
  );
  item?.click();
});
await page.waitForTimeout(3000);
// ⚠️ 观察器必须在这时候重装：切 tab 会让内容档整体 v-else 重建，
//    之前那个 MutationObserver 盯的是已被卸载的旧网格节点（首轮实测 seen=0 的假红）。
await page.evaluate(() => {
  window.__seen.settling = 0;
  const grid = document.querySelector('.album-tile-grid');
  if (grid) {
    new MutationObserver(() => {
      if (grid.classList.contains('is-settling')) window.__seen.settling += 1;
    }).observe(grid, { attributes: true, attributeFilter: ['class'] });
  }
});
await page.evaluate(() => {
  const el = document.querySelector('.album-gallery-section');
  el?.dispatchEvent(
    new WheelEvent('wheel', { ctrlKey: true, deltaY: -120, bubbles: true, cancelable: true }),
  );
});
await page.waitForTimeout(120);
const settle = await page.evaluate(() => ({
  seen: window.__seen.settling,
  animation: getComputedStyle(document.querySelector('.album-tile-grid')).animationName,
  columns: getComputedStyle(document.querySelector('.album-tile-grid')).gridTemplateColumns.split(
    ' ',
  ).length,
}));
check('切列触发落定回弹类', settle.seen > 0, JSON.stringify(settle));
check('落定动画名 = cloudAlbumSettle', /cloudAlbumSettle/.test(settle.animation), settle.animation);

const failed = results.filter((r) => !r.pass);
console.log(`\n合计 ${results.length} 条，失败 ${failed.length} 条`);
await browser.close();
process.exit(failed.length ? 1 : 0);
