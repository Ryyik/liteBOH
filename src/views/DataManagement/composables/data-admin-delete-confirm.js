/**
 * 删除确认文案（纯函数，供单测；plans/027 S4）。
 * 不放进 useDataAdminMutations.js：那个模块顶层会初始化 Supabase 客户端，
 * 单测 import 时会因为没有 env 直接抛错（同 csv-export.js 的拆分理由）。
 */

/** 行标识：title → username → name → id → 兜底文案 */
export const buildItemLabel = (item) =>
  item?.title || item?.username || item?.name || item?.id || '这条记录';

/**
 * 单条删除确认文案（多行，\n 分隔）。
 * @param {Object} options
 * @param {Object} options.item                待删记录
 * @param {string} options.tabLabel            当前 tab 中文名
 * @param {string[]} options.relatedLabels     关联类型中文名（去重后）
 */
export const buildDeleteConfirmMessage = ({ item, tabLabel = '', relatedLabels = [] } = {}) => {
  const lines = [
    `即将删除「${buildItemLabel(item)}」${tabLabel ? `（${tabLabel}）` : ''}`,
    item?.id ? `ID：${item.id}` : '',
    relatedLabels.length ? `关联记录 ${relatedLabels.length} 类（${relatedLabels.join('/')}）` : '',
    '此操作不可恢复。',
  ];
  return lines.filter(Boolean).join('\n');
};

/**
 * 批量删除确认文案：前 3 条标识 + （>3 条时的）省略行。
 * @param {Object} options
 * @param {number} options.count        选中条数
 * @param {string} options.tabLabel     当前 tab 中文名
 * @param {Array}  options.items        选中记录（取前 3 条做标识）
 */
export const buildBatchDeleteConfirmMessage = ({ count = 0, tabLabel = '', items = [] } = {}) => {
  const labels = (items || []).slice(0, 3).map((item) => buildItemLabel(item));
  const lines = [
    `即将删除 ${count} 条${tabLabel ? `「${tabLabel}」` : ''}记录`,
    labels.join('、'),
    count > 3 ? `…等 ${count} 条` : '',
    '此操作不可恢复。',
  ];
  return lines.filter(Boolean).join('\n');
};

/** 二次确认应输入的文本：「删除 N 条」 */
export const buildBatchDeleteConfirmInput = (count) => `删除 ${count} 条`;

/** 二次确认校验：trim 后需与「删除 N 条」完全一致 */
export const isBatchDeleteConfirmed = (input, count) =>
  String(input ?? '').trim() === buildBatchDeleteConfirmInput(count);
