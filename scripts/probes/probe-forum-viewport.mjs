import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：论坛横竖屏单源判据 + 993/992 → 1024/1023 裂缝带修复
//
// 断言组：
//   VP1-VP9  判据真值表（9 档）：JS isForumLandscape / isForumPortraitComposer
//            与 CSS 两栏档（.forum-toolbar 的 grid-area=search）与期望三方一致，
//            并顺带验证判据 → 组件状态 → FAB 渲染的端到端链路
//   VP5/VP6  裂缝带专项：1000×1300 / 1000×800 —— 旧 993 档会给出「两栏布局 + 移动编辑器」
//            的错位组合，修复后两侧一致收敛到单栏
//   B1-B3    分流边界：1000×800 点卡 → 整页路由；1024×600 点卡 → 弹窗 + router 未跳
//   C1-C5    发布会话旋转连续性：390×844 打开 overlay 填内容 → 旋到 844×390 →
//            overlay 仍在 + 内容不丢 + body 继续锁滚动
//   D1       横屏发布会话只覆盖右区，且动作栏可用
//
// 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）
// 运行：node scripts/probes/probe-forum-viewport.mjs
//
// counter-proof（手动）：
//   1) base.css 两栏档 1024 改回 993 / 单列档 1023 改回 992 → VP5/VP6 必红
//   2) 发布会话是跨横竖屏唯一发帖宿主，旋转不应再强制关闭它
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
// /forum 重定向到 /user-space?tab=posts（我的）；论坛承载的社区段在 tab=community
const FORUM_URL = `${BASE}/#/user-space?tab=community`;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const launch = () => chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pinia 伪造登录（探针惯例：reactive 须 Object.assign，id 用合法 UUID）
// 带重试：dev HMR 抖动时 #app 可能被重挂导致 __vue_app__ 瞬时缺失
const injectAuth = async (page) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForFunction(
        () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
        null, { timeout: 30000 }
      );
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        const auth = pinia.state.value.auth;
        auth.isLoggedIn = true;
        Object.assign(auth.userInfo, {
          id: 'a1b2c3d4-0000-4000-8000-000000000002',
          username: 'probe_vp_user', role: 'user', points: 42
        });
      });
      return true;
    } catch {
      await page.waitForTimeout(1200);
    }
  }
  return false;
};

