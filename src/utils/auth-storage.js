/**
 * 登录会话的本地存储策略 —— 「记住我」的**唯一真源**（2026-11-16）。
 *
 * 为什么必须有这一层：
 *   修复前 `supabase-client.js` 把 `storage` 硬编码成 `window.localStorage`，
 *   于是「记住我」这个勾选框**只**决定要不要回填登录框里的账号，取消勾选也照样
 *   在本机留一份 30 天的刷新令牌。用户在共用电脑上以为"没记住"，实际上一点退出
 *   就还是自动登录 —— 这是预期与实现直接矛盾，不是文案问题。
 *
 * 现在的语义：
 *   · 勾「记住我」  ⇒ flag=1，会话写 localStorage（关浏览器再开仍登录）
 *   · 不勾         ⇒ flag=0，会话写 sessionStorage（关掉标签页即失效）
 *
 * 三个必须一起成立、缺一个就会"会话凭空消失"的细节：
 *   1. **读时双边 fallback** —— 用户从「不记住」切成「记住」的那一瞬间，flag 已经
 *      变了但令牌还在旧的 storage 里，只读 primary 会立刻变成未登录。
 *   2. **写时删掉另一侧的同名 key** —— 否则两侧各留一份，下次 flag 反过来时读到
 *      的是上一次的旧令牌（可能已失效，表现为"莫名要重新登录"）。
 *   3. **removeItem 双侧删除** —— 退出登录只有一个调用点，不能漏掉任何一侧，
 *      否则共享设备上还留着一份可用令牌。
 *
 * 注意：sessionStorage 是**每标签页独立**的。不勾「记住我」时新开一个标签页
 * 需要重新登录 —— 这正是该选项的预期行为，不要当 bug 修。
 */

/** 与登录页共用的偏好键（存 '1' / '0'）。不在登出清理名单里：它表示用户的选择，不是身份数据。 */
export const REMEMBER_ME_STORAGE_KEY = 'boh_remember_me';

const safeGet = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (storage, key, value) => {
  try {
    storage.setItem(key, value);
  } catch {
    /* 隐私模式 / 配额满：由调用方的 fallback 兜住 */
  }
};

const safeRemove = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    /* 同上 */
  }
};

/** 当前是否允许「跨浏览器会话」保留登录态。无 flag 时默认 true（沿用历史行为）。 */
export const isPersistentSessionEnabled = () => {
  if (typeof window === 'undefined') return true;
  return safeGet(window.localStorage, REMEMBER_ME_STORAGE_KEY) !== '0';
};

/** 登录发起**之前**调用：supabase-js 在 `setSession` 阶段就会写 storage，晚一步就写错位置。 */
export const setPersistentSessionEnabled = (enabled) => {
  if (typeof window === 'undefined') return;
  safeSet(window.localStorage, REMEMBER_ME_STORAGE_KEY, enabled ? '1' : '0');
};

const primaryStorage = () => {
  if (typeof window === 'undefined') return null;
  return isPersistentSessionEnabled() ? window.localStorage : window.sessionStorage;
};

const secondaryStorage = () => {
  if (typeof window === 'undefined') return null;
  return isPersistentSessionEnabled() ? window.sessionStorage : window.localStorage;
};

export const authStorage = {
  getItem: (key) => {
    const primary = primaryStorage();
    if (!primary) return null;
    return safeGet(primary, key) ?? safeGet(secondaryStorage(), key);
  },
  setItem: (key, value) => {
    const primary = primaryStorage();
    if (!primary) return;
    safeSet(primary, key, value);
    // 迁移式写入：另一侧不能留旧副本（见文件头第 2 点）
    safeRemove(secondaryStorage(), key);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    safeRemove(window.localStorage, key);
    safeRemove(window.sessionStorage, key);
  },
};
