import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：横屏左栏「发布会话」的两条契约（2026-10-11 用户报障）
//
// 背景（用户原话）：「横屏切换到发布的时候，应该是发布被选中，此时我再点击内容，
//   发布应该会有离开是否保存草稿提示，而不是一个遮罩层盖在页面上」
//
// 真因两条（都在首页 `/` 这条线上，UserSpace 那条已修好）：
//   ① 左栏「发布 / 搜索」是 QUICK_ACTIONS，模板里**从来没有 active 绑定** ⇒ 会话开着也不选中；
//   ② 首页 handleBottomNavClick / handleRailAction **一次都没调 dismissComposerSession**
//      （该文件内 closeComposer / dismissComposer 命中 0 次），而「内容」那一席的 id
//      正好等于首页恒定的 activeBottomNavId（community）⇒ 点它命中「提前 return 只滚动」分支，
//      会话从不关闭 ⇒ 被 Teleport 到 body 的 .mobile-composer-overlay 原样盖在内容区上
//      （横屏下它 left: --userspace-rail-w，看起来就是「一层遮罩盖住页面」），
//      而且 closeMobileComposer 的「保存草稿」确认链根本不会被走到。
//
// 断言组（1440×900 首页，走真实点击；点 rail 一律用页面内 element.click()）：
//   A 点「发布」→ 会话打开；**该项必须带 .active**（当前实现 RED）
//   B 有内容时点「内容」→ 必须弹「保存草稿」确认；选「不保存」后会话关闭（当前 RED）
//   C 空内容时点「内容」→ 不打扰（无确认框）、直接关会话（当前 RED）
//   D 会话开着时点「搜索」→ 会话也先被收掉（当前 RED）；且动作真的执行（搜索框拿到焦点）
//   F UserSpace 宿主（同 /#/user-space?tab=community，左栏是一份组件、两个宿主）同一契约
//   G 会话**没开** + 本地留着草稿 → 点「内容」/「我的」不许弹「保存草稿」（2026-10-18 报障；
//     closeMobileComposer 缺 isMobileComposerOpen 守卫 ⇒ 每次导航都被当成「正在离开编辑器」）
//   E 全程零 pageerror；且每次关会话后 overlay 必须真的不在 DOM（不能只靠透明度）
//
// 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）
// 运行：node scripts/probes/probe-composer-session-gate.mjs
//
// counter-proof（手动，任一条都必须让对应断言转红）：
//   1) 把 Home/index.vue 的 handleBottomNavClick / handleRailAction 里的闸门调用删掉 → B*/C*/D* 必红
//   2) 把 UserSpaceSideRail.vue 上 QUICK_ACTIONS 的 :class active 绑定删掉 → A2 必红
//   3) 把 ForumMain.vue 的 composer-state emit 删掉 → A2 必红（父层拿不到会话状态）
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots/composer-session-gate';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail ? '— ' + detail : '');
  } else {
    fail += 1;
    console.log('FAIL ', name, detail ? '— ' + detail : '');
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

const injectAuth = async (page) => {
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      Object.assign(auth.userInfo, {
        id: 'a1b2c3d4-0000-4000-8000-000000000003',
        username: 'probe_composer_gate',
        role: 'user',
        points: 42,
      });
    });
    await page.waitForTimeout(350);
  }
};

/** 打开首页横屏（预置 24h 时间窗标记，直接落在论坛层） */
async function openHome(width = 1440, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'light');
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.forum-section-shell', { timeout: 20000 });
  await page.waitForTimeout(2200);
  return { context, page };
}

/** 页面内点击：rail 项一律这么点（坐标点击在窄浮层/玻璃层上会落错目标） */
const clickRail = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, selector);

const snapshot = (page) =>
  page.evaluate(() => {
    const overlay = document.querySelector('.mobile-composer-overlay');
    const composeItem = document.querySelector('.userspace-rail-item[data-rail-action="compose"]');
    const confirm = document.querySelector('.forum-confirm-modal');
    const contentItem = document.querySelector('.userspace-rail-item[data-tab="community"]');
    return {
      // ⚠️ 判「有没有遮罩」必须看节点在不在，不能只看可见性 —— 会话是 v-if，残留就是真的盖着
      overlayExists: Boolean(overlay),
      overlayRect: overlay
        ? (() => {
            const b = overlay.getBoundingClientRect();
            return { x: Math.round(b.x), w: Math.round(b.width) };
          })()
        : null,
      composeItemExists: Boolean(composeItem),
      composeItemActive: Boolean(composeItem?.classList.contains('active')),
      composeItemBg: composeItem ? getComputedStyle(composeItem).backgroundColor : '',
      /* ⚠️ 「选中态」不能只断言 class：这个按钮底色本来就是主操作蓝，
         .active 若被同优先级的 [data-rail-action="compose"] 规则压过，
         就会出现「class 在、视觉没变」的假绿（2026-10-11 实际踩过）。
         所以额外抓一个只由 .active 产生的视觉通道：光晕 box-shadow。 */
      composeItemShadow: composeItem ? getComputedStyle(composeItem).boxShadow : '',
      contentItemActive: Boolean(contentItem?.classList.contains('active')),
      activeTab:
        document.querySelector('.userspace-rail-item.active')?.getAttribute('data-tab') || '',
      confirmExists: Boolean(confirm),
      confirmTitle: confirm?.querySelector('h3')?.textContent?.trim() || '',
      confirmButtons: Array.from(document.querySelectorAll('.forum-confirm-btn')).map((el) =>
        el.textContent.trim(),
      ),
      railW: getComputedStyle(document.body).getPropertyValue('--userspace-rail-w').trim(),
    };
  });

