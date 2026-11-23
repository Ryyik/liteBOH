import { onUnmounted } from 'vue';

/**
 * 防抖函数 - 带自动清理的防抖实现
 *
 * @template T
 * @param {T} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {{ debouncedFn: T, cancel: () => void, flush: () => void }}
 *
 * @example
 * const { debouncedFn } = useDebounce((value) => {
 *   console.log('搜索:', value);
 * }, 300);
 *
 * debouncedFn('test'); // 300ms 后执行
 * debouncedFn('test2'); // 取消上一次，重新计时
 */
export const useDebounce = (fn, delay) => {
  /** @type {any} */
  let timeoutId = null;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const flush = () => {
    if (timeoutId !== null) {
      const context = this;
      clearTimeout(timeoutId);
      timeoutId = null;
      fn.call(context);
    }
  };

  const debouncedFn = (...args) => {
    cancel();
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };

  onUnmounted(cancel);

  return {
    debouncedFn,
    cancel,
    flush,
  };
};

/**
 * 节流函数 - 带自动清理的节流实现
 *
 * @template T
 * @param {T} fn - 要节流的函数
 * @param {number} limit - 限制时间（毫秒）
 * @returns {{ throttledFn: T, cancel: () => void, flush: () => void }}
 *
 * @example
 * const { throttledFn } = useThrottle(() => {
 *   console.log('滚动事件');
 * }, 200);
 *
 * window.addEventListener('scroll', throttledFn);
 */
export const useThrottle = (fn, limit) => {
  /** @type {any} */
  let timeoutId = null;
  let lastArgs = null;
  let inThrottle = false;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    inThrottle = false;
    lastArgs = null;
  };

  const flush = () => {
    if (timeoutId !== null && lastArgs !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  const throttledFn = (...args) => {
    lastArgs = args;

    if (!inThrottle) {
      inThrottle = true;
      fn(...args);

      timeoutId = setTimeout(() => {
        inThrottle = false;
        timeoutId = null;

        // 如果在节流期间有新的调用，最后执行一次
        if (lastArgs !== null && lastArgs !== args) {
          fn(...lastArgs);
        }
        lastArgs = null;
      }, limit);
    }
  };

  onUnmounted(cancel);

  return {
    throttledFn,
    cancel,
    flush,
  };
};
