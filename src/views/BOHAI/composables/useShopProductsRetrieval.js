/**
 * useShopProductsRetrieval — 商城在售商品读连接器实现（2026-11-12 新增）
 *
 * 用户口径（2026-11-12）：「商城」这类公开数据可以给所有人查，只是成员只给聚合数字。
 * 所以商品目录**不需要**管理员身份，但必须守住两条：
 *
 * 🔴 ① **必须自己过滤 `is_active = true`**。线上 `products` 表并存两条读策略：
 *    `products_public_read`（using `is_active = true`）与 `products_select_all`（using `true`）。
 *    RLS 是 OR 关系 ⇒ 实际效果是**所有商品对所有人可读**（2026-11-12 查 `pg_policy` 实测）。
 *    不主动过滤就会把 7 条已下架商品当成「在售」告诉用户（线上 17 条里 10 条在售）。
 *
 * 🔴 ② **价格单位是「分」**。`rmb_price` 线上实测：斜挎包 790、水杯 1690、SR1 9900
 *    ⇒ 分别对应 ¥7.90 / ¥16.90 / ¥99.00。少除 100 会把 7.9 元说成 790 元。
 *
 * ③ 不拉 `image` / `specifications` / `card_layout`：对「有什么周边、多少钱、还有货吗」
 *    这类问题没有信息量，只会吃预算。
 */
import { fetchActiveProducts } from '@/utils/api/bohai-retrieval-api.js';
import { normalizePromptLine } from '../utils/text/normalize.js';

const MAX_PRODUCTS = 8;
const FETCH_LIMIT = 24;
const LINE_MAX_CHARS = 220;

const clamp = (value, max = LINE_MAX_CHARS) => normalizePromptLine(value, max);

/** 分 → ¥ 字符串（整数分，保留两位；null/0 视为「不单独售价」） */
export const formatRmbPrice = (cents) => {
  const value = Number(cents);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `¥${(value / 100).toFixed(2)}`;
};

const formatPoints = (points) => {
  const value = Number(points);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${Math.round(value)} 积分`;
};

/**
 * 按 `payment_mode` 拼价格文案。
 * 线上取值：`combined`（积分 + 现金）、`points_only`、`rmb_only`（推测）。
 * 未知取值时**兜底把两种都列出来**（宁可多给，不要漏掉真实价格）。
 */
export const formatProductPrice = (row = {}) => {
  const points = formatPoints(row?.points_cost);
  const rmb = formatRmbPrice(row?.rmb_price);
  const mode = String(row?.payment_mode || '').trim();
  if (mode === 'points_only') return points || '积分兑换';
  if (mode === 'rmb_only') return rmb || '价格未标注';
  if (mode === 'combined') {
    if (points && rmb) return `${points} 或 ${rmb}`;
    return points || rmb || '价格未标注';
  }
  if (points && rmb) return `${points} 或 ${rmb}`;
  return points || rmb || '价格未标注';
};

/** 可购买 / 库存 / 上架状态拼成一句副标（只给用户需要决策的信息） */
const buildAvailabilityNote = (row = {}) => {
  const notes = [];
  const stock = Number(row?.stock);
  if (Number.isFinite(stock)) {
    if (stock <= 0) notes.push('暂时缺货');
    else if (stock <= 3) notes.push(`仅剩 ${stock} 件`);
  }
  if (row?.is_purchasable === false) notes.push('暂不可购买');
  return notes.join('，');
};

const scoreProductRow = (row, queryText) => {
  const query = clamp(queryText, 120).toLowerCase();
  if (!query) return 0;
  const title = clamp(row?.title, 120).toLowerCase();
  const category = clamp(row?.category, 40).toLowerCase();
  const description = clamp(row?.description, 300).toLowerCase();
  let score = 0;
  for (let i = 0; i < query.length - 1; i += 1) {
    const token = query.slice(i, i + 2);
    if (!token.trim()) continue;
    if (title.includes(token)) score += 3;
    else if (category.includes(token)) score += 2;
    else if (description.includes(token)) score += 1;
  }
  return score;
};

/**
 * @param {string} queryText
 * @returns {Promise<{context: string, total: number, labels: string[]}>}
 */
export const getProductsContext = async (queryText = '') => {
  const data = await fetchActiveProducts({ limit: FETCH_LIMIT });

  const rows = Array.isArray(data) ? data.filter((row) => clamp(row?.title, 80)) : [];
  if (rows.length === 0) {
    return { context: '【商城商品】当前没有在售商品。', total: 0, labels: [] };
  }

  const scored = rows.map((row) => ({ row, score: scoreProductRow(row, queryText) }));
  const hasHit = scored.some((item) => item.score > 0);
  const pool = hasHit ? scored.filter((item) => item.score > 0) : scored;

  const picked = pool
    .slice()
    .sort((a, b) => {
      if (hasHit && b.score !== a.score) return b.score - a.score;
      // 泛问时保持 sort_order（站内展示顺序），不再二次排序
      return Number(a.row?.sort_order ?? 0) - Number(b.row?.sort_order ?? 0);
    })
    .slice(0, MAX_PRODUCTS)
    .map((item) => item.row);

  const lines = picked.map((row) => {
    const title = clamp(row?.title, 60);
    const category = clamp(row?.category, 20);
    const price = formatProductPrice(row);
    const availability = buildAvailabilityNote(row);
    const description = clamp(row?.description, 90);
    const meta = [category, price, availability].filter(Boolean).join('，');
    return `- 「${title}」${meta ? `（${meta}）` : ''}${description ? `：${description}` : ''}`;
  });

  return {
    context: `【商城商品】（在售 ${rows.length} 件）\n${lines.join('\n')}`,
    total: picked.length,
    labels: ['商城商品'],
  };
};
