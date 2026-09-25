/**
 * 头像框清单与积分解锁 API
 *
 * 分层：
 *   - 清单（avatar_frames）是真相源，前端内置清单只作「种子 + DB 抖动时的降级兜底」（见 useAvatarFrame.js）
 *   - 积分解锁台账（user_avatar_frames）只经 RPC 写入，前端仅读自己的解锁集合
 *   - 价格、档位门槛、是否已解锁的判定全部在服务端（purchase_avatar_frame / is_avatar_frame_owned_by），
 *     前端传的任何金额一律被忽略
 */
import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
import { CACHE_TTL_LEVELS } from '../cache-strategy.js';

const FRAME_TAGS = ['avatar-frames'];
const FRAME_COLUMNS = 'id,name,description,url,source_url,scale,tier,free_until,points_price,sort_order,status,ring,updated_at';

/** DB 行 -> 前端清单项（字段名与内置清单一套口径：desc/freeUntil/pointsPrice） */
export function normalizeAvatarFrameRow(row = {}) {
  const price = row.points_price;
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    desc: String(row.description || ''),
    url: String(row.url || ''),
    sourceUrl: String(row.source_url || ''),
    scale: Number(row.scale) || 1.24,
    tier: String(row.tier || 'free'),
    freeUntil: row.free_until ? String(row.free_until).slice(0, 10) : null,
    pointsPrice: price === null || price === undefined || price === '' ? null : Number(price),
    sortOrder: Number(row.sort_order ?? 100),
    status: String(row.status || 'draft'),
    ring: String(row.ring || ''),
    updatedAt: row.updated_at || null
  };
}

/** 已发布清单（用户端用；带 30s 缓存，发布后由管理端 invalidate 掉） */
export async function listPublishedAvatarFrames(options = {}) {
  return executeRead('avatarFrames.listPublished', {}, async () => {
    const { data, error } = await supabase
      .from('avatar_frames')
      .select(FRAME_COLUMNS)
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    // executeRead 会把 fetcher 返回对象里除 data/error 之外的字段**铺到结果上**：
    // 直接 return 数组会让数组索引变成结果的 0/1/2... 字段，而 data 永远为 null。
    // 所以这里必须回传 PostgREST 形状的 { data, error }。
    return { data: error ? null : (data || []).map(normalizeAvatarFrameRow), error };
  }, { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: FRAME_TAGS, ...options });
}

/** 管理端全量清单（含 draft / archived），不走缓存 */
export async function listAllAvatarFrames() {
  const { data, error } = await supabase
    .from('avatar_frames')
    .select(FRAME_COLUMNS)
    .order('status', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    return { ok: false, data: [], error: normalizeDbError(error) };
  }
  return { ok: true, data: (data || []).map(normalizeAvatarFrameRow), error: null };
}

/** 新建 / 更新一个框（管理端）。id 一旦发布不可改，这里只做 upsert */
export async function upsertAvatarFrame(payload = {}) {
  const row = {
    id: String(payload.id || '').trim(),
    name: String(payload.name || '').trim(),
    description: String(payload.desc || '').trim(),
    url: String(payload.url || '').trim(),
    scale: Number(payload.scale) || 1.24,
    tier: String(payload.tier || 'free'),
    free_until: payload.freeUntil || null,
    points_price: payload.pointsPrice === null || payload.pointsPrice === undefined || payload.pointsPrice === ''
      ? null
      : Number(payload.pointsPrice),
    sort_order: Number(payload.sortOrder ?? 100),
    status: String(payload.status || 'draft'),
    ring: String(payload.ring || ''),
    updated_at: new Date().toISOString()
  };
  if (payload.sourceUrl !== undefined) row.source_url = String(payload.sourceUrl || '');

  if (!row.id) {
    return { ok: false, data: null, error: normalizeDbError({ message: '缺少 id', code: 'MISSING_ID' }) };
  }

  const { data, error } = await supabase
    .from('avatar_frames')
    .upsert(row, { onConflict: 'id' })
    .select(FRAME_COLUMNS)
    .single();

  if (error) return { ok: false, data: null, error: normalizeDbError(error) };
  invalidateByTags(FRAME_TAGS);
  return { ok: true, data: normalizeAvatarFrameRow(data), error: null };
}

/** 下架 / 归档（不物理删除：存量 profile.avatar_frame_url 还指着它，删了老佩戴会反查不到 scale） */
export async function setAvatarFrameStatus(id, status) {
  const { error } = await supabase
    .from('avatar_frames')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: normalizeDbError(error) };
  invalidateByTags(FRAME_TAGS);
  return { ok: true, error: null };
}

/** 我的积分解锁集合（frame_id 列表） */
export async function listMyAvatarFrameUnlocks() {
  const { data, error } = await supabase.rpc('list_my_avatar_frame_unlocks');
  if (error) return { ok: false, data: [], error: normalizeDbError(error) };
  return { ok: true, data: Array.isArray(data) ? data.map(String) : [], error: null };
}

/** 积分解锁（服务端定价 + 幂等 + 余额校验） */
export async function purchaseAvatarFrame(frameId) {
  const { data, error } = await supabase.rpc('purchase_avatar_frame', { p_frame_id: String(frameId || '') });
  if (error) return { ok: false, error: normalizeDbError(error) };

  const safe = Array.isArray(data) ? (data[0] || {}) : (data || {});
  return {
    ok: safe.ok !== false,
    message: String(safe.message || ''),
    alreadyOwned: safe.already_owned === true,
    pointsDeducted: Number(safe.points_deducted || 0),
    currentPoints: Number(safe.current_points || 0),
    requiredPoints: Number(safe.required_points || 0),
    error: null
  };
}

/**
 * 按人发放（抽奖专属 / 活动限定）
 *
 * 服务端唯一写入口：user_avatar_frames 的 RLS 只开 SELECT，客户端无法直接插；
 * grant_avatar_frame 内部校验管理员，幂等（已持有则不动，不会抹掉积分购买凭证）。
 * source 由调用方声明，与积分解锁的 'points' 区分开，便于事后审计。
 */
export async function grantAvatarFrame({ userId, frameId, source = 'activity' } = {}) {
  const pUserId = String(userId || '').trim();
  const pFrameId = String(frameId || '').trim();
  if (!pUserId || !pFrameId) {
    return { ok: false, message: 'MISSING_ARGS', error: null };
  }
  const { data, error } = await supabase.rpc('grant_avatar_frame', {
    p_user_id: pUserId,
    p_frame_id: pFrameId,
    p_source: String(source || 'activity').trim() || 'activity'
  });
  if (error) return { ok: false, message: error.message, error: normalizeDbError(error) };

  const safe = Array.isArray(data) ? (data[0] || {}) : (data || {});
  return {
    ok: safe.ok !== false,
    message: String(safe.message || ''),
    source: String(safe.source || ''),
    error: null
  };
}

// 仅用于区分「输入的是 UUID 还是用户名」，不是业务规则
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 用户名或 UUID → 用户 id（发放前的解析；用户名走 profiles 精确匹配） */
export async function resolveGrantTarget(raw) {
  const value = String(raw || '').trim();
  if (!value) return { ok: false, reason: 'EMPTY' };
  if (UUID_LIKE.test(value)) return { ok: true, userId: value, username: '' };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', value)
    .maybeSingle();

  if (error) return { ok: false, reason: 'QUERY_FAILED' };
  if (!data?.id) return { ok: false, reason: 'NOT_FOUND' };
  return { ok: true, userId: data.id, username: String(data.username || '') };
}
