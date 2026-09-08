import { chromium } from 'playwright';
import fs from 'node:fs';

// 发帖修复验证探针（对应提交 a180938 引入的三个回归）：
//  A) 选图/预热期间图片卡片不得出现转圈 spinner 与「优化中/待审核」processing 徽章
//  B) 点发送后进度不得死停 2%（修复后应推进到 ~30% 附近再因 mock 失败）
//  C) 失败后点「重试」必须重建管线并最终发帖成功（修复前：旧 failed entry 残留 → 秒败循环）
// 手段：CDN 模型请求先 404(延迟3s) → 失败；重试前放行 CDN 走真模型；Cloudinary/Supabase 全 mock。

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

// ---- mock：Cloudinary 上传 —— 先延迟 2s 后 500（制造观察窗口 + 失败）；重试放行后返回成功 ----
let cloudinaryFailFirst = true;
await page.route('**/api.cloudinary.com/**', async (route) => {
  if (cloudinaryFailFirst) {
    await new Promise(r => setTimeout(r, 2000));
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'probe injected upload failure' } }) });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      secure_url: 'https://res.cloudinary.com/dkqae7j1m/image/upload/v1757280000000/boh-cloud-plus/forum/probe.webp',
      public_id: 'boh-cloud-plus/forum/probe-img-1',
      delete_token: 'probe-delete-token',
      width: 800, height: 600, format: 'webp', resource_type: 'image',
      created_at: new Date().toISOString(), bytes: 12345, eager: []
    })
  });
});
// ---- mock：Supabase REST/RPC ----
await page.route('**/rest/v1/**', (route) => {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  if (url.includes('/rest/v1/forum_posts') && method === 'POST') {
    return route.fulfill({
      status: 201, contentType: 'application/json',
      headers: { prefer: '' },
      body: JSON.stringify([{
        id: 'probe-post-1', title: 't', content: 'b', status: 'approved', tag: 'daily',
        author_id: 'probe-user', author_username: '测试用户',
        created_at: new Date().toISOString()
      }])
    });
  }
  if (url.includes('/rest/v1/rpc/create_forum_post_with_images')) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 'probe-post-1', title: 't', content: 'b', status: 'approved', tag: 'daily',
        author_id: 'probe-user', author_username: '测试用户',
        created_at: new Date().toISOString()
      })
    });
  }
  if (url.includes('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
// 模型已本地化（npm import），无 jsdelivr 请求，无需 CDN mock。
// 失败注入改为 Cloudinary 首次 500（网络类），Phase C 放行后自动重试/重试按钮可走通全链。

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app && app.config.globalProperties.$pinia;
  if (!pinia) throw new Error('pinia not found');
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) { s.userInfo.username = '测试用户'; s.userInfo.id = 'probe-user'; }
});
await page.waitForTimeout(900);

// 生成 800x600 真实尺寸 PNG（确保 shouldCompress=true，会进入压缩/优化分支）
const pngB64 = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 800; c.height = 600;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 800, 600);
  g.addColorStop(0, '#ff8800'); g.addColorStop(1, '#0055ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 600);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${Math.random()*255|0},${Math.random()*255|0},${Math.random()*255|0},0.35)`;
    ctx.fillRect(Math.random()*800|0, Math.random()*600|0, 6, 6);
  }
  return c.toDataURL('image/png').split(',')[1];
});
const pngPath = '/tmp/probe-composer-img.png';
fs.writeFileSync(pngPath, Buffer.from(pngB64, 'base64'));
// 第二张图（青→紫渐变）：A2 双图场景——压缩 2 路并发池与检测串行解耦的正确性验证
const png2B64 = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 800; c.height = 600;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 600);
  g.addColorStop(0, '#00ccaa'); g.addColorStop(1, '#7733dd');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 600);
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = `rgba(${Math.random()*255|0},${Math.random()*255|0},${Math.random()*255|0},0.4)`;
    ctx.beginPath();
    ctx.arc(Math.random()*800|0, Math.random()*600|0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return c.toDataURL('image/png').split(',')[1];
});
const png2Path = '/tmp/probe-composer-img2.png';
fs.writeFileSync(png2Path, Buffer.from(png2B64, 'base64'));

// 打开发帖器
await page.locator('.mobile-compose-fab').first().click();
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
await page.waitForTimeout(500);

