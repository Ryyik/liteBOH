/**
 * 登录后回跳目标（2026-11-16 B3）。
 *
 * 背景：路由守卫拦下未登录用户时只做 `showLoginModal = true` + `next(false)`，
 * 用户登录成功后停在原地，还得再点一次刚才那个入口 —— 「我的 / 消息 / 数据管理」
 * 这类从导航进不去的页面尤其明显。
 *
 * 设计约束：
 *   · **只记站内绝对路径**（以 `/` 开头）且排除登录/注册自身，防止开放重定向；
 *   · 用 sessionStorage：跨刷新有效（登录后整页 reload 的路径不会丢），
 *     不跨标签页（一个标签的意图不该影响另一个）；
 *   · **消费即删**（一次性）：登录成功用掉之后，下次主动点「登录」不该再跳旧目标。
 */

const LOGIN_TARGET_STORAGE_KEY = 'boh_login_target';

const EXCLUDED_PATHS = ['/login', '/join', '/reset-password'];

const sanitize = (target) => {
  const value = String(target || '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return '';
  // 只允许 hash 路由的路径部分（防止把外部 URL 拼进来）
  if (value.includes('://')) return '';
  const pathOnly = value.split('?')[0].split('#')[0];
  if (EXCLUDED_PATHS.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) return '';
  return value;
};

export const rememberLoginTarget = (fullPath) => {
  const safe = sanitize(fullPath);
  if (!safe || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LOGIN_TARGET_STORAGE_KEY, safe);
  } catch {
    /* 隐私模式：记不住就算了，不影响登录本身 */
  }
};

export const consumeLoginTarget = () => {
  if (typeof window === 'undefined') return '';
  try {
    const safe = sanitize(window.sessionStorage.getItem(LOGIN_TARGET_STORAGE_KEY));
    window.sessionStorage.removeItem(LOGIN_TARGET_STORAGE_KEY);
    return safe;
  } catch {
    return '';
  }
};

export const clearLoginTarget = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LOGIN_TARGET_STORAGE_KEY);
  } catch {
    /* 同上 */
  }
};
