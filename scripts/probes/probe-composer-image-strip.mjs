import { chromium } from 'playwright';

// 竖屏发帖「图片胶片条 + 长按拖动」探针（2026-10-30）
//
// 背景（2026-10-30 事故）：竖屏发布会话里，正文被图片盖住。
// 根因不是图片样式，而是「唯一滚动面里的 flex 子项允许收缩」：
//   · `.composer-content-scroll` 是 flex column + overflow-y:auto；
//   · 只有 `.post-body-input-group` 带 min-height:0，于是它是唯一的收缩牺牲品；
//   · textarea 自身仍保留 JS 写入的固定高度 ⇒ 文字从被压扁的盒子里溢出，
//     又被 DOM 位置更靠后的图片面板盖住（用户看到的是"图片挡住文字"）。
// 同批改动了形态：3/4 列网格 → 一行胶片条（图片数不再影响内容高度），
// 并把排序从「卡片上的 ← → 箭头」换成「长按整卡拖动」（触屏上 HTML5 dnd 不触发）。
//
// 断言（带 * 的是反证锚点，撤掉对应修复必须变红）：
//   A1* 正文组盒高 >= textarea 高（键盘态；修复前约 20 vs 280 → 红）
//   A2* 内容区相邻子项不重叠（prev.bottom <= next.top + 1）
//   A3  图片区恒定一行：4 张与 1 张的高度差 <= 3px ⇒ 图片数不再影响内容高度
//   A4  图片区所有卡片同一行（top 相同）
//   A6* 有图时图片条在首屏可见（正文起写区让位：min-height 34vh→10vh + rows 3→2）
//   A7* 有图时正文仍保留 2 行可写（>= 80px）—— 与 A6 是一对反向约束，别只满足一头
//   B1  触屏不渲染箭头排序按钮（hover:none 下 display:none）
//   C1* 长按 300ms 后拖动可换序（旧实现触屏完全拖不动 → 红）
//   C2  拖动中被拖卡片进入 is-lifted 且 transform 含 scale
//   C3  拖动结束后不会顺带打开全屏预览（click 抑制）
//
// 运行：node scripts/probes/probe-composer-image-strip.mjs（需 dev server 5173）

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const VIEWPORT = { width: 390, height: 844 };
// 键盘弹起后的可用高度（与 probe-keyboard-inset 同口径：iPhone 竖屏约 336px）
const KB_INSET = 336;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
});

let passed = 0;
let failed = 0;
const assert = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// 图片链路在探针里不需要真跑：卡片数据直接从父组件注入（见 injectImages）
await page.route('**/api.cloudinary.com/**', (route) => route.abort('failed'));

await page.addInitScript(() => {
  try {
    window.localStorage.setItem('boh-home-gate-passed', String(Date.now()));
  } catch {
    /* ignore */
  }
});
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app && app.config.globalProperties.$pinia;
  if (!pinia) throw new Error('pinia not found');
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) {
    s.userInfo.username = '探针用户';
    s.userInfo.id = '';
    s.userInfo.avatarUrl = '';
  }
});
await page.waitForTimeout(600);

const fab = page.locator('.mobile-compose-fab').first();
await fab.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
await fab.click();
await page.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
await page.waitForTimeout(500);

// 注入登录态下的空稿，并把键盘高度写进 CSS 变量（不聚焦真实输入框，避免
// 桌面 Chrome 弹出真实键盘把布局算歪）
await page.evaluate((kbInset) => {
  document.documentElement.style.setProperty('--kb-inset', `${kbInset}px`);
}, KB_INSET);
await page.waitForTimeout(200);

/* 造图 + 直接写进组件的 postImages prop：
   `.mobile-composer-section` 的实例就是 PostComposer，`props.postImages`
   是父级 ref 数组的同一个 reactive 代理，push 即可触发重渲染。
   （不去翻 parent 的 setupState：ForumMain 有多层包装，键名不稳定。） */
