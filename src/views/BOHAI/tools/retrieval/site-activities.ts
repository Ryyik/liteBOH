/**
 * site-activities.ts — 站内活动 / 抽奖 / 演出读连接器（plans/025 v2 · Step 4）
 *
 * 2026-10-04 新增。三者都是公开数据（**不要求登录**），由 `shouldUseSiteActivities`
 * 的关键词命中驱动（`planKey = activities`）。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createSiteActivitiesConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.siteActivities,
    planKey: 'activities',
    label: '站内活动与抽奖',
    source: '站内活动 / 抽奖 / 创作者演出',
    evidencePrefix: 'A',
    requiresLogin: false,
    read,
    describeAction: (result: any) => {
      const labels = Array.isArray(result?.labels) ? result.labels : [];
      return labels.length > 0 ? `查看了${labels.join('、')}` : '查看了站内活动';
    },
  });
