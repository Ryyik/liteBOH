/**
 * 生日页数据口（2026-11-12 起「自动化」）
 *
 * 为什么没有 birthday_events 了：
 *   以前生日页要先在后台建一条 event（寿星 + 日期 + 文案），没建就只剩空态。
 *   实测线上 0 条 event、19 个有生日的用户 ⇒ 页面 364 天都是死的。
 *   现在页面内容直接由 profiles.birth_month / birth_day 合成，
 *   祝福归属改为 (target_user_id, celebration_date)，见迁移
 *   `2026111201_birthday_auto_from_profiles.sql`。
 *
 * 为什么读 profiles 不用 RPC：
 *   profiles 对 anon 开放了列级 SELECT（id / username / avatar_url /
 *   birth_month / birth_day / is_banned，RLS `profiles_select_public` 为 true）。
 *   直接查 + 前端纯函数算日期（src/utils/birthday.js）比再加一个
 *   SECURITY DEFINER 函数更少权限面，且日期逻辑可单测。
 *
 * ⚠️ 不要往 BIRTHDAY_PROFILE_COLUMNS 里加 email / shipping_* / login_banned：
 *   这些列对 anon 没有 SELECT 授权，加进来整条查询会 42501。
 */
import { supabase } from '@/utils/supabase-client.js';

export const BIRTHDAY_PROFILE_COLUMNS = 'id,username,avatar_url,birth_month,birth_day,is_banned';

export const BIRTHDAY_WISH_COLUMNS =
  'id,author_name,author_id,content,is_featured,likes,created_at';

/** 单条祝福最多字数（与页面 textarea 的 maxlength 对齐） */
export const BIRTHDAY_WISH_MAX_LENGTH = 300;

/**
 * 取所有填了生日的用户。数据量 = 有生日的用户数（现 19），一次取完足够。
 * 封禁账号在调用侧过滤（is_banned 对 anon 可读）。
 * @returns {Promise<Array<{id:string,username:string,avatar_url:string|null,birth_month:string,birth_day:string,is_banned:boolean|null}>>}
 */
export const fetchBirthdayProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select(BIRTHDAY_PROFILE_COLUMNS)
    .not('birth_month', 'is', null)
    .not('birth_day', 'is', null)
    .order('username', { ascending: true })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

/**
 * 取某一场生日（同一天可能有多位寿星）已展示的祝福。
 * @param {object} params
 * @param {string[]} params.targetUserIds 寿星 id 列表
 * @param {string} params.celebrationDate 'YYYY-MM-DD'
 */
export const fetchBirthdayWishes = async ({ targetUserIds = [], celebrationDate = '' } = {}) => {
  if (!celebrationDate || targetUserIds.length === 0) return [];
  const { data, error } = await supabase
    .from('birthday_wishes')
    .select(BIRTHDAY_WISH_COLUMNS)
    .in('target_user_id', targetUserIds)
    .eq('celebration_date', celebrationDate)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

/**
 * 提交祝福。RLS 强制 author_id = auth.uid()、status = 'approved'
 * （没有审批界面了，pending 等于永不展示），所以这里必须两者都传对。
 */
export const submitBirthdayWish = async ({
  targetUserId,
  celebrationDate,
  authorId,
  authorName,
  content,
} = {}) => {
  const name = String(authorName || '').trim();
  const text = String(content || '').trim();
  if (!targetUserId || !celebrationDate) throw new Error('缺少寿星或生日日期');
  if (!authorId) throw new Error('登录后才能提交祝福');
  if (!name) throw new Error('请填写名字');
  if (!text) throw new Error('请填写祝福内容');
  if (text.length > BIRTHDAY_WISH_MAX_LENGTH) throw new Error('祝福内容过长');

  const { error } = await supabase.from('birthday_wishes').insert({
    target_user_id: targetUserId,
    celebration_date: celebrationDate,
    author_id: authorId,
    author_name: name,
    content: text,
    status: 'approved',
    is_featured: false,
    likes: 0,
  });
  if (error) throw error;
};
