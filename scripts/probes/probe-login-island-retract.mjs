import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：灵动岛登录的「回收」（收起）动画必须逐帧插值，不能单帧闪掉
//
// 根因（2026-09-25）：展开态这张卡的 transform / border-radius / opacity 是
// 「入场动画 mobileIslandAppear（竖屏）/ landscapeLoginIslandIn（横屏）用
// fill-mode both 停住的值」。浏览器在「移除动画 + 同帧改该属性」时不会为这次变化
// 启动过渡 → 值一帧直接跳到终态。修复前实测：
//   · 竖屏 390×844：加类瞬间 transform 即 matrix(0.86,0,0,1,0,-694)、opacity 0，
//     随后 700ms 静止，到点整块消失（观感 = 啪地闪掉）
//   · 横屏 1440×900：860×276@290,72 → 241×77@600,10，同样零中间帧
// 修法：回收改用显式关键帧动画（mobileIslandRetract / landscapeLoginIslandOut），
// 动画优先级高于普通声明，不受上述限制。
//
// 断言（两个视口各跑一遍）：
//   R1 加类前是展开态（transform 为单位矩阵）
//   R2 存在正在跑的回收动画（getAnimations 里有它；过渡不算）
//   R3 120ms 处 transform 严格处于起止之间（有中间帧 = 真的在动）
//   R4 120ms 处 opacity 严格处于 0 与 1 之间
//   R5 收尾落在目标几何（横屏：宽 ≈ 241 / 落在导航胶囊那一条；竖屏：≈ 320×135）
//   R6 收尾 opacity ≈ 0（不回弹）
//   R7 reduce-motion：不跑位移动画，但仍有可见渐隐（不是到点消失）
//
// 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）
// 运行：node scripts/probes/probe-login-island-retract.mjs
//
// counter-proof（手动）：把回收规则改回 `animation: none`（或删掉 animation 只留
// transform）→ R2/R3/R4 必红。
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots/login-island-retract';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('PASS ', name, detail ? '— ' + detail : ''); }
  else { fail += 1; console.log('FAIL ', name, detail ? '— ' + detail : ''); }
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const errors = [];

const mat = (t) => (t.match(/matrix\(([^)]+)\)/) || [, ''])[1].split(',').map((n) => Number(n.trim()));
/** transform: none（reduce 档会被 !important 置 none）与单位矩阵都算「未位移」 */
const isIdentity = (t) => {
  if (t === 'none') return true;
  const m = mat(t);
  return Math.abs(m[0] - 1) < 0.01 && Math.abs(m[3] - 1) < 0.01 && Math.abs(m[5]) < 0.5;
};

async function openLoginIsland(width, height, { reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null, { timeout: 30000 }
  );
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia.state.value.auth.showLoginModal = true;
  });
  await page.waitForSelector('.boh-login-modal-container', { timeout: 15000 });
  await page.waitForTimeout(1300); // 等入场动画（竖屏 900ms / 横屏 560ms）跑完
  return { context, page };
}