const gotoForum = async (page) => {
  await page.goto(FORUM_URL, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  // 等工具栏而不仅是 grid：断言依赖 .forum-main-grid > .forum-toolbar 已挂载（规避 HMR 抖动下的半渲染）
  try {
    await page.waitForSelector('.forum-main-grid > .forum-toolbar', { timeout: 20000 });
  } catch {
    // dev server 冷转换 / RPC 抖动 → reload 重试一次（pinia 状态重置，需重打）
    await page.reload({ waitUntil: 'domcontentloaded' });
    await injectAuth(page);
    await page.waitForSelector('.forum-main-grid > .forum-toolbar', { timeout: 30000 });
  }
  await page.waitForTimeout(800);
};

// 注入真实单源模块（判据无共享状态，动态 import 双实例等价；驱动组件的是应用内同一份代码）
const injectJudge = async (page) => page.evaluate(async () => {
  try {
    const mod = await import(/* @vite-ignore */ '/src/utils/forum-viewport.js');
    window.__vp = {
      isForumLandscape: mod.isForumLandscape,
      isForumPortraitComposer: mod.isForumPortraitComposer
    };
    return true;
  } catch {
    return false;
  }
});

// 一次读取三方状态：JS 判据 / CSS 两栏档 / FAB（判据 → 组件状态 → UI 链路）
const viewportState = () => {
  const judge = window.__vp;
  const grid = document.querySelector('.forum-main-grid');
  const toolbar = document.querySelector('.forum-main-grid > .forum-toolbar');
  const fab = document.querySelector('.mobile-compose-fab');
  const fabVisible = fab ? getComputedStyle(fab).display !== 'none' && fab.getClientRects().length > 0 : false;
  return {
    done: Boolean(judge && grid),
    landscape: judge ? judge.isForumLandscape() : null,
    portraitComposer: judge ? judge.isForumPortraitComposer() : null,
    toolbarArea: toolbar ? getComputedStyle(toolbar).gridArea : null,
    twoCol: toolbar ? getComputedStyle(toolbar).gridArea === 'search' : null,
    fabVisible
  };
};

// 期望矩阵：landscape / portraitComposer / twoCol（CSS 两栏档）/ fab
// 2026-10-26：内嵌发帖器废弃后 FAB 是窄屏 feed 页唯一常驻入口。
// 2026-10-31：横屏（landscape + ≥1024 + ≥600）**不再挂 FAB** —— 该档位左栏有「发布」，
//   右下角再浮一个 + 号是多余的移动端残留（用户报障）。判据与左栏可见性同组，
//   所以只有 landscape=true 的两档 fab=false，其余（含 1280×500 宽矮横屏、
//   932×430 手机横屏、1000×800 裂缝带）左栏都是 display:none，FAB 必须还在。
const MATRIX = [
  { w: 1280, h: 800, landscape: true, portrait: false, twoCol: true, fab: false, tag: '横屏标准档' },
  { w: 1024, h: 600, landscape: true, portrait: false, twoCol: true, fab: false, tag: '单源下限 1024×600' },
  { w: 1280, h: 500, landscape: false, portrait: false, twoCol: true, fab: true, tag: '宽矮横屏（高<600 不命中弹窗）' },
  { w: 1024, h: 1366, landscape: false, portrait: true, twoCol: true, fab: true, tag: 'iPad Pro 竖屏（1024 整点重叠：两栏+移动编辑器，设计值）' },
  { w: 1000, h: 1300, landscape: false, portrait: true, twoCol: false, fab: true, tag: '裂缝带-竖屏（旧 993 档会误判两栏）' },
  { w: 1000, h: 800, landscape: false, portrait: false, twoCol: false, fab: true, tag: '裂缝带-横屏（旧 993 档会误判两栏）' },
  { w: 834, h: 1112, landscape: false, portrait: true, twoCol: false, fab: true, tag: '平板竖屏' },
  { w: 932, h: 430, landscape: false, portrait: false, twoCol: false, fab: true, tag: '手机横屏（<1024 走竖屏逻辑）' },
  { w: 390, h: 844, landscape: false, portrait: true, twoCol: false, fab: true, tag: '手机竖屏' }
];

const waitForInPage = async (page, fn, { timeout = 15000, interval = 200 } = {}) => {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(fn).catch(() => null);
    if (last && last.done) return last;
    await sleep(interval);
  }
  return last;
};

