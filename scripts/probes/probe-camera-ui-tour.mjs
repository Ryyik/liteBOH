import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：BOH Camera 全状态截图巡览（plans/041）
//
//   目的不是断言，而是**出一套可肉眼验收的图**：开机台 → 取景 → 变焦 →
//   层叠 → 暂存三态 → 大图预览 → 三种异常 → 桌面宽度。
//   断言在 probe-camera-live.mjs 里；这里只负责「拍全」。
//
//   跑法：先 `npx vite --port 5188`，再 `node scripts/probes/probe-camera-ui-tour.mjs`
//   （不在 verify 链上：它只产图，不做断言；断言在 probe-camera-live.mjs）
//   产物：debug-screenshots/ui-NN-*.png（编号即观看顺序）
// =====================================================================

const BASE = process.env.BASE || 'http://localhost:5188';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env.CHROME_BIN ||
  '/Users/ryyik/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const launch = () =>
  chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

/** 关掉 Web Share：无头环境里它存在但会挂住，必须走下载通道才好继续点按钮 */
const killShare = () => {
  for (const name of ['share', 'canShare']) {
    try {
      Object.defineProperty(navigator, name, { value: undefined, configurable: true });
    } catch {
      /* ignore */
    }
  }
};

const injectLogin = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.isLoggedIn = true;
    pinia.state.value.auth.isInitialized = true;
    Object.assign(pinia.state.value.auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user',
      role: 'user',
    });
  });
};

const gotoCamera = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectLogin(page);
  await page.evaluate(() => {
    window.location.hash = '#/user-space/note/camera';
  });
  await page.waitForSelector('.boh-cam', { timeout: 20000 });
};

