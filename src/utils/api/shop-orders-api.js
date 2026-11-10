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

/* 礼物单独一个上限（2026-11-02）：礼物中心退场后，购物袋是**唯一**能看礼物记录的地方，
   历史礼物必须一条不少。原来跟 ORDER_LIMIT=30 走，老用户的归档礼物会被无声截断 ——
   礼物是低频长尾记录（一次活动一份），放宽到 200 既不会拖慢首屏，也不会漏。 */
const GIFT_ORDER_LIMIT = 200;

/* 四态（2026-11-02 用户口径「准备中，已发货，完成，取消，就这四个状态就行了」）。
   DB 约束同源：shop_points_orders_status_check / check_gift_status。
   pending / processing 只作为历史值的兜底映射保留 —— 库里已归并到 preparing，
   但用户开着旧标签页时列表可能还握着旧数据，别让它显示成英文。 */
const SHOP_STATUS_LABELS = {
  preparing: '准备中',
  shipped: '已发货',
  completed: '完成',
  cancelled: '取消',
  // 历史值兜底（迁移 2026110201 已把它们归并成 preparing）
  pending: '准备中',
  processing: '准备中',
};

const LOTTERY_STATUS_LABELS = {
  open: '进行中',
  closed: '已截止',
  drawn: '已开奖',
  cancelled: '已取消',
};

/* 礼物状态词表与资产页、礼物中心保持一致（preparing / processing / shipped / completed）。
   礼物 2026-11-02 起并入购物袋订单：它是「我买/我得的实物，要看寄到哪了」，
   和商城订单、中奖记录是同一类诉求，不该再单独占资产页的一个二级页。 */
const GIFT_STATUS_LABELS = {
  preparing: '准备中',
  shipped: '已发货',
  completed: '完成',
  cancelled: '取消',
  // 历史值兜底（迁移 2026110201 已把它们归并成 preparing）
  processing: '准备中',
};

const toInt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};

/** 订单状态 → 中文（单一真源：列表、详情、后台管理都读这里，别再各写一份词表） */
export const shopStatusLabel = (status) =>
  SHOP_STATUS_LABELS[String(status || '')] || String(status || '准备中');

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
    updatedAt: row?.updated_at || null,
    status: String(row?.status || 'preparing'),
    statusLabel: shopStatusLabel(row?.status || 'preparing'),
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
    /* 下单当时的收货快照（2026-11-04）。历史订单没有这三列，前端按 null 处理并
       回落到「当前资料」—— 但要说清那是"当前"，不是"当时"。 */
    shipping: {
      recipient: String(row?.shipping_recipient || ''),
      phone: String(row?.shipping_phone || ''),
      address: String(row?.shipping_address || ''),
    },
    remark: String(row?.remark || ''),
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

const normalizeGiftOrder = (row) => {
  const status = String(row?.gift_status || 'preparing');
  const giftNo = String(row?.gift_no || '');
  return {
    kind: 'gift',
    id: String(row?.id || ''),
    orderNo: giftNo,
    title: String(row?.gift_content || '未命名礼物'),
    subtitle: Number(row?.gift_price) > 0 ? `礼物 · RMB ${Number(row.gift_price)}` : '社区礼物',
    createdAt: row?.completed_at || row?.updated_at || row?.created_at || null,
    status,
    statusLabel: GIFT_STATUS_LABELS[status] || status,
    isActive: row?.is_active !== false,
    image: String(row?.gift_image || ''),
  };
};

/* 收货快照与备注是 2026-11-04 的新列（迁移 2026110412）。前端可能先于迁移上线，
   那时按新列查会直接 42703（column does not exist）⇒ 整页订单挂掉。
   所以：先按新列查，失败再退回旧列 —— 代价只发生在"库还没迁移"的那段时间，
   一旦迁移完成，第一次查询就命中，不再多打一次请求。 */
const SHOP_ORDER_BASE_COLUMNS =
  'id, order_no, items, total_points, points_used, rmb_total, payment_mode, status, created_at, updated_at';
const SHOP_ORDER_SNAPSHOT_COLUMNS = 'shipping_recipient, shipping_phone, shipping_address, remark';

