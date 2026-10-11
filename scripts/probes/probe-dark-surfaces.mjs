import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：暗色模式「表面可用性」—— 背景亮度 + 真实对比度（2026-10-11 用户报障）
//
// 背景（用户原话）：
//   「暗色模式下的一些问题，搜索框很奇怪，有一圈白色，然后签到按钮全黑了看不清楚，
//     分页 tab 选中态看不清楚；签到面板打开后是纯白的；帖子详情部分文本颜色没有变，
//     黑底黑字看不清楚，发送按钮也是」
//
// 五条真因（都在"浅色主题里合理"的写法上，暗色缺覆盖）：
//   ① 论坛工具栏 ≥1024 档是「容器即输入框」：容器 55% 白玻璃 + 输入区 transparent，
//      而通用 `[data-theme=dark] .forum-page input` 又把输入区刷成深色 ⇒ 深芯 + 白环；
//   ② 分页页签（SegmentTabs）用 `--text-primary/--text-secondary`，这两个变量只由
//      .user-space-page 定义 ⇒ 首页宿主拿不到，回落浅色 fallback（近黑字 / 近黑下划线）；
//   ③ 签到 pill 的 `.is-done` 文字色 #3f4a5a 是给白玻璃写的深字；
//   ④ 签到面板整块硬编码浅色（#f9fcfd 卡 + 深字），且 Teleport 到 body；
//   ⑤ 详情弹窗正文区已改用 .pd-* 命名，而 post-detail-dark.css 只认旧类名；
//      实心按钮用 `background: var(--liquid-text-primary)` + `color: #fff`
//      —— 浅色下是黑底白字、暗色下变成白底白字。
//
// 断言口径：**不看 class、不看有没有暗色规则**，直接量「元素最终计算出的
// 背景亮度 / 前景背景对比度」。所以这组断言对"加了规则但被后加载的 scoped
// 样式压掉"（本次真实踩过：PostDetailMain 的 [data-v-*] 晚于主题文件加载）
// 依然会红 —— 那正是纯 class 断言会假绿的地方。
//
// 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）
// 运行：node scripts/probes/probe-dark-surfaces.mjs
//
// counter-proof（撤掉修复必须转红，实测见 plan/commit message）：
//   1) 撤掉 forum-dark.css 的 `.forum-toolbar` 块   → A1/A2 红
//   2) 撤掉 forum-dark.css 的 `html[data-theme=dark] .checkin-modal` 系列 → C* 红
//   3) 撤掉 post-detail-dark.css 的 `--detail-*` 变量段 → D1/D2 红
//   4) 撤掉 post-detail-dark.css 的 `.pd-follow-btn` 段 → D3/D4 红
//   5) 撤掉 Shop style.scoped.css 的 `.mascot-copy` 段 → E1 红
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots/dark-surfaces';
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
  await page.waitForTimeout(400);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      Object.assign(auth.userInfo, {
        id: 'a1b2c3d4-0000-4000-8000-000000000003',
        username: 'probe_dark_surfaces',
        role: 'user',
        points: 42,
      });
    });
    await page.waitForTimeout(300);
  }
};

