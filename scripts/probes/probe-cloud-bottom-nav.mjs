/**
 * probe-cloud-bottom-nav.mjs — 图库页底栏的「横屏不出、竖屏随滚动收起」契约
 *
 * 用户口径（2026-11-05）：
 *   · 横屏不出现底栏（≥1024 由左栏接管，底栏再出现就是两套同样的五席）
 *   · 竖屏底栏跟随滚动收起 / 到顶恢复，与首页 / 我 / 周边同一套手感
 *
 * 为什么单独一条探针：这两件事都**只在特定视口下**成立，桌面窗口里跑什么都绿；
 * 而且图库的底栏是 .cloud-page 的**兄弟**节点（挂在 CloudPlusMain 根层），
 * 选择器写错（`.cloud-page .bottom-nav-glass`）就永远匹配不到 —— 已踩过一次。
 *
 * 三组断言：
 *   A 竖屏 390×844：滚下 → 底栏收起（.is-hidden）；回到顶部 → 恢复
 *   B 横屏 1280×800：底栏 computed display 必须是 none，且左栏在；**同时跑「我」页做对照**
 *   C 手机横屏 844×390：与「我」页形态一致（这一档按 Duo 设计是贴右竖胶囊，
 *     不是贴底横条 —— 断言的是「两页一致」，不是「一定没有」）
 *
 * 用法：
 *   npx vite preview --outDir dist --port 4180 --strictPort
 *   node scripts/probes/probe-cloud-bottom-nav.mjs http://[::1]:4180
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';

const violations = [];
const rows = [];

const browser = await chromium.launch({ channel: 'chrome' });

const injectLogin = (page) =>
  page.evaluate(() => {
    try {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      auth.isInitialized = true;
      Object.assign(auth.userInfo, {
        id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
        username: 'probe_user',
        role: 'user',
        points: 42,
      });
      return true;
    } catch {
      return false;
    }
  });

/**
 * 打开一个视口 → 落到目标页 → 注入登录并等首屏稳定。
 *
 * ⚠️ 必须**先进首页注入登录态，再改 hash 到目标页**：`/user-space*` 带
 * `meta.requiresLogin`，首屏直接打开时 `from.name` 为空 ⇒ 守卫走 `next('/')`
 * 把用户弹回首页 —— 探针会以为「图库没有底栏」，实际测的是首页（踩过一次）。
 */
const openPage = async (viewport, hash) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const loggedIn = await injectLogin(page);
  if (!loggedIn) {
    violations.push(`${hash}：pinia 注入登录态失败，后续判定不可用`);
  }
  await page.evaluate((target) => {
    window.location.hash = target;
  }, hash);
  await page.waitForTimeout(1800);
  return { ctx, page };
};

/** 底栏的可观测状态：computed display / class / 几何 */
const navState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.bottom-nav-glass');
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      present: true,
      display: cs.display,
      opacity: cs.opacity,
      hiddenClass: el.classList.contains('is-hidden'),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });

const railState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.userspace-rail');
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      present: true,
      display: cs.display,
      visible: rect.width > 0 && rect.height > 0 && cs.display !== 'none',
    };
  });

/* 图库是底栏席位（与 内容 / 消息 / 周边 / 我 平级），页头不该有返回按钮：
   2026-11-05 删掉的那个「返回」恒落「我」页（只有带 ?from=userspace* 才认来路，
   而首页 hero / 页脚 / 历史页 / 全站搜索都是裸 push('/user-space/note')），
   从首页点「立即体验」进来按返回却落到「我」，比没有按钮更误导。
   这条断言防它被「子页都要有返回」的直觉加回来 —— 真需要回上一级时，
   动画片段的出口是 SegmentTabs 的「内容」，跨页的出口是底栏 / 左栏。 */
const backButtonPresent = (page) =>
  page.evaluate(() => Boolean(document.querySelector('.user-center-page-header .header-back')));

/** 确认真的落在目标路由（否则后面所有「没有底栏」的读数都是在别的页面上量的） */
const assertLanded = async (page, hash, label) => {
  const actual = await page.evaluate(() => window.location.hash);
  if (!actual.includes(hash)) {
    violations.push(`${label}：导航没有落到 ${hash}（实际 ${actual}）—— 本组读数不可用`);
    return false;
  }
  return true;
};

