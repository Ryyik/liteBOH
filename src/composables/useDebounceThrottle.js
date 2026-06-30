import { onUnmounted, ref } from 'vue';

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
    flush
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
    flush
  };
};

/**
 * 高级防抖函数 - 支持立即执行选项（与 lodash 兼容）
 *
 * @template T
 * @param {T} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {{ leading?: boolean, trailing?: boolean, maxWait?: number }} options - 配置选项
 * @returns {{ debouncedFn: T, cancel: () => void, flush: () => void, pending: () => boolean }}
 *
 * @example
 * // 立即执行模式（首次调用立即执行，后续调用防抖）
 * const { debouncedFn } = useDebounceWithCallback(
 *   (value) => console.log('立即执行:', value),
 *   300,
 *   { leading: true, trailing: false }
 * );
 *
 * // 混合模式（首次立即执行，最后一次也执行）
 * const { debouncedFn } = useDebounceWithCallback(
 *   (value) => console.log('混合模式:', value),
 *   300,
 *   { leading: true, trailing: true }
 * );
 *
 * // 带最大等待时间
 * const { debouncedFn } = useDebounceWithCallback(
 *   (value) => console.log('带最大等待:', value),
 *   300,
 *   { maxWait: 1000 }
 * );
 */
export const useDebounceWithCallback = (fn, delay, options = {}) => {
  const {
    leading = false,
    trailing = true,
    maxWait = undefined
  } = options;

  /** @type {any} */
  let timeoutId = null;
  let maxTimeoutId = null;
  let lastArgs = null;
  let lastCallTime = 0;
  let result = undefined;

  const pending = () => timeoutId !== null || maxTimeoutId !== null;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (maxTimeoutId !== null) {
      clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
    lastArgs = null;
    lastCallTime = 0;
  };

  const flush = () => {
    if (timeoutId !== null && lastArgs !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      result = fn(...lastArgs);
      lastArgs = null;
    }
    return result;
  };

  const invokeFunc = (time) => {
    const args = lastArgs;
    lastArgs = null;
    lastCallTime = time;
    result = fn(...args);
    return result;
  };

  const shouldInvoke = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    return (lastCallTime === 0 || timeSinceLastCall >= delay);
  };

  const startTimer = (pendingFunc, wait) => {
    return setTimeout(pendingFunc, wait);
  };

  const remainingWait = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    const remainingDelay = delay - timeSinceLastCall;
    return remainingDelay;
  };

  const timerExpired = () => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      if (trailing && lastArgs !== null) {
        return invokeFunc(time);
      }
      cancel();
    } else {
      timeoutId = startTimer(timerExpired, remainingWait(time));
    }
  };

  const maxTimeoutExpired = () => {
    if (trailing && lastArgs !== null) {
      return invokeFunc(Date.now());
    }
    cancel();
  };

  const debouncedFn = (...args) => {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === null) {
        if (leading) {
          result = invokeFunc(time);
        }
        timeoutId = startTimer(timerExpired, delay);

        if (maxWait !== undefined && maxTimeoutId === null) {
          maxTimeoutId = startTimer(maxTimeoutExpired, maxWait);
        }
      }
    } else {
      if (timeoutId === null) {
        timeoutId = startTimer(timerExpired, remainingWait(time));
      }

      if (maxWait !== undefined && maxTimeoutId === null) {
        maxTimeoutId = startTimer(maxTimeoutExpired, maxWait);
      }
    }

    if (trailing && !isInvoking && lastArgs !== null) {
      lastArgs = args;
    }

    return result;
  };

  onUnmounted(cancel);

  return {
    debouncedFn,
    cancel,
    flush,
    pending
  };
};

