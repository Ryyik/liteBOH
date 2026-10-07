/**
 * index.ts — 读连接器**注册表**（plans/025 v2 · Step 4「Tool Registry」）
 *
 * 本文件只做**注册与编排**：8 个 connector 各自一文件（`cloud` / `shared-memory` / `knowledge` /
 * `site-guide` / `forum` / `user-private` / `health` / `site-activities`），
 * 每个的 `read` 由调用方（`useKnowledgeRetrieval`）注入。
 *
 * ⚠️ `BOHAI_CONNECTOR_IDS` 与 `createBohAIConnector` 工厂的**真源在全局**
 * `src/utils/bohai-connectors.js`，本目录只引用、不复制。
 */
import { createCloudConnector } from './cloud';
import { createForumConnector } from './forum';
import { createHealthConnector } from './health';
import { createKnowledgeConnector } from './knowledge';
import { createSharedMemoryConnector } from './shared-memory';
import { createSiteActivitiesConnector } from './site-activities';
import { createSiteGuideConnector } from './site-guide';
import { createUserPrivateConnector } from './user-private';

/** 注册表入参：调用方把 8 个「取数函数」注入进来。 */
export interface ReadConnectorDeps {
  getTreeholeContext: (queryText: string) => Promise<unknown>;
  getSharedMemoryContext: (queryText: string) => Promise<unknown>;
  getMemoryContext: (queryText: string) => Promise<unknown>;
  getSiteGuideContext: (queryText: string) => Promise<unknown>;
  getForumContext: (queryText: string) => Promise<unknown>;
  getUserPrivateContext: (queryText: string) => Promise<unknown>;
  getHealthContext: (queryText: string) => Promise<unknown>;
  getActivitiesContext: () => Promise<unknown>;
}

/**
 * 组装 8 个读连接器。
 *
 * ⚠️ **顺序即展示顺序**（`describeAction` 汇总、来源 chip 的排序都按它）。
 */
export const createReadConnectors = (deps: ReadConnectorDeps) => [
  createCloudConnector({ read: deps.getTreeholeContext }),
  createSharedMemoryConnector({ read: deps.getSharedMemoryContext }),
  createKnowledgeConnector({ read: deps.getMemoryContext }),
  createSiteGuideConnector({ read: deps.getSiteGuideContext }),
  createForumConnector({ read: deps.getForumContext }),
  createUserPrivateConnector({ read: deps.getUserPrivateContext }),
  createHealthConnector({ read: deps.getHealthContext }),
  createSiteActivitiesConnector({ read: deps.getActivitiesContext }),
];
