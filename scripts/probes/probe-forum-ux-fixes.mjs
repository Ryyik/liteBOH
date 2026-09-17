import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：论坛交互感知修复（5 项）+ 竖屏导航修复
//   验证方式＝mock 网络延迟，断言「点击瞬间 UI 已反馈」：
//     A 点赞乐观更新：RPC 延迟 1500ms，点击后 2 帧（≈32ms）内 isLiked/like_count
//       已翻转且心跳类已加上（不可能来自 RPC）
//     B 提交锁：RPC 响应到达后按钮立刻可点（disabled=false），无 300ms 吞点击
//     C 失败回滚：点赞 RPC 强制 500 → 计数还原回点击前的值 + 弹出「操作失败」
//     D 评论先展开后加载：设 1200ms 延迟，点击后 2 帧内已展开且出现骨架，
//       响应到达后骨架消失、真实回复渲染
//     E AbortError 静默：列表请求延迟中触发二次刷新 → 上一发被 cancel，
//       全程无 AbortError / 「加载论坛数据返回错误」console 输出，无红色错误文案
//     F idle 预取：列表落地后空闲期自动预载 replies（replies_preloaded）
//     G 竖屏导航：mini 宽 156、头像与汉堡不重叠；点头像跳转后菜单自动收起（回 mini）
//   counter-proof：撤掉修复（git stash）后 A/B/D/E/G 必红。
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const LIKE_DELAY = 1500;
const LIST_DELAY_ABORT = 2500;

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
const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'probe_user', role: 'user', points: 42
    });
  });
};

const attachConsoleCapture = (page) => {
  const logs = [];
  page.on('console', async (msg) => {
    const entry = { type: msg.type(), text: msg.text(), args: '' };
    logs.push(entry);
    try {
      const parts = await Promise.all(msg.args().map((a) => a.evaluate((v) => {
        if (v instanceof Error) return `${v.name}: ${v.message}`;
        try { return JSON.stringify(v); } catch { return String(v); }
      })));
      entry.args = parts.join(' | ');
    } catch { /* 页面已关闭 / 句柄失效 */ }
  });
  page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: String(e).slice(0, 200), args: '' }));
  return logs;
};

// ⚠️ 每页只注册一个 route handler：同页多次 page.route 时后注册的先匹配，
// 非命中分支若直接 continue()，请求会立刻出网、把先注册的 handler 整个短路掉
// （踩过：点赞 mock 从未生效）。统一走一张规则表，首个命中规则生效。
// 规则字段：match(必填) / delay / body / fail / hold(先挂起，等 release) / transform(改真实响应)
const setupRoutes = async (page, rules) => {
  let released = false;
  const waiters = [];
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const rule = rules.find((r) => r.match(url));
    if (!rule) return route.continue().catch(() => {});
    // hold：确定性制造「等待期」（如挡掉 idle 预取，让骨架场景可复现）
    if (rule.hold && !released) await new Promise((resolve) => waiters.push(resolve));
    if (rule.delay) await sleep(rule.delay);
    if (rule.fail) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'probe forced failure', code: 'PROBE_FAIL' })
      }).catch(() => {});
    }
    if (rule.transform) {
      try {
        const resp = await route.fetch();
        const raw = await resp.json();
        const headers = { ...resp.headers() };
        delete headers['content-length'];
        delete headers['content-encoding'];
        return route.fulfill({
          status: resp.status(),
          headers,
          body: JSON.stringify(rule.transform(raw))
        });
      } catch {
        return route.continue().catch(() => {});
      }
    }
    if (rule.body) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rule.body)
      }).catch(() => {});
    }
    return route.continue().catch(() => {});
  });
  return {
    release: () => { released = true; waiters.splice(0).forEach((r) => r()); },
    held: () => waiters.length
  };
};

