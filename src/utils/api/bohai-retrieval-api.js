/**
 * BOHAI 读连接器的数据出口（2026-11-14）
 *
 * 三个读连接器（成员统计 / 商城商品 / 站内新闻）原先把 `supabase.from(...)` 直接写在
 * `views/BOHAI/composables/*` 里，被 `check-layering` 判为「视图层直连数据层」。
 * 按仓库约定收口到本模块：视图层只 import 这里的函数，supabase 只出现在 utils/api 下。
 *
 * 语义与过滤条件逐字搬自原实现，**不改行为**。三条安全口径原样保留：
 *
 * 🔴 成员统计只准 count（`head: true`，不取行）。`profiles` 的行级策略是
 *    `profiles_select_public using true`（行级全开），真正的保护在列级 GRANT：
 *    `shipping_phone` / `shipping_address` / `pushplus_token` 对 anon / authenticated 都不可读，
 *    但 `username` / `birth_month` / `birth_day` 可读 —— 一旦改成返回行的查询，
 *    明细就跟着上下文出去了。
 *    另：`profiles` 没有 `created_at`，入站时间是 `join_date`（date，无时分秒）。
 *
 * 🔴 商品必须自己过滤 `is_active = true`。线上 `products` 并存两条读策略
 *    （`products_public_read using is_active=true` 与 `products_select_all using true`），
 *    RLS 是 OR 关系 ⇒ 实际对所有人可读。不主动过滤就会把已下架商品当成「在售」告诉用户。
 *
 * 🔴 新闻不要求登录：`news` 的 RLS 是「允许所有人读取」。
 */
import { supabase } from '@/utils/supabase-client.js';

/**
 * 成员计数（只发 count，不取行）。
 * @param {{ fromDate?: string, onDate?: string }} opts
 *   `fromDate` → `join_date >= fromDate`（本周新增）
 *   `onDate`   → `join_date =  onDate`  （今日新增）
 */
export const countProfiles = async ({ fromDate = '', onDate = '' } = {}) => {
  let query = supabase.from('profiles').select('id', { count: 'exact', head: true });
  if (fromDate) query = query.gte('join_date', fromDate);
  if (onDate) query = query.eq('join_date', onDate);
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
};

/** 在售商品（`is_active = true`，按 sort_order 展示顺序） */
export const fetchActiveProducts = async ({ limit = 24 } = {}) => {
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, category, title, description, stock, points_cost, rmb_price, payment_mode, is_purchasable, is_active, sort_order',
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

/** 站内新闻 / 公告（列表级字段，不含 content 全文 —— 正文会吃光上下文预算） */
export const fetchNewsRows = async ({ limit = 24 } = {}) => {
  const { data, error } = await supabase
    .from('news')
    .select('id, category, title, excerpt, date, author')
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
};
