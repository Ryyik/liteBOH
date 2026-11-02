/**
 * 登录岛探针（只读，不改源码）
 *
 * 用途：横屏（orientation: landscape 且 min-width 769px）点击导航「登录」后，
 *       验证导航上半岛与登录卡片下半岛拼成**同一张岛**：
 *         · 同宽、同左边界（同一中心轴）、接缝重叠无缝、无横向溢出
 *         · 上下同色，且浅色为白（页面底也是白，灰底会读成「脏」）
 *
 * 用法（仓库根运行）：node scripts/probes/probe-login-island-width.mjs
 * 环境变量：BASE_URL（默认 http://localhost:5173）、PROBE_OUT（默认 output/login-island-width）
 *
 * 背景（2026-10-19 用户报障「登录窗颜色不对 + 错位」）：
 *   首页/UserSpace/BOHAI 横屏有左栏，导航被 `body.page-* .unified-nav-surface
 *   { left: rail/2 }` 推到内容区中心，而登录卡片仍由 overlay 的 flex 在整页居中
 *   ⇒ 1440 宽栏相差 120px、1024 窄栏相差 44px，岛形断裂。修法见 landscape-rail.css。
 *   ⚠️ 本探针此前只打印 ❌ 不退出非 0（无牙）⇒ 已改为 PASS/FAIL 计数 + exitCode。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = process.env.PROBE_OUT || 'output/login-island-width';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { label: '1440x816', width: 1440, height: 816 },
  { label: '1280x800', width: 1280, height: 800 },
  { label: '1024x768', width: 1024, height: 768 },
  /* 769–1023 的横屏档（右侧折叠胶囊，没有左栏）：这一档导航被 fold-nav-rail.css
     按**内容区**居中并收窄 gutter，登录卡片却按整页居中且宽度取
     --boh-login-island-width ⇒ 2026-11-01 用户报障「登录岛又错位了」
     （1010×364 实测上半岛 31 宽 860、下半岛 75 宽 860；900×600 实测 788@12 vs 860@20）。
     900×600 同时落在 max-height ≤620 的短横屏分支里，顺带锁住左栏文案与
     右栏按钮组的同轴（那条 8px 出自一个多余的 header margin-bottom）。 */
  { label: '900x600', width: 900, height: 600 },
];

const WHITE = 'rgb(255, 255, 255)';
const DARK_ISLAND = 'rgb(28, 28, 30)';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail ? '— ' + detail : '');
  } else {
    fail += 1;
    console.log('FAIL ', name, detail ? '— ' + detail : '');
  }
};

const launchOptions = {
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
};