/** 轮询直到条件满足（返回最后一次求值结果），用于替换「定时等」避免假红 */
const waitForInPage = async (page, fn, { timeout = 10000, interval = 200, arg = undefined } = {}) => {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(fn, arg);
    if (last && last.done) return last;
    await sleep(interval);
  }
  return last;
};

/** 打开社区（论坛 host）并等到真实卡片 */
const openCommunity = async (page) => {
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.community-shell', { timeout: 25000 });
  await page.waitForSelector('.post-card-v2', { timeout: 25000 });
  await page.waitForTimeout(1200);
};

const likeSnapshot = () => {
  const card = document.querySelector('.post-card-v2');
  if (!card) return null;
  const btn = card.querySelector('.like-btn-v2');
  if (!btn) return null;
  return {
    liked: btn.classList.contains('is-liked'),
    pulsing: btn.classList.contains('is-pulsing'),
    disabled: btn.disabled,
    count: Number(String(btn.querySelector('.action-count-v2')?.textContent || '0').trim())
  };
};

const report = { checks: {}, info: {} };
const browser = await launch();

// ================= A/B：点赞乐观更新 + 提交锁 =================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  // 点赞 RPC 固定返回「已赞 + 服务端计数 999」：既制造 1500ms 飞行窗口，
  // 又能确定性地断言「RPC 返回后校准为服务端值」
  await setupRoutes(page, [{
    match: (u) => /toggle_forum_like/.test(u),
    delay: LIKE_DELAY,
    body: [{ action: 'liked', like_count: 999, is_liked: true }]
  }]);
  await openCommunity(page);

  // 点击 + 两帧后读数 + 之后 50ms 采样轨迹，全部在同一页面上下文内完成，
  // 既避开 CDP 往返误差，也能记录「RPC 落地那一刻」的状态（校准 + 解锁）
  const trace = await page.evaluate(async (delay) => {
    const card = document.querySelector('.post-card-v2');
    const btn = card.querySelector('.like-btn-v2');
    const read = (t0) => ({
      ms: Math.round(performance.now() - t0),
      liked: btn.classList.contains('is-liked'),
      pulsing: btn.classList.contains('is-pulsing'),
      disabled: btn.disabled,
      count: Number(String(btn.querySelector('.action-count-v2')?.textContent || '0').trim())
    });
    const t0 = performance.now();
    const before = read(t0);
    btn.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const instant = read(t0);
    const samples = [];
    const timer = setInterval(() => samples.push(read(t0)), 50);
    await new Promise((r) => setTimeout(r, delay + 1400));
    clearInterval(timer);
    return { before, instant, samples };
  }, LIKE_DELAY);
  const instant = { ...trace, after: trace.instant, elapsed: trace.instant.ms };
  report.info.like = { before: trace.before, instant: trace.instant, samples: trace.samples.length };
  const want = instant.before.count + (instant.before.liked ? -1 : 1);
  check('A1 点击瞬间 like_count 已 ±1（RPC 仍在飞行）',
    instant.after.count === want && instant.elapsed < 200,
    `before=${instant.before.count} after=${instant.after.count} want=${want} +${instant.elapsed}ms`);
  check('A2 点击瞬间 isLiked 已翻转',
    instant.after.liked === !instant.before.liked,
    `before=${instant.before.liked} after=${instant.after.liked}`);
  check('A3 点击瞬间心跳类 is-pulsing 已加上', instant.after.pulsing === true, `pulsing=${instant.after.pulsing}`);

  const last = trace.samples[trace.samples.length - 1];
  const calibrated = trace.samples.find((s) => s.count === 999);
  report.info.likeSettled = { last, calibratedAt: calibrated ? calibrated.ms : null };
  check('A4 RPC 返回后校准为服务端值（999）',
    !!calibrated && calibrated.liked === true,
    calibrated ? `@${calibrated.ms}ms liked=${calibrated.liked} count=${calibrated.count}` : 'never reached 999');
  check('B1 RPC 落地瞬间按钮即解锁（无 300ms 提交锁）',
    !!calibrated && calibrated.disabled === false,
    calibrated ? `@${calibrated.ms}ms disabled=${calibrated.disabled}` : 'n/a');

  // 立刻再点一次（前一次刚落地）——修复前会被 300ms 锁吞掉
  const secondClick = await page.evaluate(async () => {
    const btn = document.querySelector('.post-card-v2').querySelector('.like-btn-v2');
    const before = btn.classList.contains('is-liked');
    btn.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { before, after: btn.classList.contains('is-liked') };
  });
  check('B2 落地后立即连点不被吞（isLiked 再次翻转）',
    secondClick.after !== secondClick.before, `${secondClick.before} -> ${secondClick.after}`);
  await page.waitForTimeout(LIKE_DELAY + 800);
  await page.screenshot({ path: `${OUT}/ux-like-optimistic.png` });
  await ctx.close();
}

