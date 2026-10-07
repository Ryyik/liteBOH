/**
 * knowledge.ts — 核心记忆库 / 导入知识库读连接器（plans/025 v2 · Step 4）
 *
 * 注意：`planKey` 是 `memory`（历史命名），`id` 是 `knowledge` —— 两者刻意不同，别「统一」。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createKnowledgeConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.knowledge,
    planKey: 'memory',
    label: '核心记忆库/导入知识库',
    source: 'BOH 历史背景与导入知识库',
    evidencePrefix: 'K',
    read,
    describeAction: () => '查看了 BOH 历史背景与导入知识库',
  });
