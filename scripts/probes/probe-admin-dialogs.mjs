#!/usr/bin/env node
/**
 * probe-admin-dialogs.mjs — 管理后台「对话框可见性 + 直达链接落表」回归锁（2026-10-17）
 *
 * 锁的是全面审查里的两条 P1（都不报错、不白屏，只是静默不可用）：
 *   P1-1 `/admin/data-management`（keys-models）三个对话框完全无样式：
 *        `.g-dialog*` 只写在 FreemodelsConfig.vue 的 `<style scoped>` 里，而使用它们的是
 *        KeysAndModels.vue ⇒ overlay 掉回 `position: static` 落进文档流底部，
 *        用户视角是「点『添加 Key』没反应」。
 *   P1-2 `?section=keys-models` 不带 `tab` 的直达链接（分享链接 / 书签 / 外链）：
 *        分组头与模块 tab 正常，内容区却渲染「用户管理」表、模块 tab 全无选中态。
 *
 * 断言口径（只认 computed 样式与 DOM 事实，不认文案排版）：
 *   D1 直达链接激活的模块 tab 就是 keys-models，且内容区是密钥与模型页
 *   D2/D3/D4 三个对话框：overlay computed position === 'fixed' 且 rect 覆盖视口，
 *            `.g-dialog` rect 完整落在视口内
 *
 * 前置：dev server 在 5173（BASE 可覆盖）。运行：node scripts/probes/probe-admin-dialogs.mjs
 *
 * 反证（改回去必须红）：
 *   · 把 `src/views/DataManagement/styles/dialog.css` 里 `.g-dialog-overlay` 的
 *     `position: fixed` 删掉（或把 KeysAndModels 的 `@import '../styles/dialog.css'` 注释掉）
 *     → D2/D3/D4 必红，detail 里能看到 `position=static`；
 *   · 把 DataAdmin.vue 的初始 tab 改回 `isValidAdminTab(routeQueryTab) ? routeQueryTab : 'users'`
 *     → D1 必红（激活 tab 变「用户管理」）。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || 'debug-screenshots';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 260) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

/* 后台页的数据请求一律给空集合：本探针只关心「对话框能不能显示」，
   表格数据有没有不影响 computed 样式；不 mock 的话这些请求会悬挂到超时。 */
await page.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const body = url.includes('/rpc/') ? JSON.stringify({}) : '[]';
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/0' },
    body,
  });
});
await page.route('**/functions/v1/**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, message: '探针环境不调用真实服务' }),
  });
});

// 先落首页再注入 admin 登录态：直接打开 admin 地址的话，路由守卫在注入之前就跑完了，
// 会被重定向出去（与 probe-admin-drawer-fix.mjs 同一套做法）。
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
  timeout: 30000,
});
await page.waitForTimeout(2500); // 等启动期会话检查放完
await page.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  s.isInitialized = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
}, ADMIN_UUID);
// 直达链接：**故意不带 tab**（P1-2 的报障形态）
await page.evaluate(() => {
  location.hash = '#/admin/data-management?section=keys-models';
});
// 不在这里抛：落错表时这个选择器根本不会出现，让 D1 自己判红并给出原因，
// 而不是整条探针崩在 waitForSelector 上（崩掉时只有一行堆栈，看不出是哪条断言）。
await page.waitForSelector('.g-keys-models', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);

// ── D1 直达链接落对表（P1-2 回归锁）──
const landing = await page.evaluate(() => {
  const activeTab = document.querySelector('.g-module-tab.is-active');
  return {
    activeTab: (activeTab?.textContent || '').trim(),
    activeTabCount: document.querySelectorAll('.g-module-tab.is-active').length,
    keysModelsPage: !!document.querySelector('.g-keys-models'),
    usersTable: !!document.querySelector('.g-data-table, .data-table'),
    railPlatforms: document.querySelectorAll('.km-pf').length,
  };
});
check(
  'D1 直达 ?section=keys-models（不带 tab）落在「密钥与模型」而不是用户表',
  landing.keysModelsPage && landing.activeTab === '密钥与模型' && landing.activeTabCount === 1,
  JSON.stringify(landing),
);
await page.screenshot({ path: `${OUT}/admin-dialogs-landing.png` });