// ================= C：失败回滚 =================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await setupRoutes(page, [{
    match: (u) => /toggle_forum_like|rest\/v1\/likes/.test(u),
    delay: 500,
    fail: true
  }]);
  await openCommunity(page);

  const rollback = await page.evaluate(async () => {
    const card = document.querySelector('.post-card-v2');
    const btn = card.querySelector('.like-btn-v2');
    const read = (t0) => ({
      ms: Math.round(performance.now() - t0),
      liked: btn.classList.contains('is-liked'),
      count: Number(String(btn.querySelector('.action-count-v2')?.textContent || '0').trim())
    });
    const t0 = performance.now();
    const before = read(t0);
    btn.click();
    const samples = [];
    const timer = setInterval(() => samples.push(read(t0)), 50);
    await new Promise((r) => setTimeout(r, 3000));
    clearInterval(timer);
    const after = read(t0);
    const modal = document.querySelector('.common-alert-modal');
    return {
      before, after, samples,
      modalVisible: !!modal,
      modalTitle: modal ? (modal.querySelector('.alert-title')?.textContent || '').trim() : ''
    };
  });
  const optimisticSeen = rollback.samples.some((s) => s.count === rollback.before.count + 1 && s.liked === !rollback.before.liked);
  report.info.rollback = { before: rollback.before, after: rollback.after, optimisticSeen, samples: rollback.samples.length };
  check('C0 点击瞬间先出现乐观值（+1）', optimisticSeen,
    JSON.stringify(rollback.samples.slice(0, 4)));
  check('C1 失败后赞数回滚到点击前的值',
    rollback.after.count === rollback.before.count, `before=${rollback.before.count} after=${rollback.after.count}`);
  check('C2 失败后 isLiked 回滚', rollback.after.liked === rollback.before.liked,
    `${rollback.before.liked} -> ${rollback.after.liked}`);
  check('C3 失败弹出 toast/弹窗', rollback.modalVisible, `title=${rollback.modalTitle}`);
  await page.screenshot({ path: `${OUT}/ux-like-rollback.png` });
  await ctx.close();
}

