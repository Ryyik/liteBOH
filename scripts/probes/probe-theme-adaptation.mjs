/**
 * probe-theme-adaptation.mjs — 自定义主题全站 token 生效探针（2026-11-20）
 *
 * 目标不是逐页视觉验收，而是钉住「用户切到 home-cat / anniversary-mc 后，
 * 页面底和玻璃面确实跟着主题走」这条链路，防止 token 层被后续页面级规则盖回亮色。
 *
 * 覆盖：2 主题 × 4 个公开页（首页 / 论坛 / 资讯 / 商城）。
 * 断言：data-theme、body 底色、--boh-page-bg、--liquid-bg、页面根、零 pageerror；
 *       页面存在 .liquid-glass 时再核对它的 computed 底色 == --liquid-bg。
 *
 * ⚠️ 不覆盖需要登录的消息 / Cloud+ / 个人主页；那些页由 043 的阶段 2–3 记录里的
 *    Playwright 实测覆盖，后续若要把本探针扩到登录态，按 AI-ENV 的 pinia 注入口径做，
 *    不要种 sb-*-auth-token 当登录。
 *
 * 用法（先起 dev server，默认 http://localhost:5173）：
 *   node scripts/probes/probe-theme-adaptation.mjs
 *   node scripts/probes/probe-theme-adaptation.mjs http://[::1]:5173
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';

const THEMES = {
  'home-cat': {
    pageBg: 'rgb(255, 253, 248)',
    pageToken: '#fffdf8',
    liquidToken: 'hsla(0,0%,100%,.78)',
  },
  'anniversary-mc': {
    pageBg: 'rgb(233, 238, 227)',
    pageToken: '#e9eee3',
    liquidToken: 'hsla(47,69%,95%,.96)',
  },
};

const PAGES = [
  { path: '/#/', label: 'home', root: '.home', gate: true },
  { path: '/#/forum', label: 'forum', root: '.forum-page', gate: true },
  { path: '/#/newsroom', label: 'newsroom', root: '.newsroom-page', gate: false },
  { path: '/#/shop', label: 'shop', root: '.store-page', gate: false },
];

const norm = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const failures = [];
let total = 0;
const check = (name, ok, detail) => {
  total += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} -- ${detail}`);
  if (!ok) failures.push(`${name}: ${detail}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

for (const [theme, expected] of Object.entries(THEMES)) {
  for (const pageInfo of PAGES) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((t) => {
      try {
        localStorage.setItem('boh-theme', t);
      } catch {
        /* ignore */
      }
    }, theme);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));

    await page.goto(`${BASE}${pageInfo.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page
      .waitForFunction((t) => document.documentElement.getAttribute('data-theme') === t, theme, {
        timeout: 15000,
      })
      .catch(() => {});
    await page.waitForSelector(pageInfo.root, { timeout: 20000 }).catch(() => {});
    if (pageInfo.gate) {
      await page.evaluate(() => document.querySelector('.home-gate-skip')?.click());
      await page.waitForTimeout(2600);
    }
    await page.waitForTimeout(800);

    const snapshot = await page.evaluate((rootSelector) => {
      const root = document.querySelector(rootSelector);
      const glass = document.querySelector('.liquid-glass');
      const html = getComputedStyle(document.documentElement);
      // 把 token 归一成 computed 颜色（hsla(...) → rgba(...)），
      // 否则 token 原串与 glass 的 backgroundColor 永远对不上。
      const probe = document.createElement('span');
      probe.style.color = html.getPropertyValue('--liquid-bg');
      document.body.appendChild(probe);
      const liquidColor = getComputedStyle(probe).color;
      probe.remove();
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        pageToken: html.getPropertyValue('--boh-page-bg').trim(),
        liquidToken: html.getPropertyValue('--liquid-bg').trim(),
        liquidColor,
        rootPresent: !!root,
        glassBg: glass ? getComputedStyle(glass).backgroundColor : null,
      };
    }, pageInfo.root);

    const prefix = `${theme}/${pageInfo.label}`;
    check(`${prefix} data-theme`, snapshot.theme === theme, `got ${snapshot.theme}`);
    check(
      `${prefix} body bg`,
      norm(snapshot.bodyBg) === norm(expected.pageBg),
      `got ${snapshot.bodyBg} want ${expected.pageBg}`,
    );
    check(
      `${prefix} page token`,
      norm(snapshot.pageToken) === norm(expected.pageToken),
      `got ${JSON.stringify(snapshot.pageToken)} want ${expected.pageToken}`,
    );
    check(
      `${prefix} liquid token`,
      norm(snapshot.liquidToken) === norm(expected.liquidToken),
      `got ${JSON.stringify(snapshot.liquidToken)} want ${expected.liquidToken}`,
    );
    check(`${prefix} page root`, snapshot.rootPresent, pageInfo.root);
    if (snapshot.glassBg) {
      check(
        `${prefix} glass surface`,
        norm(snapshot.glassBg) === norm(snapshot.liquidColor),
        `got ${snapshot.glassBg} want ${snapshot.liquidColor}`,
      );
    }
    check(`${prefix} no pageerror`, pageErrors.length === 0, pageErrors.join(' | ') || 'none');

    await page.screenshot({
      path: `debug-screenshots/theme-adaptation-${theme}-${pageInfo.label}.png`,
      fullPage: false,
    });
    await context.close();
  }
}

await browser.close();
console.log(`\n${total - failures.length}/${total} passed`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('All theme adaptation checks passed.');
}
