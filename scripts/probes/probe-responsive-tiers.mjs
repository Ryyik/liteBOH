import { chromium } from 'playwright';

// =====================================================================
// 探针：手机 / 平板边界（699 | 700）与「导航形态 × 底栏形态」矩阵（2026-10-30）
//
// 存在的理由 —— iPad mini 竖屏 744 被分到了手机档：
//   · 顶部：`unified-nav.css` 的 `max-width: 768px` 把它判成汉堡胶囊；
//   · 底部：`bottom-nav.css` 的手机档（`left:16/right:16` 拉满）到 767 才结束，
//     实测底栏 704px / 744 = **94.6% 屏宽**，单项 138px 而图标仍 17px、标签 12px
//     ⇒ 像把 iPhone 底栏横向拉宽（`debug-screenshots/ipad/ipad-mini6-portrait-userspace.png`）；
//   · 而 768 立刻换一套形态（336px 居中胶囊），中间没有任何过渡，形成断崖。
//
// 2026-10-30 统一到 700 后（iPad mini 归入平板档），本探针锁三件事：
//   ① 每一档的**形态身份**（汉堡 vs 完整导航 / 拉满底栏 vs 居中胶囊 vs 无）
//   ② 700–1024 各档的完整导航**彼此一致**（链接集合相同、单行不折、登录按钮不出界）
//   ③ 边界**互斥且相邻**：699 是手机形态、700 是平板形态，不允许两边同形态或留空洞
//
// 断言：
//   A  导航形态：phone ⇒ 汉堡可见且 nav-menu 不渲染；desktop ⇒ 反之
//   B  desktop 单行：nav-surface 高度 ≤ 90（折行/换行时必红）
//   C  desktop 登录按钮完整落在 nav-surface 内（不出界、不被裁）
//   D  desktop 链接集合与基线档（744）完全一致（漏项/多出下拉项都算红）
//   E  底栏形态：stretched（≥85% 屏宽）/ capsule（≤420 且居中 ±4px）/ none
//   F  无横向溢出
//   G  首页底栏槽位：phone ⇒ contents；desktop 竖屏 ⇒ none（防「顶部完整导航 + 底部又挂一条」）
//   H  边界互斥：699 与 700 的导航形态必须不同（本探针的核心存在理由）
//
// 反证（改完必须自己先跑一遍，确认真的会红）：
//   · 把 bottom-nav.css 的 `min-width: 700px` 改回 768 → E(744) 必红（744 变 stretched）
//   · 把 unified-nav.css 的 `max-width: 699px` 改回 768 → A(744) 必红（汉堡恢复）
//   · 把 Home/style.scoped.css 的 `min-width: 700px` 改回 768 → G(744) 必红（槽位重新 contents）
//   · 删掉 nav-menu 里任一 `<li>` → D 必红
// =====================================================================

const BASE = process.env.BASE || 'http://[::1]:5173';

/**
 * form: 期望的导航形态；bottom: 期望的底栏形态
 * 全部用竖屏档，横屏的「贴右竖向胶囊」由 probe-fold-nav-rail 负责。
 */
const TIERS = [
  { tag: '360x780 小手机', w: 360, h: 780, form: 'phone', bottom: 'stretched' },
  { tag: '390x844 iPhone', w: 390, h: 844, form: 'phone', bottom: 'stretched' },
  { tag: '430x932 大手机', w: 430, h: 932, form: 'phone', bottom: 'stretched' },
  { tag: '699x900 边界内', w: 699, h: 900, form: 'phone', bottom: 'stretched' },
  { tag: '700x900 边界外', w: 700, h: 900, form: 'desktop', bottom: 'capsule' },
  { tag: '720x1024 安卓平板', w: 720, h: 1024, form: 'desktop', bottom: 'capsule' },
  { tag: '744x1133 iPad mini', w: 744, h: 1133, form: 'desktop', bottom: 'capsule' },
  { tag: '768x1024 iPad 9.7', w: 768, h: 1024, form: 'desktop', bottom: 'capsule' },
  { tag: '820x1180 iPad Air', w: 820, h: 1180, form: 'desktop', bottom: 'capsule' },
  { tag: '834x1194 iPad Pro11', w: 834, h: 1194, form: 'desktop', bottom: 'capsule' },
  { tag: '1024x1366 平板竖', w: 1024, h: 1366, form: 'desktop', bottom: 'capsule' },
  { tag: '1440x900 桌面', w: 1440, h: 900, form: 'desktop', bottom: 'none' },
];

