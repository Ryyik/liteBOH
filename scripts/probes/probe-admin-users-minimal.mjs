#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：极简骨架的第一个真模块（`/admin/users-minimal`，2026-11-12）
//
// 用户原话：「整体 UI 不够简单，不够清晰简明，操作也没有特别方便」。
// 量出来的现状（1440×900，users 页签）：4 层 chrome、第一行数据在 275px、
// 首屏 219 个可交互元素、11 列、每行 3 个按钮。
//
// 这一页是「同一份数据、换一套骨架」的对照实验，所以断言直接对着那几个数字：
//   A 密度：第一行数据 ≤160px（现状 275）、首屏可交互 ≤40（现状 219）、4 列
//   B 竖屏：第一行 ≤130px、行高 ≥56（单手可点）、第二行信息（角色·积分·日期）在
//   C 编辑：横屏从右侧进（贴右边、满高）/ 竖屏从底部进（贴底、宽度=视口）
//   D 校验：用户名清空后「保存」必须禁用（不能把空名字写进库）
//   E 模块切换：另外三个模块带「旧」角标并落回旧面板（不是死按钮）
//   F 全程零 pageerror
//
// 前置：Vite dev server 在 5173（BASE 可覆盖）；假 admin 登录态 + mock PostgREST
// 运行：node scripts/probes/probe-admin-users-minimal.mjs
//
// counter-proof（手动，任一都必须让对应断言转红）：
//   1) 顶行拆回「搜索一行 + 筛选一行」→ A1/A2 红（第一行下移、可交互数上升）
//   2) 把 .um-c 三列加回去 → A3 红（列数变 7）
//   3) 删掉 @media 里的 .um-sheet 覆盖 → C2 红（竖屏仍是右侧面板）
//   4) 去掉 :disabled="!canSave" → D1 红
// =====================================================================
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'debug-screenshots/users-minimal-probe';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log(`✅ ${name}`);
  } else {
    fail += 1;
    console.log(`❌ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
};

const ROWS = Array.from({ length: 30 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  username: ['lin_xiaoyu', 'mo_yu', 'zhou_zq', 'an_ran', 'hei_mao'][i % 5] + (i > 4 ? i : ''),
  role: i % 9 === 0 ? 'admin' : i % 4 === 0 ? 'moderator' : 'user',
  points: 40 + i * 13,
  join_date: `2026-0${(i % 9) + 1}-1${i % 9}`,
  bio: i % 3 === 0 ? '负责摄影区' : '',
  avatar_url: '',
}));

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const errors = [];

const open = async (width, height) => {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': '0-29/30',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'content-range',
      },
      body: JSON.stringify(ROWS),
    });
  });
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
  );

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(1200);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const s = pinia.state.value.auth;
    s.isLoggedIn = true;
    s.isInitialized = true;
    if (s.userInfo) Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
  }, ADMIN_UUID);
  await page.goto(`${BASE}/#/admin/users-minimal`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.um-row', { timeout: 30000 });
  await page.waitForTimeout(900);
  return { ctx, page };
};

try {
  /* ---------------- A 横屏密度 ---------------- */
  {
    const { ctx, page } = await open(1440, 900);
    const stats = await page.evaluate(() => {
      const vh = window.innerHeight;
      const visible = [
        ...document.querySelectorAll('button, input, select, textarea, a[href]'),
      ].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0;
      });
      const first = document.querySelector('.um-row');
      const cols = document.querySelector('.um-row')
        ? getComputedStyle(document.querySelector('.um-row')).gridTemplateColumns.split(' ').length
        : 0;
      return {
        firstRowTop: first ? Math.round(first.getBoundingClientRect().top) : -1,
        interactive: visible.length,
        cols,
        rows: document.querySelectorAll('.um-row').length,
        headerHidden: getComputedStyle(document.querySelector('.um-head')).display === 'none',
      };
    });
    check(
      'A1 第一行数据 ≤160px（旧面板实测 275）',
      stats.firstRowTop > 0 && stats.firstRowTop <= 160,
      `${stats.firstRowTop}px`,
    );
    check(
      'A2 首屏可交互元素 ≤40（旧面板 219）',
      stats.interactive <= 40,
      `${stats.interactive} 个`,
    );
    check(
      'A3 每行 6 个网格列 = 点 + 名称 + 3 列 + 箭头（旧面板 11 列）',
      stats.cols === 6,
      `${stats.cols} 列`,
    );
    check('A4 列表真的渲染出来了', stats.rows >= 20, `${stats.rows} 行`);
    check('A5 横屏显示表头', stats.headerHidden === false);

    await page.screenshot({ path: `${OUT}/A-desktop-list.png` });

    /* ---------------- C1 横屏编辑 = 右侧面板 ---------------- */
    await page.click('.um-row');
    await page.waitForTimeout(420);
    const sheet = await page.evaluate(() => {
      const el = document.querySelector('.um-sheet');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        right: Math.round(window.innerWidth - r.right),
        top: Math.round(r.top),
        height: Math.round(r.height),
        width: Math.round(r.width),
        vh: window.innerHeight,
      };
    });
    check(
      'C1 横屏编辑从右侧进：贴右、满高',
      Boolean(sheet) && sheet.right <= 1 && sheet.top <= 1 && sheet.height >= sheet.vh - 2,
      JSON.stringify(sheet),
    );

    /* ---------------- D 校验 ---------------- */
    await page.fill('#um-username', '');
    await page.waitForTimeout(120);
    const disabled = await page.$eval('.um-btn.is-primary', (el) => el.disabled);
    check('D1 用户名清空后「保存」被禁用', disabled === true);

    /* ---------------- E 模块角标 ---------------- */
    const legacy = await page.$$eval('.um-mod:not(.is-on)', (els) =>
      els.map((el) => ({
        text: el.textContent.trim(),
        hasOld: Boolean(el.querySelector('.um-old')),
      })),
    );
    check(
      'E1 未接的模块都带「旧」角标（落回旧面板，不是死按钮）',
      legacy.length === 3 && legacy.every((m) => m.hasOld),
      JSON.stringify(legacy),
    );

    await page.screenshot({ path: `${OUT}/C1-desktop-editor.png` });
    await ctx.close();
  }

  /* ---------------- B/C2 竖屏 ---------------- */
  {
    const { ctx, page } = await open(390, 844);
    const stats = await page.evaluate(() => {
      const vh = window.innerHeight;
      const visible = [
        ...document.querySelectorAll('button, input, select, textarea, a[href]'),
      ].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0;
      });
      const row = document.querySelector('.um-row');
      const meta = document.querySelector('.um-meta');
      return {
        firstRowTop: row ? Math.round(row.getBoundingClientRect().top) : -1,
        rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
        metaVisible: meta ? getComputedStyle(meta).display !== 'none' : false,
        headerHidden: getComputedStyle(document.querySelector('.um-head')).display === 'none',
        interactive: visible.length,
      };
    });
    check(
      'B1 竖屏第一行数据 ≤130px',
      stats.firstRowTop > 0 && stats.firstRowTop <= 130,
      `${stats.firstRowTop}px`,
    );
    check('B2 行高 ≥56px（单手可点）', stats.rowHeight >= 56, `${stats.rowHeight}px`);
    check('B3 窄屏把三列折进标题下的第二行', stats.metaVisible === true);
    check('B4 窄屏隐藏表头（没有可对齐的列了）', stats.headerHidden === true);
    check('B5 竖屏首屏可交互元素 ≤30', stats.interactive <= 30, `${stats.interactive} 个`);

    await page.screenshot({ path: `${OUT}/B-mobile-list.png` });

    await page.click('.um-row');
    await page.waitForTimeout(420);
    const sheet = await page.evaluate(() => {
      const el = document.querySelector('.um-sheet');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        bottom: Math.round(window.innerHeight - r.bottom),
        width: Math.round(r.width),
        vw: window.innerWidth,
        height: Math.round(r.height),
        vh: window.innerHeight,
      };
    });
    check(
      'C2 竖屏编辑从底部进：贴底、宽度等于视口、高度跟着字段走',
      Boolean(sheet) &&
        sheet.bottom <= 1 &&
        sheet.width === sheet.vw &&
        sheet.height < sheet.vh * 0.9,
      JSON.stringify(sheet),
    );

    await page.screenshot({ path: `${OUT}/C2-mobile-editor.png` });
    await ctx.close();
  }

  check('F1 全程零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
