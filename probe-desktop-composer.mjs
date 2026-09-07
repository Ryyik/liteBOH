import { chromium } from 'playwright';

// 桌面端发帖编辑器回归：标题 textarea 化后布局无变形
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) { s.userInfo.username = '测试用户'; s.userInfo.id = ''; s.userInfo.avatarUrl = ''; }
});
await page.waitForTimeout(800);

const card = page.locator('.post-creation-section .editor-card').first();
await card.scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);

await page.fill('.post-creation-section .post-title-input', '桌面端标题换行验证：这一段比较长的标题应当自动换行而不是横向溢出');
await page.fill('.post-creation-section .post-content-input', '桌面正文内容验证。');
await page.waitForTimeout(400);

const m = await page.evaluate(() => {
  const t = document.querySelector('.post-creation-section .post-title-input');
  const c = document.querySelector('.post-creation-section .post-content-input');
  const g = t.closest('.input-group').getBoundingClientRect();
  const tr = t.getBoundingClientRect();
  return {
    titleTag: t.tagName,
    groupW: Math.round(g.width),
    titleW: Math.round(tr.width),
    titleH: Math.round(tr.height),
    contentW: Math.round(c.getBoundingClientRect().width),
    counter: document.querySelector('.post-creation-section .composer-title-count')?.textContent.trim() || null
  };
});
console.log('desktop metrics:', JSON.stringify(m));
await page.screenshot({ path: 'debug-screenshots/composer-desktop-check.png' });
console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
