/**
 * 我的订单（购物 + 抽奖）
 *
 * 购物订单真源 = shop_points_orders（RLS: auth.uid() = user_id 可读自己的）
 * 抽奖订单真源 = lottery_entries（RLS: user_id = auth.uid() 或管理员）
 *
 * 抽奖条目表只存 lottery_id，不含标题/开奖状态 ⇒ 两步查询（先 entries、再 lotteries），
 * 不依赖 FK 内联 join —— 远端 FK 名称换过一次，内联写法在这里静默返回 null 的风险太高。
 *
 * ⚠️ 中奖判定不能只看 `lotteries.winner_user_id`：那一列只存**首位**中奖者
 *    （开奖时 `winner_user_id = v_first_winner.user_id`），而 winner_count 支持多个名额，
 *    完整名单在 `lottery_draw_logs`（RLS 只给管理员）里，客户端只能通过
 *    get_community_lotteries / get_home_lottery 这两个 RPC 拿到的 `winners` 数组读。
 *    ⇒ 判定 = RPC winners 命中 ∪ winner_user_id 命中。少了前一项，第 2..N 名中奖用户
 *    会在「中奖」里看不到自己的记录。
 */

import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

const ORDER_LIMIT = 30;

const SHOP_STATUS_LABELS = {
  pending: '待处理',
  paid: '待发货',
  processing: '备货中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const LOTTERY_STATUS_LABELS = {
  open: '进行中',
  closed: '已截止',
  drawn: '已开奖',
  cancelled: '已取消',
};

const toInt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

const normalizeShopItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: Number(item?.id) || 0,
      title: String(item?.title || item?.name || '未知商品'),
      quantity: Math.max(1, toInt(item?.quantity) || 1),
      specLabel: String(item?.selected_spec_label || item?.selectedSpecLabel || '默认规格'),
      image: String(item?.image || ''),
    }))
    .filter((item) => item.title);
};

const formatRmb = (cents) => {
  const value = toInt(cents);
  return value > 0 ? `¥${(value / 100).toFixed(2)}` : '';
};

const normalizeShopOrder = (row) => {
  const items = normalizeShopItems(row?.items);
  const paymentMode = String(row?.payment_mode || 'points_only');
  const points = toInt(row?.points_used ?? row?.total_points);
  const rmb = toInt(row?.rmb_total);
  return {
    kind: 'shop',
    id: String(row?.id || row?.order_no || ''),
    orderNo: String(row?.order_no || ''),
    title: items[0]?.title || '周边订单',
    subtitle:
      items.length > 1 ? `${items[0].specLabel} 等 ${items.length} 件` : items[0]?.specLabel || '',
    createdAt: row?.created_at || null,
    status: String(row?.status || 'pending'),
    statusLabel:
      SHOP_STATUS_LABELS[String(row?.status || 'pending')] || String(row?.status || '待处理'),
    paymentMode,
    points,
    rmb,
    priceText:
      paymentMode === 'rmb_only'
        ? formatRmb(rmb) || '—'
        : paymentMode === 'combined'
          ? [points ? `${points} 积分` : '', formatRmb(rmb)].filter(Boolean).join(' + ')
          : `${points} 积分`,
    items,
  };
};

const normalizeLotteryOrder = (entry, lottery) => {
  const status = String(lottery?.status || 'closed');
  const isWinner = Boolean(entry?.isWinner);
  return {
    kind: 'lottery',
    id: String(entry?.id || ''),
    orderNo: String(entry?.id || '')
      .slice(0, 8)
      .toUpperCase(),
    title: String(lottery?.title || lottery?.prize_title || '抽奖活动'),
    subtitle: lottery?.prize_title ? String(lottery.prize_title) : '',
    createdAt: entry?.created_at || null,
    status,
    statusLabel: LOTTERY_STATUS_LABELS[status] || status,
    isWinner,
    resultText:
      status === 'drawn'
        ? isWinner
          ? '已中奖'
          : '未中奖'
        : LOTTERY_STATUS_LABELS[status] || '待开奖',
    drawAt: lottery?.draw_at || lottery?.drawn_at || null,
    image: String(lottery?.cover_image_url || ''),
  };
};

