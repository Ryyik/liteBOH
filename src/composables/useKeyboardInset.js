/**
 * 键盘遮挡高度 — 全站单一实现点。
 *
 * ## 为什么需要它
 * iOS Safari 的 `100dvh` / `100vh` 只响应浏览器工具栏（地址栏）的收放，
 * **不响应软键盘**；键盘弹起时布局视口（layout viewport）高度不变，
 * 视觉视口（visual viewport）才收缩。于是 `position: fixed` 底栏、
 * `height: 100dvh` + `overflow: hidden` 的全屏面板，底部一律被键盘盖住，
 * 且因为外层不可滚，用户也无法把内容滚上来。
 *
 * 唯一可靠的判据是 `visualViewport`：
 *   inset = window.innerHeight - visualViewport.height - visualViewport.offsetTop
 * 即「键盘在布局视口中占掉的高度」。键盘未弹出时三项相等 → 0，
 * 因此该式自校准，不需要平台分支：
 *   - iOS Safari：innerHeight 不变、vv.height 收缩 → 得到键盘高度（需要抬升）
 *   - Android 默认 resizes-visual：同上（需要抬升）
 *   - Android resizes-content：innerHeight 与 vv.height 同步收缩 → 0
 *     （此时布局视口本身已收缩，dvh/vh 跟着变，本就不需要抬升）
 *
 * ## 用法
 * - CSS 侧：`var(--kb-inset, 0px)`。该变量由 `initKeyboardInset()` 在应用启动时
 *   写到 `documentElement`，沿 DOM 继承，任何组件直接消费即可，无需接线。
 * - JS 侧：`useKeyboardInset()` 拿 `isKeyboardOpen` 等响应式判据
 *   （例：键盘弹起时隐藏固定底栏）。
 *
 * ## 与 forum-viewport.js 的关系
 * 同一范式：模块级共享监听 + 引用计数，多处使用只挂一组 `visualViewport` 监听。
 * 但二者判据不同 —— forum-viewport 管「横竖屏/宽窄」，本文件管「键盘」，
 * 不要互相替代（键盘弹起会改变可视高度，但不应改变横竖屏与宽窄判据）。
 *
 * ## 阈值为什么是 120
 * 键盘高度在竖屏手机上通常 ≥ 250px，而移动 Safari 地址栏收放带来的
 * 视觉视口变化约 60px 级。取 120px 可以吃掉地址栏噪声、又不漏掉真实键盘。
 * 低于阈值的 inset 一律按 0 处理，避免地址栏动画期间容器抖动。
 */

import { computed, onMounted, onUnmounted, ref, unref } from 'vue';

/** CSS 变量名：键盘遮挡高度（px）。写在 documentElement 上，全站可继承。 */
export const KEYBOARD_INSET_VAR = '--kb-inset';

/** 判定「键盘已弹起」的阈值（px）。低于此值视为地址栏噪声，按 0 处理。 */
export const KEYBOARD_OPEN_THRESHOLD = 120;

const subscribers = new Set();
let frameId = 0;
let listening = false;
let lastValue = 0;

const hasWindow = () => typeof window !== 'undefined';

/** 读取当前键盘遮挡高度（px）。不支持 visualViewport 或键盘未弹出时返回 0。 */
const measure = () => {
  if (!hasWindow()) return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const raw = window.innerHeight - viewport.height - viewport.offsetTop;
  return raw > 0 ? Math.round(raw) : 0;
};

const flush = () => {
  frameId = 0;
  const value = measure();
  if (value === lastValue) return;
  lastValue = value;
  subscribers.forEach((fn) => {
    try {
      fn(value);
    } catch (error) {
      // 单个订阅者异常不影响其他订阅者
    }
  });
};

const scheduleFlush = () => {
  if (frameId || !hasWindow()) return;
  frameId = window.requestAnimationFrame(flush);
};

const ensureListening = () => {
  if (listening || !hasWindow()) return;
  listening = true;
  lastValue = measure();
  window.addEventListener('resize', scheduleFlush, { passive: true });
  window.addEventListener('orientationchange', scheduleFlush, { passive: true });
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', scheduleFlush, { passive: true });
  viewport?.addEventListener('scroll', scheduleFlush, { passive: true });
};

const teardownIfIdle = () => {
  if (!listening || subscribers.size > 0 || !hasWindow()) return;
  listening = false;
  window.removeEventListener('resize', scheduleFlush);
  window.removeEventListener('orientationchange', scheduleFlush);
  const viewport = window.visualViewport;
  viewport?.removeEventListener('resize', scheduleFlush);
  viewport?.removeEventListener('scroll', scheduleFlush);
};

/** 订阅键盘遮挡高度变化，立即回调一次当前值，返回解绑函数。 */
export function onKeyboardInsetChange(fn) {
  if (typeof fn !== 'function') return () => {};
  subscribers.add(fn);
  ensureListening();
  fn(measure());
  return () => {
    subscribers.delete(fn);
    teardownIfIdle();
  };
}

/**
 * 应用启动时调用一次：把键盘遮挡高度写到 documentElement 的 `--kb-inset`。
 * 全站 CSS 用 `var(--kb-inset, 0px)` 消费，无需组件接线。
 * 返回解绑函数（正常生命周期内不需要调用）。
 */
export function initKeyboardInset() {
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  return onKeyboardInsetChange((value) => {
    if (value > KEYBOARD_OPEN_THRESHOLD) {
      root.style.setProperty(KEYBOARD_INSET_VAR, `${value}px`);
    } else {
      root.style.removeProperty(KEYBOARD_INSET_VAR);
    }
  });
}

/**
 * 组件级键盘判据。
 *
 * @param {object} [options]
 * @param {number} [options.threshold=120] 判定键盘弹起的阈值（px）。
 * @param {Element|import('vue').Ref<Element|null>|null} [options.target=null]
 *        显式传入时才写 CSS 变量（用于局部容器而非全局根）。
 * @param {string} [options.cssVar='--kb-inset'] 写入的变量名。
 * @returns {{ inset: import('vue').Ref<number>, keyboardInset: import('vue').ComputedRef<number>, isKeyboardOpen: import('vue').ComputedRef<boolean> }}
 */
export function useKeyboardInset(options = {}) {
  const {
    threshold = KEYBOARD_OPEN_THRESHOLD,
    target = null,
    cssVar = KEYBOARD_INSET_VAR,
  } = options;

  const inset = ref(0);
  const keyboardInset = computed(() => (inset.value > threshold ? inset.value : 0));
  const isKeyboardOpen = computed(() => inset.value > threshold);

  const resolveTarget = () => {
    const el = unref(target);
    if (el) return el;
    if (!target || typeof document === 'undefined') return null;
    return document.documentElement;
  };

  const writeVar = (value) => {
    const el = resolveTarget();
    if (!el) return;
    if (value > threshold) el.style.setProperty(cssVar, `${value}px`);
    else el.style.removeProperty(cssVar);
  };

  let unsubscribe = null;

  onMounted(() => {
    unsubscribe = onKeyboardInsetChange((value) => {
      inset.value = value;
      writeVar(value);
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
    unsubscribe = null;
    const el = resolveTarget();
    if (el && el.style.getPropertyValue(cssVar)) el.style.removeProperty(cssVar);
  });

  return { inset, keyboardInset, isKeyboardOpen };
}
