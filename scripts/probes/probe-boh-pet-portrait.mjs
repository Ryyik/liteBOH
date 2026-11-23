/**
 * probe-boh-pet-portrait.mjs — 小方在竖屏手机端的可用性实测（2026-11-23）
 *
 * 起因：小方的气泡/菜单是桌面口径设计的（右键、hover、像素级定位）。
 * 竖屏 390×844 + 触摸有三类问题只有实测看得出来：
 *   1) 几何：气泡 maxWidth 200 + 右缘左锚定 ⇒ 长句溢出右边界被裁；
 *   2) 路径：触摸设备**没有右键**（iOS Safari 对 div 不派发 contextmenu）
 *      ⇒ 菜单进不去 ⇒ 隐藏小方无入口；
 *   3) 触摸目标：菜单项 26px 高，手指点不中（HIG 要求 ≥44px）。
 * 三条都是 2026-11-23 实测发现并修掉的，本探针就是这三条的回归守卫。
 *
 * 断言按「能用的手机」而不是「能跑的手机」：越界、够不着、点不到都算失败。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4181';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
await page.route('**/rest/v1/rpc/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
);

/* 探针自己会把 petEnabled 写成 false（F 段验隐藏），必须保证每次从「开着」起步，
   否则上跑残留的 false 会让整个探针在 A1 就挂掉。 */
await page.addInitScript(() => {
  try {
    const k = 'boh_global_ai_preferences_v1';
    const v = JSON.parse(localStorage.getItem(k) || '{}');
    v.petEnabled = true;
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 隐私模式忽略 */
  }
});

await page.goto(`${BASE}/#/user-space`, { waitUntil: 'load' });
await page.waitForTimeout(9000);

const cdp = await ctx.newCDPSession(page);
const touch = async (x, y, holdMs) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

// ── A. 小方本身是否在竖屏可见、位置是否合理 ──
const pet = await page.evaluate(() => {
  const el = document.querySelector('.boh-pet-block');
  if (!el) return null;
  const b = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    w: Math.round(b.width),
    h: Math.round(b.height),
    edge: el.dataset.petEdge,
    zIndex: cs.zIndex,
    pointerEvents: cs.pointerEvents,
  };
});
check(
  'A1 竖屏下小方存在且可见',
  !!pet,
  pet ? `${pet.w}×${pet.h} @ (${pet.x},${pet.y}) edge=${pet.edge}` : '未找到',
);
check(
  'A2 贴边探头宽度在竖屏合理（不整只挡内容）',
  !!pet && pet.w <= 40,
  pet ? `w=${pet.w}（SIZE/2×0.8 = 32）` : '',
);
check(
  'A3 挂件层级低于底栏/导航（不盖住操作）',
  !!pet && Number(pet.zIndex) < 9999,
  pet ? `z-index=${pet.zIndex}` : '',
);

const cx = pet.x + Math.floor(pet.w / 2);
const cy = pet.y + Math.floor(pet.h / 2);

// ── B. 摸头：触摸长按 350ms 应触发「笑眼 + 台词」 ──
/* ⚠️ 两个探针时序的坑（都不是代码缺陷，2026-11-23 实测确认）：
   1) 不要「先轻点唤醒再长按」：轻点会 openChat()，AI 岛（z 10001）盖在挂件之上，
      第二次长按落到岛上，摸头永远测不出来。直接长按即可（9s ≪ 30s 睡眠阈值）。
   2) 采样必须在**长按中途**：onUp 会把 petting 复位，touchEnd 后再读永远是 false。 */
const readPetState = () =>
  page.evaluate(() => ({
    petting: document.querySelector('.boh-pet-block')?.classList.contains('is-petting'),
    bubbles: [...document.querySelectorAll('.boh-pet-bubble')].map((n) => n.textContent.trim()),
    islandOpen: !!document.querySelector('.boh-island-root.open'),
  }));