/** D 的基线：iPad mini 竖屏（平板档的最小宽度，最容易被挤） */
const BASELINE_TAG = '744x1133 iPad mini';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
};

const MEASURE = () => {
  const vis = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0)
      return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };

  const menu = document.querySelector('.unified-nav .nav-menu');
  const hamburger = document.querySelector('.unified-nav .nav-hamburger');
  const surface = document.querySelector('.unified-nav-surface');
  const cap = document.querySelector('.bottom-nav-glass');
  const slot = document.querySelector('.home-bottom-nav-slot');
  const doc = document.documentElement;

  const links = menu
    ? [...menu.children]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => (el.textContent || '').trim().slice(0, 2))
    : [];

  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    hamburgerVisible: vis(hamburger),
    menuVisible: vis(menu),
    menuBox: box(menu),
    surfaceBox: box(surface),
    links,
    login: box(
      document.querySelector('.unified-nav .nav-login-btn') ||
        document.querySelector('.unified-nav .nav-user-info'),
    ),
    capsule: box(cap),
    slotDisplay: slot ? getComputedStyle(slot).display : null,
    scrollW: doc.scrollWidth,
    clientW: doc.clientWidth,
  };
};

const browser = await chromium.launch();

/** D 的对比素材：desktop 档的链接集合，循环结束后统一与基线档比对 */
const desktopLinks = [];
/** H 的素材：每档**实测**出来的形态（不看期望值，避免自证） */
const detectedForms = [];

