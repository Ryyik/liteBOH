/**
 * probe-userspace-switch.mjs — UserSpace 分区切换流畅度实测
 *
 * 目的：把「切来切去不够流畅」拆成可测量的几件事，而不是凭感觉优化：
 *   ① 切换延迟：点击 → 目标面板可见 + 样式生效，各花多久；
 *   ② 是否重建：离开再回来后，面板根节点是不是同一个（node identity）——
 *      重建意味着组件状态丢失 + 重新取数，是「切回来卡一下」的典型来源；
 *   ③ 主线程：切换过程中有没有长任务（>50ms 会掉帧）；
 *   ④ 资源：切换有没有触发新的 chunk 请求（HTTP 缓存外的真实下载）。
 *
 * 用法：先起产物服务，再
 *   npx vite preview --outDir dist-check --port 4180 --strictPort
 *   node scripts/probes/probe-userspace-switch.mjs http://[::1]:4180 [throttle]
 *   throttle 传 'slow' 会用 1.2Mbps/150ms RTT 限速，便于放大取数成本。
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';
const SLOW = process.argv[3] === 'slow';
const OUT = process.argv[4] || '/tmp';

// 分区入口的候选选择器（按优先级；桌面横屏走左侧栏，窄屏走底部导航）
const TAB_CONTAINER_SELECTORS = ['.userspace-rail', '.userspace-bottom-nav', '.user-space-page'];
const TAB_ITEM_SELECTOR = '[data-tab], [data-userspace-tab]';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

const result = { tabs: [], switches: [], longTasks: [], requests: [] };

const browser2 = { ctx: null, page: null };

try {
  // ---- 登录态：注 pinia + localStorage（沿用项目既有伪造登录口径）----
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  browser2.ctx = ctx;
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('boh-theme', 'light');
    } catch { /* ignore */ }
  });
  const page = await ctx.newPage();
  browser2.page = page;

  // 收集控制台告警：路由级 <Transition> 遇到多根节点组件会报
  // "expects exactly one child" —— 这是加过渡动画时最容易踩的坑，必须能看见
  const consoleMessages = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') consoleMessages.push(m.text().slice(0, 200));
  });

  if (SLOW) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150,
      downloadThroughput: (1.2 * 1024 * 1024) / 8,
      uploadThroughput: (600 * 1024) / 8,
    });
  }

  // 长任务观测 + 资源观测
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push(Math.round(e.duration));
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* 不支持则跳过 */ }
  });

  const baselineResources = async () =>
    page.evaluate(() => performance.getEntriesByType('resource').length);

  // 记录切换期间发起的请求 URL —— 「每次切换 4~15 个请求」到底是哪些，是本次优化的靶子。
  let requestLog = [];
  // ⚠️ 过滤要连图片一起排掉：左栏品牌位用的是 `/favicon.png`（不在 /static/ 下），
  //    只排除 `/static/` 会把它算成「数据请求」，让人误以为切换在取数。
  page.on('request', (req) => {
    const url = req.url();
    if (/\/static\//.test(url)) return;
    if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?|css|js)(\?|$)/i.test(url)) return;
    requestLog.push({ at: Date.now(), method: req.method(), url });
  });

  await page.goto(`${BASE}/#/user-space`, { waitUntil: 'load' });
  await page.waitForTimeout(SLOW ? 6000 : 3500);

  // ---- 侦察：页面是否可用、有哪些分区入口 ----
  const recon = await page.evaluate(
    ({ containers, itemSel }) => {
      let host = null;
      const counts = {};
      for (const c of containers) {
        const n = document.querySelectorAll(c).length;
        counts[c] = n;
        if (!host && n) host = c;
      }
      const items = host ? [...document.querySelectorAll(`${host} ${itemSel}`)] : [];
      return {
        shell: !!document.querySelector('.user-space-page'),
        counts,
        host,
        tabs: items
          .map((el) => el.getAttribute('data-tab') || el.getAttribute('data-userspace-tab'))
          .filter(Boolean),
        text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
      };
    },
    { containers: TAB_CONTAINER_SELECTORS, itemSel: TAB_ITEM_SELECTOR },
  );
  console.log(`[us-switch] 页面就绪：shell=${recon.shell}；容器命中 ${JSON.stringify(recon.counts)}`);
  console.log(`[us-switch] 采用容器：${recon.host || '(无)'}；分区值：${recon.tabs.join(', ') || '(取不到)'}`);
  if (!recon.shell) {
    console.log(`[us-switch] 未渲染 user-space-page；首屏文本：「${recon.text}」`);
  }

  const tabs = recon.tabs;
  if (tabs.length < 2) {
    console.log('[us-switch] 可切换分区不足 2 个，无法测量切换——请检查登录态或选择器');
    await page.screenshot({ path: `${OUT}/us-recon.png` });
  } else {
    const tabSelector = (t) =>
      `${recon.host} [data-tab="${t}"], ${recon.host} [data-userspace-tab="${t}"]`;

    // ---- 逐个分区：先「首次进入」记时，再「离开后回来」记时 ----
    const measureSwitch = async (tab) => {
      const before = await baselineResources();
      const t0 = Date.now();
      requestLog = [];
      const clicked = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.click();
        return true;
      }, tabSelector(tab));
      if (!clicked) return { tab, error: '未找到分区入口' };
      const activeAt = await page
        .waitForFunction(
          (sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const cls = String(el.className || '');
            return (
              el.getAttribute('aria-selected') === 'true' ||
              el.getAttribute('aria-current') === 'page' ||
              /(^|\s)(active|is-active|selected)(\s|$)/.test(cls)
            );
          },
          tabSelector(tab),
          { timeout: 8000 },
        )
        .then(() => Date.now())
        .catch(() => null);
      await page.waitForTimeout(450); // 让过渡动画跑完
      const after = await baselineResources();
      // 把请求按「接口路径」聚合，便于看出重复取数
      const byPath = {};
      for (const r of requestLog) {
        let p;
        try {
          const u = new URL(r.url);
          p = u.pathname.replace(/^\/rest\/v1\//, '').replace(/^\/functions\/v1\//, 'fn:');
        } catch {
          p = r.url;
        }
        byPath[p] = (byPath[p] || 0) + 1;
      }
      return {
        tab,
        clickToActiveMs: activeAt ? activeAt - t0 : null,
        newRequests: after - before,
        dataRequests: requestLog.length,
        byPath,
      };
    };

    // 首次进入各分区（记录 chunk 下载 + 首次渲染成本）
    for (const tab of tabs) {
      const r = await measureSwitch(tab);
      result.switches.push({ phase: 'first', ...r });
      await page.waitForTimeout(300);
    }

    // 离开后回来（这是用户感受到的「来回切换」场景）：每个分区都测一次返回
    const roundTrip = [...tabs, ...tabs.reverse()];
    for (const tab of roundTrip) {
      const r = await measureSwitch(tab);
      result.switches.push({ phase: 'return', ...r });
      await page.waitForTimeout(300);
    }

    result.longTasks = await page.evaluate(() => window.__longTasks || []);
    result.consoleWarnings = consoleMessages.filter((m) => /warn|Transition|fragment|multiple root/i.test(m));

    // ---- 身份测试：离开再回来后，逐层比对节点是否还是同一个 ----
    // 用途是**定位重建发生在哪一层**：
    //   shell 变新 → UserSpaceMain 整体被重建（路由级 KeepAlive 出问题）
    //   tab-page 变新 → 该分区的容器被 v-if 销毁（v-show 则不该变）
    //   面板变新    → 面板自身的挂载条件/`key` 导致重建
    // 逐层定位很重要：修法完全不同。
    const LAYERS = [
      ['shell', '.user-space-page'],
      ['tab-page', null], // 运行时按分区拼选择器
      ['panel', null],
    ];
    const PANEL_SEL = {
      community: '.community-forum-host > *',
      posts: '.content-home-host > *',
      assets: '.assets-shell .profile-page-content > *',
      messages: '.messages-host > *',
      settings: '.settings-shell .profile-page-content > *',
    };

    const identifyLayered = async (tab) => {
      const selFor = (layer) => {
        if (layer === 'shell') return '.user-space-page';
        if (layer === 'tab-page') return `.tab-page[class*="${tab}"]`;
        return PANEL_SEL[tab];
      };
      const probe = () =>
        page.evaluate((sels) => {
          const out = {};
          for (const [layer, sel] of sels) {
            const el = sel ? document.querySelector(sel) : null;
            out[layer] = { sel, present: !!el };
          }
          return out;
        }, LAYERS.map(([l]) => [l, selFor(l)]));
  
      const click = (t) => page.evaluate((sel) => document.querySelector(sel)?.click(), tabSelector(t));
      const other = tabs.find((t) => t !== tab);

      await click(tab);
      await page.waitForTimeout(700);
      // 把三个层级的节点引用存进页面全局，稍后比对
      const captured = await page.evaluate((sels) => {
        window.__probeNodes = window.__probeNodes || {};
        const out = {};
        for (const [layer, sel] of sels) {
          const el = sel ? document.querySelector(sel) : null;
          window.__probeNodes[`${layer}`] = el;
          out[layer] = el ? `${el.tagName}.${String(el.className).split(' ').slice(0, 2).join('.')}` : null;
        }
        return out;
      }, LAYERS.map(([l]) => [l, selFor(l)]));

      await click(other);
      await page.waitForTimeout(700);
      await click(tab);
      await page.waitForTimeout(900);

      const compared = await page.evaluate((sels) => {
        const out = {};
        for (const [layer, sel] of sels) {
          const el = sel ? document.querySelector(sel) : null;
          const prev = window.__probeNodes?.[layer] || null;
          out[layer] = {
            present: !!el,
            same: !!el && el === prev,
          };
        }
        return out;
      }, LAYERS.map(([l]) => [l, selFor(l)]));

      return { tab, captured, compared };
    };

    console.log('\n######## 离开↔返回 的逐层节点身份（同=复用 / 异=重建）########');
    for (const tab of tabs) {
      const r = await identifyLayered(tab);
      const parts = LAYERS.map(([layer]) => {
        const c = r.compared[layer];
        const mark = c.present ? (c.same ? '同 ✅' : '异 ❌') : '不存在';
        return `${layer}=${mark}`;
      });
      console.log(`  ${tab.padEnd(12)} ${parts.join('   ')}`);
      if (Object.values(r.compared).some((c) => c.present && !c.same)) {
        const firstBad = LAYERS.find(([l]) => r.compared[l].present && !r.compared[l].same)?.[0];
        console.log(`        首个被重建的层级：${firstBad}（原：${r.captured[firstBad] || '—'}）`);
      }
    }
  }

  console.log('\n######## 分区切换各次耗时 ########');
  for (const s of result.switches) {
    console.log(
      `  [${s.phase}] ${String(s.tab).padEnd(12)} 点击→选中 ${String(s.clickToActiveMs ?? '—').padStart(5)}ms   ` +
        `新增资源 ${s.newRequests ?? '—'} 条 / 数据请求 ${s.dataRequests ?? '—'} 个`,
    );
    if (s.byPath && Object.keys(s.byPath).length) {
      const items = Object.entries(s.byPath).sort((a, b) => b[1] - a[1]);
      console.log(`         ${items.map(([p, n]) => `${n}×${p}`).join('  ')}`);
    }
  }
  const returns = result.switches.filter((s) => s.phase === 'return' && s.clickToActiveMs != null);
  if (returns.length) {
    const avg = Math.round(returns.reduce((a, b) => a + b.clickToActiveMs, 0) / returns.length);
    const max = Math.max(...returns.map((s) => s.clickToActiveMs));
    console.log(`  「切回来」平均 ${avg}ms / 最慢 ${max}ms（共 ${returns.length} 次）`);
  }
  console.log(`\n长任务：${result.longTasks.length} 个${result.longTasks.length ? ' → ' + result.longTasks.slice(0, 10).join('ms, ') + 'ms' : ''}`);

  await page.screenshot({ path: `${OUT}/us-switch-final.png` });
  await ctx.close();
} finally {
  await browser.close();
}