await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
await page.waitForTimeout(600);
const petting = await readPetState();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
check('B1 触摸长按触发摸头（is-petting）', !!petting.petting, JSON.stringify(petting));
check(
  'B2 触摸摸头后说出台词（气泡出现）',
  petting.bubbles.length > 0,
  `气泡=${JSON.stringify(petting.bubbles)}`,
);

// 气泡几何：长按后若说了话，量它是否溢出
const liveBubble = await page.evaluate(() => {
  const n = document.querySelector('.boh-pet-bubble');
  if (!n) return null;
  const b = n.getBoundingClientRect();
  const cs = getComputedStyle(n);
  return {
    x: Math.round(b.x),
    right: Math.round(b.right),
    w: Math.round(b.width),
    text: n.textContent.trim(),
    pointerEvents: cs.pointerEvents,
  };
});
if (liveBubble) {
  check(
    'B3 触摸长按后气泡不溢出右边界',
    liveBubble.right <= 390,
    `right=${liveBubble.right}/390 宽 ${liveBubble.w}「${liveBubble.text}」`,
  );
  check(
    'B4 触摸端气泡不吃事件（不挡住下面的内容）',
    liveBubble.pointerEvents === 'none',
    `pointer-events=${liveBubble.pointerEvents}`,
  );
} else {
  check('B3 触摸长按后气泡不溢出右边界', false, '未出现气泡（无法测量）');
  check('B4 触摸端气泡不吃事件（不挡住下面的内容）', false, '未出现气泡（无法测量）');
}

// ── C. 最坏情况几何：把最长台词塞进气泡，量真实溢出 ──
// 直接注入与组件同款 DOM 契约的气泡，宽度按 maxWidth 撑满（最坏情况）
const worst = await page.evaluate(() => {
  document.querySelectorAll('.boh-pet-bubble').forEach((n) => n.remove());
  const petEl = document.querySelector('.boh-pet-block');
  const rect = petEl.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const MAX_W = Math.min(200, Math.max(132, W - 96));
  const el = document.createElement('div');
  el.className = 'boh-pet-bubble';
  el.textContent = '坐挺久了，起来走两步吧？这句特意写得很长用来压最坏情况。';
  el.style.cssText = `position:fixed;right:${Math.round(W - rect.x + 8)}px;top:${Math.round(
    Math.min(Math.max(8, rect.y + 4), H - 96),
  )}px;max-width:${MAX_W}px;padding:8px 11px;border-radius:10px;background:#1d1d1f;color:#fff;font-size:13px;line-height:1.45;`;
  document.body.appendChild(el);
  const b = el.getBoundingClientRect();
  return {
    left: Math.round(b.left),
    right: Math.round(b.right),
    w: Math.round(b.width),
    maxW: MAX_W,
  };
});
check(
  'C1 最坏情况（撑满 maxWidth）气泡两侧都不越界',
  worst.left >= 0 && worst.right <= 390,
  `left=${worst.left} right=${worst.right} 宽=${worst.w} maxWidth=${worst.maxW}`,
);
await page.evaluate(() => document.querySelectorAll('.boh-pet-bubble').forEach((n) => n.remove()));

// ── D. 触摸设备进菜单：双击（唯一可达路径） ──
/* ⚠️ 必须重算坐标：摸头/气泡期间包裹盒会临时变宽（revealed/petting ⇒ 全尺寸 64px），
   过后缩回探头宽度 26px。沿用最初量到的 cx 会点到视口外的空白处。 */
await page.waitForTimeout(600);
const petNow = await page.evaluate(() => {
  const b = document.querySelector('.boh-pet-block').getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
});
await touch(petNow.x, petNow.y, 50);
await page.waitForTimeout(70);
await touch(petNow.x, petNow.y, 50);
await page.waitForTimeout(400);
const menuOpened = await page.evaluate(() => !!document.querySelector('.boh-pet-menu'));
check(
  'D1 触摸双击能打开菜单（触摸无右键的唯一入口）',
  menuOpened,
  menuOpened ? '已打开' : '双击未打开菜单',
);

