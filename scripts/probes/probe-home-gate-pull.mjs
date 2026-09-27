import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：首页开场画「跟手拖拽」入场（2026-09-27 由阈值触发改为 progress 派生）
//
// 这套入场的契约（断言就是照它们写的）：
//   · 进度真源只有一条 --gate-p（0~1），写在 .home 的 inline style 上；
//   · 开场层位移 / 静态模糊副本 / 转场背板 / 论坛卡片位移 全部由它派生
//     （不是「各播各的关键帧动画」——旧实现就是那样，所以手指与画面零耦合）；
//   · 手指（wheel）推多少画面就走多少，且文档自身不许跟着滚（事件层 preventDefault）；
//   · 释放判定：进度 ≥ 0.22 或速度 ≥ 0.6 → 提交；否则回弹（可反悔）；
//   · 提交后：gate 卸载 → stage 解除 transform + 圆角归零 + 阴影收起 → 进度归 1；
//   · reduce：不位移（只留淡入淡出），且时长表换短；
//   · 键盘：一次按键即完成（旧实现要按两次）。
//
// 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）
// 运行：node scripts/probes/probe-home-gate-pull.mjs
//
// counter-proof（手动，改完记得复原）：
//   1) 把 index.vue 的 handleWheel 改回「累计 28px 直接 enterForum」
//      → B1/B2/B5 必红（--gate-p 不再随 deltaY 变化）
//   2) 删掉 .home-forum-stage 的 translateY(calc((1 - var(--forum-p)) * 100vh))
//      → B5 必红（卡片位移不跟随）
//   3) 删掉 .home-gate-backdrop 的 opacity
//      → B4 必红
//   4) 去掉 handleWheel 里的 event.preventDefault()
//      → B6 必红（底层文档跟着滚）
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots/home-gate-pull';
fs.mkdirSync(OUT, { recursive: true });

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

// 与 views/Home/composables/useGatePull.js 的 GATE_TIMINGS.normal 对齐（改了那边要同步这里）
const PULL_MS = 1900;
const FOCUS_MS = 860;
const FULL_RATIO = 1.2;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const errors = [];

