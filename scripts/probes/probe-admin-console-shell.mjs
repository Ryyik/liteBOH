#!/usr/bin/env node
/**
 * probe-admin-console-shell.mjs —— 四个独立控制台页的「侧栏常驻」验收
 *
 * 背景（2026-11-01）：开屏 / 首页装修 / 商城装修 / 头像框 四个页面是
 * `/admin/*-console` 独立路由，进去后整个侧栏消失，想切模块只能先退回。
 * 修法是统一套 `AdminConsoleShell`。这个探针守的就是「套了，而且真的看得见」——
 * 只断言源码里有组件是不够的：token 缺失会让侧栏宽度塌成 0、`--dm-nav-height`
 * 没归零会让顶部空一条，这些在源码层面全都看不出来。
 *
 * 断言（每个页面）：
 *   1. `.g-sidebar` 存在、可见、宽度约等于 --dm-sidebar-width（token 真的被解析了）
 *   2. 侧栏顶部贴住视口顶（--dm-nav-height 归零）
 *   3. 侧栏里有模块条目，且当前页对应条目高亮
 *   4. 内容区没有横向溢出
 *   5. 窄屏（390×844）：汉堡按钮可见，点开侧栏后能滑出
 *
 * 默认诊断模式（打印 PASS/FAIL，exit 0）；`--strict` 作门禁。
 * 运行：node scripts/probes/probe-admin-console-shell.mjs [--strict]
 * 依赖：dev server 在 5173（BASE 可覆盖）；假 admin 登录态 + mock PostgREST，不写真实库。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const STRICT = process.argv.includes('--strict');
const SHOT_DIR = 'debug-screenshots/admin-console-shell';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

/** 被测页面：路径 + 侧栏里预期高亮的标签 */
const PAGES = [
  { path: '/admin/gate-console', label: '开屏管理', slug: 'gate' },
  { path: '/admin/hero-console', label: '首页装修', slug: 'hero' },
  { path: '/admin/shop-console', label: '商城装修', slug: 'shop' },
  { path: '/admin/avatar-console', label: '头像框', slug: 'avatar' },
];

const results = [];
const check = (scope, name, pass, detail = '') => {
  results.push({ scope, name, pass: Boolean(pass), detail: String(detail).slice(0, 200) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${scope}] ${name}${detail ? `  -- ${detail}` : ''}`);
};

const loginAsAdmin = async (page) => {
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(1500);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    s.isAdmin = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
  }, ADMIN_UUID);
};

/** 让页面不因为真实网络而卡住：单对象表返回对象，其余返回空数组 */
const mockRest = async (page) => {
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    const accept = route.request().headers().accept || '';
    if (accept.includes('vnd.pgrst.object') || url.includes('id=eq.')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/vnd.pgrst.object+json',
        body: JSON.stringify({
          enabled: false,
          theme: 'halloween',
          eyebrow: 'PROBE',
          title: '探针用开屏配置',
          subtitle: '',
          hint_text: '',
          cta_text: '',
          cta_target_type: 'none',
          cta_lottery_id: null,
          cta_route: null,
          starts_at: null,
          ends_at: null,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
  );
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

mkdirSync(SHOT_DIR, { recursive: true });

// ── 宽屏：侧栏应常驻 ────────────────────────────────────────────────
const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await wide.newPage();
await mockRest(page);
await loginAsAdmin(page);

for (const item of PAGES) {
  await page.goto(`${BASE}/#${item.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);

  const sidebar = page.locator('.g-sidebar').first();
  const visible = await sidebar.isVisible().catch(() => false);
  check(item.slug, '侧栏存在且可见', visible);
  if (!visible) {
    await page.screenshot({ path: `${SHOT_DIR}/wide-${item.slug}.png`, fullPage: true });
    continue;
  }

  const box = await sidebar.boundingBox();
  const top = Math.round(box?.y ?? -1);
  const width = Math.round(box?.width ?? 0);
  check(
    item.slug,
    '侧栏宽度≈260（token 被解析，没塌成 0）',
    width >= 240 && width <= 280,
    `实测 ${width}px`,
  );
  check(item.slug, '侧栏贴顶（--dm-nav-height 已归零）', top === 0, `top=${top}px`);

  const navCount = await page.locator('.g-sidebar .g-nav-btn').count();
  check(item.slug, '侧栏有模块条目', navCount >= 8, `${navCount} 条`);

  const active = page.locator('.g-sidebar .g-nav-btn.is-active');
  const activeCount = await active.count();
  const activeText = activeCount ? (await active.first().innerText()).trim() : '';
  check(
    item.slug,
    `当前页高亮为「${item.label}」`,
    activeCount === 1 && activeText.includes(item.label),
    `高亮 ${activeCount} 条：${activeText || '无'}`,
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(item.slug, '内容区无横向溢出', overflow <= 0, `溢出 ${overflow}px`);

  await page.screenshot({ path: `${SHOT_DIR}/wide-${item.slug}.png`, fullPage: false });
}
await wide.close();

// ── 窄屏：汉堡 + 抽屉 ───────────────────────────────────────────────
const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobile = await narrow.newPage();
await mockRest(mobile);
await loginAsAdmin(mobile);
await mobile.goto(`${BASE}/#/admin/gate-console`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await mobile.waitForTimeout(2200);

const toggle = mobile.locator('.console-shell-toggle');
const toggleVisible = await toggle.isVisible().catch(() => false);
check('mobile', '汉堡按钮可见', toggleVisible);

const sidebarBefore = mobile.locator('.g-sidebar').first();
const boxBefore = await sidebarBefore.boundingBox().catch(() => null);
check(
  'mobile',
  '抽屉默认收起（在视口左侧之外）',
  !boxBefore || boxBefore.x < 0,
  boxBefore ? `x=${Math.round(boxBefore.x)}` : '无 box',
);
await mobile.screenshot({ path: `${SHOT_DIR}/mobile-closed.png`, fullPage: false });

if (toggleVisible) {
  await toggle.click();
  await mobile.waitForTimeout(500);
  const boxAfter = await sidebarBefore.boundingBox().catch(() => null);
  check(
    'mobile',
    '点汉堡后侧栏滑出到视口内',
    Boolean(boxAfter) && boxAfter.x >= -1 && boxAfter.width > 200,
    boxAfter ? `x=${Math.round(boxAfter.x)} w=${Math.round(boxAfter.width)}` : '无 box',
  );
  await mobile.screenshot({ path: `${SHOT_DIR}/mobile-open.png`, fullPage: false });
}
await narrow.close();

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log('');
console.log(
  `共 ${results.length} 条断言，${results.length - failed.length} 通过，${failed.length} 失败`,
);
console.log(`截图：${SHOT_DIR}/`);
if (failed.length) {
  console.log('失败项：');
  for (const r of failed) console.log(`  · [${r.scope}] ${r.name} ${r.detail}`);
  process.exit(STRICT ? 1 : 0);
}
process.exit(0);