/* ═════════════ A. 竖屏：底栏随滚动收起、到顶恢复 ═════════════ */
{
  const { ctx, page } = await openPage({ width: 390, height: 844 }, '/user-space/note');
  await assertLanded(page, '/user-space/note', 'A');
  // 图库在无真实账号时内容是空的 ⇒ 页面可能不够高、scrollBy 无效。
  // 塞一段等高占位保证「能滚」：这里测的是滚动方向联动，不是内容高度。
  await page.evaluate(() => {
    const host = document.querySelector('.cloud-page');
    if (!host) return;
    const spacer = document.createElement('div');
    spacer.id = 'probe-scroll-spacer';
    spacer.style.height = '2400px';
    host.appendChild(spacer);
  });
  await page.waitForTimeout(200);

  const before = await navState(page);

  /*
   * ⚠️ 必须**分多步**滚：useScrollDirectionHide 的第一帧只用来记基准位置
   * （`previousPosition === undefined` 直接 return），一次性 `scrollTo(0, 520)`
   * 只产生一个 scroll 事件 ⇒ travel 永远是 0 ⇒ 底栏不会收起。
   * 这不是 bug，是「按方向累积位移」的设计；探针要照真实手指那样一步步滚。
   */
  const scrollInSteps = async (from, to, step = 90) => {
    const direction = to > from ? 1 : -1;
    for (let y = from; direction > 0 ? y < to : y > to; y += step * direction) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(60);
    }
    await page.evaluate((top) => window.scrollTo(0, top), to);
    await page.waitForTimeout(360);
  };

  await scrollInSteps(0, 520);
  const scrolled = await navState(page);
  await scrollInSteps(520, 0);
  const backToTop = await navState(page);

  rows.push({ name: 'A 竖屏：底部→收起', value: scrolled.hiddenClass ? '收起 ✓' : '未收起 ✗' });
  rows.push({ name: 'A 竖屏：到顶→恢复', value: !backToTop.hiddenClass ? '恢复 ✓' : '未恢复 ✗' });

  if (!before.present) violations.push('A：竖屏下图库没有底栏 —— 这条断言无从谈起');
  if (!scrolled.hiddenClass) {
    violations.push(
      'A：竖屏下滑后底栏没有收起（useScrollDirectionHide 未生效 / 事件没挂上 window 滚动）',
    );
  }
  if (backToTop.hiddenClass) violations.push('A：回到顶部后底栏没有恢复显示');

  // 页头返回按钮：底栏席位不该有（见 backButtonPresent 上的注释）
  const hasBackButton = await backButtonPresent(page);
  rows.push({ name: 'A 竖屏：页头无返回按钮', value: hasBackButton ? '有 ✗' : '无 ✓' });
  if (hasBackButton) {
    violations.push(
      'A：图库页头又出现了返回按钮 —— 它是底栏席位，且那个返回恒落「我」页（与来路无关）',
    );
  }
  await ctx.close();
}

/* ═════════════ B. 横屏 ≥1024：底栏必须消失，左栏接管（含「我」页对照）═════════════ */
{
  const CLOUD = '/user-space/note';
  const ME = '/user-space?tab=posts';
  const cloud = await openPage({ width: 1280, height: 800 }, CLOUD);
  await assertLanded(cloud.page, CLOUD, 'B/图库');
  const cloudNav = await navState(cloud.page);
  const cloudRail = await railState(cloud.page);

  const me = await openPage({ width: 1280, height: 800 }, ME);
  await assertLanded(me.page, '/user-space?tab=posts', 'B/我页');
  const meNav = await navState(me.page);
  const meRail = await railState(me.page);

  rows.push({
    name: 'B 横屏 1280：图库底栏',
    value: cloudNav.present ? `${cloudNav.display}` : '不存在 ✓',
  });
  rows.push({
    name: 'B 横屏 1280：我页底栏（对照）',
    value: meNav.present ? `${meNav.display}` : '不存在 ✓',
  });
  rows.push({
    name: 'B 横屏 1280：图库左栏',
    value: cloudRail.visible ? '在 ✓' : '不在 ✗',
  });
  rows.push({
    name: 'B 横屏 1280：我页左栏（对照）',
    value: meRail.visible ? '在' : '不在',
  });

  const cloudHidden = !cloudNav.present || cloudNav.display === 'none';
  const meHidden = !meNav.present || meNav.display === 'none';
  if (!cloudHidden) {
    violations.push(
      `B：1280×800 横屏下图库仍渲染底栏（display=${cloudNav.display}）—— 左栏已接管，两套导航不该并存`,
    );
  }
  if (meHidden !== cloudHidden) {
    violations.push(`B：图库与「我」页口径不一致（图库底栏隐藏=${cloudHidden}，我页=${meHidden}）`);
  }
  if (!cloudRail.visible) violations.push('B：1280 横屏下图库没有左栏 —— 导航彻底消失了');

  await cloud.ctx.close();
  await me.ctx.close();
}

