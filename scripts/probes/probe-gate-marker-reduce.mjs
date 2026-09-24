/**
 * 验证 2026-09-24 晚修复：
 * A. gate 标记 localStorage + 24h 窗口（同窗口跳过、清标记重播）
 * B. reduce 下降级不瞬跳（gate 淡出、论坛层淡入、底栏淡入均有可感知动画时长）
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:5173';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  // ---------- A. 标记机制 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.home-gate .street-hero', { timeout: 20000 });
    // 触发进论坛 → markGatePassed 写 localStorage 时间戳
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1600);
    const stored = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('boh-home-gate-passed'));
      return keys.map((k) => ({ key: k, value: localStorage.getItem(k) }));
    });
    const tsOk = stored.length === 1 && Number(stored[0].value) > Date.now() - 60_000;
    check('A1 进论坛后 localStorage 写入时间戳（key 前缀 boh-home-gate-passed）', tsOk, JSON.stringify(stored));

    // 同一页内再挂 Home（hash 往返）→ 24h 窗口内跳过
    await page.evaluate(() => { location.hash = '#/about'; });
    await page.waitForTimeout(600);
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(1200);
    const gateGone = await page.evaluate(() => !document.querySelector('.home-gate'));
    check('A2 24h 窗口内再访问：开场画跳过（不再打扰）', gateGone);
    await ctx.close();
  }

  // ---------- A3. 清标记 → 重播 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      // 预置一个「1 小时前看过」的标记（窗口内）→ 应跳过
      const key = `boh-home-gate-passed:${document.querySelector('meta[name="boh-build-id"]')?.content || 'x'}`;
      // build-id 在 dev 为空 → key 不带后缀；直接按前缀写
      localStorage.setItem('boh-home-gate-passed', String(Date.now() - 3600_000));
    });
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const skipped = await page.evaluate(() => !document.querySelector('.home-gate'));
    check('A3 窗口内（1h 前看过）访问：跳过开场画', skipped);
    await ctx.close();
  }

  // ---------- A4. 超 24h 窗口 → 重播（独立 context：addInitScript 不可移除，会在 reload 时复跑覆盖标记） ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('boh-home-gate-passed', String(Date.now() - 25 * 3600_000));
    });
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const replayed = await page.evaluate(() => !!document.querySelector('.home-gate'));
    check('A4 超 24h 窗口（25h 前看过）：开场画重播', replayed);
    await ctx.close();
  }

  // ---------- B. reduce 降级 ----------
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block',
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.home-gate .street-hero', { timeout: 20000 });
    await page.waitForTimeout(800);

    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150); // 动画中段采样（reduce 版 300ms）
    const mid = await page.evaluate(() => {
      const gate = document.querySelector('.home-gate');
      const stage = document.querySelector('.home-forum-stage');
      const gateAnim = gate?.getAnimations() || [];
      const stageAnim = stage?.getAnimations() || [];
      return {
        gateAlive: !!gate,
        gateAnimName: gateAnim[0]?.animationName || null,
        gateAnimDur: gateAnim[0]?.effect?.getTiming().duration ?? null,
        stageAnimName: stageAnim[0]?.animationName || null,
        gateOpacity: gate ? getComputedStyle(gate).opacity : null,
      };
    });
    check('B1 reduce 下 gate 退场仍播放（非瞬跳）', mid.gateAlive && /homeGateExitReduced/.test(mid.gateAnimName || ''),
      `anim=${mid.gateAnimName} dur=${mid.gateAnimDur}ms`);
    check('B2 reduce 下 gate 退场动画时长 300ms（可感知）', Number(mid.gateAnimDur) === 300, `${mid.gateAnimDur}ms`);
    check('B3 reduce 下论坛层淡入仍播放', /homeForumStageInReduced/.test(mid.stageAnimName || ''), `anim=${mid.stageAnimName}`);

    // 底栏淡入（is-entering 期间）
    await page.waitForTimeout(700); // 560ms 延迟 + 一点余量 → 底栏应处于入场中或已入场
    const nav = await page.evaluate(() => {
      const el = document.querySelector('.bottom-nav-glass');
      if (!el) return { exists: false };
      const anims = el.getAnimations();
      return {
        exists: true,
        entering: el.classList.contains('is-entering'),
        animName: anims[0]?.animationName || null,
        opacity: getComputedStyle(el).opacity,
      };
    });
    check('B4 reduce 下底栏存在且有入场动画（淡入而非瞬现）',
      nav.exists && /bottomNavFadeInReduced/.test(nav.animName || ''),
      `anim=${nav.animName} opacity=${nav.opacity} entering=${nav.entering}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.pass).length;
console.log(`\n[gate-marker-reduce] ${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
