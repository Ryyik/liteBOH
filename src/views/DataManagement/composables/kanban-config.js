/**
 * kanban-config.js — 从 dataConfig 的单个表配置解析「看板/状态分布」配置（纯函数）。
 *
 * 为什么单独抽出来（2026-10-19）：状态分布 chips 原先用 `currentData`（当前页）
 * 计数，服务端分页下永远只反映一页（20 条），与库里的真实条数对不上。
 * 改成服务端全量计数后，fetchTabData（按 tabId 取配置）与 computed（按当前 tab）
 * 必须用**同一套推断规则**，否则两处口径漂移 —— 这里就是那唯一一处。
 *
 * 推断优先级：kanban 显式 > cardView.statusKey/statusMeta > 自动找 status select 字段。
 *
 * @param {Object} cfg - 单表 dataConfig
 * @param {Object} [options]
 * @param {string} [options.statusField] - 该 tab **状态筛选真正用的列**（STATUS_FILTER_FIELDS）。
 *   给了就只认这一列：自动推断不再按 `/status/i` 猜 —— users 的 `hide_online_status`
 *   就是被这条猜出来的（2026-11-09 实测：用户管理的「状态分布」显示 隐藏/显示，
 *   而状态筛选筛的是 role，两个口径互不相干）。
 */
export const resolveKanbanConfig = (cfg, options = {}) => {
  if (!cfg || cfg.kanban === false) return null;
  const fieldsAll = [...(cfg.fields || []), ...(cfg.columns || [])];
  const explicit = cfg.kanban && typeof cfg.kanban === 'object' ? cfg.kanban : null;
  const statusFieldHint = String(options.statusField || '');
  const statusField =
    (explicit?.statusKey && fieldsAll.find((f) => f.key === explicit.statusKey)) ||
    (cfg.cardView?.statusKey && fieldsAll.find((f) => f.key === cfg.cardView.statusKey)) ||
    // 自动推断：有 hint 时锁死列名；没 hint 时退回旧规则（任何 /status/ + select）
    (statusFieldHint
      ? fieldsAll.find(
          (f) => f.key === statusFieldHint && f.type === 'select' && Array.isArray(f.options),
        )
      : fieldsAll.find(
          (f) => /status/i.test(f.key) && f.type === 'select' && Array.isArray(f.options),
        ));
  if (!statusField) return null;
  const statusMeta = { ...(cfg.cardView?.statusMeta || {}), ...(explicit?.statusMeta || {}) };
  /**
   * 值域来源（2026-11-09 修）：原先只看 `explicit.statusMeta`，导致 **cardView.statusMeta
   * 被合并了却从不参与值域** —— 那些表（礼物等）只能退到字段 options，声明里的 tone
   * 全丢；没有 options 的表更直接没有状态分布条。与上面第 9 行的推断优先级不符，故改为
   * 「显式 > cardView > 字段 options」同一套顺序。
   */
  const declaredMeta = explicit?.statusMeta || cfg.cardView?.statusMeta;
  const rawCols = declaredMeta
    ? Object.entries(declaredMeta)
    : (statusField.options || []).map((o) => [o.value, { label: o.label, tone: 'muted' }]);
  const columns = rawCols.map(([value, meta]) => ({
    value,
    label: meta.label,
    tone: meta.tone || 'muted',
  }));
  if (!columns.length) return null;
  /**
   * `source` 记录值域从哪来（plans/042 A3）：只要是从**配置里声明**的
   * （statusMeta / cardView.statusMeta / 字段 options），chips 就是状态的权威值域，
   * 筛选面板里的「全部状态」下拉可以退场；一旦某天出现按当前页数据反推的 chips，
   * 这里会变成 'derived'，下拉必须留着，否则会丢掉筛选能力。
   */
  const source = explicit?.statusMeta
    ? 'statusMeta'
    : cfg.cardView?.statusMeta
      ? 'cardViewMeta'
      : 'fieldOptions';
  return { statusKey: statusField.key, columns, statusMeta, source };
};