export async function fetchMyShopOrders(userId) {
  if (!userId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('shop_points_orders')
    .select(
      'id, order_no, items, total_points, points_used, rmb_total, payment_mode, status, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(ORDER_LIMIT);

  if (error) {
    logger.warn('shop-orders', '加载购物订单失败', error);
    return { data: [], error };
  }
  return { data: (Array.isArray(data) ? data : []).map(normalizeShopOrder), error: null };
}

/**
 * 中奖名单索引：lotteryId -> Set<userId>。
 * 两个 RPC 都取（社区列表 + 首页单场）—— 用户参与的活动可能只挂在其中一边。
 * 任一失败都只是让「多中奖名额」这一路退化回 winner_user_id，不影响主流程。
 */
const fetchWinnerIndex = async () => {
  const index = new Map();
  const addLottery = (lottery) => {
    const id = String(lottery?.id || '');
    if (!id) return;
    const set = index.get(id) || new Set();
    for (const winner of Array.isArray(lottery?.winners) ? lottery.winners : []) {
      const uid = String(winner?.user_id || '');
      if (uid) set.add(uid);
    }
    const legacy = String(lottery?.winner_user_id || '');
    if (legacy) set.add(legacy);
    index.set(id, set);
  };

  try {
    const [community, home] = await Promise.all([
      supabase.rpc('get_community_lotteries'),
      supabase.rpc('get_home_lottery'),
    ]);
    if (!community?.error && Array.isArray(community?.data)) community.data.forEach(addLottery);
    const homeData = home?.error ? null : home?.data;
    if (homeData && typeof homeData === 'object' && !Array.isArray(homeData)) addLottery(homeData);
  } catch (error) {
    logger.warn('shop-orders', '加载中奖名单失败，回落到 winner_user_id 判定', error);
  }
  return index;
};

/**
 * 纯函数：把我的抽奖参与记录收敛成「中奖订单」。
 *
 * 抽出来是为了能脱离 supabase 单测 —— 这条判定错一次的直接后果就是
 * 用户在自己的订单里看不到中奖记录，或在订单里看到没中奖的活动。
 *
 * 规则：
 *   1. 只保留中奖的（winners 命中 或 winner_user_id 命中），未中奖的参与记录一律不出现；
 *   2. 同一活动多次参与只出一条（订单列表里同一活动重复三行毫无意义）；
 *   3. 查不到活动行（已删除/不可见）跳过 —— 没有标题的状态没法展示。
 */
export function buildWinningLotteryOrders({ entries, lotteries, winnerIndex, userId } = {}) {
  const me = String(userId || '');
  if (!me) return [];

  const lotteryMap = new Map(
    (Array.isArray(lotteries) ? lotteries : []).map((row) => [String(row?.id || ''), row]),
  );
  const seen = new Set();
  const orders = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const lotteryId = String(entry?.lottery_id || '');
    if (!lotteryId || seen.has(lotteryId)) continue;
    const lottery = lotteryMap.get(lotteryId);
    if (!lottery) continue;

    const winners = winnerIndex instanceof Map ? winnerIndex.get(lotteryId) : null;
    const isWinner = Boolean(winners?.has(me)) || String(lottery?.winner_user_id || '') === me;
    if (!isWinner) continue;

    seen.add(lotteryId);
    orders.push(normalizeLotteryOrder({ ...entry, isWinner: true }, lottery));
  }
  return orders;
}

export async function fetchMyLotteryOrders(userId) {
  if (!userId) return { data: [], error: null };

  const { data: entries, error } = await supabase
    .from('lottery_entries')
    .select('id, lottery_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(ORDER_LIMIT);

  if (error) {
    logger.warn('shop-orders', '加载抽奖记录失败', error);
    return { data: [], error };
  }
  if (!entries?.length) return { data: [], error: null };

  const lotteryIds = [...new Set(entries.map((entry) => entry.lottery_id).filter(Boolean))];
  const [{ data: lotteries, error: lotteryError }, winnerIndex] = await Promise.all([
    supabase
      .from('lotteries')
      .select('id, title, prize_title, status, draw_at, drawn_at, winner_user_id, cover_image_url')
      .in('id', lotteryIds),
    fetchWinnerIndex(),
  ]);

  if (lotteryError) {
    logger.warn('shop-orders', '加载抽奖活动信息失败', lotteryError);
    return { data: [], error: lotteryError };
  }

  /* 2026-11-01 用户口径：「购物袋页面订单只显示中奖的抽奖」。
     中奖判定在客户端做（开奖日志只对管理员开放），过滤与去重都在
     buildWinningLotteryOrders 里 —— 那里有单测，别在组件层再写一遍。 */
  return {
    data: buildWinningLotteryOrders({ entries, lotteries, winnerIndex, userId }),
    error: null,
  };
}

export async function fetchMyOrders(userId) {
  const [shop, lottery] = await Promise.all([
    fetchMyShopOrders(userId),
    fetchMyLotteryOrders(userId),
  ]);
  const data = [...shop.data, ...lottery.data].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );
  return { data, error: shop.error || lottery.error || null };
}
