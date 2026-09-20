/**
 * probe-route-switch.mjs — 路由级切换巡检（逐路由，不抽样）
 *
 * 目的：页面之间来回切换要能「点下去就出来」，前提是**每个路由切换后主内容都真的可见**。
 * 逐个真实路由巡检，而不是抽样目测——单页的空白/不可见很难靠抽查发现。
 *
 * 断言：
 *   ① 切换后 #app 内存在「有面积的主内容块」（不是只剩导航栏 / 不是空壳）；
 *   ② 主内容块 opacity 不为 0、visibility 不是 hidden（防「动画类没被移除」导致的隐形页）；
 *   ③ 切换过程中没有报错级告警（CORS / 资源加载失败按本地环境噪音排除）。
 *
 * ⚠️ 选择器不要用 `#app > *` 的「最后一个元素」——`#app` 下还挂着 ai-edge-trigger、
 *    隐藏 input 包装等 SPAN，会长成 display:none 的假阳性。这里按「可见面积最大」
 *    挑主内容块，并排除已登记的壳层组件。
 *
 * 用法：先起产物服务，再
 *   node scripts/probes/probe-route-switch.mjs http://[::1]:4180
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://[::1]:4180';

// 覆盖公开路由（不需要登录），含各类布局：全宽页 / 隐藏导航 / 长列表 / 表单页
const ROUTES = [
  '/', '/shop', '/newsroom', '/activities-wall', '/about', '/download',
  '/mbti', '/birthday', '/join', '/history', '/ai-intro', '/boh-8-years-event',
  '/lab', '/boh-8-years-journey', '/anniversary-cafe', '/shows',
  '/character-book', '/gift', '/lotteries', '/user-space',
];

// 壳层组件：常驻在 #app 里，不参与「这一页是否渲染出来」的判定
const SHELL_CLASSES = ['unified-nav', 'footer-pages', 'ai-edge-trigger', 'boh-boot', 'boh-boot-body'];

const violations = [];
const fail = (m) => violations.push(m);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  // 页面内 helper：避免在每个 evaluate 里重复实现（Playwright 的 evaluate 只收一个参数）
  await page.addInitScript((shellClasses) => {
    window.__bohMainBlock = () => {
      const blocks = [...(document.querySelector('#app')?.children || [])]
        .filter((el) => !shellClasses.some((c) => el.classList.contains(c)))
        .map((el) => {
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            cls: String(el.className).split(' ')[0] || '(无类)',
            area: Math.round(rect.width * rect.height),
            opacity: cs.opacity,
            visibility: cs.visibility,
            display: cs.display,
          };
        })
        // 排除零面积 / 隐藏的装饰节点（隐藏 input、埋点 SPAN 等）
        .filter((b) => b.area > 2000 && b.display !== 'none');
      blocks.sort((a, b) => b.area - a.area);
      return { count: blocks.length, main: blocks[0] || null, all: blocks.slice(0, 3) };
    };
  }, SHELL_CLASSES);

  let errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  const mainCls = () => page.evaluate(() => window.__bohMainBlock().main?.cls ?? null);

  const rows = [];
  for (const r of ROUTES) {
    errors = [];
    // 起点就是目标路由时（例：从 #/ 出发又测 '/'），签名不会变，计时无意义 → 标记为「起点」
    const currentHash = await page.evaluate(() => window.location.hash);
    const isSameAsCurrent = currentHash === `#${r}` || currentHash === `#${r}/`;
    const beforeSig = await mainCls();
    const t0 = Date.now();
    await page.evaluate((hash) => { window.location.hash = `#${hash}`; }, r);

    let switchedAt = null;
    if (!isSameAsCurrent) {
      for (let i = 0; i < 320; i += 1) {
        const sig = await mainCls();
        if (sig && sig !== beforeSig) { switchedAt = Date.now() - t0; break; }
        await page.waitForTimeout(25);
      }
    }
    await page.waitForTimeout(400); // 让该页首帧数据/动画落定，再做可见性断言

    const probe = await page.evaluate(() => window.__bohMainBlock());
    rows.push({ route: r, ms: switchedAt, sameAsCurrent: isSameAsCurrent, ...probe, errors });

    if (!probe.main) {
      fail(`${r} 切换后找不到有面积的主内容块 —— 页面可能没渲染出来`);
    } else if (probe.main.opacity === '0' || probe.main.visibility === 'hidden') {
      fail(`${r} 主内容块不可见（opacity=${probe.main.opacity} visibility=${probe.main.visibility}）`);
    }
    const realErrors = errors.filter((e) => !/CORS|ERR_FAILED|Failed to load resource/i.test(e));
    if (realErrors.length) fail(`${r} 切换过程中出现报错：${realErrors[0]}`);
  }

  console.log('\n######## 逐路由切换巡检 ########');
  console.log(`${'路由'.padEnd(24)}${'导航→内容'.padStart(10)}   主内容块`);
  for (const r of rows) {
    const m = r.main;
    const time = r.sameAsCurrent ? '（起点）' : `${r.ms}ms`;
    console.log(
      `${r.route.padEnd(24)}${String(time).padStart(10)}   ` +
        (m ? `${m.tag}.${m.cls} 面积=${m.area}px² opacity=${m.opacity}` : '（无）'),
    );
  }
  const times = rows.filter((r) => !r.sameAsCurrent && r.ms != null).map((r) => r.ms).sort((a, b) => a - b);
  if (times.length) {
    console.log(`\n导航→内容出现：中位 ${times[Math.floor(times.length / 2)]}ms / 最慢 ${times[times.length - 1]}ms（共 ${times.length} 次）`);
  }

  await page.screenshot({ path: '/tmp/route-switch-final.png' });
  await ctx.close();
} finally {
  await browser.close();
}

if (violations.length) {
  console.error('\n[route-switch] 巡检未通过：');
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log('\n[route-switch] 巡检通过：全部路由切换后主内容可见、无报错。');
}
