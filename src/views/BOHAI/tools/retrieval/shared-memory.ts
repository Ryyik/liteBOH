/**
 * shared-memory.ts — AI 公共记忆库读连接器（plans/025 v2 · Step 4）
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createSharedMemoryConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.sharedMemory,
    planKey: 'sharedMemory',
    label: 'AI 公共记忆',
    source: 'AI 公共记忆库',
    evidencePrefix: 'S',
    read,
    describeAction: (result: any) =>
      Number(result?.total || 0) > 0
        ? `查看了公共记忆库 ${Number(result.total)} 条内容`
        : '查看了公共记忆库',
  });
