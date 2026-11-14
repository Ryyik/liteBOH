/**
 * 管理台概览页数据口（2026-11-12）
 *
 * 只做两件事：4 个状态计数、一个待处理收件箱。
 * 口径全部落在**已被后台验证过**的枚举上（见 2026111201 之前的 DB CHECK）：
 *   · 待发货   shop_points_orders.status = 'preparing'
 *   · 待处理举报 forum_post_reports.status = 'active'
 *   · 待开奖   lotteries.status = 'open' 且 draw_at <= now()
 *   · 7 日新增 profiles.join_date >= (今天 - 7d)
 *
 * ⚠️ `profiles` **没有 `created_at` 列**（2026-11-14 实测：`column "created_at" does not exist`，
 *    SQLSTATE 42703）。入站时间只有 `join_date`（date，无时分秒），所以这里传的是
 *    `YYYY-MM-DD` 而不是 ISO 时间戳 —— 用 `toISOString()` 整串去比 date 列，
 *    PostgREST 会按 UTC 切日，与库里 `current_date` 写入的日期差一天。
 *
 * 设计约束：
 *   1. 任一指标查询失败返回 null（页面显示「—」），**不要**返回 0 ——
 *      0 会被读成「没有待办」，比报错更危险。
 *   2. 计数一律 head + count，不拉行；只有收件箱取前 20 行用于展示。
 *   3. 这里不写库。动作的写入路径在目标页，概览页只负责跳转。
 */
import { supabase } from '@/utils/supabase-client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const countOf = async (builder) => {
  const { count, error } = await builder;
  if (error) throw error;
  return Number(count || 0);
};

const countOrNull = async (builder) => {
  try {
    return await countOf(builder);
  } catch {
    return null;
  }
};

/**
 * 4 个状态计数。返回 `{ pendingShipments, activeReports, dueDraws, newUsers7d }`，
 * 单项失败为 null。
 */
export const fetchOverviewCounts = async ({ now = new Date() } = {}) => {
  /* join_date 是 date 列（DB 侧由 auth 触发器用 current_date 写入，即 UTC 日期），
     所以这里也取 UTC 日期切片 —— 两端同口径，不会因为设备时区把「今天」推前一天。 */
  const since7d = new Date(now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  const nowIso = now.toISOString();

  const [pendingShipments, activeReports, dueDraws, newUsers7d] = await Promise.all([
    countOrNull(
      supabase
        .from('shop_points_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'preparing'),
    ),
    countOrNull(
      supabase
        .from('forum_post_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
    ),
    countOrNull(
      supabase
        .from('lotteries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .lte('draw_at', nowIso),
    ),
    countOrNull(
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('join_date', since7d),
    ),
  ]);

  return { pendingShipments, activeReports, dueDraws, newUsers7d };
};

const hoursSince = (iso, now) => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now.getTime() - t) / (60 * 60 * 1000));
};

/**
 * 待处理收件箱（前 20 条原始数据，排序与裁剪在页面做）。
 * 三个来源各自独立失败：哪一个挂了只少一类，不会整块空掉。
 */
export const fetchPendingInbox = async ({ now = new Date(), limit = 20 } = {}) => {
  const [orders, reports, draws] = await Promise.allSettled([
    supabase
      .from('shop_points_orders')
      .select('id,order_no,created_at,status')
      .eq('status', 'preparing')
      .order('created_at', { ascending: true })
      .limit(limit),
    supabase
      .from('forum_post_reports')
      .select('id,post_id,reason,created_at,status')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('lotteries')
      .select('id,title,draw_at,status')
      .eq('status', 'open')
      .lte('draw_at', now.toISOString())
      .order('draw_at', { ascending: true })
      .limit(limit),
  ]);

  const rows = [];

  if (orders.status === 'fulfilled' && Array.isArray(orders.value.data)) {
    for (const row of orders.value.data) {
      const waitingHours = hoursSince(row.created_at, now);
      rows.push({
        id: `order-${row.id}`,
        type: '交易',
        title: `订单 ${row.order_no || row.id.slice(0, 8)} 已付款待发货`,
        createdAt: row.created_at,
        severity: waitingHours >= 24 ? 'danger' : 'warning',
        actionLabel: '去发货',
        to: { path: '/admin/data-management', query: { tab: 'shopOrders', status: 'preparing' } },
      });
    }
  }

  if (reports.status === 'fulfilled' && Array.isArray(reports.value.data)) {
    for (const row of reports.value.data) {
      rows.push({
        id: `report-${row.id}`,
        type: '内容',
        title: `帖子举报待处理${row.reason ? `：${row.reason}` : ''}`,
        createdAt: row.created_at,
        severity: 'danger',
        actionLabel: '去处理',
        /* ⚠️ 落点必须是 `forumPostReports`（forum_post_reports 表），不是 `reportedPosts`：
           后者是 **posts** 表的「举报下架」视图，tab 级基础过滤写死 `status='limited'`，
           再叠一个 `status='active'` 就是 `limited AND active` ⇒ 恒 0 行（posts.status 的合法值
           只有 approved/limited/rejected）。2026-11-14 修。 */
        to: {
          path: '/admin/data-management',
          query: { tab: 'forumPostReports', status: 'active' },
        },
      });
    }
  }

  if (draws.status === 'fulfilled' && Array.isArray(draws.value.data)) {
    for (const row of draws.value.data) {
      rows.push({
        id: `draw-${row.id}`,
        type: '活动',
        title: `抽奖「${row.title || '未命名'}」已到开奖时间`,
        createdAt: row.draw_at,
        severity: 'danger',
        actionLabel: '去开奖',
        to: { path: '/admin/data-management', query: { tab: 'lotteries', status: 'open' } },
      });
    }
  }

  const weight = { danger: 0, warning: 1, muted: 2 };
  rows.sort((a, b) => {
    const diff = (weight[a.severity] ?? 9) - (weight[b.severity] ?? 9);
    if (diff !== 0) return diff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return rows;
};

/** 概览页首屏一次性取数：计数 + 收件箱 */
export const fetchOverviewSnapshot = async ({ now = new Date() } = {}) => {
  const [counts, inbox] = await Promise.all([
    fetchOverviewCounts({ now }),
    fetchPendingInbox({ now }),
  ]);
  return { counts, inbox };
};
