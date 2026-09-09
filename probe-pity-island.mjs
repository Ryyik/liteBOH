import { chromium } from 'playwright';

// 探针：社区抽奖保底进度自定义岛（PityIslandCard）
// 验证：挂载/surface 撑开/紧凑⇄展开/页面避让自适应/降级态/暗色/小屏/离页清理
const BASE = 'http://localhost:5173';
const PITY_OK = { ok: true, eligible: true, consecutive_losses: 17, threshold: 24, remaining_losses: 7, is_due: false };
const PITY_DUE = { ok: true, eligible: true, consecutive_losses: 24, threshold: 24, remaining_losses: 0, is_due: true };
const PITY_FAIL = { ok: false, eligible: false, consecutive_losses: 0, threshold: 0, remaining_losses: null, is_due: false };

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));

let pityPayload = PITY_OK;
await page.route('**/rest/v1/rpc/get_my_lottery_pity_status**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pityPayload) })
);

const injectLogin = () => page.evaluate(() => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  pinia.state.value.auth.isLoggedIn = true;
  if (!pinia.state.value.auth.userInfo) pinia.state.value.auth.userInfo = {};
  if (!pinia.state.value.auth.userInfo.points) pinia.state.value.auth.userInfo.points = 3200;
});

const metrics = () => page.evaluate(() => {
  const surface = document.querySelector('.unified-nav-surface');
  const card = document.querySelector('.pity-island-card');
  const main = document.querySelector('.community-lottery-main');
  const nav = document.getElementById('unified-nav-container');
  return {
    islandMounted: !!card,
    variant: card ? (card.className.match(/is-(\w+)/)?.[1] || '') : '',
    hasCustom: surface ? surface.classList.contains('has-custom-card') : false,
    surfaceH: surface ? Math.round(surface.getBoundingClientRect().height) : -1,
    navH: nav ? Math.ceil(nav.getBoundingClientRect().height) : -1,
    mainPadTop: main ? Math.round(parseFloat(getComputedStyle(main).paddingTop)) : -1,
    compactText: card ? card.querySelector('.pi-compact')?.textContent.replace(/\s+/g, ' ').trim() : '',
    expanded: !!card?.querySelector('.pi-detail')
  };
});

const openLotteries = async () => {
  await page.goto(`${BASE}/#/lotteries`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  await injectLogin();
  await page.waitForTimeout(1800);
};

// ===== 1) 进度态：紧凑 ⇄ 展开 =====
await openLotteries();
let m = await metrics();
console.log('[progress] compact:', JSON.stringify(m));
console.log('  expect islandMounted=true, variant=progress, hasCustom=true, surfaceH>rest, padTop≈navH+80');
await page.screenshot({ path: 'debug-screenshots/pity-island-1-compact.png' });

await page.locator('.pi-compact').click();
await page.waitForTimeout(500);
m = await metrics();
console.log('[progress] expanded:', JSON.stringify(m), '(expect expanded=true, surfaceH grown)');
await page.screenshot({ path: 'debug-screenshots/pity-island-2-expanded.png' });

// ===== 2) 展开态快捷动作：积分明细跳转 + 离页清岛 =====
await page.locator('.pi-btn-primary').click();
await page.waitForTimeout(1200);
const leftPage = await page.evaluate(() => ({
  url: location.hash.slice(0, 40),
  islandMounted: !!document.querySelector('.pity-island-card')
}));
console.log('[nav] click 积分明细:', JSON.stringify(leftPage), '(expect islandMounted=false after unmount)');

// ===== 3) 回到页面：岛重挂 + 展开态保持收起 =====
await openLotteries();
m = await metrics();
console.log('[remount] compact again:', JSON.stringify({ islandMounted: m.islandMounted, variant: m.variant, expanded: m.expanded }));

// ===== 4) 暗色展开态（theme-manager 会把 data-theme 同时挂在导航容器上） =====
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  document.getElementById('unified-nav-container')?.setAttribute('data-theme', 'dark');
});
await page.locator('.pi-compact').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'debug-screenshots/pity-island-3-dark-expanded.png' });
await page.evaluate(() => {
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('unified-nav-container')?.removeAttribute('data-theme');
});

// ===== 5) 可兑现态 =====
pityPayload = PITY_DUE;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
await injectLogin();
await page.waitForTimeout(1800);
m = await metrics();
console.log('[due] compact:', JSON.stringify(m), '(expect variant=due)');
await page.screenshot({ path: 'debug-screenshots/pity-island-4-due.png' });

// ===== 6) 失败态 =====
pityPayload = PITY_FAIL;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
await injectLogin();
await page.waitForTimeout(1500);
m = await metrics();
console.log('[error] compact:', JSON.stringify(m), '(expect variant=error, no expand)');

// ===== 7) 小屏竖屏：紧凑行收缩 + 避让跟随 =====
pityPayload = PITY_OK;
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
await injectLogin();
await page.waitForTimeout(1800);
m = await metrics();
console.log('[mobile] compact:', JSON.stringify(m), '(expect padTop≈navH+34)');
await page.screenshot({ path: 'debug-screenshots/pity-island-5-mobile.png' });
await page.setViewportSize({ width: 1280, height: 900 });

console.log('[pageerrors]', errors.length ? errors : 'none');
await browser.close();
