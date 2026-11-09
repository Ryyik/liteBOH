/**
 * data-admin-search-suggestions.js — 搜索框「联想」的纯逻辑（plans/042 C3 / C6）
 *
 * 三件事：
 *   1. 最近搜索的环形维护（本机 10 条，重复的提到最前）
 *   2. 把「最近搜索 / 枚举值 / 前缀提示 / 表名」编成一份候选列表
 *   3. 候选的排序与截断（联想必须短，长了就不是联想而是列表）
 *
 * 不读 ref、不发请求 —— 面板只负责渲染与回调，方便单测。
 */

import {
  parseSearchQuery,
  SEARCH_MODE_TAB,
  SEARCH_MODE_TEXT,
  SEARCH_PREFIX_HINTS,
} from '@/utils/search-core.js';

/** 本机最多记多少条最近搜索 */
export const RECENT_SEARCH_LIMIT = 10;
/** 面板最多显示几条候选（超过就失去「一眼扫」的意义） */
export const SUGGESTION_LIMIT = 8;

/**
 * 把一次搜索写进「最近搜索」：去重（大小写不敏感）→ 提前 → 截断。
 * 空关键词不记（点一下 × 清空不该污染历史）。
 */
export const pushRecentSearch = (list, keyword, limit = RECENT_SEARCH_LIMIT) => {
  const value = String(keyword ?? '').trim();
  const current = Array.isArray(list) ? list : [];
  if (!value) return current.slice(0, limit);
  const lower = value.toLowerCase();
  const rest = current.filter((item) => String(item).toLowerCase() !== lower);
  return [value, ...rest].slice(0, limit);
};

/**
 * 从「当前表的 select 列」收集可联想的值。
 * 只收 ≤24 个值的枚举（状态/分类这类），过长的（比如城市列表）不收 ——
 * 联想区里塞 200 个同前缀的值等于没有联想。
 */
export const collectEnumOptions = (columns = [], maxPerField = 24) =>
  (columns || []).flatMap((column) => {
    const options = Array.isArray(column?.options) ? column.options : [];
    if (!options.length || options.length > maxPerField) return [];
    return options
      .map((option) => ({
        field: column.key,
        fieldLabel: column.label || column.key,
        value: String(option?.value ?? ''),
        label: String(option?.label ?? option?.value ?? ''),
      }))
      .filter((option) => option.value || option.label);
  });

/**
 * 构造候选列表。
 *
 * @param {Object} params
 * @param {string} params.query        - 输入框原文（可含前缀）
 * @param {string[]} params.recent     - 最近搜索
 * @param {Array} params.enumOptions   - collectEnumOptions() 的产物
 * @param {Array} params.tabs          - [{ id, label }]
 * @returns {Array<{ id,kind,label,hint,value?,tabId? }>}
 *   kind: 'prefix'（空态提示）| 'recent' | 'enum' | 'tab'
 */
export const buildSearchSuggestions = ({
  query = '',
  recent = [],
  enumOptions = [],
  tabs = [],
} = {}) => {
  const parsed = parseSearchQuery(query);
  const keyword = parsed.value.toLowerCase();
  const matches = (text) =>
    String(text ?? '')
      .toLowerCase()
      .includes(keyword);

  // `tab:` 模式：只给表跳转，不再混入历史/枚举（用户已经明确说了要找表）
  if (parsed.mode === SEARCH_MODE_TAB) {
    return (tabs || [])
      .filter(
        (tab) => !keyword || matches(tab.label) || String(tab.id).toLowerCase().includes(keyword),
      )
      .slice(0, SUGGESTION_LIMIT)
      .map((tab) => ({
        id: `tab-${tab.id}`,
        kind: 'tab',
        label: `跳到「${tab.label}」`,
        hint: '表',
        tabId: tab.id,
      }));
  }

  if (parsed.mode !== SEARCH_MODE_TEXT) {
    // `id:` / `@`：给一句「这条前缀会怎么搜」的说明，避免用户以为搜索坏了
    return [
      {
        id: `prefix-${parsed.mode}`,
        kind: 'prefix',
        label:
          parsed.mode === 'id'
            ? `按记录 ID 精查：${parsed.value || '（粘贴完整 UUID）'}`
            : `只在用户名里搜：${parsed.value || '（输入用户名）'}`,
        hint: parsed.prefix,
        value: parsed.value,
      },
    ];
  }

  const suggestions = [];

  if (!keyword) {
    SEARCH_PREFIX_HINTS.forEach((hint) => {
      suggestions.push({
        id: `prefix-${hint.mode}`,
        kind: 'prefix',
        label: `${hint.prefix} ${hint.hint}`,
        hint: '前缀',
        value: hint.prefix,
      });
    });
  }

  (recent || [])
    .filter((item) => !keyword || matches(item))
    .forEach((item) => {
      suggestions.push({
        id: `recent-${item}`,
        kind: 'recent',
        label: String(item),
        hint: keyword ? '最近搜索' : '最近',
        value: String(item),
      });
    });

  if (keyword) {
    (enumOptions || [])
      .filter((option) => matches(option.label) || matches(option.value))
      .forEach((option) => {
        suggestions.push({
          id: `enum-${option.field}-${option.value}`,
          kind: 'enum',
          label: option.label,
          hint: option.fieldLabel,
          value: option.label || option.value,
        });
      });
  }

  return suggestions.slice(0, SUGGESTION_LIMIT);
};
