import { chromium } from 'playwright';

// =====================================================================
// 探针：折叠屏展开态 / 横屏窄档的「贴右竖向导航胶囊」（2026-10-29）
//
// 设计依据 Apple《Design for iPhone Duo》原文：
//   「Buttons and controls that normally sit at the top and bottom move to the
//     right side of the display in order to maximize vertical space… This new
//     space on the side houses the app controls. This includes the tab bar…
//     creating an uninterrupted area for its content to its left, comparable to
//     the area on an iPhone with more traditional display proportions.」
// ⇒ 横屏窄档：底栏从「贴底横胶囊」变成「贴右竖胶囊」，内容在左保持手机比例。
//
// 为什么需要这个探针 —— 修前实测（939×664 / 594×368）：
//   · 769–1023px 是断点裂缝：导航已切桌面版（`max-width:768` 才算移动），
//     内容还是手机单列 ⇒ 939 下是一个 939px 宽的搜索框、一张横跨整屏的帖子卡。
//   · 首页 `.home-bottom-nav-slot` 在**任何横屏**都是 display:none
//     ⇒ 939 展开时首页是**整页零导航**（没有底栏、也没有 ≥1024 的左栏）。
//   · 594×368 贴底胶囊占掉 60~72px，正好是屏高的 20%，首屏只剩作者名。
//   · FAB（right:18px）与右缘 AI 滑动条都独占右边 ⇒ 胶囊一贴右就被压住。
//
// 生效区间（两处必须一致，改一处就要同步）：
//   bottom-nav.css  末尾「Duo 式竖向胶囊」段
//   styles/fold-nav-rail.css（内容让位 + 手机比例列 + 右缘触发器让位）
//   = (orientation: landscape) and (max-width: 1023px)
//
// 断言：
//   A 胶囊已渲染（band 档：首页 / 我的页都要有）
//   B 胶囊是**竖向**条（h > w）—— 横排布局没被改成竖排时必红
//   C 胶囊**贴右**：右边缘距视口右边 ∈ [0, 16]
//   D 胶囊完整在视口内（不被上下裁切、也不越过底部）
//   E 胶囊**不压内容列**（内容让位生效）
//   F 页面无横向溢出
//   G 内容列 ≤ 620px（手机比例列；600 + 12 padding 容差）
//   H FAB 与胶囊不相交
//   I 竖屏回归：仍是贴底横胶囊（w > h 且底边距 ≤ 40）
//   J 竖屏回归：`--fold-nav-gutter` 未定义（区间不外溢）
//   K 桌面回归：胶囊不显示（≥1024 交给 UserSpaceSideRail）
//
// 反证（改完必须自己先跑一遍，确认真的会红）：
//   · 删掉 bottom-nav.css 里 `.nav-items { grid-auto-flow: row }` → B 必红（h≈w）
//   · 删掉 `.bottom-nav-glass { left:auto; right:... }` → C 必红（回到贴底居中）
//   · 删掉 fold-nav-rail.css 的 `padding-right: var(--fold-nav-gutter)` → C 仍绿但
//     E 必红（胶囊压住内容列右缘）；删掉 `max-width: min(100%,600px)` → G 必红（939 下 851）
//   · 删掉 Home/style.scoped.css 里那段 `display: contents` → A 必红（首页 0×0）
// =====================================================================

const BASE = process.env.BASE || 'http://[::1]:5173';

/** 命中新档位的折叠屏档位（Duo 内屏横 951×585 与 Pura X Max 展开 939×664 是主目标） */
const BAND = [
  { tag: '594x368', w: 594, h: 368 },
  { tag: '939x664', w: 939, h: 664 },
  { tag: '951x585', w: 951, h: 585 },
  { tag: '794x716', w: 794, h: 716 },
];

/** 不受影响的对照档位：竖屏（贴底）与桌面（左栏） */
const CONTROL = [
  { tag: '390x844-portrait', w: 390, h: 844, kind: 'portrait' },
  { tag: '1440x900-desktop', w: 1440, h: 900, kind: 'desktop' },
];

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail });
};

const measure = () => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const glass = document.querySelector('.bottom-nav-glass');
  const raw = box(glass);
  const visible = !!raw && raw.w > 0 && raw.h > 0;
  const col =
    document.querySelector('.forum-container') ||
    document.querySelector('.tab-page') ||
    document.querySelector('.cloud-shell') ||
    null;
  const fab = box(document.querySelector('.mobile-compose-fab'));
  const rail = document.querySelector('.userspace-rail');
  const de = document.documentElement;
  const intersects = (a, b) =>
    !!a && !!b && !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    cap: visible ? raw : null,
    capZ: glass ? Number(getComputedStyle(glass).zIndex) || 0 : 0,
    edgeZ: (() => {
      const t = document.querySelector('.ai-edge-trigger.side-right');
      return t ? Number(getComputedStyle(t).zIndex) || 0 : 0;
    })(),
    col: box(col),
    fabOverlapsCapsule: intersects(fab, visible ? raw : null),
    railVisible: !!rail && getComputedStyle(rail).display !== 'none',
    overflowX: de.scrollWidth > de.clientWidth + 1,
    gutter: getComputedStyle(de).getPropertyValue('--fold-nav-gutter').trim(),
  };
};

