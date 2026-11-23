/**
 * probe-hero-lottery-picker.mjs — HeroConsole「从抽奖活动选择」弹层
 *
 * 家族：plans/045 阶段 2 · BohModal 首批试点（2026-11-23）
 * 被测：views/HeroConsole 的抽奖选择器从手写 Teleport+遮罩+头部 迁到 components/ui/BohModal。
 *
 * 断言：
 *   A 桌面 1280×900 —— 打开后是 BohModal（overlay 层级读 --boh-z-modal、宽 520）、
 *      标题/搜索框/两条候选都在、搜索过滤生效、开弹层时 body 滚锁生效、Esc 关闭；
 *   B 竖屏 390×844 —— 同一组件退化成底部 Sheet（满宽、贴底、grab 条可见）；
 *   C 暗色 —— 弹层材质与标题色跟随主题（不是白纸黑字硬编码）。
 *
 * 运行：node scripts/probes/probe-hero-lottery-picker.mjs   （dev server 需在 http://[::1]:5173）
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://[::1]:5173';
const ADMIN_ID = 'a1b2c3d4-0000-4000-8000-0000000000aa';

const HERO = {
  id: '11111111-1111-4111-8111-111111111111',
  sort_order: 1,
  is_archived: false,
  template: 'standard',
  variant: 'light',
  title: '探针英雄区',
  image_config: {},
  links: [],
  status: 'draft',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const LOTTERIES = [
  {
    id: 'lot-spring',
    title: '春季抽奖',
    prize_title: '春日礼盒',
    cover_image_url: null,
    status: 'open',
    created_at: '2026-11-02T00:00:00.000Z',
  },
  {
    id: 'lot-winter',
    title: '冬季抽奖',
    prize_title: '暖冬围巾',
    cover_image_url: null,
    status: 'drawn',
    created_at: '2026-11-01T00:00:00.000Z',
  },
];

let failures = 0;
const check = (name, pass, detail = '') => {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const mockRest = async (page) => {
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/rest/v1/')[1]?.split('/')[0] || '';
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    let rows = [];
    if (table === 'home_heroes') rows = [HERO];
    else if (table === 'lotteries') rows = LOTTERIES;
    else if (table === 'profiles')
      rows = [{ id: ADMIN_ID, username: 'probe_admin', role: 'admin', points: 0 }];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
};

const openConsole = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  /* 伪造管理员登录：等 auth 自己 init 完再改（init 会用空 session 把登录态清回去，
     反过来先改再 init 等于没改）。userInfo 是 reactive 对象，直接赋字段即可。 */
  await page.waitForFunction(
    () => {
      const app = document.querySelector('#app')?.__vue_app__;
      const auth = app?.config?.globalProperties?.$pinia?._s?.get('auth');
      return !!auth && auth.isInitialized === true;
    },
    null,
    { timeout: 20000 },
  );
  await page.evaluate((adminId) => {
    const app = document.querySelector('#app').__vue_app__;
    const auth = app.config.globalProperties.$pinia._s.get('auth');
    Object.assign(auth.userInfo, { id: adminId, role: 'admin', username: 'probe_admin' });
    auth.isLoggedIn = true;
    auth.showLoginModal = false;
  }, ADMIN_ID);
  await page.evaluate(() => {
    window.location.hash = '#/admin/hero-console';
  });
  // 页面不会自动选中一条：先点列表里的那一条，右侧编辑器（含「快捷填充」区）才渲染
  await page.waitForSelector('.hero-row', { timeout: 30000 });
  await page.locator('.hero-row').first().click();
  await page.waitForSelector('.lottery-fill-btn', { timeout: 15000 });
};

