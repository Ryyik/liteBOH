import { chromium } from 'playwright';

// 竖屏发帖「选图反馈口径」探针（2026-10-02）
//
// 产品口径（2026-10-02 拍板）：选图→发布之间保持安静，不给常驻过程反馈（无状态徽章 /
// 无进度文案）；只有「卡顿」才给一次性提示 —— 选图后 4s 本批就绪不足一半时写一条底部
// 状态行「图片正在后台处理，可先编辑文字，发布时会自动等待」，全部 settle 后清除。
// 配套性能修复（P1）：① 选图先渲染一帧再启动模型预载/压缩；② 缩略图 img 无 loading=lazy；
// ③ 上传完成后编辑器 url 保留 blob（远端写 uploadedUrl，发布快照归一）。
//
// 断言（反证敏感对标注 *）：
//   A1  首帧：选图后 ≤1500ms 网格出现 <img src^="blob:">
//   A2* 无 lazy：网格 img 不带 loading="lazy"（旧行为有 lazy → 红）
//   A3  安静：选图后 3s 内底部状态行不可见（防常驻反馈回流；旧行为同样安静，非反证锚点）
//   A4* 卡顿提示：大图 + 云端审核不可达（route abort）下，4s 观察器写一次性提示
//       （旧行为无观察器 → 红；阈值改大 → 红）
//   A5  提示为一次性底部状态行，不是图片徽章（徽章仅 failed 出现；此处断言选图初期无徽章）
//
// 运行：node scripts/probes/probe-composer-image-stall.mjs（需 dev server 5173）

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
});

let passed = 0;
let failed = 0;
const assert = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// 云端图片审核（api-key-vault 的 moderation-image 行）直接打线上 Edge；
// 探针将其断流——但不是立刻 abort：延迟 6s 再断，模拟真实「云端不可达=长时间等待」
// （秒败会让图片过早 failed settle，观察器判定「已过半就绪」，卡顿提示永远不触发）。
await page.route('**/functions/v1/api-key-vault*', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 6000));
  await route.abort('failed');
});
// Cloudinary 上传同样断流：即使兜底放行，上传也不会成功（探针不等上传完成）
await page.route('**/api.cloudinary.com/**', (route) => route.abort('failed'));

// ⚠️ 入口（2026-10-02 IA 改版后）：独立 /#/forum 路由已被重定向到 /#/user-space?tab=posts，
// 论坛是首页（/#/）的内嵌形态，竖屏发帖 FAB 只在首页出现（isForumComposerFabVisible:
// route.path !== '/' → false）。因此探针从首页进入。
// 预置 boh-home-gate-passed（dev 裸 key，值为时间戳）跳过首屏开场画。
await page.addInitScript(() => {
  try {
    window.localStorage.setItem('boh-home-gate-passed', String(Date.now()));
  } catch {
    /* ignore */
  }
});
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 注入登录态（与 probe-mobile-composer 相同：运行时改 Pinia state）
await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app && app.config.globalProperties.$pinia;
  if (!pinia) throw new Error('pinia not found');
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) {
    s.userInfo.username = '探针用户';
    s.userInfo.id = '';
    s.userInfo.avatarUrl = '';
  }
});
await page.waitForTimeout(800);

// 打开竖屏发帖器
const fab = page.locator('.mobile-compose-fab').first();
await fab.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
assert('打开入口 FAB 可见', await fab.isVisible().catch(() => false));
await fab.click();
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
await page.waitForTimeout(600);

// 在页面里生成一张高噪声大图（2000×2000，压缩器压不动 → 压缩段真实耗时 >4s）
const bigPng = await page.evaluate(async () => {
  const size = 2000;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 8) & 0xff;
  };
  for (let i = 0; i < imgData.data.length; i += 4) {
    imgData.data[i] = rand();
    imgData.data[i + 1] = rand();
    imgData.data[i + 2] = rand();
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
});

// A1/A2：选图 → 首帧
const t0 = Date.now();
await page.setInputFiles('.mobile-composer-overlay .post-image-input', {
  name: 'probe-big-noise.png',
  mimeType: 'image/png',
  buffer: Buffer.from(bigPng),
});

const gridImg = page.locator('.mobile-composer-overlay .post-image-preview-grid img').first();
await gridImg.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
const firstFrameMs = Date.now() - t0;
assert(
  'A1 选图后缩略图上屏（blob 预览）',
  await gridImg.isVisible().catch(() => false),
  `${firstFrameMs}ms`,
);
const lazyAttr = await gridImg.getAttribute('loading').catch(() => undefined);
assert('A2 缩略图 img 无 loading=lazy', lazyAttr === null, `loading=${String(lazyAttr)}`);

// A3/A5：3s 内保持安静（无底部状态行）；徽章只允许 failed 态出现
await page.waitForTimeout(3000);
const statusRowVisible = await page
  .locator('.mobile-composer-overlay .post-image-upload-status')
  .isVisible()
  .catch(() => false);
assert('A3 选图 3s 内底部状态行安静（无常驻反馈）', !statusRowVisible);
const badgeStates = await page.evaluate(() => {
  return Array.from(
    document.querySelectorAll('.mobile-composer-overlay .post-image-status-badge'),
  ).map((el) => (el.textContent || '').trim());
});
// 徽章若出现，必须是失败徽章（「未通过/处理失败/上传失败」）——处理中徽章已被产品口径禁止
const badgeIsFailedOnly = badgeStates.every((t) => /未通过|处理失败|上传失败/.test(t));
assert(
  'A5 徽章仅 failed 态可见（处理中无徽章）',
  badgeIsFailedOnly,
  `badges=${JSON.stringify(badgeStates)}`,
);

// A4：4s 观察器 → 一次性卡顿提示（云端已断流 + 大图压缩 >4s ⇒ 本批不可能过半就绪）
const stallRow = page.locator('.mobile-composer-overlay .post-image-upload-status');
await stallRow.waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
const stallText = (await stallRow.textContent().catch(() => '')) || '';
assert(
  'A4 卡顿提示出现（4s 观察器，一次性底部状态行）',
  stallText.includes('图片正在后台处理'),
  `text="${stallText.trim().slice(0, 40)}"`,
);

await page.screenshot({ path: 'debug-screenshots/probe-composer-image-stall.png' });
console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
console.log(`RESULT: ${passed} pass / ${failed} fail`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
