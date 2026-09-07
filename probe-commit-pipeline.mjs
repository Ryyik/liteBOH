import { chromium } from 'playwright';

// 提交 a180938 验证探针：Beta5 选图预热管线（压缩→检测→3路并发上传）
// 验证点：
//  1) 选 3 张图后后台预热管线自动跑完，状态徽标逐张变为「已就绪」(approved)
//  2) Cloudinary 上传真实发生（记录上传请求数），并观察并发情况
//  3) 压缩产物为 WebP（从上传请求体中检测 image/webp / .webp 文件名）
//  4) 移除一张图 → 走取消/清理路径，无报错
//  5) 关闭发帖器 → clearPostImages 清理路径，无 pageerror
const TEST_IMAGES = [
  'debug-screenshots/03-login.png',
  'debug-screenshots/ring-redo-desktop.png',
  'debug-screenshots/aw-activities.png',
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
const logs = [];
const failedRequests = [];
const uploadRequests = []; // { ts, hasWebpHint }
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 300)));
page.on('console', (m) => {
  const text = m.text();
  if (m.type() === 'error') errors.push('console: ' + text.slice(0, 200));
  logs.push(`[${m.type()}] ${text.slice(0, 300)}`);
});
page.on('requestfailed', (req) => {
  failedRequests.push(`${req.method()} ${req.url().slice(0, 160)} :: ${req.failure()?.errorText}`);
});

page.on('request', (req) => {
  const url = req.url();
  if (/cloudinary\.com\/.*\/image\/upload/.test(url) && req.method() === 'POST') {
    let hasWebpHint = false;
    try {
      const buf = req.postDataBuffer();
      if (buf) {
        const head = buf.subarray(0, 4096).toString('latin1');
        hasWebpHint = /image\/webp|\.webp/i.test(buf.toString('latin1').slice(0, 512 * 1024)) || /image\/webp/i.test(head);
      }
    } catch { /* body 不可读则跳过 */ }
    uploadRequests.push({ ts: Date.now(), hasWebpHint });
  }
});

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 注入登录态
await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app && app.config.globalProperties.$pinia;
  if (!pinia) throw new Error('pinia not found');
  pinia.state.value.auth.isLoggedIn = true;
});
await page.waitForTimeout(800);

// 打开竖屏发帖器
const fab = page.locator('.mobile-compose-fab').first();
if (!(await fab.isVisible().catch(() => false))) {
  console.log('RESULT: FAIL - fab 不可见');
  await browser.close();
  process.exit(1);
}
await fab.click();
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
await page.waitForTimeout(500);

// 注入 3 张图
await page.setInputFiles('input.post-image-input[multiple]', TEST_IMAGES.map(p => p));
const t0 = Date.now();
console.log('images injected at t=0, waiting for pipeline...');

