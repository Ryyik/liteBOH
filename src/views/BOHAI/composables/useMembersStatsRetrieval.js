/**
 * useMembersStatsRetrieval — 成员**聚合数字**读连接器实现（2026-11-12 新增）
 *
 * 用户口径（2026-11-12）：「成员只给聚合数字」—— 不给昵称、生日、地址、积分等任何明细。
 * 所以这里只发 `head: true` 的 count 请求（**不取行**），连一列数据都不落到前端。
 *
 * ⚠️ 两条必须知道的事实（2026-11-12 实测，别凭直觉改）：
 *   ① `profiles` 的行级策略是 `profiles_select_public using true` —— 行级是**全开**的。
 *      真正的保护在**列级 GRANT**：`shipping_phone` / `shipping_address` / `pushplus_token`
 *      对 `anon` 和 `authenticated` 都不可读（`has_column_privilege` 实测 false）。
 *      但 `username` / `birth_month` / `birth_day` 是可读的 —— 所以**这个连接器绝不能
 *      改成一个会返回行的查询**，否则明细就跟着 context 出去了。只准 count。
 *   ② `profiles` 没有 `created_at`，入站时间是 `join_date`（date 类型，无时分秒）。
 *      用 `created_at` 会直接报列不存在。
 *
 * 表很小（2026-11-12：33 位成员），精确 count 的成本可忽略；成员数上到十万级时
 * 要改成物化统计，别在这里硬扛。
 */
import { supabase } from '@/utils/supabase-client.js';

const DAY_MS = 86400000;

/** `YYYY-MM-DD`（用本地日期，与 join_date 同口径；注意别用 toISOString，它会按 UTC 切日） */
const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const countProfiles = async (build = (query) => query) => {
  const query = build(supabase.from('profiles').select('id', { count: 'exact', head: true }));
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
};

/**
 * @returns {Promise<{context: string, total: number, labels: string[]}>}
 *   `total` 用成员总数（不是「取了几条」）—— 活动行会显示「成员 ×33」，语义正确。
 */
export const getMembersStatsContext = async () => {
  const today = new Date();
  const todayKey = toDateKey(today);
  const weekAgoKey = toDateKey(new Date(today.getTime() - 6 * DAY_MS));

  const [total, weekNew, todayNew] = await Promise.all([
    countProfiles(),
    countProfiles((query) => query.gte('join_date', weekAgoKey)),
    countProfiles((query) => query.eq('join_date', todayKey)),
  ]);

  const lines = [
    `- 成员总数：${total} 位`,
    `- 近 7 天新增：${weekNew} 位（自 ${weekAgoKey} 起）`,
    `- 今日新增：${todayNew} 位（${todayKey}）`,
  ];

  return {
    context: [
      '【成员概况】（仅聚合数字，不含任何成员明细）',
      ...lines,
      '如用户想看具体是谁、某人资料，请引导到「成员」页面查看，不要在这里推测。',
    ].join('\n'),
    total,
    labels: ['成员概况'],
  };
};