/** 页面内取样：返回每个选择器最终渲染出的背景亮度与前后景对比度 */
const SAMPLE = (sels) => {
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const bodyBase = parse(getComputedStyle(document.body).backgroundColor) || {
    r: 20,
    g: 20,
    b: 20,
    a: 1,
  };
  const cache = new WeakMap();
  function effectiveBg(el) {
    if (cache.has(el)) return cache.get(el);
    let res;
    if (!el.parentElement) res = bodyBase;
    else {
      const under = effectiveBg(el.parentElement);
      const cs = getComputedStyle(el);
      const c = parse(cs.backgroundColor);
      res = !c || c.a === 0 ? under : c.a >= 1 ? c : blend(c, under);
    }
    cache.set(el, res);
    return res;
  }
  const out = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) {
      out[sel] = { exists: false };
      continue;
    }
    const cs = getComputedStyle(el);
    const own = parse(cs.backgroundColor);
    const ownLum = own ? lum(own) : null;
    const col = parse(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
    const eff = effectiveBg(el);
    const effLum = lum(eff);
    out[sel] = {
      exists: true,
      bgCss: cs.backgroundColor,
      colorCss: cs.color,
      ownBgLum: ownLum === null ? null : +ownLum.toFixed(3),
      effBgLum: +effLum.toFixed(3),
      contrast: +ratio(lum(col), effLum).toFixed(2),
      text: (el.textContent || '').trim().slice(0, 16),
    };
  }
  return out;
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem('boh-theme', 'dark');
    localStorage.setItem('boh-home-gate-passed', String(Date.now()));
  } catch {
    /* ignore */
  }
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await injectAuth(page);
await page.waitForSelector('.forum-toolbar', { timeout: 20000 });
await page.waitForTimeout(2200);

check(
  'A0 主题已进入暗色',
  (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark',
);

// ─────────────── A. 首页/AI 工具栏：无白环、文字可读 ───────────────
const a = await page.evaluate(SAMPLE, [
  '.forum-toolbar',
  '.forum-toolbar .toolbar-search-input',
  '.toolbar-ai-btn',
]);
/* ⚠️ 判「是不是白玻璃」要看**元素自身的** background-color，不能只看合成亮度：
   55% 白玻璃叠在深底上合成亮度只有 ≈0.27，拿"合成后 < 0.35"当阈值会假绿
   （2026-10-11 反证时实测踩到：撤掉修复这条依然 PASS）。 */
check(
  'A1 工具栏容器自身背景已翻深色（非白玻璃）',
  a['.forum-toolbar']?.ownBgLum < 0.35,
  JSON.stringify(a['.forum-toolbar']),
);
/* 「一圈白色」的本质是**容器与输入区不同色系**（容器白 55% / 输入区被通用 input
   规则刷成深色）。所以这里断言两者合成亮度之差，而不是各自是否够深。 */
check(
  'A2 搜索输入区与容器同色系（无白环套深芯）',
  Math.abs(
    (a['.forum-toolbar']?.effBgLum ?? 1) -
      (a['.forum-toolbar .toolbar-search-input']?.effBgLum ?? 0),
  ) < 0.1,
  JSON.stringify({
    container: a['.forum-toolbar']?.effBgLum,
    input: a['.forum-toolbar .toolbar-search-input']?.effBgLum,
  }),
);
check(
  'A3 工具栏内 BOHAI 按钮文字可读',
  a['.toolbar-ai-btn']?.contrast >= 3,
  JSON.stringify(a['.toolbar-ai-btn']),
);

// ─────────────── B. 分页页签选中态（SegmentTabs） ───────────────
const b = await page.evaluate(SAMPLE, [
  '.segment-tab.active',
  '.segment-tab:not(.active)',
  '.segment-tab-indicator',
]);
check(
  'B1 选中页签文字在暗底上可读',
  b['.segment-tab.active']?.contrast >= 3,
  JSON.stringify(b['.segment-tab.active']),
);
check(
  'B2 未选中页签文字可读',
  b['.segment-tab:not(.active)']?.contrast >= 3,
  JSON.stringify(b['.segment-tab:not(.active)']),
);
check(
  'B3 页签下划线是亮色（暗底可见）',
  (await page.evaluate(
    () => getComputedStyle(document.querySelector('.segment-tab-indicator')).backgroundColor,
  )) === 'rgb(245, 245, 247)',
  '期望 --liquid-text-primary 的暗色值',
);

// ─────────────── C. 周签到 pill：文字不能隐形 ───────────────
const c = await page.evaluate(SAMPLE, ['.toolbar-checkin-btn', '.toolbar-hero-pill']);
check(
  'C1 签到入口（未签态）文字可读',
  (c['.toolbar-checkin-btn']?.contrast ?? 0) >= 3 || (c['.toolbar-hero-pill']?.contrast ?? 0) >= 3,
  JSON.stringify({ checkin: c['.toolbar-checkin-btn'], hero: c['.toolbar-hero-pill'] }),
);
/* 用户看到的是**已签态**（"签到按钮全黑了看不清楚"）：.is-done 的文字色
   #3f4a5a 是给白玻璃底写的深字，暗底上等于隐形。这里就地打上 .is-done 量一次。 */
const c2 = await page.evaluate(() => {
  const el =
    document.querySelector('.toolbar-checkin-btn') || document.querySelector('.toolbar-hero-pill');
  if (!el) return null;
  el.classList.add('is-done');
  const cs = getComputedStyle(el);
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = (c) => 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  const fg = parse(cs.color);
  const bg = parse(cs.backgroundColor);
  const contrast = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05);
  el.classList.remove('is-done');
  return { color: cs.color, bg: cs.backgroundColor, contrast: +contrast.toFixed(2) };
});
check('C2 签到入口（已签态 .is-done）文字可读', (c2?.contrast ?? 0) >= 3, JSON.stringify(c2));

