#!/usr/bin/env node
/**
 * portrait-adaptive-audit.mjs — 竖屏「全宽布局 + 加载提示」专项体检（2026-10-22）
 *
 * **这是诊断脚本，不是探针**：只输出数值与截图、不做断言、不设退出码。
 * 按 docs/demos/README.md 的口径放在这里，不进 `scripts/probes/` 的探针计数。
 * 方案落地后若要进 CI，应补 check() 断言并迁到 `scripts/probes/`（同步改 AGENTS.md 计数）。
 *
 * 与 probe-portrait-visual-audit.mjs 的分工：那个查溢出/截断/对比度，这个只查两件事：
 *   ① 宽度：主内容容器利用率、多列网格的列宽是否过窄、左右留白占比
 *   ② 加载：慢网（REST/RPC 延迟）下首屏是否有任何可见的加载指示（骨架/转圈/文字）
 *
 * 判据全部是数值，不做视觉判断；截图仅供人复核。
 * 前置：dev server 在 5199（BASE 可覆盖）。
 * 运行：node docs/demos/portrait-adaptive-audit.mjs [--only=shop,newsroom] [--skip=slow]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = path.resolve('debug-screenshots/portrait-adaptive-2026-10-22');
fs.mkdirSync(OUT, { recursive: true });

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '')
  .slice(7)
  .split(',')
  .filter(Boolean);
const SKIP_SLOW = process.argv.includes('--skip=slow');
const SKIP_WIDTH = process.argv.includes('--skip=width');

const UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const PAGES = [
  { name: 'home', hash: '/', auth: 'user', gate: true },
  { name: 'forum', hash: '/?view=latest', auth: 'user', gate: true },
  { name: 'uspace-posts', hash: '/user-space?tab=posts', auth: 'user' },
  { name: 'uspace-community', hash: '/user-space?tab=community', auth: 'user' },
  { name: 'uspace-assets', hash: '/user-space?tab=assets', auth: 'user' },
  { name: 'uspace-messages', hash: '/user-space?tab=messages', auth: 'user' },
  { name: 'shop', hash: '/shop', auth: 'none' },
  { name: 'lotteries', hash: '/lotteries', auth: 'none' },
  { name: 'activities', hash: '/activities', auth: 'none' },
  { name: 'newsroom', hash: '/newsroom', auth: 'none' },
  { name: 'overview', hash: '/overview', auth: 'user' },
  { name: 'albums', hash: '/albums', auth: 'user' },
  { name: 'cloud-plus', hash: '/user-space?tab=cloud', auth: 'user' },
  { name: 'uspace-settings', hash: '/user-space?tab=settings', auth: 'user' },
  { name: 'birthday', hash: '/birthday', auth: 'user' },
  { name: 'ai-chat', hash: '/ai-chat', auth: 'user', waitSel: '.boh-shell' },
  // 无骨架的专题/详情页（静态扫描挑出来的）
  { name: 'gift', hash: '/gift', auth: 'none' },
  { name: 'cafe', hash: '/anniversary-cafe', auth: 'none' },
  { name: 'journey', hash: '/boh-8-years-journey', auth: 'none' },
  { name: 'character-book', hash: '/character-book', auth: 'none' },
  { name: 'news-detail', hash: '/news/1', auth: 'none' },
  { name: 'post-detail', hash: '/forum/post/1', auth: 'none' },
];

const armGuard = (page, role) =>
  page.evaluate(
    ({ role, uid }) => {
      const app = document.querySelector('#app')?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      if (!pinia) return 'no-pinia';
      const apply = () => {
        const s = pinia.state.value.auth;
        if (!s) return;
        s.isLoggedIn = true;
        s.isInitialized = true;
        if (s.userInfo)
          Object.assign(s.userInfo, { id: uid, username: '竖屏体检', role, points: 42 });
      };
      apply();
      if (!window.__adaptiveGuard) window.__adaptiveGuard = setInterval(apply, 200);
      return 'armed';
    },
    { role, uid: UID },
  );

// ---------------------------------------------------------------- 宽度体检
const widthFn = () => {
  const vw = innerWidth;
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (c.length) s += '.' + c.join('.');
    return s;
  };

  // ① 多列网格：列宽过窄 = 竖屏该塌列/该全宽
  const grids = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (!cs.display.includes('grid')) continue;
    const cols = cs.gridTemplateColumns.split(/\s+/).filter((x) => x && x !== 'none');
    if (cols.length < 2) continue;
    const widths = cols.map((c) => Math.round(parseFloat(c) || 0));
    const r = el.getBoundingClientRect();
    if (r.width < 60) continue;
    grids.push({
      sel: desc(el),
      cols: cols.length,
      colW: widths,
      minCol: Math.min(...widths.filter((w) => w > 0)),
      boxW: Math.round(r.width),
      gap: cs.columnGap,
    });
  }
  // 去重（同选择器同列数只留一条）
  const seen = new Set();
  const gridUniq = grids.filter((g) => {
    const k = g.sel + '|' + g.cols + '|' + g.minCol;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // ② 主内容容器左右留白占比（找最宽的 max-width 容器 / 页面根）
  let main = null;
  const roots = [...document.querySelectorAll('body *')].filter((el) => {
    if (!vis(el)) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.width > vw * 0.5 && /auto/.test(cs.marginLeft + cs.marginRight);
  });
  if (roots.length) {
    const best = roots.sort(
      (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
    )[0];
    const cs = getComputedStyle(best);
    const r = best.getBoundingClientRect();
    main = {
      sel: desc(best),
      w: Math.round(r.width),
      padL: Math.round(parseFloat(cs.paddingLeft)),
      padR: Math.round(parseFloat(cs.paddingRight)),
      maxWidth: cs.maxWidth,
      innerW: Math.round(
        best.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      ),
    };
  }

  // ③ 并排的「半宽卡片」：同父下 ≥2 个同宽兄弟，宽度介于 0.3~0.85 vw
  const halfCards = [];
  for (const parent of document.querySelectorAll('body *')) {
    const kids = [...parent.children].filter(vis);
    if (kids.length < 2) continue;
    const ws = kids.map((k) => Math.round(k.getBoundingClientRect().width));
    const same = ws.filter((w) => Math.abs(w - ws[0]) <= 2);
    if (same.length < 2) continue;
    const w = ws[0];
    if (w > vw * 0.3 && w < vw * 0.85) {
      const cs = getComputedStyle(kids[0]);
      if (parseFloat(cs.borderRadius) >= 8 || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const k = desc(parent);
        if (!halfCards.some((h) => h.sel === k))
          halfCards.push({ sel: k, childW: w, count: same.length, ratio: +(w / vw).toFixed(2) });
      }
    }
  }

  return {
    vw,
    docScrollW: document.documentElement.scrollWidth,
    main,
    grids: gridUniq.sort((a, b) => a.minCol - b.minCol).slice(0, 18),
    narrowGrids: gridUniq.filter((g) => g.minCol > 0 && g.minCol < 120).length,
    halfCards: halfCards.slice(0, 12),
  };
};

// ---------------------------------------------------------------- 加载体检
const loadingFn = () => {
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  };
  const indicators = [];
  const re = /skeleton|loading|spinner|shimmer|placeholder-block|is-loading/i;
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const cls = (el.className || '').toString();
    const busy = el.getAttribute('aria-busy') === 'true';
    const txt = (el.textContent || '').trim();
    const txtHit = txt.length < 20 && /加载中|正在加载|载入中|Loading/i.test(txt);
    if ((re.test(cls) || busy || txtHit) && !el.querySelector('[class*=skeleton]')) {
      const r = el.getBoundingClientRect();
      indicators.push({
        sel: el.tagName.toLowerCase() + '.' + cls.trim().split(/\s+/).slice(0, 2).join('.'),
        w: Math.round(r.width),
        h: Math.round(r.height),
        txt: txt.slice(0, 24),
      });
    }
  }
  // 主内容可见文本量（判断白屏）
  const bodyText = (document.body.innerText || '').replace(/\s+/g, '').length;
  const mainEl =
    document.querySelector('.home, .forum, .userspace, .shop, main, #app > div') || document.body;
  const mainText = (mainEl.innerText || '').replace(/\s+/g, '').length;
  const mainH = Math.round(mainEl.getBoundingClientRect().height);
  return {
    indicators: indicators.slice(0, 10),
    indicatorCount: indicators.length,
    bodyTextLen: bodyText,
    mainTextLen: mainText,
    mainH,
    docH: document.documentElement.scrollHeight,
  };
};

const main = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const results = [];

  for (const p of PAGES) {
    if (ONLY.length && !ONLY.some((n) => p.name.includes(n))) continue;
    const rec = { name: p.name, hash: p.hash, width: null, slow: null, logs: [] };
    const log = (m) => {
      rec.logs.push(m);
      console.log(`   · [${p.name}] ${m}`);
    };

    // ---------- 场景 A：正常网络，测宽度 ----------
    if (!SKIP_WIDTH) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        serviceWorkers: 'block',
        locale: 'zh-CN',
      });
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
          timeout: 30000,
        });
        await page.waitForTimeout(p.auth === 'none' ? 1200 : 3000);
        if (p.auth !== 'none') await armGuard(page, 'user');
        await page.evaluate((h) => {
          location.hash = '#' + h;
        }, p.hash);
        await page.waitForTimeout(4500);
        if (p.waitSel)
          await page
            .waitForSelector(p.waitSel, { timeout: 12000 })
            .catch(() => log('waitSel 超时'));
        if (p.gate) {
          await page.evaluate(() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
          );
          await page.waitForTimeout(2500);
        }
        await page.waitForTimeout(1200);
        rec.width = await page.evaluate(widthFn).catch((e) => ({ error: String(e).slice(0, 150) }));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(OUT, `${p.name}-w-top.png`) });
        await page
          .screenshot({ path: path.join(OUT, `${p.name}-w-full.png`), fullPage: true })
          .catch(() => {});
      } catch (e) {
        log('宽度场景失败：' + String(e.message).slice(0, 140));
      }
      await ctx.close();
    }

    // ---------- 场景 B：慢网（REST/RPC 延迟 6s），测加载提示 ----------
    if (!SKIP_SLOW) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        serviceWorkers: 'block',
        locale: 'zh-CN',
      });
      const page = await ctx.newPage();
      let delayOn = true;
      const slow = async (route) => {
        if (delayOn) await new Promise((r) => setTimeout(r, 15000));
        route.continue().catch(() => {});
      };
      // 只延迟数据面（REST/RPC），鉴权与静态资源必须放行，否则页面根本挂载不起来
      await ctx.route('**/rest/v1/**', slow);
      await ctx.route('**/rpc/**', slow);
      try {
        await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
          timeout: 30000,
        });
        // 启动期不要延迟，先把会话/路由跑起来
        delayOn = false;
        await page.waitForTimeout(p.auth === 'none' ? 1200 : 3000);
        if (p.auth !== 'none') await armGuard(page, 'user');
        // 首页开场 gate 必须在首页解锁，否则切到 /?view=latest 会被 gate 挡住
        if (p.gate) {
          await page.evaluate(() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
          );
          await page.waitForTimeout(2600);
        }
        // 从这里开始，目标页发出的数据请求全部挂起 15s ⇒ 快照落在「纯 pending」窗口内
        delayOn = true;
        await page.evaluate((h) => {
          location.hash = '#' + h;
        }, p.hash);
        await page.waitForTimeout(4000);
        rec.slow = await page
          .evaluate(loadingFn)
          .catch((e) => ({ error: String(e).slice(0, 150) }));
        await page.screenshot({ path: path.join(OUT, `${p.name}-slow.png`) });
        delayOn = false;
      } catch (e) {
        log('慢网场景失败：' + String(e.message).slice(0, 140));
      }
      await ctx.close();
    }

    results.push(rec);
    const w = rec.width;
    const s = rec.slow;
    console.log(
      `[${p.name}] 窄列网格=${w?.narrowGrids ?? '-'} 半宽卡=${w?.halfCards?.length ?? '-'} | 加载指示=${s?.indicatorCount ?? '-'} 主区文本=${s?.mainTextLen ?? '-'}`,
    );
  }

  fs.writeFileSync(path.join(OUT, 'adaptive.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('\n产物：' + path.join(OUT, 'adaptive.json'));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
