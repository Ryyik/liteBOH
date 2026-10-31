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
  origins.set(safeKey, {
    rect: { ...rect, radius: Math.max(0, Number(radius) || 0) },
    el,
    at: Date.now(),
    vw: typeof window === 'undefined' ? 0 : window.innerWidth,
    vh: typeof window === 'undefined' ? 0 : window.innerHeight,
  });
  return origins.get(safeKey).rect;
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
  if (!entry && matchPrefix) {
    for (const [storedKey, candidate] of origins) {
      if (!storedKey.startsWith(safeKey)) continue;
      if (!entry || candidate.at > entry.at) entry = candidate;
    }
  }
  if (!entry) return null;
  if (Date.now() - entry.at > maxAge) {
    origins.delete(safeKey);
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

/** 测试与调试用：清空全部。 */
export function resetOrigins() {
  origins.clear();
}

/**
 * 计算「从 source 落到 target」的 FLIP 变换。
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
  { duration = 480, easing = 'cubic-bezier(0.32, 0.72, 0, 1)', fill = 'both' } = {},
) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve(false);
  try {
    const animation = el.animate(keyframes, { duration, easing, fill });
    return animation.finished
      .then(() => {
        // fill:'both' 会把手写的终态留在元素上，取消后才回到「没有 animation」的干净态
        animation.cancel();
        return true;
      })
      .catch(() => {
        animation.cancel();
        return false;
      });
  } catch {
    return Promise.resolve(false);
  }
}

/** 元素是否处于可见状态（用于返回时判断目标卡片还在不在视野里）。 */
export function isRectVisible(rect, margin = 0) {
  if (!rect || typeof window === 'undefined') return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    rect.bottom > -margin &&
    rect.top < vh + margin &&
    rect.right > -margin &&
    rect.left < vw + margin
  );
}
