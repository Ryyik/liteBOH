/**
 * 论坛视口判据 — 单一权威定义点。
 *
 * 两个判据组：
 *  1. 横屏（帖子详情弹窗分流）— 与横屏左栏 CSS 断点同组（landscape + ≥1024px 宽 + ≥600px 高）：
 *     - src/views/Forum/styles/composer.css:576
 *     - src/views/Profile/style.scoped.css:3942
 *  2. 竖屏编辑器形态（发帖/编辑用全屏移动样式）— 与 composer.css 的「非横屏补集」档同组：
 *     (orientation: portrait), (max-width: 1023px), (max-height: 599px) → 显示移动编辑器区
 *     语义等价于旧手写判据 width <= 1024 && height >= width。
 *
 * JS 侧（帖子详情弹窗分流、编辑器形态切换等）一律从这里取，
 * 禁止各处再手写 matchMedia / innerWidth / innerHeight 判据。
 */

export const FORUM_LANDSCAPE_QUERY =
  '(orientation: landscape) and (min-width: 1024px) and (min-height: 600px)';

/** 窄屏（竖屏/窄窗）判据：帖子详情竖屏 Threads 式排版使用（与单列断点同组 ≤1024px）。 */
export const NARROW_DETAIL_QUERY = '(max-width: 1024px)';

let narrowDetailMql = null;
const narrowDetailListeners = new Set();

const getNarrowDetailMql = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!narrowDetailMql) {
    narrowDetailMql = window.matchMedia(NARROW_DETAIL_QUERY);
    const handleChange = (event) => {
      const matches = Boolean(event && event.matches);
      narrowDetailListeners.forEach((fn) => {
        try {
          fn(matches);
        } catch (error) {
          // 单个监听器异常不影响其他监听器
        }
      });
    };
    if (typeof narrowDetailMql.addEventListener === 'function') {
      narrowDetailMql.addEventListener('change', handleChange);
    } else if (typeof narrowDetailMql.addListener === 'function') {
      narrowDetailMql.addListener(handleChange);
    }
  }
  return narrowDetailMql;
};

/** 时点判断：当前是否窄屏（竖屏详情排版模式）。 */
export const isNarrowDetailViewport = () => Boolean(getNarrowDetailMql()?.matches);

/** 订阅窄屏判据变化，返回解绑函数。 */
export function onNarrowDetailChange(fn) {
  if (typeof fn !== 'function') return () => {};
  getNarrowDetailMql();
  narrowDetailListeners.add(fn);
  return () => narrowDetailListeners.delete(fn);
}

export const FORUM_PORTRAIT_COMPOSER_QUERY =
  '(max-width: 1024px) and (orientation: portrait)';

/** 按 query 复用的 mql 注册表（懒建，共享 change 监听） */
const queryRegistry = new Map();

const getQueryEntry = (query) => {
  let entry = queryRegistry.get(query);
  if (entry) return entry;
  const listeners = new Set();
  entry = { mql: null, listeners };
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia(query);
    entry.mql = mql;
    const handleChange = (event) => {
      const matches = Boolean(event && event.matches);
      listeners.forEach((fn) => {
        try {
          fn(matches);
        } catch (error) {
          // 单个监听器异常不影响其他监听器
        }
      });
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(handleChange);
    }
  }
  queryRegistry.set(query, entry);
  return entry;
};

const isQueryMatched = (query) => Boolean(getQueryEntry(query).mql?.matches);

const onQueryChange = (query, fn) => {
  if (typeof fn !== 'function') return () => {};
  const entry = getQueryEntry(query);
  entry.listeners.add(fn);
  return () => entry.listeners.delete(fn);
};

/** 时点判断：当前是否命中横屏判据（SSR/异常环境返回 false，走整页路由兜底）。 */
export const isForumLandscape = () => isQueryMatched(FORUM_LANDSCAPE_QUERY);

/** 订阅横屏判据变化，返回解绑函数。 */
export function onForumLandscapeChange(fn) {
  return onQueryChange(FORUM_LANDSCAPE_QUERY, fn);
}

/** 时点判断：当前是否命中竖屏编辑器形态（窄视口或竖屏 → 全屏移动编辑器）。 */
export const isForumPortraitComposer = () => isQueryMatched(FORUM_PORTRAIT_COMPOSER_QUERY);

/** 订阅竖屏编辑器判据变化，返回解绑函数。 */
export function onForumPortraitComposerChange(fn) {
  return onQueryChange(FORUM_PORTRAIT_COMPOSER_QUERY, fn);
}