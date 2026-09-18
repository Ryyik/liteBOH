/**
 * 探针：DataManagement 暗色主题归因（P0 验收）
 *
 * 修的两个确定性 bug：
 *   1) 后台页容器拿不到 data-theme（不在 themeManager 白名单里），而 base.css / responsive.css
 *      用 @media (prefers-color-scheme: dark) + `.data-management-page:not([data-theme="light"])`
 *      兜底 → 该分支永真 → 用户在站内显式选浅色、系统为暗色时后台仍变暗；反之（站内选深色、
 *      系统浅色）后台又被自己的 dm-theme 旁路覆盖。
 *   2) DataAdmin.vue 直写 documentElement 并把偏好另存 localStorage['dm-theme']，形成第二套主题真相源。
 *
 * 修法：容器在模板上自绑 :data-theme，切主题统一走 themeManager，三处系统兜底块删除。
 *
 * 反证靶点 = 场景 D：把容器的 data-theme 摘掉（= 修复前的状态）后，OS 暗色下它必须仍解析为浅色。
 * 把 base.css / responsive.css 换回 .bak-dark-p0，场景 D 必须转红。
 *
 * 用法：node scripts/probes/probe-dark-admin-theme.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#161616';
const ACCENT_LIGHT = 'rgb(0, 113, 227)'; // --boh-brand-blue 亮色值 #0071e3
const ACCENT_DARK = 'rgb(59, 130, 246)'; // --boh-brand-blue 暗色值 #3b82f6

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
/** 计算值里 #ffffff 会被规范化成 #fff，比较前统一展开 */
const normHex = (v) => {
  const s = String(v || '').trim().toLowerCase();
  const short = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : s;
};
// 静态断言要在剥掉注释的文本上做，否则"注释里提到过 dm-theme"会误报
const stripCss = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const mockAdminRoutes = async (page) => {
  await page.route('**/rest/v1/profiles*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-expose-headers': 'Content-Range', 'content-range': '0-0/1' },
      body: JSON.stringify([{ id: UUID, username: '瑞一颗', points: 100, role: 'admin', avatar_url: null }]),
    })
  );
  await page.route('**/rest/v1/rpc/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  );
};

