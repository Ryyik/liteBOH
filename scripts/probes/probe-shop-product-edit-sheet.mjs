/**
 * probe-shop-product-edit-sheet.mjs — 商城「商品设置」面板（BohModal 第三家族）
 *
 * 家族：plans/045 阶段 2 · B 类弹层迁移（2026-11-23）
 * 被测：views/Shop/ProductEditSheet 从手写 Teleport+遮罩 迁到 components/ui/BohModal。
 * 入口：/admin/shop-editor → 商品卡上的定价入口（.p-price-editable）→ 面板。
 *
 * 断言（20）：
 *   A 桌面 1280×900：BohModal 层级/宽 600/kicker+标题/三项回填/切支付方式后
 *     积分价被换出/校验错误上屏且面板不关/取消关闭/滚锁释放
 *   B 竖屏 390×844：退化成贴底 Sheet（满宽、贴底、grab 条）
 *   C 暗色：标题与输入文字是浅字
 *
 * 运行：node scripts/probes/probe-shop-product-edit-sheet.mjs（dev server 需在 http://[::1]:5173）
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://[::1]:5173';
const ADMIN_ID = 'a1b2c3d4-0000-4000-8000-0000000000aa';

const PRODUCT = {
  id: 9002,
  title: '探针商品',
  description: '',
  image: '',
  category: '',
  points_cost: 120,
  rmb_price: 0,
  payment_mode: 'points_only',
  is_purchasable: true,
  stock: 5,
  is_active: true,
  sort_order: 1,
  card_layout: '',
  specifications: [],
};

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
    if (table === 'products') rows = [PRODUCT];
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

const openSettings = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
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
    window.location.hash = '#/admin/shop-editor';
  });
  await page.waitForSelector('.p-price-editable', { timeout: 30000 });
  await page.locator('.p-price-editable').first().click();
  await page.waitForSelector('.boh-modal__overlay .pes-body', { timeout: 15000 });
  await page.waitForTimeout(350); // boh-pop 进场 scale 落定
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
  await openSettings(page);

  const info = await page.evaluate(() => {
    const overlay = document.querySelector('.boh-modal__overlay');
    const dialog = document.querySelector('.boh-modal__dialog');
    const r = dialog.getBoundingClientRect();
    return {
      z: Number(getComputedStyle(overlay).zIndex),
      width: Math.round(r.width),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      kicker: document.querySelector('.pes-kicker')?.textContent?.trim() || '',
      title: document.querySelector('.pes-title')?.textContent?.trim() || '',
      points: document.querySelector('.pes-input')?.value || '',
      stock: [...document.querySelectorAll('.pes-input')].map((el) => el.value).join(','),
      onMode: document.querySelector('.pes-seg button.is-on .pes-seg-label')?.textContent?.trim(),
      buttons: [...document.querySelectorAll('.pes-btn')].map((el) => el.textContent.trim()),
      bodyLocked: document.body.style.overflow,
      rootLocked: document.documentElement.style.getPropertyValue('overflow-y'),
      focused: document.activeElement?.classList?.contains('pes-input') || false,
      active: `${document.activeElement?.tagName}.${document.activeElement?.className}`,
    };
  });
  check('A1 层级读 --boh-z-modal', info.z === 2147482600, `z=${info.z}`);
  check('A2 宽 600（max-width 生效）', info.width === 600, `w=${info.width}`);
  check(
    'A3 桌面垂直居中（非贴底）',
    Math.abs(info.top - (900 - info.bottom)) <= 2 && info.bottom < 890,
    `t=${info.top} b=${info.bottom}`,
  );
  check(
    'A4 kicker + 标题',
    info.kicker === '商品设置' && info.title === '探针商品',
    `${info.kicker}/${info.title}`,
  );
  check(
    'A5 三项回填（积分价/库存/支付方式）',
    info.points === '120' && info.stock === '120,5' && info.onMode === '纯积分',
    `pts=${info.points} inputs=${info.stock} mode=${info.onMode}`,
  );
  check('A6 底部两按钮', info.buttons.join('|') === '取消|保存', info.buttons.join('|'));
  check('A7 打开即聚焦首个输入', info.focused, info.active);
  check(
    'A8 滚锁生效（html 才是真容器）',
    info.bodyLocked === 'hidden' && info.rootLocked === 'hidden',
    `body=${info.bodyLocked} html=${info.rootLocked}`,
  );

  await page.locator('.pes-seg button').nth(1).click();
  await page.waitForTimeout(80);
  const swapped = await page.evaluate(() => ({
    placeholders: [...document.querySelectorAll('.pes-input')].map((el) => el.placeholder),
    onMode: document.querySelector('.pes-seg button.is-on .pes-seg-label')?.textContent?.trim(),
  }));
  check(
    'A9 切纯现金后积分价被换出、现金价出现',
    swapped.placeholders.some((p) => p.includes('9.90')) &&
      !swapped.placeholders.some((p) => p.includes('200')) &&
      swapped.onMode === '纯现金',
    swapped.placeholders.join('|'),
  );

  await page.locator('.pes-btn.primary').click();
  await page.waitForTimeout(120);
  const invalid = await page.evaluate(() => ({
    error: document.querySelector('.pes-error')?.textContent?.trim() || '',
    open: !!document.querySelector('.boh-modal__overlay'),
  }));
  check('A10 0 价校验上屏', /现金价必须大于 0/.test(invalid.error), invalid.error);
  check('A11 校验失败不关面板', invalid.open === true);

  await page.locator('.pes-btn.ghost').click();
  await page.waitForTimeout(300);
  const closed = await page.locator('.boh-modal__overlay').count();
  const unlocked = await page.evaluate(() => ({
    body: document.body.style.overflow,
    root: document.documentElement.style.getPropertyValue('overflow-y'),
  }));
  check('A12 取消关闭', closed === 0);
  check(
    'A13 关闭后滚锁释放',
    unlocked.body !== 'hidden' && unlocked.root !== 'hidden',
    JSON.stringify(unlocked),
  );
  check('A14 无 JS 错误', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------- B 竖屏 Sheet ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await mockRest(page);
  await openSettings(page);
  const info = await page.evaluate(() => {
    const r = document.querySelector('.boh-modal__dialog').getBoundingClientRect();
    return {
      width: Math.round(r.width),
      bottom: Math.round(r.bottom),
      grab: getComputedStyle(document.querySelector('.boh-modal__grab')).display,
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
  await openSettings(page);
  const info = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector('.pes-title')).color,
    input: getComputedStyle(document.querySelector('.pes-input')).color,
    inputBg: getComputedStyle(document.querySelector('.pes-input')).backgroundColor,
  }));
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  check('C1 暗色标题是浅字', lum(info.title) > 0.5, info.title);
  check('C2 暗色输入文字是浅字', lum(info.input) > 0.5, info.input);
  check('C3 输入框不是纯白底', !/255,\s*255,\s*255/.test(info.inputBg), info.inputBg);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\n全部通过' : `\n${failures} 条失败`);
process.exit(failures === 0 ? 0 : 1);
