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
 * @param {boolean} options.accountMode        true = 这一步删的是用户账号（users / points 都是 profiles 表），
 *                                             走 admin_delete_user_account，连 auth 用户一起删
 */
export const buildDeleteConfirmMessage = ({
  item,
  tabLabel = '',
  relatedLabels = [],
  accountMode = false,
} = {}) => {
  const lines = [
    accountMode
      ? `即将删除用户账号「${buildItemLabel(item)}」${tabLabel ? `（${tabLabel}）` : ''}`
      : `即将删除「${buildItemLabel(item)}」${tabLabel ? `（${tabLabel}）` : ''}`,
    item?.id ? `ID：${item.id}` : '',
    relatedLabels.length ? `关联记录 ${relatedLabels.length} 类（${relatedLabels.join('/')}）` : '',
    /* 「不可恢复」与「最近删除」并不矛盾，两句都要说：库里确实找不回来，
       本机快照能撑一次误删 —— 只说前者会让人以为没有退路（2026-11-10 对齐文案）。 */
    accountMode
      ? '会同时删除登录凭证与该用户的全部关联数据（帖子、评论、积分流水、订单等），无法通过「最近删除」找回。'
      : '此操作不可恢复（本机「最近删除」可临时找回，账号删除除外）。',
  ];
  return lines.filter(Boolean).join('\n');
};

/**
 * 批量删除确认文案：前 3 条标识 + （>3 条时的）省略行。
 * @param {Object} options
 * @param {number} options.count        选中条数
 * @param {string} options.tabLabel     当前 tab 中文名
 * @param {Array}  options.items        选中记录（取前 3 条做标识）
 * @param {boolean} options.accountMode true = 删的是用户账号（users / points 都是 profiles 表）。
 *                  必须与「删记录」区分：这两条路径的实际后果差着一整个 auth 账号，
 *                  而旧文案在「积分」tab 只写「删除 N 条记录」，等于把删号说成删行。
 */
export const buildBatchDeleteConfirmMessage = ({
  count = 0,
  tabLabel = '',
  items = [],
  accountMode = false,
} = {}) => {
  const labels = (items || []).slice(0, 3).map((item) => buildItemLabel(item));
  const lines = [
    accountMode
      ? `即将删除 ${count} 个用户账号${tabLabel ? `（${tabLabel}）` : ''}`
      : `即将删除 ${count} 条${tabLabel ? `「${tabLabel}」` : ''}记录`,
    labels.join('、'),
    count > 3 ? `…等 ${count} 条` : '',
    accountMode
      ? '会同时删除登录凭证与该用户的全部关联数据（帖子、评论、积分流水、订单等），无法通过「最近删除」找回。'
      : '此操作不可恢复（本机「最近删除」可临时找回，账号删除除外）。',
  ];
  return lines.filter(Boolean).join('\n');
};

/** 二次确认应输入的文本：「删除 N 条」 */
export const buildBatchDeleteConfirmInput = (count) => `删除 ${count} 条`;

/** 二次确认校验：trim 后需与「删除 N 条」完全一致 */
export const isBatchDeleteConfirmed = (input, count) =>
  String(input ?? '').trim() === buildBatchDeleteConfirmInput(count);
