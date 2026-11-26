import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots/home-gate-overlay';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    pass += 1;
    console.log('PASS ', name, detail ? `— ${detail}` : '');
  } else {
    fail += 1;
    console.log('FAIL ', name, detail ? `— ${detail}` : '');
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

const installStubs = async (page) => {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Range': '*/0',
      },
      body: '[]',
    }),
  );
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: 'probe: anonymous' }),
    }),
  );
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range',
      },
      body: JSON.stringify({ ok: true, enabled: false, items: [] }),
    }),
  );
};

const openHome = async ({
  width = 390,
  height = 844,
  reducedMotion = 'no-preference',
  skip = false,
} = {}) => {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  await context.addInitScript(
    ({ skip: skipGate }) => {
      try {
        if (skipGate) localStorage.setItem('boh-home-gate-passed', String(Date.now()));
      } catch {
        /* storage may be unavailable */
      }
      window.__gateEvents = [];
      let appearedAt = null;
      let leavingAt = null;
      const scan = () => {
        const gate = document.querySelector('.home-gate');
        const now = performance.now();
        if (gate && appearedAt === null) {
          appearedAt = now;
          window.__gateEvents.push({ type: 'appeared', at: now });
        }
        if (gate?.classList.contains('is-leaving') && leavingAt === null) {
          leavingAt = now;
          window.__gateEvents.push({ type: 'leaving', at: now });
        }
        if (!gate && appearedAt !== null && leavingAt !== null) {
          window.__gateEvents.push({ type: 'removed', at: now });
          appearedAt = null;
          leavingAt = null;
        }
      };
      new MutationObserver(scan).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      scan();
    },
    { skip },
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error.message).slice(0, 200)));
  await installStubs(page);
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(skip ? '.forum-section-shell' : '.home-gate', { timeout: 25000 });
  return { context, page };
};

const snapshot = (page) =>
  page.evaluate(() => {
    const home = document.querySelector('.home');
    const gate = document.querySelector('.home-gate');
    const stage = document.querySelector('.home-forum-stage');
    const skip = document.querySelector('.home-gate-skip');
    const rect = skip?.getBoundingClientRect();
    const animations = gate?.getAnimations() || [];
    return {
      gatePresent: Boolean(gate),
      leaving: Boolean(gate?.classList.contains('is-leaving')),
      gatePosition: gate ? getComputedStyle(gate).position : null,
      gateOpacity: gate ? Number(getComputedStyle(gate).opacity) : null,
      gateTransform: gate ? getComputedStyle(gate).transform : null,
      gateRect: gate
        ? {
            top: gate.getBoundingClientRect().top,
            width: gate.getBoundingClientRect().width,
            height: gate.getBoundingClientRect().height,
          }
        : null,
      animationName: animations[0]?.animationName || null,
      animationDuration: animations[0]?.effect?.getTiming().duration ?? null,
      keyframes: animations[0]?.effect?.getKeyframes?.().map((frame) => Object.keys(frame)) || [],
      skipText: skip?.textContent.trim() || '',
      skipVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
      skipSize: rect ? { width: rect.width, height: rect.height } : null,
      skipRightGap: rect ? Math.round(innerWidth - rect.right) : null,
      skipBottomGap: rect ? Math.round(innerHeight - rect.bottom) : null,
      skipOnRight: rect ? rect.left > innerWidth * 0.65 : false,
      hintCount: document.querySelectorAll('.street-hero-hint, .gsh-hint').length,
      hasLegacyHint:
        document.querySelector('.home-gate')?.textContent.includes('往下逛逛') || false,
      stageInert: stage?.inert ?? null,
      settled: home?.classList.contains('home-forum-settled') || false,
      scrollY: Math.round(window.scrollY),
      overflow: document.documentElement.style.getPropertyValue('overflow') || '',
      navVisible: Boolean(document.querySelector('#unified-nav-container')),
      bottomNavVisible: Boolean(document.querySelector('.bottom-nav-glass')),
      railVisible: Boolean(document.querySelector('.userspace-rail')),
      gateCoversRail: (() => {
        const rail = document.querySelector('.userspace-rail');
        if (!rail) return true;
        const box = rail.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return Boolean(top?.closest('.home-gate'));
      })(),
      hasProgressVars: ['--gate-p', '--forum-p'].some((name) => home?.style.getPropertyValue(name)),
    };
  });

const readEvents = (page) => page.evaluate(() => window.__gateEvents || []);

