/**
 * knowledge.ts — 官方事实 / 知识库 / 论坛记忆读连接器（plans/025 v2 · Step 4）
 *
 * 三类云端知识源共用本连接器（都走 `getMemoryContext`）：
 *   - `core_memory`    ← `boh_ai_core_memories`（后台「数据管理 → 官方事实」维护）
 *   - `knowledge_base` ← `boh_ai_knowledge_bases`（JSONL 批量导入）
 *   - `forum_memory`   ← `boh_ai_forum_memories`（每日从论坛帖抽的事实卡）
 *
 * 注意：`planKey` 是 `memory`（历史命名），`id` 是 `knowledge` —— 两者刻意不同，别「统一」。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createKnowledgeConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.knowledge,
    planKey: 'memory',
    label: '官方事实/知识库/论坛记忆',
    source: 'BOH 官方事实、知识库与论坛记忆',
    evidencePrefix: 'K',
    read,
    describeAction: () => '查看了 BOH 官方事实与论坛记忆',
  });
