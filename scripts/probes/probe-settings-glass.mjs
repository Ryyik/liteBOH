// 探针：设置子页液态玻璃统一验证
// - settings 主页（含绑定邮箱行）
// - pushplus / account-security / data-export / data-management
// - 明暗双主题 + 手机横竖屏
// 运行：node probe-settings-glass.mjs（dev 5173 需已启动）
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SHOT_DIR = 'debug-screenshots';

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });

// 伪造登录 + 可选暗色（localStorage 预置，确保暗色 css 懒加载生效）
const newPage = async ({ theme = 'light', viewport = { width: 420, height: 900 } } = {}) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript((t) => {
    localStorage.setItem('boh-theme', t);
  }, theme);
  return { context, page, errors };
};

const injectLogin = async (page) => {
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__;
    const pinia = app.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    if (s.userInfo) {
      s.userInfo.username = '测试用户';
      s.userInfo.id = '';
      s.userInfo.email = 'ryyik@bohrite.example.com';
    }
  });
  await page.waitForTimeout(900);
};

// requiresLogin 路由守卫会拦截未登录的首次导航；
// 先落公共页 → 注入登录 → hash SPA 跳转（不刷新，pinia 状态保留）
const loginThenGo = async (page, hash) => {
  await page.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectLogin(page);
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(1500);
};

const results = [];
const shot = async (page, name, path) => {
  await page.screenshot({ path: `${SHOT_DIR}/${path}` });
  results.push({ name, path });
};

// 返回按钮可按性体检：滚到中部后对按钮中心做 elementFromPoint 命中测试
const hitTestBack = async (page, label) => {
  const btn = page.locator('.user-center-back-btn').first();
  const count = await btn.count();
  if (!count) {
    console.log(`[${label}] 无返回按钮（可能 showBack=false）`);
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(400);
  const info = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const chain = [];
    let node = hit;
    while (node && chain.length < 4) {
      chain.push(`${node.tagName?.toLowerCase?.()}.${String(node.className?.baseVal ?? node.className ?? '').split(' ').slice(0, 2).join('.')}`);
      node = node.parentElement;
    }
    return {
      rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
      hitIsInside: el.contains(hit) || hit === el,
      hitChain: chain,
      scrollY: window.scrollY,
      stickyTop: getComputedStyle(el.closest('.user-center-page-header') || el).top,
      position: getComputedStyle(el.closest('.user-center-page-header') || el).position
    };
  });
  console.log(`[${label}] back btn rect=${JSON.stringify(info.rect)} scrollY=${info.scrollY} pos=${info.position} stickyTop=${info.stickyTop} 命中自身=${info.hitIsInside} 命中链=${info.hitChain.join(' < ')}`);
};

// ---------- 1. 设置主页（竖屏，明暗） ----------
for (const theme of ['light', 'dark']) {
  const { context, page } = await newPage({ theme });
  await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectLogin(page);
  await shot(page, `设置主页-${theme}`, `settings-home-${theme}.png`);
  // 验证邮箱行
  const emailRow = await page.getByText('绑定邮箱').count();
  const emailValue = await page.getByText('ryyik@bohrite.example.com').count();
  console.log(`[settings-home-${theme}] 绑定邮箱行: ${emailRow > 0 ? 'OK' : 'MISSING'}, 邮箱值: ${emailValue > 0 ? 'OK' : 'MISSING'}`);
  await context.close();
}

// ---------- 2. 设置主页横屏 ----------
{
  const { context, page } = await newPage({ viewport: { width: 844, height: 420 } });
  await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectLogin(page);
  await shot(page, '设置主页-横屏', 'settings-home-landscape-light.png');
  await context.close();
}

// ---------- 3. Pushplus 推送页（明暗 + 横屏） ----------
for (const theme of ['light', 'dark']) {
  const { context, page } = await newPage({ theme });
  await loginThenGo(page, '#/user-space/pushplus-settings?from=userspace-settings');
  await shot(page, `Pushplus-${theme}`, `pushplus-${theme}.png`);
  const panel = await page.locator('.pushplus-settings .glass-settings').count();
  console.log(`[pushplus-${theme}] 玻璃面板: ${panel > 0 ? 'OK' : 'MISSING'}`);
  await hitTestBack(page, `pushplus-${theme}`);
  await context.close();
}
{
  const { context, page } = await newPage({ viewport: { width: 844, height: 420 } });
  await loginThenGo(page, '#/user-space/pushplus-settings?from=userspace-settings');
  await shot(page, 'Pushplus-横屏', 'pushplus-landscape-light.png');
  await context.close();
}

// ---------- 4. 账户安全页（明暗） ----------
for (const theme of ['light', 'dark']) {
  const { context, page } = await newPage({ theme });
  await loginThenGo(page, '#/user-space/account-security?from=userspace-settings');
  await shot(page, `账户安全-${theme}`, `account-security-${theme}.png`);
  await hitTestBack(page, `account-security-${theme}`);
  // 进入修改密码面板截图
  await page.getByText('修改密码').first().click();
  await page.waitForTimeout(600);
  await shot(page, `账户安全-改密面板-${theme}`, `account-security-password-${theme}.png`);
  await context.close();
}

// ---------- 5. 数据导出 / 数据与隐私 ----------
{
  const { context, page } = await newPage({ theme: 'light' });
  await page.goto(`${BASE}/#/user-space?tab=settings&view=data-export`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectLogin(page);
  await shot(page, '数据导出-light', 'data-export-light.png');
  await hitTestBack(page, 'data-export');
  await page.goto(`${BASE}/#/user-space?tab=settings&view=data-management`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await shot(page, '数据与隐私-light', 'data-management-light.png');
  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.path);
console.log(`\n完成 ${results.length - failed.length}/${results.length} 张截图`);
for (const r of results) console.log(`  ${r.name}: ${r.path}`);
