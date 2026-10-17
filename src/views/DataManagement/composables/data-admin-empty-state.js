/**
 * 空状态判定（纯函数，供单测；plans/027 S3）。
 *
 * 三分支判定顺序不可换：hasActiveFilters 包含 searchQuery（useDataAdminFilterState），
 * 必须先判搜索，否则搜索无结果会永远落进「筛选无结果」分支。
 *
 * @returns {null | {kind, title, description, showClear, showCreate}}
 */
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
    };
  }
  if (hasActiveFilters) {
    return {
      kind: 'filtered-out',
      title: '没有符合筛选条件的结果',
      description: '当前筛选条件下没有记录，清除筛选后可查看全部。',
      showClear: true,
      showCreate: false,
    };
  }
  return {
    kind: 'empty',
    title: '暂无数据',
    description: '这张表还没有记录。',
    showClear: false,
    showCreate: Boolean(canCreate),
  };
};
