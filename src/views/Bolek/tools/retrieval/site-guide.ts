/**
 * site-guide.ts — 站点操作手册读连接器（plans/025 v2 · Step 4）
 */
import { BOLEK_CONNECTOR_IDS, createBolekConnector } from '@/utils/bolek-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createSiteGuideConnector = ({ read }: RetrievalConnectorDeps) =>
  createBolekConnector({
    id: BOLEK_CONNECTOR_IDS.siteGuide,
    planKey: 'siteGuide',
    label: '站点操作手册',
    source: '站点操作与路径知识库',
    evidencePrefix: 'G',
    read,
    describeAction: () => '查看了站点操作手册',
  });