// ─────────────── D. 签到面板（Teleport 到 body） ───────────────
await page.evaluate(() => {
  const btn =
    document.querySelector('.toolbar-checkin-btn') || document.querySelector('.toolbar-hero-pill');
  btn?.click();
});
await page.waitForTimeout(1400);
const d = await page.evaluate(SAMPLE, [
  '.checkin-modal',
  '.checkin-title',
  '.checkin-kicker',
  '.checkin-week-section',
  '.checkin-next-row',
  '.checkin-week-day-label',
]);
check(
  'D1 签到面板已翻深色（非纯白）',
  d['.checkin-modal']?.effBgLum < 0.35,
  JSON.stringify(d['.checkin-modal']),
);
check('D2 面板标题可读', d['.checkin-title']?.contrast >= 4.5, JSON.stringify(d['.checkin-title']));
check(
  'D3 面板 Kicker 可读',
  d['.checkin-kicker']?.contrast >= 3,
  JSON.stringify(d['.checkin-kicker']),
);
check(
  'D4 日历区块 + 下次签到行已翻深色',
  (d['.checkin-week-section']?.effBgLum ?? 1) < 0.4 &&
    (d['.checkin-next-row']?.effBgLum ?? 1) < 0.4,
  JSON.stringify({ week: d['.checkin-week-section'], next: d['.checkin-next-row'] }),
);
check(
  'D5 星期标签可读',
  d['.checkin-week-day-label']?.contrast >= 3,
  JSON.stringify(d['.checkin-week-day-label']),
);
await page.screenshot({ path: `${OUT}/checkin.png` });
await page.evaluate(() => document.querySelector('.checkin-close')?.click());
await page.waitForTimeout(700);

// ─────────────── E. 帖子详情弹窗（.pd-* 命名，横屏） ───────────────
await page.evaluate(() => {
  document.querySelector('.post-card-v2')?.click();
});
await page.waitForSelector('.pd-title', { timeout: 20000 });
await page.waitForTimeout(1600);
const e = await page.evaluate(SAMPLE, [
  '.pd-title',
  '.pd-comments-head',
  '.pd-follow-btn',
  '.pd-reply-send',
  '.post-detail-page',
]);
check(
  'E1 详情标题在暗底上可读（原为 #111827 黑字）',
  e['.pd-title']?.contrast >= 4.5,
  JSON.stringify(e['.pd-title']),
);
check(
  'E2 评论区计数可读',
  e['.pd-comments-head']?.contrast >= 4.5,
  JSON.stringify(e['.pd-comments-head']),
);
check(
  'E3 关注按钮"底色 ≠ 字色"（原为白底白字）',
  e['.pd-follow-btn']?.contrast >= 4.5,
  JSON.stringify(e['.pd-follow-btn']),
);
check(
  'E4 发送按钮"底色 ≠ 字色"（原为白底白字）',
  e['.pd-reply-send']?.contrast >= 4.5,
  JSON.stringify(e['.pd-reply-send']),
);
check(
  'E5 详情页底色仍是暗色（反色按钮白底属预期，页面本身不能翻亮）',
  e['.post-detail-page']?.effBgLum < 0.3,
  JSON.stringify(e['.post-detail-page']),
);
await page.screenshot({ path: `${OUT}/post-detail.png` });

