import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// 1. 落地活动 tab
await page.goto('http://localhost:5173/#/activities-wall', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: 'debug-screenshots/aw-activities.png' });

// 2. 通过灵动岛切换到方块墙
const islandSwitch = page.locator('.island-custom-host .wi-switch button', { hasText: '方块墙' });
console.log('island switch visible:', await islandSwitch.first().isVisible().catch(() => false));
await islandSwitch.first().click().catch((e) => console.log('click island switch failed:', e.message));
await page.waitForTimeout(900);
console.log('url after switch:', page.url());
await page.screenshot({ path: 'debug-screenshots/aw-wall.png' });

// 3. 点贴一张验证弹窗层级（未登录会弹登录框，同样验证层级）
const cta = page.locator('.island-custom-host .wi-cta');
if (await cta.count()) {
  await cta.first().click().catch((e) => console.log('click compose failed:', e.message));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'debug-screenshots/aw-composer.png' });
  const navBox = await page.locator('#unified-nav-container').boundingBox();
  const backdrop = await page.locator('.block-wall-page .modal-backdrop').first().boundingBox().catch(() => null);
  console.log('nav box top/height:', navBox && [navBox.y, navBox.height], 'backdrop box:', backdrop && [backdrop.y, backdrop.height]);
}

console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