try {
  {
    const { context, page } = await openHome();
    const initial = await snapshot(page);
    console.log('\n--- A 初始遮罩与无下拉交互 ---');
    check('A1 普通全屏 fixed 遮罩', initial.gatePresent && initial.gatePosition === 'fixed');
    check(
      'A2 遮罩覆盖视口且完全不透明',
      initial.gateRect?.top === 0 &&
        initial.gateRect?.width === 390 &&
        initial.gateRect?.height === 844 &&
        initial.gateOpacity === 1,
      JSON.stringify(initial.gateRect),
    );
    check('A3 不再有位移或缩放', initial.gateTransform === 'none', String(initial.gateTransform));
    check(
      'A4 跳过按钮可见且触控高度至少 44px',
      initial.skipVisible && initial.skipSize.height >= 44,
    );
    check(
      'A5 跳过按钮位于右下角',
      initial.skipOnRight &&
        initial.skipRightGap >= 18 &&
        initial.skipRightGap <= 24 &&
        initial.skipBottomGap >= 18 &&
        initial.skipBottomGap <= 24,
      `right=${initial.skipRightGap} bottom=${initial.skipBottomGap}`,
    );
    check('A6 不再显示下拉提示文案', initial.hintCount === 0 && !initial.hasLegacyHint);
    check('A7 遮罩期间论坛层 inert', initial.stageInert === true);
    check('A8 遮罩期间锁定文档滚动', initial.overflow === 'hidden' && initial.scrollY === 0);
    check('A9 不再注入旧进度变量', !initial.hasProgressVars);

    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
    const afterWheel = await snapshot(page);
    check('A10 滚轮不再触发下拉退场', afterWheel.gatePresent && !afterWheel.leaving);
    check('A11 滚轮不会带走底层文档', afterWheel.scrollY === 0);
    await page.screenshot({ path: `${OUT}/portrait-overlay.png` });

    await page.waitForSelector('.home-gate.is-leaving', { timeout: 4000 });
    const fading = await snapshot(page);
    check(
      'A12 2 秒后启动纯 opacity 渐隐',
      fading.leaving &&
        fading.animationName?.startsWith('homeGateExit') &&
        !fading.animationName?.startsWith('homeGateExitReduced'),
    );
    check('A13 渐隐时长 560ms', fading.animationDuration === 560, String(fading.animationDuration));
    check(
      'A14 渐隐关键帧只改透明度',
      fading.keyframes.length > 0 &&
        fading.keyframes.every((keys) =>
          keys.every(
            (key) =>
              key === 'opacity' ||
              key === 'offset' ||
              key === 'computedOffset' ||
              key === 'composite' ||
              key === 'easing',
          ),
        ),
      JSON.stringify(fading.keyframes),
    );

    await page.waitForSelector('.home-gate', { state: 'detached', timeout: 3000 });
    const done = await snapshot(page);
    const events = await readEvents(page);
    const appeared = events.find((event) => event.type === 'appeared');
    const leaving = events.find((event) => event.type === 'leaving');
    const removed = events.find((event) => event.type === 'removed');
    const holdMs = leaving && appeared ? leaving.at - appeared.at : null;
    const fadeMs = removed && leaving ? removed.at - leaving.at : null;
    check(
      'A15 完整展示约 2 秒后开始渐隐',
      holdMs >= 1850 && holdMs <= 2200,
      `${holdMs?.toFixed(0)}ms`,
    );
    check('A16 渐隐结束后移除遮罩', fadeMs >= 520 && fadeMs <= 850, `${fadeMs?.toFixed(0)}ms`);
    check('A17 落定后解除 inert 与滚动锁', done.stageInert === false && done.overflow === '');
    check('A18 落定后论坛与导航就位', done.settled && done.navVisible && done.bottomNavVisible);
    const marker = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('boh-home-gate-passed'))
        .map((key) => Number(localStorage.getItem(key))),
    );
    check('A19 自动退场写入 24h 通过标记', marker.length === 1 && marker[0] > Date.now() - 60_000);

    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(400);
    check('A20 退场后滚动权交还', (await snapshot(page)).scrollY > 100);
    await page.screenshot({ path: `${OUT}/portrait-settled.png` });
    await context.close();
  }

  {
    const { context, page } = await openHome();
    console.log('\n--- B 跳过立即渐隐 ---');
    await page.locator('.home-gate-skip').click();
    await page.waitForSelector('.home-gate.is-leaving', { timeout: 500 });
    const fading = await snapshot(page);
    check(
      'B1 点击跳过立即进入渐隐',
      fading.leaving && fading.animationName?.startsWith('homeGateExit'),
    );
    check('B2 渐隐期间底层仍不可操作', fading.stageInert === true && fading.overflow === 'hidden');
    await page.waitForSelector('.home-gate', { state: 'detached', timeout: 2000 });
    const done = await snapshot(page);
    check(
      'B3 跳过后完成落定并交还滚动',
      done.settled && done.stageInert === false && done.overflow === '',
    );
    await context.close();
  }

  {
    const { context, page } = await openHome({ reducedMotion: 'reduce' });
    console.log('\n--- C 减少动态效果 ---');
    await page.waitForSelector('.home-gate.is-leaving', { timeout: 4000 });
    const fading = await snapshot(page);
    check(
      'C1 reduce 使用独立纯透明度退场',
      fading.animationName?.startsWith('homeGateExitReduced'),
    );
    check(
      'C2 reduce 渐隐缩短为 300ms',
      fading.animationDuration === 300,
      String(fading.animationDuration),
    );
    await page.waitForSelector('.home-gate', { state: 'detached', timeout: 1500 });
    check('C3 reduce 仍完整展示 2 秒', (await snapshot(page)).settled);
    await context.close();
  }

  {
    const { context, page } = await openHome({ skip: true });
    console.log('\n--- D 已通过会话 ---');
    const done = await snapshot(page);
    check('D1 首帧不渲染遮罩', !done.gatePresent);
    check('D2 首帧直接落定且论坛可操作', done.settled && done.stageInert === false);
    check('D3 不残留滚动锁', done.overflow === '');
    await context.close();
  }

  {
    const { context, page } = await openHome({ width: 1440, height: 900 });
    console.log('\n--- E 横屏 ---');
    const initial = await snapshot(page);
    check('E1 横屏跳过按钮同样贴右下角', initial.skipOnRight && initial.skipRightGap <= 24);
    check('E2 横屏遮罩压住左栏', initial.gateCoversRail);
    await page.waitForSelector('.home-gate', { state: 'detached', timeout: 5000 });
    const done = await snapshot(page);
    check('E3 横屏退场后左栏可见', done.railVisible && done.settled);
    await page.screenshot({ path: `${OUT}/landscape-settled.png` });
    await context.close();
  }

  check('Z1 零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
