/**
 * 站内搜索历史 —— 单一真源（plans/052：搜索从论坛工具栏迁到全屏搜索页）。
 *
 * 从 useForumFeedQuery.js 抽出：论坛首页与全屏搜索页**共用同一个 localStorage key**
 * （boh-forum-search-history），两边记录的词互相可见 —— 用户在搜索页搜过的词，
 * 回论坛的 ⌘K / 历史面板也能拿到，反之亦然。
 *
 * 规则（沿用 2026-09-27 的原始口径）：
 *  · 只在「显式提交」时记录（不记录输入中间态）
 *  · localStorage 去重、最新在前、最多 6 条
 *  · 隐私模式 / 存储被禁时退化为「本次会话有效」
 */
import { ref } from 'vue';

export const SEARCH_HISTORY_KEY = 'boh-forum-search-history';
export const SEARCH_HISTORY_MAX = 6;

const readSearchHistory = () => {
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, SEARCH_HISTORY_MAX);
  } catch {
    // 隐私模式 / 存储被禁：历史退化为「本次会话有效」
    return [];
  }
};

const persistSearchHistory = (list) => {
  try {
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 存不住就算了，不影响检索
  }
};

export function useSearchHistory() {
  const searchHistory = ref([]);

  const rememberSearchKeyword = (keyword) => {
    const value = String(keyword || '').trim();
    if (!value) return;
    searchHistory.value = [value, ...searchHistory.value.filter((item) => item !== value)].slice(
      0,
      SEARCH_HISTORY_MAX,
    );
    persistSearchHistory(searchHistory.value);
  };

  const clearSearchHistory = () => {
    searchHistory.value = [];
    persistSearchHistory(searchHistory.value);
  };

  const loadSearchHistory = () => {
    searchHistory.value = readSearchHistory();
  };

  return { searchHistory, rememberSearchKeyword, clearSearchHistory, loadSearchHistory };
}
