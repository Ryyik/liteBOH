/**
 * 后台列表的滚动位置记忆（plans/049 期 3，2026-11-25）
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 整页化之后，「列表 → 对象页 → 回列表」变成一次**真实的路由往返**。
 * `App.vue` 用 `:key="activeRoute.path"` 渲染路由组件（见 routes/admin.ts:23 的注释），
 * 所以 path 一变实例就重建：筛选和页码靠 URL 即状态能恢复，
 * **滚动位置不能**——回去的永远是列表顶部。
 *
 * 抽屉时代不存在这个问题：抽屉盖在列表上、关掉后列表原地不动。
 * 用户报的口径是「一页一个完整页面」，那就要接受路由往返，并把这个代价补上。
 *
 * 后台「连续改 10 条」是高频动作：不补的话，从 0 次跳转变成 20 次跳转，
 * 每次都回到顶部、重新往下翻 —— 整页化会让人觉得更慢，进而被要求改回抽屉。
 *
 * ── 三条口径（改这里之前先想清楚）────────────────────────────────────
 * 1. **只在列表 ↔ 对象页之间记**：列表到别的 tab、到概览，都该从顶部开始。
 * 2. **按 tab 记，不按 fullPath 记**：`?tab=users&page=2` 与 `?tab=users&status=banned`
 *    在用户心里是同一个列表的不同筛选；按 fullPath 记会让「换了个筛选再回来」
 *    拿到上一个筛选的滚动位置（落在半山腰，看着像跳到了随机位置）。
 * 3. **只存数字、不碰 DOM**：捕获点在组件卸载前，读点在新实例的 onMounted。
 *
 * ── 与前台 `route-scroll-memory.js` 的区别 ──────────────────────────
 * 那个记的是 `window.scrollY`、只对 keepAlive 路由生效。后台列表的滚动在
 * **内容容器**上（页面整体也滚，但表格横向/纵向容器是独立的），
 * 且后台路由不是 keepAlive。所以不复用那个模块，另建一个只做数字存取的小模块。
 */

const MAX_ENTRIES = 16;

/** tabId → scrollTop（Map 的插入序即 LRU 序） */
const memory = new Map();

/**
 * 记下某个列表 tab 离开时的滚动位置。
 * @param {string} tabId 页签 id（如 'users'）
 * @param {number} scrollTop 捕获时刻的容器 scrollTop
 */
export const rememberListScroll = (tabId, scrollTop) => {
  const key = String(tabId || '');
  if (!key) return;
  const value = Number(scrollTop);
  if (!Number.isFinite(value) || value <= 0) {
    // 0 不记：回到顶部本来就不需要记忆，记 0 只是白占一个 LRU 位
    memory.delete(key);
    return;
  }
  memory.delete(key);
  memory.set(key, Math.round(value));
  if (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    memory.delete(oldest);
  }
};

/**
 * 取某个列表 tab 上次离开时的滚动位置。
 * @param {string} tabId
 * @returns {number|undefined} 没记过时返回 undefined（调用方不要动滚动）
 */
export const recallListScroll = (tabId) => {
  return memory.get(String(tabId || ''));
};

/** 消费式读取：取完就删。用于「恢复一次」的语义，避免下次误用旧位置。 */
export const consumeListScroll = (tabId) => {
  const key = String(tabId || '');
  const value = memory.get(key);
  if (value !== undefined) memory.delete(key);
  return value;
};

/** 仅供测试 / 换账号时清空。 */
export const clearListScrollMemory = () => memory.clear();

/** 仅供测试：看当前存了哪几条（断言用）。 */
export const listScrollMemorySize = () => memory.size;