/** 每档测两页：`/user-space`（底栏）与 `/`（首页槽位） */
for (const t of TIERS) {
  const ctx = await browser.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: 2,
    isMobile: t.w < 1024,
    hasTouch: t.w < 1024,
  });
  // 首页有入场闸门；直接标记已通过，避免每档多等 2.4s
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* 隐私模式忽略 */
    }
  });

  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/user-space`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const us = await page.evaluate(MEASURE);

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const home = await page.evaluate(MEASURE);

  // ── A 形态身份 ────────────────────────────────────────────────
  if (t.form === 'phone') {
    check(
      `A ${t.tag} 手机档形态`,
      us.hamburgerVisible && !us.menuVisible,
      `汉堡=${us.hamburgerVisible} nav-menu=${us.menuVisible}`,
    );
  } else {
    check(
      `A ${t.tag} 平板档形态`,
      !us.hamburgerVisible && us.menuVisible,
      `汉堡=${us.hamburgerVisible} nav-menu=${us.menuVisible}`,
    );
    // ── B 单行不折 ──────────────────────────────────────────────
    // 量 nav-menu 自身高度而不是 nav-surface：surface 在挂了状态卡时会变高
    // （user-space 实测 138px），拿它判「是否折行」会把状态卡误判成换行。
    check(
      `B ${t.tag} 导航单行`,
      us.menuBox && us.menuBox.h > 0 && us.menuBox.h <= 56,
      us.menuBox ? `menu h=${Math.round(us.menuBox.h)}` : '未渲染',
    );
    // ── C 登录区不出界 ──────────────────────────────────────────
    const s = us.surfaceBox;
    const l = us.login;
    check(
      `C ${t.tag} 登录区在导航内`,
      !!s && !!l && l.x >= s.x - 1 && l.right <= s.right + 1,
      s && l
        ? `login ${Math.round(l.x)}..${Math.round(l.right)} surf ${Math.round(s.x)}..${Math.round(s.right)}`
        : '缺元素',
    );
  }

  // ── E 底栏形态 ────────────────────────────────────────────────
  if (t.bottom === 'stretched') {
    const ratio = us.capsule ? us.capsule.w / us.vw : 0;
    check(
      `E ${t.tag} 底栏拉满`,
      ratio >= 0.85,
      us.capsule ? `${Math.round(us.capsule.w)}/${us.vw} = ${(ratio * 100).toFixed(1)}%` : '未渲染',
    );
  } else if (t.bottom === 'capsule') {
    const c = us.capsule;
    const centered = c ? Math.abs((c.x + c.right) / 2 - us.vw / 2) <= 4 : false;
    check(
      `E ${t.tag} 底栏居中胶囊`,
      !!c && c.w <= 420 && centered,
      c
        ? `w=${Math.round(c.w)} 中心偏移 ${c ? Math.round((c.x + c.right) / 2 - us.vw / 2) : '-'}px`
        : '未渲染',
    );
  } else {
    // display:none 的元素 rect 全 0，必须按「有没有实际尺寸」判，不能只看元素是否存在
    const shown = us.capsule && us.capsule.w > 0;
    check(
      `E ${t.tag} 无底栏（左栏接管）`,
      !shown,
      shown ? `w=${Math.round(us.capsule.w)}` : '不显示',
    );
  }

  // ── F 横向溢出 ────────────────────────────────────────────────
  for (const [name, d] of [
    ['/user-space', us],
    ['/', home],
  ]) {
    check(
      `F ${t.tag} ${name} 无横向溢出`,
      d.scrollW <= d.clientW + 1,
      `scrollW=${d.scrollW} clientW=${d.clientW}`,
    );
  }

  // ── G 首页槽位 ────────────────────────────────────────────────
  if (t.form === 'phone') {
    check(
      `G ${t.tag} 首页挂底栏`,
      home.slotDisplay === 'contents',
      `slot display=${home.slotDisplay}`,
    );
  } else {
    check(
      `G ${t.tag} 首页不挂底栏`,
      home.slotDisplay === 'none',
      `slot display=${home.slotDisplay}`,
    );
  }

  // ── 实测形态（供 H 用，刻意不读期望值）───────────────────────
  const detected = us.hamburgerVisible ? 'phone' : us.menuVisible ? 'desktop' : 'unknown';
  detectedForms.push({ tag: t.tag, form: detected });

  // ── D 素材收集（集合一致性在循环后统一比对）──────────────────
  if (t.form === 'desktop') desktopLinks.push({ tag: t.tag, links: us.links });

  await ctx.close();
}

// ── D 链接集合一致 ──────────────────────────────────────────────
{
  const baseline = desktopLinks.find((x) => x.tag === BASELINE_TAG);
  if (!baseline) {
    check('D 基线档缺失', false, `${BASELINE_TAG} 未采到 desktop 形态`);
  } else {
    check('D 基线档链接非空', baseline.links.length >= 5, `links=${baseline.links.join('/')}`);
    for (const x of desktopLinks) {
      if (x.tag === BASELINE_TAG) continue;
      check(
        `D ${x.tag} 链接集合与基线一致`,
        JSON.stringify(x.links) === JSON.stringify(baseline.links),
        `got=${x.links.join('/')}  want=${baseline.links.join('/')}`,
      );
    }
  }
}

// ── H 边界互斥 ──────────────────────────────────────────────────
{
  const f699 = detectedForms.find((x) => x.tag.startsWith('699'))?.form;
  const f700 = detectedForms.find((x) => x.tag.startsWith('700'))?.form;
  check(
    'H 699/700 边界互斥',
    f699 === 'phone' && f700 === 'desktop',
    `699 实测=${f699}  700 实测=${f700}（必须是 phone | desktop）`,
  );
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log('\n' + '-'.repeat(64));
console.log(`[probe-responsive-tiers] ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('FAIL 明细：');
  for (const r of failed) console.log(`  - ${r.name}  ${r.detail}`);
  process.exit(1);
}
console.log('[probe-responsive-tiers] 全部通过');
