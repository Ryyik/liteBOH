/**
 * style-load-guard.js — 动态注入样式（`__vitePreload` 建出来的 <link>）的
 * **判活 / 摘旧建新 / 有限退避修复**，全站单一真源。
 *
 * ── 为什么必须收口到一处（2026-10-13）────────────────────────────────
 * `cssCodeSplit: true` 下路由级 CSS **不在 index.html 里**，是路由 chunk 的 JS 经
 * `__vitePreload` 动态建 `<link>` 注入的 —— 任何一次网络失败都会让页面「有 DOM、没样式」。
 * 三个已实测的坑决定了兜底只能长成一个形状，谁再照抄一遍谁就会漂移：
 *
 *   ① **重试不能用 `import()`**：`__vitePreload` 的去重表 `i[url]` 在 fetch **完成前**
 *      就写入，失败后同一会话内再 import 同一文件会**直接 resolve、永不重建 link**
 *      （「切走再切回」那种页内重试是假重试）。唯一有效的办法是
 *      **摘掉旧 link、用同一 href 重建**。
 *   ② **判活不能用 `link.sheet === null`**：这些 link 被 `__vitePreload` 带上了
 *      `crossOrigin`，失败/过渡态的 sheet 读 `cssRules` 会**抛 SecurityError**；
 *      而且实测被 abort 的 link 其 `sheet` 仍可能非空（只看 sheet 会把坏样式判成好的）。
 *      判据只能是「读得到规则数且 > 0」，且**必须包 try** —— 读不到按「未生效」处理
 *      （保守方向 = 尝试修一次；健康 link 实测可读，profile-base 224 条）。
 *   ③ **不能指望全局恢复链**：`vite:preloadError` 的强制刷新有 30s sessionStorage 冷却，
 *      index.html 的 link-error 监听有 `bohAssetRecovery` 一次性护栏
 *      ⇒ 一次会话只够救一两次，持久故障必须由页内自愈兜住。
 *
 * ── 可测性 ──────────────────────────────────────────────────────────
 * `doc` / `win` / `setTimer` / `clearTimer` 全部可注入 —— 本仓 vitest 环境是 `node`
 * （不依赖 jsdom），`tests/unit/style-load-guard.test.js` 用假 DOM + 假计时器
 * 直接驱动这里的真行为。
 *
 * ── 用法 ────────────────────────────────────────────────────────────
 *   const guard = createStyleSheetGuard({
 *     matchers: [/\/profile-base-[^/]+\.css$/],
 *     delays: [700, 1800, 4000],
 *     isActive: () => isUserSpaceMounted,
 *   });
 *   await guard.repairNow();      // import 已 settle 后复核并立刻修一轮
 *   guard.schedule();             // 仍有残留 → 交给退避重试
 *   guard.reset(); / guard.stop(); // 重新进入页面 / 离开页面
 */

const DEFAULT_TIMEOUT_MS = 8000;

const resolveDoc = (doc) => doc || (typeof document !== 'undefined' ? document : null);
const resolveWin = (win) => win || (typeof window !== 'undefined' ? window : null);

/** 计时器：优先用注入/宿主 window 的，没有就退回全局（node / SSR 下不能因此让 promise 永悬） */
const scheduleTimeout = (win, fn, ms) => {
  const host = resolveWin(win);
  if (host?.setTimeout) return host.setTimeout(fn, ms);
  return setTimeout(fn, ms);
};

/**
 * 该样式是否**真的生效**：读得到规则数且 > 0。
 * ⚠️ 读 `cssRules` 必须包 try —— 见文件头 ②；读不到一律按「未生效」。
 * ⚠️ `link.sheet` 的**读取本身**也要在同一层 try 里：这些 link 带 crossOrigin，
 * 失败态下连 `sheet` 取值都可能抛（单测实测抓到，比「读到空规则」更早一步）。
 */
export const isStyleLinkApplied = (link) => {
  if (!link) return false;
  try {
    return Boolean(link.sheet && link.sheet.cssRules.length > 0);
  } catch {
    return false;
  }
};

/** 在文档里找出第一条匹配该正则的 stylesheet link（找不到返回 null） */
export const findStyleLink = (matcher, doc) => {
  const target = resolveDoc(doc);
  if (!target?.querySelectorAll) return null;
  return (
    [...target.querySelectorAll('link[rel="stylesheet"]')].find((link) =>
      matcher.test(link.href),
    ) || null
  );
};

/**
 * 摘掉失败的 link、用**同一 href** 重建（绕开 `__vitePreload` 去重表的唯一路径）。
 * resolve(true) = 新 link 生效；resolve(false) = 又失败了或超时未生效。
 */
