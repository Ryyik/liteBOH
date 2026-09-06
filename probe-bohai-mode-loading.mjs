// QA probe: BOHAI 模式选择器 Loading 动画验证
// 场景 1: 延迟 list_public_bohai_modes RPC 3 秒 → 验证加载骨架/呼吸态 → 释放后验证真实模式与切换
// 场景 2: RPC 返回 500 → 验证「暂无可用模式」兜底且骨架不残留
// 场景 3: 不拦截正常访问 → 回归验证菜单可用
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SHOT_DIR = 'debug-screenshots';
const results = {};

const browser = await chromium.launch({ channel: 'chrome' });

async function newPage(routeMode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') consoleMsgs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

  if (routeMode === 'delay' || routeMode === 'fail500') {
    await page.route('**/rest/v1/rpc/list_public_bohai_modes*', async (route) => {
      if (routeMode === 'fail500') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal Server Error' }) });
        return;
      }
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({ response });
    });
  }
  return { context, page, consoleMsgs };
}

async function clipOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return undefined;
  return {
    x: Math.max(0, box.x - 40),
    y: Math.max(0, box.y - 260),
    width: Math.min(1280, box.width + 80),
    height: Math.min(900 - Math.max(0, box.y - 260), box.height + 300)
  };
}

async function openModeMenu(page) {
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.composer-mode-button', { timeout: 15000 });
  await page.locator('.composer-mode-button').first().scrollIntoViewIfNeeded();
  await page.locator('.composer-mode-button').first().click();
  await page.waitForSelector('.composer-mode-menu', { state: 'visible', timeout: 5000 });
}

// ---------- 场景 1: 延迟 3 秒（加载态 + 成功态 + 切换回归） ----------
{
  const { context, page, consoleMsgs } = await newPage('delay');
  await openModeMenu(page);

  // 加载态断言
  const loading = await page.evaluate(() => {
    const menu = document.querySelector('.composer-mode-menu');
    const btn = document.querySelector('.composer-mode-button');
    return {
      menuOpen: !!menu && getComputedStyle(menu).display !== 'none',
      hasLoadingBlock: !!menu?.querySelector('.composer-mode-menu-loading'),
      skeletonRowCount: menu?.querySelectorAll('.mode-skeleton-row').length || 0,
      hasLoadingHint: menu?.textContent?.includes('模式加载中…') || false,
      hasEmptyFallback: !!menu?.querySelector('.mode-menu-empty'),
      btnHasLoadingClass: !!btn?.classList.contains('loading'),
      btnAnimation: btn ? getComputedStyle(btn).animationName : '',
      skeletonLineAnim: (() => {
        const line = menu?.querySelector('.mode-skeleton-line');
        return line ? getComputedStyle(line, '::after').animationName : '';
      })()
    };
  });
  results.loadingState = loading;
  await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-loading-delayed.png` });

  // 释放延迟，等待真实模式出现（数据到达可能触发状态更新导致菜单关闭，必要时重新打开菜单）
  try {
    await page.waitForSelector('.composer-mode-option', { state: 'visible', timeout: 6000 });
  } catch {
    await page.locator('.composer-mode-button').first().click();
    await page.waitForTimeout(300);
    await page.waitForSelector('.composer-mode-option', { state: 'visible', timeout: 6000 });
  }
  const loaded = await page.evaluate(() => {
    const menu = document.querySelector('.composer-mode-menu');
    const btn = document.querySelector('.composer-mode-button');
    return {
      loadingBlockGone: !menu?.querySelector('.composer-mode-menu-loading'),
      btnLoadingClassGone: !btn?.classList.contains('loading'),
      btnAnimation: btn ? getComputedStyle(btn).animationName : '',
      optionCount: menu?.querySelectorAll('.composer-mode-option').length || 0,
      optionNames: [...(menu?.querySelectorAll('.mode-option-name strong') || [])].map((el) => el.textContent.trim()),
      btnText: btn?.textContent.trim()
    };
  });
  results.loadedState = loaded;
  try { await page.locator('.composer-mode-menu').screenshot({ path: `${SHOT_DIR}/bohai-mode-loaded.png` }); }
  catch { await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-loaded.png` }); }

  // 切换回归：点击另一个模式选项
  const before = loaded.btnText;
  const target = page.locator('.composer-mode-option').nth(loaded.optionCount > 1 ? 1 : 0);
  const targetName = await target.locator('.mode-option-name strong').textContent();
  if (loaded.optionCount > 1) {
    await target.click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.querySelector('.composer-mode-button')?.textContent.trim());
    results.modeSwitch = { before, clicked: targetName.trim(), after, changed: before !== after };
    await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-switched.png` });
  } else {
    results.modeSwitch = { note: '只有一个模式可选，跳过切换', optionCount: loaded.optionCount };
  }
  results.consoleMsgsScenario1 = consoleMsgs.slice(0, 10);
  await context.close();
}

// ---------- 场景 2: RPC 500 失败兜底 ----------
{
  const { context, page, consoleMsgs } = await newPage('fail500');
  await openModeMenu(page);
  await page.waitForTimeout(1200); // 等 loading 结束
  const failed = await page.evaluate(() => {
    const menu = document.querySelector('.composer-mode-menu');
    const btn = document.querySelector('.composer-mode-button');
    return {
      hasEmptyFallback: !!menu?.querySelector('.mode-menu-empty'),
      emptyText: menu?.querySelector('.mode-menu-empty')?.textContent.trim() || '',
      hasLoadingBlock: !!menu?.querySelector('.composer-mode-menu-loading'),
      skeletonCount: menu?.querySelectorAll('.mode-skeleton-row').length || 0,
      btnLoadingClassGone: !btn?.classList.contains('loading'),
      optionCount: menu?.querySelectorAll('.composer-mode-option').length || 0
    };
  });
  results.fail500State = failed;
  try { await page.locator('.composer-mode-menu').screenshot({ path: `${SHOT_DIR}/bohai-mode-empty-fallback.png` }); }
  catch { await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-empty-fallback.png` }); }
  results.consoleMsgsScenario2 = consoleMsgs.slice(0, 10);
  await context.close();
}

// ---------- 场景 3: 不拦截正常访问（回归） ----------
{
  const { context, page } = await newPage('normal');
  await openModeMenu(page);
  await page.waitForSelector('.composer-mode-option', { state: 'visible', timeout: 15000 });
  const normal = await page.evaluate(() => {
    const menu = document.querySelector('.composer-mode-menu');
    return {
      optionCount: menu?.querySelectorAll('.composer-mode-option').length || 0,
      hasLoadingBlock: !!menu?.querySelector('.composer-mode-menu-loading'),
      hasEmptyFallback: !!menu?.querySelector('.mode-menu-empty')
    };
  });
  results.normalState = normal;
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
