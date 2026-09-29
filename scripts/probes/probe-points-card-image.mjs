/**
 * probe-points-card-image.mjs —— 方块积分卡「自定义卡面」裂图回归探针（7 断言 + 1 观察项）
 *
 * 事故（2026-09-29）：`profiles.points_card_image_url` / `points_card_presets.image_url`
 * 存的是 Cloudinary **原始地址** `https://res.cloudinary.com/<cloud>/image/upload/...`，
 * 中国大陆实测不可达（curl → http 000）；渲染端直接绑进 `<img src>` → 裂图。
 * 同类根因 2026-09-29 已在活动页 id=16/17 上咬过一次（见 `utils/db-image-url.js` 头注）。
 *
 * 本探针不 mock 网络，是**真 CDN** 的端到端验证：注入伪造登录态后把卡面 URL 强设为
 * 库里真实那条 Cloudinary 直链，看渲染出的 `src` 是否被改写、以及浏览器是否真的把图 load 出来。
 *
 * 两个已知边界：
 *   1. 伪造登录态没有 JWT，`points_card_presets` 走 RLS 会返回空 → 预设缩略图那两条断言在
 *      无真实会话时会 SKIP（不算失败）。用真实账号跑时会计入。
 *   2. 探针只覆盖「自定义」皮肤；blank / cats 用的是本地打包资源，不存在该问题。
 *
 * 依赖：本地 dev server `vite --port 5173 --host ::`（注意 vite 默认只绑 IPv6）。
 * 跑法：node scripts/probes/probe-points-card-image.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

// 库里 points_card_presets 的真实一条（user 00ac36b4 = 本仓探针惯用的伪造账号）
const RAW_CLOUDINARY_URL =
  'https://res.cloudinary.com/dkqae7j1m/image/upload/v1786894948/boh-points-cards/m6walmpg0whumxmpe4hv.png';
const FAKE_USER_ID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};
const skip = (name, detail = '') => console.log(`SKIP  ${name}${detail ? `  -- ${detail}` : ''}`);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const failedImages = [];
const cloudinaryRequests = [];
page.on('requestfailed', (req) => {
  if (req.resourceType() === 'image') failedImages.push(req.url().slice(0, 120));
});
page.on('request', (req) => {
  if (req.resourceType() === 'image' && req.url().includes('res.cloudinary.com')) {
    cloudinaryRequests.push(req.url().slice(0, 130));
  }
});

await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(900);

// 伪造登录 + 强设自定义卡面为真实 Cloudinary 直链
await page.evaluate(
  ({ userId, rawUrl }) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: userId,
      username: 'Ryyik',
      role: 'user',
      points: 14,
      pointsCardSkin: 'custom',
      pointsCardImageUrl: rawUrl,
    });
  },
  { userId: FAKE_USER_ID, rawUrl: RAW_CLOUDINARY_URL },
);
await page.waitForTimeout(2500);

const readCardImage = (selector) =>
  page.evaluate((sel) => {
    const img = document.querySelector(sel);
    if (!img) return null;
    return {
      src: img.getAttribute('src') || '',
      currentSrc: img.currentSrc || '',
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    };
  }, selector);

const assertCard = (label, info) => {
  check(
    `${label}：渲染出自定义卡面 <img>`,
    Boolean(info),
    info ? '' : '未找到 .points-card-custom-image',
  );
  if (!info) {
    check(`${label}：src 不含 res.cloudinary.com`, false, 'PREREQ FAILED');
    check(`${label}：图片真的加载成功`, false, 'PREREQ FAILED');
    return;
  }
  check(
    `${label}：src 不含 res.cloudinary.com（大陆不可达域名）`,
    !info.src.includes('res.cloudinary.com'),
    info.src,
  );
  check(
    `${label}：图片真的加载成功（naturalWidth > 0）`,
    info.complete && info.naturalWidth > 0,
    `complete=${info.complete} naturalWidth=${info.naturalWidth}`,
  );
};

/* ---------- 1. 概览 tab ---------- */
const overview = await readCardImage('.ah-overview-points-card .points-card-custom-image');
assertCard('概览 tab', overview);
if (overview?.src) {
  check(
    '概览 tab：src 指向自建 CDN',
    /^https:\/\/cdn\.blockofhome\.cn\//.test(overview.src),
    overview.src,
  );
} else {
  check('概览 tab：src 指向自建 CDN', false, 'PREREQ FAILED');
}
await page.screenshot({ path: `${OUT}/points-card-image-overview.png` });

/* ---------- 2. 装扮 tab（同一个组件在另一个宿主里的渲染） ---------- */
const decorTab = page.locator('.segment-tab', { hasText: '装扮' }).first();
if (await decorTab.count()) {
  await decorTab.click();
  await page.waitForTimeout(2000);
}
const decor = await readCardImage('.ah-cards-panel .points-card-custom-image');
assertCard('装扮 tab', decor);
await page.screenshot({ path: `${OUT}/points-card-image-decor.png` });

// 卡面本体截图（导航是常驻悬浮岛，会遮住页面上部，所以对元素单独截）
const cardBox = page.locator('.ah-cards-panel .points-card').first();
if (await cardBox.count()) {
  await cardBox.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await cardBox.screenshot({ path: `${OUT}/points-card-image-decor-card.png` });
}

/* ---------- 3. 装扮 tab 的自定义预设缩略图（需真实会话，无则 SKIP） ---------- */
const presetCount = await page.locator('.ah-card-preset-select img').count();
if (!presetCount) {
  skip(
    '预设缩略图：src 不含 res.cloudinary.com',
    '无真实会话 → points_card_presets 被 RLS 挡空，改用真实账号跑',
  );
  skip('预设缩略图：加载成功', '同上');
} else {
  const preset = await readCardImage('.ah-card-preset-select img');
  check(
    '预设缩略图：src 不含 res.cloudinary.com',
    !preset.src.includes('res.cloudinary.com'),
    preset.src,
  );
  check(
    '预设缩略图：加载成功（naturalWidth > 0）',
    preset.complete && preset.naturalWidth > 0,
    `complete=${preset.complete} naturalWidth=${preset.naturalWidth}`,
  );
}
await page.screenshot({ path: `${OUT}/points-card-image-presets.png`, fullPage: true });

/* ---------- 网络侧观察（不计入断言） ---------- */
console.log('\n--- 网络侧观察 ---');
console.log(
  '发往 res.cloudinary.com 的图片请求:',
  cloudinaryRequests.length ? cloudinaryRequests : '无',
);
console.log('加载失败的图片请求:', failedImages.length ? failedImages.slice(0, 6) : '无');

await browser.close();

const total = results.length;
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
