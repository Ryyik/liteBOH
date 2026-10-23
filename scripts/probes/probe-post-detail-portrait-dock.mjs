#!/usr/bin/env node
/**
 * probe-post-detail-portrait-dock.mjs — 竖屏底部操作栏必须真的贴屏幕底（2026-10-23）
 *
 * 用户报障：「竖屏的评论区的操作栏应该固定在屏幕底部的」。
 *
 * 根因不是「没写 position:fixed」（那三条规则一直都在），而是**被祖先的
 * transform 破坏了包含块**：style.scoped.css 的整页进场动画当时写的是
 * `animation: pd-page-enter … both`，fill-mode `both` 让 transform 在动画结束后
 * 被永久保留（即便关键帧终态是 `none`，计算值仍是 matrix(1,0,0,1,0,0)）。
 * 而「祖先有 transform」会把 position:fixed 的包含块从视口换成那个祖先 ⇒
 * 底栏贴到了 .post-detail-page 的底边（实测 top:1618px、距视口底 −835px）。
 *
 * 判据（全部用 getBoundingClientRect 对 window.innerHeight 比，不看 computed）：
 *   A. 底栏存在且 position:fixed
 *   B. 底栏底边 == 视口底（容差 2px）—— 这是「真的在屏幕底部」的唯一硬标准
 *   C. 滚动后仍贴底（fixed 的核心价值；不是「滚到文档底部才对齐」）
 *   D. 详情根元素的 transform 在动画**落定后**必须是 none
 *      （这正是 B 能成立的前提，也是本次事故的根因位）
 *   E. 进场动画仍然播放（修 fill-mode 不能把动画一起弄没）
 *
 * ⚠️ 坑：D/E 都是瞬时值。E 必须在动画窗口内读（约 100~150ms），
 *    超时读到 animation:none 是假红；D 必须等落定后读，太早读到中间帧也是假红。
 *
 * 用法：node scripts/probes/probe-post-detail-portrait-dock.mjs [--assert]
 */
import { chromium } from 'playwright';

const ASSERT = process.argv.includes('--assert');
const BASE = 'http://[::1]:5173';
const POST = '0ac059e1-b258-41ee-8407-0e0a5752f6a7';
const results = [];
const rec = (n, pass, d) => {
  results.push({ n, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}   ${n}${d ? `\n        ${d}` : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const run = async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));

  await p.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, { timeout: 40000 });
  await p.waitForTimeout(3000);

  // 走真实路由进入（不用 open()，那是横屏弹窗路径）
  await p.evaluate((id) => {
    location.hash = `#/forum/post/${id}`;
  }, POST);

  /* E：动画窗口内读进场。
     ⚠️ 不能「固定 110ms 后读一次」—— 路由切换是异步的，110ms 时根元素可能还没挂上，
     读到 null 就成了假红（实测抖动出现过一次 4/5）。
     改成：先等元素出现，再用 rAF 连采若干帧，取**第一个 opacity < 1 的样本**。
     这样既在动画窗口内（第一帧），又不受挂载时机抖动影响。 */
  await p.waitForSelector('.post-detail-page', { timeout: 20000 }).catch(() => {});
  const enter = await p.evaluate(async () => {
    const read = () => {
      const el = document.querySelector('.post-detail-page');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { anim: cs.animationName, fill: cs.animationFillMode, opacity: cs.opacity };
    };
    // 等元素 + 采样：最多 40 帧（≈660ms），优先返回「动画在播」的那一帧
    let firstSeen = null;
    for (let i = 0; i < 40; i += 1) {
      const s = read();
      if (s) {
        if (!firstSeen) firstSeen = s;
        if (s.anim !== 'none' && parseFloat(s.opacity) < 1) return s;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return firstSeen;
  });

  await p.waitForSelector('.pd-actionbar--page', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);

  const measure = () =>
    p.evaluate(() => {
      const el = document.querySelector('.pd-actionbar--page');
      if (!el) return { missing: true };
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const root = document.querySelector('.post-detail-page');
      return {
        position: cs.position,
        gap: +(window.innerHeight - rect.bottom).toFixed(1),
        viewportH: window.innerHeight,
        scrollY: Math.round(window.scrollY),
        rootTransform: root ? getComputedStyle(root).transform : null,
      };
    });

  const top = await measure();
  rec(
    'A. 竖屏底栏存在且 position:fixed',
    !top.missing && top.position === 'fixed',
    top.missing ? '未找到 .pd-actionbar--page' : `position=${top.position}`,
  );

  rec(
    'B. 底栏底边 == 视口底（真的在屏幕底部）',
    !top.missing && Math.abs(top.gap) <= 2,
    top.missing ? '—' : `距视口底 ${top.gap}px（容差 2；事故时是 −835px）`,
  );

  await p.evaluate(() => window.scrollTo(0, 600));
  await p.waitForTimeout(500);
  const scrolled = await measure();
  rec(
    'C. 滚动后仍贴底',
    !scrolled.missing && Math.abs(scrolled.gap) <= 2 && scrolled.scrollY > 100,
    scrolled.missing ? '—' : `scrollY=${scrolled.scrollY} 距视口底 ${scrolled.gap}px`,
  );

  rec(
    'D. 落定后详情根元素 transform=none（fixed 包含块不被污染）',
    !top.missing && top.rootTransform === 'none',
    top.missing ? '—' : `transform=${top.rootTransform}（事故时是 matrix(1,0,0,1,0,0)）`,
  );

  rec(
    'E. 进场动画仍然播放（修 fill-mode 没把动画弄没）',
    Boolean(enter) && enter.anim !== 'none' && parseFloat(enter.opacity) < 1,
    enter ? `animation=${enter.anim} fill=${enter.fill} opacity=${enter.opacity}` : '未拿到根元素',
  );

  if (errs.length) console.log(`        （页面报错 ${errs.length} 条：${errs[0]}）`);
  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n小结  ${passed}/${results.length} 项达标`);
  if (ASSERT && passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error('探针异常：', e.message);
  if (ASSERT) process.exit(1);
});
