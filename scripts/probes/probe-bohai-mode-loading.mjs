// QA probe: BOHAI 模式选择器 Loading 动画验证
// 场景 1: 延迟 list_public_bohai_modes RPC 3 秒 → 验证加载骨架/呼吸态 → 释放后验证真实模式与切换
// 场景 2: RPC 返回 500 → 验证「暂无可用模式」兜底且骨架不残留
// 场景 3: 不拦截正常访问 → 回归验证菜单可用
//
// ⚠️ 2026-10-01 选择器迁移（配合 plans/023 死 CSS 清理）：
//   旧 `+` 号菜单 / 就地模式浮层已废，现在是「底行胶囊 → .composer-panel 三行 → 二级菜单」：
//     .composer-mode-button       → .composer-panel-trigger
//     .composer-mode-menu         → .composer-submenu.is-left
//     .composer-mode-menu-loading → .composer-panel-loading
//     .composer-mode-option       → .composer-submenu.is-left .composer-submenu-item
//     .mode-option-name strong    → .composer-submenu-item-name
//   另外 `.composer-mode-button.loading` 的呼吸态已随旧按钮一起删除，
//   加载态现在只靠骨架 shimmer（见 motion-system.css），故不再断言按钮动画。
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const SHOT_DIR = 'debug-screenshots';
const results = {};

const SEL = {
  trigger: '.composer-panel-trigger',
  triggerLabel: '.composer-panel-trigger-label',
  panel: '.composer-panel',
  modeRow: '.composer-panel-row',
  submenu: '.composer-submenu.is-left',
  submenuItem: '.composer-submenu-item',
  itemName: '.composer-submenu-item-name',
  loading: '.composer-panel-loading',
  skeletonRow: '.mode-skeleton-row',
  skeletonLine: '.mode-skeleton-line',
  empty: '.mode-menu-empty',
};

const browser = await chromium.launch({ channel: 'chrome' });