// ── E. 菜单几何：项高 ≥44px、不越界、能点到 ──
const menuGeom = await page.evaluate(() => {
  const m = document.querySelector('.boh-pet-menu');
  if (!m) return null;
  const items = [...m.querySelectorAll('.boh-pet-menu-item')].map((n) => {
    const b = n.getBoundingClientRect();
    return { text: n.textContent.trim(), w: Math.round(b.width), h: Math.round(b.height) };
  });
  const mb = m.getBoundingClientRect();
  return {
    items,
    x: Math.round(mb.x),
    right: Math.round(mb.right),
    bottom: Math.round(mb.bottom),
    h: Math.round(mb.height),
  };
});
if (menuGeom) {
  const minH = Math.min(...menuGeom.items.map((i) => i.h));
  check(
    'E1 菜单项高度 ≥44px（手指点得到）',
    minH >= 44,
    `最小 ${minH}px：${menuGeom.items.map((i) => `${i.text}(${i.h}px)`).join(' / ')}`,
  );
  check(
    'E2 菜单不越出视口',
    menuGeom.right <= 390 && menuGeom.bottom <= 844,
    `right=${menuGeom.right} bottom=${menuGeom.bottom} 高=${menuGeom.h}`,
  );
} else {
  check('E1 菜单项高度 ≥44px（手指点得到）', false, '菜单未打开，无法测量');
  check('E2 菜单不越出视口', false, '菜单未打开，无法测量');
}

// ── F. 菜单里「隐藏小方」能用触摸点到，且点完真的消失 ──
if (menuOpened) {
  const hideBox = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.boh-pet-menu-item')];
    const hide = items.find((n) => n.textContent.includes('隐藏'));
    if (!hide) return null;
    const b = hide.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  if (hideBox) {
    await touch(hideBox.x, hideBox.y, 60);
    await page.waitForTimeout(900);
    const gone = await page.evaluate(() => ({
      pet: !!document.querySelector('.boh-pet-block'),
      pref: JSON.parse(localStorage.getItem('boh_global_ai_preferences_v1') || '{}').petEnabled,
    }));
    // petEnabled 的存储键名以实际偏好模块为准；取不到就只判 DOM
    check(
      'F1 触摸点击「隐藏小方」后挂件消失',
      !gone.pet,
      `DOM 是否还在=${gone.pet} pref.petEnabled=${gone.pref}`,
    );
    // 恢复：写回偏好并重载，让挂件重新挂上（后续 H 段还要用它）
    await page.evaluate(() => {
      const raw = localStorage.getItem('boh_global_ai_preferences_v1');
      if (!raw) return;
      try {
        const v = JSON.parse(raw);
        v.petEnabled = true;
        localStorage.setItem('boh_global_ai_preferences_v1', JSON.stringify(v));
      } catch {
        /* 忽略 */
      }
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(7000);
    check(
      'F2 重开偏好后挂件恢复（设置页是唯一重开入口）',
      await page.evaluate(() => !!document.querySelector('.boh-pet-block')),
      '重载后挂件是否回来',
    );
  } else {
    check('F1 触摸点击「隐藏小方」后挂件消失', false, '找不到隐藏菜单项');
  }
}

// ── H. 贴底探头 vs 底栏避让（竖屏最容易撞的一块） ──
/* dragBottomPad/bottomPeekPad 在竖屏下取 120/112（桌面 16/8），
   就是为了给 ~75px 高的玻璃底栏留位置。这条断言守的是「别把挂件停在
   底栏上、点导航时点到它」。
   ⚠️ F 段 reload 过，CDP session 要重建，否则触摸事件打不到新页面。 */
const cdp2 = await ctx.newCDPSession(page);
await page.evaluate(() =>
  document.querySelectorAll('.boh-pet-bubble, .boh-pet-menu').forEach((n) => n.remove()),
);
await page.waitForTimeout(400);
const before = await page.evaluate(() => {
  const b = document.querySelector('.boh-pet-block').getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
});
await cdp2.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: before.x, y: before.y }],
});
await page.waitForTimeout(100);
await cdp2.send('Input.dispatchTouchEvent', {
  type: 'touchMove',
  touchPoints: [{ x: 200, y: 800 }],
});
await page.waitForTimeout(300);
await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(900);

