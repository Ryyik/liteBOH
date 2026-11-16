import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 一次性视觉巡检：图文发帖器（album composer）真实渲染截图。
 * 目的：用眼判断「粗糙」在哪 —— 不是断言门禁，产物是图。
 *
 * 运行：node scripts/probes/probe-album-composer-visual.mjs
 * 前置：vite dev server 在 BASE（默认 http://127.0.0.1:5173）
 */
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'output/album-composer-audit';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const injectAuth = async (page) => {
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      Object.assign(auth.userInfo, {
        id: 'a1b2c3d4-0000-4000-8000-000000000003',
        username: '视觉巡检',
        avatarUrl: '',
        role: 'user',
        points: 42,
      });
    });
    await page.waitForTimeout(300);
  }
};

const openComposer = async (page, viewportLabel) => {
  await page.waitForSelector('.forum-section-shell', { timeout: 20000 });
  await page.waitForTimeout(1800);
  // 开编辑器：竖屏走 FAB，横屏 / 宽屏走左栏「发布」
  if (await page.locator('.mobile-compose-fab').count()) {
    await page.click('.mobile-compose-fab');
  } else {
    await page.evaluate(() => {
      document.querySelector('.userspace-rail-item[data-rail-action="compose"]')?.click();
    });
  }
  await page.waitForSelector('.mobile-composer-overlay .editor-card', { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${viewportLabel}-01-post-mode.png` });

  // 切到图文
  await page.click('.composer-mode-btn:has-text("图文")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${viewportLabel}-02-album-empty.png` });

  // 选三张图
  const files = ['p1.jpg', 'p3.jpg', 'p5.jpg'].map((f) => path.resolve('public/demo-album', f));
  await page.setInputFiles('.post-image-input', files);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${viewportLabel}-03-image-confirm.png` });

  // 全部确认（ImageEditModal 确认页底栏）
  const confirmBtn = page.locator('button:has-text("全部确认")').first();
  if (await confirmBtn.count()) {
    await confirmBtn.click();
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: `${OUT}/${viewportLabel}-04-album-with-images.png` });

  // 写点内容，看填写后的排版
  const title = page.locator('.post-title-input');
  await title.click();
  await title.fill('深秋的午后，光落在窗台上');
  await page.locator('.album-block-title').first().fill('第一张 光');
  await page.locator('.album-block-date').first().fill('2026.11.09');
  await page.locator('.album-block-place').first().fill('杭州 · 湖滨');
  await page
    .locator('.album-block-body')
    .first()
    .fill('下午三点的光刚好落在窗台的木纹上，猫睡在光里。\n\n什么都没做的一小时。');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${viewportLabel}-05-album-filled.png` });

  // 滚到底，看底栏动作区
  await page.evaluate(() => {
    const el = document.querySelector('.composer-content-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${viewportLabel}-06-footer.png` });

  // 元素度量：给判断提供数字
  const metrics = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        font: cs.fontSize,
        fontFamily: cs.fontFamily.split(',')[0],
        color: cs.color,
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
      };
    };
    const overlay = document.querySelector('.mobile-composer-overlay');
    const card = document.querySelector('.mobile-composer-overlay .editor-card');
    const scroll = document.querySelector('.composer-content-scroll');
    return {
      overlay: pick('.mobile-composer-overlay'),
      card: pick('.mobile-composer-overlay .editor-card'),
      cardRect: card ? card.getBoundingClientRect().toJSON() : null,
      scrollHeight: scroll?.scrollHeight ?? null,
      scrollClient: scroll?.clientHeight ?? null,
      modeSwitch: pick('.composer-mode-switch'),
      modeBtnSelected: pick(".composer-mode-btn[aria-selected='true']"),
      albumHint: pick('.album-mode-hint'),
      title: pick('.post-title-input'),
      grid: pick('.post-image-preview-grid'),
      imageCard: pick('.post-image-preview-item'),
      addMore: pick('.post-image-add-more-card'),
      albumFlow: pick('.album-flow'),
      addCard: pick('.album-add-card'),
      blockText: pick('.album-block-text'),
      albumPartTitle: pick('.album-block-title'),
      albumPartBody: pick('.album-block-body'),
      footer: pick('.editor-footer'),
      submitBtn: pick('.post-btn'),
      actionBtn: pick('.composer-action-btn'),
    };
  });
  fs.writeFileSync(`${OUT}/${viewportLabel}-metrics.json`, JSON.stringify(metrics, null, 2));
  return metrics;
};

const run = async (width, height, label, theme = 'light') => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 700,
    hasTouch: width < 700,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('boh-theme', t);
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  const m = await openComposer(page, label);
  console.log(`\n===== ${label} (${width}x${height}, ${theme}) =====`);
  console.log(JSON.stringify(m, null, 2));
  if (errors.length) console.log('pageerror:', errors.slice(0, 5));
  await context.close();
  return m;
};

try {
  await run(390, 844, 'p390-light', 'light');
  await run(390, 844, 'p390-dark', 'dark');
  await run(1024, 640, 'l1024-light', 'light');
  await run(1440, 900, 'd1440-light', 'light');
} finally {
  await browser.close();
}
console.log(`\nscreenshots -> ${OUT}`);