async function newPage(routeMode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error')
      consoleMsgs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

  if (routeMode === 'delay' || routeMode === 'fail500') {
    await page.route('**/rest/v1/rpc/list_public_bohai_modes*', async (route) => {
      if (routeMode === 'fail500') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
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
    height: Math.min(900 - Math.max(0, box.y - 260), box.height + 300),
  };
}

// 底行胶囊 → 面板 → 「模式」行 → 左侧二级菜单
async function openModeMenu(page) {
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(SEL.trigger, { timeout: 15000 });
  await page.locator(SEL.trigger).first().scrollIntoViewIfNeeded();
  await page.locator(SEL.trigger).first().click();
  await page.waitForSelector(SEL.panel, { state: 'visible', timeout: 5000 });
  await page.locator(SEL.modeRow).first().click();
  await page.waitForSelector(SEL.submenu, { state: 'visible', timeout: 5000 });
}

// ---------- 场景 1: 延迟 3 秒（加载态 + 成功态 + 切换回归） ----------
{
  const { context, page, consoleMsgs } = await newPage('delay');
  await openModeMenu(page);

  // 加载态断言
  const loading = await page.evaluate((SEL) => {
    const menu = document.querySelector(SEL.submenu);
    const panel = document.querySelector(SEL.panel);
    return {
      menuOpen: !!menu && getComputedStyle(menu).display !== 'none',
      panelOpen: !!panel && getComputedStyle(panel).display !== 'none',
      hasLoadingBlock: !!menu?.querySelector(SEL.loading),
      skeletonRowCount: menu?.querySelectorAll(SEL.skeletonRow).length || 0,
      hasLoadingHint: menu?.textContent?.includes('模式加载中…') || false,
      hasEmptyFallback: !!menu?.querySelector(SEL.empty),
      skeletonLineAnim: (() => {
        const line = menu?.querySelector(SEL.skeletonLine);
        return line ? getComputedStyle(line, '::after').animationName : '';
      })(),
    };
  }, SEL);
  results.loadingState = loading;
  results.loadingShot = await clipOf(page, SEL.submenu);
  await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-loading-delayed.png` });

  // 释放延迟，等待真实模式出现（数据到达可能触发状态更新导致菜单关闭，必要时重新打开菜单）
  try {
    await page.waitForSelector(`${SEL.submenu} ${SEL.submenuItem}`, {
      state: 'visible',
      timeout: 6000,
    });
  } catch {
    await page.locator(SEL.trigger).first().click();
    await page.waitForTimeout(300);
    await page.locator(SEL.modeRow).first().click();
    await page.waitForSelector(`${SEL.submenu} ${SEL.submenuItem}`, {
      state: 'visible',
      timeout: 6000,
    });
  }
  const loaded = await page.evaluate((SEL) => {
    const menu = document.querySelector(SEL.submenu);
    const trigger = document.querySelector(SEL.trigger);
    return {
      loadingBlockGone: !menu?.querySelector(SEL.loading),
      optionCount: menu?.querySelectorAll(SEL.submenuItem).length || 0,
      optionNames: [...(menu?.querySelectorAll(SEL.itemName) || [])].map((el) =>
        el.textContent.trim(),
      ),
      triggerText: trigger?.querySelector(SEL.triggerLabel)?.textContent.trim(),
    };
  }, SEL);
  results.loadedState = loaded;
  try {
    await page.locator(SEL.submenu).screenshot({ path: `${SHOT_DIR}/bohai-mode-loaded.png` });
  } catch {
    await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-loaded.png` });
  }

  // 切换回归：点击另一个模式选项（选完模式 → 整个面板收起，见 selectMode）
  const before = loaded.triggerText;
  const target = page
    .locator(`${SEL.submenu} ${SEL.submenuItem}`)
    .nth(loaded.optionCount > 1 ? 1 : 0);
  const targetName = await target.locator(SEL.itemName).textContent();
  if (loaded.optionCount > 1) {
    await target.click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(
      (SEL) =>
        document.querySelector(SEL.trigger)?.querySelector(SEL.triggerLabel)?.textContent.trim(),
      SEL,
    );
    const panelClosed = await page.evaluate(
      (SEL) => !document.querySelector(SEL.panel)?.checkVisibility?.(),
      SEL,
    );
    results.modeSwitch = {
      before,
      clicked: targetName.trim(),
      after,
      changed: before !== after,
      panelClosedAfterPick: panelClosed,
    };
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
  const failed = await page.evaluate((SEL) => {
    const menu = document.querySelector(SEL.submenu);
    return {
      hasEmptyFallback: !!menu?.querySelector(SEL.empty),
      emptyText: menu?.querySelector(SEL.empty)?.textContent.trim() || '',
      hasLoadingBlock: !!menu?.querySelector(SEL.loading),
      skeletonCount: menu?.querySelectorAll(SEL.skeletonRow).length || 0,
      optionCount: menu?.querySelectorAll(SEL.submenuItem).length || 0,
    };
  }, SEL);
  results.fail500State = failed;
  try {
    await page
      .locator(SEL.submenu)
      .screenshot({ path: `${SHOT_DIR}/bohai-mode-empty-fallback.png` });
  } catch {
    await page.screenshot({ path: `${SHOT_DIR}/bohai-mode-empty-fallback.png` });
  }
  results.consoleMsgsScenario2 = consoleMsgs.slice(0, 10);
  await context.close();
}

// ---------- 场景 3: 不拦截正常访问（回归） ----------
{
  const { context, page } = await newPage('normal');
  await openModeMenu(page);
  await page.waitForSelector(`${SEL.submenu} ${SEL.submenuItem}`, {
    state: 'visible',
    timeout: 15000,
  });
  const normal = await page.evaluate((SEL) => {
    const menu = document.querySelector(SEL.submenu);
    return {
      optionCount: menu?.querySelectorAll(SEL.submenuItem).length || 0,
      hasLoadingBlock: !!menu?.querySelector(SEL.loading),
      hasEmptyFallback: !!menu?.querySelector(SEL.empty),
    };
  }, SEL);
  results.normalState = normal;
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