/**
 * 高级节流函数 - 支持 leading/trailing 选项（与 lodash 兼容）
 *
 * @template T
 * @param {T} fn - 要节流的函数
 * @param {number} limit - 限制时间（毫秒）
 * @param {{ leading?: boolean, trailing?: boolean }} options - 配置选项
 * @returns {{ throttledFn: T, cancel: () => void, flush: () => void, pending: () => boolean }}
 *
 * @example
 * // 标准 leading 模式（首次立即执行）
 * const { throttledFn } = useThrottleWithCallback(
 *   (value) => console.log('leading:', value),
 *   200,
 *   { leading: true, trailing: false }
 * );
 *
 * // trailing 模式（延迟执行最后一次调用）
 * const { throttledFn } = useThrottleWithCallback(
 *   (value) => console.log('trailing:', value),
 *   200,
 *   { leading: false, trailing: true }
 * );
 *
 * // 默认模式（首次立即执行，节流期间最后一次调用也会执行）
 * const { throttledFn } = useThrottleWithCallback(
 *   (value) => console.log('default:', value),
 *   200
 * );
 */
export const useThrottleWithCallback = (fn, limit, options = {}) => {
  const {
    leading = true,
    trailing = true
  } = options;

  /** @type {any} */
  let timeoutId = null;
  let lastArgs = null;
  let lastThis = null;
  let result = undefined;
  let lastCallTime = 0;

  const pending = () => timeoutId !== null;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    lastThis = null;
    lastCallTime = 0;
  };

  const flush = () => {
    if (timeoutId !== null && lastArgs !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      result = fn.apply(lastThis, lastArgs);
      lastArgs = null;
      lastThis = null;
    }
    return result;
  };

  const invokeFunc = (time) => {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = null;
    lastThis = null;
    lastCallTime = time;
    result = fn.apply(thisArg, args);
    return result;
  };

  const startTimer = (pendingFunc, wait) => {
    return setTimeout(pendingFunc, wait);
  };

  const remainingWait = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    return limit - timeSinceLastCall;
  };

  const shouldInvoke = (time) => {
    const timeSinceLastCall = time - lastCallTime;
    return timeSinceLastCall >= limit;
  };

  const timerExpired = () => {
    const time = Date.now();
    if (lastArgs !== null) {
      if (shouldInvoke(time)) {
        if (trailing) {
          return invokeFunc(time);
        }
      } else {
        timeoutId = startTimer(timerExpired, remainingWait(time));
      }
    }

    if (!trailing && lastArgs === null) {
      cancel();
    }
  };

  const throttledFn = (...args) => {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;

    if (isInvoking) {
      if (timeoutId === null && leading) {
        lastCallTime = time;
        result = invokeFunc(time);
      } else if (timeoutId === null) {
        timeoutId = startTimer(timerExpired, remainingWait(time));
      }
    }

    if (trailing && timeoutId === null) {
      timeoutId = startTimer(timerExpired, remainingWait(time));
    }

    return result;
  };

  onUnmounted(cancel);

  return {
    throttledFn,
    cancel,
    flush,
    pending
  };
};

/**
 * 组合导出示例
 * @example
 * // 在 Vue 组件中使用
 * import { useDebounce, useThrottle, useDebounceWithCallback, useThrottleWithCallback } from '@/composables/useDebounceThrottle';
 *
 * export default {
 *   setup() {
 *     // 简单防抖
 *     const { debouncedFn: handleSearch } = useDebounce((query) => {
 *       fetchSearchResults(query);
 *     }, 300);
 *
 *     // 简单节流
 *     const { throttledFn: handleScroll } = useThrottle(() => {
 *       updateScrollPosition();
 *     }, 200);
 *
 *     // 高级防抖（立即执行）
 *     const { debouncedFn: handleSubmit } = useDebounceWithCallback(
 *       (data) => saveData(data),
 *       500,
 *       { leading: true, trailing: false }
 *     );
 *
 *     // 高级节流
 *     const { throttledFn: handleResize } = useThrottleWithCallback(
 *       () => recalculateLayout(),
 *       100,
 *       { leading: true, trailing: true }
 *     );
 *
 *     return {
 *       handleSearch,
 *       handleScroll,
 *       handleSubmit,
 *       handleResize
 *     };
 *   }
 * };
 */