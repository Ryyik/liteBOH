import { chromium } from 'playwright';
import fs from 'node:fs';

// 生产预览验证探针（vite preview @4173，覆盖 dev 探针覆盖不到的盲区）：
//  1) SW 注册并接管页面（生产 PWA 生效）
//  2) 选图触发模型 chunk（tfjs-vendor/nsfw-weights）真实网络加载 + 真实 WebGL 推理（无 mock 模型）
//  3) SW runtimeCaching 写入 nsfw-model-vendor 缓存
//  4) reload 后二次选图：模型 chunk 0 网络请求（CacheFirst 命中）
//  5) 发帖全链成功（上传/发帖后端 mock，登录态伪造）
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)); });

// 模型 chunk 响应记录：fromServiceWorker=true 表示响应来自 SW（缓存命中或 precache），
// 注意 SW 缓存命中也会触发 response 事件——判断依据是 fromServiceWorker 而非事件有无
const modelChunkRequests = [];
page.on('response', (res) => {
  if (/\/static\/js\/(tfjs-vendor|nsfw-vendor|nsfw-weights)-[A-Za-z0-9_-]+\.js$/i.test(res.url())) {
    let fromSW = false;
    try { fromSW = res.fromServiceWorker(); } catch { /* ignore */ }
    modelChunkRequests.push({ name: res.url().split('/').pop().split('-')[0], fromSW, status: res.status() });
  }
});

// 后端 mock：避免真实网络副作用
await page.route('**/api.cloudinary.com/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({
    secure_url: 'https://res.cloudinary.com/dkqae7j1m/image/upload/v1757280000000/boh-cloud-plus/forum/probe.webp',
    public_id: 'boh-cloud-plus/forum/probe-img-1',
    delete_token: 'probe-delete-token',
    width: 800, height: 600, format: 'webp', resource_type: 'image',
    created_at: new Date().toISOString(), bytes: 12345, eager: []
  })
}));
await page.route('**/rest/v1/**', (route) => {
  const req = route.request();
  const url = req.url();
  if (url.includes('/rest/v1/rpc/create_forum_post_with_images')) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 'probe-post-1', title: 't', content: 'b', status: 'approved', tag: 'daily',
        author_id: 'probe-user', author_username: '测试用户', created_at: new Date().toISOString()
      })
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
await page.route('**/auth/v1/**', (route) => {
  if (route.request().url().includes('/auth/v1/user')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'probe-user' }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
await page.route('**/functions/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

// ===== 1) SW 注册并接管 =====
await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded' });
const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  try {
    await navigator.serviceWorker.ready;
    // 等待接管（首次注册后可能需要一次导航）
    for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) {
      await new Promise(r => setTimeout(r, 250));
    }
    if (!navigator.serviceWorker.controller) { location.reload(); return { supported: true, controlling: false }; }
    return { supported: true, controlling: true };
  } catch (e) { return { supported: true, controlling: false, err: String(e).slice(0, 100) }; }
});
console.log('1) service worker:', JSON.stringify(swReady));
if (swReady.supported && !swReady.controlling) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
}

// 注入登录态
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
  if (pinia.state.value.auth.userInfo) { pinia.state.value.auth.userInfo.username = '测试用户'; pinia.state.value.auth.userInfo.id = 'probe-user'; }
});
await page.waitForTimeout(900);

// 测试图片
const pngB64 = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 800; c.height = 600;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 800, 600);
  g.addColorStop(0, '#ff8800'); g.addColorStop(1, '#0055ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 800, 600);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(${Math.random()*255|0},${Math.random()*255|0},${Math.random()*255|0},0.3)`;
    ctx.fillRect(Math.random()*800|0, Math.random()*600|0, 6, 6);
  }
  return c.toDataURL('image/png').split(',')[1];
});
const pngPath = '/tmp/probe-preview-img.png';
fs.writeFileSync(pngPath, Buffer.from(pngB64, 'base64'));

// ===== 2) 首次选图：真实模型加载 + 推理 =====
await page.locator('.mobile-compose-fab').first().click();
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 10000 });
await page.waitForTimeout(400);
const firstSelectionAt = Date.now();
await page.setInputFiles('.post-image-input', pngPath);

// 等检测+上传走完（真实推理，给 30s）
let firstRoundReady = false;
for (let i = 0; i < 120; i++) {
  const cacheState = await page.evaluate(async () => {
    try {
      const names = await caches.keys();
      const has = names.includes('nsfw-model-vendor');
      let entries = 0;
      if (has) {
        const cache = await caches.open('nsfw-model-vendor');
        entries = (await cache.keys()).length;
      }
      return { has, entries };
    } catch { return { has: false, entries: 0 }; }
  });
  if (cacheState.entries >= 2) { // tfjs-vendor + nsfw-weights 均已缓存
    firstRoundReady = true;
    console.log(`2) model chunks cached after ${(Date.now() - firstSelectionAt) / 1000 | 0}s, cache entries:`, cacheState.entries);
    break;
  }
  await page.waitForTimeout(250);
}
if (!firstRoundReady) console.log('2) WARN: nsfw-model-vendor cache entries < 2 within 30s');
console.log('2) model chunk responses (first round):', JSON.stringify(modelChunkRequests));
await page.screenshot({ path: 'debug-screenshots/probe-preview-first-round.png' });

// ===== 3) 发帖全链（生产构建 + 真模型 + mock 后端）=====
await page.fill('.post-title-input', '生产预览验证');
await page.fill('.post-content-input', '生产构建下 SW 缓存与发帖全链路探针。');
await page.waitForTimeout(300);
await page.locator('.mobile-composer-overlay .mobile-composer-submit').click();
let publishOk = false;
for (let i = 0; i < 80; i++) {
  const card = await page.evaluate(() => !!document.querySelector('.optimistic-post-card'));
  if (!card) { publishOk = true; break; }
  await page.waitForTimeout(250);
}
console.log('3) publish succeeded on production build:', publishOk);

// ===== 4) reload 后二次选图：模型 chunk 应全部由 SW 缓存响应（fromServiceWorker=true）=====
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const requestsBeforeSecondRound = modelChunkRequests.length;
await page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
  if (pinia.state.value.auth.userInfo) { pinia.state.value.auth.userInfo.username = '测试用户'; pinia.state.value.auth.userInfo.id = 'probe-user'; }
});
await page.waitForTimeout(700);
await page.locator('.mobile-compose-fab').first().click();
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 10000 });
await page.setInputFiles('.post-image-input', pngPath);
// 等检测完成（缓存命中，推理 <5s），收集模型 chunk 响应来源
for (let i = 0; i < 40; i++) {
  if (modelChunkRequests.length > requestsBeforeSecondRound + 2) break; // 等满 3 条
  await page.waitForTimeout(250);
}
const secondRound = modelChunkRequests.slice(requestsBeforeSecondRound);
const allFromSW = secondRound.length > 0 && secondRound.every((r) => r.fromSW);
console.log('4) second round model chunk responses:', JSON.stringify(secondRound));
console.log('4) all served by SW cache (CacheFirst hit):', allFromSW);
await page.screenshot({ path: 'debug-screenshots/probe-preview-second-round.png' });

console.log('page errors:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
