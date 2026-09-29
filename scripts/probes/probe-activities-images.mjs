/**
 * probe-activities-images.mjs —— 活动页（/activities-wall 活动 tab）封面图可用性探针
 *
 * 背景（2026-09-29）：activities.image 混存两种形态——
 *   ① `@/assets/images/xxx.webp`（本地别名，id 1~15）
 *   ② `https://res.cloudinary.com/...`（id 16/17，最新两条，恰好排在最前）
 * 形态 ② 未经 CDN 改写时，`res.cloudinary.com` 在大陆不可达 → 页面顶部两张卡裂图。
 *
 * 断言（对每张 `.activity-card__img`）：
 *   A1 有 src 且不是 `@/` 别名残留（别名没被解析 = 必然裂图）
 *   A2 naturalWidth > 0（真的解码出来了，不是空白占位）
 *   A3 凡原始值来自 Cloudinary 的卡，src 必须已改写到自建 CDN 主机
 *   A4 没有任何一张卡停留在「加载中但从未完成」的状态
 *
 * 用法：npx vite --port 5178 --strictPort  然后  node scripts/probes/probe-activities-images.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5178';
const CDN_HOST = 'cdn.blockofhome.cn';

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`);
  }
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

// 收集页面实际发出的图片请求与失败，作为 A2 的旁证
const failedRequests = [];
page.on('requestfailed', (req) => {
  if (req.resourceType() === 'image')
    failedRequests.push(`${req.url()} <- ${req.failure()?.errorText || ''}`);
});

await page.goto(`${BASE}/#/activities-wall`, { waitUntil: 'domcontentloaded' });
// 等卡片渲染（数据来自 Supabase，给足往返时间）
await page.waitForSelector('.activity-card__img', { timeout: 20000 });
// 懒加载图需要滚动才会请求
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(2500);

const report = await page.evaluate(async () => {
  const imgs = Array.from(document.querySelectorAll('.activity-card__img'));
  const out = [];
  for (const img of imgs) {
    const card = img.closest('.activity-card');
    out.push({
      title: card?.querySelector('.activity-card__title')?.textContent?.trim() || '(无标题)',
      src: img.getAttribute('src') || '',
      currentSrc: img.currentSrc || '',
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
    });
  }
  return out;
});

await page.screenshot({ path: 'debug-screenshots/probe-activities-images.png', fullPage: false });
await browser.close();

console.log(`\n活动页封面图探针 —— 共 ${report.length} 张卡\n`);

check(report.length > 0, 'A0 页面上存在活动卡片', `实际 ${report.length} 张`);

const aliasLeaks = report.filter(
  (r) =>
    r.src.startsWith('@/') || (r.src.includes('assets/images/') === false && r.src.startsWith('@')),
);
check(
  aliasLeaks.length === 0,
  'A1 没有未解析的 @/ 别名残留',
  aliasLeaks.map((r) => `${r.title}: ${r.src}`).join(' | '),
);

const emptySrc = report.filter((r) => !r.src);
check(emptySrc.length === 0, 'A1b 每张卡都有 src', emptySrc.map((r) => r.title).join(' | '));

const broken = report.filter((r) => !(r.naturalWidth > 0));
check(
  broken.length === 0,
  'A2 全部封面图解码成功（naturalWidth > 0）',
  broken.map((r) => `${r.title} [${r.src.slice(0, 90)}]`).join(' | '),
);

const cloudinaryLeaks = report.filter(
  (r) => /res\.cloudinary\.com/.test(r.src) || /res\.cloudinary\.com/.test(r.currentSrc),
);
check(
  cloudinaryLeaks.length === 0,
  'A3 没有卡仍指向 res.cloudinary.com（未走 CDN 改写）',
  cloudinaryLeaks.map((r) => r.title).join(' | '),
);

const cdnCount = report.filter((r) => r.currentSrc.includes(CDN_HOST)).length;
check(
  cdnCount >= 1,
  `A3b 存在经自建 CDN 提供的封面（实测 ${cdnCount} 张）`,
  '若为 0，说明 CDN 改写链路整体失效',
);

const neverLoaded = report.filter((r) => !r.complete);
check(
  neverLoaded.length === 0,
  'A4 没有卡卡在「未完成加载」',
  neverLoaded.map((r) => r.title).join(' | '),
);

if (failedRequests.length) {
  console.log('\n  图片请求失败明细：');
  for (const line of failedRequests.slice(0, 12)) console.log(`    · ${line}`);
}

console.log(`\n结果：${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
