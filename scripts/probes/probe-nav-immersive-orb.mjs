/**
 * probe-nav-immersive-orb.mjs — BOH AI 沉浸导航「球」探针（2026-10-08）
 *
 * 用户口径：打开 BOHAI 时顶部导航**收成一颗球**落在横向左栏的品牌 logo 位上，
 * 页面因此顶到满屏；点那颗球唤醒完整导航。
 *
 * 复用阅读页/创作页已有的 `immersiveNav` 机制（球 ↔ 胶囊 FLIP morph），
 * 本次新增的是**三件联动**，也正是本探针要钉死的东西：
 *   ① 球位 = 左栏品牌 logo 位（不是默认的左上角 14/14）；
 *   ② 球态写 `body.nav-orb-mode` ⇒ `--bohai-standalone-nav-height` 归零 ⇒ `.bohai-page` 顶满；
 *   ③ 点球展开 / 再点收回，且页面高度跟着来回。
 *
 * ⚠️ 球几何是**单一真源 CSS 变量** `--nav-orb-*`（style.scoped.css），
 * JS 的 FLIP 读同一组变量（index.vue `readImmersiveOrb`）—— 所以第 3 条断言
 * 其实同时在防「FLIP 起点与静态球位错开」。
 *
 * 用法（打 dev server，本沙箱 build 被拦）：
 *   npx vite --host :: --port 5173
 *   node scripts/probes/probe-nav-immersive-orb.mjs http://localhost:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';

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

const readState = (page) =>
  page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
        cx: Math.round(b.x + b.width / 2),
        cy: Math.round(b.y + b.height / 2),
      };
    };
    const surface = q('#unified-nav-container .unified-nav-surface');
    const bar = q('#unified-nav-container.unified-nav');
    const mark = q('.userspace-rail-brand-mark');
    const pageEl = q('.bohai-page');
    const cs = surface ? getComputedStyle(surface) : null;
    return {
      surface: rect(surface),
      surfacePosition: cs?.position,
      surfaceRadius: cs?.borderRadius,
      orbVars: cs
        ? {
            x: cs.getPropertyValue('--nav-orb-x').trim(),
            y: cs.getPropertyValue('--nav-orb-y').trim(),
            size: cs.getPropertyValue('--nav-orb-size').trim(),
          }
        : null,
      mark: rect(mark),
      barClass: bar ? String(bar.className) : '',
      bodyClass: String(document.body.className),
      navOrbMode: document.body.classList.contains('nav-orb-mode'),
      pageMarginTop: pageEl ? getComputedStyle(pageEl).marginTop : '',
      pageRect: rect(pageEl),
      viewportH: window.innerHeight,
    };
  });

const clickSurface = async (page, position) => {
  const locator = page.locator('#unified-nav-container .unified-nav-surface');
  if (position) await locator.click({ position });
  else await locator.click();
  await page.waitForTimeout(900);
};

try {
  // ── 横屏 1440×900（有左栏）────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);

    const ball = await readState(page);

    check(
      '收球：body 挂 nav-orb-mode 且导航为沉浸态未展开',
      ball.navOrbMode &&
        ball.barClass.includes('nav-immersive-on') &&
        !ball.barClass.includes('nav-immersive-expanded'),
      `body="${ball.bodyClass}" bar="${ball.barClass}"`,
    );
    check(
      '收球：surface 是 52px 圆球（fixed + 全圆角）',
      ball.surface &&
        ball.surface.w === 52 &&
        ball.surface.h === 52 &&
        ball.surfacePosition === 'fixed' &&
        ball.surfaceRadius.startsWith('999'),
      `w=${ball.surface?.w} h=${ball.surface?.h} pos=${ball.surfacePosition} r=${ball.surfaceRadius}`,
    );
    check(
      '收球：球几何读的是 --nav-orb-* 变量（AI 页覆盖为 18/21）',
      ball.orbVars?.x === '18px' && ball.orbVars?.y === '21px' && ball.orbVars?.size === '52px',
      JSON.stringify(ball.orbVars),
    );
    check(
      '收球：球心与左栏品牌 logo 心重合（≤2px）',
      ball.surface && ball.mark
        ? Math.abs(ball.surface.cx - ball.mark.cx) <= 2 &&
            Math.abs(ball.surface.cy - ball.mark.cy) <= 2
        : false,
      `球心=(${ball.surface?.cx},${ball.surface?.cy}) logo心=(${ball.mark?.cx},${ball.mark?.cy})`,
    );
    check(
      '收球：页面顶满（margin-top 0 且高度 = 视口高）',
      ball.pageMarginTop === '0px' && Math.abs((ball.pageRect?.h ?? 0) - ball.viewportH) <= 1,
      `margin=${ball.pageMarginTop} pageH=${ball.pageRect?.h} vh=${ball.viewportH}`,
    );
    await page.screenshot({ path: 'debug-screenshots/nav-orb-collapsed.png' });

    // ── 点球展开 ──
    await clickSurface(page);
    const expanded = await readState(page);
    check(
      '唤醒：点球后展开（nav-orb-mode 摘除 + 胶囊回宽）',
      !expanded.navOrbMode && (expanded.surface?.w ?? 0) > 300,
      `orbMode=${expanded.navOrbMode} w=${expanded.surface?.w}`,
    );
    check(
      '唤醒：页面让位恢复（margin-top 回到 72px）',
      expanded.pageMarginTop === '72px',
      `margin=${expanded.pageMarginTop}`,
    );
    await page.screenshot({ path: 'debug-screenshots/nav-orb-expanded.png' });

    // ── 再点收回 ──
    await clickSurface(page, { x: 6, y: 6 });
    const again = await readState(page);
    check(
      '再点收回：回到球态且页面再次顶满',
      again.navOrbMode &&
        again.surface?.w === 52 &&
        again.pageMarginTop === '0px' &&
        (again.surface ? Math.abs(again.surface.cx - (again.mark?.cx ?? -99)) <= 2 : false),
      `orbMode=${again.navOrbMode} w=${again.surface?.w} margin=${again.pageMarginTop}`,
    );
    check('横屏：无 pageerror', errors.length === 0, errors[0] || '');
    await ctx.close();
  }

  // ── 竖屏 390×844（无左栏：球回落到默认 14/14）──────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
    await page.waitForTimeout(4500);
    const portrait = await page.evaluate(() => {
      const surface = document.querySelector('#unified-nav-container .unified-nav-surface');
      const cs = surface ? getComputedStyle(surface) : null;
      return {
        orbMode: document.body.classList.contains('nav-orb-mode'),
        w: surface ? Math.round(surface.getBoundingClientRect().width) : 0,
        x: cs?.getPropertyValue('--nav-orb-x').trim(),
        y: cs?.getPropertyValue('--nav-orb-y').trim(),
        marginTop: getComputedStyle(document.querySelector('.bohai-page')).marginTop,
      };
    });
    check(
      '竖屏：同样收球，且球位回落到默认 14/14（无左栏可依）',
      portrait.orbMode && portrait.w === 52 && portrait.x === '14px' && portrait.y === '14px',
      JSON.stringify(portrait),
    );
    check('竖屏：页面同样顶满', portrait.marginTop === '0px', `margin=${portrait.marginTop}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n合计 ${total} 条，失败 ${violations.length} 条`);
if (violations.length) {
  console.log('失败项：\n- ' + violations.join('\n- '));
  process.exit(1);
}