async function openHome({
  width = 390,
  height = 844,
  skipGate = false,
  reducedMotion = 'no-preference',
} = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  await context.addInitScript(
    (cfg) => {
      try {
        if (cfg.skip) localStorage.setItem('boh-home-gate-passed', String(Date.now()));
      } catch {
        /* 隐私模式忽略 */
      }
    },
    { skip: skipGate },
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(skipGate ? '.forum-section-shell' : '.home-gate', { timeout: 25000 });
  await page.waitForTimeout(1400);
  return { context, page };
}

/** 取一帧快照：进度、各层位移（矩阵的 f = translateY）、透明度、类名 */
const snap = (page) =>
  page.evaluate(() => {
    const home = document.querySelector('.home');
    const gate = document.querySelector('.home-gate');
    const stage = document.querySelector('.home-forum-stage');
    const blur = document.querySelector('.street-hero-media-blur');
    // 桌面 UI 的一个代表：分区页签（它由 --forum-p 驱动浮起，是本轮「UI 组件浮上来」的核心）
    const tabs = document.querySelector('.forum-section-shell .segment-tabs');
    const matrixOf = (el) => {
      if (!el) return { scale: 1, ty: 0 };
      const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
      if (!m) return { scale: 1, ty: 0 };
      const p = m[1].split(',').map((v) => Number(v.trim()));
      if (p.length < 6) return { scale: 1, ty: 0 };
      return { scale: Number(p[0].toFixed(4)), ty: Number(p[5].toFixed(2)) };
    };
    const opacity = (el) => (el ? Number(getComputedStyle(el).opacity) : null);
    const gateM = matrixOf(gate);
    const stageM = matrixOf(stage);
    return {
      gatePresent: Boolean(gate),
      progress: home ? Number(home.style.getPropertyValue('--gate-p') || 0) : null,
      forumProgress: home ? Number(home.style.getPropertyValue('--forum-p') || 0) : null,
      gateY: gate ? gateM.ty : null,
      gateScale: gateM.scale,
      gateRadius: gate ? getComputedStyle(gate).borderTopLeftRadius : null,
      gateOpacity: opacity(gate),
      gateTransform: gate ? getComputedStyle(gate).transform : null,
      stageY: stageM.ty,
      stageScale: stageM.scale,
      tabsY: tabs ? matrixOf(tabs).ty : null,
      stageRadius: stage ? getComputedStyle(stage).borderTopLeftRadius : null,
      blurOpacity: opacity(blur),
      // 未配街景图时（品牌兜底：白底 + logo）模糊副本根本不渲染 —— 断言要能区分
      // 「没有这一层」和「这一层没跟着进度走」，否则这两种情况会混在一起。
      hasBlurLayer: Boolean(blur),
      settled: home ? home.classList.contains('home-forum-settled') : false,
      forumOpen: home ? home.classList.contains('home-forum-open') : false,
      scrollY: Math.round(window.scrollY),
      // 过渡期滚动锁是 inline 的 overflow（带 !important），必须能在落定后清干净 ——
      // 清不掉就是「整页滚不动」，这是 2026-09-27 那次卡死的直接症状。
      htmlOverflow: document.documentElement.style.getPropertyValue('overflow') || '',
      vh: window.innerHeight,
    };
  });

try {
  // ---------------- A / B / D：初始 → 跟手 → 提交落定（竖屏 390×844）----------------
  {
    const { context, page } = await openHome();
    const vh = 844;
    const full = vh * FULL_RATIO;
    const init = await snap(page);
    console.log('\n--- A 初始态（开场画在场）---');
    check('A1 开场层存在', init.gatePresent);
    check('A2 进度起点为 0', init.progress === 0, `--gate-p=${init.progress}`);
    check(
      'A3 桌面（论坛层）就在原位，只带极轻的「被盖住」放大',
      init.stageY === 0 && init.stageScale > 1.005 && init.stageScale < 1.05,
      `stageY=${init.stageY} scale=${init.stageScale}`,
    );
    check(
      'A4 开场浮层完全覆盖：opacity 1、无圆角、无位移',
      init.gateOpacity === 1 && init.gateRadius === '0px' && Math.abs(init.gateY) <= 1,
      `opacity=${init.gateOpacity} radius=${init.gateRadius} gateY=${init.gateY}`,
    );
    check('A5 浮层缩放为 1（未被推走）', init.gateScale === 1, `gateScale=${init.gateScale}`);
    check(
      'A6 模糊副本全透明（有街景图时；无图走品牌兜底则自动跳过）',
      !init.hasBlurLayer || init.blurOpacity === 0,
      init.hasBlurLayer ? `blur=${init.blurOpacity}` : '本环境未配街景图 → 品牌兜底形态，跳过',
    );
    check(
      'A7 桌面 UI 初始停在下方「待浮」位置（页签偏移 ≈ 26px）',
      init.tabsY !== null && init.tabsY > 20,
      `tabsY=${init.tabsY}`,
    );

    console.log('\n--- B 跟手（推 480px ≈ 半程）---');
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 480);
    // 静默期内读（160ms）：此时还没有释放判定
    await page.waitForTimeout(70);
    const pulling = await snap(page);
    const expected = 480 / full;
    check(
      'B1 进度随手指推进',
      pulling.progress > 0.05 && Math.abs(pulling.progress - expected) < 0.06,
      `--gate-p=${pulling.progress} 期望≈${expected.toFixed(3)}`,
    );
    check(
      'B2 开场层随之上移（translateY 为负）',
      pulling.gateY !== null && pulling.gateY < -20,
      `gateY=${pulling.gateY}`,
    );
    check(
      'B3 静态模糊副本开始显影（下拉即虚化）',
      !pulling.hasBlurLayer || pulling.blurOpacity > 0.05,
      pulling.hasBlurLayer ? `blur=${pulling.blurOpacity}` : '无街景图 → 见 I 组的样式契约断言',
    );
    check(
      'B4 浮层开始被推走：上移 + 缩小 + 起圆角（Apple 式揭盖的核心）',
      pulling.gateY < -5 && pulling.gateScale < 0.999 && parseFloat(pulling.gateRadius) > 0,
      `gateY=${pulling.gateY} scale=${pulling.gateScale} radius=${pulling.gateRadius}`,
    );
    check(
      'B5 桌面同时极轻归位（scale 从被盖住的放大态往 1 收）',
      pulling.stageScale < init.stageScale && pulling.stageScale >= 1,
      `scale=${pulling.stageScale}（起点 ${init.stageScale}）`,
    );
    check(
      'B6 底层文档没有被带着滚（preventDefault 生效）',
      pulling.scrollY === 0,
      `scrollY=${pulling.scrollY}`,
    );
    check(
      'B7 桌面始终在视口里（是「桌面」而不是从屏外飞进来的新页）',
      pulling.stageY === 0,
      `stageY=${pulling.stageY}`,
    );
    check(
      'B8 桌面 UI 正跟着浮起：页签仍有向下的待浮偏移，随进度归零',
      pulling.tabsY !== null && pulling.tabsY > 3,
      `tabsY=${pulling.tabsY}（从下方浮起中；落定后应为 0）`,
    );
    check(
      'B9 走到一半时浮层仍完全不透明（没走完不许透视到底下）',
      pulling.gateOpacity === 1,
      `gateOpacity=${pulling.gateOpacity} @ p=${Number(pulling.progress).toFixed(3)}`,
    );
    await page.screenshot({ path: `${OUT}/portrait-pulling.png` });

    console.log('\n--- D 已提交 → 落定 ---');
    // 上面那 300px 已超过提交门槛，等静默期结束 + 补间收尾
    await page.waitForTimeout(PULL_MS + 500);
    const done = await snap(page);
    check('D2 收尾后开场层卸载', !done.gatePresent);
    check('D3 进度停在 1', done.progress === 1, `--gate-p=${done.progress}`);
    check(
      'D4 论坛层解除 transform（不再创建包含块）',
      done.stageY === 0 || done.settled,
      `stageY=${done.stageY} settled=${done.settled}`,
    );
    check(
      'D5 落定后桌面回到 1（transform 交还给元素本身）',
      done.settled && done.stageScale === 1,
      `scale=${done.stageScale} settled=${done.settled}`,
    );
    check('D6 论坛态已打开', done.forumOpen, `forumOpen=${done.forumOpen}`);
    check(
      'D7 过渡期滚动锁已解除（不再有 inline overflow）',
      done.htmlOverflow === '',
      `html overflow="${done.htmlOverflow}"`,
    );
    // ↓ 这两条是 2026-09-27「下滑整个页面卡住」的直接回归守卫：
    //   真实滚轮必须能滚动论坛 —— 卡死时这里是 0，因为 preventDefault/overflow 没交还。
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    const scrolled = await snap(page);
    check(
      'D8 落定后滚轮能正常滚动（滚动权已交还）',
      scrolled.scrollY > 100,
      `scrollY=${scrolled.scrollY}`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const afterFocus = await snap(page);
    check(
      'D9 对焦结束后落定为常态（无残留类）',
      afterFocus.settled && afterFocus.stageY === 0,
      `settled=${afterFocus.settled} stageY=${afterFocus.stageY}`,
    );
    check(
      'D10 落定后 UI 归位（transform 交还给元素本身，卡片 hover 恢复）',
      afterFocus.tabsY === 0,
      `tabsY=${afterFocus.tabsY}`,
    );
    await page.screenshot({ path: `${OUT}/portrait-settled.png` });
    await context.close();
  }

  // ---------------- C：回弹（进度不足就松手）----------------
  // 必须开新 context：同一页面里 300px 已足以提交，测不到「弹回」这条路径。
  // ⚠️ 这条是 2026-09-27「滑一下没反应」的回归守卫 —— 门槛必须「一次滚轮就够」，
  //    而「只轻轻拨一下」仍然要能弹回（可反悔）。
  {
    const { context, page } = await openHome();
    const vh = 844;
    const full = vh * FULL_RATIO;
    console.log('\n--- C 回弹（推 40px，够不着门槛）---');
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(70);
    const nudged = await snap(page);
    check(
      'C1 轻拨也会跟手（进度确实动了）',
      nudged.progress > 0.01 && nudged.progress < 0.1,
      `--gate-p=${nudged.progress}（门槛=${(40 / full).toFixed(3)} 量级）`,
    );
    check(
      'C2 轻拨时开场层确实位移了（不是「滑了没反应」）',
      nudged.gateY !== null && nudged.gateY < -4,
      `gateY=${nudged.gateY}`,
    );
    await page.waitForTimeout(1400);
    const settledBack = await snap(page);
    check(
      'C3 回弹归零（进度不足时不进论坛）',
      settledBack.progress < 0.02,
      `--gate-p=${settledBack.progress}`,
    );
    check('C4 开场层仍在（可再次下拉，不是一碰就不可逆）', settledBack.gatePresent);
    check(
      'C5 浮层回到原位：位移 0、缩放 1、圆角归零',
      Math.abs(settledBack.gateY) <= 1 &&
        settledBack.gateScale === 1 &&
        settledBack.gateRadius === '0px',
      `gateY=${settledBack.gateY} scale=${settledBack.gateScale} radius=${settledBack.gateRadius}`,
    );
    check(
      'C6 桌面回到「被盖住」的轻微放大态',
      settledBack.stageScale > 1.005,
      `scale=${settledBack.stageScale}`,
    );
    check('C7 回弹没把底层文档滚起来', settledBack.scrollY === 0, `scrollY=${settledBack.scrollY}`);
    await context.close();
  }

  // ---------------- E：reduce 偏好 ----------------
  {
    const { context, page } = await openHome({ reducedMotion: 'reduce' });
    const init = await snap(page);
    console.log('\n--- E reduce（prefers-reduced-motion: reduce）---');
    check(
      'E1 开场层仍可感知（不是直接 none）',
      init.gatePresent && init.gateOpacity === 1,
      `opacity=${init.gateOpacity}`,
    );
    check('E2 reduce 下不做位移', init.gateTransform === 'none', String(init.gateTransform));
    check(
      'E3 reduce 下桌面不缩放、浮层不起圆角',
      init.stageScale === 1 && init.gateRadius === '0px',
      `stageScale=${init.stageScale} gateRadius=${init.gateRadius}`,
    );
    await page.mouse.wheel(0, 200);
    // reduce 时长表：340ms 收尾 + 300ms 对焦 → 900ms 足够
    await page.waitForTimeout(1200);
    const done = await snap(page);
    check(
      'E4 reduce 下时长表生效（链路在 1.2s 内走完）',
      !done.gatePresent && done.progress === 1,
      `present=${done.gatePresent} p=${done.progress}`,
    );
    await context.close();
  }

  // ---------------- F：已通过过开场画的会话 ----------------
  {
    const { context, page } = await openHome({ skipGate: true });
    const m = await snap(page);
    console.log('\n--- F 已通过的会话（24h 时间窗内）---');
    check('F1 首帧就没有开场层', !m.gatePresent);
    check('F2 进度直接是 1（不闪一下）', m.progress === 1, `--gate-p=${m.progress}`);
    check(
      'F3 桌面直接就位（无位移、无缩放、已落定）',
      m.stageY === 0 && m.stageScale === 1 && m.settled,
      `stageY=${m.stageY} scale=${m.stageScale} settled=${m.settled}`,
    );
    check('F4 桌面无圆角残留', m.stageRadius === '0px', String(m.stageRadius));
    await page.screenshot({ path: `${OUT}/portrait-skip-gate.png` });
    await context.close();
  }

  // ---------------- G：键盘一次按键即完成 ----------------
  {
    const { context, page } = await openHome();
    console.log('\n--- G 键盘入口 ---');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    const mid = await snap(page);
    check(
      'G1 一次按键就启动转场（旧实现要按两次）',
      mid.progress > 0.05,
      `--gate-p=${mid.progress}`,
    );
    await page.waitForTimeout(PULL_MS + 500);
    const done = await snap(page);
    check(
      'G2 键盘路径同样能落到论坛',
      !done.gatePresent && done.progress === 1,
      `present=${done.gatePresent} p=${done.progress}`,
    );
    await context.close();
  }

  // ---------------- H：横屏（宽栏 + 开场画在场时左栏随进度淡入）----------------
  {
    const { context, page } = await openHome({ width: 1440, height: 900 });
    const railOpacityOf = () =>
      page.evaluate(() => {
        const rail = document.querySelector('.userspace-rail');
        if (!rail) return null;
        return Number(getComputedStyle(rail).opacity);
      });
    console.log('\n--- H 横屏 1440×900 ---');
    const initRail = await railOpacityOf();
    check(
      'H1 开场画在场时左栏完全透明（不是瞬现的 display 切换）',
      initRail === 0,
      `railOpacity=${initRail}`,
    );
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(70);
    const midRail = await railOpacityOf();
    check('H2 跟手过程中左栏随进度淡入', midRail > 0 && midRail < 1, `railOpacity=${midRail}`);
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(PULL_MS + FOCUS_MS + 800);
    const settledRail = await railOpacityOf();
    check('H3 落定后左栏常态可见', settledRail === 1, `railOpacity=${settledRail}`);
    await page.screenshot({ path: `${OUT}/landscape-settled.png` });
    await context.close();
  }

  // ---------------- I：样式契约（不依赖运行时数据，守「视觉必须由进度派生」）----------------
  // 运行时断言在有数据的机器上才能跑全（比如没有配街景图时模糊副本根本不渲染），
  // 这组直接读 CSSOM，把「谁派生自谁」这件事钉死 —— 它才是这套实现的核心不变量。
  {
    const { context, page } = await openHome({ width: 1280, height: 800 });
    console.log('\n--- I 样式契约 ---');
    // 取某元素所有匹配规则里该属性的声明值（scoped 会给选择器加 [data-v-*]，先剥掉再严格比对，
    // 免得 .home-gate 把 .home-gate-backdrop 一起匹配进来）
    const declaredAll = (target, prop) =>
      page.evaluate(
        ({ target, prop }) => {
          const out = [];
          const norm = (sel) =>
            sel.split(',').map((s) =>
              s
                .trim()
                .replace(/\[data-v-[a-f0-9]+\]/g, '')
                .trim(),
            );
          const walk = (list) => {
            for (const rule of list) {
              if (rule.cssRules && rule.cssRules.length) {
                walk(rule.cssRules);
                continue;
              }
              if (!rule.selectorText || !rule.style) continue;
              if (!norm(rule.selectorText).includes(target)) continue;
              const v = rule.style.getPropertyValue(prop);
              if (v) out.push(v.trim());
            }
          };
          for (const sheet of document.styleSheets) {
            let rules = null;
            try {
              rules = sheet.cssRules;
            } catch {
              continue;
            }
            if (rules) walk(rules);
          }
          return out;
        },
        { target, prop },
      );
    const anyIncludes = (list, needle) => list.some((v) => v.includes(needle));

    const gateTransform = await declaredAll('.home-gate', 'transform');
    check(
      'I1 开场层位移派生自 --gate-p',
      anyIncludes(gateTransform, '--gate-p'),
      gateTransform.join(' | '),
    );
    const blurOpacity = await declaredAll('.street-hero-media-blur', 'opacity');
    check(
      'I2 虚化＝静态模糊层 + 进度驱动的 opacity（不是逐帧改 blur 半径）',
      anyIncludes(blurOpacity, '--gate-p'),
      blurOpacity.join(' | '),
    );
    const blurFilter = await declaredAll('.street-hero-img-blur', 'filter');
    check(
      'I3 模糊半径是常量（声明里不含 var()）',
      blurFilter.length > 0 && blurFilter.every((v) => v.includes('blur(') && !v.includes('var(')),
      blurFilter.join(' | '),
    );
    const gateRadius = await declaredAll('.home-gate', 'border-radius');
    check(
      'I4 浮层圆角派生自 --gate-p（被推走时才起圆角）',
      anyIncludes(gateRadius, '--gate-p'),
      gateRadius.join(' | '),
    );
    const stageTransform = await declaredAll('.home-forum-stage', 'transform');
    check(
      'I5 桌面只做极轻 scale 归位，且不再有「一屏位移」的换页式 transform',
      anyIncludes(stageTransform, '--forum-p') && !stageTransform.some((v) => v.includes('100vh')),
      stageTransform.join(' | '),
    );
    const stageRadius = await declaredAll('.home-forum-stage', 'border-top-left-radius');
    check(
      'I6 圆角只属于浮层（桌面本身不再声明圆角）',
      stageRadius.length === 0,
      stageRadius.length ? stageRadius.join(' | ') : 'stage 上无圆角声明',
    );

    // 时长不许有第二处真源：旧实现把时长同时写在 CSS 变量与 JS 常量里，已经漂移过
    // （注释写 1320ms、变量是 980ms）。现在只允许存在于 GATE_TIMINGS。
    const legacy = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.home'));
      return ['--home-gate-duration', '--home-forum-duration', '--home-forum-ease']
        .map((name) => `${name}="${cs.getPropertyValue(name).trim()}"`)
        .join(' ');
    });
    check('I7 时长不再在 CSS 里写第二份', !/="[^"]+"/.test(legacy), legacy);

    // 唯一例外是「对焦」时长：它驱动的是类切换的 CSS 动画，只能靠变量传进来。
    // 契约是「运行时以 JS 注入的值为准」，CSS 里那份只是兜底。
    const focusInline = await page.evaluate(() =>
      document.querySelector('.home').style.getPropertyValue('--home-focus-duration').trim(),
    );
    check(
      'I8 对焦时长由 JS 注入（CSS 那份只是兜底）',
      focusInline.endsWith('ms'),
      `inline="${focusInline}"`,
    );
    await context.close();
  }

  check('Z1 零 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n===== ${pass}/${pass + fail} PASS =====`);
if (fail) process.exitCode = 1;

// 说明：本探针替代了已删除的 probe-home-scroll.mjs / probe-home-scroll-diag.mjs ——
// 那两个断言的是旧首页结构（.home-hero-content / is-deferred / content-visibility 预热），
// 这套机制在 HomeHeroRow 重构时已被显式移除，探针必然超时（红着但无人看 = 没有护栏）。