/** 打开后台页并在页内测量主题相关计算值 */
const openAdminAndMeasure = async (browser, { colorScheme, theme }) => {
  const context = await browser.newContext({ colorScheme, viewport: { width: 1440, height: 900 } });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('boh-theme', t);
    } catch {
      /* ignore */
    }
  }, theme);
  const page = await context.newPage();
  await mockAdminRoutes(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  // 伪造 admin 登录（userInfo 是 reactive({})，必须原地 Object.assign）
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, role: 'admin', avatarUrl: '' });
  }, UUID);
  await page.evaluate(() => {
    location.hash = '#/admin/data-management';
  });
  await page.waitForSelector('.data-management-page', { timeout: 30000 });
  await page.waitForTimeout(900);

  const measured = await page.evaluate(() => {
    const el = document.querySelector('.data-management-page');
    const html = document.documentElement;
    const cs = getComputedStyle(el);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    const out = {
      htmlTheme: html.getAttribute('data-theme'),
      htmlClassDark: html.classList.contains('dark'),
      htmlColorScheme: getComputedStyle(html).colorScheme,
      pageTheme: el.getAttribute('data-theme'),
      pageClassDark: el.classList.contains('dark'),
      dmBg: cs.getPropertyValue('--dm-bg').trim(),
      background: cs.getPropertyValue('--background').trim(),
      accent: getComputedStyle(box).accentColor,
    };
    box.remove();
    return out;
  });

  // 场景 D 的测量：摘掉容器属性（= 修复前状态）后立刻读计算值
  const withoutAttr = await page.evaluate(() => {
    const el = document.querySelector('.data-management-page');
    el.removeAttribute('data-theme');
    const cs = getComputedStyle(el);
    return {
      attr: el.getAttribute('data-theme'),
      dmBg: cs.getPropertyValue('--dm-bg').trim(),
      background: cs.getPropertyValue('--background').trim(),
    };
  });

  // 场景 R 的测量：在页内复现修复前的旧机制（旧 toggleAdminTheme 的 onMounted 初始化），
  // 用来证明 A 的断言不是空断言 —— 旧逻辑在"系统暗 + 站内浅色"下确实会把后台压成暗色。
  const oldBypass = await page.evaluate(() => {
    const html = document.documentElement;
    const saved = localStorage.getItem('dm-theme');
    const isDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    html.classList.toggle('dark', isDark);
    const el = document.querySelector('.data-management-page');
    el.classList.toggle('dark', isDark);
    el.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const cs = getComputedStyle(el);
    return { attr: el.getAttribute('data-theme'), dmBg: cs.getPropertyValue('--dm-bg').trim() };
  });

  await context.close();
  return { measured, withoutAttr, oldBypass, errors };
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  // ---------- A：系统暗 + 站内显式浅色（原 bug 场景） ----------
  const A = await openAdminAndMeasure(browser, { colorScheme: 'dark', theme: 'light' });
  check('A 系统暗 + 站内浅色 → html[data-theme] 为 light', A.measured.htmlTheme === 'light', `实测 ${A.measured.htmlTheme}`);
  check('A 后台容器拿到 data-theme="light"', A.measured.pageTheme === 'light', `实测 ${A.measured.pageTheme}`);
  check('A 后台 --dm-bg 走浅色', normHex(A.measured.dmBg) === LIGHT_BG, `实测 ${A.measured.dmBg}`);
  check('A 后台 --background 走浅色', normHex(A.measured.background) === LIGHT_BG, `实测 ${A.measured.background}`);
  check('A 亮色下 html color-scheme 不为 dark', !String(A.measured.htmlColorScheme).includes('dark'), `实测 ${A.measured.htmlColorScheme}`);
  check('A 无 pageerror', A.errors.length === 0, A.errors.slice(0, 2).join(' | '));

  // ---------- B：系统暗 + 站内深色 ----------
  const B = await openAdminAndMeasure(browser, { colorScheme: 'dark', theme: 'dark' });
  check('B 系统暗 + 站内深色 → 容器 data-theme="dark"', B.measured.pageTheme === 'dark', `实测 ${B.measured.pageTheme}`);
  check('B 后台 --dm-bg 走深色', normHex(B.measured.dmBg) === DARK_BG, `实测 ${B.measured.dmBg}`);
  check('B 后台 --background 走深色', normHex(B.measured.background) === DARK_BG, `实测 ${B.measured.background}`);
  check('B html color-scheme = dark（原生控件交给浏览器）', String(B.measured.htmlColorScheme).includes('dark'), `实测 ${B.measured.htmlColorScheme}`);
  check('B 容器不再被打上 .dark 类（旧旁路已摘）', B.measured.pageClassDark === false);

  // ---------- C：系统浅 + 站内深色（镜像方向） ----------
  const C = await openAdminAndMeasure(browser, { colorScheme: 'light', theme: 'dark' });
  check('C 系统浅 + 站内深色 → 容器 data-theme="dark"', C.measured.pageTheme === 'dark', `实测 ${C.measured.pageTheme}`);
  check('C 后台 --dm-bg 走深色', normHex(C.measured.dmBg) === DARK_BG, `实测 ${C.measured.dmBg}`);

  // ---------- D：反证靶点（摘掉容器属性 = 修复前状态） ----------
  // 判别力集中在 --background：修复前这里是 base.css 的 @media 兜底块命中 → #161616，
  // 而 --dm-bg 来自 responsive.css 更靠后的浅色块 → 仍是 #fff，
  // 也就是"--dm-bg 浅 + --background 深"的半明半暗混合态（比整页变暗更难发现）。
  check(
    'D【反证】容器没有 data-theme 时不再跟随系统，--dm-bg 仍为浅色',
    normHex(A.withoutAttr.dmBg) === LIGHT_BG,
    `摘属性后 --dm-bg=${A.withoutAttr.dmBg}`
  );
  check('D【反证】同上，--background 仍为浅色', normHex(A.withoutAttr.background) === LIGHT_BG, `实测 ${A.withoutAttr.background}`);

  // ---------- R：复现修复前的旧旁路机制（证明 A 的断言是有效断言） ----------
  check(
    'R【反证】旧旁路机制确实会把"系统暗 + 站内浅色"压成暗色（A 的断言有效）',
    normHex(A.oldBypass.dmBg) === DARK_BG && A.oldBypass.attr === 'dark',
    `旧逻辑实测 --dm-bg=${A.oldBypass.dmBg} / data-theme=${A.oldBypass.attr}`
  );

  // ---------- E：accent-color 主题感知 ----------
  check('E 亮色 accent-color = 品牌亮色蓝', A.measured.accent === ACCENT_LIGHT, `实测 ${A.measured.accent}`);
  check('E 暗色 accent-color = 品牌暗色蓝', B.measured.accent === ACCENT_DARK, `实测 ${B.measured.accent}`);

  // ---------- F：静态断言（不留第二套机制） ----------
  const dmFiles = [
    'src/views/DataManagement/styles/base.css',
    'src/views/DataManagement/styles/responsive.css',
    'src/views/DataManagement/DataAdmin.vue',
  ];
  const srcs = dmFiles.map((f) => stripCss(readFileSync(f, 'utf8')));
  check('F DataManagement 里不再有 prefers-color-scheme 兜底块', !srcs.some((s) => /prefers-color-scheme:\s*dark/.test(s)));
  check('F DataAdmin 不再读写 localStorage["dm-theme"]', !srcs[2].includes('dm-theme'));
  check('F DataAdmin 不再直写 documentElement 的主题属性', !/documentElement[\s\S]{0,40}setAttribute\(\s*['"]data-theme/.test(srcs[2]));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} PASS / ${failed.length} FAIL`);
if (failed.length) {
  console.log('失败项：');
  failed.forEach((f) => console.log('  - ' + f.name));
  process.exit(1);
}
