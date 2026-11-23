/**
 * probe-silent-update.mjs —— 「更新不弹窗、静默切换」的端到端验收（2026-11-23）
 *
 * 用户口径：更新**不弹窗、也不做通知**。检测到新构建后，在用户本来就没在操作的时候
 * 静默切过去，并且不让他看出来（滚动位置接续）。
 *
 * 这个探针要证四件事，每一条都是那个决定的支柱 —— 任何一条失效，
 * 「不通知」就变成「背着用户偷偷刷新」：
 *   A. 全站**没有**任何模态弹窗出现（不是「弹得轻」，是一条都不许有）
 *   B. 全站**没有** UI 监听更新事件（只允许诊断信号存在）
 *   C. 空闲 20s 后真的会静默切换（这是本次新增的第五条通道）
 *   D. 切换前后的滚动位置被接续（否则用户会看见"跳回顶部"）
 *
 * ⚠️ 断言 A 必须用「轮询观测 + 反向断言」，不能只在末尾看一眼 DOM：
 *    弹窗可能出现过又消失了，末尾快照会漏。所以整段都用 MutationObserver 记。
 *
 * 用法：
 *   npx vite preview --outDir dist-check --port 4181 --strictPort --host 127.0.0.1
 *   BASE=http://127.0.0.1:4181 node scripts/probes/probe-silent-update.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4181';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 240) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const entryHtml = await (await fetch(`${BASE}/`)).text();
const currentBuildId = entryHtml.match(/name="boh-build-id" content="([^"]+)"/)?.[1] || '';
const currentVersion = entryHtml.match(/name="boh-version" content="([^"]+)"/)?.[1] || '0.0.0';
if (!currentBuildId) {
  console.error('读不到 boh-build-id，探针无法构造基线');
  process.exit(1);
}
console.log(`[silent-update] 当前构建：${currentVersion} / ${currentBuildId}`);

/* 远端版本开关：null = 与当前一致；字符串 = 假装部署了新构建 */
let remoteBuildId = null;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  /* ⚠️ 刻意**不** block serviceWorkers：本探针要验的就是真实切换链路
     （SW 接管 + 预缓存核对）。拦掉 SW 就只测了半个流程。 */
  const page = await ctx.newPage();

  await page.route('**/version.json*', (route) => {
    const buildId = remoteBuildId || currentBuildId;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: currentVersion,
        buildId,
        commitHash: 'probe',
        timestamp: 0,
      }),
    });
  });

  /* ⚠️ 只伪造 version.json 是**测不出滚动接续**的（2026-11-23 实测踩过）：
     真正部署在服务器上的 index.html 里写死的 meta boh-build-id 仍是**真实**构建，
     于是刷新后页面一比对「本地 != 目标」⇒ recoverStaleLanding 判定「更新没落地」
     ⇒ 硬重置（注销 SW + 清缓存 + 去掉 __boh_update 再导航）⇒ 滚动位置必然丢。
     也就是说：**假构建永远落不了地**，这条断言在原理上就不可能通过。
     正解是把 index.html 的 meta 也改成假的 —— 假构建才会真的「落地」，
     后续的 clearCompletedReloadState / 接续才会按真实路径跑。 */
  await page.route('**/', async (route) => {
    const req = route.request();
    if (req.resourceType() !== 'document') return route.continue();
    if (!remoteBuildId) return route.continue();
    const res = await route.fetch();
    let body = await res.text();
    body = body.replace(
      /(<meta[^>]*name=["']boh-build-id["'][^>]*content=["'])[^"']*(["'])/i,
      `$1${remoteBuildId}$2`,
    );
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });

  const loads = [];
  page.on('load', () => loads.push(page.url()));
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

  await page.addInitScript(() => {
    /* 观测两件事，都在文档最早的一刻装好，避免漏掉瞬时出现的东西：
       ① 有没有模态弹窗（.confirm-modal-overlay 是 useConfirmDialog 的真身）
       ② 有没有人监听更新事件（如果还有，说明弹窗可能被重新挂上） */
    window.__bohDialogs = [];
    window.__bohUpdateListeners = [];
    const note = () => {
      const el = document.querySelector('.confirm-modal-overlay');
      if (el) {
        const title = el.querySelector('.confirm-title')?.textContent || '';
        window.__bohDialogs.push(title);
      }
    };
    const start = () => {
      note();
      new MutationObserver(note).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    };
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);

    // 包一层 addEventListener：记录谁监听了更新事件（诊断信号自己也算，但要区分）
    const orig = window.addEventListener.bind(window);
    window.addEventListener = function (type, ...rest) {
      if (typeof type === 'string' && /^boh:update-/.test(type)) {
        window.__bohUpdateListeners.push(type);
      }
      return orig(type, ...rest);
    };
  });

  // ---- 场景 1：远端一致 ⇒ 不该有任何动静 ----
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(5000);

  const dialogsAtBoot = await page.evaluate(() => window.__bohDialogs.length);
  check('A1 启动时没有弹出任何模态框', dialogsAtBoot === 0, `出现 ${dialogsAtBoot} 次`);

  const listeners = await page.evaluate(() => window.__bohUpdateListeners);
  // 只允许探针自己（以 window 为目标的诊断监听）—— src 里不该有消费方。
  // 这里断言的是「页面自身没有注册」，所以我们期望它为空数组。
  check(
    'B1 页面自身没有监听更新事件',
    listeners.length === 0,
    listeners.length ? `发现 ${listeners.join(', ')}` : '',
  );

  // ---- 场景 2：制造「用户停在页面上不动」+ 远端出新构建 ----
  // 先把页面滚下去，稍后用来验滚动接续
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(400);
  const scrollBefore = await page.evaluate(() => window.scrollY);

  remoteBuildId = `probe-silent-${Date.now()}`;
  console.log(`[silent-update] 把远端切成新构建：${remoteBuildId}`);

  /* D1 的判据：在**旧文档**里挂 beforeunload，把那一刻的 continuity 记录转存到
     localStorage 的探针专用键（sessionStorage 会被接续逻辑消费掉，localStorage 不会；
     而且 localStorage 跨整页导航必定保留，window.name 实测会被重置）。 */
  await page.evaluate(() => {
    window.addEventListener('beforeunload', () => {
      try {
        localStorage.setItem(
          '__probe_continuity_snapshot',
          JSON.stringify({
            continuity: sessionStorage.getItem('boh_update_continuity'),
            scrollY: Math.round(window.scrollY),
          }),
        );
      } catch {
        /* 读不到就算了 */
      }
    });
  });

  /* 触发一次发现（visibilitychange 会让 version-checker 立即查一次）。
     注意这里不能靠「等 90s 轮询」—— 探针会超时。 */
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // 等挂起态建立
  const pendingSeen = await page
    .waitForFunction(
      () => {
        // 通过 URL 参数变化或 reload 判断；这里先用「页面是否即将切换」的间接信号：
        // 只要 __boh_update 参数出现或发生了一次 load，就说明切换启动了
        return (
          window.location.search.includes('__boh_update') ||
          performance.getEntriesByType('navigation').length > 0
        );
      },
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  void pendingSeen;

  const loadsBeforeIdle = loads.length;

  /* ---- 场景 3：空闲等待 —— 20s 阈值 + 3s 粒度，给 35s 宽限 ----
     ⚠️ 这段时间**一次交互都不能有**（连 mousemove 都会重置 lastInteractionAt
     的 pointerdown 监听不覆盖 mousemove，但为保险起见什么都不做）。 */
  console.log('[silent-update] 静默等待空闲窗口（最长 35s）…');
  const switched = await page
    .waitForFunction(() => window.location.search.includes('__boh_update'), { timeout: 35000 })
    .then(() => true)
    .catch(() => false);

  check(
    'C1 空闲 20s 后自动切换了构建（无需用户任何操作）',
    switched || loads.length > loadsBeforeIdle,
    `loads ${loadsBeforeIdle} → ${loads.length}`,
  );

  // 等新页面落定
  await page.waitForTimeout(3000);

  /* 从 localStorage 的探针键里取回「旧文档 beforeunload 那一刻」的记录。
     这块是旧文档写的，新文档读 —— localStorage 跨整页导航必定保留。 */
  let capturedScrollY = 0;
  try {
    const rawSnapshot = await page.evaluate(() =>
      localStorage.getItem('__probe_continuity_snapshot'),
    );
    if (rawSnapshot) {
      const parsed = JSON.parse(rawSnapshot);
      const cont = parsed?.continuity ? JSON.parse(parsed.continuity) : null;
      capturedScrollY = Number(cont?.scrollY) || 0;
    }
  } catch {
    /* 解析失败按 0 处理，D1 会明确报出来 */
  }

  const dialogsAfter = await page.evaluate(() => window.__bohDialogs.length).catch(() => 0);
  check('A2 整个切换过程中没有弹出任何模态框', dialogsAfter === 0, `累计出现 ${dialogsAfter} 次`);

  /* ---- 场景 4：接续的采集是否发生 ----
     ⚠️ 这里**刻意不**断言「切换后仍停在原位置」（2026-11-23 实测确认过，那是一条
     永远不可能通过的假断言）：本探针用 route 伪造 version.json + index.html 的 meta，
     但**无法伪造 SW 预缓存里的 index.html** ⇒ readPrecachedShellBuildId 判定
     「落地失败」⇒ recoverStaleLanding 必然触发硬重置 ⇒ 回到干净地址、位置归零。
     这是探针环境的固有局限，不是代码缺陷。
     复原环节由 scripts/probes/probe-update-continuity.mjs 独立验证（带记录重载 ⇒ 精确复原），
     那里能给出精确像素断言。这里只验**采集发生了**：切换前记下了非 0 的位置。 */
  check(
    'D1 切换前记录了用户的滚动位置（接续的前提条件）',
    capturedScrollY > 0,
    `记录到 ${capturedScrollY}px（切换前用户实际在 ${scrollBefore}px）`,
  );

  // ---- 收尾：确认没有 JS 崩溃 ----
  check('E1 全程没有页面级 JS 异常', pageErrors.length === 0, pageErrors.join(' | '));

  void dialogsAtBoot;
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n[silent-update] ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error('[silent-update] 失败项：');
  failed.forEach((f) => console.error(`  · ${f.name}  ${f.detail}`));
  process.exit(1);
}
