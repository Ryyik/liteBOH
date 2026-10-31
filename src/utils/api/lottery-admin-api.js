/**
 * 抽奖管理端接口（代报名）。
 *
 * 为什么单独一个文件：`lottery-api.js` 是**用户侧**报名（走 auth.uid() 自助报名），
 * 这里全部是管理员动作，走 admin_* RPC 与后台才有的读权限。混在一起会让
 * 「这段代码用哪个身份跑」变得看不清 —— 这个仓库出过好几次「管理员页面调了
 * 用户侧接口，本地看不出问题、线上 RLS 全拒」的事故。
 */
import { supabase } from '@/utils/supabase-client.js';
import { normalizeDbError } from '@/utils/request-core.js';

const str = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

/**
 * 代报名用的抽奖清单。
 *
 * 刻意**不筛状态**：管理员要能看到已截止/已开奖的抽奖（那正是需要强制加人的场景），
 * 由 RPC 决定要不要 force，而不是在这里提前把选项藏掉 —— 藏掉之后管理员只会
 * 觉得「列表里怎么没有这个抽奖」。
 */
export async function listLotteriesForGrant({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('lotteries')
    .select('id,title,status,draw_at,entry_deadline_at,max_entries,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: [], error };

  return {
    data: (data || []).map((row) => ({
      id: str(row.id),
      title: str(row.title, '未命名抽奖'),
      status: str(row.status, 'open'),
      draw_at: row.draw_at || null,
      entry_deadline_at: row.entry_deadline_at || null,
      max_entries: row.max_entries == null ? null : Number(row.max_entries),
      created_at: row.created_at || null,
    })),
    error: null,
  };
}

/** 按用户名搜索可报名的用户。空关键词不查库（避免把整张 profiles 拉回来）。 */
export async function searchUsersForGrant(keyword, { limit = 10 } = {}) {
  const q = str(keyword);
  if (!q) return { data: [], error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,avatar_url')
    .ilike('username', `%${q}%`)
    .order('username', { ascending: true })
    .limit(limit);

  if (error) return { data: [], error };

  return {
    data: (data || []).map((row) => ({
      id: str(row.id),
      username: str(row.username, '（未命名）'),
      avatar_url: str(row.avatar_url),
    })),
    error: null,
  };
}

/**
 * 代报名。
 *
 * 返回结构沿用 RPC 的 jsonb：`{ ok, code, message, entry_count, forced, blocked_reasons }`。
 * 这里**不把 ok=false 抛成异常** —— 「需要强制加人」「已在名单里」都是可预期的业务分支，
 * 调用方要能拿到 blocked_reasons 去渲染成可勾选的提示，而不是一条错误文案。
 */
export async function adminJoinLottery({ lotteryId, userId, reason = '', force = false }) {
  const safeLotteryId = str(lotteryId);
  const safeUserId = str(userId);
  if (!safeLotteryId) return { data: null, error: new Error('请先选择抽奖') };
  if (!safeUserId) return { data: null, error: new Error('请先选择用户') };

  const { data, error } = await supabase.rpc('admin_join_lottery', {
    p_lottery_id: safeLotteryId,
    p_user_id: safeUserId,
    p_reason: str(reason) || null,
    p_force: Boolean(force),
  });

  if (error) {
    return { data: null, error: new Error(normalizeDbError(error)?.message || error.message) };
  }

  return { data: data || null, error: null };
}
