/**
 * 空状态判定（纯函数，供单测；plans/027 S3 / plans/042 C4）。
 *
 * 三分支判定顺序不可换：hasActiveFilters 包含 searchQuery（useDataAdminFilterState），
 * 必须先判搜索，否则搜索无结果会永远落进「筛选无结果」分支。
 *
 * `actions` 是 plans/042 C4 补的：空态不该是一条死胡同。
 * 每个分支都必须给出至少一个可点的下一步，且 id 与 kind 一一对应（测试锁住）。
 *
 * @returns {null | {kind, title, description, showClear, showCreate, actions}}
 */

/** 空态动作 id：DataAdmin 侧按它分发 */
export const EMPTY_ACTIONS = {
  GLOBAL_SEARCH: 'global-search',
  CLEAR_FILTERS: 'clear-filters',
  CREATE: 'create',
};

export const resolveEmptyState = ({
  totalCount = 0,
  searchQuery = '',
  hasActiveFilters = false,
  canCreate = false,
} = {}) => {
  if (Number(totalCount) > 0) return null;

  const keyword = String(searchQuery || '').trim();
  if (keyword) {
    return {
      kind: 'no-match',
      title: '没有匹配的记录',
      description: `没有找到包含「${keyword}」的记录。`,
      showClear: true,
      showCreate: false,
      // 搜不到时最可能的两种情况：这个词在别的表里 / 本表筛选太窄
      actions: [
        { id: EMPTY_ACTIONS.GLOBAL_SEARCH, label: '搜索全部表', tone: 'primary' },
        { id: EMPTY_ACTIONS.CLEAR_FILTERS, label: '清空搜索与筛选', tone: 'secondary' },
      ],
    };
  }
  if (hasActiveFilters) {
    return {
      kind: 'filtered-out',
      title: '没有符合筛选条件的结果',
      description: '当前筛选条件下没有记录，清除筛选后可查看全部。',
      showClear: true,
      showCreate: false,
      // 被哪些条件挡住由 DataAdmin 的 activeFilterSummary 渲染（A4 会换成可单条删除的 chips）
      actions: [{ id: EMPTY_ACTIONS.CLEAR_FILTERS, label: '清除全部筛选', tone: 'primary' }],
    };
  }
  return {
    kind: 'empty',
    title: '暂无数据',
    description: '这张表还没有记录。',
    showClear: false,
    showCreate: Boolean(canCreate),
    actions: canCreate
      ? [{ id: EMPTY_ACTIONS.CREATE, label: '新增数据', tone: 'primary' }]
      : [{ id: EMPTY_ACTIONS.GLOBAL_SEARCH, label: '搜索全部表', tone: 'secondary' }],
  };
};
