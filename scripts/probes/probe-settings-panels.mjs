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
  /* 摄影集（2026-11-16 起影集降级为「我的图文」）：
     ⚠️ 旧断言找 `.photo-albums-panel .pa-main` —— 那是**独立 /photo-albums 页**
        （`views/PhotoAlbums/index.vue`）的 <main>，内嵌面板里根本没有它。
        内嵌版是零逻辑包装 MyAlbumBook，内容标记是 `.my-album`。
        这条断言自 2026-11-16 起就一直是红的（不是本轮引入）。 */
  { id: 'photo-albums', label: '摄影集', ready: '.photo-albums-panel .my-album' },
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
      // 「首块内容」按面板不同，但都落在 .gs-main 里；取第一个卡片/面板根。
      // ⚠️ 2026-11-24：`.gs-main > *` 这个兜底会选到**页头自己**（页头也是 .gs-main
      //    的直接子元素，且排第一）—— 于是"内容左缘"量成了页头左缘 0。
      //    必须先跳过 .gs-inline-bar；再往下钻一层：收货地址 / 摄影集 / Cloud+ 的
      //    内容根是通栏面板（自身 padding 16px 而不是 margin），面板根的 left 恒为 0，
      //    真正可见的内容从 padding 之后开始 —— 所以取它的首个元素矩形。
      const skipHeader = (el) => el && !el.classList.contains('gs-inline-bar');
      let firstCard =
        document.querySelector('.gs-main .gs-card') || document.querySelector('.gs-main .gs-rows');
      if (!firstCard) {
        const panelRoot = [...document.querySelectorAll('.gs-main > *')].find(skipHeader);
        const inner = panelRoot
          ? [...panelRoot.children].find((el) => el.getBoundingClientRect().height > 0)
          : null;
        // 面板根只有 padding、没有 margin 时，内容左缘 = 根的 left + paddingLeft
        firstCard = inner || panelRoot;
      }
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

    /* 外壳顶部留白（2026-11-24 口径变更，原断言无条件要求 0）：
         · 竖屏子页 = **沉浸态**（用户：「二级三级页面都要占满屏幕，不挂导航栏了」）
           ⇒ 导航岛不渲染，留白必须是 0，否则白留一道空档；
         · 横屏两栏 = **仍挂导航岛**（用户：「横屏还是挂导航栏的」）
           ⇒ 留白必须保留岛高（≈78px），归零会让岛直接压在右栏页头上。
       原断言写死 `=== 0`，把「横屏保留岛」这个用户明确要求判成了失败 —— 是断言过时，不是实现错。 */
    if (vp.twoPane) {
      assert(
        `${vp.name}·${panel.label}·外壳顶部留白保留岛高（横屏挂岛）`,
        geo.shellPadTop >= 60,
        `padding-top=${geo.shellPadTop}px`,
      );
    } else {
      assert(
        `${vp.name}·${panel.label}·外壳顶部留白为 0（竖屏沉浸态）`,
        geo.shellPadTop === 0,
        `padding-top=${geo.shellPadTop}px`,
      );
    }

    if (geo.bar && geo.firstCard) {
      /* 2026-11-24：页头改极简后（圆形返回 + 居中标题、**无底板**），
         对比对象从 `.gs-inline-bar`（通栏容器，left 恒为 0）换成**返回按钮本体**。
         改前量容器是在量「那条白胶囊的左缘」——胶囊通栏，left=0 与卡片 16px
         本来就差一截，只是因为旧断言取的是容器才看着"对齐"。
         现在没有胶囊了，真正要对齐的是用户看得见的那颗圆按钮与卡片左缘。 */
      const backLeft = await page.evaluate(() => {
        const b = document.querySelector('.gs-inline-back');
        return b ? Math.round(b.getBoundingClientRect().left) : null;
      });
      const cardLeft = Math.round(geo.firstCard.left);
      assert(
        `${vp.name}·${panel.label}·返回按钮与内容左缘对齐`,
        backLeft !== null && Math.abs(backLeft - cardLeft) <= 1,
        `back=${backLeft} card=${cardLeft}`,
      );
    } else {
      assert(`${vp.name}·${panel.label}·返回按钮与内容左缘对齐`, false, '未找到 back/card');
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

/* ── 点击路径（不是深链）：左栏「通用」→ 主题设置 → 就地展开 → 返回 ──────────
   深链只能证明「给定 view 能渲染」，证明不了入口真的接上了（曾经出现过
   行点了没反应、左栏不亮这类静默回归）。这里按用户的真实路径点一遍。

   ⚠️ 2026-11-24 C 层把主题行改成了**就地展开**（单栏两栏都是）：
      点它不再出右栏 `.theme-panel`，而是当场列出 5 个选项、标题仍是「通用」。
      改之前的旧断言写的是「开出右栏面板」，实测一直是红的 —— 断言过时，不是实现坏。
      三级页 ThemePanel 仍活着，但它的入口是左栏「更多 → 主题」与深链 `?setting=theme`
      （下一段就在验深链那条），**不是**这一行的点击。 */
{
  const { context, page } = await newPage({ viewport: { width: 1280, height: 800 } });
  await loginThenGo(page, '#/user-space?tab=settings');

  await page.locator('.gs-nav-item', { hasText: '通用' }).first().click();
  await page.waitForTimeout(600);
  const rowsBefore = await page.locator('.gs-mail-freq-option').count();
  assert('点击路径·主题展开前没有选项行', rowsBefore === 0, `opts=${rowsBefore}`);

  await page.locator('.gs-row', { hasText: '主题设置' }).first().click();
  await page.waitForTimeout(900);
  const expanded = await page.evaluate(() => ({
    opts: [...document.querySelectorAll('.gs-mail-freq-option')].map((r) => ({
      label: r.querySelector('.gs-label')?.textContent.trim(),
      checked: !!r.querySelector('.gs-icon.is-green'),
    })),
    title: document.querySelector('.gs-inline-title')?.textContent?.trim(),
    themePanel: document.querySelectorAll('.theme-panel').length,
    rowStillThere: [...document.querySelectorAll('.gs-row')].some(
      (r) => r.querySelector('.gs-label')?.textContent.trim() === '主题设置',
    ),
  }));
  assert(
    '点击路径·主题就地展开 5 个选项',
    expanded.opts.length === 5,
    expanded.opts.map((o) => o.label).join('/'),
  );
  assert(
    '点击路径·展开后仍在「通用」页（没跳走）',
    expanded.title === '通用' && expanded.themePanel === 0,
    `title=${expanded.title} themePanel=${expanded.themePanel}`,
  );
  assert(
    '点击路径·恰好一个选项带勾（当前主题）',
    expanded.opts.filter((o) => o.checked).length === 1,
    `勾=${
      expanded.opts
        .filter((o) => o.checked)
        .map((o) => o.label)
        .join(',') || '无'
    }`,
  );

  const railActive = await page.evaluate(
    () => document.querySelector('.gs-nav-item.active')?.textContent?.trim() || '',
  );
  assert('点击路径·左栏高亮「通用」', railActive.includes('通用'), `active=${railActive}`);

  /* 再点一次同一行 ⇒ 收起（与「提醒频率」同一套 toggle 语义） */
  await page.locator('.gs-row', { hasText: '主题设置' }).first().click();
  await page.waitForTimeout(700);
  const collapsed = await page.locator('.gs-mail-freq-option').count();
  assert('点击路径·再点一次收起选项', collapsed === 0, `opts=${collapsed}`);

  /* 返回条回「概览」（两栏语义）：左栏目录常驻不必再验，判据是 —
     右栏从「通用」那一组切回**概览**（个人信息叶子行），且子页极简页头消失。
     ⚠️ 两栏下**没有** UserCenterPageHeader（「设置」大标题只在单栏首页出现，
        两栏的搜索框与目录都在左栏）—— 别拿 pageTitle 当判据。 */
  await page.locator('.gs-inline-back').first().click();
  await page.waitForTimeout(900);
  const backHome = await page.evaluate(() => ({
    inlineTitle: document.querySelector('.gs-inline-title')?.textContent?.trim() || '',
    labels: [...document.querySelectorAll('.gs-main .gs-label')].map((n) => n.textContent.trim()),
    navItems: [...document.querySelectorAll('.gs-nav-item')].map((n) => n.textContent.trim()),
  }));
  assert(
    '点击路径·返回条回到概览（右栏切回个人信息叶子行）',
    backHome.inlineTitle === '' &&
      backHome.labels.includes('个人信息') &&
      !backHome.labels.includes('主题设置'),
    `inlineTitle=${backHome.inlineTitle || '(none)'} mainLabels=${backHome.labels.join('/')}`,
  );
  assert(
    '点击路径·返回后左栏目录仍是 6 个一级组',
    ['个人信息', '账户与安全', '数据', '通知', '内容与存储', '通用'].every((t) =>
      backHome.navItems.includes(t),
    ),
    backHome.navItems.join('/'),
  );

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
