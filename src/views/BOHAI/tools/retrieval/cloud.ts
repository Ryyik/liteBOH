/**
 * cloud.ts — BOH Cloud+（树洞/私域）读连接器（plans/025 v2 · Step 4「Tool Registry」）
 *
 * 只做**声明**：`read` 由调用方（`useKnowledgeRetrieval`）注入 —— 连接器本身不持有状态。
 * ⚠️ `BOHAI_CONNECTOR_IDS` / `createBohAIConnector` 的**真源在全局** `src/utils/bohai-connectors.js`，不搬不复制。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createCloudConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.cloud,
    planKey: 'treehole',
    label: 'BOH Cloud+',
    source: 'BOH Cloud+ 私有内容',
    evidencePrefix: 'T',
    requiresLogin: true,
    read,
    describeAction: (result: any) =>
      Number(result?.total || 0) > 0
        ? `看了你的 BOH Cloud+ ${Number(result.total)} 条内容`
        : '看了你的 BOH Cloud+',
  });
