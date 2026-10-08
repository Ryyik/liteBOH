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
  // ⚠️ 时间衰减（2026-10-08 新增）。下面三项**不改**既有三项的值，
  //    只是给排序加了一个独立的时间维度。
  //
  // 为什么需要：原排序只有 词面×5 + 源权重 + 置信度×10，**证据日期完全不参与**。
  // 于是半年前的一条论坛帖与昨天的另一条，只要源和词面相当，得分完全一样 ——
  // 「最近有什么变化」这类问题会稳定拿到旧资料，且模型无从察觉。
  //
  // 为什么是减法（penalty）而不是乘衰减系数：乘系数会同时压低高置信度的新证据，
  // 改动的排序面更大；减法只影响**同等条件下的新旧之争**，正是要修的那个面。
  //
  // 半衰期按源区分：论坛/健康/Cloud+ 的事实随时间失效得快，站点手册与知识库几乎不变。
  // 单位：天。
  freshnessMaxPenalty: 8,
  freshnessReferenceDays: 90,
  freshnessHalfLifeDays: {
    forum: 14,
    health: 21,
    cloud: 30,
    sharedMemory: 30,
    userPrivate: 120,
    knowledge: 365,
    siteGuide: 365,
  },
  // 无日期时的兜底半衰期：取最保守（接近不惩罚），避免把「没提供日期」的源
  // （字符串形态的连接器结果、历史数据）一次性打死。
  freshnessFallbackHalfLifeDays: 365,
};