const openPicker = async (page) => {
  await page.locator('.lottery-fill-btn').click();
  await page.waitForSelector('.boh-modal__overlay .lottery-picker-list', { timeout: 15000 });
  // 候选是异步拉的；等两条都到位再量几何（boh-pop 进场 220ms 内宽度会被 scale 缩到 ~0.97）
  await page.waitForFunction(
    () => document.querySelectorAll('.lottery-picker-item').length >= 2,
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(350);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/* ---------- A 桌面 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await mockRest(page);
  await openConsole(page);
  await openPicker(page);

  const info = await page.evaluate(() => {
    const overlay = document.querySelector('.boh-modal__overlay');
    const dialog = document.querySelector('.boh-modal__dialog');
    const title = document.querySelector('.boh-modal__title');
    const o = getComputedStyle(overlay);
    const d = getComputedStyle(dialog);
    return {
      z: Number(o.zIndex),
      radius: d.borderRadius,
      width: Math.round(dialog.getBoundingClientRect().width),
      title: title?.textContent?.trim() || '',
      items: document.querySelectorAll('.lottery-picker-item').length,
      hasSearch: !!document.querySelector('.lottery-picker-search input'),
      bodyLocked: document.body.style.overflow,
      rootLocked: document.documentElement.style.getPropertyValue('overflow-y'),
      bodyPad: getComputedStyle(document.querySelector('.boh-modal__body')).padding,
      top: Math.round(dialog.getBoundingClientRect().top),
      bottom: Math.round(dialog.getBoundingClientRect().bottom),
    };
  });
  check('A1 打开的是 BohModal（overlay 存在）', true);
  check('A2 层级读 --boh-z-modal（2147482600）', info.z === 2147482600, `z=${info.z}`);
  check('A3 宽 520（max-width 生效）', info.width === 520, `w=${info.width}`);
  check('A4 标题 = 选择抽奖活动', info.title === '选择抽奖活动', info.title);
  check('A5 搜索框在', info.hasSearch);
  check('A6 两条候选都渲染', info.items === 2, `items=${info.items}`);
  check('A7 flush：body 内衬为 0', info.bodyPad === '0px', info.bodyPad);
  check(
    'A8 开弹层时滚动锁生效（html 才是真容器）',
    info.bodyLocked === 'hidden' && info.rootLocked === 'hidden',
    `body=${info.bodyLocked} html=${info.rootLocked}`,
  );
  check(
    'A9 桌面居中（非贴底）',
    info.top > 100 && 900 - info.bottom > 100,
    `t=${info.top} b=${info.bottom}`,
  );

  await page.fill('.lottery-picker-search input', '春季');
  await page.waitForTimeout(80);
  const filtered = await page.locator('.lottery-picker-item').count();
  check('A10 搜索过滤到 1 条', filtered === 1, `n=${filtered}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.locator('.boh-modal__overlay').count();
  const unlocked = await page.evaluate(() => ({
    body: document.body.style.overflow,
    root: document.documentElement.style.getPropertyValue('overflow-y'),
  }));
  check('A11 Esc 关闭', closed === 0);
  check(
    'A12 关闭后滚动锁释放',
    unlocked.body !== 'hidden' && unlocked.root !== 'hidden',
    JSON.stringify(unlocked),
  );
  check('A13 无 JS 错误', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------- B 竖屏：退化成底部 Sheet ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await mockRest(page);
  await openConsole(page);
  await openPicker(page);
  const info = await page.evaluate(() => {
    const dialog = document.querySelector('.boh-modal__dialog');
    const grab = document.querySelector('.boh-modal__grab');
    const r = dialog.getBoundingClientRect();
    return {
      width: Math.round(r.width),
      bottom: Math.round(r.bottom),
      grab: getComputedStyle(grab).display,
    };
  });
  check('B1 竖屏满宽', info.width === 390, `w=${info.width}`);
  check('B2 贴底', Math.abs(info.bottom - 844) <= 1, `b=${info.bottom}`);
  check('B3 grab 条可见', info.grab !== 'none', info.grab);
  await ctx.close();
}

/* ---------- C 暗色 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await mockRest(page);
  await page.addInitScript(() => {
    const apply = () => document.documentElement?.setAttribute('data-theme', 'dark');
    apply();
    document.addEventListener('DOMContentLoaded', apply);
  });
  await openConsole(page);
  await openPicker(page);
  const info = await page.evaluate(() => {
    const dialog = document.querySelector('.boh-modal__dialog');
    const title = document.querySelector('.boh-modal__title');
    const item = document.querySelector('.lottery-picker-info strong');
    return {
      bg: getComputedStyle(dialog).backgroundColor,
      title: getComputedStyle(title).color,
      item: getComputedStyle(item).color,
    };
  });
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  check('C1 暗色标题是浅字', lum(info.title) > 0.5, info.title);
  check('C2 暗色候选标题是浅字', lum(info.item) > 0.5, info.item);
  check('C3 弹层背景不是纯白', !/255,\s*255,\s*255/.test(info.bg), info.bg);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\n全部通过' : `\n${failures} 条失败`);
process.exit(failures === 0 ? 0 : 1);
