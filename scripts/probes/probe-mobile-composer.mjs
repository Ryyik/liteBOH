import { chromium } from 'playwright';

// 竖屏发帖器 UI 修复验证探针
// 验证点：1) 正文全宽 2) 标题可换行+字数上限 3) 液态玻璃+字体 4) 添加图片卡片
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 注入登录态（auth store 初始化会清掉假 localStorage 会话，因此运行时直接改 Pinia state）
await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app && app.config.globalProperties.$pinia;
  if (!pinia) throw new Error('pinia not found');
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) {
    s.userInfo.username = '测试用户';
    s.userInfo.id = '';
    s.userInfo.avatarUrl = '';
  }
});
await page.waitForTimeout(800);

// 打开竖屏发帖器
const fab = page.locator('.mobile-compose-fab').first();
console.log('fab visible:', await fab.isVisible().catch(() => false));
await fab.click().catch((e) => console.log('click fab failed:', e.message));
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
await page.waitForTimeout(700);
await page.screenshot({ path: 'debug-screenshots/composer-portrait-open.png' });

// 填标题（超长 → 验证换行 + 计数）与正文（长串 1 → 验证全宽折行）
await page.fill('.post-title-input', '这是一个用来验证标题自动换行和字数统计的超长标题示例文本');
await page.fill('.post-content-input',
  '1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111\n正文全宽验证：这段文字应当占满整行宽度后再折行，而不是被挤在半行宽度的窄栏里显示。');
await page.waitForTimeout(500);
await page.screenshot({ path: 'debug-screenshots/composer-portrait-filled.png' });

// 度量：正文宽度是否 = 卡片宽度；字体；标题元素与计数
const m = await page.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().width) : null;
  };
  const title = document.querySelector('.post-title-input');
  const content = document.querySelector('.post-content-input');
  const counter = document.querySelector('.composer-title-count');
  return {
    cardW: rect('.mobile-composer-section .editor-card'),
    shellW: rect('.composer-body-shell'),
    contentW: rect('.post-content-input'),
    titleTag: title ? title.tagName : null,
    titleFont: title ? getComputedStyle(title).fontFamily.slice(0, 60) : null,
    contentFont: content ? getComputedStyle(content).fontFamily.slice(0, 60) : null,
    titleScrollW: title ? title.scrollHeight : null,
    titleClientH: title ? title.clientHeight : null,
    counterText: counter ? counter.textContent.trim() : null,
    addCardBackdrop: (() => {
      const el = document.querySelector('.post-image-add-more-card');
      return el ? getComputedStyle(el).backdropFilter : null;
    })()
  };
});
console.log('metrics:', JSON.stringify(m, null, 2));

console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