// ─────────────── F. 商店页（同类扫描发现的白底白字） ───────────────
await page.evaluate(() => {
  document.querySelector('.pd-modal-close')?.click();
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  window.location.hash = '#/shop';
});
await page.waitForSelector('.shop-page', { timeout: 20000 });
await page.waitForTimeout(2200);
const f = await page.evaluate(SAMPLE, [
  '.shop-search',
  '.shop-search input',
  '.shop-bottom-nav',
  '.shop-bottom-nav .nav-label',
]);
check(
  'F1 商店搜索框已翻深色',
  f['.shop-search']?.effBgLum < 0.35,
  JSON.stringify(f['.shop-search']),
);
check(
  'F2 搜索框内文字可读',
  f['.shop-search input']?.contrast >= 4.5,
  JSON.stringify(f['.shop-search input']),
);
check(
  'F3 悬浮底栏已翻深色',
  f['.shop-bottom-nav']?.effBgLum < 0.4,
  JSON.stringify(f['.shop-bottom-nav']),
);
check(
  'F4 底栏标签可读',
  f['.shop-bottom-nav .nav-label']?.contrast >= 3,
  JSON.stringify(f['.shop-bottom-nav .nav-label']),
);
const heroTitle = await page.evaluate(() => {
  const el = document.querySelector('.mascot-copy h2');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const m = /rgba?\(([^)]+)\)/.exec(cs.color);
  const p = m[1].split(',').map(Number);
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  return { color: cs.color, lum: +lum.toFixed(3), text: el.textContent.trim().slice(0, 12) };
});
// hero 文案卡是"白底产品图上的白玻璃卡"，卡内文字必须是深色（亮度低）
check(
  'F5 hero 文案卡内标题为深字（白卡上可读）',
  heroTitle && heroTitle.lum < 0.3,
  JSON.stringify(heroTitle),
);
await page.screenshot({ path: `${OUT}/shop.png` });

check('G1 全程零 pageerror', errors.length === 0, errors.join(' | '));

// ─────────────── H. 窄屏档（<1024）：工具栏走「容器里嵌输入框」形态 ───────────────
// 该档位输入区自带底（不像 ≥1024 档裸坐在容器上），断言口径随之改为"两边都不是白"。
{
  const ctx2 = await browser.newContext({ viewport: { width: 900, height: 820 } });
  await ctx2.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'dark');
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(String(e.message).slice(0, 120)));
  await p2.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(p2);
  await p2.waitForSelector('.forum-toolbar', { timeout: 20000 });
  await p2.waitForTimeout(1800);
  const h = await p2.evaluate(SAMPLE, ['.forum-toolbar', '.forum-toolbar .toolbar-search-input']);
  check(
    'H1 窄屏档：工具栏容器自身非白玻璃',
    h['.forum-toolbar']?.ownBgLum < 0.35,
    JSON.stringify(h['.forum-toolbar']),
  );
  check(
    'H2 窄屏档：输入区自身非白底',
    h['.forum-toolbar .toolbar-search-input']?.ownBgLum < 0.35,
    JSON.stringify(h['.forum-toolbar .toolbar-search-input']),
  );
  check('H3 窄屏档：零 pageerror', errs2.length === 0, errs2.join(' | '));
  await p2.screenshot({ path: `${OUT}/home-narrow.png` });
  await ctx2.close();
}

