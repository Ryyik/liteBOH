/**
 * boh-sources.js — 检索来源 chip 的**证据前缀**真源（plans/025 v2 · Step 6-3）
 *
 * 前缀字母的真源是 `src/views/BOHAI/tools/retrieval/*.ts` 的 `evidencePrefix`
 * （T=Cloud+ / S=公共记忆 / K=知识库 / G=站点手册 / F=论坛 / U=私域 / H=健康 / A=站内活动）。
 * 但检索 trace 里的 connector 条目**不带** `evidencePrefix` 字段，只带 `evidenceRefs`
 * （形如 `['T1','T2']`）——所以运行时优先从证据编号取首字母，退回 connectorId 映射。
 *
 * 消息流（`BohChatStream.vue`）与 Work 面板（`BohWorkPanel.vue`，来源由壳汇总）共用本模块，
 * 避免两处各写一份前缀表。
 */

export const SOURCE_PREFIX_BY_CONNECTOR = {
  cloud: 'T',
  sharedMemory: 'S',
  knowledge: 'K',
  siteGuide: 'G',
  forum: 'F',
  userPrivate: 'U',
  health: 'H',
  siteActivities: 'A',
  webSearch: 'W',
};

export const sourcePrefix = (source) => {
  const ref = String(source?.evidenceRefs?.[0] || '').trim();
  if (ref) return ref.charAt(0).toUpperCase();
  return SOURCE_PREFIX_BY_CONNECTOR[source?.connectorId] || '·';
};