const browser = await chromium.launch(launchOptions);
const errors = [];
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${vp.label}: ${String(e.message).slice(0, 120)}`));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#nav-login-btn', { timeout: 15000 });
    await page.waitForTimeout(1200);

    await page.click('#nav-login-btn');
    await page.waitForSelector('.boh-login-modal-container', { timeout: 10000 });
    await page.waitForTimeout(1200); // 等过渡（max-width 500ms / 岛入场 560ms）结束

    const data = await page.evaluate(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          bottom: Math.round(r.bottom),
          right: Math.round(r.right),
          background: cs.backgroundColor,
          /** 文案与右侧按钮组的垂直中心（用于「两栏同一条中心轴」） */
          centerY: Math.round(r.y + r.height / 2),
        };
      };
      const nav = document.querySelector('#unified-nav-container .unified-nav-surface');
      const box = document.querySelector('.boh-login-modal-container');
      const header = document.querySelector('.boh-login-modal-header');
      const entry = document.querySelector('.mobile-login-entry');
      return {
        navClass: nav ? nav.className : null,
        nav: rect(nav),
        container: rect(box),
        // 左栏是「文案 + 下方短分割线」一组，按整组中心对齐（单看 p 会被分割线拉高）
        header: rect(header),
        entry: rect(entry),
        overlay: (() => {
          const el = document.querySelector('.boh-login-modal-overlay');
          if (!el) return null;
          return {
            w: Math.round(el.getBoundingClientRect().width),
            padding: getComputedStyle(el).padding,
          };
        })(),
      };
    });

    await page.screenshot({ path: `${OUT}/${vp.label}.png` });

    console.log(`\n=== ${vp.label} ===`);
    console.log('nav rect        :', JSON.stringify(data.nav));
    console.log('container rect  :', JSON.stringify(data.container));
    if (data.nav && data.container) {
      const widthDelta = data.container.w - data.nav.w;
      const leftDelta = data.container.x - data.nav.x;
      const seam = data.container.y - data.nav.bottom;
      check('W1 上下两半同宽', widthDelta === 0, `container-nav = ${widthDelta}px`);
      check('W2 左边界对齐（同一条中心轴）', leftDelta === 0, `container-nav = ${leftDelta}px`);
      check('W3 接缝重叠无缝', seam <= 0, `卡片上沿-导航下沿 = ${seam}px`);
      check(
        'W4 上下同色且为白',
        data.nav.background === WHITE && data.container.background === WHITE,
        `nav=${data.nav.background} box=${data.container.background}`,
      );
    }
    if (data.header && data.entry) {
      const dy = Math.abs(data.header.centerY - data.entry.centerY);
      /* 阈值 4 而不是 8：两栏是「header 居中项 vs 绝对定位 top:50%」，
         任何一条加在 header 上的下外边距都会让它整体上推一半 —— 曾经是
         max-height≤620 分支里的 margin-bottom:16px ⇒ 实测正好 8px（等于旧阈值，
         旧的 ≤8 会把它读成 PASS，等于没牙）。删掉那条后实测 0～2px，
         余下的 2 是卡片上下 padding 30/34 的不对称，属正常量级。 */
      check('W5 左栏（文案组）与右栏按钮垂直中心对齐', dy <= 4, `ΔcenterY = ${dy}px`);
    }

    // 第二阶段：展开表单，确认岛宽不变且无横向溢出
    if (await page.$('.mobile-login-primary')) {
      await page.click('.mobile-login-primary');
      await page.waitForTimeout(700);
      const form = await page.evaluate(() => {
        const box = document.querySelector('.boh-login-modal-container');
        const formEl = document.querySelector('.boh-login-modal-container > .boh-login-form');
        /* 无头 Chromium 没有平台认证器 ⇒ 真「指纹/面容」按钮不渲染。注入一个同 class +
           同 data-v-* 的占位按钮，验证它在双列网格里的跨度（样式表规则不变）。
           2026-10-19：它原本没有 grid-column ⇒ 只占一列（半宽），像被截断。 */
        if (formEl && !formEl.querySelector('.boh-passkey-btn')) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'boh-passkey-btn';
          btn.textContent = '指纹 / 面容一键登录';
          [...formEl.attributes]
            .filter((a) => a.name.startsWith('data-v-'))
            .forEach((a) => btn.setAttribute(a.name, a.value));
          formEl.appendChild(btn);
        }
        const passkey = formEl?.querySelector('.boh-passkey-btn');
        const submit = document.querySelector('.boh-login-modal-container .boh-login-btn');
        return {
          boxW: Math.round(box.getBoundingClientRect().width),
          boxScrollW: box.scrollWidth,
          boxClientW: box.clientWidth,
          formW: formEl ? Math.round(formEl.getBoundingClientRect().width) : null,
          passkeyW: passkey ? Math.round(passkey.getBoundingClientRect().width) : null,
          passkeyGrid: passkey ? getComputedStyle(passkey).gridColumn : null,
          submitH: submit ? Math.round(submit.getBoundingClientRect().height) : null,
          horizontalOverflow: box.scrollWidth > box.clientWidth + 1,
        };
      });
      await page.screenshot({ path: `${OUT}/${vp.label}-form-open.png` });
      console.log('展开表单        :', JSON.stringify(form));
      check(
        'W6 展开表单后无横向溢出',
        form.horizontalOverflow === false,
        `scrollW=${form.boxScrollW} clientW=${form.boxClientW}`,
      );
      check(
        'W7 指纹按钮与登录按钮同宽（整行）',
        form.passkeyW !== null && form.formW !== null && Math.abs(form.passkeyW - form.formW) <= 2,
        `passkey=${form.passkeyW} form=${form.formW} grid=${form.passkeyGrid}`,
      );
      check(
        'W8 主按钮高度收敛（≤62px）',
        form.submitH !== null && form.submitH <= 62,
        `submit=${form.submitH}px`,
      );
    }
    await ctx.close();
  }

  // 暗色：岛上下一体（两半都应是 #1c1c1e），只跑最宽一档
  const darkCtx = await browser.newContext({ viewport: { width: 1440, height: 816 } });
  await darkCtx.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  const darkPage = await darkCtx.newPage();
  await darkPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await darkPage.waitForSelector('#nav-login-btn', { timeout: 15000 });
  await darkPage.waitForTimeout(1200);
  await darkPage.screenshot({ path: `${OUT}/1440x816-dark-nav-normal.png` });
  const normalNavBg = await darkPage.$eval(
    '#unified-nav-container .unified-nav-surface',
    (el) => getComputedStyle(el).backgroundColor,
  );
  await darkPage.click('#nav-login-btn');
  await darkPage.waitForSelector('.boh-login-modal-container', { timeout: 10000 });
  await darkPage.waitForTimeout(900);
  const dark = await darkPage.evaluate(() => {
    const nav = document.querySelector('#unified-nav-container .unified-nav-surface');
    const box = document.querySelector('.boh-login-modal-container');
    const n = nav.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return {
      theme: document.documentElement.dataset.theme,
      navBg: getComputedStyle(nav).backgroundColor,
      boxBg: getComputedStyle(box).backgroundColor,
      sameWidth: Math.round(n.width) === Math.round(b.width),
      leftDelta: Math.round(b.x - n.x),
    };
  });
  await darkPage.screenshot({ path: `${OUT}/1440x816-dark.png` });
  console.log('\n=== 1440x816 dark ===');
  console.log(`常态导航底色（应仍为 rgba(20,27,37,0.9)）: ${normalNavBg}`);
  console.log(JSON.stringify(dark));
  check('D1 暗色常态导航底色未被登录态污染', normalNavBg === 'rgba(20, 27, 37, 0.9)', normalNavBg);
  check('D2 暗色上下两半同色', dark.navBg === dark.boxBg, `nav=${dark.navBg} box=${dark.boxBg}`);
  check('D3 暗色岛底色正确', dark.navBg === DARK_ISLAND, dark.navBg);
  check(
    'D4 暗色同宽且对齐',
    dark.sameWidth && dark.leftDelta === 0,
    `leftDelta=${dark.leftDelta}px`,
  );
  await darkCtx.close();

  check('W9 零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
console.log(`截图目录：${OUT}`);
if (fail) process.exitCode = 1;
