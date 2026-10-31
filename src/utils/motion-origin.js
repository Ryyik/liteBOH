/**
 * 「从哪来、回哪去」的来源矩形（origin）采集与消费 —— plans/035 §L1
 *
 * 存在的原因：所有「从触发点展开」的动效都需要一个 source rect，而 Vue 的
 * shared-element / `<Transition>` 在本仓库都用不了（App.vue 没有路由级过渡，
 * 实测类名从未被加上）。所以只能自己采、自己取、自己算 FLIP。
 *
 * 三条纪律：
 *  ① **消费方必须按 key 取，且 key 里带身份**（帖子 id / 图片 url）。否则
 *     「点了 A 卡却从 B 卡的位置展开」这种错位没有任何报错，只有肉眼能看出。
 *  ② **矩形优先从活着的元素现量**（`peekOrigin` 内部 `getBoundingClientRect`），
 *     存的快照只作兜底。列表滚动/虚拟窗口重挂载后，快照就是旧位置。
 *  ③ **拿不到就返回 null，调用方必须降级为淡入**。绝不「估算一个大概位置」——
 *     错位的形变比没有形变更让人难受。
 */

import { prefersReducedMotion } from './motion.js';

/** 超过这个时长的来源视为失效（与 utils/forum-return-state.js 的 TTL 同口径） */
const ORIGIN_TTL = 30 * 60 * 1000;
/** 视口尺寸变化超过这个比例视为失效（旋屏 / 分屏拖拽后，旧 rect 已无意义） */
const VIEWPORT_TOLERANCE = 0.2;

/** key -> { rect, el, at, vw, vh } */
const origins = new Map();

/**
 * 条目上限。每条 entry 都持有触发元素的引用（`peekOrigin` 要现量位置），
 * 一旦某条路径只 peek 不 clear（横屏弹窗、reduce-motion、两个图片查看器都是），
 * 这个 Map 就会随使用一直长 —— 桌面浏览几十篇就是几十棵卸载后的卡片子树被留住。
 * 所以给一个硬上限 + 采集时顺手淘汰。
 */
const ORIGIN_MAX_ENTRIES = 40;

/** 采集时顺手清理：过期条目先删，再把「元素已卸载」条目里那份 DOM 引用摘掉。 */
function pruneOrigins(now = Date.now()) {
  for (const [key, entry] of origins) {
    if (now - entry.at > ORIGIN_TTL) {
      origins.delete(key);
      continue;
    }
    // 元素一旦脱离文档就再也不可能被「现量」了，peek 会退回存下来的 rect；
    // 与其留着一棵卸载子树，不如把引用摘掉 —— 行为完全等价，只是不再持有内存。
    if (entry.el && entry.el.isConnected === false) entry.el = null;
  }
  if (origins.size <= ORIGIN_MAX_ENTRIES) return;
  // 超限按采集时间从旧到新淘汰（Map 的插入序不保证＝时间序，重采同 key 不会前移）
  const byAge = [...origins.entries()].sort((a, b) => a[1].at - b[1].at);
  for (let i = 0; i < byAge.length - ORIGIN_MAX_ENTRIES; i += 1) {
    origins.delete(byAge[i][0]);
  }
}

const isNum = (value) => Number.isFinite(Number(value));

/** 元素当前是否还能量（在文档里、有尺寸）。 */
function isMeasurable(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  if (el.isConnected === false) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0.5 && rect.height > 0.5;
}

/** 把 DOMRect 归一成纯对象（DOMRect 会被结构化克隆，但不便于比较与持久化）。 */
export function normalizeRect(rect) {
  if (!rect || !isNum(rect.left) || !isNum(rect.top)) return null;
  const width = Math.max(0, Number(rect.width || 0));
  const height = Math.max(0, Number(rect.height || 0));
  if (width < 1 || height < 1) return null;
  return {
    left: Number(rect.left),
    top: Number(rect.top),
    width,
    height,
    right: Number(rect.left) + width,
    bottom: Number(rect.top) + height,
    cx: Number(rect.left) + width / 2,
    cy: Number(rect.top) + height / 2,
  };
}

/**
 * 采集一个来源矩形。
 * @param {string} key 必须带身份（如 `forum-image:${url}`、`post-detail:${postId}`）
 * @param {Element} el 触发元素
 * @param {{ radius?: number }} [options] 额外记录圆角，形变时用于反算
 * @returns {object|null} 归一后的矩形
 */
