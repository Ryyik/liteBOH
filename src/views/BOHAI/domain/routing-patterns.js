/**
 * routing-patterns.js — 意图路由正则的**统一门面**（plans/025 v2 · Step 2「domain 数据沉淀」）
 *
 * ⚠️ **真源仍在 `engine/bohai-auto-router.js`** —— 红线 1 规定 `agents/` + `expert-roles/` +
 * `engine/` 三层**不动**（22 文件 / 4,032 行）。本文件是**薄转出口**，不复制实体。
 *
 * 为什么不做「实体外移」：
 *   1. `ROUTING_PATTERNS` 本就**只有一份**（无重复副本）—— 计划里 `domain/` 的初衷是消除散落/重复；
 *   2. 外移会打断 `tests/unit/bohai-latency-guards.test.js:21` 针对 `AUTO_ROUTER` 的**源码文本守卫**
 *      （该守卫的存在意义正是保护这批正则）；
 *   3. 零功能收益：`bohai-auto-router.test.js` 是**直接 import**，搬了不会更有牙。
 *
 * 用途：让「领域数据有统一入口」成立，同时不破坏 `engine/` 的冻结。
 * 若将来红线 1 放宽为「逻辑不动、常量可外移」，只需把本文件改成实体 + 同步改那条守卫。
 */
export {
  ROUTING_PATTERNS,
  isLikelyCodeOrCommandRequest,
  isLikelyDailySummaryRequest,
  isLikelyCloudReferenceRequest,
  isLikelyPersonalSupportRequest,
  isLikelyCommunityMemoryShare,
} from '../engine/bohai-auto-router.js';