// ================= D：评论先展开后加载 =================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  // 评论请求先挂起：挡住 idle 预取（否则列表落地后预取已把回复填好，
  // 点开直接命中 → 走不到加载态），从而确定性复现「先展开后加载」的等待期
  const gate = await setupRoutes(page, [
    { match: (u) => /rest\/v1\/comments/.test(u), hold: true }
  ]);
  await openCommunity(page);

  // 逐张探测「有评论且需真加载」的帖子：list_forum_posts 会内联 replies 预览，
  // 命中的帖子 replies_preloaded 已为 true（点开直接出数据、无骨架），必须跳过。
  // 探测过程同时完成首次点击的瞬时读数；跳过的卡片再点一次收回。
  // 定位一律走 Vue 绑定的 data-forum-post-id（虚拟列表重建节点会丢手动加的属性）。
  const picked = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('.post-card-v2')].filter((c) => {
      const n = Number(String(c.querySelector('.replies-btn-v2 .action-count-v2')?.textContent || '0').trim());
      return n > 0 && !c.querySelector('.replies-list');
    });
    let skipped = 0;
    for (const card of cards) {
      const btn = card.querySelector('.replies-btn-v2');
      if (!btn) continue;
      const t0 = performance.now();
      btn.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const snapshot = {
        elapsed: Math.round(performance.now() - t0),
        expanded: card.classList.contains('is-expanded'),
        skeleton: !!card.querySelector('.replies-skeleton'),
        realList: !!card.querySelector('.replies-list:not(.replies-skeleton)')
      };
      if (snapshot.skeleton) {
        return {
          found: true, skipped,
          id: card.getAttribute('data-forum-post-id'),
          comments: Number(String(card.querySelector('.replies-btn-v2 .action-count-v2')?.textContent || '0').trim()),
          instant: snapshot
        };
      }
      skipped += 1;
      btn.click();   // 收回，试下一张
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    return { found: false, skipped };
  });
  report.info.repliesTarget = picked;
  const instant = picked.instant || {};
  check('D0 找到需要真加载评论的帖子（其余为 RPC 内联预览）', picked.found === true,
    `skipped=${picked.skipped} id=${picked.id || 'none'}`);
  check('D1 点击瞬间已展开（不等数据）', instant.expanded === true && instant.elapsed < 200, `+${instant.elapsed}ms`);
  check('D2 点击瞬间渲染骨架占位', instant.skeleton === true, `skeleton=${instant.skeleton}`);
  check('D3 等待期无真实回复列表（尚未加载）', instant.realList === false, `realList=${instant.realList}`);
  await page.screenshot({ path: `${OUT}/ux-replies-skeleton.png` });

  const targetSel = `.post-card-v2[data-forum-post-id="${picked.id}"]`;
  report.info.replyInstant = instant;

  // 放行挂起的评论请求 → 等骨架消失、真实回复渲染
  report.info.gateHeld = gate.held();
  gate.release();
  const loaded = await waitForInPage(page, (sel) => {
    const card = document.querySelector(sel);
    if (!card) return { done: false, missing: true };
    const skeleton = !!card.querySelector('.replies-skeleton');
    const realList = !!card.querySelector('.replies-list:not(.replies-skeleton)');
    return {
      done: !skeleton,
      skeleton,
      realList,
      replies: card.querySelectorAll('.reply-item-v2').length
    };
  }, { timeout: 12000, arg: targetSel });
  report.info.replyLoaded = loaded;
  check('D4 数据到达后骨架消失、真实回复渲染',
    loaded && loaded.skeleton === false && loaded.realList === true, JSON.stringify(loaded));
  await page.screenshot({ path: `${OUT}/ux-replies-loaded.png` });
  await ctx.close();
}

