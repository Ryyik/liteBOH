/**
 * user-private.ts — 当前账号私域数据读连接器（plans/025 v2 · Step 4）
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createUserPrivateConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.userPrivate,
    planKey: 'userPrivate',
    label: '当前账号资料',
    source: '当前登录用户私域数据',
    evidencePrefix: 'U',
    requiresLogin: true,
    read,
    describeAction: (result: any) => {
      const labels = Array.isArray(result?.labels) ? result.labels : [];
      const labelText = labels.length > 0 ? labels.slice(0, 2).join('、') : '当前账号资料';
      return `查看了${labelText}`;
    },
  });