export async function fetchMyShopOrders(userId) {
  if (!userId) return { data: [], error: null };

  const query = (columns) =>
    supabase
      .from('shop_points_orders')
      .select(columns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(ORDER_LIMIT);

  let result = await query(`${SHOP_ORDER_BASE_COLUMNS}, ${SHOP_ORDER_SNAPSHOT_COLUMNS}`);

  if (result.error) {
    const code = String(result.error?.code || '');
    const message = String(result.error?.message || '');
    const isMissingColumn =
      code === '42703' || /column .* does not exist/i.test(message) || code === 'PGRST204';
    if (!isMissingColumn) {
      logger.warn('shop-orders', '加载购物订单失败', result.error);
      return { data: [], error: result.error };
    }
    // 库还没迁移：用旧列再查一次，订单列表仍然可用（只是没有快照与备注可显示）
    result = await query(SHOP_ORDER_BASE_COLUMNS);
  }

  const { data, error } = result;

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

/**
 * 我的礼物（社区赠送 / 活动奖品）。
 *
 * 真源 = user_gifts（RLS: user_id = auth.uid() 可读自己的）。
 * 以「订单」视角呈现：用户在购物袋里要看的是「这件东西到哪一步了、编号是多少」。
 *
 * ⚠️ 不按 is_active 过滤 —— 那列是「完成超 1 个月自动归档」的展示分组标记
 * （见 utils/gift-archive.js），不是删除。礼物中心退场后这里是唯一入口，
 * 若跟着过滤，历史礼物就整批消失。
 */
export async function fetchMyGiftOrders(userId) {
  if (!userId) return { data: [], error: null };

  try {
    const { data, error } = await supabase
      .from('user_gifts')
      .select(
        'id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(GIFT_ORDER_LIMIT);

    if (error) {
      logger.warn('shop-orders', '加载礼物记录失败', error);
      return { data: [], error };
    }
    return { data: (Array.isArray(data) ? data : []).map(normalizeGiftOrder), error: null };
  } catch (error) {
    logger.warn('shop-orders', '加载礼物记录异常', error);
    return { data: [], error };
  }
}

export async function fetchMyOrders(userId) {
  const [shop, lottery, gifts] = await Promise.all([
    fetchMyShopOrders(userId),
    fetchMyLotteryOrders(userId),
    fetchMyGiftOrders(userId),
  ]);
  const data = [...shop.data, ...lottery.data, ...gifts.data].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );
  // 礼物读失败不该拖垮购物/中奖两块（它是后加的一路），错误只做记录
  return { data, error: shop.error || lottery.error || null };
}

/* ── 取消订单 / 礼物（2026-11-02）──────────────────────────────────────
 *
 * 积分退还在**数据库里**做（cancel_shop_order：锁行 → 退积分 → 写流水 → 改状态，
 * 全程一个事务）。前端只负责调用与把结果翻译成人话 —— 客户端算退款金额，
 * 一旦和余额并发就会退错，这类钱的事不放在浏览器里算。
 *
 * 返回统一 { ok, message, refundedPoints?, currentPoints? }：
 *   ok=false 时 message 是可以直接给用户看的句子，调用方不要自己拼。
 */
const CANCEL_ERROR_TEXT = {
  NOT_AUTHENTICATED: '登录状态已失效，请重新登录',
  INVALID_INPUT: '参数不对，请刷新后重试',
  ORDER_NOT_FOUND: '找不到这个订单',
  ORDER_NOT_CANCELLABLE: '订单已发货，无法自助取消',
  GIFT_NOT_FOUND: '找不到这条礼物记录',
  GIFT_NOT_CANCELLABLE: '礼物已经发出，无法取消',
  // 2026-11-03 A3：cancel_shop_order 加了 20 次/小时节流
  RATE_LIMITED: '操作太频繁了，请稍后再试',
};

const readRpcFailure = (error, fallback) => {
  const raw = String(error?.message || '');
  const key = Object.keys(CANCEL_ERROR_TEXT).find((code) => raw.includes(code));
  if (key) return CANCEL_ERROR_TEXT[key];
  logger.warn('shop-orders', `${fallback}失败`, error);
  return `${fallback}失败，请稍后再试`;
};

export async function cancelShopOrder(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return { ok: false, message: '找不到这个订单' };

  const { data, error } = await supabase.rpc('cancel_shop_order', { p_order_id: id });
  if (error) return { ok: false, message: readRpcFailure(error, '取消订单') };

  const result = data && typeof data === 'object' ? data : {};
  if (result.ok !== true) {
    return {
      ok: false,
      message:
        CANCEL_ERROR_TEXT[String(result.message || '')] || String(result.message || '取消失败'),
    };
  }

  return {
    ok: true,
    alreadyCancelled: String(result.message || '') === 'ALREADY_CANCELLED',
    refundedPoints: Math.max(0, Number(result.refunded_points) || 0),
    currentPoints: Number.isFinite(Number(result.current_points))
      ? Number(result.current_points)
      : null,
  };
}

export async function cancelGift(giftId) {
  const id = String(giftId || '').trim();
  if (!id) return { ok: false, message: '找不到这条礼物记录' };

  const { data, error } = await supabase.rpc('cancel_user_gift', { p_gift_id: id });
  if (error) return { ok: false, message: readRpcFailure(error, '取消礼物') };

  const result = data && typeof data === 'object' ? data : {};
  if (result.ok !== true) {
    return {
      ok: false,
      message:
        CANCEL_ERROR_TEXT[String(result.message || '')] || String(result.message || '取消失败'),
    };
  }
  return { ok: true, alreadyCancelled: String(result.message || '') === 'ALREADY_CANCELLED' };
}

/* ── 管理员推进订单进度（2026-11-10）──────────────────────────────────
 *
 * 用户口径：「现金订单那里管理员可以推进进度吗？」——之前**商城页里没有任何入口**，
 * 只能去「数据管理 → 商城订单」改一行 status。现金单尤其别扭：钱是线下收的，
 * 收完要能立刻把「已收款、已发出」落库，而不是开后台找那一行。
 *
 * 三条边界，改之前先看：
 *   ① **不新造状态**：表里只有 preparing / shipped / completed / cancelled
 *      （shop_points_orders_status_check）。这里只允许往前推一档，
 *      cancelled 不在这条路上（用户自助走 cancel_shop_order，管理员作废走后台）。
 *   ② **通知不在这里发**：站内信由 trg_notify_shop_order_progress、进度邮件由
 *      mail_outbox 的同批触发器负责，两者都挂在 `UPDATE OF status` 上。
 *      这里再调一次 EF 就是重复发信 —— 所以只写 status，别的什么都不做。
 *   ③ **updated_at 要自己写**：这张表没有 updated_at 自动更新触发器（线上 pg_trigger
 *      里只有进度通知那一个），不显式写的话「最近更新」会永远停在下单时间。
 *
 * 权限：走 RLS `shop_points_orders_admin_update`（current_user_is_admin()）。
 * 非管理员调用时 update 影响 0 行 ⇒ 统一翻译成「没有权限」。
 */
const ADVANCE_STATUSES = new Set(['shipped', 'completed']);

export async function advanceShopOrderStatus(orderId, nextStatus) {
  const id = String(orderId || '').trim();
  const target = String(nextStatus || '').trim();
  if (!id) return { ok: false, message: '找不到这个订单' };
  if (!ADVANCE_STATUSES.has(target)) return { ok: false, message: '不支持的订单状态' };

  try {
    const { data, error } = await supabase
      .from('shop_points_orders')
      .update({ status: target, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();

    if (error) {
      logger.warn('shop-orders', '推进订单进度失败', error);
      return { ok: false, message: '推进失败，请稍后再试' };
    }
    /* 影响 0 行：要么订单不存在，要么当前账号不是管理员（RLS 直接过滤掉） */
    if (!data) return { ok: false, message: '没有权限或订单不存在' };
    return { ok: true, status: String(data.status || target) };
  } catch (error) {
    logger.warn('shop-orders', '推进订单进度异常', error);
    return { ok: false, message: '推进失败，请稍后再试' };
  }
}

/* ── 管理员订单列表（2026-11-10）──────────────────────────────────────
 *
 * 用户口径：「点击头像出现一个订单管理」——之前管理员只能进「数据管理」看表格，
 * 而推进发货、收现金这些动作发生在聊天/收款现场，需要一张能直接点的列表。
 *
 * 权限：RLS `shop_points_orders_admin_select` 让管理员读到**全部**订单，
 * 所以这里刻意**不加 user_id 过滤**（加了就又变成"只看自己的单"）。
 * 用户名不在订单表里（只有 user_id），单独查 profiles 补一列 buyerName。
 *
 * ⚠️ 先取最近 60 条、不做服务端分页：目前订单量是个位数，加游标只会增加状态。
 *    真到上百单再上分页（那时也应该同时加状态/时间筛选的服务端条件）。
 */
const ADMIN_ORDER_LIMIT = 60;

export async function fetchAllShopOrders({ limit = ADMIN_ORDER_LIMIT } = {}) {
  const take = Math.max(1, Math.min(200, Number(limit) || ADMIN_ORDER_LIMIT));
  try {
    const { data, error } = await supabase
      .from('shop_points_orders')
      .select(
        'id, order_no, user_id, items, points_used, total_points, rmb_total, payment_mode, status, created_at, updated_at, shipping_recipient, shipping_phone, shipping_address, remark',
      )
      .order('created_at', { ascending: false })
      .limit(take);

    if (error) {
      logger.warn('shop-orders', '加载全部订单失败', error);
      return { data: [], error };
    }

    const rows = Array.isArray(data) ? data : [];
    const userIds = [...new Set(rows.map((row) => String(row?.user_id || '')).filter(Boolean))];
    let nameById = new Map();
    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);
      if (profileError) logger.warn('shop-orders', '读取买家用户名失败', profileError);
      nameById = new Map(
        (Array.isArray(profiles) ? profiles : []).map((profile) => [
          String(profile?.id || ''),
          String(profile?.username || ''),
        ]),
      );
    }

    return {
      data: rows.map((row) => ({
        ...normalizeShopOrder(row),
        buyerName: nameById.get(String(row?.user_id || '')) || '未知用户',
      })),
      error: null,
    };
  } catch (error) {
    logger.warn('shop-orders', '加载全部订单异常', error);
    return { data: [], error };
  }
}
