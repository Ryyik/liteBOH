/**
 * 登出/账号删除时清理浏览器本地的 PII 数据。
 * 注意: 仅清理与个人身份相关的 key,其他非 PII 偏好保留。
 */

const SENSITIVE_KEYS = [
  'boh_remember_email',
  'username',
  'boh-admin-edit-drafts-v1',
  'boh-admin-recent-records-v1',
  'boh-admin-pinned-tabs-v1',
  'boh-admin-saved-filter-views-v1',
  'boh-admin-column-settings-v1',
  'boh-admin-change-log-v1',
  'boh-admin-user-picker-cache-v1',
  'supabase.auth.token'
];

export const clearSensitiveLocalStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    SENSITIVE_KEYS.forEach((key) => {
      try { window.localStorage.removeItem(key); } catch (_e) { /* 忽略单 key 失败 */ }
    });
  } catch (err) {
    // 单点失败不影响登出
    // eslint-disable-next-line no-console
    console.warn('[safe-storage] 清理 localStorage 失败', err);
  }
};

export const SENSITIVE_LOCAL_STORAGE_KEYS = SENSITIVE_KEYS;