const injectImages = async (count) => {
  const urls = await page.evaluate(async (n) => {
    const colors = ['#2f6fed', '#e0457b', '#f0a028', '#22a06b', '#7a5af8', '#c0392b'];
    const make = async (i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(0, 0, 240, 240);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), 120, 124);
      return canvas.toDataURL('image/png');
    };
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await make(i));
    return out;
  }, count);

  await page.evaluate((list) => {
    const host = document.querySelector('.mobile-composer-section');
    const composer = host && host.__vueParentComponent;
    const arr = composer && composer.props && composer.props.postImages;
    if (!Array.isArray(arr)) throw new Error('postImages prop not found');
    arr.splice(0, arr.length);
    list.forEach((url, i) => {
      arr.push({
        url,
        publicId: `probe-image-${i}`,
        name: `probe-${i}.png`,
        uploadStatus: 'approved',
      });
    });
  }, urls);
  await page.waitForTimeout(400);
};

await injectImages(4);
await page.waitForSelector('.mobile-composer-overlay .post-image-preview-item', {
  state: 'visible',
  timeout: 5000,
});

// ── A 组：布局不变量 ─────────────────────────────────────────────────
const layout = await page.evaluate(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  };
  const scroll = document.querySelector('.mobile-composer-overlay .composer-content-scroll');
  const bodyGroup = document.querySelector('.mobile-composer-section .post-body-input-group');
  const textarea = document.querySelector('.mobile-composer-section .post-content-input');
  const grid = document.querySelector('.post-image-preview-grid');
  const cards = [...document.querySelectorAll('.post-image-preview-item')];
  // 隐藏的 <input type=file> 也是 scroll 的子项，rect 全 0 —— 按"有尺寸且可见"过滤
  const kids = (scroll ? [...scroll.children] : []).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
  });
  return {
    bodyGroup: rect(bodyGroup),
    textarea: rect(textarea),
    grid: rect(grid),
    scrollRect: rect(scroll),
    cardRects: cards.map(rect),
    overlaps: kids
      .map((el, i) => {
        if (i === 0) return null;
        return {
          prev: kids[i - 1].className,
          next: el.className,
          delta: rect(el).top - rect(kids[i - 1]).bottom,
        };
      })
      .filter(Boolean)
      .filter((x) => x.delta < -1),
    scrollHeight: scroll ? scroll.scrollHeight : 0,
    clientHeight: scroll ? scroll.clientHeight : 0,
  };
});

assert(
  'A1 正文组盒高 >= textarea 高（键盘态未被压扁）',
  Boolean(layout.bodyGroup && layout.textarea) &&
    layout.bodyGroup.height >= layout.textarea.height - 1,
  `group=${layout.bodyGroup?.height?.toFixed(1)} textarea=${layout.textarea?.height?.toFixed(1)}`,
);
assert(
  'A2 内容区相邻子项不重叠',
  layout.overlaps.length === 0,
  layout.overlaps.length
    ? layout.overlaps.map((o) => `${o.prev}→${o.next} Δ${o.delta.toFixed(1)}`).join(' | ')
    : 'ok',
);
const rowTops = layout.cardRects.map((r) => Math.round(r.top));
assert('A4 图片区所有卡片同一行', new Set(rowTops).size === 1, `tops=${rowTops.join(',')}`);
const height4 = layout.grid?.height || 0;

// 有图时正文起写区让位（14vh）：选完图不滑动就能看见图片条。
// 这条同时守住"正文让位"这个取舍不被后人改回 34vh（改回去 → 图片条被挤出视野）。
assert(
  'A6 有图时图片条在首屏可见（正文已让位，无需滑动）',
  Boolean(layout.grid && layout.scrollRect) && layout.grid.bottom <= layout.scrollRect.bottom + 1,
  `strip.bottom=${layout.grid?.bottom?.toFixed(1)} scroll.bottom=${layout.scrollRect?.bottom?.toFixed(1)}`,
);
assert(
  'A7 有图时正文起写区仍保留 2 行可写（>= 80px）',
  Boolean(layout.textarea) && layout.textarea.height >= 80,
  `textarea=${layout.textarea?.height?.toFixed(1)}`,
);