export const reloadStyleLink = (link, { doc, win, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const target = resolveDoc(doc);
  return new Promise((resolve) => {
    const parent = link?.parentNode;
    if (!target?.createElement || !parent) {
      resolve(false);
      return;
    }
    const next = target.createElement('link');
    next.rel = 'stylesheet';
    next.href = link.href;
    const settle = (ok) => resolve(Boolean(ok) || isStyleLinkApplied(next));
    next.addEventListener?.('load', () => settle(true), { once: true });
    next.addEventListener?.('error', () => settle(false), { once: true });
    parent.insertBefore(next, link.nextSibling);
    link.remove();
    // 兜底：缓存命中/彻底失败都可能不发 load/error 事件，不能让 promise 悬着
    scheduleTimeout(win, () => settle(isStyleLinkApplied(next)), timeoutMs);
  });
};

/**
 * 修一轮：把当前**仍是坏的**样式重建一遍，返回仍处坏态的数量。
 * 返回 0 有两种含义：全都好了，或 link 还没被建出来（首次 import 仍在途中）——
 * 两者对调用方都是「无需动作」，所以不区分。
 */
export const repairStyleLinks = async (matchers, options = {}) => {
  const doc = resolveDoc(options.doc);
  if (!doc?.querySelectorAll) return 0;
  const links = matchers.map((matcher) => findStyleLink(matcher, doc)).filter(Boolean);
  const broken = links.filter((link) => !isStyleLinkApplied(link));
  for (const link of broken) {
    await reloadStyleLink(link, options);
  }
  return broken.length;
};

/**
 * 有限退避修复循环（纯逻辑，计时器可注入）。
 * · 修好即停并**重置预算**（下次再坏又是全新的三轮）；
 * · 超过 `delays.length` 轮就收手（`onGiveUp`），避免持续故障把网络打满；
 * · `isActive()` 为假时不动（页面已离开，交给下次进入的 reset）。
 */
export const createBoundedRepairLoop = ({
  repair,
  delays,
  isActive = () => true,
  onRepaired,
  onGiveUp,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) => {
  let timerId = null;
  let attempt = 0;
  let exhausted = false;

  const stop = () => {
    if (timerId !== null) clearTimer(timerId);
    timerId = null;
  };

  const start = () => {
    if (timerId !== null || exhausted) return;
    const delay = delays[attempt];
    if (delay === undefined) {
      // 预算用尽：只报一次，之后 start() 变 no-op（避免持续故障把网络打满）
      exhausted = true;
      onGiveUp?.();
      return;
    }
    attempt += 1;
    timerId = setTimer(async () => {
      timerId = null;
      if (!isActive()) return;
      const stillBroken = await repair();
      if (!stillBroken) {
        attempt = 0;
        onRepaired?.();
        return;
      }
      start();
    }, delay);
  };

  const reset = () => {
    stop();
    attempt = 0;
    exhausted = false;
  };

  return {
    start,
    stop,
    reset,
    get attempts() {
      return attempt;
    },
    get exhausted() {
      return exhausted;
    },
  };
};

/**
 * 页面级门面：把「判活 + 修一轮 + 退避重试」按一组 matchers 绑成一个对象。
 * 调用方只需要关心 `repairNow()` / `schedule()` / `reset()` / `stop()`。
 */
export const createStyleSheetGuard = ({
  matchers,
  delays,
  isActive = () => true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onRepaired,
  onGiveUp,
  doc,
  win,
  setTimer,
  clearTimer,
} = {}) => {
  const options = { doc, win, timeoutMs };
  const loop = createBoundedRepairLoop({
    repair: () => repairStyleLinks(matchers, options),
    delays,
    isActive,
    onRepaired,
    onGiveUp,
    setTimer,
    clearTimer,
  });

  return {
    /** 同步判活（只查不修）：所有目标样式是否都已真实生效。
        ⚠️ 不能用 `repairNow() === 0` 代替 —— 「仍坏的数量为 0」也可能是
        「link 还没被首次 import 建出来」（那时压根没有坏 link 可修），
        两者在「冷启动、样式尚未注入」这一档上会得出相反结论。 */
    areApplied: () => matchers.every((m) => isStyleLinkApplied(findStyleLink(m, options.doc))),
    /** 立刻修一轮，返回仍坏的数量（首次 import 尚未建出 link 时恒为 0） */
    repairNow: () => repairStyleLinks(matchers, options),
    /** 排入退避重试（幂等：已有计时器时不动） */
    schedule: () => loop.start(),
    /** 离开页面：停掉计时器，但**保留**已消耗的预算 */
    stop: () => loop.stop(),
    /** 重新进入页面：停掉计时器 + 重置预算，并立刻复核一轮 */
    reset: async () => {
      loop.reset();
      const stillBroken = await repairStyleLinks(matchers, options);
      if (stillBroken) loop.start();
      return stillBroken;
    },
  };
};