export function captureOrigin(key, el, { radius = 0 } = {}) {
  const safeKey = String(key || '').trim();
  if (!safeKey || !isMeasurable(el)) return null;
  const rect = normalizeRect(el.getBoundingClientRect());
  if (!rect) return null;
  const entry = {
    rect: { ...rect, radius: Math.max(0, Number(radius) || 0) },
    el,
    at: Date.now(),
    vw: typeof window === 'undefined' ? 0 : window.innerWidth,
    vh: typeof window === 'undefined' ? 0 : window.innerHeight,
  };
  origins.set(safeKey, entry);
  // ⚠️ 必须**写在 set 之后**：放前面时判的是「插入前」的 size，稳态会停在上限 +1
  // （40 上限实测留下 41 条，是 2026-10-31 单测抓到的）。
  pruneOrigins();
  // 直接返回本地这份，不回查 Map —— 极端情况下它可能刚被淘汰掉
  return entry.rect;
}

/**
 * 取一个仍然有效的来源矩形。
 * @param {string} key
 * @param {{ maxAge?: number, matchPrefix?: boolean }} [options]
 *        `matchPrefix`：key 精确取不到时，按前缀找最近采集的一条
 *        （图片查看器用得上——关闭时当前图片可能已翻页，url 变了但仍在同一帖）
 */
export function peekOrigin(key, { maxAge = ORIGIN_TTL, matchPrefix = false } = {}) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  let entry = origins.get(safeKey);
  let matchedKey = entry ? safeKey : '';
  if (!entry && matchPrefix) {
    for (const [storedKey, candidate] of origins) {
      if (!storedKey.startsWith(safeKey)) continue;
      if (!entry || candidate.at > entry.at) {
        entry = candidate;
        matchedKey = storedKey;
      }
    }
  }
  if (!entry) return null;
  if (Date.now() - entry.at > maxAge) {
    // 前缀命中时命中项挂在**另一个 key** 上，删 safeKey 是空删 —— 过期条目会永远留着。
    origins.delete(matchedKey || safeKey);
    return null;
  }
  if (typeof window !== 'undefined' && entry.vw && entry.vh) {
    const dw = Math.abs(window.innerWidth - entry.vw) / Math.max(1, entry.vw);
    const dh = Math.abs(window.innerHeight - entry.vh) / Math.max(1, entry.vh);
    if (dw > VIEWPORT_TOLERANCE || dh > VIEWPORT_TOLERANCE) return null;
  }
  // 元素还活着就现量：快照在滚动、虚拟窗口重挂载后就是旧位置
  if (isMeasurable(entry.el)) {
    const live = normalizeRect(entry.el.getBoundingClientRect());
    if (live) return { ...live, radius: entry.rect.radius || 0 };
  }
  return entry.rect;
}

/** 消费后清理（返回时用完即删，避免同一 origin 被下一次导航复用）。 */
export function clearOrigin(key) {
  origins.delete(String(key || '').trim());
}

/**
 * 计算「窗口从 source 长到 target」的 clip-path 起点（2026-10-31，iOS 口径）。
 *
 * 为什么不再用 FLIP 缩放（`flipFromRect`）：
 *   卡片 `370×104` 拉成 `390×800` 时 `sx≈0.95 / sy≈0.13`，动画中途出现的是一块
 *   **又扁又长的矩形** —— 既不是卡片也不是页面，观感是「橡皮筋扯长」。
 *   iOS 打开 App 从来不做这种非等比变形：内容一直是最终尺寸，变的只是一个从
 *   图标位置长到全屏的**裁剪窗口**。所以这里算的是 `inset()` 四边，不是 scale。
 *
 * 附带三个好处：
 *   ① 内容不参与缩放 ⇒ 文字不会在途中被压扁/糊掉；
 *   ② 不再需要 `flipRadius` 的圆角反算（`round` 直接写卡片的圆角）；
 *   ③ 退场窗口收回卡片大小就自然露出卡片，不需要额外的「落点提示」。
 *
 * @param {{left:number,top:number,width:number,height:number}} source 入口卡片矩形（视口坐标）
 * @param {{left:number,top:number,width:number,height:number}} target 目标元素矩形（视口坐标）
 * @param {{radius?:number}} [options] 起点圆角（用卡片自身的圆角，不是反算值）
 * @returns {{top:number,right:number,bottom:number,left:number,radius:number,value:string}|null}
 *          四边都贴到 0（源覆盖了整个目标）时返回 null —— 调用方降级为淡入
 */
