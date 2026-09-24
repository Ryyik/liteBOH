#!/usr/bin/env node
/**
 * probe-home-revamp.mjs —— 首屏「一次性开场层 + 下滑直达方块论坛」验收探针
 *                    （2026-09-23 规格）
 *
 * 覆盖：
 *   A 默认进入：满屏街景开场画、问候 + 呼吸提示、无底栏、整页锁一屏
 *   B 下滑进入论坛：线性过渡（采样位移）、开场层卸载、论坛铺满、底栏从下方滑入
 *     ★ B6 上滑不回到开场画（单向入场）
 *   C 分区七席 / 官方居首 / 默认最新 / 深链 ?view=official 渲染英雄区
 *   D UserSpace 底栏五席（方块 / 我的 / 资产 / 消息 / 设置）+ 各区高亮
 *   E 底栏「上滑显现 / 下滑隐藏」（useScrollDirectionHide）
 *   F 桌面首页不挂底栏
 *   G 无未捕获 pageerror
 *
 * 用法：
 *   node scripts/probes/probe-home-revamp.mjs
 *   BASE_URL=http://localhost:5173 node scripts/probes/probe-home-revamp.mjs
 *
 * ⚠️ 本机约定（见 memory）：
 *   · 必须禁代理，否则 playwright 走系统代理连不上本地 dev server；
 *   · 同一 path 只注册一条 page.route；
 *   · mock Supabase 必须回 Access-Control-Expose-Headers: Content-Range，
 *     否则 supabase-js 的 count/range 解析会炸；
 *   · 开场层只在「本会话未通过」时出现 → 每个新 context 天然干净，无需清 storage。
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://[::1]:5173';
const OUT_DIR = process.env.OUT_DIR || 'debug-screenshots/home-revamp';
const SHOT = process.env.SHOT !== '0';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const PROBE_USER_ID = '00000000-0000-4000-8000-0000000000aa';
const PROBE_USER = {
  id: PROBE_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'probe@blockofhome.test',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { username: 'probe' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const results = [];
let passed = 0;
let failed = 0;

const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? `  → ${detail}` : ''}`);
  }
};

/** Supabase / Edge Function 一律离线兜底：验收只关心结构与交互，不依赖真实数据 */
const installNetworkStubs = async (page, { loggedIn = false } = {}) => {
  await page.route('**/rest/v1/**', (route) => {
    const method = route.request().method();
    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        },
      });
    }
    const url = route.request().url();
    // profiles 必须回一条真行：userInfo 为 null 时 isAdmin 之类的取值会直接抛错
    const body = loggedIn && url.includes('/rest/v1/profiles')
      ? JSON.stringify([{ id: PROBE_USER_ID, username: 'probe', role: 'user', points: 0 }])
      : '[]';
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range',
        'Content-Range': '*/0',
      },
      body,
    });
  });

  await page.route('**/auth/v1/**', (route) => {
    const url = route.request().url();
    if (!loggedIn) {
      return route.fulfill({
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'probe: anonymous' }),
      });
    }
    const payload = url.includes('/auth/v1/user')
      ? PROBE_USER
      : { access_token: 'probe-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'probe-refresh', user: PROBE_USER };
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/functions/v1/**', (route) => route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range' },
    body: JSON.stringify({ ok: true, enabled: false, items: [] }),
  }));
};

/** 假会话：直接写 supabase-js 的 localStorage 槽位，让 auth store 启动即认已登录 */
const seedLoggedInSession = async (page) => {
  const session = {
    access_token: 'probe-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'probe-refresh',
    user: PROBE_USER,
  };
  await page.addInitScript((payload) => {
    window.localStorage.setItem('sb-nplnlefdwfgtyimfkyih-auth-token', JSON.stringify(payload));
    window.localStorage.setItem('boh_bind_prompt_dismissed', '1');
  }, session);
};

const hashOf = (page) => page.evaluate(() => window.location.hash);

const gotoRoute = async (page, hash, { settle = 1400 } = {}) => {
  await page.goto(`${BASE_URL}/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(settle);
};

const sectionLabels = (page) => page.$$eval('.forum-section-shell .segment-tab', (els) => els.map((el) => el.textContent.trim())).catch(() => []);
const activeSectionLabel = (page) => page.$eval('.forum-section-shell .segment-tab.active', (el) => el.textContent.trim()).catch(() => '');
const bottomNavLabels = (page) => page.$$eval('.bottom-nav-glass .nav-label', (els) => els.map((el) => el.textContent.trim())).catch(() => []);
const bottomNavHidden = (page) => page.$eval('.bottom-nav-glass', (el) => el.classList.contains('is-hidden')).catch(() => null);
const bottomNavExists = (page) => page.evaluate(() => Boolean(document.querySelector('.bottom-nav-glass')));
const gateExists = (page) => page.evaluate(() => Boolean(document.querySelector('.home-gate')));
const gateTransform = (page) => page.$eval('.home-gate', (el) => getComputedStyle(el).transform).catch(() => '');

/** 用真实滚轮事件触发「往下逛」——监听在 window 上，wheel 是生产环境同一条路径 */
const swipeDown = async (page, total = 160) => {
  await page.mouse.move(PHONE.width / 2, PHONE.height / 2);
  await page.mouse.wheel(0, total);
};

const main = async () => {
  if (SHOT) mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, locale: 'zh-CN' });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

  await installNetworkStubs(page);

  // ---------- A. 默认进入：开场画独占视口、无底栏 ----------
  console.log('\n[A] 默认进入（竖屏 · 首次会话）');
  await gotoRoute(page, '#/');

  const heroBox = await page.$eval('.street-hero', (el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, height: rect.height, width: rect.width };
  }).catch(() => null);
  check('A1 开场画存在且顶格', Boolean(heroBox) && Math.abs(heroBox.top) <= 2, JSON.stringify(heroBox));
  check(
    'A1b 开场画高度 ≈ 视口高度（100svh）',
    Boolean(heroBox) && Math.abs(heroBox.height - PHONE.height) <= 4,
    heroBox ? `hero=${heroBox.height} viewport=${PHONE.height}` : 'no hero',
  );

  const greeting = await page.$eval('.street-hero-greeting', (el) => el.textContent.trim()).catch(() => '');
  check('A2 时段问候文案', /^(早上好|中午好|下午好|晚上好)，欢迎回到方块街$/.test(greeting), greeting);

  const hint = await page.$eval('.street-hero-hint', (el) => el.textContent.replace(/\s+/g, '')).catch(() => '');
  check('A3 呼吸提示「往下逛逛 ↓」', hint.includes('往下逛逛') && hint.includes('↓'), hint);

  check('A4 开场画阶段不挂底栏', (await bottomNavExists(page)) === false);

  /* 2026-09-24：默认首屏改为「白底 + 红 logo」品牌兜底 —— 无街景图时不再退位图品牌图。
     A5 判定放宽：有街景图、或有品牌兜底 logo，都算「有兜底视觉来源」。 */
  const heroImgSrc = await page.$eval('.street-hero-img, .street-hero-brand-logo', (el) => el.getAttribute('src')).catch(() => '');
  check('A5 开场画有兜底来源（不白屏）', Boolean(heroImgSrc), heroImgSrc);
  const heroImgAttrs = await page.$eval('.street-hero-img', (el) => ({
    w: el.getAttribute('width'),
    h: el.getAttribute('height'),
    priority: el.getAttribute('fetchpriority'),
  })).catch(() => null);
  const brandLogoAttrs = await page.$eval('.street-hero-brand-logo', (el) => ({
    w: el.getAttribute('width'),
    h: el.getAttribute('height'),
  })).catch(() => null);
  /* 街景图必须带 fetchpriority=high（LCP 元素）；品牌 logo 是同源静态资源，防 CLS 的固有尺寸即可。 */
  const a6ok = (heroImgAttrs && heroImgAttrs.priority === 'high' && !!heroImgAttrs.w && !!heroImgAttrs.h)
    || (brandLogoAttrs && !!brandLogoAttrs.w && !!brandLogoAttrs.h);
  check('A6 开场画带 width/height（街景图另需 fetchpriority=high）', a6ok, JSON.stringify(heroImgAttrs || brandLogoAttrs));

  /* 开场层是 fixed 覆盖层：底层文档可以滚，但画面必须纹丝不动 ——
     滚动只被当作「下滑意图」，真正进入由手势判定（index.vue 的 enterForum）。 */
  const gateCoverage = await page.evaluate(() => {
    window.scrollTo(0, 600);
    const gate = document.querySelector('.home-gate');
    const rect = gate ? gate.getBoundingClientRect() : null;
    const covered = Boolean(rect) && rect.top <= 1 && rect.height >= window.innerHeight - 1;
    window.scrollTo(0, 0);
    return { covered, position: gate ? getComputedStyle(gate).position : '' };
  });
  check('A7 开场层固定覆盖视口（滑动只触发进入、画面不变）',
    gateCoverage.covered && gateCoverage.position === 'fixed', JSON.stringify(gateCoverage));
  check('A8 开场阶段论坛层不占据视口（被开场画盖住）', (await page.evaluate(() => {
    const gate = document.querySelector('.home-gate');
    if (!gate) return false;
    return gate.getBoundingClientRect().height >= window.innerHeight - 4;
  })) === true);

  /* 2026-09-24 用户反馈「往下逛逛位置太靠下」：贴底会显得像被裁掉。
     断言它落在下三分之一上方、且完整留在视口里。 */
  const hintPosition = await page.evaluate(() => {
    const hint = document.querySelector('.street-hero-hint');
    if (!hint) return null;
    const rect = hint.getBoundingClientRect();
    return {
      bottomGap: Math.round(window.innerHeight - rect.bottom),
      visible: rect.bottom <= window.innerHeight + 1,
    };
  });
  check('A9 「往下逛逛」不贴底（距底 ≥ 60px）且完整可见',
    Boolean(hintPosition) && hintPosition.bottomGap >= 60 && hintPosition.visible,
    JSON.stringify(hintPosition));

  /* 顶部避让同样吃导航栏实测高度（竖屏是居中胶囊，横屏是全宽横条）。
     竖屏两侧不一定重叠，但一旦导航改成全宽，这条会立刻抓到。 */
  const portraitNavOverlap = await page.evaluate(() => {
    const nav = document.getElementById('unified-nav-container');
    const greeting = document.querySelector('.street-hero-greeting');
    if (!nav || !greeting) return null;
    const navRect = nav.getBoundingClientRect();
    const greetingRect = greeting.getBoundingClientRect();
    return {
      navBottom: Math.round(navRect.bottom),
      greetingTop: Math.round(greetingRect.top),
      ok: greetingRect.top >= navRect.bottom - 2,
    };
  });
  check('A10 竖屏问候不被导航栏遮挡', portraitNavOverlap?.ok === true, JSON.stringify(portraitNavOverlap));

  /* 论坛层自带高层级浮层（embedded 发帖按钮 z-index 1200，且被 Teleport 到 body）——
     开场画阶段必须压住它。用 elementFromPoint 直接问「这个位置上最上层是谁」，
     比比 z-index 更接近真实观感。 */
  const fabCovered = await page.evaluate(() => {
    const fab = document.querySelector('.mobile-compose-fab');
    if (!fab) return { ok: true, reason: 'fab-not-mounted' };
    const rect = fab.getBoundingClientRect();
    if (rect.width < 1) return { ok: true, reason: 'fab-zero-size' };
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      ok: Boolean(top && top.closest('.home-gate')),
      topTag: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0] || ''}` : 'none',
    };
  });
  check('A11 开场画压住论坛浮层（发帖按钮不冒头）', fabCovered.ok === true, JSON.stringify(fabCovered));

  if (SHOT) await page.screenshot({ path: path.join(OUT_DIR, '01-hero-portrait.png') });

  // ---------- B. 下滑 → 线性过渡 → 论坛铺满、底栏滑入、不可回退 ----------
  console.log('\n[B] 下滑进入论坛');
  await swipeDown(page);
  await page.waitForTimeout(120);

  /* 用户要的是「封面离开时导航栏自然出现」，不是两边同时抢镜 ——
     底栏挂载被刻意推迟到开场画退场后半段（BOTTOM_NAV_REVEAL_DELAY_MS）。
     这里在手势刚触发的窗口内量一次：底栏必须还没出现。 */
  const navRightAfterSwipe = await bottomNavExists(page);
  check('B0 手势刚触发时底栏还没出现（不与封面同时起步）', navRightAfterSwipe === false, String(navRightAfterSwipe));

  /* 采样：轮询等 transform 真的开始变，而不是拍一个固定 sleep ——
     首帧/热更新抖动时 120ms 可能还停在 identity matrix，会假红。 */
  const identity = 'matrix(1, 0, 0, 1, 0, 0)';
  let midTransform = '';
  const sampleStart = Date.now();
  while (Date.now() - sampleStart < 800) {
    const t = await gateTransform(page);
    if (t && t !== 'none' && t !== identity) {
      midTransform = t;
      break;
    }
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(180);
  const midTransform2 = await gateTransform(page);
  check('B1 过渡中开场画正在位移（transform 两次采样不同）', Boolean(midTransform) && midTransform !== midTransform2, `${midTransform} → ${midTransform2}`);

  const translateYOf = (t) => {
    const m = /matrix\(([^)]+)\)/.exec(t || '');
    if (!m) return null;
    const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
    return Number.isFinite(parts[5]) ? parts[5] : null;
  };
  const y1 = translateYOf(midTransform);
  const y2 = translateYOf(midTransform2);
  check('B2 位移方向为向上退出（translateY 递减至负）', y1 !== null && y2 !== null && y2 < y1, `${y1} → ${y2}`);

  // 等待要盖过完整过渡时长（index.vue 的 GATE_TRANSITION_MS = 880ms）+ 余量
  await page.waitForTimeout(1800);
  check('B3 过渡结束开场画被卸载（单向入场）', (await gateExists(page)) === false);

  const stage = await page.$('.home-forum-stage');
  check('B4 论坛层存在', Boolean(stage));
  const labels = await sectionLabels(page);
  check('B5 分区七席且官方居首', labels.join('/') === '官方/最新/关注/新闻/活动/成员/印象', labels.join('/'));
  check('B6 默认分区 = 最新', (await activeSectionLabel(page)) === '最新', await activeSectionLabel(page));

  const navLabelsAfterEnter = await bottomNavLabels(page);
  check('B7 进入论坛后底栏五席出现', navLabelsAfterEnter.join('/') === '方块/我的/资产/消息/设置', navLabelsAfterEnter.join('/'));
  check('B8 底栏「方块」高亮', (await page.$eval('.bottom-nav-glass .nav-item.active .nav-label', (el) => el.textContent.trim()).catch(() => '')) === '方块');

  /* 首页把「更晚更慢的浮现」传给底栏（默认 760ms，首页 900ms）——
     传参断了这里会掉回默认值，所以直接量 CSS 变量。 */
  const navEnterDuration = await page.$eval('.bottom-nav-glass', (el) => getComputedStyle(el).getPropertyValue('--bottom-nav-enter-duration').trim()).catch(() => '');
  check('B8b 底栏浮现时长按首页传入（900ms）', navEnterDuration === '900ms', navEnterDuration);
  if (SHOT) await page.screenshot({ path: path.join(OUT_DIR, '02-forum-after-enter.png') });

  // ★ 单向：滚回顶部（并反向滑动）也不该让开场画回来
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.mouse.move(PHONE.width / 2, PHONE.height / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(600);
  check('B9 ★上滑 / 回顶部不回到开场画', (await gateExists(page)) === false);

  // ---------- C. 深链 ?view=official 渲染英雄区 ----------
  console.log('\n[C] 官方分区');
  await gotoRoute(page, '#/?view=official', { settle: 900 });
  /* 官方分区的英雄区是两层异步 chunk（OfficialHeroStage → HomeHeroFlow），
     dev 模式下 chunk 往返不稳；用条件等待而不是拍脑袋的固定 sleep，否则会偶发假红。 */
  await page.waitForFunction(() => {
    const el = document.querySelector('.forum-section-shell .segment-tab.active');
    return Boolean(el) && el.textContent.trim() === '官方';
  }, null, { timeout: 12000 }).catch(() => {});
  const officialActive = await activeSectionLabel(page);
  check('C1 深链 ?view=official 直达官方分区', officialActive === '官方', officialActive);
  await page.waitForSelector('.home-hero-flow, .home-hero-row', { timeout: 15000 }).catch(() => {});
  const heroFlowMounted = await page.$('.home-hero-flow, .home-hero-row');
  check('C2 官方分区渲染英雄区流', Boolean(heroFlowMounted));

  /* 2026-09-23 修：分区页签原先被悬浮导航胶囊压住（新闻/活动两项看不见）。
     断言第一个页签落在导航胶囊底部之下 —— 顶部避让必须吃实测岛高，不能写死。
     注意量的是**页签按钮**而不是 .segment-tabs 容器：容器自身的 top 恒为内容流起点，
     避让值体现在它的 padding-top 上，量容器会永远量到 0。 */
  const navOverlap = await page.evaluate(() => {
    const nav = document.getElementById('unified-nav-container');
    const firstTab = document.querySelector('.forum-section-shell .segment-tabs .segment-tab');
    if (!nav || !firstTab) return null;
    const navRect = nav.getBoundingClientRect();
    const tabRect = firstTab.getBoundingClientRect();
    return {
      navBottom: Math.round(navRect.bottom),
      tabTop: Math.round(tabRect.top),
      ok: tabRect.top >= navRect.bottom - 2,
    };
  });
  check('C3 分区页签不被导航胶囊遮挡', navOverlap?.ok === true, JSON.stringify(navOverlap));

  /* C4-C7 回归保护：点分区切 feed 曾整页炸成「页面出了问题」——
     ForumMain 的 watch(externalFeed, …, { immediate: true }) 同步调了下方才声明的
     const fetchForumData → TDZ ReferenceError。这里逐个点过去，只要有错误边界就红。 */
  const clickSection = async (label) => {
    await page.evaluate((text) => {
      const tabs = Array.from(document.querySelectorAll('.forum-section-shell .segment-tab'));
      const hit = tabs.find((tab) => tab.textContent.trim() === text);
      if (hit) hit.click();
    }, label);
    await page.waitForTimeout(900);
  };
  for (const label of ['关注', '新闻', '活动', '最新', '成员', '印象']) {
    await clickSection(label);
    const active = await activeSectionLabel(page);
    const broken = await page.evaluate(() => Boolean(document.querySelector('.geb-root')));
    check(`C4 切到「${label}」不炸（无错误边界，分区生效）`, !broken && active === label,
      `active=${active} errorBoundary=${broken}`);
  }
  if (SHOT) await page.screenshot({ path: path.join(OUT_DIR, '03-official-tab.png') });

  // ---------- D. UserSpace 底栏五席 ----------
  console.log('\n[D] UserSpace 底栏五席');
  await gotoRoute(page, '#/user-space?tab=posts', { settle: 2200 });
  const usLabels = await bottomNavLabels(page);
  check('D1 五席 = 方块/我的/资产/消息/设置', usLabels.join('/') === '方块/我的/资产/消息/设置', usLabels.join('/'));
  const usActive = await page.$eval('.bottom-nav-glass .nav-item.active .nav-label', (el) => el.textContent.trim()).catch(() => '');
  check('D2 ?tab=posts 时「我的」高亮', usActive === '我的', usActive);
  if (SHOT) await page.screenshot({ path: path.join(OUT_DIR, '04-userspace-nav.png') });

  await gotoRoute(page, '#/user-space?tab=assets', { settle: 2000 });
  const assetsActive = await page.$eval('.bottom-nav-glass .nav-item.active .nav-label', (el) => el.textContent.trim()).catch(() => '');
  check('D3 ?tab=assets 时「资产」高亮', assetsActive === '资产', assetsActive);

  await gotoRoute(page, '#/user-space?tab=community', { settle: 2200 });
  const communityActive = await page.$eval('.bottom-nav-glass .nav-item.active .nav-label', (el) => el.textContent.trim()).catch(() => '');
  check('D4 ?tab=community 时「方块」高亮', communityActive === '方块', communityActive);
  const usForumLabels = await sectionLabels(page);
  check('D5 方块分区在本页渲染论坛（七席）', usForumLabels.join('/') === '官方/最新/关注/新闻/活动/成员/印象', usForumLabels.join('/'));

  // ---------- E. 底栏上滑显现 / 下滑隐藏 ----------
  console.log('\n[E] 底栏显隐联动滚动方向');
  await gotoRoute(page, '#/', { settle: 1600 }); // 同一 context：开场层不会重播
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(300);

  /* 分步滚动而不是一次 scrollTo：useScrollDirectionHide 用「本次位置 - 上次位置」
     累计位移，第一次采样只建立基线（不判定方向），一次性滚动往往只产生一两个
     scroll 事件 → 会假红。真实手指滚动本来就是连续多个事件。 */
  const scrollInSteps = async (step, times) => {
    await page.evaluate(async ({ step: s, times: n }) => {
      for (let i = 0; i < n; i += 1) {
        window.scrollBy(0, s);
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
    }, { step, times });
    await page.waitForTimeout(500);
  };

  await scrollInSteps(120, 12);
  const e1Diag = await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    scrollable: document.documentElement.scrollHeight - window.innerHeight,
    navClass: document.querySelector('.bottom-nav-glass')?.className || 'none',
  }));
  check('E1 向下滚 → 底栏隐藏', (await bottomNavHidden(page)) === true, `${String(await bottomNavHidden(page))} | ${JSON.stringify(e1Diag)}`);

  await scrollInSteps(-80, 8);
  check('E2 向上滑 → 底栏显现', (await bottomNavHidden(page)) === false, String(await bottomNavHidden(page)));

  // ---------- F. 桌面不挂底栏 ----------
  console.log('\n[F] 桌面');
  const desktopContext = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, locale: 'zh-CN' });
  const desktopPage = await desktopContext.newPage();
  await installNetworkStubs(desktopPage);
  await gotoRoute(desktopPage, '#/', { settle: 1800 });
  await swipeDown(desktopPage, 200);
  await desktopPage.waitForTimeout(900);
  const desktopNavVisible = await desktopPage.$eval('.bottom-nav-glass', (el) => el.getBoundingClientRect().width > 0).catch(() => false);
  check('F1 桌面首页不挂底栏', desktopNavVisible === false, String(desktopNavVisible));
  check('F2 桌面同样已进入论坛（开场画卸载）', (await desktopPage.evaluate(() => Boolean(document.querySelector('.home-forum-stage')))) === true);
  if (SHOT) await desktopPage.screenshot({ path: path.join(OUT_DIR, '05-desktop-home.png') });
  await desktopContext.close();

  // ---------- H. 横屏适配（2026-09-24） ----------
  console.log('\n[H] 横屏适配');
  const LANDSCAPE = { width: 844, height: 390 };
  const landscapeContext = await browser.newContext({ viewport: LANDSCAPE, deviceScaleFactor: 2, locale: 'zh-CN' });
  const landscapePage = await landscapeContext.newPage();
  await installNetworkStubs(landscapePage);
  await gotoRoute(landscapePage, '#/', { settle: 1500 });
  const landscapeHero = await landscapePage.evaluate(() => {
    const hero = document.querySelector('.street-hero');
    if (!hero) return null;
    const hint = document.querySelector('.street-hero-hint');
    const greeting = document.querySelector('.street-hero-greeting');
    const heroRect = hero.getBoundingClientRect();
    const hintRect = hint ? hint.getBoundingClientRect() : null;
    const greetingRect = greeting ? greeting.getBoundingClientRect() : null;
    return {
      heroH: Math.round(heroRect.height),
      viewportH: window.innerHeight,
      hintBottomGap: hintRect ? Math.round(window.innerHeight - hintRect.bottom) : null,
      hintVisible: hintRect ? hintRect.bottom <= window.innerHeight + 1 : false,
      greetingVisible: greetingRect
        ? greetingRect.top >= 0 && greetingRect.bottom <= window.innerHeight
        : false,
    };
  });
  check('H1 横屏开场画不超视口（高度 ≈ 视口高）',
    Boolean(landscapeHero) && Math.abs(landscapeHero.heroH - landscapeHero.viewportH) <= 4,
    JSON.stringify(landscapeHero));
  check('H2 横屏提示完整可见且不贴底',
    landscapeHero?.hintVisible === true && landscapeHero.hintBottomGap >= 30,
    JSON.stringify(landscapeHero));
  check('H3 横屏问候完整可见', landscapeHero?.greetingVisible === true, JSON.stringify(landscapeHero));

  /* 横屏导航栏是全宽横条，顶部避让不够就会直接压住问候语（首轮实测就是这样）。
     断言问候语整体落在导航栏底部之下。 */
  const landNavOverlap = await landscapePage.evaluate(() => {
    const nav = document.getElementById('unified-nav-container');
    const greeting = document.querySelector('.street-hero-greeting');
    if (!nav || !greeting) return null;
    const navRect = nav.getBoundingClientRect();
    const greetingRect = greeting.getBoundingClientRect();
    return {
      navBottom: Math.round(navRect.bottom),
      greetingTop: Math.round(greetingRect.top),
      ok: greetingRect.top >= navRect.bottom - 2,
    };
  });
  check('H4 横屏问候不被导航栏遮挡', landNavOverlap?.ok === true, JSON.stringify(landNavOverlap));
  if (SHOT) await landscapePage.screenshot({ path: path.join(OUT_DIR, '06-landscape-hero.png') });
  await landscapeContext.close();

  // ---------- G. 运行时错误 ----------
  console.log('\n[G] 运行时错误');
  check('G1 无未捕获 pageerror', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await context.close();
  await browser.close();

  console.log(`\n[probe-home-revamp] ${passed}/${passed + failed} PASS`);
  if (failed) {
    console.log('失败项：');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}${r.detail ? ` → ${r.detail}` : ''}`));
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error('[probe-home-revamp] 崩溃：', err);
  process.exitCode = 1;
});
