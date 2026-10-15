/**
 * probe-navbar-glass.mjs — 顶栏统一导航栏「玻璃材质」验收探针（2026-10-14）
 *
 * ── 当前口径：顶栏是**清晰玻璃（clear glass）**────────────────────────────────
 * 用户口径「去掉顶栏岛的模糊」：顶栏**刻意不上 `backdrop-filter`**，靠半透明底
 * `rgba(255,255,255,0.66)` + 边框 + 投影立轮廓（与 `liquid-glass-spec.js` 的「白底三要素」同一纪律）。
 * ⚠️ 因此顶栏**不参与** `--glass-blur-scale`（没有模糊可缩放）。
 *
 * ── 折射级：三次尝试全部失败，都已回滚（别再盲试）────────────────────────────
 * 目标：让顶栏用站点级折射组件 `BohGlassRefract` 呈现官方 demo 的折射。三次都实测 `on=off`：
 *   · 尝试 1：玻璃挂**岛里** ⇒ 失败（`#unified-nav-container` 是堆叠上下文）。
 *   · 尝试 2：Teleport 到 body + 玻璃根 `position: fixed` ⇒ 失败（**fixed 自己就是堆叠上下文**）。
 *   · 尝试 3：Teleport 到 `#app` + `position: absolute`（祖先链**机器验过为 0 个堆叠上下文**、
 *     对齐 0/0/0/0、滚动钉视口 dy=0）⇒ **仍然失败** —— 用户截图显示岛让出实底后
 *     **折射层什么都没画出来**，导航栏只剩文字浮在内容上（最难看的那种失败）。
 *
 * ✅ **唯一已证实、可复用的结论**（DEV 对照页 `src/views/Dev/GlassBackdropRepro.vue`
 *    + `probe-glass-repro-page.mjs`，实拍见 `debug-screenshots/glass-repro-page.png`）：
 *    采样层 `.glass__warp` 的祖先链上**只要有一级是堆叠上下文**（`z-index` / `fixed|sticky` /
 *    `transform` / `isolation` / `filter` / `opacity<1` / `mask` / `mix-blend`），玻璃**完全失效**。
 *    H1 `relative` ✅ 能糊 / H2 `+z-index` ❌ / H3 `fixed` ❌。
 * ⚠️ 但这条是**必要不充分**：尝试 3 满足了它、依然不糊 ⇒ **还有别的原因，尚未查明**。
 *    ⚠️ 别再拿「祖先链干净了所以应该能糊」当结论 —— 踩过一次（我据此上线了尝试 3）。
 *
 * 用法：node scripts/probes/probe-navbar-glass.mjs http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const ROUTE = process.argv[3] || '/#/';

const violations = [];
let total = 0;
const check = (name, ok, detail = '') => {
  total += 1;
  if (ok) console.log(`PASS  ${name}  -- ${detail}`);
  else {
    console.log(`FAIL  ${name}  -- ${detail}`);
    violations.push(name);
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
page.on('console', (m) => {
  if (
    m.type() === 'warning' &&
    /is not defined on instance|accessed during render/i.test(m.text())
  ) {
    errors.push(`vue-warn: ${m.text().slice(0, 160)}`);
  }
});

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.evaluate(() => {
  const sc = document.scrollingElement;
  sc.scrollTop = Math.min(900, sc.scrollHeight - sc.clientHeight);
});
await page.waitForTimeout(600);

const state = await page.evaluate(() => {
  const el = document.querySelector('.unified-nav-surface');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    backdrop: cs.backdropFilter,
    bg: cs.backgroundColor,
    borderWidth: cs.borderTopWidth,
    boxShadow: cs.boxShadow,
    glassInIsland: document.querySelectorAll('.unified-nav-surface .boh-glass-under').length,
    glassAnywhere: document.querySelectorAll('.boh-glass-under').length,
  };
});
check('顶栏岛存在', !!state, state ? 'ok' : 'missing');
check('顶栏是清晰玻璃（刻意不上 backdrop-filter）', state?.backdrop === 'none', state?.backdrop);
check(
  '轮廓靠边框 + 投影立住（白底三要素）',
  state?.borderWidth === '1px' && state?.boxShadow !== 'none',
  JSON.stringify(state),
);
check(
  '岛是半透明底（**不许**是透明/实底白板）',
  /rgba\([^)]*,\s*0?\.\d+\)/.test(state?.bg || ''),
  state?.bg,
);
check(
  '未挂折射玻璃层（三次尝试已回滚，别再半接线）',
  state?.glassAnywhere === 0,
  `count=${state?.glassAnywhere}`,
);
check('零 pageerror / 零 Vue 未定义绑定', errors.length === 0, errors.join(' | ').slice(0, 220));

await page.screenshot({ path: 'debug-screenshots/navbar-glass-probe.png' });
await browser.close();

console.log(`\n──── 合计 ${total} 条，失败 ${violations.length} 条 ────`);
if (violations.length) {
  console.log(`失败项：\n- ${violations.join('\n- ')}`);
  process.exit(1);
}
