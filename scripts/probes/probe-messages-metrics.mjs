// 量测：消息页顶部每一层的实际占位（竖屏 + 横屏）
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const mockUser = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'ryyik@bohrite.example.com', user_metadata: { username: '瑞一颗' }
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

const measure = async (viewport, label) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await context.route('**/auth/v1/user', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }));
  await context.route('**/rest/v1/notifications**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
  const page = await context.newPage();
  await page.addInitScript(({ t, u }) => {
    localStorage.setItem('boh-theme', t);
    localStorage.setItem('sb-nplnlefdwfgtyimfkyih-auth-token', JSON.stringify({
      access_token: 'mock', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock', user: u
    }));
  }, { t: 'light', u: mockUser });
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.location.hash = '#/user-space?tab=messages'; });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), pt: cs.paddingTop };
    };
    return {
      island: pick('#unified-nav-container'),
      tabs: pick('.messages-tab .segment-tabs'),
      host: pick('.messages-host'),
      container: pick('.x-notifications-container'),
      header: pick('.x-header-minimal'),
      list: pick('.x-inbox-list'),
      empty: pick('.x-empty')
    };
  });
  console.log(`\n===== ${label} (${viewport.width}x${viewport.height}) =====`);
  console.log(JSON.stringify(info, null, 1));

  // 模拟状态卡收起：岛变矮 → ResizeObserver 应自动收紧 tabs 顶隙
  await page.evaluate(() => {
    const card = document.querySelector('#unified-nav-container .global-nav-status-card, #unified-nav-container [class*="status-card"]');
    if (card) card.style.display = 'none';
  });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    return {
      island: pick('#unified-nav-container'),
      tabs: pick('.messages-tab .segment-tabs'),
      header: pick('.x-header-minimal'),
      content: pick('.x-inbox-list') || pick('.x-empty'),
      navVar: document.querySelector('.user-space-page')?.style.getPropertyValue('--userspace-nav-h') || '(unset)'
    };
  });
  console.log('--- 状态卡收起后 ---');
  console.log(JSON.stringify(after, null, 1));
  await context.close();
};

await measure({ width: 420, height: 900 }, '竖屏');
await measure({ width: 844, height: 420 }, '横屏');
await browser.close();
