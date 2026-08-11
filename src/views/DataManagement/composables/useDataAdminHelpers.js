import { watch } from 'vue';
import { escapeHtml } from './useDataAdminValidation.js';
import { sanitizeSearchTerm } from './useDataAdminFilters.js';

const BADGE_STATUS_MAP = {
  active: 'success',
  inactive: 'warning',
  banned: 'danger',
  trialing: 'info',
  active_trial: 'info',
  past_due: 'warning',
  canceled: 'muted',
  expired: 'muted',
  completed: 'success',
  pending: 'warning',
  shipped: 'info',
  received: 'success',
  approved: 'success',
  pending_review: 'warning',
  rejected: 'danger',
  draft: 'warning',
  published: 'success',
  archived: 'muted',
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'danger',
  active_draw: 'success',
  closed: 'info',
  cancelled: 'muted',
  paid: 'success',
  pending_payment: 'warning',
  failed: 'danger',
  refunded: 'info',
  true: 'success',
  false: 'muted',
  yes: 'success',
  no: 'muted',
  enabled: 'success',
  disabled: 'muted',
  on: 'success',
  off: 'muted',
  review: 'warning',
  normal: 'success',
  warning: 'warning',
  error: 'danger',
  success: 'success',
  info: 'info',
  muted: 'muted',
  danger: 'danger',
  admin: 'success',
  管理员: 'success',
  '进行中': 'success',
  open: 'success',
  '首页显示': 'success',
  confirmed: 'success',
  fulfilled: 'success',
  joined: 'success',
  sent: 'success',
  准点: 'success',
  '定时任务': 'success',
  '当前礼物': 'success',
  'current gift': 'success',
  delivered: 'success',
  signed: 'success',
  drawn: 'success',
  user: 'info',
  '普通用户': 'info',
  upcoming: 'info',
  '即将开始': 'info',
  manual_admin: 'info',
  '手动补跑': 'info',
  '未开奖': 'info',
  processing: 'info',
  '处理中': 'info',
  '历史礼物': 'warning',
  'history gift': 'warning',
  '已隐藏': 'warning',
  pending_contact: 'warning',
  rate_limited: 'warning',
  already_joined: 'warning',
  running: 'warning',
  partial_failure: 'warning',
  '待调度': 'warning',
  ended: 'warning',
  '已结束': 'warning',
  voided: 'warning',
  entry_closed: 'warning',
  not_open: 'warning',
  full: 'warning',
  account_too_new: 'warning',
  limited: 'warning',
  preparing: 'warning',
  '封禁': 'danger',
  not_found: 'danger',
  profile_not_found: 'danger',
  reject: 'danger'
};

export const formatCellValue = (val, maxLength) => {
  if (val === null || val === undefined || val === '') return '-';
  const str = String(val);
  if (maxLength && str.length > maxLength) {
    return str.substring(0, maxLength) + '...';
  }
  return str;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
};

export const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getBadgeType = (val) => {
  if (val == null || val === '') return 'muted';
  const key = String(val).toLowerCase();
  if (key.startsWith('延迟')) return 'warning';
  return BADGE_STATUS_MAP[key] || 'info';
};

export const getTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.slice(0, 3);
  return [String(value)];
};

export const createHighlightHelpers = ({ searchQueryRef, globalSearchQueryRef }) => {
  const getHighlightKeyword = () => sanitizeSearchTerm(searchQueryRef.value || globalSearchQueryRef.value);

  // 高亮结果缓存：key = `${value}|${keyword}`，避免表格每行每列重复执行 escape+replace
  const highlightCache = new Map();
  // 缓存上限，防止长期运行内存增长
  const HIGHLIGHT_CACHE_MAX = 2000;

  // 监听 keyword 变化时清空缓存（搜索关键词改变后旧缓存失效）
  watch(searchQueryRef, () => highlightCache.clear());
  watch(globalSearchQueryRef, () => highlightCache.clear());

  const highlightCellValue = (value, maxLength) => {
    const keyword = getHighlightKeyword();
    const cacheKey = `${maxLength}|${keyword}|${value}`;
    if (highlightCache.has(cacheKey)) return highlightCache.get(cacheKey);

    const display = formatCellValue(value, maxLength);
    const escaped = escapeHtml(display);
    let result;
    if (!keyword || display === '-') {
      result = escaped;
    } else {
      const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = escaped.replace(new RegExp(`(${safeKeyword})`, 'ig'), '<mark>$1</mark>');
    }
    if (highlightCache.size >= HIGHLIGHT_CACHE_MAX) {
      // 简单 LRU：超限时清空
      highlightCache.clear();
    }
    highlightCache.set(cacheKey, result);
    return result;
  };

  return { getHighlightKeyword, highlightCellValue };
};