export function insetFromRect(source, target, { radius = 0 } = {}) {
  if (!source || !target) return null;
  const sw = Number(source.width) || 0;
  const sh = Number(source.height) || 0;
  const tw = Number(target.width) || 0;
  const th = Number(target.height) || 0;
  if (sw < 1 || sh < 1 || tw < 1 || th < 1) return null;

  const sLeft = Number(source.left) || 0;
  const sTop = Number(source.top) || 0;
  const tLeft = Number(target.left) || 0;
  const tTop = Number(target.top) || 0;
  // 源可能有一部分落在目标外面（横屏弹窗居中、卡片在左栏外侧），负数一律夹到 0，
  // 让窗口贴着目标边缘展开 —— 不夹会算出非法 inset（负值等于放大）。
  const top = Math.max(0, sTop - tTop);
  const left = Math.max(0, sLeft - tLeft);
  const right = Math.max(0, tLeft + tw - (sLeft + sw));
  const bottom = Math.max(0, tTop + th - (sTop + sh));
  // 四边都贴边＝源已经盖满目标，没有任何「展开」可演
  if (top < 2 && right < 2 && bottom < 2 && left < 2) return null;

  const r = Math.max(0, Number(radius) || 0);
  return {
    top,
    right,
    bottom,
    left,
    radius: r,
    value: `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px round ${r.toFixed(2)}px)`,
  };
}

/**
 * 窗口「完全打开」的终点值。横屏面板自身有 24px 圆角，终点不能写死 0 ——
 * 否则窗口在最后一帧把面板的圆角削成直角，会有一帧可见的跳变。
 * @param {number} [radius]
 */
export function insetOpen(radius = 0) {
  const r = Math.max(0, Number(radius) || 0);
  return `inset(0px 0px 0px 0px round ${r.toFixed(2)}px)`;
}

/**
 * 计算「从 source 落到 target」的 FLIP 变换。
 *
 * ⚠️ 2026-10-31 起**详情页/弹窗不再用它**（改用上面的 `insetFromRect` 窗口展开）。
 * 仍在使用的是两个图片查看器：缩略图 → 大图是等比的小范围放大，没有「非等比
 * 拉扯」问题，FLIP 在那里是对的。
 *
 * `transform-origin` 必须是 `0 0`：写成 `50% 50%` 时 `translate` 与 `scale`
 * 的组合会额外偏移 `(source.width - target.width) / 2`，起点对不上卡片。
 *
 * @param {{left:number,top:number,width:number,height:number}} source
 * @param {{left:number,top:number,width:number,height:number}} target
 */
export function flipFromRect(source, target) {
  const sx = target.width > 0 ? source.width / target.width : 1;
  const sy = target.height > 0 ? source.height / target.height : 1;
  const dx = source.left - target.left;
  const dy = source.top - target.top;
  return {
    sx,
    sy,
    dx,
    dy,
    transformOrigin: '0 0',
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
  };
}

/**
 * 非等比缩放下圆角的反算：视觉半径 = 声明半径 × 缩放比。
 * 用 `max(sx, sy)` 反算，起点那一帧才和来源元素「贴边重合」；用 `min` 会多出一圈。
 */
export function flipRadius(sourceRadius, sx, sy, fallback = 0) {
  const base = Math.max(0, Number(sourceRadius) || 0);
  if (!base) return Math.max(0, Number(fallback) || 0);
  const scale = Math.max(Math.abs(Number(sx) || 1), Math.abs(Number(sy) || 1));
  return scale > 0.01 ? base / scale : base;
}

/**
 * 当前环境是否允许做形变。形变＝长距离位移＋缩放，是 reduce / lite 档最该砍的一类。
 */
export function canMorph() {
  return !prefersReducedMotion();
}

/**
 * 在元素上跑一段 WAAPI 形变，返回 promise（永不 reject）。
 * `element.animate` 不存在（老 WebView）时立即完成，调用方无需分支。
 */
export function animateMorph(
  el,
  keyframes,
  { duration = 480, easing = 'cubic-bezier(0.32, 0.72, 0, 1)', fill, keepFinal = false } = {},
) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve(false);
  try {
    /* ⚠️ `keepFinal` 是给**退场**用的，必须开。
       默认收尾会 `cancel()`（为了不让 `fill: both` 把终态留在元素上）。但退场形变的终态
       是「缩到缩略图大小」，cancel 的瞬间元素就弹回原尺寸 —— 紧接着 Vue 的 leave 淡出
       才刚开始。实测：不开时关闭后第 374ms 图片宽度从 185px 跳回 390px，此时遮罩
       opacity 仍是 1.00，用户看到的就是「缩进去了，又弹回全屏，再淡出」。
       开 `keepFinal` 后改用 `fill: 'forwards'` 且不 cancel，元素带着终态留到被移除。 */
    const animation = el.animate(keyframes, {
      duration,
      easing,
      fill: fill || (keepFinal ? 'forwards' : 'both'),
    });
    return animation.finished
      .then(() => {
        // fill:'both' 会把手写的终态留在元素上，取消后才回到「没有 animation」的干净态
        if (!keepFinal) animation.cancel();
        return true;
      })
      .catch(() => {
        if (!keepFinal) animation.cancel();
        return false;
      });
  } catch {
    return Promise.resolve(false);
  }
}