// ================= E：AbortError 静默 + F：idle 预取 =================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const logs = attachConsoleCapture(page);
  await setupRoutes(page, [{
    match: (u) => /list_forum_posts|rest\/v1\/posts/.test(u),
    delay: LIST_DELAY_ABORT
  }]);
  await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.community-shell', { timeout: 25000 });
  await page.waitForTimeout(1200);

  // 连发刷新：每一发都 abort 上一发，制造大量取消
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('boh_forum_refresh_request')));
    await page.waitForTimeout(320);
  }
  // 等到列表真正渲染出卡片（延迟 + 队列串行，固定等待会假红）
  const postsReady = await waitForInPage(page, () => ({
    done: document.querySelectorAll('.post-card-v2').length > 0,
    posts: document.querySelectorAll('.post-card-v2').length
  }), { timeout: 20000 });
  report.info.abortPostsReady = postsReady;

  const noisy = logs.filter((l) => /abort/i.test(l.text) || /abort/i.test(l.args) || /AbortError/.test(l.args));
  const forumErr = logs.filter((l) => /加载论坛数据返回错误/.test(l.text));
  report.info.abortLogs = { noisy: noisy.slice(0, 4), forumErr: forumErr.slice(0, 3) };
  check('E1 无 AbortError 类 console 输出', noisy.length === 0,
    noisy.map((l) => l.text.slice(0, 90)).join(' // ') || 'zero');
  check('E2 取消不再走「加载论坛数据返回错误」分支', forumErr.length === 0,
    forumErr.map((l) => l.text.slice(0, 90)).join(' // ') || 'zero');

  const ui = await page.evaluate(() => {
    const err = document.querySelector('.forum-load-error');
    return { redError: err ? err.textContent.trim() : null, posts: document.querySelectorAll('.post-card-v2').length };
  });
  report.info.abortUi = ui;
  check('E3 无红色错误文案', !ui.redError, ui.redError || 'none');
  check('E4 取消后列表正常渲染', ui.posts > 0, `posts=${ui.posts}`);

  // F：idle 预取 —— 等空闲期跑完，检查未被点开的帖子是否已 replies_preloaded
  await page.waitForTimeout(3500);
  const prefetched = await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__;
    // 从组件实例拿不到 forumData（setup 闭包）→ 用 DOM 侧证：预取的帖子点开后不出现骨架
    const cards = [...document.querySelectorAll('.post-card-v2')]
      .filter((c) => Number(String(c.querySelector('.replies-btn-v2 .action-count-v2')?.textContent || '0').trim()) > 0)
      .slice(0, 3);
    return { candidates: cards.length };
  });
  report.info.prefetch = prefetched;
  const firstCandidate = await page.evaluate(async () => {
    const card = [...document.querySelectorAll('.post-card-v2')]
      .find((c) => Number(String(c.querySelector('.replies-btn-v2 .action-count-v2')?.textContent || '0').trim()) > 0
        && !c.querySelector('.replies-list'));
    if (!card) return null;
    card.setAttribute('data-prefetch-probe', '1');
    const btn = card.querySelector('.replies-btn-v2');
    btn.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { skeleton: !!card.querySelector('.replies-skeleton') };
  });
  report.info.prefetchClick = firstCandidate;
  check('F1 idle 预取生效：点开已预载帖子无骨架（直接出数据）',
    firstCandidate ? firstCandidate.skeleton === false : false,
    JSON.stringify(firstCandidate));
  await page.screenshot({ path: `${OUT}/ux-abort-prefetch.png` });
  await ctx.close();
}

