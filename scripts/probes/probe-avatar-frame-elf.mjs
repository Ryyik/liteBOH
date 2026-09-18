import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：Ultra 专属「菊花梨 / 奇丽草」两头像框接入回归（首发 7 天限时免费 → 到期转 Ultra）
// 入口：/#/user-space?tab=assets → 资产中心「装扮」子 tab（AvatarFrameGrid）
// 时间用 addInitScript 覆写 Date.now 注入，覆盖「免费期内 / 到期后」两态；
// 精确边界（23:59:59.999 vs 次日 00:00:00.000）由 assert-avatar-frame-campaign.mjs 钉死。
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const UUID = '3f9d5c1e-8a2b-4c7d-9e0f-1a2b3c4d5e6f';
const FRAMES = ['菊花梨', '奇丽草'];
const FILES = { 菊花梨: 'elf-flower-frame.png', 奇丽草: 'elf-grass-frame.png' };
const FREE_AT = new Date('2026-09-20T12:00:00').getTime();   // 限免期内
const AFTER_AT = new Date('2026-09-26T00:30:00').getTime();  // 到期后 30 分钟

const makeCtx = async (tier, { dark = false, timeMs = FREE_AT, frameId = '' } = {}) => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (dark) await context.addInitScript(() => localStorage.setItem('boh-theme', 'dark'));
  // 覆写 Date.now：限免判定的唯一时间来源就是它（freeUntilMs 走固定日期串，不受影响）
  await context.addInitScript((ms) => { Date.now = () => ms; }, timeMs);
  // 佩戴态必须在模块加载前写入：equippedId 是模块级单例，只在模块初始化时读一次
  if (frameId) await context.addInitScript((id) => localStorage.setItem('boh-avatar-frame-id', id), frameId);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  await page.route('**/rest/v1/rpc/get_user_subscription_tier', (r) => r.fulfill({
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range' },
    body: JSON.stringify(tier),
  }));
  return { browser, context, page, errors };
};

const injectLogin = (page) => page.evaluate((uid) => {
  const p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const s = p.state.value.auth;
  s.isLoggedIn = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: '瑞一颗', id: uid, avatarUrl: '' });
}, UUID);

const openDecor = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await injectLogin(page);
  await page.getByRole('tab', { name: '装扮' }).click({ timeout: 10000 });
  await page.waitForSelector('.afg-grid', { timeout: 10000 });
  await page.waitForTimeout(700);
};

const gridState = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.afg-card')].filter((c) => !c.classList.contains('is-placeholder'));
  const frameEl = document.querySelector('.afg-preview .boh-avatar-frame');
  const cs = frameEl ? getComputedStyle(frameEl) : null;
  return {
    cards: cards.map((c) => ({
      name: c.querySelector('.afg-card-name')?.textContent.trim(),
      locked: c.classList.contains('is-locked'),
      lockPill: c.querySelector('.afg-lock-pill')?.textContent.trim() || '',
      campaign: c.querySelector('.afg-limit-flag.is-campaign')?.textContent.trim() || '',
      frameW: (() => { const el = c.querySelector('.boh-avatar-frame'); return el ? parseFloat(getComputedStyle(el).width) : 0; })(),
      frameBg: (() => { const el = c.querySelector('.boh-avatar-frame'); return el ? getComputedStyle(el).backgroundImage : ''; })(),
    })),
    previewName: document.querySelector('.afg-preview-name-row strong')?.textContent.trim() || '',
    previewPill: document.querySelector('.afg-tier-pill')?.textContent.trim() || '',
    previewFrame: cs ? cs.backgroundImage : '',
    previewScale: frameEl ? String(frameEl.style.getPropertyValue('--boh-avatar-frame-scale')
      || cs.getPropertyValue('--boh-avatar-frame-scale')).trim() : '',
  };
});
const cardOf = (st, name) => st.cards.find((c) => c.name === name) || {};