const openPage = async (browser, w, h, hash, { unlockGate = false } = {}) => {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile: w < 1024,
    hasTouch: w < 1024,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  if (unlockGate) {
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await page.waitForTimeout(2600);
  }
  await page.waitForTimeout(500);
  const data = await page.evaluate(measure);
  return { ctx, data };
};

const browser = await chromium.launch();

/* ── band 档：我的页（胶囊常驻，最稳定）────────────────────────── */
for (const tier of BAND) {
  const { ctx, data } = await openPage(browser, tier.w, tier.h, '#/user-space');
  const t = tier.tag;

  check(`A ${t} 胶囊已渲染`, !!data.cap, data.cap ? `w=${Math.round(data.cap.w)}` : '未渲染');
  check(
    `B ${t} 胶囊是竖向条`,
    !!data.cap && data.cap.h > data.cap.w,
    data.cap ? `w=${Math.round(data.cap.w)} h=${Math.round(data.cap.h)}` : '-',
  );
  const rightGap = data.cap ? data.vw - data.cap.right : null;
  check(
    `C ${t} 胶囊贴右`,
    rightGap !== null && rightGap >= 0 && rightGap <= 16,
    rightGap === null ? '-' : `距右边 ${Math.round(rightGap)}px`,
  );
  check(
    `D ${t} 胶囊完整在视口内`,
    !!data.cap && data.cap.y >= -0.5 && data.cap.bottom <= data.vh + 0.5,
    data.cap
      ? `top=${Math.round(data.cap.y)} bottom=${Math.round(data.cap.bottom)} vh=${data.vh}`
      : '-',
  );
  const overlaps =
    !!data.cap &&
    !!data.col &&
    !(
      data.col.right <= data.cap.x ||
      data.cap.right <= data.col.x ||
      data.col.bottom <= data.cap.y ||
      data.cap.bottom <= data.col.y
    );
  check(
    `E ${t} 胶囊不压内容列`,
    !!data.col && !overlaps,
    data.col && data.cap
      ? `内容 ${Math.round(data.col.x)}..${Math.round(data.col.right)} / 胶囊 ${Math.round(data.cap.x)}..${Math.round(data.cap.right)}`
      : '-',
  );
  check(`F ${t} 页面无横向溢出`, !data.overflowX, `overflowX=${data.overflowX}`);
  check(
    `G ${t} 内容列是手机比例（≤620）`,
    !!data.col && data.col.w <= 620,
    data.col ? `w=${Math.round(data.col.w)}` : '-',
  );
  check(`H ${t} FAB 不压胶囊`, !data.fabOverlapsCapsule, `overlap=${data.fabOverlapsCapsule}`);
  check(
    `L ${t} 胶囊层级高于右缘 AI 热区`,
    data.capZ > data.edgeZ,
    `胶囊 z=${data.capZ} / 右缘热区 z=${data.edgeZ}`,
  );

  await ctx.close();
}

/* ── band 档：首页（槽位在横屏被 display:none 关掉过，单独验一次）──── */
{
  const { ctx, data } = await openPage(browser, 939, 664, '#/', { unlockGate: true });
  check(
    'A home 939x664 胶囊已渲染',
    !!data.cap,
    data.cap ? `w=${Math.round(data.cap.w)}` : '未渲染',
  );
  check(
    'B home 939x664 胶囊是竖向条',
    !!data.cap && data.cap.h > data.cap.w,
    data.cap ? `w=${Math.round(data.cap.w)} h=${Math.round(data.cap.h)}` : '-',
  );
  await ctx.close();
}

/* ── 对照档：竖屏 + 桌面不得被新档位污染 ─────────────────────────── */
for (const tier of CONTROL) {
  const { ctx, data } = await openPage(browser, tier.w, tier.h, '#/user-space');
  const t = tier.tag;

  if (tier.kind === 'portrait') {
    check(
      `I ${t} 仍是贴底横胶囊`,
      !!data.cap && data.cap.w > data.cap.h && data.vh - data.cap.bottom <= 40,
      data.cap
        ? `w=${Math.round(data.cap.w)} h=${Math.round(data.cap.h)} 距底 ${Math.round(data.vh - data.cap.bottom)}px`
        : '未渲染',
    );
    check(`J ${t} 新档位变量未外溢`, data.gutter === '', `--fold-nav-gutter=「${data.gutter}」`);
  } else {
    check(
      `K ${t} 胶囊不显示（交给左栏）`,
      !data.cap,
      data.cap ? `w=${Math.round(data.cap.w)}` : '不显示',
    );
    check(`K2 ${t} 左栏可见`, data.railVisible, `railVisible=${data.railVisible}`);
  }

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log('\n' + '-'.repeat(64));
console.log(`[probe-fold-nav-rail] ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('FAIL 明细：');
  for (const r of failed) console.log(`  - ${r.name}  ${r.detail}`);
  process.exit(1);
}
console.log('[probe-fold-nav-rail] 全部通过');
