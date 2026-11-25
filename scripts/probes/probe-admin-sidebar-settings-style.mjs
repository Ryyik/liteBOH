#!/usr/bin/env node
/**
 * probe-admin-sidebar-settings-style.mjs —— 后台侧栏「设置页同款」的视觉守卫
 *
 * 背景（2026-11-25）：plans/048 把侧栏从 18 个模块平铺改成 8 组 32 行之后，
 * **分组是对的，卡片那一层没做**。行直接铺在半透明玻璃上，实测
 *   · 行底色 rgba(0,0,0,0)、无 border、无 shadow
 *   · 视觉是「一堆粗体白字浮在玻璃上」，不是设置页那种「一张卡里排着几行」
 * 用户口径是「跟设置页风格一样」，差距全在这一层。补了 `.g-sidebar-rows` 卡片。
 *
 * 为什么必须用浏览器探针而不是单测：
 *   这类缺陷**源码层面完全看不出来** —— 类名在、模板在、注释也写着「卡片」，
 *   只有算出来的 computed style 才能证明「真的有白底、真的有描边」。
 *   同一个教训在 AGENTS.md 已记过两次（`check-project-structure` 只过滤 .js、
 *   `check:dark-tokens` 只打警告），这里是第三次：**结构对 ≠ 视觉对**。
 *
 * 断言（每个视口 × 主题）：
 *   A 每个分组各有一张 `.g-sidebar-rows` 卡片（数量 = 分组数）
 *   B 卡片底色不透明为 0（即真的画了底，不是 transparent）
 *   C 卡片有圆角、有描边
 *   D 每张卡片首行无发丝线、其余行有（数量 = 行数 − 1）
 *   E 选中行有中性淡染（非 transparent）+ 左缘蓝条 + 600 字重
 *   F 行几何与设置页左栏一致：40px 高 / 9px 12px 内距 / 10px 圆角 / 14px 字
 *
 * 默认诊断模式（打印 PASS/FAIL，exit 0）；`--strict` 作门禁。
 * 运行：node scripts/probes/probe-admin-sidebar-settings-style.mjs --strict
 * 依赖：dev server 在 5173（BASE 可覆盖）；假 admin 登录态 + mock PostgREST，不写真实库。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const STRICT = process.argv.includes('--strict');
const SHOT_DIR = 'debug-screenshots/admin-sidebar-settings-style';
const ADMIN_UUID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

let failed = 0;
let passed = 0;
const fail = [];
function check(tag, name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✅ [${tag}] ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed += 1;
    fail.push(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ [${tag}] ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/** 设置页左栏（.gs-nav-item）的实测规格，作为对齐基准 */
const EXPECT = {
  rowHeight: 40,
  padding: '9px 12px',
  radius: '10px',
  fontSize: '14px',
  lineHeight: '20px',
};

const VIEWPORTS = [
  { name: 'portrait', w: 390, h: 844 },
  { name: 'landscape', w: 1440, h: 900 },
];

mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const pageErrors = [];

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark']) {
    const tag = `${vp.name}-${theme}`;
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${tag}: ${String(e)}`));

    await page.route('**/rest/v1/**', (r) => {
      const u = r.request().url();
      if (u.includes('/rpc/'))
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': '0-0/0',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
        body: '[]',
      });
    });
    await page.route('**/functions/v1/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }),
    );

    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
      timeout: 30000,
    });
    await page.waitForTimeout(1200);
    await page.evaluate((uid) => {
      const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const s = p.state.value.auth;
      s.isLoggedIn = true;
      s.isInitialized = true;
      if (s.userInfo)
        Object.assign(s.userInfo, { username: 'probe_admin', id: uid, role: 'admin' });
    }, ADMIN_UUID);

    await page.goto(`${BASE}/#/admin/data-management?section=data&tab=users`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(4200);

    // 暗色：走页面自己的主题按钮（真源 themeManager），不注入 html 属性 ——
    // 本页暗色由 .data-management-page[data-theme] 驱动，注入 html 会让两者不一致。
    if (theme === 'dark') {
      const t = page
        .locator('header button[aria-label*="深色"], header button[aria-label*="暗色"]')
        .first();
      if (await t.count()) {
        await t.click();
        await page.waitForTimeout(900);
      }
    }
    // 窄屏抽屉需显式打开
    if (vp.w < 769) {
      await page.locator('header button').first().click();
      await page.waitForTimeout(800);
    }

    await page.screenshot({ path: `${SHOT_DIR}/${tag}.png` });

    const m = await page.evaluate(() => {
      const g = (el, p) => (el ? getComputedStyle(el)[p] : null);
      const cards = [...document.querySelectorAll('.g-sidebar-rows')];
      const groups = [...document.querySelectorAll('.g-sidebar-group')];
      const act = document.querySelector('.g-nav-row.is-active');
      const row = document.querySelector('.g-nav-row');
      return {
        groupCount: groups.length,
        cardCount: cards.length,
        cardBg: cards[0] ? g(cards[0], 'backgroundColor') : null,
        cardRadius: cards[0] ? g(cards[0], 'borderRadius') : null,
        cardBorderW: cards[0] ? g(cards[0], 'borderTopWidth') : null,
        // 每张卡片：首行有线吗、其余行有线几条、行数
        perCard: cards.map((c) => {
          const rs = [...c.querySelectorAll('.g-nav-row')];
          // ⚠️ 必须用 getComputedStyle(el, '::before').content，不能写成
          //    getComputedStyle(el)['::before'] —— 后者拿到 undefined，
          //    断言会全 0 假失败（本探针第一版就是这么错的）。
          const lineOf = (el) => getComputedStyle(el, '::before').content;
          return {
            rows: rs.length,
            firstHasLine: lineOf(rs[0]) === '""',
            restWithLine: rs.slice(1).filter((r) => lineOf(r) === '""').length,
          };
        }),
        activeBg: act ? g(act, 'backgroundColor') : null,
        activeWeight: act ? g(act, 'fontWeight') : null,
        activeBarW: act ? getComputedStyle(act, '::after').width : null,
        rowH: row ? Math.round(row.getBoundingClientRect().height) : null,
        rowPad: row ? g(row, 'padding') : null,
        rowRadius: row ? g(row, 'borderRadius') : null,
        rowFont: row ? g(row, 'fontSize') : null,
        rowLH: row ? g(row, 'lineHeight') : null,
        pageTheme: document.querySelector('.data-management-page')?.getAttribute('data-theme'),
      };
    });

    console.log(`\n── ${tag} ──`);

    check(
      tag,
      'A 每个分组各有一张卡片',
      m.cardCount === m.groupCount && m.cardCount > 0,
      `groups=${m.groupCount} cards=${m.cardCount}`,
    );
    check(
      tag,
      'B 卡片有底色（不是 transparent）',
      !!m.cardBg && m.cardBg !== 'rgba(0, 0, 0, 0)' && m.cardBg !== 'transparent',
      m.cardBg,
    );
    check(
      tag,
      'C 卡片有圆角与描边',
      parseFloat(m.cardRadius) > 0 && parseFloat(m.cardBorderW) > 0,
      `radius=${m.cardRadius} border=${m.cardBorderW}`,
    );
    const lineOk = m.perCard.every(
      (c) => !c.firstHasLine && c.restWithLine === Math.max(0, c.rows - 1),
    );
    check(
      tag,
      'D 发丝线：首行无、其余行各一条',
      m.perCard.length > 0 && lineOk,
      m.perCard.map((c) => `${c.rows}行/${c.restWithLine}线`).join(' '),
    );
    check(
      tag,
      'E 选中行有淡染底（非 transparent）',
      !!m.activeBg && m.activeBg !== 'rgba(0, 0, 0, 0)',
      m.activeBg,
    );
    check(tag, 'E 选中行有左缘蓝条', parseFloat(m.activeBarW) >= 2, `${m.activeBarW}`);
    check(tag, 'E 选中行加粗', Number(m.activeWeight) >= 600, m.activeWeight);
    check(tag, 'F 行高 40px（对齐设置页）', m.rowH === EXPECT.rowHeight, `${m.rowH}px`);
    check(tag, 'F 行内距 9px 12px', m.rowPad === EXPECT.padding, m.rowPad);
    check(tag, 'F 行圆角 10px', m.rowRadius === EXPECT.radius, m.rowRadius);
    check(tag, 'F 字号 14px', m.rowFont === EXPECT.fontSize, m.rowFont);
    check(tag, 'F 行高 20px', m.rowLH === EXPECT.lineHeight, m.rowLH);
    if (theme === 'dark') {
      check(tag, 'G 暗色真源一致（页面根 data-theme=dark）', m.pageTheme === 'dark', m.pageTheme);
    }

    await ctx.close();
  }
}

check('global', 'H 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();

console.log(`\n${'='.repeat(60)}`);
console.log(`探针结果：${passed} passed / ${failed} failed`);
if (failed) {
  console.log('\n失败项：');
  fail.forEach((f) => console.log('  · ' + f));
}
console.log('='.repeat(60));

if (STRICT && failed) process.exit(1);