// ─────────────── I. UserSpace 宿主：同一份 SegmentTabs 的另一个挂载点 ───────────────
// 页签组件被首页与 UserSpace 两处复用，而 --text-primary/--text-secondary 原先只由
// .user-space-page 定义 —— 只有当两个宿主都量过，才算真的修了"变量只在一处定义"。
await page.evaluate(() => {
  window.location.hash = '#/user-space?tab=community';
});
await page.waitForSelector('.segment-tabs', { timeout: 20000 });
await page.waitForTimeout(2200);
const i = await page.evaluate(SAMPLE, ['.segment-tab.active', '.segment-tab:not(.active)']);
check(
  'I1 UserSpace 宿主：选中页签可读',
  i['.segment-tab.active']?.contrast >= 3,
  JSON.stringify(i['.segment-tab.active']),
);
check(
  'I2 UserSpace 宿主：未选中页签可读',
  i['.segment-tab:not(.active)']?.contrast >= 3,
  JSON.stringify(i['.segment-tab:not(.active)']),
);

// ─────────────── J. 岛展开不得带出实心矩形（2026-10-11 用户第二次报障） ───────────────
// 「一旦有任何岛的活动，就带出一大块黑色的东西」——真因是 #unified-nav-container
// 在暗色下被铺了不透明黑条（浅色下它在所有页面都是透明的），而容器会被撑高的
// .unified-nav-surface 撑开（78px → 390px），实心背景铺满就是页顶一大块黑矩形。
// 断言不看"有没有那条 CSS"，直接量**撑高之后**的实际背景与模糊。
await page.evaluate(() => {
  window.location.hash = '#/';
});
await page.waitForSelector('.nav-search-btn', { timeout: 20000 });
await page.waitForTimeout(2200);
const jRest = await page.evaluate(() => {
  const c = document.querySelector('#unified-nav-container');
  return c ? Math.round(c.getBoundingClientRect().height) : 0;
});
await page.locator('.nav-search-btn').click();
await page.waitForTimeout(1300);
const j = await page.evaluate(() => {
  const c = document.querySelector('#unified-nav-container');
  const s = document.querySelector('.unified-nav-surface');
  if (!c || !s) return null;
  const cs = getComputedStyle(c);
  const ss = getComputedStyle(s);
  return {
    containerH: Math.round(c.getBoundingClientRect().height),
    containerBg: cs.backgroundColor,
    containerBackdrop: cs.backdropFilter,
    containerShadow: cs.boxShadow,
    surfaceH: Math.round(s.getBoundingClientRect().height),
    surfaceBg: ss.backgroundColor,
    surfaceCls: s.className,
  };
});
check(
  'J1 岛展开确实把容器撑高（本问题成立的前提）',
  (j?.containerH ?? 0) > (jRest || 0) * 2,
  `rest=${jRest} open=${j?.containerH}`,
);
check(
  'J2 撑高后的容器自身不铺背景（否则=页顶一大块实心矩形）',
  /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(j?.containerBg || 'x'),
  JSON.stringify({ bg: j?.containerBg, cls: j?.surfaceCls }),
);
check(
  'J3 撑高后的容器不做 backdrop 模糊（同样会糊成块）',
  j?.containerBackdrop === 'none',
  String(j?.containerBackdrop),
);
check(
  'J4 撑高后的容器无投影（否则在页面中部画一条横线）',
  j?.containerShadow === 'none',
  String(j?.containerShadow),
);
check(
  'J5 岛面板自己仍有实心玻璃底（视觉没被一起关掉）',
  !/^rgba\(0, 0, 0, 0\)$/.test(j?.surfaceBg || 'rgba(0, 0, 0, 0)'),
  JSON.stringify({ bg: j?.surfaceBg, h: j?.surfaceH }),
);
check('J6 岛展开态零 pageerror', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: `${OUT}/island-open.png` });

console.log(`\n合计：PASS ${pass} / FAIL ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
