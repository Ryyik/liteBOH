// 探针：消息中心「按类型筛选」下拉（2026-11-24 迁 BohDropdown，plans/045 组件 13）
//
// 这份下拉是 BohDropdown 的**首个真实宿主**，也是旧手写实现最典型的形态：
// Teleport 都不需要（原来是 position:absolute 挂在 sticky 页头里）。
//
// 要守住四件事：
//   1) 打开/关闭：点触发器开、再点关、点外部关、Esc 关；
//   2) 选中：点某个类型 → tab 真的切过去 + 面板关闭 + 触发器文案跟着变；
//   3) 形态：面板是 position:fixed（不再被 sticky 页头的堆叠上下文裁空）、
//      不溢出视口（越界要夹回来）、层级压在页头之上；
//   4) 单选语义：role=menuitemradio + aria-checked（无障碍），触发器 aria-expanded 同步。
//
// ⚠️ 这里的「外点」是重点：旧实现靠 `.x-filter-dropdown-wrap` 包一层再用
//    `closest()` 判断，迁成 fixed 浮层后那套选择器失效 —— 组件改用 pointerdown
//    捕获阶段判 target，若哪天被改回 click 冒泡，点面板内部会先关一次再触发选中。
//
// 用法：先 `npm run dev`（默认 5173），再
//   node scripts/probes/probe-boh-dropdown-messages.mjs
//   本机浏览器版本对不上时可指定 channel：PROBE_CHANNEL=chrome
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const URL = `${BASE}/#/user-space?tab=messages&section=notifications`;
const USER_UUID = 'a1b2c3d4-0000-4000-8000-0000000000aa';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

const browser = await chromium.launch({
  channel: process.env.PROBE_CHANNEL || undefined,
  args: ['--no-sandbox'],
});

/** 登录态 + 网络兜底：消息列表不该被真实请求卡住 */
const boot = async (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0' },
      body: '[]',
    });
  });
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(800);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_user', id: uid, role: 'user' });
  }, USER_UUID);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.filter-trigger', { timeout: 30000 });
  await page.waitForTimeout(600);
  return errors;
};

