// 探针：重置密码页 liquid 改造验证（亮/暗两态截图）
// 用法: node probe-reset-password-liquid.mjs
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173/#/reset-password';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // 测暗色必须 addInitScript 设 boh-theme（css 懒加载，themeManager 启动时读 localStorage）
  if (theme === 'dark') {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('boh-theme', 'dark'); } catch (e) {}
    });
  }
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(8500); // 无 token 时 waitForSession 默认 5s 超时后才出错误态+返回登录按钮

  const card = page.locator('.reset-card');
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `debug-screenshots/reset-password-liquid-${theme}.png` });

  // 采集关键样式实际值，避免肉眼误判
  const probe = await page.evaluate(() => {
    const root = document.querySelector('.reset-page');
    const card = document.querySelector('.reset-card');
    const h1 = document.querySelector('.reset-card h1');
    const err = document.querySelector('.reset-card .error');
    const btn = document.querySelector('.reset-card .secondary');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const [r, c, e, b] = [cs(root), cs(card), cs(h1), cs(err)];
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      pageBg: r?.backgroundColor,
      cardBg: c?.backgroundColor,
      cardBackdrop: c?.backdropFilter || c?.webkitBackdropFilter,
      h1Color: e?.color,
      errColor: b?.color,
      secondaryColor: btn ? getComputedStyle(btn).color : null,
    };
  });
  console.log(`[${theme}]`, JSON.stringify(probe, null, 2));
  await ctx.close();
}

await browser.close();
console.log('done');
