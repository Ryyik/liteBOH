/**
 * 空间动效的时长与降级判据 —— 单一真源（plans/035 §4 L0 / L4）
 *
 * 三条纪律：
 *  ① **毫秒数只声明在 CSS**（`tokens.css` 的 `--motion-*`），本文件只负责「读」。
 *     在 JS 里再写一份常量，后果是改 CSS 不生效、探针读到的和实际跑的不是一个数
 *     （与 `useAutoGrowTextarea`「上限只声明在 CSS 的 max-height」同一条纪律）。
 *  ② **降级判据只有两个真源**：系统偏好（`prefers-reduced-motion`）与性能档
 *     （`html.boh-perf-lite`，由 `utils/performance-profile.js` 挂上）。
 *     不要在这里再算 `hardwareConcurrency` —— 那会把判据变成两套。
 *  ③ 所有函数在无 `window` / 无 `document` 环境下返回安全值、不抛错：
 *     详情页挂在 `Suspense` 里，首帧可能早于样式表就绪。
 *
 * 为什么严格按高度算时长（L4 的第一条实测结论）：
 *   旧实现把展开目标写成 `max-height: 1200px` 固定 0.34s。max-height 一到内容高度
 *   就停下了，于是**短评 37ms 走完、长评 313ms** —— 同一种交互长出两种手感。
 *   这里把「内容高度 → 时长」写成纯函数，才可能被单测锁住。
 */

/** CSS 变量读不到时的兜底（构建期样式缺失才会走到，生产不会） */
const DEFAULT_MS = 300;
/** reduce-motion 下的上限：只留可感知的淡入，与 animations.css 的全局 100ms 同量级 */
const REDUCED_CAP = 110;
/** 低端设备档（boh-perf-lite）下的上限：保留位移，砍掉长距离形变 */
const LITE_CAP = 180;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** 系统是否要求减弱动效。 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 是否命中低端设备档（`html.boh-perf-lite`，见 utils/performance-profile.js）。 */
export function isLitePerf() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('boh-perf-lite');
}

/**
 * 把任意时长压到当前环境允许的上限。
 * 消费方自己算出"理想时长"后过一道这个函数，而不是各写一遍 if (reduce) ...
 */
export function capMotion(ms) {
  const value = Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : DEFAULT_MS;
  if (prefersReducedMotion()) return Math.min(REDUCED_CAP, value);
  if (isLitePerf()) return Math.min(LITE_CAP, value);
  return value;
}

/** `'640ms'` / `'0.64s'` → 640；解析不出来返回 null（调用方决定兜底）。 */
function parseCssTime(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const asMs = /^([\d.]+)ms$/.exec(value);
  if (asMs) {
    const n = Number.parseFloat(asMs[1]);
    return Number.isFinite(n) ? n : null;
  }
  const asS = /^([\d.]+)s$/.exec(value);
  if (asS) {
    const n = Number.parseFloat(asS[1]);
    return Number.isFinite(n) ? n * 1000 : null;
  }
  return null;
}

/**
 * 读 `tokens.css` 里的 `--motion-*` 并把 reduce / lite 的降级一并算上。
 * @param {string} name CSS 变量名，如 `'--motion-morph-in'`
 * @param {number} fallback 变量读不到时的兜底毫秒数
 */
export function motionMs(name, fallback = DEFAULT_MS) {
  if (typeof document === 'undefined') return capMotion(fallback);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = parseCssTime(raw);
  return capMotion(parsed === null ? fallback : parsed);
}

/**
 * 读 `tokens.css` 里的缓动曲线（`--ease-*` / `--ease-morph`）。
 * 曲线和时长一样只声明在 CSS：`animateMorph` 的 easing 参数若在 JS 里再写一份，
 * 改 CSS 就只改到一半（论坛与 UserSpace 各拿一条不同曲线的老账就是这么来的）。
 */
export function motionEase(name, fallback = 'ease') {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = String(raw || '').trim();
  return value || fallback;
}

/**
 * 评论区展开时长：内容越高走得越久（局部块 200–460ms 档，标准速）。
 * 公式 `130 + h × 0.36`：120px 的短评 ≈ 200ms（下沿封顶），900px 的长评 ≈ 454ms。
 */
export function expandDuration(heightPx) {
  const h = Math.max(0, Number(heightPx) || 0);
  return Math.round(capMotion(clamp(130 + h * 0.36, 200, 460)));
}

/**
 * 评论区收起时长：比展开快 25%（关闭不耐等），且从**当前高度**出发，
 * 不再从 1200px 往下掉（那会让前 60% 时间肉眼看不出在动）。
 */
export function collapseDuration(heightPx) {
  const h = Math.max(0, Number(heightPx) || 0);
  return Math.round(capMotion(clamp(100 + h * 0.24, 150, 320)));
}