/* ═════════════ C. 手机横屏：与「我」页同形态（Duo 贴右竖胶囊）═════════════ */
{
  const cloud = await openPage({ width: 844, height: 390 }, '/user-space/note');
  await assertLanded(cloud.page, '/user-space/note', 'C/图库');
  const me = await openPage({ width: 844, height: 390 }, '/user-space?tab=posts');
  await assertLanded(me.page, '/user-space?tab=posts', 'C/我页');
  const cloudNav = await navState(cloud.page);
  const meNav = await navState(me.page);

  const shapeOf = (nav) =>
    nav.present && nav.display !== 'none'
      ? nav.rect.h > nav.rect.w
        ? '贴右竖胶囊'
        : '贴底横条'
      : '无底栏';

  const cloudShape = shapeOf(cloudNav);
  const meShape = shapeOf(meNav);
  rows.push({ name: 'C 手机横屏 844×390：图库', value: cloudShape });
  rows.push({ name: 'C 手机横屏 844×390：我页（对照）', value: meShape });

  if (cloudShape !== meShape) {
    violations.push(`C：844×390 下图库底栏形态「${cloudShape}」与「我」页「${meShape}」不一致`);
  }
  if (cloudShape === '贴底横条') {
    violations.push('C：手机横屏下底栏仍是贴底横条 —— 按 Duo 设计这一档应是贴右竖胶囊');
  }

  await cloud.ctx.close();
  await me.ctx.close();
}

/* ═════════════ D. 竖屏：收起后离开再回来，底栏不能「卡在收起态」 ═════════════ */
/* 缓存实例（meta.keepAlive）回来时不会重跑 setup，hidden 是上一段滚动留下的状态 ——
   CloudPlusMain 的 onActivated 里有 resetBottomNavAutoHide() 兜这一手。
   没有它，用户会看到「点回图库，底栏不在下面」，得再滑一下才回来。 */
{
  const { ctx, page } = await openPage({ width: 390, height: 844 }, '/user-space/note');
  await assertLanded(page, '/user-space/note', 'D');
  await page.evaluate(() => {
    const host = document.querySelector('.cloud-page');
    if (!host) return;
    const spacer = document.createElement('div');
    spacer.style.height = '2400px';
    host.appendChild(spacer);
  });
  await page.waitForTimeout(200);
  for (let y = 0; y <= 520; y += 90) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(360);
  const hiddenBeforeLeaving = (await navState(page)).hiddenClass;

  // 切去「我」再切回图库（两个都走缓存实例，正是 keepAlive 的路径）
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.bottom-nav-glass .nav-item')].find((el) =>
      (el.textContent || '').includes('我'),
    );
    button?.click();
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.bottom-nav-glass .nav-item')].find((el) =>
      (el.textContent || '').includes('图库'),
    );
    button?.click();
  });
  await page.waitForTimeout(1400);
  const navBack = await navState(page);

  rows.push({
    name: 'D 竖屏：收起后回来',
    value: hiddenBeforeLeaving && !navBack.hiddenClass ? '复位 ✓' : '卡在收起 ✗',
  });
  if (!hiddenBeforeLeaving) {
    violations.push('D：前置条件不成立（离开前底栏并没有收起），本组读数不可用');
  } else if (navBack.hiddenClass) {
    violations.push(
      'D：回到图库时底栏卡在收起态 —— 缓存实例的 onActivated 没有复位 useScrollDirectionHide',
    );
  }
  await ctx.close();
}

await browser.close();

console.log('\n场景                                     结果');
console.log('--------------------------------------------------------');
for (const row of rows) console.log(`${row.name.padEnd(40, ' ')} ${row.value}`);

if (violations.length) {
  console.error(`\n✗ probe-cloud-bottom-nav：${violations.length} 处不符`);
  for (const message of violations) console.error(`  · ${message}`);
  process.exit(1);
}

console.log('\n✓ probe-cloud-bottom-nav：图库底栏在三种视口下都与「我」页同口径，横屏不出现。');
