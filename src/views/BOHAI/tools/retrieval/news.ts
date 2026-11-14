/**
 * news.ts — 站内新闻 / 公告读连接器（2026-11-12 新增）
 *
 * 公开数据，不要求登录。由 `shouldUseSiteNews` 的关键词命中驱动（`planKey = 'news'`）。
 * 数据实现见 `composables/useSiteNewsRetrieval.js`（直查 `news` 表，无向量、无缓存）。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createNewsConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.siteNews,
    planKey: 'news',
    label: '站内新闻',
    source: '官方新闻 / 公告',
    evidencePrefix: 'N',
    requiresLogin: false,
    read,
    describeAction: (result: any) => {
      const total = Number(result?.total || 0);
      return total > 0 ? `查看了 ${total} 条站内新闻` : '查看了站内新闻';
    },
  });
