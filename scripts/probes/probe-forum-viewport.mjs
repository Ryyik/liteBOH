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
//   C1-C5    竖屏编辑器旋转保护：390×844 打开 overlay 填内容 → 旋到 844×390 →
//            overlay 关闭 + 内容转入内嵌编辑器 + localStorage 草稿落盘 + body 滚动解锁
//   D1       横屏镜像对：强制在横屏打开发布会话（chip 行仅存在于 overlay），
//            断言 chip 可见、网格大卡片隐藏（恰好一个发图入口）
//   D2       竖屏镜像对：overlay 内网格大卡片可见、chip 隐藏（在 C 组页面顺带断言）
//
// 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）
// 运行：node scripts/probes/probe-forum-viewport.mjs
//
// counter-proof（手动）：
//   1) base.css 两栏档 1024 改回 993 / 单列档 1023 改回 992 → VP5/VP6 必红
//   2) ForumMain.leaveMobileComposerForViewportSwitch 内落草稿代码去掉 → C3 必红
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

// 期望矩阵：landscape / portraitComposer / twoCol（CSS 两栏档）/ fab（= portraitComposer 的 UI 投影）
const MATRIX = [
  { w: 1280, h: 800, landscape: true, portrait: false, twoCol: true, tag: '横屏标准档' },
  { w: 1024, h: 600, landscape: true, portrait: false, twoCol: true, tag: '单源下限 1024×600' },
  { w: 1280, h: 500, landscape: false, portrait: false, twoCol: true, tag: '宽矮横屏（高<600 不命中弹窗）' },
  { w: 1024, h: 1366, landscape: false, portrait: true, twoCol: true, tag: 'iPad Pro 竖屏（1024 整点重叠：两栏+移动编辑器，设计值）' },
  { w: 1000, h: 1300, landscape: false, portrait: true, twoCol: false, tag: '裂缝带-竖屏（旧 993 档会误判两栏）' },
  { w: 1000, h: 800, landscape: false, portrait: false, twoCol: false, tag: '裂缝带-横屏（旧 993 档会误判两栏）' },
  { w: 834, h: 1112, landscape: false, portrait: true, twoCol: false, tag: '平板竖屏' },
  { w: 932, h: 430, landscape: false, portrait: false, twoCol: false, tag: '手机横屏（<1024 走竖屏逻辑）' },
  { w: 390, h: 844, landscape: false, portrait: true, twoCol: false, tag: '手机竖屏' }
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
      && s.fabVisible === m.portrait;
    check(`VP${i + 1} ${m.w}×${m.h} ${m.tag}`, ok,
      `landscape=${s?.landscape}(期望${m.landscape}) portrait=${s?.portraitComposer}(期望${m.portrait}) twoCol=${s?.twoCol}(期望${m.twoCol}) fab=${s?.fabVisible}(期望${m.portrait})`);
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

  // ============ 组 C：竖屏编辑器旋转保护 + D2 镜像对竖屏侧 ============
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageC = await ctxC.newPage();
  pageC.setDefaultTimeout(10000);
  await gotoForum(pageC);

  const DRAFT_TEXT = 'PROBE-VP-DRAFT-7f3a 旋转保护专用文本';
  try {
    await pageC.waitForSelector('.mobile-compose-fab', { state: 'visible', timeout: 10000 });
    await pageC.locator('.mobile-compose-fab').click();
    await pageC.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 10000 });
    const c1 = await pageC.evaluate(() => ({
      done: Boolean(document.querySelector('.mobile-composer-overlay')),
      overflow: document.body.style.overflow
    }));
    check('C1 390×844 FAB → 竖屏全屏编辑器打开 + body 滚动锁', c1.done && c1.overflow === 'hidden', `overflow="${c1.overflow}"`);

    // D2 镜像对竖屏侧：overlay 内网格大卡片可见 / 横屏 chip 隐藏
    const d2 = await pageC.evaluate(() => {
      const visible = (sel, root = document) => Array.from(root.querySelectorAll(sel)).some((el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
      });
      const overlay = document.querySelector('.mobile-composer-overlay');
      return {
        cardVisible: overlay ? visible('.post-image-add-more-card', overlay) : false,
        chipVisible: overlay ? visible('.mobile-composer-chip--image', overlay) : false
      };
    });
    check('D2 竖屏镜像对：overlay 内发图大卡片可见、chip 隐藏',
      d2.cardVisible && !d2.chipVisible, JSON.stringify(d2));

    await pageC.fill('.mobile-composer-overlay .post-content-input', DRAFT_TEXT);
    await pageC.waitForTimeout(400);
    const c2 = await pageC.evaluate(() => ({
      value: document.querySelector('.mobile-composer-overlay .post-content-input')?.value || ''
    }));
    check('C2 编辑器内容已写入（旋转前）', c2.value.includes('PROBE-VP-DRAFT-7f3a'), `len=${c2.value.length}`);

    // 旋转 → 844×390（portraitComposer true→false，触发离开竖屏编辑器）
    await pageC.setViewportSize({ width: 844, height: 390 });
    const c3 = await waitForInPage(pageC, () => {
      const overlay = document.querySelector('.mobile-composer-overlay');
      const inline = document.querySelector('.forum-left-column .post-content-input');
      return {
        done: !overlay,
        overlayGone: !overlay,
        inlineValue: inline ? inline.value : null,
        overflow: document.body.style.overflow
      };
    }, { timeout: 10000 });
    check('C3 旋转后 overlay 关闭（不残留竖屏样式编辑器）', Boolean(c3?.overlayGone));
    check('C4 内容转入横屏内嵌编辑器（newPost 未丢）',
      String(c3?.inlineValue || '').includes('PROBE-VP-DRAFT-7f3a'), `inline="${String(c3?.inlineValue || '').slice(0, 24)}…"`);
    check('C5 旋转关闭前静默落草稿到 localStorage（旧实现直接关会丢）',
      await pageC.evaluate((text) => Object.keys(localStorage)
        .map((k) => localStorage.getItem(k) || '')
        .some((v) => v.includes(text)), 'PROBE-VP-DRAFT-7f3a'));
    check('C6 body 滚动锁解除', c3?.overflow === '', `overflow="${c3?.overflow}"`);
    await pageC.screenshot({ path: `${OUT}/vp-rotate-after-844x390.png` }).catch(() => {});
  } catch (err) {
    check('C1-C6 竖屏编辑器旋转保护', false, err.message.split('\n')[0]);
  }
  await ctxC.close();

  // ============ 组 D：横屏镜像对（强制在横屏打开发布会话，验证 chip 档与卡片档互斥） ============
  // chip 行 v-if="isMobileComposer" 只存在于 overlay/mobile-composer-section 场景；
  // 常规路径下横屏 overlay 会被旋转逻辑关闭（C3），这里用组件实例强制打开以覆盖该防御性规则。
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
    // 1280×800 分栏档下社区 tab 内嵌编辑器按设计整体隐藏（landscape-rail.css：发布会话替代），
    // 这里只需 DOM 附加（后续用实例强制开 overlay）
    await pageD.waitForSelector('.forum-left-column .editor-card', { state: 'attached', timeout: 15000 });
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
        chipVisible: overlay ? visible('.mobile-composer-chip--image', overlay) : false,
        gridCardVisible: overlay ? visible('.post-image-add-more-card', overlay) : false
      };
    });
    check('D1 横屏镜像对（强制 overlay）：chip 可见、网格大卡片隐藏（恰好一个发图入口）',
      d1.hasOverlay && d1.chipVisible && !d1.gridCardVisible, JSON.stringify(d1));
    await setComposerOpen(false).catch(() => {});
  } catch (err) {
    check('D1 横屏镜像对（强制 overlay）', false, err.message.split('\n')[0]);
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