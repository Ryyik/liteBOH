import { chromium } from 'playwright';

// 探针：竖屏发布会话进出场过渡（2026-10-26）
// 验证：FAB 打开后 overlay 以 FAB 中心为原点放大，关闭时缩回同一点；
//       横屏分栏不做位移（保持右区即时切换）；reduced-motion 仍有可感知反馈。
// 运行：PROBE_BASE='http://[::1]:5173' node scripts/probes/probe-composer-motion.mjs
const BASE = process.env.PROBE_BASE || 'http://[::1]:5173';
const ARGS = ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'];

const launch = () => chromium.launch({ channel: 'chrome', args: ARGS });
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      if (auth.userInfo) Object.assign(auth.userInfo, {
        id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
        username: 'probe_motion',
        role: 'user',
      });
    });
    await page.waitForTimeout(350);
    if (await page.evaluate(() => document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?.state.value.auth.isLoggedIn === true)) return;
  }
};

const openFromFab = async (page) => {
  await page.waitForSelector('.mobile-compose-fab', { state: 'visible', timeout: 20000 });
  const fabCenter = await page.locator('.mobile-compose-fab').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const start = Date.now();
  await page.click('.mobile-compose-fab');
  // 进入动画 380ms；在 ~100ms 抓中间帧，晚于 Vue 的 enter-from 帧、早于结束
  await page.waitForTimeout(100);
  const mid = await page.evaluate(() => {
    const el = document.querySelector('.mobile-composer-overlay');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      top: Math.round(r.top),
      height: Math.round(r.height),
      vh: window.innerHeight,
      transform: cs.transform,
      origin: cs.transformOrigin,
      opacity: Number(cs.opacity),
      transition: cs.transition,
    };
  });
  const elapsed = Date.now() - start;
  await page.waitForTimeout(420);
  const settled = await page.evaluate(() => {
    const el = document.querySelector('.mobile-composer-overlay');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { found: true, top: Math.round(r.top), transform: cs.transform, origin: cs.transformOrigin, opacity: Number(cs.opacity) };
  });
  return { mid, settled, elapsed, fabCenter };
};

const getTransformMatrix = (transform) => {
  if (!transform || transform === 'none') return null;
  const match = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(',').map((v) => Number(v.trim()));
  return parts;
};

const getScale = (transform) => {
  const parts = getTransformMatrix(transform);
  if (!parts) return 1;
  return parts.length === 16 ? parts[0] : parts[0];
};

const getOrigin = (origin) => {
  const match = String(origin || '').match(/^([\d.]+)px\s+([\d.]+)px$/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
};

const closeViaCancel = async (page) => {
  await page.locator('.mobile-composer-overlay .mobile-composer-back').click();
  await page.waitForTimeout(80);
  const mid = await page.evaluate(() => {
    const el = document.querySelector('.mobile-composer-overlay');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      vh: window.innerHeight,
      transform: cs.transform,
      origin: cs.transformOrigin,
      opacity: Number(cs.opacity),
      transition: cs.transition,
    };
  });
  // 内容为空时取消会直接关闭；若触发了保存确认，先处理掉再等离场结束
  const confirm = page.locator('.forum-confirm-modal');
  if (await confirm.isVisible().catch(() => false)) {
    await page.locator('.forum-confirm-btn.danger').click().catch(() => {});
  }
  await page.waitForTimeout(500);
  const gone = await page.evaluate(() => !document.querySelector('.mobile-composer-overlay'));
  return { mid, gone, confirmShown: await confirm.isVisible().catch(() => false) };
};

const browser = await launch();
try {
  // A. 竖屏进入 + 退出
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.user-space-page', { timeout: 25000 });
  await page.waitForTimeout(900);

  const enter = await openFromFab(page);
  const enterScale = getScale(enter.mid.transform);
  const enterOrigin = getOrigin(enter.mid.origin);
  const enterMoving = enter.mid.found && enterScale > 0.08 && enterScale < 0.99 && enter.mid.opacity < 0.995;
  check('A1 竖屏进入：中间帧按 FAB 原点放大', enterMoving,
    JSON.stringify({ ...enter.mid, scale: Number(enterScale.toFixed(3)), origin: enterOrigin, elapsed: enter.elapsed }));
  check('A2 竖屏进入：落定后归位到 top=0 且不透明', enter.settled.found && enter.settled.top === 0 && enter.settled.opacity > 0.99,
    JSON.stringify(enter.settled));
  check('A3 过渡属性确实包含 transform + opacity',
    enter.mid.transition.includes('transform') && enter.mid.transition.includes('opacity'),
    enter.mid.transition);
  check('A3b 动画原点来自 FAB 中心（右下角、非视口中心）',
    Boolean(enterOrigin) && Math.abs(enterOrigin.x - enter.fabCenter.x) <= 1 && Math.abs(enterOrigin.y - enter.fabCenter.y) <= 1,
    JSON.stringify({ origin: enterOrigin, fabCenter: enter.fabCenter }));

  const exit = await closeViaCancel(page);
  const exitScale = getScale(exit.mid.transform);
  const exitMoving = exit.mid.found && exitScale > 0.08 && exitScale < 0.99;
  check('A4 竖屏退出：中间帧缩向 FAB 且节点尚未被立刻移除', exitMoving,
    JSON.stringify({ ...exit.mid, scale: Number(exitScale.toFixed(3)), confirmShown: exit.confirmShown }));
  check('A5 竖屏退出：过渡结束后 overlay 真正移除', exit.gone);
  check('A6 竖屏进出无页面错误', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();

  // B. 横屏分栏：保持即时切换（不做整页位移）
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pageB = await ctxB.newPage();
  await pageB.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(pageB);
  await pageB.waitForSelector('.user-space-page', { timeout: 25000 });
  await pageB.waitForSelector('[data-rail-action="compose"]', { timeout: 20000 });
  await pageB.waitForTimeout(900);
  await pageB.click('[data-rail-action="compose"]');
  await pageB.waitForTimeout(80);
  const landscape = await pageB.evaluate(() => {
    const el = document.querySelector('.mobile-composer-overlay');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { found: true, left: Math.round(r.left), top: Math.round(r.top), transition: cs.transition, opacity: Number(cs.opacity) };
  });
  check('B1 横屏分栏：进入不做整页位移（保持右区即时呈现）',
    landscape.found && landscape.top === 0 && landscape.opacity > 0.99,
    JSON.stringify(landscape));
  await ctxB.close();

  // C. reduced-motion：允许更短，但不应变成瞬时无反馈
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const pageC = await ctxC.newPage();
  await pageC.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(pageC);
  await pageC.waitForSelector('.mobile-compose-fab', { state: 'visible', timeout: 25000 });
  await pageC.waitForTimeout(900);
  await pageC.click('.mobile-compose-fab');
  await pageC.waitForTimeout(40);
  const reduced = await pageC.evaluate(() => {
    const el = document.querySelector('.mobile-composer-overlay');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    return { found: true, transition: cs.transition, transform: cs.transform, opacity: Number(cs.opacity) };
  });
  check('C1 reduced-motion：过渡仍存在（100ms 全局兜底，不做瞬跳）',
    reduced.found && reduced.transition !== 'none',
    JSON.stringify(reduced));
  await ctxC.close();
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n===== ${checks.length - failed.length}/${checks.length} PASS =====`);
if (failed.length) process.exit(1);
