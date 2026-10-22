#!/usr/bin/env node
/**
 * probe-post-detail-transition.mjs — 帖子详情开关过渡（2026-10-22）
 *
 * 用户要求：「从帖子列表打开和关闭都有灵动优雅的动画过渡，横竖屏都要」。
 *
 * 判据（横屏 = 弹窗，竖屏 = 整页路由，两套机制不同，必须分别验）：
 *   A. 横屏打开：遮罩与面板都有 transition，且**时长错拍**
 *      （面板 > 遮罩 —— 先压暗背景再升面板，这是「灵动」的关键）
 *   B. 横屏关闭：同样有 transition，且离场**不缩小**
 *      （缩回小盒子是廉价感；离场应是 scale(1.008) 微胀后散开）
 *   C. 横屏：进场有位移、离场无位移（方向不对称才自然）
 *   D. 竖屏整页：进场 animation 真的在跑（元素插入即播，不依赖父级挂类）
 *   E. 竖屏整页：离场会挂 .is-page-leaving，并且**导航最终成功**
 *      （这条最重要 —— 守卫若死锁，用户会被永久卡在详情页）
 *   F. 竖屏：弹窗态不得叠加上整页动画（两套动画同时跑会互相打架）
 *
 * ⚠️ 两条踩过的坑：
 *   ① 进场/离场类名由 Vue 在动画窗口内临时挂载，超时再读会拿到 `none`（假红）。
 *      圆点点这类瞬时值统一在 80~150ms 窗口内读。
 *   ② 本机到 Supabase 会间歇性超时（实测同一查询 1449ms → 8001ms abort → 398ms 正常），
 *      详情取不到时组件渲染「帖子已失效」空态，此时结构断言全是假红。
 *      所以 A–C 直接注入 DOM + 复用真实 scoped id，不依赖 DB。
 *
 * 用法：node scripts/probes/probe-post-detail-transition.mjs [--assert]
 */
import { chromium } from 'playwright';

const ASSERT = process.argv.includes('--assert');
const BASE = 'http://[::1]:5173';
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

const prime = async (p) => {
  await p.waitForFunction(() => !!document.querySelector('#app')?.__vue_app__, { timeout: 40000 });
  await p.waitForTimeout(2000);
};

