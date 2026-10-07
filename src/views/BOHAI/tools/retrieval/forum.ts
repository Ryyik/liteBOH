/**
 * forum.ts — 社区帖子读连接器（plans/025 v2 · Step 4）
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createForumConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.forum,
    planKey: 'forum',
    label: '社区帖子',
    source: '社区帖子',
    evidencePrefix: 'F',
    read,
    describeAction: (result: any) => {
      const total = Number(result?.total || 0);
      return total > 0 ? `检索了社区帖子 ${total} 条` : '检索了社区帖子';
    },
  });
