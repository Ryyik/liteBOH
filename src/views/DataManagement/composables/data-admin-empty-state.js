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

import { isInvalidIdQuery } from '@/utils/search-core.js';

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
  unsearchable = false,
  /** `describeUnexecutableKeyword()` 的产物：{reason, idType?} —— 决定「搜不了」的具体原因 */
  unsearchableReason = null,
} = {}) => {
  if (Number(totalCount) > 0) return null;

  const keyword = String(searchQuery || '').trim();
  if (keyword) {
    /* `id:` + 半截 ID 不是「没有匹配」，而是「这条查询根本没执行」——
       主键是 uuid/bigint，没有 ilike 算子，列表刻意短路成 0 条。
       文案必须说清楚，否则用户会以为记录不存在（2026-11-10）。 */
    if (isInvalidIdQuery(keyword)) {
      return {
        kind: 'no-match',
        title: 'ID 精查需要完整 ID',
        description: `「${keyword}」不是完整的记录 ID（UUID 是 36 位）。请粘贴完整 ID，或去掉 id: 前缀按关键词搜。`,
        showClear: true,
        showCreate: false,
        actions: [
          { id: EMPTY_ACTIONS.CLEAR_FILTERS, label: '清空搜索与筛选', tone: 'primary' },
          { id: EMPTY_ACTIONS.GLOBAL_SEARCH, label: '搜索全部表', tone: 'secondary' },
        ],
      };
    }
    /* 关键词是 `id:` 前缀，但形状与这张表的主键类型不符（2026-11-11 补）。
       典型：主键是 bigint，用户粘了一个 UUID。此时表里**有**文本列，
       若沿用下面那句「这张表没有可搜索的文本字段」就是拿错原因误导人。 */
    if (unsearchableReason?.reason === 'id-shape') {
      const idIsNumber = unsearchableReason.idType === 'number';
      return {
        kind: 'no-match',
        title: idIsNumber ? '这张表的编号是数字' : 'ID 精查需要完整 ID',
        description: idIsNumber
          ? `这张表的主键是数字编号（如 id:12345）。「${keyword}」不是合法数字编号，这条查询没有执行 —— 去掉 id: 前缀可按关键词搜。`
          : `「${keyword}」不是这张表的完整记录 ID，这条查询没有执行。请粘贴完整 ID，或去掉 id: 前缀按关键词搜。`,
        showClear: true,
        showCreate: false,
        actions: [
          { id: EMPTY_ACTIONS.CLEAR_FILTERS, label: '清空搜索与筛选', tone: 'primary' },
          { id: EMPTY_ACTIONS.GLOBAL_SEARCH, label: '搜索全部表', tone: 'secondary' },
        ],
      };
    }
    /* 这张表的关键词列全是 uuid / 日期（例如「每周签到」）⇒ 一条条件都构造不出来，
       列表被刻意短路成 0 条。说「没有匹配」是错的 —— 是「这张表压根搜不了这个词」。
       2026-11-11 补：以前这句会退化成通用文案，用户只会以为记录不存在。 */
    if (unsearchable) {
      return {
        kind: 'no-match',
        title: '这张表没有可搜索的文本字段',
        description: `「${keyword}」无法在「这张表」的字段里匹配（该表只有编号/日期类字段）。可以换到「全部表」搜，或用筛选条件定位。`,
        showClear: true,
        showCreate: false,
        actions: [
          { id: EMPTY_ACTIONS.GLOBAL_SEARCH, label: '搜索全部表', tone: 'primary' },
          { id: EMPTY_ACTIONS.CLEAR_FILTERS, label: '清空搜索与筛选', tone: 'secondary' },
        ],
      };
    }
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
