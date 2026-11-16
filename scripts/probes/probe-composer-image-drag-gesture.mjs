#!/usr/bin/env node
/**
 * probe-composer-image-drag-gesture.mjs — 发帖图片条「长按拖动换序」的真实手势自证
 *
 * ## 为什么单独一条（2026-11-16，用户报障「常规发帖图片不能拖动前后 / 不能拖动改变顺序」）
 * `probe-composer-image-strip.mjs` 已经有 C1「长按拖动可以换序」且用的是真实
 * `Input.dispatchTouchEvent`，**但它一直是绿的**，而线上确实拖不动。真因：
 *
 *   拖拽期间浏览器会把这串手指位移判给某个滚动容器（外层 `.composer-content-scroll`
 *   是纵向滚动、条带自己是横向滚动），然后发 `pointercancel`：
 *   卡片明明已经 `is-lifted`、`is-reordering`，**第一次移动手指就被拆摊**，
 *   顺序原样还原。而且它是**间歇性**的 —— 同一段手势有时 6/6 成功、有时 2/6 成功。
 *   所以「顺序变了」这一条断言在键盘态、首步 50px+ 的时序下根本命中不了。
 *
 * 数据（关掉 `useImageStripDrag` 的 `addTouchBlock()` 前后，同一段手势各 6 轮）：
 *   · 修复关：6 轮里 2 轮成功，pointercancel 合计 18 次（3~6 次/轮）
 *   · 修复开：6 轮 6 轮成功，pointercancel 0 次
 *
 * ## 本探针的复现条件（三个都不能少，缺一个就复现不出来）
 *   1. **不开键盘**（`isKeyboardOpen` 保持 false）—— 键盘态下外层滚动容器变矮，
 *      手势仲裁的落点不同，会绕开这个 flake；
 *   2. **内容层滚到底**（图片条已完全在视口内）；
 *   3. **首步位移 20px**（首步就 50px+ 时浏览器很少判给滚动容器）。
 *
 * ## 断言
 *   A 每轮长按后进入 is-lifted（手势真的开始了）
 *   B 每轮拖完顺序必须变化（提交了，不是被拆摊后还原）
 *   C 全程 pointercancel 必须为 0（拖拽没被滚动仲裁打断）
 *
 * 运行：node scripts/probes/probe-composer-image-drag-gesture.mjs（需 dev server 5173）
 * 反证：把 useImageStripDrag 里 startDrag 的 `addTouchBlock()` 注释掉 → A 仍绿，B/C 红
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.PROBE_BASE || process.env.BASE || 'http://127.0.0.1:5173';
const OUT = 'debug-screenshots/composer-drag-gesture';
const ROUNDS = 6;
const MOVE_DX = [20, 60, 110, 170, 235];

fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log('PASS ', name, detail ? '— ' + detail : '');
  } else {
    fail += 1;
    console.log('FAIL ', name, detail ? '— ' + detail : '');
  }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    localStorage.setItem('boh-theme', 'light');
    localStorage.setItem('boh-home-gate-passed', String(Date.now()));
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));

  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(400);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      const auth = pinia.state.value.auth;
      auth.isLoggedIn = true;
      Object.assign(auth.userInfo, {
        id: 'a1b2c3d4-0000-4000-8000-000000000003',
        username: 'probe_drag_gesture',
        role: 'user',
        points: 1,
      });
    });
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('.forum-section-shell', { timeout: 20000 });
  await page.waitForTimeout(1400);
  await page.click('.mobile-compose-fab');
  await page.waitForSelector('.mobile-composer-overlay .editor-card', { timeout: 10000 });
  await page.waitForTimeout(300);

  await page.setInputFiles('.post-image-input', [
    'public/demo-album/p1.jpg',
    'public/demo-album/p3.jpg',
    'public/demo-album/p5.jpg',
    'public/demo-album/p7.jpg',
  ]);
  await page.waitForTimeout(1400);
  const confirm = page.locator('button:has-text("全部确认")').first();
  if (await confirm.count()) {
    await confirm.click();
    await page.waitForTimeout(3200);
  }

  /* 复现条件之一：不开键盘。probe 里任何 focus 都会唤起软键盘模拟，
     所以这里一律用 evaluate 滚内容，不点输入框。 */
  await page.evaluate(() => {
    const el = document.querySelector('.composer-content-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);

  const order = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('.post-image-preview-item')).map((el) =>
        (el.querySelector('img')?.getAttribute('src') || '').split('/').pop().slice(0, 8),
      ),
    );

  const cardCount = (await order()).length;
  check('A0 条带里是 4 张卡（换序才有意义）', cardCount === 4, `count=${cardCount}`);

  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];

  let cancelTotal = 0;
  let liftedRounds = 0;
  let movedRounds = 0;

  for (let round = 1; round <= ROUNDS; round += 1) {
    await page.evaluate(() => {
      const strip = document.querySelector('.post-image-preview-grid');
      if (strip) strip.scrollLeft = 0;
      window.__probeCancel = 0;
      if (!window.__probeCancelBound) {
        window.__probeCancelBound = true;
        window.addEventListener(
          'pointercancel',
          () => {
            window.__probeCancel += 1;
          },
          true,
        );
      }
    });

    const box = await page.locator('.post-image-preview-item').first().boundingBox();
    const sx = Math.round(box.x + box.width / 2);
    const sy = Math.round(box.y + box.height / 2);
    const before = await order();

    await touch('touchStart', pt(sx, sy));
    await page.waitForTimeout(420); // 长按阈值 300ms + 余量
    const lifted = await page.evaluate(
      () => document.querySelectorAll('.post-image-preview-item.is-lifted').length,
    );
    if (lifted === 1) liftedRounds += 1;

    for (const dx of MOVE_DX) {
      await touch('touchMove', pt(sx + dx, sy));
      await page.waitForTimeout(45);
    }
    await page.waitForTimeout(100);
    await touch('touchEnd', []);
    await page.waitForTimeout(800);

    const after = await order();
    const cancel = await page.evaluate(() => window.__probeCancel);
    cancelTotal += cancel;
    const moved = JSON.stringify(before) !== JSON.stringify(after);
    if (moved) movedRounds += 1;
    console.log(
      `  第 ${round} 轮：lifted=${lifted} cancel=${cancel} 顺序${moved ? '已变' : '未变'} | ${before.join(',')} → ${after.join(',')}`,
    );
    if (round === 1) {
      await page.screenshot({ path: `${OUT}/after-drag.png` });
    }
  }

  check(
    `A 每轮长按都能拾起卡片（${liftedRounds}/${ROUNDS}）`,
    liftedRounds === ROUNDS,
    `lifted=${liftedRounds}`,
  );
  check(
    `B 每轮拖完都真的换了序（${movedRounds}/${ROUNDS}）`,
    movedRounds === ROUNDS,
    `moved=${movedRounds}`,
  );
  check(
    'C 全程零 pointercancel（拖拽未被滚动仲裁打断）',
    cancelTotal === 0,
    `cancel=${cancelTotal}`,
  );
  check('D 全程零 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await context.close();
} finally {
  await browser.close();
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