const waitLive = async (page) => {
  await page.waitForFunction(
    () => {
      const video = document.querySelector('.boh-cam__video');
      return video && video.readyState >= 2 && video.videoWidth > 0;
    },
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(600);
};

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/ui-${name}.png` });
  console.log('  ·', `${OUT}/ui-${name}.png`);
};

const openContext = async (
  browser,
  { permState = null, viewport = PHONE, noDevices = false } = {},
) => {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(killShare);
  if (permState) {
    await context.addInitScript((state) => {
      window.__gumCalls = 0;
      const gum = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
      if (gum) {
        navigator.mediaDevices.getUserMedia = (...args) => {
          window.__gumCalls += 1;
          return gum(...args);
        };
      }
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (desc) =>
        desc?.name === 'camera' ? Promise.resolve({ state, onchange: null }) : originalQuery(desc);
    }, permState);
  }
  if (noDevices) {
    await context.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      } catch {
        /* ignore */
      }
    });
  }
  return context;
};

async function main() {
  const browser = await launch();

  /* ── 1. 开机台 → 取景 → 滤镜 → 变焦 ─────────────────────────────────── */
  console.log('开机台 / 取景 / 变焦');
  const mainCtx = await openContext(browser, { permState: 'prompt' });
  const page = await mainCtx.newPage();
  await gotoCamera(page);
  await page.waitForSelector('[data-testid="camera-gate"]', { timeout: 15000 });
  await page.waitForTimeout(900);
  await shot(page, '01-gate');

  await page.click('.boh-cam__gate-btn');
  await waitLive(page);
  await shot(page, '02-live');

  // 切到 800T（夜景档，index 13）：看胶卷盒选中态与取景滤镜
  await page.locator('.boh-cam__chip').nth(13).click();
  await page.waitForTimeout(500);
  await shot(page, '03-filter-night');

  // 2× 变焦
  await page.locator('.boh-cam__zoom-step').nth(1).click();
  await page.waitForTimeout(500);
  await shot(page, '04-zoom-2x');

  // 回到 1× 与默认滤镜，继续拍
  await page.locator('.boh-cam__zoom-step').nth(0).click();
  await page.locator('.boh-cam__chip').nth(1).click();
  await page.waitForTimeout(400);

  /* ── 2. 拍 2 张 → 层叠 ──────────────────────────────────────────────── */
  console.log('层叠暂存');
  for (let i = 0; i < 2; i += 1) {
    await page.click('[data-testid="camera-shutter"]');
    await page.waitForTimeout(1100);
  }
  await shot(page, '05-stack');

  /* ── 3. 暂存相册：未存 → 混态 → 全存 ────────────────────────────────── */
  console.log('暂存相册三态');
  await page.click('[data-testid="camera-stack"]');
  await page.waitForTimeout(500);
  await shot(page, '06-review-unsaved');

  await page.click('[data-testid="camera-save-all"]');
  await page.waitForTimeout(1600);
  await shot(page, '07-review-all-saved');

  // 回去再拍 1 张 → 混态（前两张 ✓，第三张没有）
  await page.click('[data-testid="camera-review-continue"]');
  await page.waitForTimeout(400);
  await page.click('[data-testid="camera-shutter"]');
  await page.waitForTimeout(1100);
  await page.click('[data-testid="camera-stack"]');
  await page.waitForTimeout(500);
  await shot(page, '08-review-mixed');

  /* ── 4. 大图预览 ────────────────────────────────────────────────────── */
  console.log('大图预览');
  await page.locator('.boh-cam__review-open').first().click();
  await page.waitForTimeout(500);
  await shot(page, '09-preview');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* ── 5. 窄屏（iPhone SE 375×667）看一眼是否挤 ──────────────────────── */
  console.log('窄屏 375×667');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(600);
  await shot(page, '10-narrow-review');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(400);
  await mainCtx.close();

  /* ── 6. 桌面宽度 ────────────────────────────────────────────────────── */
  console.log('桌面 1280×800');
  const deskCtx = await openContext(browser, { viewport: DESKTOP, permState: 'prompt' });
  const deskPage = await deskCtx.newPage();
  await gotoCamera(deskPage);
  await deskPage.waitForSelector('[data-testid="camera-gate"]', { timeout: 15000 });
  await deskPage.waitForTimeout(500);
  if (await deskPage.$('.boh-cam__gate-btn')) await deskPage.click('.boh-cam__gate-btn');
  await waitLive(deskPage);
  await shot(deskPage, '11-desktop-live');
  await deskCtx.close();

  /* ── 7. 三种「起不来」────────────────────────────────────────────────── */
  console.log('异常态');
  const deniedCtx = await openContext(browser, { permState: 'prompt' });
  const deniedPage = await deniedCtx.newPage();
  await gotoCamera(deniedPage);
  await deniedPage.waitForSelector('[data-testid="camera-gate"]', { timeout: 15000 });
  // 模拟「点了不允许」
  await deniedPage.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      return Promise.reject(error);
    };
  });
  await deniedPage.click('.boh-cam__gate-btn');
  await deniedPage.waitForSelector('.boh-cam__fallback', { timeout: 8000 });
  await deniedPage.waitForTimeout(400);
  await shot(deniedPage, '12-denied');
  await deniedCtx.close();

  const blockedCtx = await openContext(browser, { permState: 'denied' });
  const blockedPage = await blockedCtx.newPage();
  await gotoCamera(blockedPage);
  await blockedPage.waitForSelector('.boh-cam__fallback', { timeout: 15000 });
  await blockedPage.waitForTimeout(500);
  await shot(blockedPage, '13-blocked');
  await blockedCtx.close();

  const noDevicesCtx = await openContext(browser, { noDevices: true });
  const noDevicesPage = await noDevicesCtx.newPage();
  await gotoCamera(noDevicesPage);
  await noDevicesPage.waitForSelector('.boh-cam__fallback', { timeout: 15000 });
  await noDevicesPage.waitForTimeout(500);
  await shot(noDevicesPage, '14-unsupported');
  await noDevicesCtx.close();

  await browser.close();
  console.log('\n完成：ui-01 … ui-14');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