/* ---------- 0. 素材可达 ---------- */
{
  const { browser, page, errors } = await makeCtx('ultra');
  for (const file of Object.values(FILES)) {
    const res = await page.request.get(`${BASE}/avatars/frames/${file}`);
    check(`素材可达 ${file}`, res.status() === 200 && (res.headers()['content-type'] || '').includes('image'),
      `${res.status()} ${res.headers()['content-type']}`);
  }
  check('素材阶段无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 1. 免费期内 · free 档：可自由佩戴，标限时免费 ---------- */
{
  const { browser, page, errors } = await makeCtx('free', { timeMs: FREE_AT });
  await openDecor(page);
  let st = await gridState(page);
  check('网格含两颗新框卡片', FRAMES.every((f) => st.cards.some((c) => c.name === f)), JSON.stringify(st.cards.map((c) => c.name)));
  for (const f of FRAMES) {
    const c = cardOf(st, f);
    check(`免费期内 free 档 ${f} 未锁定`, c.locked === false, JSON.stringify({ locked: c.locked, lockPill: c.lockPill }));
    check(`免费期内 ${f} 标限时免费角标`, c.campaign === '限时免费', `"${c.campaign}"`);
  }
  await page.getByRole('button', { name: /菊花梨/ }).first().click();
  await page.waitForTimeout(600);
  st = await gridState(page);
  check('免费期内佩戴菊花梨 → 预览名同步', st.previewName === '菊花梨', st.previewName);
  check('免费期内预览 pill 展示限免截止日', st.previewPill === '限时免费至 9/25', st.previewPill);
  check('免费期内框 background-image 正确', st.previewFrame.includes('elf-flower-frame.png'), st.previewFrame.slice(0, 110));
  check('限免框 scale 变量 = 2.08', st.previewScale === '2.08', st.previewScale);
  check('限免框网格卡内框层宽 ≈108px（52×2.08）', Math.abs(cardOf(st, '菊花梨').frameW - 108.16) <= 2.5,
    `${cardOf(st, '菊花梨').frameW.toFixed(1)}px`);
  await page.screenshot({ path: `${OUT}/frame-elf-campaign-light.png` });
  check('免费期内无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 2. 到期后 · free 档：转 Ultra 专属，锁定 ---------- */
{
  const { browser, page, errors } = await makeCtx('free', { timeMs: AFTER_AT });
  await openDecor(page);
  let st = await gridState(page);
  check('到期后仍含两颗新框卡片', FRAMES.every((f) => st.cards.some((c) => c.name === f)));
  for (const f of FRAMES) {
    const c = cardOf(st, f);
    check(`到期后 free 档 ${f} 锁定`, c.locked === true, JSON.stringify({ locked: c.locked, lockPill: c.lockPill }));
    check(`到期后 ${f} 锁标为 Ultra 专属`, c.lockPill === 'Ultra 专属', `"${c.lockPill}"`);
    check(`到期后 ${f} 不再标限时免费`, c.campaign === '', `"${c.campaign}"`);
  }
  const lsBefore = await page.evaluate(() => localStorage.getItem('boh-avatar-frame-id'));
  await page.getByRole('button', { name: /菊花梨/ }).first().click();
  await page.waitForTimeout(700);
  const lsAfter = await page.evaluate(() => localStorage.getItem('boh-avatar-frame-id'));
  check('到期后点击锁定框不写入佩戴态', lsAfter === lsBefore, `${lsBefore} -> ${lsAfter}`);
  const jumped = await page.evaluate(() => !document.querySelector('.afg-grid'));
  check('到期后点击锁定框跳订阅 tab', jumped, jumped ? '已离开装扮 tab' : '仍停留装扮 tab');
  await page.screenshot({ path: `${OUT}/frame-elf-expired-locked.png` });
  check('到期后无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 3. 到期后 · ultra 档：解锁可戴 ---------- */
{
  const { browser, page, errors } = await makeCtx('ultra', { timeMs: AFTER_AT });
  await openDecor(page);
  let st = await gridState(page);
  for (const f of FRAMES) {
    check(`到期后 ultra 档 ${f} 未锁定`, cardOf(st, f).locked === false, JSON.stringify(cardOf(st, f).lockPill));
  }
  for (const f of FRAMES) {
    await page.getByRole('button', { name: new RegExp(f) }).first().click();
    await page.waitForTimeout(500);
    st = await gridState(page);
    check(`到期后 ultra 档佩戴 ${f} → 预览名同步`, st.previewName === f, st.previewName);
    check(`到期后 ultra 档 ${f} 预览 pill = Ultra 专属`, st.previewPill === 'Ultra 专属', st.previewPill);
    check(`到期后 ultra 档 ${f} 框素材正确`, st.previewFrame.includes(FILES[f]), st.previewFrame.slice(0, 110));
    check(`到期后 ultra 档 ${f} 框层宽 ≈108px`, Math.abs(cardOf(st, f).frameW - 108.16) <= 2.5,
      `${cardOf(st, f).frameW.toFixed(1)}px`);
  }
  await page.screenshot({ path: `${OUT}/frame-elf-ultra-light.png` });
  check('到期后 ultra 档无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 4. 到期回收：限免期戴过，到期后 free 档回落无框 ---------- */
{
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((id) => localStorage.setItem('boh-avatar-frame-id', id), 'elf-flower');

  const runAt = async (timeMs) => {
    const page = await context.newPage();
    await page.addInitScript((ms) => { Date.now = () => ms; }, timeMs);
    await page.route('**/rest/v1/rpc/get_user_subscription_tier', (r) => r.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify('free'),
    }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
    await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    await injectLogin(page);
    await page.getByRole('tab', { name: '装扮' }).click({ timeout: 10000 });
    await page.waitForSelector('.afg-grid', { timeout: 10000 });
    await page.waitForTimeout(700);
    const name = await page.evaluate(() => document.querySelector('.afg-preview-name-row strong')?.textContent.trim() || '');
    const ls = await page.evaluate(() => localStorage.getItem('boh-avatar-frame-id'));
    await page.close();
    return { name, ls, errors };
  };

  const before = await runAt(FREE_AT);
  check('限免期内已佩戴的框在预览条生效', before.name === '菊花梨', `预览=${before.name} ls=${before.ls}`);
  const after = await runAt(AFTER_AT);
  check('到期后 free 档佩戴中的限免框自动回落「无框」', after.name === '无框', `预览=${after.name}`);
  check('回落是运行时判定而非清除本地记录', after.ls === 'elf-flower', `localStorage=${after.ls}`);
  check('回收场景无 JS 错误', before.errors.length === 0 && after.errors.length === 0,
    [...before.errors, ...after.errors].join(' | '));
  await browser.close();
}

/* ---------- 5. hero 头像同步渲染（限免期内 · ultra 档） ---------- */
{
  const { browser, page, errors } = await makeCtx('ultra', { timeMs: FREE_AT, frameId: 'elf-flower' });
  // 必须显式落到「主页」tab：UserSpace 各 tab pane 全部常驻 DOM，未激活的 pane display:none，
  // 直接查 .profile-hero-body 会命中隐藏节点，rect 全 0
  await page.goto(`${BASE}/#/user-space?tab=profile`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await injectLogin(page);
  await page.waitForSelector('.profile-hero-avatar .apple-avatar', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const hero = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.profile-hero-body .boh-avatar-frame')];
    // 取可见的那个（宽 > 0），隐藏 pane 的节点一律跳过
    const el = els.find((e) => e.getBoundingClientRect().width > 0) || els[0];
    if (!el) return { bg: '', scale: '', visible: false, w: 0, avatarW: 0 };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // 基准取 hero 头像元素（wrap 是 inline-block，computed width 回 'auto' 拿不到值）
    const avatar = el.parentElement?.querySelector('.apple-avatar');
    return {
      bg: cs.backgroundImage,
      scale: String(el.style.getPropertyValue('--boh-avatar-frame-scale') || cs.getPropertyValue('--boh-avatar-frame-scale')).trim(),
      visible: r.width > 0,
      w: r.width,
      avatarW: avatar ? avatar.getBoundingClientRect().width : 0,
    };
  });
  check('我的空间 hero 框可见（激活 tab 后）', hero.visible, hero.visible ? `框层宽 ${hero.w.toFixed(1)}px` : 'rect 宽为 0');
  check('我的空间 hero 佩戴菊花梨', hero.bg.includes('elf-flower-frame.png'),
    hero.bg ? hero.bg.slice(0, 110) : 'no .boh-avatar-frame in .profile-hero-body');
  check('hero 框 scale 变量 = 2.08', hero.scale === '2.08', hero.scale || '(空)');
  // 框层 = wrap（= 头像外框盒）的 2.08 倍：用头像+外框盒的宽度关系做交叉校验
  const ratio = hero.avatarW > 0 ? hero.w / hero.avatarW : 0;
  check('hero 框层宽 ≥ 头像宽 × 2.0（scale 已落到布局）', hero.visible && ratio >= 2.0,
    `${hero.w.toFixed(1)} / ${hero.avatarW.toFixed(1)} = ${ratio.toFixed(3)}`);
  await page.screenshot({ path: `${OUT}/frame-elf-hero.png` });
  check('hero 场景无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 6. 深色主题 ---------- */
{
  const { browser, page, errors } = await makeCtx('free', { dark: true, timeMs: FREE_AT });
  await openDecor(page);
  await page.getByRole('button', { name: /奇丽草/ }).first().click();
  await page.waitForTimeout(600);
  const st = await gridState(page);
  check('暗色下绿草框素材正确', st.previewFrame.includes('elf-grass-frame.png'), st.previewFrame.slice(0, 100));
  check('暗色下预览 pill 展示限免', st.previewPill === '限时免费至 9/25', st.previewPill);
  await page.screenshot({ path: `${OUT}/frame-elf-campaign-dark.png` });
  check('暗色无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

/* ---------- 7. 自动切档：不刷新页面，跨过截止时刻自动转 Ultra + 掉框 ---------- */
{
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // 平滑假时钟：从「截止前 20 秒」起随真实时间前进。
  // 这样模块加载后定时器仍有 ~19 秒余量，等到真实 25 秒后假时钟已越过截止。
  await context.addInitScript((near) => {
    const t0 = performance.now();
    Date.now = () => near + (performance.now() - t0);
  }, new Date('2026-09-25T23:59:40').getTime());
  await context.addInitScript(() => localStorage.setItem('boh-avatar-frame-id', 'elf-flower'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  await page.route('**/rest/v1/rpc/get_user_subscription_tier', (r) => r.fulfill({
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Expose-Headers': 'Content-Range' },
    body: JSON.stringify('free'),
  }));
  await page.goto(`${BASE}/#/user-space?tab=assets`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(2200);
  await injectLogin(page);
  await page.getByRole('tab', { name: '装扮' }).click({ timeout: 10000 });
  await page.waitForSelector('.afg-grid', { timeout: 10000 });
  await page.waitForTimeout(500);

  const before = await gridState(page);
  const c0 = cardOf(before, '菊花梨');
  check('截止前：限免可戴且预览已佩戴', c0.locked === false && before.previewName === '菊花梨',
    `locked=${c0.locked} 预览=${before.previewName} pill=${before.previewPill}`);
  check('截止前：标限时免费角标', c0.campaign === '限时免费', `"${c0.campaign}"`);

  await page.waitForTimeout(25000); // 假时钟跨过 2026-09-25 23:59:59.999

  const after = await gridState(page);
  const c1 = cardOf(after, '菊花梨');
  check('跨过截止自动转 Ultra 锁定（页面未刷新）', c1.locked === true && c1.lockPill === 'Ultra 专属',
    `locked=${c1.locked} lockPill="${c1.lockPill}"`);
  check('跨过截止自动摘掉限免角标', c1.campaign === '', `"${c1.campaign}"`);
  check('佩戴中的限免框自动回落「无框」', after.previewName === '无框', `预览=${after.previewName}`);
  await page.screenshot({ path: `${OUT}/frame-elf-autoexpire.png` });
  check('自动切档场景无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) console.log('失败项:\n' + failed.map((f) => `  - ${f.name}  ${f.detail}`).join('\n'));
process.exit(failed.length ? 1 : 0);
