/**
 * members.ts — 成员聚合数字读连接器（2026-11-12 新增）
 *
 * 用户口径：成员**只给聚合数字**（总数 / 近期新增），不给任何明细。
 * 实现只发 count 请求（`head: true`），一行数据都不取 —— 见
 * `composables/useMembersStatsRetrieval.js` 文件头的事实记录。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createMembersConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.members,
    planKey: 'members',
    label: '成员概况',
    source: '成员聚合统计',
    evidencePrefix: 'M',
    requiresLogin: false,
    read,
    describeAction: (result: any) => {
      const total = Number(result?.total || 0);
      return total > 0 ? `查看了成员概况（共 ${total} 位）` : '查看了成员概况';
    },
  });
