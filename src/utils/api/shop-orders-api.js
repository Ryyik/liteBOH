/**
 * 我的订单（购物 + 抽奖）
 *
 * 购物订单真源 = shop_points_orders（RLS: auth.uid() = user_id 可读自己的）
 * 抽奖订单真源 = lottery_entries（RLS: user_id = auth.uid() 或管理员）
 *
 * 抽奖条目表只存 lottery_id，不含标题/开奖状态 ⇒ 两步查询（先 entries、再 lotteries），
 * 不依赖 FK 内联 join —— 远端 FK 名称换过一次，内联写法在这里静默返回 null 的风险太高。
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
  const { data: lotteries, error: lotteryError } = await supabase
    .from('lotteries')
    .select('id, title, prize_title, status, draw_at, drawn_at, winner_user_id, cover_image_url')
    .in('id', lotteryIds);

  if (lotteryError) {
    logger.warn('shop-orders', '加载抽奖活动信息失败', lotteryError);
    return { data: [], error: lotteryError };
  }

  const lotteryMap = new Map((lotteries || []).map((row) => [String(row.id), row]));
  return {
    data: entries
      .map((entry) => {
        const lottery = lotteryMap.get(String(entry.lottery_id));
        if (!lottery) return null;
        return normalizeLotteryOrder(
          { ...entry, isWinner: String(lottery.winner_user_id || '') === String(userId) },
          lottery,
        );
      })
      /* 2026-11-01 用户口径：「购物袋页面订单只显示中奖的抽奖」。
         中奖判定在客户端做（winner_user_id vs uid），所以过滤必须放在
         normalize 之后 —— 不能指望 lottery_entries 上有 is_winner 列。
         未中奖的参与记录不再出现在订单里：那一批是「抽奖记录」，
         正确的归宿是活动页本身，混进订单会把真实订单挤下去。 */
      .filter((order) => Boolean(order && order.isWinner)),
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