await (async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = await boot(page);

  const panel = () => page.locator('.boh-dropdown__panel');
  const trigger = () => page.locator('.filter-trigger').first();

  // ---------- A) 开 / 关 ----------
  check(
    'A0 触发器存在且初始 aria-expanded=false',
    await trigger().getAttribute('aria-expanded'),
    await trigger().getAttribute('aria-expanded'),
  );
  check('A1 初始面板未渲染（v-if，不是 css 隐藏）', (await panel().count()) === 0);

  await trigger().click();
  await page.waitForTimeout(320);
  check('A2 点触发器打开面板', (await panel().count()) === 1);
  check(
    'A3 触发器 aria-expanded 同步为 true',
    (await trigger().getAttribute('aria-expanded')) === 'true',
  );

  await trigger().click();
  await page.waitForTimeout(320);
  check('A4 再点触发器关闭（不是"先关再开"闪一下）', (await panel().count()) === 0);

  // ---------- B) 形态 ----------
  await trigger().click();
  await page.waitForTimeout(320);
  const geo = await page.evaluate(() => {
    const p = document.querySelector('.boh-dropdown__panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    const tab = document.querySelector('.x-filter-chip');
    return {
      position: cs.position,
      zIndex: cs.zIndex,
      radius: cs.borderTopLeftRadius,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      vw: window.innerWidth,
      vh: window.innerHeight,
      arrow: !!p.querySelector('.boh-dropdown__arrow'),
      align: p.getAttribute('data-align'),
      arrowLeft: (() => {
        const a = p.querySelector('.boh-dropdown__arrow');
        return a ? Math.round(a.getBoundingClientRect().left) : null;
      })(),
      triggerLeft: tab ? Math.round(tab.getBoundingClientRect().left) : 0,
      triggerW: tab ? Math.round(tab.getBoundingClientRect().width) : 0,
    };
  });
  /* position 必须是 fixed：原来 absolute 挂在 sticky 页头里，
     那是个堆叠上下文，面板一旦加 backdrop-filter 就会被裁空（源码注释记过）。
     迁成 fixed + Teleport 后不再受祖先影响。 */
  check(
    'B1 面板是 position:fixed（不受 sticky 页头堆叠上下文影响）',
    geo?.position === 'fixed',
    geo?.position,
  );
  check('B2 层级读 --boh-z-modal（2147482600）', geo?.zIndex === '2147482600', geo?.zIndex);
  check(
    'B3 不溢出视口（右侧与底部都在边距内）',
    geo && geo.x + geo.w <= geo.vw - 11 && geo.y + geo.h <= geo.vh - 11,
    JSON.stringify(geo),
  );
  /* 🔴 B4 必须能抓住「指示器被裁掉」这种真回归，但**不能**用点击命中判据：
     箭头是旋转 45° 的方块，中心压在面板上边界（elementFromPoint 命中 panel）；
     尖角那 2px 又会被页面头部这类同样铺在全屏的元素命中 —— 两种点都测不准，
     实测各误判过一次。真正的原因很明确、也就一条：面板自身 `overflow` 裁切。
     判据改为：
       ① 箭头元素存在且有尺寸；
       ② 面板的 overflow 是 visible（一旦改回 auto/hidden，箭头就会被裁）；
       ③ 滚动能力挪到了内层 __scroll（否则"去掉 overflow"等于牺牲可滚动）。
     三条一起才能保证「箭头露得出来 + 长列表还能滚」。 */
  const arrowVisible = await page.evaluate(() => {
    const a = document.querySelector('.boh-dropdown__arrow');
    const p = document.querySelector('.boh-dropdown__panel');
    const scroll = p?.querySelector('.boh-dropdown__scroll');
    if (!a || !p) return { present: !!a };
    const r = a.getBoundingClientRect();
    return {
      present: true,
      sized: r.width >= 6 && r.height >= 6,
      panelOverflow: getComputedStyle(p).overflow,
      hasScrollLayer: !!scroll,
      scrollOverflowY: scroll ? getComputedStyle(scroll).overflowY : null,
    };
  });
  check(
    'B4 指示器露得出（面板不裁切）+ 滚动能力在内层',
    arrowVisible.present === true &&
      arrowVisible.sized === true &&
      arrowVisible.panelOverflow === 'visible' &&
      arrowVisible.hasScrollLayer === true &&
      arrowVisible.scrollOverflowY === 'auto',
    JSON.stringify(arrowVisible),
  );

  check('B5 面板宽度不小于宿主要的 minWidth=196', geo && geo.w >= 196, `${geo?.w}`);
  /* 指示器要指向触发器。踩过：死写 left:18px，-end 档箭头飘到面板另一头，
     看着像"接错了按钮"。判据：箭头水平位置落在触发器横向范围内。 */
  check(
    'B6 指示器对准触发器（横向落在触发器范围内）',
    geo &&
      geo.arrowLeft != null &&
      geo.arrowLeft >= geo.triggerLeft - 12 &&
      geo.arrowLeft <= geo.triggerLeft + geo.triggerW,
    JSON.stringify({
      arrowLeft: geo?.arrowLeft,
      triggerLeft: geo?.triggerLeft,
      triggerW: geo?.triggerW,
    }),
  );

  // ---------- C) 单选语义 ----------
  const a11y = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.boh-dropdown__panel .x-filter-option')];
    return {
      count: items.length,
      roles: [...new Set(items.map((el) => el.getAttribute('role')))],
      checked: items.filter((el) => el.getAttribute('aria-checked') === 'true').length,
      labels: items.map((el) => el.textContent.trim().split(/\s+/)[0]),
    };
  });
  check(
    'C1 每个选项都是 role=menuitemradio',
    a11y.roles.length === 1 && a11y.roles[0] === 'menuitemradio',
    JSON.stringify(a11y.roles),
  );
  check('C2 恰好一个 aria-checked=true（单选语义）', a11y.checked === 1, `${a11y.checked}`);
  check('C3 选项与 NOTIFICATION_TABS 对齐（7 项）', a11y.count === 7, `${a11y.count}`);

  // ---------- D) 选中 ----------
  const beforeText = (await trigger().innerText()).trim();
  // 选「点赞」（第 3 项）
  await page.locator('.boh-dropdown__panel .x-filter-option').nth(2).click();
  await page.waitForTimeout(420);
  check('D1 选中后面板关闭', (await panel().count()) === 0);
  check(
    'D2 触发器 aria-expanded 回到 false',
    (await trigger().getAttribute('aria-expanded')) === 'false',
  );
  const afterText = (await trigger().innerText()).trim();
  check(
    'D3 触发器文案跟着变（不再显示原类型）',
    afterText !== beforeText,
    `${beforeText} → ${afterText}`,
  );
  const activeTab = await page.evaluate(() => {
    const el = document.querySelector('.x-notifications-container');
    const st = el?.__vueParentComponent;
    let c = st;
    while (c && c.setupState?.currentTab === undefined) c = c.parent;
    return c ? c.setupState.currentTab : null;
  });
  check('D4 currentTab 真的切到 like', activeTab === 'like', String(activeTab));

  // ---------- E) 外点关闭（重点） ----------
  await trigger().click();
  await page.waitForTimeout(320);
  check('E1 重新打开', (await panel().count()) === 1);

  /* ⚠️ 这里刻意**不**断言「外部点击不传达到落点元素」：试过一版，
     pointerdown 捕获与 click 冒泡两种实现下，落点元素都会收到 click
     （关面板只移除了浮层 DOM，并不阻止浏览器继续派发后续 click），
     所以那条判据抓不到任何差别，属于自欺欺人的假绿，已删。
     外点关闭真正要守的就是「关得掉」+「不误伤面板内部」两件事。 */
  await page.mouse.click(20, 20);
  await page.waitForTimeout(320);
  check('E2 点面板外部关闭', (await panel().count()) === 0);

  // 点面板内部不能关（旧实现靠 wrap.closest 判断，迁 fixed 后那套会失效）
  await trigger().click();
  await page.waitForTimeout(320);
  await page.locator('.boh-dropdown__panel').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(320);
  check('E4 点面板内部不关闭（外点判据没误伤）', (await panel().count()) === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ---------- F) Esc ----------
  await trigger().click();
  await page.waitForTimeout(320);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(320);
  check('F1 Esc 关闭面板', (await panel().count()) === 0);
  /* F2/F3 是一对，缺一条就会假绿：
     只测「关闭后焦点在触发器上」抓不到问题 —— 如果焦点压根没进过面板，
     移除面板时浏览器把焦点退给 body，再被后续逻辑补回触发器，看着照样对。
     必须先证明「打开时焦点**真的进了面板**」，归还才有意义。 */
  /* F2 的判据必须让焦点**离开过触发器**才有效。
     踩过：打开时若焦点还在触发器上，关闭后浏览器自然把它留在原地，
     "焦点在触发器上"会毫无条件地成立 —— 去掉归还逻辑也照样绿（反证实测）。
     所以先把焦点移到面板第 3 项（与本菜单承载的 tab 无关，纯粹造位移），
     再 Esc，此时只有真的做过归还才会回到触发器。 */
  await trigger().click();
  await page.waitForTimeout(420);
  /* ⚠️ 不能用 `el.focus()` 手动造位移：Vue 在同一轮里重渲染，焦点会被丢掉，
     结果 hadFocusInside 判成 false、归还逻辑根本不执行 —— 这条断言就会以
     「焦点其实从未进过面板」为前提假绿/假红。
     用键盘 Tab 走真实路径：打开时焦点已自动落在第一项，Tab 到第三项。 */
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const movedAway = await page.evaluate(
    () => !document.activeElement?.classList.contains('filter-trigger'),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(360);
  check(
    'F2 Esc 后焦点归还触发器（WCAG 2.4.3；此处焦点先已离开触发器）',
    movedAway &&
      (await page.evaluate(
        () => document.activeElement?.classList.contains('filter-trigger') === true,
      )),
    `离开触发器=${movedAway}`,
  );

  await trigger().click();
  await page.waitForTimeout(420);
  check(
    'F3 打开时焦点真的进入面板（键盘用户才能操作菜单项）',
    await page.evaluate(() =>
      Boolean(document.querySelector('.boh-dropdown__panel')?.contains(document.activeElement)),
    ),
    await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(320);

  // ---------- G) 窄屏上拉 ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await trigger().click();
  await page.waitForTimeout(420);
  const sheet = await page.evaluate(() => {
    const p = document.querySelector('.boh-dropdown__panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return {
      isSheet: p.classList.contains('boh-dropdown__panel--sheet'),
      x: Math.round(r.x),
      w: Math.round(r.width),
      bottom: Math.round(r.bottom),
      vw: window.innerWidth,
      vh: window.innerHeight,
      arrow: getComputedStyle(p.querySelector('.boh-dropdown__arrow') || document.body).display,
    };
  });
  /* 窄屏（≤900）改底部上拉：这与 PostComposer 既有口径一致。
     判据是"贴底 + 左右留 12px"，不是贴触发器。 */
  check('G1 窄屏走上拉形态（带 --sheet 类）', sheet?.isSheet === true, JSON.stringify(sheet));
  /* 底部留 12px 安全边距（不是贴到 844）：与左右边距同值，避免压住 home indicator */
  check(
    'G2 窄屏面板靠底且四边留 12px',
    sheet &&
      Math.abs(sheet.vh - sheet.bottom - 12) <= 1 &&
      Math.abs(sheet.x - 12) <= 1 &&
      Math.abs(sheet.x + sheet.w - (sheet.vw - 12)) <= 1,
    JSON.stringify(sheet),
  );

  check('H1 无 JS 错误', errors.length === 0, errors.join(' | '));

  await ctx.close();
})();

await browser.close();
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