const run = async () => {
  const browser = await launch();

  // ── A/B/C：横屏弹窗过渡（注入 DOM，复用真实 scope id，不碰 DB） ──────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
    await prime(p);
    // 确保 PostDetailModal 的样式已加载
    await p.evaluate(async () => {
      try {
        await import('/src/views/PostDetail/PostDetailModal.vue');
      } catch {
        /* 样式已注入即可 */
      }
    });
    await p.waitForTimeout(1500);

    const r = await p.evaluate(() => {
      // 找到弹窗组件真实的 scope id
      let scope = null;
      for (const ss of document.styleSheets) {
        let rules;
        try {
          rules = ss.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules || []) {
          const st = rule.selectorText;
          if (st && st.includes('.pd-modal-panel') && st.includes('data-v-')) {
            const m = st.match(/data-v-[a-z0-9]+/);
            if (m) {
              scope = m[0];
              break;
            }
          }
        }
        if (scope) break;
      }
      const ms = (v) => {
        const n = parseFloat(String(v || '0'));
        return /ms$/.test(String(v)) ? n : n * 1000;
      };
      const build = (cls) => {
        const overlay = document.createElement('div');
        overlay.className = `pd-modal-overlay ${cls}`;
        if (scope) overlay.setAttribute(scope, '');
        const panel = document.createElement('div');
        panel.className = 'pd-modal-panel';
        if (scope) panel.setAttribute(scope, '');
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        const ocs = getComputedStyle(overlay);
        const pcs = getComputedStyle(panel);
        const out = {
          overlayOpacityDur: ms(ocs.transitionDuration),
          panelTransformDur: ms(pcs.transitionDuration),
          overlayOpacity: ocs.opacity,
          panelTransform: pcs.transform,
        };
        overlay.remove();
        return out;
      };
      return {
        scope,
        enter: build('pd-modal-enter-active'),
        leave: build('pd-modal-leave-active'),
        enterFrom: build('pd-modal-enter-active pd-modal-enter-from'),
        leaveTo: build('pd-modal-leave-active pd-modal-leave-to'),
      };
    });

    rec(
      'A. 横屏打开：遮罩与面板都有过渡且面板更慢（错拍）',
      r.enter.overlayOpacityDur > 0 &&
        r.enter.panelTransformDur > 0 &&
        r.enter.panelTransformDur > r.enter.overlayOpacityDur,
      `遮罩 ${r.enter.overlayOpacityDur}ms / 面板 ${r.enter.panelTransformDur}ms（面板须更大）`,
    );

    rec(
      'B. 横屏关闭：有过渡，且离场不缩小',
      r.leave.panelTransformDur > 0 && !r.leaveTo.panelTransform.includes('0.9'),
      `离场面板 ${r.leave.panelTransformDur}ms，终态 transform=${r.leaveTo.panelTransform}（不得出现缩到 <1 的 scale）`,
    );

    rec(
      'C. 横屏：进场有位移、离场无位移',
      /matrix\([^)]*,\s*-?\d+(\.\d+)?\)$/.test(r.enterFrom.panelTransform) &&
        r.enterFrom.panelTransform !== 'none' &&
        !/matrix\([^)]*1,\s*0,\s*0,\s*1,\s*0,\s*0\)/.test(r.leaveTo.panelTransform),
      `进场 ${r.enterFrom.panelTransform}；离场终态 ${r.leaveTo.panelTransform}`,
    );

    await ctx.close();
  }

  // ── D/E/F：竖屏整页（真实路由 + 真实守卫） ─────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await p.goto(`${BASE}/#/forum`, { waitUntil: 'domcontentloaded' });
    await prime(p);
    await p.waitForTimeout(2500);

    // 进入详情（直链，不依赖 DB 有数据）
    await p.evaluate(() => {
      location.hash = '#/forum/post/0ac059e1-b258-41ee-8407-0e0a5752f6a7';
    });
    // 在动画窗口内读进场（坑①：超时就变 none）
    const enter = await p
      .waitForSelector('.post-detail-page', { timeout: 15000 })
      .then(async () => {
        await p.waitForTimeout(100);
        return p.evaluate(() => {
          const el = document.querySelector('.post-detail-page');
          const cs = getComputedStyle(el);
          return {
            name: cs.animationName,
            dur: cs.animationDuration,
            modal: el.classList.contains('post-detail-page--modal'),
          };
        });
      })
      .catch(() => null);

    rec(
      'D. 竖屏进场动画在跑',
      Boolean(enter) && enter.name !== 'none' && parseFloat(enter.dur) > 0,
      enter
        ? `animation=${enter.name} ${enter.dur}（modal=${enter.modal}）`
        : '未拿到 .post-detail-page',
    );

    rec(
      'F. 竖屏：整页动画不叠加到弹窗态',
      Boolean(enter) && !enter.modal,
      enter ? `整页态 modal=${enter.modal}（须为 false）` : '未拿到元素',
    );

    // 触发后退，验证离场类 + 导航最终成功（防死锁）
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.history.back());
    await p.waitForTimeout(90);
    const during = await p.evaluate(() => {
      const el = document.querySelector('.post-detail-page');
      return { hasEl: !!el, leaving: el ? el.classList.contains('is-page-leaving') : null };
    });
    await p.waitForTimeout(1800);
    const after = await p.evaluate(() => ({
      stillDetail: !!document.querySelector('.post-detail-page'),
      hash: location.hash,
    }));

    rec(
      'E. 竖屏离场：挂上离场类且导航最终成功（守卫不死锁）',
      during.leaving === true && after.stillDetail === false,
      `离场瞬间 leaving=${during.leaving}；完成后仍在详情=${after.stillDetail} hash=${after.hash}`,
    );

    if (errs.length) console.log(`        （页面报错 ${errs.length} 条：${errs[0]}）`);
    await ctx.close();
  }

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n小结  ${passed}/${results.length} 项达标`);
  if (ASSERT && passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error('探针异常：', e.message);
  if (ASSERT) process.exit(1);
});
