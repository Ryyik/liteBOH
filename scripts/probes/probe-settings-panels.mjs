// 探针：设置「第四批」三级页的左右栏一致性
// 覆盖 2026-11-10 从「弹层 / 独立路由 / 跳商城」收进右栏的四个入口：
//   theme（原 ThemeModal 弹层）/ version（原整页）/ shipping-address（原跳商城）
//   / photo-albums（原跳独立页）
// 每个页面在横屏（1280×800，两栏）与竖屏（390×844，整页）各验一遍：
//   ① 外壳顶部留白必须为 0（子页没有导航岛，不许再吃 --userspace-nav-h）
//   ② 返回条与首块内容左缘对齐、宽度一致
//   ③ 无横向溢出
// 运行：node scripts/probes/probe-settings-panels.mjs（dev 5173 需已启动）
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SHOT_DIR = 'debug-screenshots';

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

const newPage = async ({ theme = 'light', viewport } = {}) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript((t) => {
    localStorage.setItem('boh-theme', t);
  }, theme);
  return { context, page, errors };
};

const injectLogin = async (page) => {
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__;
    const pinia = app.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) {
      s.userInfo.username = '测试用户';
      s.userInfo.id = '';
      s.userInfo.email = 'ryyik@bohrite.example.com';
    }
  });
  await page.waitForTimeout(900);
};

const loginThenGo = async (page, hash) => {
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectLogin(page);
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(2000);
};

/* 每个面板：view id → 内容标记（证明这一档真的渲染了，而不是空白右栏） */
const PANELS = [
  { id: 'theme', label: '主题设置', ready: '.theme-panel .theme-option' },
  { id: 'version', label: '版本', ready: '.version-panel .gs-card' },
  { id: 'shipping-address', label: '收货地址', ready: '.shipping-address-panel' },
  { id: 'photo-albums', label: '摄影集', ready: '.photo-albums-panel .pa-main' },
  {
    id: 'cloud-plus',
    label: 'Cloud+',
    ready: '.cloud-plus-panel .cloud-page.embedded .cloud-settings-page',
  },
];

const VIEWPORTS = [
  { name: '横屏', width: 1280, height: 800, twoPane: true },
  { name: '竖屏', width: 390, height: 844, twoPane: false },
];

const assertions = [];
const assert = (name, ok, detail = '') => {
  assertions.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ` · ${detail}` : ''}`);
};

for (const vp of VIEWPORTS) {
  for (const panel of PANELS) {
    const { context, page, errors } = await newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    await loginThenGo(page, `#/user-space?tab=settings&view=${panel.id}`);

    const ready = await page.locator(panel.ready).first().count();
    assert(`${vp.name}·${panel.label}·内容已渲染`, ready > 0, `选择器 ${panel.ready}`);

    const geo = await page.evaluate(() => {
      const shell = document.querySelector('.profile-subpage-shell');
      const bar = document.querySelector('.gs-inline-bar');
      const main = document.querySelector('.gs-main');
      // 「首块内容」按面板不同，但都落在 .gs-main 里；取第一个卡片/面板根
      const firstCard =
        document.querySelector('.gs-main .gs-card') ||
        document.querySelector('.gs-main .gs-rows') ||
        document.querySelector('.gs-main > *');
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const shellStyle = shell ? getComputedStyle(shell) : null;
      return {
        shellPadTop: shell ? Math.round(parseFloat(shellStyle.paddingTop) || 0) : null,
        bar: rect(bar),
        main: rect(main),
        firstCard: rect(firstCard),
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });

    assert(
      `${vp.name}·${panel.label}·外壳顶部留白为 0`,
      geo.shellPadTop === 0,
      `padding-top=${geo.shellPadTop}px`,
    );

    if (geo.bar && geo.firstCard) {
      const barLeft = Math.round(geo.bar.left);
      const cardLeft = Math.round(geo.firstCard.left);
      assert(
        `${vp.name}·${panel.label}·返回条与内容左缘对齐`,
        Math.abs(barLeft - cardLeft) <= 1,
        `bar=${barLeft} card=${cardLeft}`,
      );
    } else {
      assert(`${vp.name}·${panel.label}·返回条与内容左缘对齐`, false, '未找到 bar/card');
    }

    assert(
      `${vp.name}·${panel.label}·无横向溢出`,
      geo.docScrollWidth <= geo.innerWidth + 1,
      `scrollWidth=${geo.docScrollWidth} innerWidth=${geo.innerWidth}`,
    );

    if (vp.twoPane) {
      const rail = await page.evaluate(() => {
        const nav = document.querySelector('.gs-nav');
        const main = document.querySelector('.gs-main');
        return {
          nav: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
          main: main ? Math.round(main.getBoundingClientRect().width) : 0,
        };
      });
      assert(
        `${vp.name}·${panel.label}·左右栏均存在`,
        rail.nav > 200 && rail.main > 400,
        `nav=${rail.nav} main=${rail.main}`,
      );
    }

    /* 401 是探针自己的伪登录造成的：注入的 isLoggedIn=true 但 userInfo.id 为空，
       摄影集会带着空 id 去打自己的列表接口（真实登录态下不会）。
       只放过这一种，其它控制台错误仍然算失败。 */
    const realErrors = errors.filter(
      (text) => !(/Failed to load resource/.test(text) && /\b401\b/.test(text)),
    );
    assert(
      `${vp.name}·${panel.label}·无控制台报错`,
      realErrors.length === 0,
      realErrors.slice(0, 2).join(' | '),
    );

    await page.screenshot({
      path: `${SHOT_DIR}/settings-panel-${panel.id}-${vp.twoPane ? 'landscape' : 'portrait'}.png`,
      fullPage: false,
    });
    await context.close();
  }
}

/* ── 点击路径（不是深链）：左栏「通用」→ 主题设置 → 返回条 ──────────────
   深链只能证明「给定 view 能渲染」，证明不了入口真的接上了（曾经出现过
   行点了没反应、左栏不亮这类静默回归）。这里按用户的真实路径点一遍。 */
{
  const { context, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  await loginThenGo(page, '#/user-space?tab=settings');

  await page.locator('.gs-nav-item', { hasText: '通用' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.gs-row', { hasText: '主题设置' }).first().click();
  await page.waitForTimeout(800);
  assert('点击路径·主题设置开出右栏面板', (await page.locator('.theme-panel').count()) > 0);

  const railActive = await page.evaluate(
    () => document.querySelector('.gs-nav-item.active')?.textContent?.trim() || '',
  );
  assert('点击路径·左栏高亮「通用」', railActive.includes('通用'), `active=${railActive}`);

  await page.locator('.gs-inline-back').first().click();
  await page.waitForTimeout(700);
  const backHome =
    (await page.locator('.theme-panel').count()) === 0 &&
    (await page.locator('.gs-row', { hasText: '主题设置' }).count()) > 0;
  assert('点击路径·返回条回到分组页', backHome);

  await context.close();
}

/* ── 历史深链 ?setting=theme：原来开弹层，现在必须落到设置的主题档 ── */
{
  const { context, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  await loginThenGo(page, '#/user-space?tab=settings&setting=theme');
  await page.waitForTimeout(900);
  assert('深链 ?setting=theme 落到主题面板', (await page.locator('.theme-panel').count()) > 0);
  await context.close();
}

await browser.close();

const failed = assertions.filter((a) => !a.ok);
console.log(`\n合计 ${assertions.length} 项，失败 ${failed.length} 项`);
if (failed.length) {
  for (const f of failed) console.log(`  ✗ ${f.name} · ${f.detail}`);
  process.exit(1);
}