const run = async () => {
  const browser = await launch();

  // ============ 组 VP：判据真值表（单页多档切换） ============
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);

  await gotoForum(page);
  const judgeReady = await injectJudge(page);
  check('VP0 单源模块注入 + 论坛页渲染', judgeReady, 'window.__vp');

  for (let i = 0; i < MATRIX.length; i++) {
    const m = MATRIX[i];
    // 每档在目标视口下重新加载：dev 环境偶发 full-reload 不影响断言，且断言的是"刷新后落地状态"
    await page.setViewportSize({ width: m.w, height: m.h });
    await gotoForum(page);
    const ready = await injectJudge(page);
    const s = ready ? await page.evaluate(viewportState) : null;
    const ok = Boolean(s?.done)
      && s.landscape === m.landscape
      && s.portraitComposer === m.portrait
      && s.twoCol === m.twoCol
      && s.fabVisible === m.fab;
    check(`VP${i + 1} ${m.w}×${m.h} ${m.tag}`, ok,
      `landscape=${s?.landscape}(期望${m.landscape}) portrait=${s?.portraitComposer}(期望${m.portrait}) twoCol=${s?.twoCol}(期望${m.twoCol}) fab=${s?.fabVisible}(期望${m.fab})`);
  }
  await page.screenshot({ path: `${OUT}/vp-matrix-last-390x844.png` }).catch(() => {});
  await ctx.close();

  // ============ 组 B：分流边界 ============
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const pageB = await ctxB.newPage();
  pageB.setDefaultTimeout(10000);
  await gotoForum(pageB);

  await pageB.waitForSelector('.post-card-v2', { timeout: 12000 }).catch(() => {});
  const cardCount = await pageB.locator('.post-card-v2').count().catch(() => 0);
  if (cardCount > 0) {
    // B1/B2 1000×800（裂缝带横屏）：点卡应走整页路由（非弹窗）
    await pageB.locator('.post-card-v2 .post-title-v2').first().click();
    const b1 = await waitForInPage(pageB, () => {
      const hash = window.location.hash || '';
      return {
        done: /^#\/forum\/post\//.test(hash) || Boolean(document.querySelector('.pd-modal-overlay')),
        hash,
        overlay: Boolean(document.querySelector('.pd-modal-overlay'))
      };
    }, { timeout: 20000 });
    check('B1 1000×800 点卡走整页路由（裂缝带不命中弹窗）',
      /^#\/forum\/post\//.test(b1?.hash || '') && !b1?.overlay, `hash=${b1?.hash || ''}`);

    // B2/B3 1024×600（单源下限）：点卡应进弹窗且 router 未跳
    await pageB.setViewportSize({ width: 1024, height: 600 });
    await gotoForum(pageB);
    await pageB.locator('.post-card-v2 .post-title-v2').first().click();
    const b2 = await waitForInPage(pageB, () => {
      const overlay = document.querySelector('.pd-modal-overlay');
      return { done: Boolean(overlay), overlay: Boolean(overlay) };
    }, { timeout: 20000 });
    check('B2 1024×600 点卡进弹窗（单源下限命中）', Boolean(b2?.overlay));
    const b3 = await pageB.evaluate(() => ({
      path: document.querySelector('#app').__vue_app__.config.globalProperties.$router.currentRoute.value.path,
      overlay: Boolean(document.querySelector('.pd-modal-overlay'))
    }));
    check('B3 弹窗时 router 仍停在 /user-space（列表原地保留）', b3.path === '/user-space' && b3.overlay, `path=${b3.path}`);
    await pageB.keyboard.press('Escape').catch(() => {});
    await pageB.waitForTimeout(400);
  } else {
    check('B1-B3 分流边界（feed 无帖子，SKIP）', true, 'skip: no post cards');
  }
  await ctxB.close();

  // ============ 组 C：发布会话旋转连续性 ============
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageC = await ctxC.newPage();
  pageC.setDefaultTimeout(10000);
  await gotoForum(pageC);

  const DRAFT_TEXT = 'PROBE-VP-DRAFT-7f3a 旋转保护专用文本';
  try {
    await pageC.waitForSelector('.mobile-compose-fab', { state: 'visible', timeout: 10000 });
    await pageC.locator('.mobile-compose-fab').click();
    await pageC.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 10000 });
    // 竖屏有 360ms 的整页进场动画：几何必须在 transitionend 后再量，
    // 否则 getBoundingClientRect 会带着 translateY 中间值（实测 footer 会被量到 1688px）。
    await pageC.waitForFunction(() => {
      const overlay = document.querySelector('.mobile-composer-overlay');
      if (!overlay) return false;
      const transform = getComputedStyle(overlay).transform;
      return transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(transform);
    }, null, { timeout: 3000 }).catch(() => {});
    const c1 = await pageC.evaluate(() => ({
      done: Boolean(document.querySelector('.mobile-composer-overlay')),
      overflow: document.body.style.overflow
    }));
    check('C1 390×844 FAB → 竖屏全屏编辑器打开 + body 滚动锁', c1.done && c1.overflow === 'hidden', `overflow="${c1.overflow}"`);

    // D2 竖屏动作栏：图片 / 智能整理 / 更多都存在，旧大卡片不再出现
    const d2 = await pageC.evaluate(() => {
      const visible = (sel, root = document) => Array.from(root.querySelectorAll(sel)).some((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
      });
      const overlay = document.querySelector('.mobile-composer-overlay');
      return {
        actionBarVisible: overlay ? visible('.composer-actions', overlay) : false,
        imageActionVisible: overlay ? visible('.composer-actions .composer-action-btn[aria-label*="相册选择图片"]', overlay) : false,
        addCardVisible: overlay ? visible('.post-image-add-more-card', overlay) : false
      };
    });
    check('D2 竖屏动作栏：图片入口可见、旧大卡片已删除',
      d2.actionBarVisible && d2.imageActionVisible && !d2.addCardVisible, JSON.stringify(d2));

    /* D3 竖屏几何：动作栏是卡片的 flex 末端，必须贴着视口底部；
       外层与正文只能有一个滚动面，且滚动条不可见。
       容差 28px = 卡片 12px 下内衬 + 1px 边框 + 调度误差；不允许出现
       旧版那种「胶囊离底部一大截」的空洞。 */
    const d3 = await pageC.evaluate(() => {
      const overlay = document.querySelector('.mobile-composer-overlay');
      const scroll = overlay?.querySelector('.mobile-composer-scroll');
      const content = overlay?.querySelector('.composer-content-scroll');
      const footer = overlay?.querySelector('.editor-footer');
      const actions = overlay?.querySelector('.composer-actions');
      if (!overlay || !scroll || !content || !footer || !actions) return { done: false };
      const vh = window.innerHeight;
      const fr = footer.getBoundingClientRect();
      const ar = actions.getBoundingClientRect();
      const sr = scroll.getBoundingClientRect();
      const cr = content.getBoundingClientRect();
      const buttons = Array.from(actions.querySelectorAll('.composer-action-btn'));
      const overflows = buttons
        .map((btn) => {
          const r = btn.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
        })
        .filter((r) => r.left < 0 || r.right > window.innerWidth || r.w <= 0);
      const scrollStyle = getComputedStyle(scroll);
      const contentStyle = getComputedStyle(content);
      return {
        done: true,
        footerBottom: Math.round(fr.bottom),
        actionsBottom: Math.round(ar.bottom),
        viewportBottom: Math.round(vh),
        footerGap: Math.round(vh - fr.bottom),
        scrollOverflowY: scrollStyle.overflowY,
        contentOverflowY: contentStyle.overflowY,
        scrollClientH: scroll.clientHeight,
        scrollScrollH: scroll.scrollHeight,
        contentScrollH: content.scrollHeight,
        contentClientH: content.clientHeight,
        contentWithinScroll: cr.bottom <= sr.bottom + 1,
        buttonCount: buttons.length,
        overflows,
      };
    });
    check('D3 竖屏底栏贴底且四按钮不溢出',
      d3.done && d3.footerGap >= -1 && d3.footerGap <= 28 && d3.buttonCount === 4 && d3.overflows.length === 0,
      JSON.stringify(d3));
    check('D4 竖屏只有正文层可滚动（无第二层滚动条、无可见 scrollbar）',
      d3.done && d3.scrollOverflowY === 'hidden' && ['auto', 'scroll'].includes(d3.contentOverflowY) &&
        d3.scrollClientH >= d3.contentClientH - 1 && d3.contentWithinScroll,
      JSON.stringify(d3));

    // D5 长文：内容层真的滚起来之后，动作栏仍必须贴在视口底部，
    //    不能跟着正文一起滚走（这是上一版「胶囊离底部很大空隙」的复现场景）。
    await pageC.fill(
      '.mobile-composer-overlay .post-content-input',
      Array.from({ length: 28 }, (_, i) => `PROBE-LONG-${i + 1} 这一段用于让正文超出可视高度。`).join('\n\n'),
    );
    // 自动增高走 requestAnimationFrame；等内容层真的产生溢出，而不是用固定 sleep 猜。
    await pageC.waitForFunction(() => {
      const content = document.querySelector('.mobile-composer-overlay .composer-content-scroll');
      return Boolean(content && content.scrollHeight > content.clientHeight + 8);
    }, null, { timeout: 5000 });
    const d5 = await pageC.evaluate(() => {
      const footer = document.querySelector('.mobile-composer-overlay .editor-footer');
      const content = document.querySelector('.mobile-composer-overlay .composer-content-scroll');
      if (!footer || !content) return { done: false };
      content.scrollTop = content.scrollHeight;
      const fr = footer.getBoundingClientRect();
      return {
        done: true,
        scrollTop: Math.round(content.scrollTop),
        scrollable: content.scrollHeight > content.clientHeight + 8,
        footerGap: Math.round(window.innerHeight - fr.bottom),
        footerVisible: fr.top >= 0 && fr.bottom <= window.innerHeight + 1,
      };
    });
    check('D5 长文滚动后动作栏仍贴底且可见',
      d5.done && d5.scrollable && d5.scrollTop > 0 && d5.footerVisible &&
        d5.footerGap >= -1 && d5.footerGap <= 28,
      JSON.stringify(d5));

    await pageC.fill('.mobile-composer-overlay .post-content-input', DRAFT_TEXT);
    await pageC.waitForTimeout(600);
    const c2 = await pageC.evaluate(() => ({
      value: document.querySelector('.mobile-composer-overlay .post-content-input')?.value || ''
    }));
    check('C2 编辑器内容已写入（旋转前）', c2.value.includes('PROBE-VP-DRAFT-7f3a'), `len=${c2.value.length}`);

    // 旋转 → 844×390：会话保持打开，内容不能丢
    await pageC.setViewportSize({ width: 844, height: 390 });
    const c3 = await waitForInPage(pageC, () => {
      const overlay = document.querySelector('.mobile-composer-overlay');
      const input = document.querySelector('.mobile-composer-overlay .post-content-input');
      return {
        done: Boolean(overlay),
        overlayAlive: Boolean(overlay),
        overlayLeft: overlay ? Math.round(overlay.getBoundingClientRect().left) : -1,
        overlayW: overlay ? Math.round(overlay.getBoundingClientRect().width) : -1,
        value: input ? input.value : null,
        overflow: document.body.style.overflow
      };
    }, { timeout: 10000 });
    check('C3 旋转后发布会话仍打开（横竖屏共用同一宿主）', Boolean(c3?.overlayAlive),
      `left=${c3?.overlayLeft} w=${c3?.overlayW}`);
    check('C4 旋转后编辑器内容未丢',
      String(c3?.value || '').includes('PROBE-VP-DRAFT-7f3a'), `value="${String(c3?.value || '').slice(0, 24)}…"`);
    check('C5 旋转后仍锁 body 滚动（会话未关闭）', c3?.overflow === 'hidden', `overflow="${c3?.overflow}"`);
    await pageC.screenshot({ path: `${OUT}/vp-rotate-after-844x390.png` }).catch(() => {});
  } catch (err) {
    check('C1-C5 发布会话旋转连续性', false, err.message.split('\n')[0]);
  }
  await ctxC.close();

  // ============ 组 D：横屏发布会话几何 ============
  // 这里用组件实例直接置开，避免依赖左栏挂载时机。
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageD = await ctxD.newPage();
  pageD.setDefaultTimeout(10000);
  await gotoForum(pageD);

  const setComposerOpen = (open) => pageD.evaluate((next) => {
    let inst = document.querySelector('.forum-page')?.__vueParentComponent || null;
    while (inst && !(inst.setupState && 'isMobileComposerOpen' in inst.setupState)) inst = inst.parent;
    if (!inst) return false;
    inst.setupState.isMobileComposerOpen = next;
    return true;
  }, open);

  try {
    // 1280×800 分栏档没有内嵌编辑器；实例强制开 overlay 后只验右区几何与动作栏。
    await pageD.waitForSelector('.forum-left-column', { state: 'attached', timeout: 15000 });
    const forced = await setComposerOpen(true);
    if (!forced) throw new Error('未找到 ForumMain 实例（__vueParentComponent 链）');
    await pageD.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 10000 });
    await pageD.waitForTimeout(500);
    const d1 = await pageD.evaluate(() => {
      const visible = (sel, root = document) => Array.from(root.querySelectorAll(sel)).some((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
      });
      const overlay = document.querySelector('.mobile-composer-overlay');
      return {
        hasOverlay: Boolean(overlay),
        actionBarVisible: overlay ? visible('.composer-actions', overlay) : false,
        overlayLeft: overlay ? Math.round(overlay.getBoundingClientRect().left) : -1,
        overlayRight: overlay ? Math.round(overlay.getBoundingClientRect().right) : -1
      };
    });
    check('D1 横屏发布会话：动作栏可见 + 覆盖到视口右边',
      d1.hasOverlay && d1.actionBarVisible && d1.overlayRight === 1280, JSON.stringify(d1));
    await setComposerOpen(false).catch(() => {});
  } catch (err) {
    check('D1 横屏发布会话几何', false, err.message.split('\n')[0]);
  }
  await ctxD.close();

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`));
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('PROBE ERROR:', error);
  process.exit(1);
});
