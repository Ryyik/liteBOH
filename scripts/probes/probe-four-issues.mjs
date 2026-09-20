import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：四个问题修复后的验收（每个断言都对应本次修复的一条不变式）
//   A 个人空间「编辑资料」→ URL 带 view=edit-profile + 落到编辑资料面板
//     A2 深链 (带 view) 刷新可还原；A3 切到设置 tab 默认分区不被旧 view 粘住
//   B 帖子详情发帖时间：
//     B1 竖屏整页（窄屏 Threads 式）身份条上有可见时间（内容区 .author-meta 被精简）
//     B2 横屏弹窗信息列有时间可见
//   C 头像框控制台手势：
//     C1 滚轮上滚=放大素材（zoom↑ / scale↓），与滑杆读数一致，横竖屏同向
//     C2 双指捏合=缩放（间距比），且不再退化成平移（孔心偏移保持 0）
//     C3 双指内收=缩小
//     C4 双指手势不会把整页打进错误边界（setPointerCapture 失效不再抛出）
//   D 头像框素材：
//     D1 库内 cow 行必须指向奶牛素材（修复前指白绒猫的成品图）
//     D2 前端渲染：清单里 cow.url 是什么，个人资料 hero 就画什么（DB 优先合并的现场）
//
// 反证：stash src/ 后 A1/B1/C2/D1 必须变红（见脚本末尾说明）。
// 运行：node scripts/probes/probe-four-issues.mjs   （需要 npm run dev 在 [::1]:5173）
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const ENV = fs.readFileSync('.env', 'utf8');
const envGet = (k) => {
  const m = ENV.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
};
const SUPABASE_URL = envGet('VITE_SUPABASE_URL');
const ANON = envGet('VITE_SUPABASE_ANON_KEY');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};
const info = (name, detail) => console.log(`INFO  ${name}  -- ${detail}`);

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const COW_FIXED_URL = '/avatars/frames/cow-frame.png';

/* ───────── 真库读数 ───────── */

const launch = async (viewport, hasTouch = false) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
  });
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  return { browser, context, page, errors };
};

const waitVueApp = (page) => page.waitForFunction(
  () => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 }
);

const injectLogin = (page, { role = 'admin' } = {}) => page.evaluate(({ uid, role }) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '', role });
  s.showLoginModal = false;   // 伪造登录不被 init 期会话检查认可，管理台会弹登录岛
}, { uid: UUID, role });

const visible = `(el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  let n = el;
  while (n && n !== document.body) { if (getComputedStyle(n).display === 'none') return false; n = n.parentElement; }
  return true;
}`;

/* ═════════════ A 组：编辑资料跳转 ═════════════ */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await page.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForTimeout(3000);
  await injectLogin(page);
  await page.waitForSelector('.profile-edit-btn', { timeout: 20000 });
  await page.locator('.profile-edit-btn').first().click();
  await page.waitForTimeout(1800);
  const st = await page.evaluate(() => ({
    hash: location.hash,
    editShell: Boolean(document.querySelector('.profile-edit-page-shell'))
  }));
  check('A1 编辑资料 → URL 带 view=edit-profile 且落在编辑资料面板',
    /view=edit-profile/.test(st.hash) && st.editShell, JSON.stringify(st));

  await page.goto(`${BASE}/#/user-space?tab=settings&view=edit-profile`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const deep = await page.evaluate(() => ({
    hash: location.hash,
    editShell: Boolean(document.querySelector('.profile-edit-page-shell'))
  }));
  check('A2 深链 ?tab=settings&view=edit-profile 直达编辑资料', deep.editShell, JSON.stringify(deep));

  await page.goto(`${BASE}/#/user-space?tab=settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const home = await page.evaluate(() => ({
    hash: location.hash,
    editShell: Boolean(document.querySelector('.profile-edit-page-shell')),
    settingsHome: /绑定邮箱|外观与浏览/.test(document.body.innerText)
  }));
  check('A3 设置 tab 默认落设置首页（分区分级不被粘住）', !home.editShell && home.settingsHome, JSON.stringify(home));
  check('A 无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ═════════════ B 组：帖子详情发帖时间 ═════════════ */
const openFeedAndPost = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForTimeout(2500);
  await injectLogin(page);
  await page.waitForSelector('.post-card-v2', { timeout: 25000 });
  await page.waitForTimeout(800);
  await page.locator('.post-card-v2 .post-title-v2').first().click();
  await page.waitForTimeout(3500);
};

{
  const { browser, page, errors } = await launch({ width: 430, height: 932 }, true);
  await openFeedAndPost(page);
  const st = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    const barTime = document.querySelector('.pd-author-bar-time');
    return {
      hash: location.hash,
      barTime: barTime ? barTime.textContent.trim() : null,
      barTimeVisible: vis(barTime),
      contentAuthorMeta: (() => {
        const el = document.querySelector('.x-post-card .author-section .author-meta');
        return el ? getComputedStyle(el).display : null;
      })(),
      contentPostTimeVisible: vis(document.querySelector('.x-post-card .post-time'))
    };
  }, visible);
  console.log('B 竖屏:', JSON.stringify(st));
  check('B1 竖屏详情页身份条上有可见发帖时间',
    Boolean(st.barTime && st.barTimeVisible) && st.contentAuthorMeta === 'none' && !st.contentPostTimeVisible,
    JSON.stringify(st));
  check('B 竖屏无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${OUT}/four-issues-b-portrait.png` }).catch(() => {});
  await browser.close();
}

