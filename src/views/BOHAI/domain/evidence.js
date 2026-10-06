/**
 * evidence.js — 证据源权重 / 排序权重（plans/025 v2 · Step 2「domain 数据沉淀」）
 *
 * 来源：从**全局** `src/utils/bohai-constants.js` **原样外移**（值逐字不变）。
 *
 * 为什么可以外移（实测，2026-10-06）：
 *   - 这两项**只被** `composables/bohai-engine-helpers.js` 消费（+ 一个测试）；
 *   - 全局 `bohai-constants.js` 的**其它** BOHAI 外消费者（`content-moderation.js` /
 *     `bohai-model-client.js` / `bohai-connectors.js` / `api/treehole/treehole-space-api.js` /
 *     `views/Lab/index.vue`）取的是 `SILICON_CLOUD_CHAT_URL` / `CONNECTOR_TIMEOUT_MS` 等，
 *     **没有一个用这两项** ⇒ 外移对它们零影响。
 *   - 红线 5「全局 `bohai-*` 不搬」针对的是 `bohai-connectors.js` 的
 *     `BOHAI_CONNECTOR_IDS` / `createBohAIConnector` 工厂，不涉及本文件。
 *
 * 这两项是 **BOHAI 领域数据**（证据源排序口径），放在 `domain/` 比放在全局 utils 更正确。
 */

export const EVIDENCE_SOURCE_WEIGHTS = {
  userPrivate: 22,
  cloud: 18,
  forum: 16,
  sharedMemory: 14,
  knowledge: 12,
  siteGuide: 10,
  // BOH Health 本机数据：用户本人的记录，排序应高于通用站点手册，
  // 否则多源竞争预算时健康证据会落到 defaultSourceScore 垫底
  health: 15,
};

export const RANKING_SCORE_WEIGHTS = {
  lexicalMultiplier: 5,
  defaultSourceScore: 6,
  confidenceMultiplier: 10,
};