// ================= G：竖屏导航 =================
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { timeout: 20000 });
  await page.waitForTimeout(1300);

  const mini = await page.evaluate(() => {
    const s = document.querySelector('.unified-nav-surface');
    const box = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }; };
    const user = document.querySelector('.nav-user-info');
    const burger = document.querySelector('#nav-hamburger');
    const logoIcon = document.querySelector('.nav-logo-icon');
    const c = s.querySelector('.nav-container');
    return {
      width: Math.round(s.getBoundingClientRect().width),
      classes: s.className,
      user: box(user), burger: box(burger),
      logoIconOpacity: getComputedStyle(logoIcon).opacity,
      overlapPx: Math.round(user.getBoundingClientRect().right - burger.getBoundingClientRect().left),
      overflowPx: Math.round(c.scrollWidth - c.clientWidth),
      logoTextOpacity: getComputedStyle(document.querySelector('.nav-logo-text')).opacity
    };
  });
  report.info.mini = mini;
  check('G1 mini 宽 168（内容 130 + 两条间隙各 9 + padding 20）', mini.width === 168, `w=${mini.width}`);
  check('G2 头像胶囊与汉堡不重叠（>=8px 间隙）', mini.overlapPx <= -8, `gap=${-mini.overlapPx}px`);
  check('G3 容器无横向溢出', mini.overflowPx <= 0, `overflow=${mini.overflowPx}`);
  check('G4 mini 态保留 logo 图标 / 隐藏 logo 文字',
    mini.logoIconOpacity === '1' && mini.logoTextOpacity === '0',
    `icon=${mini.logoIconOpacity} text=${mini.logoTextOpacity}`);

  // 换到别的路由（菜单此时是关的），再开菜单 → 点 logo 跳首页
  // 这是一条真实用户路径：logo 是「直达」入口，不经过菜单回调 → 只能靠路由兜底收起
  await page.evaluate(() => { location.hash = '#/user-space?tab=community'; });
  await page.waitForTimeout(1500);
  await page.click('#nav-hamburger');
  await page.waitForTimeout(900);
  const opened = await page.evaluate(() => {
    const s = document.querySelector('.unified-nav-surface');
    const m = document.querySelector('#nav-menu-mobile');
    return { expanded: s.classList.contains('nav-expanded'), w: Math.round(s.getBoundingClientRect().width), menu: m.classList.contains('active') };
  });
  report.info.navOpened = opened;
  check('G5 点汉堡一步到位展开 + 菜单', opened.expanded && opened.menu && opened.w > 300, JSON.stringify(opened));

  await page.click('.nav-logo');
  await page.waitForTimeout(1800);
  const afterNav = await page.evaluate(() => {
    const s = document.querySelector('.unified-nav-surface');
    const m = document.querySelector('#nav-menu-mobile');
    return {
      expanded: s.classList.contains('nav-expanded'),
      w: Math.round(s.getBoundingClientRect().width),
      menu: m.classList.contains('active'),
      hash: location.hash,
      // 岛唤起会合法地强制长条（plans/009 决策 2），断言时需排除
      island: /has-status-card|has-task-card|has-bohai-island|has-custom-card/.test(s.className)
    };
  });
  report.info.navAfterRoute = afterNav;
  check('G6 跳转后导航自动收起（菜单必收；无岛时回到 mini）',
    afterNav.menu === false && afterNav.hash !== '#/user-space?tab=community'
    && (afterNav.island ? true : (afterNav.expanded === false && afterNav.w === 164)),
    JSON.stringify(afterNav));
  await page.screenshot({ path: `${OUT}/ux-nav-after-route.png` });
  await ctx.close();
}

// ================= G7：竖屏 600（>480 档）mini 宽 186 + 余量 =================
{
  const ctx = await browser.newContext({ viewport: { width: 600, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.waitForSelector('.unified-nav-surface', { timeout: 20000 });
  await page.waitForTimeout(1300);
  const mid = await page.evaluate(() => {
    const s = document.querySelector('.unified-nav-surface');
    const c = s.querySelector('.nav-container');
    const user = document.querySelector('.nav-user-info');
    const burger = document.querySelector('#nav-hamburger');
    return {
      width: Math.round(s.getBoundingClientRect().width),
      overlapPx: Math.round(user.getBoundingClientRect().right - burger.getBoundingClientRect().left),
      overflowPx: Math.round(c.scrollWidth - c.clientWidth)
    };
  });
  report.info.mini600 = mid;
  check('G7 >480 档 mini 宽 188 + 间隙 >=8 + 无溢出',
    mid.width === 188 && mid.overlapPx <= -8 && mid.overflowPx <= 0, JSON.stringify(mid));
  await ctx.close();
}

await browser.close();

results.forEach((r) => { report.checks[r.name] = r.pass; });
report.pass = Object.values(report.checks).every(Boolean);
const failed = Object.entries(report.checks).filter(([, v]) => !v);
console.log(`\nchecks: ${Object.keys(report.checks).length}, failed: ${failed.length}`);
failed.forEach(([k]) => console.log('  FAIL ' + k));
fs.writeFileSync(`${OUT}/forum-ux-fixes-report.json`, JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
