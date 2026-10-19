/**
 * kanban-config.js — 从 dataConfig 的单个表配置解析「看板/状态分布」配置（纯函数）。
 *
 * 为什么单独抽出来（2026-10-19）：状态分布 chips 原先用 `currentData`（当前页）
 * 计数，服务端分页下永远只反映一页（20 条），与库里的真实条数对不上。
 * 改成服务端全量计数后，fetchTabData（按 tabId 取配置）与 computed（按当前 tab）
 * 必须用**同一套推断规则**，否则两处口径漂移 —— 这里就是那唯一一处。
 *
 * 推断优先级：kanban 显式 > cardView.statusKey/statusMeta > 自动找 status select 字段。
 */
export const resolveKanbanConfig = (cfg) => {
  if (!cfg || cfg.kanban === false) return null;
  const fieldsAll = [...(cfg.fields || []), ...(cfg.columns || [])];
  const explicit = cfg.kanban && typeof cfg.kanban === 'object' ? cfg.kanban : null;
  const statusField =
    (explicit?.statusKey && fieldsAll.find((f) => f.key === explicit.statusKey)) ||
    (cfg.cardView?.statusKey && fieldsAll.find((f) => f.key === cfg.cardView.statusKey)) ||
    fieldsAll.find((f) => /status/i.test(f.key) && f.type === 'select' && Array.isArray(f.options));
  if (!statusField) return null;
  const statusMeta = { ...(cfg.cardView?.statusMeta || {}), ...(explicit?.statusMeta || {}) };
  const rawCols = explicit?.statusMeta
    ? Object.entries(explicit.statusMeta)
    : (statusField.options || []).map((o) => [o.value, { label: o.label, tone: 'muted' }]);
  const columns = rawCols.map(([value, meta]) => ({
    value,
    label: meta.label,
    tone: meta.tone || 'muted',
  }));
  if (!columns.length) return null;
  return { statusKey: statusField.key, columns, statusMeta };
};