// 轮询状态徽标，直到全部 approved（已就绪）或超时 90s
let snapshots = [];
let allReady = false;
let retried = false;
let retriedAt = 0;
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(1000);
  const state = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.post-image-preview-item')];
    // 从 Vue 组件树读取图片状态（含 uploadError）
    let imgs = [];
    try {
      let comp = document.querySelector('.mobile-composer-overlay')?.__vueParentComponent;
      for (let hop = 0; hop < 8 && comp; hop++) {
        const props = comp.props || {};
        const candidate = props.postImages || props.images;
        if (Array.isArray(candidate) && candidate.length) { imgs = candidate; break; }
        comp = comp.parent;
      }
    } catch { /* ignore */ }
    const vueState = imgs.map((im) => ({
      status: im?.uploadStatus,
      label: im?.uploadStatusLabel,
      error: im?.uploadError ? String(im.uploadError).slice(0, 200) : null,
      name: im?.name || im?.file?.name || null,
    }));
    return {
      dom: items.map((el) => {
        const badge = el.querySelector('.post-image-status-badge');
        return { cls: badge ? badge.className.replace('post-image-status-badge', '').trim() : 'none', label: badge ? badge.textContent.trim() : '(无徽标)' };
      }),
      vueState,
    };
  });
  snapshots.push({ t: ((Date.now() - t0) / 1000).toFixed(0), state: state.dom, vueState: state.vueState });
  if (state.vueState.length) console.log(`t=${snapshots[snapshots.length-1].t}s vue:`, JSON.stringify(state.vueState));
  if (state.dom.length === 3 && state.dom.every(s => s.cls === 'approved')) { allReady = true; break; }
  if (state.dom.some(s => s.cls === 'failed') && !retried) {
    retried = true;
    retriedAt = i;
    console.log(`t=${snapshots[snapshots.length-1].t}s 检测到失败，点击「重试」按钮验证恢复路径...`);
    const retryBtn = page.locator('.post-image-retry-btn').first();
    if (await retryBtn.isVisible().catch(() => false)) {
      await retryBtn.click();
      await page.waitForTimeout(800);
    } else {
      console.log('重试按钮不可见！');
    }
  }
  if (state.dom.some(s => s.cls === 'failed') && retried && (i - retriedAt) > 20) break;
}

console.log('=== 状态演变（抽样） ===');
for (let i = 0; i < snapshots.length; i += 5) {
  const s = snapshots[i];
  console.log(`t=${s.t}s:`, s.state.map(x => `${x.cls}:${x.label}`).join(' | '));
}
const last = snapshots[snapshots.length - 1];
console.log(`t=${last.t}s(最终):`, last.state.map(x => `${x.cls}:${x.label}`).join(' | '));

// 上传请求统计与并发观察
console.log('=== 上传请求 ===');
console.log('cloudinary upload POST 数:', uploadRequests.length);
console.log('webp 痕迹:', uploadRequests.map(r => r.hasWebpHint));
if (uploadRequests.length >= 2) {
  const gaps = [];
  for (let i = 1; i < uploadRequests.length; i++) gaps.push(uploadRequests[i].ts - uploadRequests[i - 1].ts);
  console.log('相邻上传请求间隔(ms):', gaps.join(', '), gaps.some(g => g < 400) ? '→ 存在并发' : '→ 疑似全串行');
}

await page.screenshot({ path: 'debug-screenshots/probe-pipeline-ready.png' });

// 移除第 1 张图（走 removePostImage → cancel/cleanup 路径）
const removeBtn = page.locator('.post-image-preview-item .post-image-remove-btn').first();
await removeBtn.click();
await page.waitForTimeout(1500);
const afterRemove = await page.evaluate(() => document.querySelectorAll('.post-image-preview-item').length);
console.log('移除后剩余图片卡:', afterRemove);

// 关闭发帖器（clearPostImages 清理路径）
const closeBtn = page.locator('.mobile-composer-overlay [class*="close"], .mobile-composer-overlay button[aria-label*="关闭"], .mobile-composer-overlay [class*="cancel"]').first();
if (await closeBtn.isVisible().catch(() => false)) {
  await closeBtn.click();
  await page.waitForTimeout(1500);
  console.log('发帖器已关闭');
} else {
  console.log('未找到关闭按钮，跳过关闭步骤');
}
await page.screenshot({ path: 'debug-screenshots/probe-pipeline-closed.png' });

console.log('=== 页面错误 ===');
console.log(errors.length ? errors.join('\n') : '(无)');
console.log('=== 失败的网络请求 ===');
console.log(failedRequests.length ? failedRequests.slice(0, 15).join('\n') : '(无)');
console.log('=== 相关日志(尾部40条) ===');
console.log(logs.slice(-40).join('\n') || '(无)');
console.log('RESULT:', allReady && errors.length === 0 ? 'PASS' : (allReady ? 'PASS_WITH_CONSOLE_NOISE' : 'FAIL'));

await browser.close();
