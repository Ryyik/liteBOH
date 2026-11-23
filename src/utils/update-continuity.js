/**
 * update-continuity.js —— 「静默切换构建」前后的现场接续（2026-11-23）
 *
 * 为什么需要它：
 *   2026-11-23 定稿「更新不弹窗、也不做通知」。这个决定能成立的前提**全在这个文件里**——
 *   不给用户提示，就必须让用户看不出来。而整页刷新本身是看得出来的：
 *   `route-scroll-memory.js` 是**内存 Map**，刷新即清零；全仓也没设过
 *   `history.scrollRestoration`。所以切完构建回来，用户会发现自己从读到一半的位置
 *   掉回顶部。那正是「通知」想掩盖的那种副作用 —— 正确做法是消除它，而不是通报它。
 *
 * 分工（改之前先看清边界）：
 *   · **本文件**只负责「跨整页刷新」的那一段：hash 落点、窗口滚动、主滚动容器滚动。
 *   · `route-scroll-memory.js` 负责「SPA 内切页」的那一段，语义是 keepAlive 路由的
 *     记忆，**不要合并**：一个活在内存里、随刷新消失，一个必须落盘才有意义。
 *   · `page-snapshot.js` 负责「白屏那一瞬间」的视觉垫层，与滚动位置无关。
 *
 * 三条纪律：
 *   ① **用后即焚**：读到就删。留着会让下一次「用户自己按 F5」被莫名其妙地拽到某个旧位置，
 *      那是比回顶更糟的体验（用户明确要的是刷新，却被塞回上次的地方）。
 *   ② **只认自己的刷新**：靠 `savedAt` 的 TTL + hash 一致两道判据。用户主动跳去别的页面
 *      再回来时 hash 对不上，直接丢弃，绝不跨页套用。
 *   ③ **失败必须静默**：任何异常都当没发生过（隐私模式、配额满、DOM 还没长出来）。
 *      接续是锦上添花，不能因为它抛错把启动流程带崩。
 */

const STORAGE_KEY = 'boh_update_continuity';
/* 有效期：一次切换构建的完整链路（等 SW 接管 ≤10s + 导航 + 首屏渲染）实测在秒级，
   60s 给足余量。超过这个时间还没消费掉，说明那次刷新根本没发生（用户关了标签页 /
   断网 / 导航被拦），此时留着的状态已经无意义，再套用只会错位。 */
const MAX_AGE_MS = 60 * 1000;
/* 恢复时愿意等多久让目标页把内容长出来。
   ⚠️ 这个值从 2500ms 上调到 8000ms 是**实测逼出来的**（2026-11-23 探针首跑）：
   首屏渲染完 docHeight 只有一屏（800），真实内容分几批到（800 → 1093 → 3144），
   2.5s 的截止线在内容长出来之前就到了，结果只能滚到 0 —— 用户仍有「跳回顶部」。
   8s 覆盖弱网下最慢的一次首屏取数；到点还没长出来就认输（宁可回顶也不要卡住滚动）。 */
const RESTORE_DEADLINE_MS = 8000;

/* 主滚动容器：绝大多数页面滚的是 window（AGENTS 里 Cloud+ 那段讲过这个前提）。
   embedded 论坛（/user-space?tab=community）例外 —— 它滚 `.tab-page.posts-tab`。
   这里用类名白名单而不是「找所有 scrollTop>0 的元素」：后者会把聊天记录、代码块、
   下拉面板的滚动全抓进来，恢复时互相打架，而且选择器不稳定（那些容器多半没有 id）。 */
const SCROLL_CONTAINERS = ['.tab-page.posts-tab'];

const canUseSessionStorage = () => {
  try {
    return typeof window !== 'undefined' && Boolean(window.sessionStorage);
  } catch {
    /* 某些隐私模式下访问 sessionStorage 本身就会抛 */
    return false;
  }
};

const readHash = () => {
  try {
    return String(window.location.hash || '');
  } catch {
    return '';
  }
};

