/**
 * probe-ai-panels.mjs — AI 页（/ai-chat）面板可用性探针
 *
 * 用途：P0-2 把设置面板 / 额度面板改成「惰性挂载」后，需要证明它们**仍然能正常打开**。
 * 这两个面板都是 Teleport + Transition + v-if 结构，惰性化后最容易出的回归是：
 *   ① 首次打开时组件还没加载完，面板不出现；
 *   ② 关闭动画被外层 v-if 打断（面板瞬间消失而不是滑出）。
 *
 * 用法：先起产物服务，再
 *   npx vite preview --outDir dist-check --port 4180 --strictPort
 *   node scripts/probes/probe-ai-panels.mjs http://[::1]:4180
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';
const OUT = process.argv[3] || '/tmp';

const violations = [];
const fail = (m) => violations.push(m);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const boot = await page.evaluate(() => ({
    container: !!document.querySelector('.bohai-container'),
    sidebar: !!document.querySelector('.bohai-container aside, .bohai-sidebar, [class*="sidebar"]'),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
  }));
  console.log(`[ai-panels] 页面就绪：容器=${boot.container}；首屏文本「${boot.text}」`);
  if (!boot.container) fail('AI 页主容器 .bohai-container 未渲染');

  // ---- 设置面板 ----
  const settingsTrigger = page.locator(
    '[title*="设置"], button[aria-label*="设置"], [class*="settings-btn"], [class*="settings-trigger"]',
  ).first();
  const hasSettingsTrigger = await settingsTrigger.count() > 0;
  console.log(`[ai-panels] 设置入口存在：${hasSettingsTrigger}`);

  if (hasSettingsTrigger) {
    const t0 = Date.now();
    await settingsTrigger.click({ timeout: 5000 }).catch((e) => fail(`点击设置入口失败：${e.message.slice(0, 80)}`));
    const opened = await page.waitForSelector('.ai-settings-drawer', { timeout: 8000 }).then(() => true).catch(() => false);
    if (!opened) {
      fail('设置面板未出现（.ai-settings-drawer）—— 惰性挂载可能没触发');
    } else {
      console.log(`[ai-panels] 设置面板已打开，耗时 ${Date.now() - t0}ms`);
      // 「样式已生效」判据：backdrop 必须有非透明底色、drawer 必须有像样的尺寸。
      // 注意不要断言 position:fixed —— 独立页模式下 embedded=true，按设计就是
      // absolute + 白底铺满容器（.ai-settings-backdrop.is-embedded）。
      const styled = await page.evaluate(() => {
        const el = document.querySelector('.ai-settings-backdrop');
        const drawer = document.querySelector('.ai-settings-drawer');
        if (!el || !drawer) return null;
        const r = drawer.getBoundingClientRect();
        return {
          backdropPosition: getComputedStyle(el).position,
          backdropBg: getComputedStyle(el).backgroundColor,
          drawerWidth: Math.round(r.width),
          drawerHeight: Math.round(r.height),
          drawerPosition: getComputedStyle(drawer).position,
        };
      });
      console.log(`[ai-panels] 面板样式：${JSON.stringify(styled)}`);
      const opaque = styled && !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(styled.backdropBg);
      if (!styled || !opaque || styled.drawerWidth < 300 || styled.drawerHeight < 300) {
        fail(`设置面板出现了但未上样式（backdrop 底色透明 / drawer 尺寸异常）：${JSON.stringify(styled)}`);
      }

      // 焦点必须进入面板：这是 Esc 关闭与焦点陷阱的前提。面板若「挂载时已是打开状态」
      // 而内部 watch(modelValue) 缺 immediate，此处会失败 —— 正是 P0-2 惰性化踩过的坑。
      const focusInfo = await page.evaluate(() => {
        const drawer = document.querySelector('.ai-settings-drawer');
        const active = document.activeElement;
        return {
          insideDrawer: !!(drawer && active && drawer.contains(active)),
          activeTag: active ? active.tagName.toLowerCase() : null,
          activeClass: active ? String(active.className).slice(0, 48) : null,
        };
      });
      console.log(`[ai-panels] 焦点：${JSON.stringify(focusInfo)}`);
      if (!focusInfo.insideDrawer) {
        fail('打开后焦点未进入面板（Esc / 焦点陷阱会失效）—— 检查面板内 watch(props.modelValue) 是否缺 { immediate: true }');
      }
      await page.screenshot({ path: `${OUT}/ai-settings-open.png` });

      // 关闭：必须能正常收起（验证外层 v-if 没打断 Transition）
      await page.keyboard.press('Escape');
      const closed = await page.waitForFunction(() => !document.querySelector('.ai-settings-drawer'), { timeout: 5000 })
        .then(() => true).catch(() => false);
      if (!closed) fail('设置面板无法关闭（Esc 后 .ai-settings-drawer 仍在）');
      else console.log('[ai-panels] 设置面板可正常关闭');
    }
  } else {
    console.log('[ai-panels] 未找到设置入口（可能需登录），跳过面板断言');
  }

  if (errors.length) {
    console.log(`[ai-panels] 控制台错误 ${errors.length} 条（前 3）：`);
    errors.slice(0, 3).forEach((e) => console.log(`    ${e}`));
  }
  await page.screenshot({ path: `${OUT}/ai-page.png` });
  await ctx.close();
} finally {
  await browser.close();
}

if (violations.length) {
  console.error('[ai-panels] AI 页面板探针未通过：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log('[ai-panels] AI 页面板探针通过。');
}
