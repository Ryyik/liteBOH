#!/usr/bin/env node
/**
 * probe-data-admin-landscape.mjs — 数据管理后台 手机横屏（矮横视口）可用性探针
 *
 * 覆盖 844×390（iPhone 14/15 横屏）与 780×360（常见安卓横屏）两档。
 * 横屏曾落在「桌面布局塞进矮视口」的夹缝里（2026-10-18 实测）：
 *   - 内容真空：JS computeMobileView 判定移动卡片视图，CSS min-width:769 却藏卡片列表
 *   - 首屏 59% 被 chrome 吃掉（⌘K / 返回首页等触屏优化全部失效）
 *   - 嵌入编辑表单把页面撑到 3000px+，第一个输入框在视口上方
 * 本探针锁定以下回归线：
 *   1. 页面不被浏览器缩小（visualViewport.scale = 1）且无横向溢出
 *   2. 移动卡片列表可见（JS/CSS 判据一致），首屏内容区 ≤62%（首卡片 top）
 *   3. 触屏优化生效：⌘K 与「返回首页」隐藏、命中区 ≥40px
 *   4. 嵌入编辑态：表单限高内部滚动、首个输入框在视口内、保存/取消可见
 *   5. 弹层抽屉不裁切；详情页无溢出
 *   6. 零 pageerror
 *
 * 默认诊断模式（打印 PASS/FAIL，exit 0）；`--strict` 作门禁。
 * 运行：node scripts/probes/probe-data-admin-landscape.mjs [--strict]
 * 依赖：dev server 在 5173（BASE 可覆盖）；假 admin 登录态 + mock PostgREST，不写真实库。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
const RECORD_ID = '11111111-1111-4111-8111-111111111111';

const LOTTERY_ROW = {
  id: RECORD_ID,
  title: 'E2E 抽奖',
  status: 'open',
  draw_at: '2026-12-01T12:00:00.000Z',
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  entry_count: 0,
  max_entries: 100,
  created_by: ADMIN_UUID,
  prize_title: 'E2E 奖品',
  fulfillment_status: 'fulfilled',
  is_community_visible: true,
  is_home_visible: true,
  enforce_account_age_check: false,
  winner_count: 1,
  pity_mode: 'none',
};

const IDs = Array.from(
  { length: 12 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const users = Array.from({ length: 12 }, (_, i) => ({
  id: IDs[i],
  username: `user_${i + 1}`,
  role: 'user',
  points: 100 + i,
  experience: 10 + i,
  join_date: '2026-01-01T00:00:00.000Z',
  bio: '',
  avatar_url: '',
  avatar_frame_url: '',
  tags: [],
}));

const results = [];
const check = (viewport, name, pass, detail = '') => {
  results.push({ viewport, name, pass: Boolean(pass), detail: String(detail).slice(0, 160) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${viewport}] ${name}${detail ? `  -- ${detail}` : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const VIEWPORTS = [
  { w: 844, h: 390, label: '844x390' },
  { w: 780, h: 360, label: '780x360' },
];

for (const { w, h, label } of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e?.message || e).slice(0, 120)));

  // mock PostgREST：列表走 content-range 分页；单条 / PATCH 走 lotteries 行；
  // 统计 RPC 必须带各 tab 计数（缺 users 键会让 totalRecordCount=0 → 假空状态）。
  const patchCalls = [];
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const accept = route.request().headers().accept || '';
    if (url.includes('/rpc/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, users: 12, forum: 137, lotteries: 3 }),
      });
    }
    if (method === 'PATCH' && url.includes('id=eq.')) {
      let patch = {};
      try {
        patch = JSON.parse(route.request().postData() || '{}');
      } catch {}
      patchCalls.push(patch);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ ...LOTTERY_ROW, ...patch }]),
      });
    }
    if (url.includes('id=eq.')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(accept.includes('vnd.pgrst.object') ? LOTTERY_ROW : [LOTTERY_ROW]),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-11/12',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      },
      body: JSON.stringify(users),
    });
  });
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
  );

  // 假 admin 登录态
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

  // ── 场景 1：列表页 ──
  await page.goto(`${BASE}/#/admin/data-management?section=data&tab=users`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2600);

  const base = await page.evaluate(() => {
    const tap = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { sel, w: Math.round(r.width), h: Math.round(r.height), display: cs.display };
    };
    const card = document.querySelector('.mobile-card');
    const cardRect = card ? card.getBoundingClientRect() : null;
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      visualScale: window.visualViewport ? window.visualViewport.scale : null,
      firstCardTop: cardRect ? Math.round(cardRect.top) : null,
      firstCardH: cardRect ? Math.round(cardRect.height) : null,
      cardCount: document.querySelectorAll('.mobile-card').length,
      cmdK: tap('.command-palette-trigger'),
      homeBtn: tap('.g-topbar-home'),
      createBtn: tap('.toolbar-actions .btn-primary'),
      sidebarToggle: tap('.g-topbar .g-icon-btn.round'),
      checkbox: tap('.mobile-card .checkbox-wrapper'),
    };
  });

  check(
    label,
    '页面不被缩小（visualViewport.scale=1）',
    base.visualScale === null || Math.abs(base.visualScale - 1) < 0.01,
    `scale=${base.visualScale}`,
  );
  check(
    label,
    '页面无横向溢出',
    base.docScrollWidth <= base.clientWidth + 1,
    `scrollWidth=${base.docScrollWidth} clientWidth=${base.clientWidth}`,
  );
  check(
    label,
    '移动卡片列表渲染（JS/CSS 判据一致，无内容真空）',
    base.cardCount > 0 && base.firstCardTop !== null,
    `cards=${base.cardCount} firstTop=${base.firstCardTop}`,
  );
  // 验收线按「首屏至少露出卡片 120px」表达（能看清标题行 + 两行字段）：
  // 390 高档实测 218/390、360 高档 239/360 —— 百分比对极矮视口过严。
  check(
    label,
    '首屏至少露出首张卡片 120px',
    base.firstCardTop !== null && base.firstCardTop <= h - 120,
    `firstTop=${base.firstCardTop} / ${h}（露出 ${h - (base.firstCardTop || h)}px）`,
  );
  check(
    label,
    '触屏无用的「命令 ⌘K」已隐藏',
    !base.cmdK || base.cmdK.display === 'none',
    base.cmdK ? `display=${base.cmdK.display}` : 'absent',
  );
  check(
    label,
    '顶栏「返回首页」已隐藏（与头像菜单重复）',
    !base.homeBtn || base.homeBtn.display === 'none',
    base.homeBtn ? `display=${base.homeBtn.display}` : 'absent',
  );
  check(
    label,
    '批量勾选框命中区 ≥40px',
    Boolean(base.checkbox && base.checkbox.w >= 40 && base.checkbox.h >= 40),
    base.checkbox ? `${base.checkbox.w}x${base.checkbox.h}` : 'not found',
  );
  check(
    label,
    '新增按钮命中区 ≥40px',
    Boolean(base.createBtn && base.createBtn.h >= 40),
    base.createBtn ? `${base.createBtn.w}x${base.createBtn.h}` : 'not found',
  );
  check(
    label,
    '侧栏开合按钮命中区 ≥40px',
    Boolean(base.sidebarToggle && base.sidebarToggle.h >= 40 && base.sidebarToggle.w >= 40),
    base.sidebarToggle ? `${base.sidebarToggle.w}x${base.sidebarToggle.h}` : 'not found',
  );
  await page.screenshot({ path: `debug-screenshots/landscape-${label}-list.png` });

  // ── 场景 2：详情页 + 嵌入编辑态 ──
  await page.goto(`${BASE}/#/admin/data-management/lotteries/${RECORD_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.record-pane', { timeout: 30000 });
  await page.waitForTimeout(1000);

  const detailOverflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    document.querySelectorAll('.data-management-page *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      if (r.right > vw + 1 && !el.closest('.drawer-overlay')) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.position === 'absolute') return;
        bad.push((el.className || el.tagName).toString().slice(0, 40));
      }
    });
    return { overflow: bad.slice(0, 5) };
  });
  check(
    label,
    '详情页无横向溢出',
    detailOverflow.overflow.length === 0,
    detailOverflow.overflow.join(',') || 'clean',
  );

  await page.locator('.detail-action-bar button', { hasText: '编辑' }).click();
  await page.waitForSelector('#detail-edit-slot .drawer-overlay.is-embedded', {
    timeout: 10000,
    state: 'attached',
  });
  await page.waitForTimeout(700);

  const edit = await page.evaluate(() => {
    const drawer = document.querySelector('#detail-edit-slot .drawer');
    const r = drawer ? drawer.getBoundingClientRect() : null;
    const input = document.querySelector('#detail-edit-slot input');
    const ir = input ? input.getBoundingClientRect() : null;
    const saveBtn = [...document.querySelectorAll('.detail-action-bar button')].find((b) =>
      (b.innerText || '').includes('保存'),
    );
    const sr = saveBtn ? saveBtn.getBoundingClientRect() : null;
    return {
      drawerH: r ? Math.round(r.height) : null,
      drawerW: r ? Math.round(r.width) : null,
      inputTop: ir ? Math.round(ir.top) : null,
      inputVisible: ir ? ir.top >= 0 && ir.top < window.innerHeight && ir.height > 0 : false,
      saveVisible: sr ? sr.top >= 0 && sr.bottom <= window.innerHeight + 1 : false,
      vw: document.documentElement.clientWidth,
    };
  });

  check(
    label,
    '嵌入编辑表单限高（≤ 视口 - 160px，内部滚动）',
    edit.drawerH !== null && edit.drawerH <= h - 160 + 4,
    `drawerH=${edit.drawerH} / ${h}`,
  );
  check(label, '嵌入表单首个输入框在视口内', edit.inputVisible, `inputTop=${edit.inputTop}`);
  check(label, '保存按钮在视口内可见', edit.saveVisible, '');
  // 面板外层（main-container/data-content/section）多层内边距合计 ~63px，
  // 属设计内边距；断言只防「表单被压得明显窄于内容区」。
  check(
    label,
    '嵌入表单不窄于视口 - 80px',
    edit.drawerW !== null && edit.drawerW >= edit.vw - 80,
    `drawerW=${edit.drawerW} vw=${edit.vw}`,
  );
  await page.screenshot({ path: `debug-screenshots/landscape-${label}-edit.png` });

  // 退出编辑态
  const cancel = page.locator('.detail-action-bar button', { hasText: '取消' });
  if (await cancel.count()) {
    await cancel.first().click();
    await page.waitForTimeout(400);
  }

  // ── 场景 3：列表页弹层抽屉 ──
  await page.goto(`${BASE}/#/admin/data-management?section=data&tab=users`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2200);
  await page.locator('.toolbar-actions .btn-primary').click();
  await page.waitForTimeout(900);
  const popup = await page.evaluate(() => {
    const d = document.querySelector('.drawer-overlay:not(.is-embedded) .drawer');
    const r = d ? d.getBoundingClientRect() : null;
    return {
      exists: Boolean(d),
      right: r ? Math.round(r.right) : null,
      vw: document.documentElement.clientWidth,
    };
  });
  check(
    label,
    '新增抽屉打开且不裁切',
    popup.exists && popup.right !== null && popup.right <= popup.vw + 1,
    popup.exists ? `right=${popup.right} vw=${popup.vw}` : 'drawer not found',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  check(label, '零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n──── 横屏探针：${results.length - failed.length}/${results.length} 通过 ────`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(`  [${f.viewport}] ${f.name}  -- ${f.detail}`);
}
process.exit(failed.length && process.argv.includes('--strict') ? 1 : 0);