/** 加类后逐帧采样（含动画对象、几何） */
const sampleRetract = (page, marks = [0, 120, 300, 550, 760]) => page.evaluate(async (stops) => {
  const overlay = document.querySelector('.boh-login-modal-overlay');
  const card = document.querySelector('.boh-login-modal-container');
  const read = (t) => {
    const cs = getComputedStyle(card);
    const b = card.getBoundingClientRect();
    return {
      t,
      transform: cs.transform,
      opacity: Number(cs.opacity),
      rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      animations: card.getAnimations().map((a) => a.animationName || a.transitionProperty || '?')
    };
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = [read(-1)];
  overlay.classList.add('mobile-login-closing');
  let prev = 0;
  for (const stop of stops) {
    await wait(stop - prev);
    prev = stop;
    frames.push(read(stop));
  }
  return frames;
}, marks);

function assertRetract(tag, frames, expect) {
  const start = frames[0];
  const end = frames[frames.length - 1];
  const mid = frames.find((f) => f.t === 120) || frames[2];

  check(`${tag} R1 加类前是展开态（transform 未位移）`, isIdentity(start.transform), start.transform);

  check(`${tag} R2 回收是动画驱动的（存在 running 的回收动画）`,
    end.animations.some((n) => /Retract|IslandOut/.test(n)) ||
    frames.some((f) => f.animations.some((n) => /Retract|IslandOut/.test(n))),
    JSON.stringify([...new Set(frames.flatMap((f) => f.animations))]));

  // 位移全程：起止两端都用矩阵的 e/f（translateX/Y）刻度判定
  const st = mat(start.transform);
  const en = mat(end.transform);
  const travel = Math.hypot(en[4] - st[4], en[5] - st[5]) + Math.abs(en[0] - st[0]) * 100 + Math.abs(en[3] - st[3]) * 100;
  const mm = mat(mid.transform);
  const moved = Math.hypot(mm[4] - st[4], mm[5] - st[5]) + Math.abs(mm[0] - st[0]) * 100 + Math.abs(mm[3] - st[3]) * 100;
  check(`${tag} R3 120ms 处 transform 严格处于起止之间（真的在动，不是单帧瞬跳）`,
    moved > travel * 0.02 && moved < travel * 0.98,
    `走了 ${moved.toFixed(1)} / 全程 ${travel.toFixed(1)}；mid=${mid.transform}`);

  check(`${tag} R4 120ms 处 opacity 严格处于 (0,1)`,
    mid.opacity > 0.02 && mid.opacity < 0.98, String(mid.opacity));

  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  check(`${tag} R5 收尾落在目标几何（${expect.describe}）`,
    near(end.rect.w, expect.w, expect.wTol) && near(end.rect.y, expect.y, expect.yTol),
    `w=${end.rect.w} y=${end.rect.y}`);
  check(`${tag} R6 收尾 opacity ≈ 0（不回弹）`, end.opacity <= 0.02, String(end.opacity));
}

try {
  // ---------------- 竖屏 390×844 ----------------
  {
    const { context, page } = await openLoginIsland(390, 844);
    console.log('\n--- 竖屏 390×844 ---');
    const frames = await sampleRetract(page);
    for (const f of frames) {
      console.log(`    t=${String(f.t).padStart(4)}  op=${f.opacity.toFixed(2)}  ${f.rect.w}x${f.rect.h}@${f.rect.x},${f.rect.y}  anim=${f.animations.join(',') || '-'}`);
    }
    // 目标：320×135，落在顶部灵动岛那一条（y≈20）
    assertRetract('竖屏', frames, { describe: '≈320×135 且落在顶部岛屿区', w: 320, wTol: 24, y: 20, yTol: 60 });
    await page.screenshot({ path: `${OUT}/portrait-390-end.png` });
    await context.close();
  }

  // ---------------- 横屏 1440×900（Mac 桌面最常见形态） ----------------
  {
    const { context, page } = await openLoginIsland(1440, 900);
    console.log('\n--- 横屏 1440×900 ---');
    const frames = await sampleRetract(page);
    for (const f of frames) {
      console.log(`    t=${String(f.t).padStart(4)}  op=${f.opacity.toFixed(2)}  ${f.rect.w}x${f.rect.h}@${f.rect.x},${f.rect.y}  anim=${f.animations.join(',') || '-'}`);
    }
    // 目标：241×77，落在导航胶囊所在的那一条（y≈10）
    assertRetract('横屏', frames, { describe: '≈241×77 落在导航胶囊条', w: 241, wTol: 20, y: 10, yTol: 30 });
    await page.screenshot({ path: `${OUT}/landscape-1440-end.png` });
    await context.close();
  }

  // ---------------- reduce-motion：不跑位移动画，但仍要能淡出 ----------------
  {
    const { context, page } = await openLoginIsland(390, 844, { reducedMotion: 'reduce' });
    console.log('\n--- 竖屏 390×844 · prefers-reduced-motion: reduce ---');
    const frames = await sampleRetract(page, [0, 120, 300]);
    for (const f of frames) {
      console.log(`    t=${String(f.t).padStart(4)}  op=${f.opacity.toFixed(2)}  ${f.rect.w}x${f.rect.h}@${f.rect.x},${f.rect.y}`);
    }
    const end = frames[frames.length - 1];
    check('reduce R7 不跑位移（transform 保持 none / 单位矩阵）',
      isIdentity(frames[0].transform) && isIdentity(end.transform) && Math.abs(end.rect.w - frames[0].rect.w) < 4,
      `transform=${end.transform} ${frames[0].rect.w} → ${end.rect.w}`);
    check('reduce R8 仍有可见渐隐（不是到点消失）', end.opacity <= 0.05, String(end.opacity));
    await context.close();
  }

  check('R9 零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;