const waitFor = async (page, fn, timeoutMs = 3000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fn()) return true;

    await page.waitForTimeout(120);
  }
  return false;
};

try {
  const { context, page } = await openHome();

  // ---------------- A：点「发布」→ 会话打开 + 该项选中 ----------------
  console.log('\n--- A 点「发布」---');
  const before = await snapshot(page);
  const clickedCompose = await clickRail(page, '.userspace-rail-item[data-rail-action="compose"]');
  check('A1 「发布」按钮存在且可点', clickedCompose);
  check(
    'A1b 基线：未开会话时「发布」没有光晕',
    before.composeItemShadow === 'none',
    before.composeItemShadow,
  );
  const opened = await waitFor(page, async () => (await snapshot(page)).overlayExists, 6000);
  const a = await snapshot(page);
  check('A2 点「发布」打开发布会话', opened && a.overlayExists, JSON.stringify(a.overlayRect));
  check(
    'A3 左栏「发布」在该会话打开时被选中（.active + aria-current）',
    a.composeItemActive,
    `active=${a.composeItemActive} bg=${a.composeItemBg}`,
  );
  // 视觉通道：必须有只由 .active 产生的光晕，否则是「class 在、看不出选中」的假绿
  check(
    'A3b 选中态真的看得见（光晕出现，不只是 class）',
    a.composeItemShadow !== 'none' && a.composeItemShadow !== before.composeItemShadow,
    `before=${before.composeItemShadow} after=${a.composeItemShadow}`,
  );
  // 会话左缘 = 栏宽：这条同时证明「遮罩」覆盖的是内容区（用户看到的「盖在页面上」就是它）
  check(
    'A4 会话左缘 = 栏宽（左栏保持可见，遮罩只盖内容区）',
    a.overlayRect && a.railW && Math.abs(a.overlayRect.x - Number(a.railW.replace('px', ''))) <= 2,
    `overlay.x=${a.overlayRect?.x} railW=${a.railW}`,
  );
  await page.screenshot({ path: `${OUT}/A-compose-open.png` });

  // ---------------- B：有内容时点「内容」→ 弹草稿确认 ----------------
  console.log('\n--- B 有内容时点「内容」---');
  await page.fill('.mobile-composer-overlay .post-content-input', '探针：未保存的内容');
  await page.waitForTimeout(400);
  const hasTyped = await page.evaluate(
    () => document.querySelector('.mobile-composer-overlay .post-content-input')?.value || '',
  );
  check('B1 编辑器已拿到输入（前置条件）', hasTyped.includes('未保存'), hasTyped);
  const clickedContent = await clickRail(page, '.userspace-rail-item[data-tab="community"]');
  check('B2 「内容」按钮存在且可点', clickedContent);
  const confirmShown = await waitFor(page, async () => (await snapshot(page)).confirmExists, 4000);
  const b = await snapshot(page);
  check(
    'B3 点「内容」弹出「保存草稿」确认框',
    confirmShown && b.confirmExists,
    `showed=${confirmShown} title=${b.confirmTitle}`,
  );
  check(
    'B4 确认框文案是保存草稿口径（保存 / 不保存）',
    b.confirmTitle.includes('草稿') && b.confirmButtons.join('/') === '保存/不保存',
    `title=${b.confirmTitle} buttons=${b.confirmButtons.join('/')}`,
  );
  await page.screenshot({ path: `${OUT}/B-save-draft-confirm.png` });
  if (b.confirmExists) {
    await page.evaluate(() => {
      document.querySelector('.forum-confirm-btn.danger')?.click();
    });
  }
  const closedAfterCancel = await waitFor(
    page,
    async () => !(await snapshot(page)).overlayExists,
    4000,
  );
  const b2 = await snapshot(page);
  check(
    'B5 选「不保存」后发布会话真的关掉（遮罩不残留）',
    closedAfterCancel && !b2.overlayExists,
    `overlayExists=${b2.overlayExists}`,
  );
  check(
    'B6 会话关掉后「发布」不再选中（class 与光晕一起收掉）',
    !b2.composeItemActive && b2.composeItemShadow === 'none',
    `active=${b2.composeItemActive} shadow=${b2.composeItemShadow}`,
  );

  // ---------------- C：空内容时点「内容」→ 不打扰、直接关 ----------------
  console.log('\n--- C 空内容时点「内容」---');
  await clickRail(page, '.userspace-rail-item[data-rail-action="compose"]');
  await waitFor(page, async () => (await snapshot(page)).overlayExists, 6000);
  await page.waitForTimeout(600);
  await clickRail(page, '.userspace-rail-item[data-tab="community"]');
  await page.waitForTimeout(900);
  const c = await snapshot(page);
  check('C1 空内容点「内容」不弹确认框（不打扰）', !c.confirmExists, `confirm=${c.confirmExists}`);
  const closedEmpty = await waitFor(page, async () => !(await snapshot(page)).overlayExists, 4000);
  check('C2 空内容点「内容」会话直接关闭', closedEmpty, `overlay=${!closedEmpty}`);

  // ---------------- D：会话开着点「搜索」→ 也先收会话 ----------------
  console.log('\n--- D 会话开着点「搜索」---');
  await clickRail(page, '.userspace-rail-item[data-rail-action="compose"]');
  await waitFor(page, async () => (await snapshot(page)).overlayExists, 6000);
  await page.waitForTimeout(600);
  await clickRail(page, '.userspace-rail-item[data-rail-action="search"]');
  /* 会话里可能带着上一步的脏内容 ⇒ 允许先弹「保存草稿」确认（这正是闸门在等用户），
     但**不许**出现「既没弹确认、遮罩又没关」的裸留。所以这里：有确认就替他选「不保存」。 */
  const searchConfirm = await waitFor(page, async () => (await snapshot(page)).confirmExists, 3000);
  if (searchConfirm) {
    await page.evaluate(() => {
      document.querySelector('.forum-confirm-btn.danger')?.click();
    });
  }
  const closedBySearch = await waitFor(
    page,
    async () => !(await snapshot(page)).overlayExists,
    4000,
  );
  const d = await snapshot(page);
  check(
    'D1 会话开着点「搜索」：会话先被收掉（不留遮罩）',
    closedBySearch && !d.overlayExists,
    `confirmFirst=${searchConfirm} overlayExists=${d.overlayExists}`,
  );
  // 动作必须真的执行了：搜索落点聚焦到工具栏输入框（证明不是「关了会话却什么都没做」）
  const searchFocused = await page.evaluate(() => {
    const input = document.querySelector('.forum-page .toolbar-search-input');
    if (!(input instanceof HTMLInputElement)) return 'absent';
    return document.activeElement === input
      ? 'focused'
      : `blurred(${document.activeElement?.tagName || '?'})`;
  });
  check(
    'D2 搜索动作真的落到工具栏输入框（焦点就位）',
    searchFocused === 'focused',
    String(searchFocused),
  );
  await page.screenshot({ path: `${OUT}/D-search-after-session.png` });
  await context.close();

  // ---------------- F：UserSpace 宿主同一契约（左栏是一份组件、两个宿主） ----------------
  {
    console.log('\n--- F /user-space?tab=community（第二宿主）---');
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx2.addInitScript(() => {
      try {
        localStorage.setItem('boh-theme', 'light');
      } catch {
        /* ignore */
      }
    });
    const page2 = await ctx2.newPage();
    page2.on('pageerror', (e) => errors.push(`[userspace] ${String(e.message).slice(0, 160)}`));
    await page2.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
    await injectAuth(page2);
    await page2.waitForSelector('.forum-section-shell', { timeout: 20000 });
    await page2.waitForTimeout(2200);
    const f0 = await snapshot(page2);
    check(
      'F1 UserSpace 横屏左栏在（含「内容」席，与首页读同一份 bottom-nav）',
      f0.composeItemExists && f0.contentItemActive,
      `composeItem=${f0.composeItemExists} contentActive=${f0.contentItemActive}`,
    );
    await clickRail(page2, '.userspace-rail-item[data-rail-action="compose"]');
    await waitFor(page2, async () => (await snapshot(page2)).overlayExists, 6000);
    const f1 = await snapshot(page2);
    check('F2 UserSpace：点「发布」打开会话', f1.overlayExists, String(f1.overlayExists));
    check(
      'F3 UserSpace：「发布」同样进选中态（class + 光晕）',
      f1.composeItemActive && f1.composeItemShadow !== 'none',
      `active=${f1.composeItemActive} shadow=${f1.composeItemShadow}`,
    );
    await page2.fill('.mobile-composer-overlay .post-content-input', '探针：UserSpace 脏内容');
    await page2.waitForTimeout(400);
    await clickRail(page2, '.userspace-rail-item[data-tab="community"]');
    const fConfirm = await waitFor(page2, async () => (await snapshot(page2)).confirmExists, 4000);
    const f2 = await snapshot(page2);
    check(
      'F4 UserSpace：有内容点「内容」同样弹「保存草稿」确认',
      fConfirm && f2.confirmExists && f2.confirmTitle.includes('草稿'),
      `showed=${fConfirm} title=${f2.confirmTitle}`,
    );
    await page2.evaluate(() => {
      document.querySelector('.forum-confirm-btn.danger')?.click();
    });
    const fClosed = await waitFor(page2, async () => !(await snapshot(page2)).overlayExists, 4000);
    check('F5 UserSpace：选「不保存」后会话关掉（不留遮罩）', fClosed, `overlay=${!fClosed}`);
    await page2.screenshot({ path: `${OUT}/F-userspace-session.png` });
    await ctx2.close();
  }

  // ---------------- G：会话**没开** + 本地留着草稿 → 点导航不许弹「保存草稿」 ----------------
  /* 2026-10-18 用户报障（截图为证）：点左栏「内容」/底栏「我的」无故弹「保存草稿」，
     而编辑器根本没打开过。真因是 closeMobileComposer 只判 hasUnsavedChanges()，
     而 restorePostDraft() 在 mount / 登录 / 换账号时会把本地或云端草稿回填进 newPost
     （设计如此，好让下次打开编辑器接着写）⇒「编辑器里有字」被当成了「用户正在离开编辑器」。
     本组正是原探针的覆盖洞：A–F 全都先点「发布」把会话打开，从没测过「会话关着 + 有草稿」。
     反证：删掉 closeMobileComposer 开头的 `if (!isMobileComposerOpen.value) return;` → G2/G3 必红。 */
  {
    console.log('\n--- G 会话未开但本地有草稿（2026-10-18 报障）---');
    const uid = 'a1b2c3d4-0000-4000-8000-000000000003';
    const draftKey = `boh_forum_post_draft_${uid}`;
    const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx3.addInitScript(
      ({ key }) => {
        try {
          localStorage.setItem('boh-theme', 'light');
          localStorage.setItem('boh-home-gate-passed', String(Date.now()));
          localStorage.setItem(
            key,
            JSON.stringify({
              title: '',
              content: '探针：上次没写完的草稿',
              tag: 'daily',
              savedAt: Date.now() - 1000,
            }),
          );
        } catch {
          /* ignore */
        }
      },
      { key: draftKey },
    );
    const page3 = await ctx3.newPage();
    page3.on('pageerror', (e) => errors.push(`[draft-gate] ${String(e.message).slice(0, 160)}`));
    await page3.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
    await injectAuth(page3);
    await page3.waitForSelector('.forum-section-shell', { timeout: 20000 });
    await page3.waitForTimeout(2500);
    const g0 = await snapshot(page3);
    const seeded = await page3.evaluate((k) => localStorage.getItem(k), draftKey);
    check(
      'G1 前置：草稿已回填本地、但发布会话是关的',
      !g0.overlayExists && Boolean(seeded),
      `overlay=${g0.overlayExists} draft=${String(seeded).slice(0, 24)}`,
    );
    await clickRail(page3, '.userspace-rail-item[data-tab="community"]');
    await page3.waitForTimeout(900);
    const g1 = await snapshot(page3);
    check(
      'G2 会话没开时点「内容」不弹「保存草稿」（不打扰）',
      !g1.confirmExists,
      `confirm=${g1.confirmExists} title=${g1.confirmTitle}`,
    );
    await clickRail(page3, '.userspace-rail-item[data-tab="posts"]');
    await page3.waitForTimeout(900);
    const g2 = await snapshot(page3);
    check(
      'G3 会话没开时点「我的」既不弹确认、导航也真的走',
      !g2.confirmExists && g2.activeTab === 'posts',
      `confirm=${g2.confirmExists} activeTab=${g2.activeTab}`,
    );
    const draftKept = await page3.evaluate((k) => localStorage.getItem(k), draftKey);
    check(
      'G4 导航没有吞掉草稿（还在，下次打开编辑器能接着写）',
      Boolean(draftKept),
      String(draftKept).slice(0, 40),
    );
    await page3.screenshot({ path: `${OUT}/G-draft-no-confirm.png` });
    await ctx3.close();
  }

  check('E1 全程零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