/** 采集当前可见滚动容器的位置。返回的每一项都带「当时的高度」，用于恢复时判断内容够不够长。 */
const captureContainers = () => {
  const out = [];
  if (typeof document === 'undefined') return out;
  SCROLL_CONTAINERS.forEach((selector) => {
    const el = document.querySelector(selector);
    if (!el || !el.scrollTop) return;
    out.push({ selector, top: Math.round(el.scrollTop) });
  });
  return out;
};

/** 原样读出存储里的 JSON（不做 TTL / hash 校验 —— 那属于消费侧）。 */
const readRaw = () => {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeRaw = (payload) => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

/**
 * 刷新/切换构建**之前**采集现场。必须在导航发起前同步调用。
 *
 * @param {{ preserveExisting?: boolean }} [options]
 *   `preserveExisting` —— 同页已有采集记录时，**保留原来那个 scrollY**，只刷新时间戳。
 *   这个开关是为「硬重置」那条路准备的，理由见下方注释，**不是可选优化**。
 * @returns {boolean} 是否采到（false 时调用方照常导航，只是不做接续）
 */
export function captureUpdateContinuity({ preserveExisting = false } = {}) {
  if (!canUseSessionStorage()) return false;
  try {
    const hash = readHash();
    const scrollY = Math.round(window.scrollY || document.documentElement.scrollTop || 0);
    let containers = captureContainers();

    /* 为什么需要 preserveExisting（2026-11-23 实测踩出来的真 bug）：
       硬重置（recoverStaleLanding）发生在**新文档刚加载**的时刻 —— 那时
       `documentElement.scrollHeight` 只有一屏（实测 800）、`window.scrollY` 是 0。
       如果这时照常采集，就会把上一次采集到的正确值（600）**覆盖成 0**，
       于是硬重置之后用户从顶部开始 —— 接续不仅没生效，还比不接续更确定地丢位置。
       （实测证据：window.name 抓到 `yAtCapture: 0, docH: 800`，而切换前是 600。）

       所以这条路径要的是「沿用原始位置，只续期」，而不是「重新采集」。
       scrollY 为 0 时直接用旧值；非 0 说明页面真的滚到了新位置（用户自己动的），
       那就以新的为准。 */
    if (preserveExisting) {
      const prev = readRaw();
      if (prev && String(prev.hash || '') === hash) {
        const prevY = Math.max(0, Number(prev.scrollY) || 0);
        if (!scrollY && prevY) {
          containers = Array.isArray(prev.containers) ? prev.containers : containers;
          writeRaw({ hash, scrollY: prevY, containers, savedAt: Date.now() });
          return true;
        }
      }
    }

    writeRaw({ hash, scrollY, containers, savedAt: Date.now() });
    return true;
  } catch {
    /* 存不下就放弃接续，不影响切换本身 */
    return false;
  }
}

/**
 * 读出并**立刻删除**上次采集的现场。
 * @returns {{hash: string, scrollY: number, containers: Array<{selector: string, top: number}>, savedAt: number}|null}
 *   null = 没有 / 过期 / 与本页 hash 不符 / 读失败 —— 调用方直接放弃接续
 */
export function consumeUpdateContinuity() {
  if (!canUseSessionStorage()) return null;
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  // 先删再解析：无论后面判定成不成立，这份状态都只允许被看一次
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 删不掉也不重试，下面照常判 */
  }
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (!Number.isFinite(payload.savedAt)) return null;
  if (Date.now() - payload.savedAt > MAX_AGE_MS) return null;
  // 落点必须还是同一页：用户要是切去了别处，这份位置对他毫无意义
  if (String(payload.hash || '') !== readHash()) return null;
  return {
    hash: String(payload.hash || ''),
    scrollY: Math.max(0, Number(payload.scrollY) || 0),
    containers: Array.isArray(payload.containers) ? payload.containers : [],
    savedAt: payload.savedAt,
  };
}