/** 打开某个按钮触发的对话框，量 overlay / dialog 的几何 */
const openAndMeasure = async (label, openerText, opts = {}) => {
  const opener = page.locator('button', { hasText: openerText }).first();
  if (!(await opener.count())) return { opened: false, reason: `找不到按钮「${openerText}」` };
  await opener.click();
  const overlay = page.locator('.g-dialog-overlay').first();
  try {
    await overlay.waitFor({ state: 'visible', timeout: 6000 });
  } catch {
    return { opened: false, reason: '对话框没出现' };
  }
  await page.waitForTimeout(220);
  const shape = await page.evaluate(() => {
    const ov = document.querySelector('.g-dialog-overlay');
    const dg = document.querySelector('.g-dialog');
    if (!ov) return { found: false };
    const cs = getComputedStyle(ov);
    const r = ov.getBoundingClientRect();
    const dr = dg ? dg.getBoundingClientRect() : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const activeInDialog = (node) => {
      if (!node) return false;
      const ovEl = document.querySelector('.g-dialog-overlay');
      if (!ovEl) return false;
      return ovEl === node || ovEl.contains(node);
    };
    return {
      found: true,
      position: cs.position,
      overlayCoversViewport:
        Math.abs(r.top) <= 1 &&
        Math.abs(r.left) <= 1 &&
        Math.abs(r.width - vw) <= 1 &&
        Math.abs(r.height - vh) <= 1,
      overlayRect: {
        top: Math.round(r.top),
        left: Math.round(r.left),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      dialogInViewport: dr
        ? dr.top >= -1 && dr.left >= -1 && dr.right <= vw + 1 && dr.bottom <= vh + 1
        : false,
      dialogRect: dr
        ? {
            top: Math.round(dr.top),
            left: Math.round(dr.left),
            w: Math.round(dr.width),
            h: Math.round(dr.height),
          }
        : null,
      dialogRadius: dg ? getComputedStyle(dg).borderRadius : null,
      // ── 键盘可达性（B-5）──
      focusInOverlay: activeInDialog(document.activeElement),
      focusTag: document.activeElement
        ? `${document.activeElement.tagName.toLowerCase()}.${String(document.activeElement.className || '').split(' ')[0]}`
        : null,
    };
  });
  await page.screenshot({ path: `${OUT}/admin-dialogs-${label}.png` });
  if (opts.keyboard) return { ...shape, opener };
  // 点遮罩关闭（@click.self）—— 三个对话框都是这个约定
  await page
    .locator('.g-dialog-overlay')
    .first()
    .click({ position: { x: 6, y: 6 } })
    .catch(() => {});
  await page.waitForTimeout(260);
  return { ...shape, opener };
};

for (const [id, label, opener] of [
  ['key', 'D2 添加 Key 对话框', '添加 Key'],
  ['pick', 'D3 从平台拉取对话框', '从平台拉取'],
  ['model', 'D4 手动添加模型对话框', '手动添加'],
]) {
  const s = await openAndMeasure(id, opener);
  check(
    `${label}：overlay position=fixed 且铺满视口、卡片在视口内（P1-1 回归锁）`,
    s.opened !== false &&
      s.found === true &&
      s.position === 'fixed' &&
      s.overlayCoversViewport &&
      s.dialogInViewport,
    JSON.stringify(s),
  );
}

// ── F 组：模态框键盘可达性（B-5：焦点陷阱 / Esc / 焦点归还）──
// 用「添加 Key」对话框做代表：三个对话框共用同一个指令，机制一致。
{
  const s = await openAndMeasure('focus', '添加 Key', { keyboard: true });
  const overlay = page.locator('.g-dialog-overlay').first();

  check(
    'F1 打开后焦点已移入弹层（不在背后的页面里）',
    s.found === true && s.focusInOverlay === true,
    `focus=${s.focusTag}`,
  );

  // F2 Tab 循环：连按 30 次 Tab，焦点必须始终在 overlay 内（跑不出去）
  let escaped = 0;
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const ov = document.querySelector('.g-dialog-overlay');
      return ov ? ov.contains(document.activeElement) : false;
    });
    if (!inside) {
      escaped = i + 1;
      break;
    }
  }
  check('F2 连按 30 次 Tab 焦点始终在弹层内（焦点陷阱）', escaped === 0, `第 ${escaped} 次跑出去`);

  // F3 Esc 关闭
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  const closedByEsc = await page.evaluate(() => !document.querySelector('.g-dialog-overlay'));
  check('F3 Esc 关闭对话框', closedByEsc);

  // F4 关闭后焦点归还给触发按钮
  const focusBack = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? `${a.tagName.toLowerCase()}:${(a.textContent || '').trim().slice(0, 12)}` : null;
  });
  check(
    'F4 关闭后焦点归还触发按钮',
    /button.*(添加 Key|添加平台)/.test(String(focusBack)),
    `activeElement=${focusBack}`,
  );
  void overlay;
}

// ── D5 旧「免费模型库」页的两个对话框（FreemodelsConfig.vue）──
// 该 tab 已并入「密钥与模型」但入口仍在（`tabs.js` 里标着「已并入」），
// `.g-dialog*` 原本只写在它的 scoped 块里 ⇒ 一并锁住，免得改动时只验证了新的那页。
await page.evaluate(() => {
  location.hash = '#/admin/data-management?section=keys-models&tab=freemodels';
});
await page.waitForSelector('.g-freemodels-config', { timeout: 30000 });
await page.waitForTimeout(700);
for (const [id, label, opener] of [
  ['freemodel-edit', 'D5 免费模型库「添加模型」对话框', '添加模型'],
  ['freemodel-batch', 'D6 免费模型库「批量添加」对话框', '批量添加'],
]) {
  const s = await openAndMeasure(id, opener);
  check(
    `${label}：overlay position=fixed 且铺满视口、卡片在视口内（P1-1 回归锁）`,
    s.opened !== false &&
      s.found === true &&
      s.position === 'fixed' &&
      s.overlayCoversViewport &&
      s.dialogInViewport,
    JSON.stringify(s),
  );
}

check('D7 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 合计 ${results.length} 条，失败 ${failed.length} 条 ────`);
if (failed.length) failed.forEach((f) => console.log(`FAIL  ${f.name}  --  ${f.detail}`));

await browser.close();
process.exit(failed.length ? 1 : 0);
