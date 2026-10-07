/**
 * health.ts — BOH Health 本机健康记录读连接器（plans/025 v2 · Step 4）
 *
 * 数据存在用户本机 localStorage ⇒ **不要求登录**（`requiresLogin: false`）。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createHealthConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.health,
    planKey: 'health',
    label: 'BOH Health 数据',
    source: 'BOH Health 本机健康记录',
    evidencePrefix: 'H',
    requiresLogin: false,
    read,
    describeAction: (result: any) => {
      const total = Number(result?.total || 0);
      return total > 0 ? `查看了你的 BOH Health 数据 ${total} 组` : '查看了你的 BOH Health 数据';
    },
  });