/**
 * 恢复窗口/容器滚动。
 *
 * 真正难的不是「调一次 scrollTo」，是**时序上有三个对手**（2026-11-23 实测得出）：
 *   ① **路由的 scrollBehavior**：`router/index.ts` 对跨路由恒返回
 *      `{ top: 0, behavior: 'auto' }`，而它在挂载之后才跑 —— 我们刚滚下去，
 *      随即被它按回顶部（探针实测「切换前 600px → 切换后 0px」的真因之一）。
 *   ② **内容分批到达**：首屏渲染完 `documentElement.scrollHeight` 只有一屏高
 *      （实测 800），真实内容随后分几批到（800 → 1093 → 3144）。在 800 的时候
 *      滚到 600 会被浏览器直接钳到 0。
 *   ③ 浏览器自带的 `history.scrollRestoration` 也在抢同一个位置。
 *
 * 所以策略是「**持续看守**」而不是「一次落位」：
 *   · 用 ResizeObserver 盯文档高度，每长一次就重试落位（比纯轮询快）；
 *   · 每帧核一次实际 scrollY，**被按回去就再滚回去**；
 *   · 连续若干帧稳定后才收工 —— 一次成功不代表路由守卫不会再动。
 * 这比「等固定时长后滚一次」可靠：不依赖猜内容什么时候加载完。
 *
 * @param {{scrollY: number, containers: Array<{selector: string, top: number}>}} state
 */
export function restoreUpdateContinuity(state) {
  if (!state || typeof window === 'undefined') return;
  const deadline = performance.now() + RESTORE_DEADLINE_MS;

  // 关掉浏览器自带的滚动恢复（对手 ③）
  try {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  } catch {
    /* 老浏览器没有这个属性，忽略 */
  }

  const containersDone = new Set();

  const applyContainers = () => {
    state.containers.forEach((item) => {
      if (containersDone.has(item.selector)) return;
      const el = document.querySelector(item.selector);
      if (!el) return;
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxTop < item.top) return; // 内容还不够长，等它长
      el.scrollTop = Math.min(item.top, maxTop);
      containersDone.add(item.selector);
    });
  };

  /** 文档是否已经长到能容纳目标位置（对手 ② 的判据） */
  const docCanHold = () =>
    document.documentElement.scrollHeight - window.innerHeight >= state.scrollY;

  let settleFrames = 0; // 连续多少帧已经停在目标位置
  let raf = 0;
  let observer = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    try {
      observer?.disconnect();
    } catch {
      /* 已经断开了 */
    }
    observer = null;
  };

  const tick = () => {
    raf = 0;
    if (stopped) return;
    applyContainers();
    const over = performance.now() > deadline;
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    if (docCanHold()) {
      const want = Math.min(state.scrollY, maxY);
      // 对手 ①：路由守卫可能刚把我们按回 0，这里逐帧校正
      if (Math.abs(window.scrollY - want) > 2) {
        window.scrollTo({ top: want, behavior: 'auto' });
        settleFrames = 0;
      } else {
        settleFrames += 1;
        /* 连续 30 帧（约 0.5s）稳定 ⇒ 收工，交还给用户。
           为什么不是「落位成功就停」：路由的 scrollBehavior 可能比我们晚一拍，
           单帧成功不代表它不会再动。 */
        if (settleFrames >= 30) {
          stop();
          return;
        }
      }
    } else if (over) {
      // 到点内容仍不够长：落到当前最大值，交还页面（宁可少滚一点也不要卡住）
      if (maxY > 0) window.scrollTo({ top: Math.min(state.scrollY, maxY), behavior: 'auto' });
      stop();
      return;
    }

    if (over) {
      stop();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  // 文档高度每长一次就重试（分批到达的内容靠这个立刻被接住，比 rAF 逐帧问快）
  if (typeof ResizeObserver === 'function') {
    try {
      observer = new ResizeObserver(() => {
        if (!raf && !stopped) raf = requestAnimationFrame(tick);
      });
      observer.observe(document.documentElement);
    } catch {
      /* 老浏览器没有 ResizeObserver，退回纯 rAF 轮询 */
    }
  }

  raf = requestAnimationFrame(tick);
}

/**
 * 启动时的统一入口：读现场 → 有就恢复。
 * 调用点固定在 main.js（router.isReady 之后），不要在别处再加一份。
 * @returns {boolean} 是否确实发起了接续（供日志/探针断言）
 */
export function resumeUpdateContinuity() {
  const state = consumeUpdateContinuity();
  if (!state) return false;
  restoreUpdateContinuity(state);
  return true;
}

/** 仅供测试清理。 */
export function __clearUpdateContinuity() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}