const bottomState = await page.evaluate(() => {
  const el = document.querySelector('.boh-pet-block');
  const b = el.getBoundingClientRect();
  const nav = document.querySelector('.bottom-nav-glass');
  const nb = nav?.getBoundingClientRect();
  return {
    edge: el.dataset.petEdge,
    bottom: Math.round(b.bottom),
    navTop: nb ? Math.round(nb.top) : null,
  };
});
check('H1 拖到底部会吸附成底部探头', bottomState.edge === 'bottom', `edge=${bottomState.edge}`);
check(
  'H2 贴底时不压在玻璃底栏上（留出避让间距）',
  bottomState.navTop === null || bottomState.bottom <= bottomState.navTop,
  `挂件 bottom=${bottomState.bottom}，底栏 top=${bottomState.navTop}`,
);

check('G1 全程无页面 JS 异常', pageErrors.length === 0, pageErrors.join(' | '));

// ── I. 横屏手机：底栏避让必须按实测高度，不能按屏型猜 ──
/* 2026-11-23 实测踩出来的真 bug：避让距离原写成 `portrait ? 120 : 16`，
   而 portrait 判据是 max-width:768px —— 横屏手机 844×390 宽度超了 768，
   于是走桌面值 16px，挂件拖到底部时 bottom=212 而底栏 top=93（重叠 119px）。
   挂件 z 59 低于底栏 ⇒ 拖下去就消失、点不到，只能刷新恢复。
   修法：量 `.bottom-nav-glass` 真实高度。这条断言守的就是「别再按屏型猜」。 */
{
  const lctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const lpage = await lctx.newPage();
  const lErrors = [];
  lpage.on('pageerror', (e) => lErrors.push(String(e).slice(0, 160)));
  await lpage.route('**/rest/v1/rpc/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await lpage.goto(`${BASE}/#/user-space`, { waitUntil: 'load' });
  await lpage.waitForTimeout(8000);

  const lcdp = await lctx.newCDPSession(lpage);
  const petL = await lpage.evaluate(() => {
    const b = document.querySelector('.boh-pet-block').getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  await lcdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: petL.x, y: petL.y }],
  });
  await lpage.waitForTimeout(100);
  await lcdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 400, y: 380 }],
  });
  await lpage.waitForTimeout(300);
  await lcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await lpage.waitForTimeout(900);

  const land = await lpage.evaluate(() => {
    const el = document.querySelector('.boh-pet-block');
    const b = el.getBoundingClientRect();
    const nb = document.querySelector('.bottom-nav-glass')?.getBoundingClientRect();
    return {
      petBottom: Math.round(b.bottom),
      navTop: nb && nb.height > 0 ? Math.round(nb.top) : null,
      inViewport: b.bottom <= window.innerHeight + 1 && b.y >= 0,
    };
  });
  check(
    'I1 横屏拖到底部不被底栏盖住（避让按实测高度）',
    land.navTop === null || land.petBottom <= land.navTop,
    `挂件 bottom=${land.petBottom}，底栏 top=${land.navTop}`,
  );
  check('I2 横屏挂件整体在视口内', land.inViewport, JSON.stringify(land));
  check('I3 横屏无 JS 异常', lErrors.length === 0, lErrors.join(' | '));
  await lctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n[portrait] ${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