await page.screenshot({ path: 'docs/probe-shots/composer-strip-01-4images.png' });

// 首屏（键盘态）图片条在正文下方、需要滚动才可见 —— 这是修复后的预期：
// 图片让位给正文，而不是压住正文。补一张滚到图片区的截图作为对照。
await page.evaluate(() => {
  document.querySelector('.post-image-preview-item')?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(350);
await page.screenshot({ path: 'docs/probe-shots/composer-strip-01b-strip-visible.png' });

// ── A3：图片数不影响内容高度 ─────────────────────────────────────────
await injectImages(1);
const height1 = await page.evaluate(
  () => document.querySelector('.post-image-preview-grid')?.getBoundingClientRect().height || 0,
);
assert(
  'A3 图片区恒定一行（4 张 vs 1 张高度差 <= 3px）',
  Math.abs(height4 - height1) <= 3,
  `4张=${height4.toFixed(1)} 1张=${height1.toFixed(1)}`,
);

// ── B1：触屏不渲染箭头排序 ───────────────────────────────────────────
await injectImages(4);
const sortBtnVisible = await page.evaluate(() => {
  const btn = document.querySelector('.post-image-sort-btn');
  if (!btn) return false;
  const cs = getComputedStyle(btn);
  const r = btn.getBoundingClientRect();
  return cs.display !== 'none' && r.width > 0 && r.height > 0;
});
assert('B1 触屏隐藏箭头排序按钮', !sortBtnVisible, `visible=${sortBtnVisible}`);

// ── C 组：长按拖动 ──────────────────────────────────────────────────
const beforeOrder = await page.evaluate(() =>
  [...document.querySelectorAll('.post-image-preview-item img')].map((img) => img.src.slice(-24)),
);

// 键盘态下内容区只有约 345px，图片条在首屏之下 —— 先把卡片滚进视口，
// 否则后续指针坐标会打在动作栏上（"看不见的东西点不到"，这个前置失败
// 比断言本身更容易被误读成"拖动没生效"）。
await page.evaluate(() => {
  document.querySelector('.post-image-preview-item')?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(400);

const rects = await page.evaluate(() =>
  [...document.querySelectorAll('.post-image-preview-item')].map((el) => {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }),
);
const hitTest = await page.evaluate(
  ({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return Boolean(el && el.closest('.post-image-preview-item'));
  },
  { x: Math.round(rects[0].cx), y: Math.round(rects[0].cy) },
);
assert(
  'C0 第 1 张卡片可被指针命中（已滚入视口）',
  hitTest,
  `at ${Math.round(rects[0].cx)},${Math.round(rects[0].cy)}`,
);

const cdp = await context.newCDPSession(page);
await page.evaluate(() => {
  window.__probeEvents = [];
  const strip = document.querySelector('.post-image-preview-grid');
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach((t) => {
    strip.addEventListener(
      t,
      (e) => window.__probeEvents.push(`${t}:${e.pointerType}:${Math.round(e.clientX)}`),
      true,
    );
  });
});
const from = rects[0];
const to = rects[2];
const touch = (x, y) => ({
  x: Math.round(x),
  y: Math.round(y),
  id: 1,
  radiusX: 6,
  radiusY: 6,
  force: 1,
});
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [touch(from.cx, from.cy)],
});
// 判定期中途（< 300ms 阈值）先验一次"按下回执"，再等到长按成立
await page.waitForTimeout(140);
const pressing = await page.evaluate(() => {
  const el = document.querySelector('.post-image-preview-item.is-pressing');
  return el ? getComputedStyle(el).transform : '';
});
assert(
  'C4 长按判定期有按下回执（is-pressing + 缩放）',
  /matrix\(0?\.9/.test(pressing),
  pressing ? pressing.slice(0, 48) : 'no is-pressing',
);
await page.waitForTimeout(300); // 累计 440ms > 长按阈值 300ms

const lifted = await page.evaluate(() => {
  const el = document.querySelector('.post-image-preview-item.is-lifted');
  return el ? getComputedStyle(el).transform : '';
});
const probeEvents = await page.evaluate(() => window.__probeEvents.slice(0, 12));
console.log('  手势事件：' + JSON.stringify(probeEvents));
assert('C2 长按后卡片进入抬起态（is-lifted + scale）', /matrix/.test(lifted), lifted.slice(0, 60));

// 分段移动：真实手指是一串 move，一次跳到目标位置会让「越过中心线」的判定失去意义
const moveTrace = [];
for (let step = 1; step <= 6; step += 1) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [touch(from.cx + ((to.cx - from.cx) * step) / 6 + 12, from.cy)],
  });
  await page.waitForTimeout(40);
  moveTrace.push(
    await page.evaluate(() => {
      const el = document.querySelector('.post-image-preview-item');
      return (el?.style.transform || 'none').replace(/\s+/g, '');
    }),
  );
}
console.log('  拖动轨迹：' + moveTrace.join(' → '));
await page.waitForTimeout(120);

await page.screenshot({ path: 'docs/probe-shots/composer-strip-02-dragging.png' });

await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(500);

const afterOrder = await page.evaluate(() =>
  [...document.querySelectorAll('.post-image-preview-item img')].map((img) => img.src.slice(-24)),
);
assert(
  'C1 长按拖动可以换序（第 1 张拖到第 3 位）',
  JSON.stringify(afterOrder) !== JSON.stringify(beforeOrder) && afterOrder.length === 4,
  `${beforeOrder.join(',')} → ${afterOrder.join(',')}`,
);

const previewOpen = await page.evaluate(() => {
  const el = document.querySelector('.composer-image-preview-overlay');
  if (!el) return false;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
});
assert('C3 拖动结束后没有顺带打开全屏预览', !previewOpen, `previewOpen=${previewOpen}`);

// 类残留会让卡片永久停在"被按扁"的样子（少一次 remove 就中招），单独立一条
const pressLeak = await page.evaluate(() => document.querySelectorAll('.is-pressing').length);
assert('C5 松手后不残留 is-pressing', pressLeak === 0, `残留=${pressLeak}`);

await page.screenshot({ path: 'docs/probe-shots/composer-strip-03-after-drop.png' });

// 上限 6 张：仍然一行（超出部分横滑），高度不涨
await injectImages(6);
await page.evaluate(() => {
  document.querySelector('.post-image-preview-item')?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(350);
const sixInfo = await page.evaluate(() => {
  const grid = document.querySelector('.post-image-preview-grid');
  const cards = [...document.querySelectorAll('.post-image-preview-item')];
  return {
    height: grid?.getBoundingClientRect().height || 0,
    scrollWidth: grid?.scrollWidth || 0,
    clientWidth: grid?.clientWidth || 0,
    tops: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)))],
  };
});
assert(
  'A5 6 张仍是一行且可横滑（高度与 4 张一致）',
  sixInfo.tops.length === 1 &&
    Math.abs(sixInfo.height - height4) <= 3 &&
    sixInfo.scrollWidth > sixInfo.clientWidth,
  `h=${sixInfo.height} content=${sixInfo.scrollWidth} view=${sixInfo.clientWidth}`,
);
await page.screenshot({ path: 'docs/probe-shots/composer-strip-04-six-images.png' });

// ── 附加：输出关键几何，便于人工核对截图 ─────────────────────────────
console.log(
  `\n  几何：内容区 client=${layout.clientHeight.toFixed(0)} scroll=${layout.scrollHeight.toFixed(0)} · ` +
    `图片条高=${height4.toFixed(1)} · 卡片宽=${layout.cardRects[0]?.width.toFixed(1)}`,
);
if (errors.length) {
  console.log('  控制台错误：');
  errors.slice(0, 5).forEach((e) => console.log('   · ' + e));
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
