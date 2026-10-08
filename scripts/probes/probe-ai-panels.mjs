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
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const boot = await page.evaluate(() => ({
    // plans/025 v2 · Step 6-1：壳重写为 `.boh-shell`（旧 `.bohai-container` 随旧 DOM 删除）
    container: !!document.querySelector('.boh-shell'),
    sidebar: !!document.querySelector('.boh-sidebar'),
    // 2026-10-08：顶栏整条已删，入口收成主区右上角的浮动操作组
    floats: !!document.querySelector('.boh-float-actions'),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
  }));
  console.log(
    `[ai-panels] 页面就绪：壳=${boot.container}；侧栏=${boot.sidebar}；浮动操作=${boot.floats}；首屏文本「${boot.text}」`,
  );
  if (!boot.container) fail('AI 页主容器 .boh-shell 未渲染');
  if (!boot.sidebar) fail('会话侧栏 .boh-sidebar 未渲染（设置入口就在它底部）');
  if (!boot.floats) fail('主区右上角浮动操作 .boh-float-actions 未渲染（侧栏展开入口会丢）');

  // 删顶栏后，「打开侧栏」只在侧栏收起时出现 ⇒ 必须真的证明「收起 → 还能打开」。
  // plans/023 步骤③踩过这个坑：删顶栏后侧栏永久打不开，而当时的探针全绿。
  {
    const collapseBtn = page.locator('.boh-sb-close');
    if ((await collapseBtn.count()) > 0) {
      await collapseBtn.first().click();
      await page.waitForTimeout(450);
      const reopen = page.locator('.boh-float-actions [title="打开侧栏"]');
      const hasReopen = (await reopen.count()) > 0;
      if (!hasReopen) {
        fail('侧栏收起后没有重新打开的入口（浮动「打开侧栏」未出现）');
      } else {
        await reopen.first().click();
        await page.waitForTimeout(450);
        const back = await page.evaluate(() => !!document.querySelector('.boh-sidebar.is-open'));
        if (!back) fail('点击浮动「打开侧栏」后侧栏没有恢复');
        else console.log('[ai-panels] 收起 → 浮动按钮重新打开侧栏：通过');
      }
    } else {
      console.log('[ai-panels] 未找到侧栏收起键（可能未登录），跳过折叠往返断言');
    }
  }

  // ---- 设置面板 ----
  // ⚠️ 2026-10-08：设置入口从「侧栏底部独立一行」收进了**左下角账号浮层**
  // （账号 / 额度 / 订阅 / 设置 四合一），所以不能只靠 `[title*="设置"]` 找 ——
  // 旧写法在收进去之后会**静默找不到入口、整段设置断言被跳过**，而探针照样打印
  // 「通过」（实测过一次：`设置入口存在：false` → 面板断言一条没跑，等于没守卫）。
  // 现在的兜底路径：先找直接入口，找不到就 hover 账号入口、再点浮层里的「设置」。
  const findSettingsTrigger = async () => {
    const direct = page.locator(
      '[title*="设置"], button[aria-label*="设置"], [class*="settings-btn"], [class*="settings-trigger"]',
    );
    if (await direct.count()) return direct.first();
    const accountBtn = page.locator('.boh-account-btn');
    if (!(await accountBtn.count())) return null;
    // 账号浮层 hover 即开（点击语义是「打开并保持」，不是 toggle）
    await accountBtn.first().hover();
    await page.waitForTimeout(320);
    const inPop = page.locator('.boh-account-actions button', { hasText: '设置' });
    return (await inPop.count()) ? inPop.first() : null;
  };
  const settingsTrigger = await findSettingsTrigger();
  const hasSettingsTrigger = !!settingsTrigger;
  console.log(`[ai-panels] 设置入口存在：${hasSettingsTrigger}`);

  if (hasSettingsTrigger) {
    const t0 = Date.now();
    await settingsTrigger
      .click({ timeout: 5000 })
      .catch((e) => fail(`点击设置入口失败：${e.message.slice(0, 80)}`));
    const opened = await page
      .waitForSelector('.ai-settings-drawer', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      fail('设置面板未出现（.ai-settings-drawer）—— 惰性挂载可能没触发');
    } else {
      console.log(`[ai-panels] 设置面板已打开，耗时 ${Date.now() - t0}ms`);
      // 「全屏设置页」的关键结构：左侧分组导航（返回应用 + ≥6 个分区条目）+ 右侧分区容器。
      // 只断言 drawer 存在是不够的 —— 旧实现也是 drawer，但它是个盖不住侧栏的居中弹窗。
      const navShape = await page.evaluate(() => {
        const nav = document.querySelector('.ai-settings-nav');
        const items = [...document.querySelectorAll('.ai-settings-nav-item')];
        const sections = [...document.querySelectorAll('.ai-settings-section')].map(
          (el) => el.dataset.section,
        );
        return {
          hasNav: !!nav,
          itemCount: items.length,
          sections,
          backApp: !!document.querySelector('.ai-settings-back-app'),
          sidebarGone: !document.querySelector('.boh-sidebar'),
        };
      });
      console.log(`[ai-panels] 设置页左导航：${JSON.stringify(navShape)}`);
      if (!navShape.hasNav || navShape.itemCount < 6 || !navShape.backApp) {
        fail(`设置页缺少左侧分组导航（全屏设置页的关键结构）：${JSON.stringify(navShape)}`);
      }
      if (navShape.sections.length < 6) {
        fail(`设置页分区不足 6 个：${JSON.stringify(navShape.sections)}`);
      }
      // 打开设置时会话侧栏必须让位（否则侧栏 2147483450 的 z-index 会盖在设置上）
      if (!navShape.sidebarGone) {
        fail('打开设置后会话侧栏仍挂在 DOM 上（会压在设置之上）');
      }
      // 「样式已生效」判据：backdrop 必须有非透明底色、drawer 必须有像样的尺寸。
      // 2026-10-08：独立页走 `.is-fullscreen`（fixed 铺满视口），岛形态是 `.is-embedded`
      // （absolute 铺满宿主）—— 两者都**不要**在这里断言 position 的具体值。
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
        fail(
          `设置面板出现了但未上样式（backdrop 底色透明 / drawer 尺寸异常）：${JSON.stringify(styled)}`,
        );
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
        fail(
          '打开后焦点未进入面板（Esc / 焦点陷阱会失效）—— 检查面板内 watch(props.modelValue) 是否缺 { immediate: true }',
        );
      }
      // 等淡入跑完再截图：`.settings-slide` 过渡 200ms，立刻拍会拍到 opacity≈0 的画面
      // （2026-10-08 实测踩到：截图里只剩背景主界面，看着像「设置没打开」，而断言其实全绿）。
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/ai-settings-open.png` });

      // 关闭：必须能正常收起（验证外层 v-if 没打断 Transition）
      await page.keyboard.press('Escape');
      const closed = await page
        .waitForFunction(() => !document.querySelector('.ai-settings-drawer'), { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!closed) fail('设置面板无法关闭（Esc 后 .ai-settings-drawer 仍在）');
      else console.log('[ai-panels] 设置面板可正常关闭');
    }
  } else {
    // 侧栏在、却找不到设置入口 ⇒ 真回归（入口被删或被藏），不能当「可能未登录」轻轻放过。
    if (await page.locator('.boh-sidebar').count()) {
      fail('侧栏存在但找不到设置入口（账号浮层里的「设置」按钮可能被删或被藏）');
    } else {
      console.log('[ai-panels] 未找到设置入口（侧栏未渲染），跳过面板断言');
    }
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