export const getJsonPreview = (val) => {
  if (!val) return '{}';
  const str = JSON.stringify(val);
  return str.length > 30 ? str.substring(0, 30) + '...' : str;
};

export const downloadBlob = (blob, filename) => {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
};

const RELATED_JUMP_MAP = {
  user_id: 'users',
  author_id: 'users',
  sender_id: 'users',
  receiver_id: 'users',
  winner_user_id: 'users',
  drawn_by: 'users',
  post_id: 'forum',
  lottery_id: 'lotteries',
  entry_id: 'lotteryEntries',
  winner_entry_id: 'lotteryEntries'
};

export const createRelatedJumpHelpers = ({ currentTabRef }) => {
  const getRelatedJump = (col, item) => {
    const key = String(col?.key || '');
    const value = item?.[key];
    if (!value) return null;
    const targetTab = RELATED_JUMP_MAP[key];
    if (!targetTab || targetTab === currentTabRef.value) return null;
    return {
      tabId: targetTab,
      search: String(value)
    };
  };

  return { getRelatedJump };
};

export const toDateInputValue = (dateValue) => {
  if (!dateValue) return '';
  const raw = String(dateValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const toISOStringFromInput = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const normalizeQuickEditValue = (field, value) => {
  if (!field) return value;
  if (field.type === 'number') {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) throw new Error(`${field.label}必须是有效数字`);
    return Math.round(numberValue);
  }
  if (field.type === 'datetime') return toISOStringFromInput(value);
  if (field.type === 'date') return toDateInputValue(value);
  if (field.type === 'select') return value;
  return String(value ?? '').trim();
};

export const createAnomalyHelpers = ({ currentTabRef }) => {
  const isAnomalyRow = (item) => {
    const tabId = currentTabRef.value;
    const now = Date.now();
    if (tabId === 'products') return Number(item?.stock ?? 0) <= 0;
    if (tabId === 'subscriptions') {
      const expiresAt = Date.parse(item?.expires_at || '');
      return String(item?.status || '') === 'expired' || (Number.isFinite(expiresAt) && expiresAt < now);
    }
    if (tabId === 'lotteries') {
      const drawAt = Date.parse(item?.draw_at || '');
      return String(item?.status || '') === 'open' && Number.isFinite(drawAt) && drawAt < now;
    }
    if (['reportedPosts', 'reviewPosts', 'reviewComments'].includes(tabId)) return true;
    if (tabId === 'lotteryNotificationJobs') return ['failed', 'pending'].includes(String(item?.status || ''));
    if (tabId === 'lotteryJoinAttempts') return !['joined', 'success'].includes(String(item?.result_code || ''));
    return false;
  };

  const getAnomalyReason = (item) => {
    if (!isAnomalyRow(item)) return '';
    const tabId = currentTabRef.value;
    if (tabId === 'products') return '库存不足';
    if (tabId === 'subscriptions') return '订阅已过期';
    if (tabId === 'lotteries') return '到期未开奖';
    if (tabId === 'lotteryNotificationJobs') return '通知待处理/失败';
    if (tabId === 'lotteryJoinAttempts') return '报名风控命中';
    return '需要复核';
  };

  return { isAnomalyRow, getAnomalyReason };
};