{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await openFeedAndPost(page);
  const st = await page.evaluate((visSrc) => {
    const vis = eval(visSrc);
    const el = document.querySelector('.pd-modal-info .post-time');
    return { modal: Boolean(document.querySelector('.pd-modal-overlay')), time: el?.textContent.trim() || null, visible: vis(el) };
  }, visible);
  console.log('B 横屏:', JSON.stringify(st));
  check('B2 横屏弹窗信息列发帖时间可见', st.modal && st.visible, JSON.stringify(st));
  check('B 横屏无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${OUT}/four-issues-b-landscape.png` }).catch(() => {});
  await browser.close();
}

/* ═════════════ C 组：控制台缩放/手势 ═════════════ */
const openConsole = async (page) => {
  await page.goto(`${BASE}/#/admin/avatar-console`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForTimeout(2500);
  await injectLogin(page);
  await page.goto(`${BASE}/#/admin/avatar-console?t=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.waitForSelector('.afc-lib-item', { timeout: 25000 });
  await page.getByRole('button', { name: /奶牛抱抱/ }).first().click();
  await page.waitForTimeout(2500);
};

const consoleState = (page) => page.evaluate(() => {
  const layer = document.querySelector('.afc-layer');
  return {
    zoom: Number(String(document.querySelector('.afc-badge')?.textContent || '').match(/缩放\s*([\d.]+)×/)?.[1] || NaN),
    scale: Number(document.querySelector('.afc-readout .kv b')?.textContent.trim() || NaN),
    slider: Number(document.querySelector('.afc-readout input[type=range]')?.value || NaN),
    offset: Number(String([...document.querySelectorAll('.afc-readout .kv')].map((e) => e.textContent).join(' ')).match(/孔心偏移(\d+)px/)?.[1] ?? NaN),
    layerW: layer ? +layer.getBoundingClientRect().width.toFixed(1) : null,
    crashed: /页面出了点问题/.test(document.body.innerText)
  };
});

const pinch = async (cdp, cx, cy, from, to, steps = 8) => {
  const pt = (x, y, id) => ({ x, y, id, radiusX: 10, radiusY: 10, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx - from / 2, cy, 1), pt(cx + from / 2, cy, 2)] });
  for (let i = 1; i <= steps; i++) {
    const half = (from + ((to - from) * i) / steps) / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - half, cy, 1), pt(cx + half, cy, 2)] });
    await new Promise((r) => setTimeout(r, 18));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

for (const [label, viewport, hasTouch] of [['横屏', { width: 1280, height: 900 }, false], ['竖屏', { width: 420, height: 900 }, true]]) {
  const { browser, context, page, errors } = await launch(viewport, hasTouch);
  await openConsole(page);
  // 画布在竖屏下位于首屏之下：先滚进视口，否则滚轮/触摸坐标落在视口外（探针自伤）
  await page.locator('.afc-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box0 = await page.locator('.afc-stage').boundingBox();
  const start = await consoleState(page);
  info(`C ${label} 初始`, JSON.stringify(start));

  // 滚轮：上滚=放大素材
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(250);
  const wheelUp = await consoleState(page);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(250);
  const wheelDown = await consoleState(page);
  check(`C1 ${label} 滚轮方向：上滚放大素材(zoom↑/scale↓)、下滚回退，且与滑杆一致`,
    wheelUp.zoom > start.zoom && wheelUp.scale < start.scale && wheelUp.slider === Math.round(wheelUp.zoom * 100)
      && wheelDown.zoom < wheelUp.zoom,
    `start=${start.zoom} up=${wheelUp.zoom}/scale${wheelUp.scale} slider=${wheelUp.slider} down=${wheelDown.zoom}`);
  info(`C ${label} 滚轮后`, JSON.stringify(wheelUp));

  // 双指捏合：真实触摸事件
  await page.locator('.afc-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await page.locator('.afc-stage').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);

  const beforePinch = await consoleState(page);
  await pinch(cdp, cx, cy, 60, 130);          // 外撑 ≈ 2.2×
  await page.waitForTimeout(300);
  const outPinch = await consoleState(page);
  check(`C2 ${label} 双指外撑=放大素材且不平移（孔心偏移保持 0）`,
    outPinch.zoom > beforePinch.zoom * 1.5 && outPinch.scale < beforePinch.scale
      && Number.isFinite(outPinch.offset) && outPinch.offset <= 8 && !outPinch.crashed,
    `zoom ${beforePinch.zoom}→${outPinch.zoom} scale ${beforePinch.scale}→${outPinch.scale} offset=${outPinch.offset}`);

  await pinch(cdp, cx, cy, 130, 60);          // 内收 ≈ 0.46×
  await page.waitForTimeout(300);
  const inPinch = await consoleState(page);
  check(`C3 ${label} 双指内收=缩小素材（zoom↓）`, inPinch.zoom < outPinch.zoom && !inPinch.crashed,
    `zoom ${outPinch.zoom}→${inPinch.zoom}`);

  check(`C4 ${label} 手势全程未把页面打进错误边界`, !inPinch.crashed && errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${OUT}/four-issues-c-${label}.png` }).catch(() => {});
  await browser.close();
}

/* ═════════════ D 组：cow 素材 ═════════════
 * 真库读取与素材取证都放在浏览器里做（本机 node 直连被网络策略挡住，浏览器侧畅通）。 */
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem('boh-avatar-frame-id', 'cow'));
  await page.goto(`${BASE}/#/user-space?tab=posts`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitVueApp(page);
  await page.waitForTimeout(2500);

  const data = await page.evaluate(async ({ supaUrl, anon }) => {
    const res = await fetch(`${supaUrl}/rest/v1/avatar_frames?select=id,name,url,source_url,scale&order=sort_order.asc`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` }
    });
    const frames = await res.json();
    const digest = async (u) => {
      if (!u) return '';
      if (!/^https?:/.test(u)) return `local:${u}`;   // 内置素材（相对路径）不可能是同一份云文件
      try {
        const r = await fetch(u);
        const buf = await r.arrayBuffer();
        const d = await crypto.subtle.digest('SHA-256', buf);
        return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (err) {
        return `ERR:${String(err).slice(0, 40)}`;
      }
    };
    const cow = frames.find((f) => f.id === 'cow') || {};
    const white = frames.find((f) => f.id === 'white-cat') || {};
    return {
      frames: frames.map((f) => ({ id: f.id, url: f.url, scale: f.scale })),
      cow, white,
      cowBaked: await digest(cow.url), whiteBaked: await digest(white.url),
      cowSrc: await digest(cow.source_url), whiteSrc: await digest(white.source_url)
    };
  }, { supaUrl: SUPABASE_URL, anon: ANON });

  info('D 库内 cow/white-cat', JSON.stringify({ cow: data.cow, white: data.white }));
  info('D 素材指纹', JSON.stringify({ cowBaked: data.cowBaked, whiteBaked: data.whiteBaked, cowSrc: data.cowSrc, whiteSrc: data.whiteSrc }));

  check('D1 cow 行与白绒猫不是同一份成品图（按字节比对）',
    Boolean(data.cowBaked) && data.cowBaked !== data.whiteBaked,
    `cow=${data.cowBaked} white=${data.whiteBaked}`);
  check('D2 cow 行不与白绒猫共用原图',
    !data.cowSrc || data.cowSrc !== data.whiteSrc,
    `cowSrc=${data.cowSrc} whiteSrc=${data.whiteSrc}`);
  check('D3 cow 行 url 指回仓库奶牛素材', data.cow.url === COW_FIXED_URL, String(data.cow.url));
  check('D4 cow 行 scale 与内置口径一致（1.60）', Number(data.cow.scale) === 1.6, String(data.cow.scale));

  // D5 前端渲染：佩戴 cow 的个人资料 hero 必须画奶牛素材（DB 优先合并的现场）
  await injectLogin(page);
  await page.waitForSelector('.profile-hero-body .boh-avatar-frame', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const bg = await page.evaluate(() => {
    const el = document.querySelector('.profile-hero-body .boh-avatar-frame');
    return el ? getComputedStyle(el).backgroundImage : null;
  });
  check('D5 个人资料 hero 佩戴「奶牛抱抱」画的是奶牛素材', Boolean(bg && bg.includes('cow-frame.png')), String(bg).slice(0, 140));
  check('D 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${OUT}/four-issues-d-cow.png` }).catch(() => {});
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) failed.forEach((f) => console.log(`  FAIL ${f.name} :: ${f.detail}`));
process.exit(failed.length ? 1 : 0);
