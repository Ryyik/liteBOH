/**
 * 论坛「查询条件」层 —— 从 ForumMain.vue 外搬（2026-10-30，审查报告 P1-1 第 3 步）。
 *
 * 管的是「用户怎么描述他想看什么」：排序 / 关注流 / 标签 / 内容分区四个筛选开关、
 * 筛选态空列表文案、搜索框（最近搜索历史 / #标签语法 / 单字符滞回防抖 / ⌘K 聚焦）。
 *
 * ── 状态归属：ref 仍在宿主，这里只拿引用 ────────────────────────────
 * `sortMode` / `searchQuery` 这些 ref 在宿主 setup 的很早处就要交给
 * `useForumVirtualFeed`（第 250 行附近的那个调用），所以**不能**搬到这里来 ——
 * 搬了宿主就得在虚拟列表接线时撞 TDZ。这里按参数拿 ref 并写它，
 * 与 useForumPublishQueue 拿 `postImages` 是同一套做法。
 *
 * ── 唯一搬走的状态：searchDebounceTimer ──────────────────────────────
 * 它是搜索防抖的句柄，只有本模块需要（写入在 `watch(searchQuery)` 里）。
 * 但宿主的 `askBohai`（问 BOHAI 前要先掐掉待发的检索）也要动它，
 * 于是对外暴露 `cancelPendingSearch()` —— 比让宿主跨文件去 clearTimeout 一个
 * 别人的 `let` 干净，也顺手消掉「三处各写一遍 clearTimeout」。
 *
 * ⚠️ 调用点放在宿主原位置（不要挪到 setup 尾部）：这里注入的 fetchForumData /
 * focusForumSearch / isLoggedIn 都在它之上声明完毕，就地挂载反而是最安全的，
 * 挪到尾部会让 `askBohai` 里的 stripTagTokens 变成「先用后声明」。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { FORUM_TAG_OPTIONS, SEARCH_DEBOUNCE_MS } from '../forum-config.js';

export function useForumFeedQuery(deps) {
  const {
    searchQuery,
    searchKeyword,
    selectedTagFilter,
    selectedContentType,
    sortMode,
    feedMode,
    showFollowingOnly,
    isLoggedIn,
    fetchForumData,
    normalizeForumTagValue,
    getForumTagLabel,
    focusForumSearch,
  } = deps;

  // 搜索防抖句柄：归本模块所有（见文件头「唯一搬走的状态」）
  let searchDebounceTimer = null;

  const setSortMode = (mode) => {
    feedMode.value = 'posts';
    sortMode.value = mode;
    fetchForumData();
  };

  const setFeedMode = (mode) => {
    if (mode === 'following' && !isLoggedIn.value) return;
    const newVal = mode === 'following';
    if (showFollowingOnly.value === newVal) return;
    showFollowingOnly.value = newVal;
    feedMode.value = 'posts';
    fetchForumData();
  };

  const setTagFilter = (tag = '') => {
    const normalizedTag = normalizeForumTagValue(tag);
    // 下拉显式选择优先：清掉输入中的 #记号，防止后续防抖解析把选择覆盖回记号里的标签
    if (searchQuery.value.includes('#')) {
      searchQuery.value = stripTagTokens(searchQuery.value);
    }
    if (selectedTagFilter.value === normalizedTag) return;
    selectedTagFilter.value = normalizedTag;
    feedMode.value = 'posts';
    fetchForumData();
  };

  const setContentType = (type = '') => {
    const next = ['news', 'activity', 'post'].includes(type) ? type : '';
    if (selectedContentType.value === next) return;
    selectedContentType.value = next;
    feedMode.value = 'posts';
    fetchForumData();
  };

  const CONTENT_TYPE_LABELS = { info: '资讯', news: '新闻', activity: '活动', post: '论坛' };
  const contentTypeLabel = computed(() => CONTENT_TYPE_LABELS[selectedContentType.value] || '');

  /* 筛选态空列表的文案：把「什么条件下没有内容」说清楚。
   2026-10-22 之前这里拼的是 `「${contentTypeLabel}」`，而 'info'（资讯）不在标签表里
   ⇒ 界面上出现过「没有找到「」相关的内容」这种空括号。 */
  const emptyFilterTitle = computed(() => {
    const tagLabel = selectedTagFilter.value ? getForumTagLabel(selectedTagFilter.value) : '';
    if (contentTypeLabel.value && tagLabel)
      return `「${contentTypeLabel.value} · ${tagLabel}」还没有内容`;
    if (contentTypeLabel.value) return `「${contentTypeLabel.value}」暂时还没有内容`;
    if (tagLabel) return `「${tagLabel}」下还没有内容`;
    return '没有符合条件的内容';
  });

  const emptyFilterDesc = computed(() => {
    if (selectedContentType.value === 'info') return '官方发布新闻或活动后，会同步出现在这里';
    if (selectedTagFilter.value) return '换个标签，或回到全部内容看看';
    return '换个筛选条件试试';
  });

  // ─── #标签筛选语法：搜索框内输入 #服务器 / #question 等，即解析为标签筛选 ───
  // 归一化单个 #记号 → 标签 value（支持英文 value 与中文标签名，大小写不敏感）
  const resolveTagTokenValue = (token = '') => {
    const normalized = String(token || '')
      .trim()
      .toLowerCase()
      .replace(/^#/, '');
    if (!normalized) return '';
    const option = FORUM_TAG_OPTIONS.find(
      (tag) => tag.value === normalized || tag.label.slice(1).toLowerCase() === normalized,
    );
    return option ? option.value : '';
  };

  // 从输入中剔除全部 #记号（含裸 #），得到真正入库搜索的关键词
  const stripTagTokens = (raw = '') =>
    String(raw || '')
      .replace(/#[^\s#]*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // 从输入解析标签筛选：返回 null 表示输入不含 #记号（不干预现有筛选状态）；
  // 返回 '' 表示有记号但未匹配任何标签（视为清除）；否则返回标签 value
  const deriveTagFilterFromInput = (raw = '') => {
    const text = String(raw || '');
    if (!text.includes('#')) return null;
    const tokens = [...text.matchAll(/#([^\s#]+)/g)];
    if (!tokens.length) return '';
    for (const token of tokens) {
      const value = resolveTagTokenValue(token[1]);
      if (value) return value;
    }
    return '';
  };

  // ============================================
  // 搜索体验（2026-09-27）
  // ============================================
  /* 四件事：
   1. 最小长度保护：中文输入「树洞」会先经过「树」这个中间态，旧实现每敲一个字
      都打一次全表查询。这里把**单字符**的自动检索防抖拉长（多字符仍走
      SEARCH_DEBOUNCE_MS）；显式提交（回车 / 搜索按钮）完全不受限 ——
      用户确实想搜单字时依然可以。
   2. 最近搜索：只在**显式提交**时记录（不记录输入中间态），localStorage 去重限量；
      聚焦且输入为空时展开，点一下即回填检索。
   3. 结果计数：搜索/筛选态下给出命中条数，避免「搜完不知道有几条」。
   4. ⌘K / Ctrl+K 聚焦搜索框。 */
  const isSearchFocused = ref(false);
  const searchHistory = ref([]);

  const SEARCH_HISTORY_KEY = 'boh-forum-search-history';
  const SEARCH_HISTORY_MAX = 6;
  const SINGLE_CHAR_SEARCH_DELAY_MS = 900;

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

  const persistSearchHistory = () => {
    try {
      window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory.value));
    } catch {
      // 存不住就算了，不影响检索
    }
  };

  const rememberSearchKeyword = (keyword) => {
    const value = String(keyword || '').trim();
    if (!value) return;
    searchHistory.value = [value, ...searchHistory.value.filter((item) => item !== value)].slice(
      0,
      SEARCH_HISTORY_MAX,
    );
    persistSearchHistory();
  };

  const clearSearchHistory = () => {
    searchHistory.value = [];
    persistSearchHistory();
  };

  const showSearchHistory = computed(
    () => isSearchFocused.value && !searchQuery.value.trim() && searchHistory.value.length > 0,
  );

  const onSearchFocus = () => {
    isSearchFocused.value = true;
  };

  const onSearchBlur = () => {
    isSearchFocused.value = false;
  };

  const applyHistoryKeyword = (keyword) => {
    // 面板是否收起由 showSearchHistory 自己判断（回填后输入框有内容 → 自动收起），
    // 不在这里手工置 isSearchFocused —— 聚焦态只能由 focus / blur 两个事件驱动。
    searchQuery.value = keyword;
    applySearchFromInput({ remember: true });
  };

  // 无结果时的「换个词试试」：取最近搜索里第一条与当前词不同的，避免建议等于现词
  const historySuggestion = computed(
    () => searchHistory.value.find((item) => item !== searchKeyword.value.trim()) || '',
  );

  /* 结果计数提示：2026-10-22 按用户要求**整条去掉**。
   原先它在搜索/筛选态渲染「已显示前 N 条，继续下拉可加载更多 / 共 N 条结果」，
   位置在卡片流正上方，无论怎么调字号都像一句多余的说明。列表底部本来就有
   加载更多的手感（下拉即出），这句属于重复表达。
   ⚠️ 别再以「提升可发现性」为由加回来 —— 用户明确要求去掉。 */

  // 统一搜索入口（提交按钮 / 回车 / 输入防抖共用）：解析 #标签 + 剔除记号后入库检索
  const applySearchFromInput = ({ remember = false } = {}) => {
    const rawInput = String(searchQuery.value || '');
    const derivedTag = deriveTagFilterFromInput(rawInput);
    const keyword = stripTagTokens(rawInput);
    const tagChanged = derivedTag !== null && derivedTag !== selectedTagFilter.value;
    if (tagChanged) selectedTagFilter.value = derivedTag;
    // 记历史放在「是否与上次相同」判断之前：重复搜同一个词也算一次使用，该提到最前
    if (remember) rememberSearchKeyword(keyword);
    if (keyword === searchKeyword.value && !tagChanged) return;
    searchKeyword.value = keyword;
    feedMode.value = 'posts';
    fetchForumData();
  };

  const handleSearch = () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    /* ⚠️ 不要在这里置 isSearchFocused = false：回车 / 点搜索按钮都不会让输入框失焦，
     DOM 焦点还在框里，而内部状态被置 false 之后就再也收不到新的 focus 事件 ——
     用户接着清空输入，最近搜索面板就永远不展开（本探针 D3 正是抓到这个）。
     面板显示与否由 showSearchHistory 单点判断（空输入 + 聚焦），无需手工干预。 */
    applySearchFromInput({ remember: true });
  };

  // 清除搜索词：关键词与输入框一起清，但**不碰标签筛选** —— 那是另一个意图
  const clearSearchInput = () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    if (searchQuery.value) searchQuery.value = '';
    if (!searchKeyword.value) return;
    searchKeyword.value = '';
    feedMode.value = 'posts';
    fetchForumData();
  };

  /* ⌘K / Ctrl+K 聚焦搜索框：列表滚了很久时不必再回顶部点输入框。
   复用既有的 focusForumSearch（文件上半部）—— 它已经处理了 scrollIntoView + focus，
   不另起一套 DOM 查询/聚焦实现。 */
  const handleSearchHotkey = (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (String(event.key).toLowerCase() !== 'k') return;
    event.preventDefault();
    focusForumSearch();
  };

  onMounted(() => {
    searchHistory.value = readSearchHistory();
    window.addEventListener('keydown', handleSearchHotkey);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleSearchHotkey);
  });

  // 清除标签筛选（chip × / 「全部标签」）：同时清掉输入里的 #记号，避免下次输入又被解析回来
  const clearTagFilter = () => {
    if (searchQuery.value.includes('#')) {
      searchQuery.value = stripTagTokens(searchQuery.value);
    }
    if (selectedTagFilter.value === '') return;
    selectedTagFilter.value = '';
    feedMode.value = 'posts';
    fetchForumData();
  };

  watch(searchQuery, () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    /* 单字符滞回：中文输入「树洞」会先经过「树」这个中间态。
     给单字符一个更长的防抖窗口 —— 多数字会在窗口内补进来，于是只发一次请求；
     真停在单字上（或从多字删到单字）也照样检索，只是慢一点。
     这比「单字直接不检索」少了「删到剩一个字、列表却不更新」的违和感。 */
    const pendingKeyword = stripTagTokens(String(searchQuery.value || '')).trim();
    const delay = pendingKeyword.length === 1 ? SINGLE_CHAR_SEARCH_DELAY_MS : SEARCH_DEBOUNCE_MS;
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      applySearchFromInput();
    }, delay);
  });

  /* 掐掉待发的检索（宿主「问 BOHAI」要在检索前调用）：防抖窗口里再打一次全表查询，
     既浪费一次请求，又会把用户刚问的问题覆盖成列表结果。 */
  const cancelPendingSearch = () => {
    if (!searchDebounceTimer) return;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  };

  return {
    setSortMode,
    setFeedMode,
    setTagFilter,
    setContentType,
    clearTagFilter,
    contentTypeLabel,
    emptyFilterTitle,
    emptyFilterDesc,
    isSearchFocused,
    searchHistory,
    showSearchHistory,
    onSearchFocus,
    onSearchBlur,
    applyHistoryKeyword,
    historySuggestion,
    clearSearchHistory,
    handleSearch,
    clearSearchInput,
    stripTagTokens,
    deriveTagFilterFromInput,
    cancelPendingSearch,
  };
}
