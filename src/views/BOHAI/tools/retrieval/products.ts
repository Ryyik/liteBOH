/**
 * products.ts — 商城在售商品读连接器（2026-11-12 新增）
 *
 * 公开数据（用户 2026-11-12 口径：商品对所有人开放，只有「成员」限聚合数字）。
 * 由 `shouldUseShopProducts` 的关键词命中驱动（`planKey = 'products'`）。
 *
 * ⚠️ 「只给在售」这条不是靠 RLS 保证的 —— `products` 上有一条 `select_all using true`，
 * 过滤写在数据实现里（见 `composables/useShopProductsRetrieval.js` 文件头 ①）。
 */
import { BOHAI_CONNECTOR_IDS, createBohAIConnector } from '@/utils/bohai-connectors.js';
import type { RetrievalConnectorDeps } from '../types';

export const createProductsConnector = ({ read }: RetrievalConnectorDeps) =>
  createBohAIConnector({
    id: BOHAI_CONNECTOR_IDS.shopProducts,
    planKey: 'products',
    label: '商城商品',
    source: '商城在售商品',
    evidencePrefix: 'P',
    requiresLogin: false,
    read,
    describeAction: (result: any) => {
      const total = Number(result?.total || 0);
      return total > 0 ? `查看了 ${total} 件在售商品` : '查看了商城商品';
    },
  });