// ===== Phase A：选图（双图，A2 并发流水），观察窗口内轮询断言「无加载态」 =====
const selectionStartedAt = Date.now();
await page.setInputFiles('.post-image-input', [pngPath, png2Path]);
const sawSpinner = { v: false };
const sawProcessingBadge = { v: false };
const sawFailedBadge = { v: false };
for (let i = 0; i < 14; i++) { // ~3.5s 窗口
  const st = await page.evaluate(() => ({
    spinner: !!document.querySelector('.mobile-composer-overlay .post-image-card-spinner'),
    procBadge: !!document.querySelector('.mobile-composer-overlay .post-image-status-badge.processing'),
    failBadge: !!document.querySelector('.mobile-composer-overlay .post-image-status-badge.failed'),
    procClass: !!document.querySelector('.mobile-composer-overlay .post-image-preview-item.is-processing')
  }));
  if (st.spinner || st.procBadge || st.procClass) { sawSpinner.v = sawSpinner.v || st.spinner; sawProcessingBadge.v = true; }
  if (st.failBadge) sawFailedBadge.v = true;
  await page.waitForTimeout(250);
}
await page.screenshot({ path: 'debug-screenshots/probe-fix-phase-a-composer.png' });
console.log('A) spinner during pipeline:', sawSpinner.v);
console.log('A) processing badge during pipeline:', sawProcessingBadge.v);
console.log('A) failed badge visible in window (may be false if upload retries still pending):', sawFailedBadge.v);

// ===== Phase B：填内容 → 发送 → 观察进度推进与失败 =====
await page.fill('.post-title-input', '发帖修复探针');
await page.fill('.post-content-input', '验证进度推进与重试有效的自动化探针帖子内容。');
await page.waitForTimeout(300);
await page.locator('.mobile-composer-overlay .mobile-composer-submit').click();
await page.waitForTimeout(400);

const progressSamples = [];
let failedSeen = false;
for (let i = 0; i < 60; i++) { // ~15s
  const st = await page.evaluate(() => {
    const card = document.querySelector('.optimistic-post-card');
    if (!card) return { card: false };
    const badge = card.querySelector('.optimistic-badge');
    const bar = card.querySelector('.optimistic-progress-track i');
    return {
      card: true,
      badge: badge ? badge.textContent.trim() : '',
      pct: bar ? parseFloat(bar.style.width) || 0 : 0
    };
  });
  if (!st.card) break;
  progressSamples.push(st.pct);
  if (st.badge.includes('发送失败')) { failedSeen = true; break; }
  await page.waitForTimeout(250);
}
const maxProgress = Math.max(0, ...progressSamples);
console.log('B) progress samples (first 12):', progressSamples.slice(0, 12).join(','));
console.log('B) max progress reached:', maxProgress, '(fix passes if > 2; regression was stuck at 2)');
console.log('B) failed state surfaced:', failedSeen);
await page.screenshot({ path: 'debug-screenshots/probe-fix-phase-b-failed.png' });

// ===== Phase C：放行 CDN（真模型）→ 点重试 → 期望最终发帖成功 =====
if (failedSeen) {
  cloudinaryFailFirst = false; // 放行上传，验证重试走通全链
  await page.locator('.optimistic-post-card .optimistic-btn.retry').first().click();
  let successSeen = false;
  let retryStuckAtFailure = false;
  const samplesC = [];
  for (let i = 0; i < 240; i++) { // ~60s（模型下载+检测）
    const st = await page.evaluate(() => {
      const card = document.querySelector('.optimistic-post-card');
      if (!card) return { card: false };
      const badge = card.querySelector('.optimistic-badge');
      const bar = card.querySelector('.optimistic-progress-track i');
      return { card: true, badge: badge ? badge.textContent.trim() : '', pct: bar ? parseFloat(bar.style.width) || 0 : 0 };
    });
    samplesC.push(st.card ? `${st.badge}@${st.pct}` : 'gone');
    if (!st.card) { successSeen = true; break; } // 乐观卡移除 = 发帖成功（removeItem）
    if (st.badge.includes('发送成功')) { successSeen = true; break; }
    if (st.badge.includes('发送失败')) { /* 等待中若再次失败继续观察 */ }
    await page.waitForTimeout(250);
  }
  console.log('C) retry progress samples (every 8th):', samplesC.filter((_, i) => i % 8 === 0).slice(0, 12).join(' | '));
  console.log('C) retry ultimately succeeded:', successSeen, '(fix passes if true; regression = instant re-fail loop)');
  retryStuckAtFailure = samplesC.length > 4 && samplesC.every(s => s.includes('发送失败'));
  console.log('C) stuck in instant-fail loop (regression signature):', retryStuckAtFailure);
  await page.screenshot({ path: 'debug-screenshots/probe-fix-phase-c-retry.png' });
} else {
  console.log('C) skipped: phase B did not fail (unexpected with CDN blocked)');
}

console.log('page errors:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
