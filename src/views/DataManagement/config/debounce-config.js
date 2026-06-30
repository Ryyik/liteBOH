/**
 * DataAdmin debounce 配置常量
 * 
 * P2 优化: 统一管理所有 debounce 时间，避免分散定义
 * 不同场景需要不同的响应速度:
 *   - 搜索输入: 较短延迟（快速响应）
 *   - 用户选择器: 较短延迟
 *   - 草稿保存: 较长延迟（减少写入频率）
 */

// 搜索 debounce: 300ms - 快速响应但避免频繁查询
export const SEARCH_DEBOUNCE_MS = 300;

// 用户选择器 debounce: 300ms - 快速响应用户搜索
export const USER_PICKER_DEBOUNCE_MS = 300;

// 草稿自动保存 debounce: 800ms - 减少写入频率，给用户完成输入的时间
export const DRAFT_SAVE_DEBOUNCE_MS = 800;

// 全局搜索 debounce: 500ms - 稍长延迟，避免跨表查询压力
export const GLOBAL_SEARCH_DEBOUNCE_MS = 500;

// 高级筛选 debounce: 400ms - 中等延迟，平衡响应速度和查询压力
export const ADVANCED_FILTER_DEBOUNCE_MS = 400;

// 列宽调整 debounce: 200ms - 快速响应用户拖拽
export const COLUMN_RESIZE_DEBOUNCE_MS = 200;

/**
 * 创建 debounce 函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（ms）
 * @returns {Function} - 防抖后的函数
 */
export const createDebounce = (fn, delay) => {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
};

/**
 * 创建带立即执行选项的 debounce 函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（ms）
 * @param {boolean} immediate - 是否在第一次调用时立即执行
 * @returns {Function} - 防抖后的函数
 */
export const createDebounceWithImmediate = (fn, delay, immediate = false) => {
  let timeoutId = null;
  let callCount = 0;
  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (immediate && callCount === 0) {
      fn(...args);
      callCount++;
    }
    timeoutId = setTimeout(() => {
      if (!immediate || callCount > 0) {
        fn(...args);
      }
      timeoutId = null;
      callCount = 0;
    }, delay);
  };
};