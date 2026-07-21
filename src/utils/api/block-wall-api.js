import { supabase } from '@/utils/supabase-client.js';
import { normalizeDbError } from '@/utils/request-core.js';
import { deleteCloudinaryAssetsByPublicIds, getCloudinaryTransformedUrl, markCloudinaryUploadsClaimed, uploadImageToCloudinary } from '@/utils/cloudinary-client.js';
import { moderateForumImageFile } from '@/utils/forum-image-moderation.js';
import { runKeywordPrecheck, runSyncStrictModeration, UNIFIED_REJECTED_STATUS } from '@/utils/unified-content-moderation.js';

const TABLE = 'block_wall_items';
const ALLOWED_COLORS = new Set(['butter', 'blush', 'mint', 'sky', 'lilac', 'cream']);

// Cloudinary 变换常量：列表拍立得显示约 158px 高，缩略图 w_420 足够覆盖 2x retina
export const BLOCK_WALL_THUMB_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_420,h_320';
export const BLOCK_WALL_THUMB_TRANSFORM_SM = 'f_auto,q_auto:good,c_fill,w_240,h_180';
export const BLOCK_WALL_LQIP_TRANSFORM = 'f_auto,q_auto:low,c_fill,w_48,h_36,e_blur:1000';
export const BLOCK_WALL_DETAIL_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1200';

const normalizeItem = (item = {}) => {
  const author = item.author || {};
  const rawImageUrl = String(item.image_url || '').trim();
  return {
    ...item,
    author_id: author.id || item.author_id,
    author_username: author.username || item.author_username,
    author_avatar_url: author.avatar_url || item.author_avatar_url || '',
    author: {
      id: author.id || item.author_id || '',
      username: author.username || item.author_username || '',
      avatar_url: author.avatar_url || item.author_avatar_url || ''
    },
    position_x: Number(item.position_x || 50),
    position_y: Number(item.position_y || 50),
    rotation: Number(item.rotation || 0),
    image_width: Number(item.image_width || 0),
    image_height: Number(item.image_height || 0),
    image_thumb_url: rawImageUrl ? getCloudinaryTransformedUrl(rawImageUrl, BLOCK_WALL_THUMB_TRANSFORM) : '',
    image_thumb_url_sm: rawImageUrl ? getCloudinaryTransformedUrl(rawImageUrl, BLOCK_WALL_THUMB_TRANSFORM_SM) : '',
    image_lqip_url: rawImageUrl ? getCloudinaryTransformedUrl(rawImageUrl, BLOCK_WALL_LQIP_TRANSFORM) : '',
    image_detail_url: rawImageUrl ? getCloudinaryTransformedUrl(rawImageUrl, BLOCK_WALL_DETAIL_TRANSFORM) : ''
  };
};

export async function listBlockWallItems(page = 1, pageSize = 40) {
  const currentPage = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 40));
  const from = (currentPage - 1) * size;
  const to = from + size - 1;
  const { data, error, count } = await supabase.from(TABLE)
    .select(`
      id, author_id, author_username, author_avatar_url,
      item_type, content, color,
      image_url, image_public_id, image_width, image_height,
      position_x, position_y, rotation, created_at, updated_at,
      author:author_id(id, username, avatar_url)
    `, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(from, to);
  const missingTable = error && (
    String(error.code || '').toUpperCase() === 'PGRST205'
    || String(error.code || '').toUpperCase() === '42P01'
    || String(error.message || '').includes('block_wall_items')
  );
  return {
    ok: !error,
    data: (data || []).map(normalizeItem),
    total: count || 0,
    hasMore: (data || []).length === size,
    error: error
      ? normalizeDbError({ ...error, message: missingTable ? '方块墙正在准备中，请稍后再来看看' : error.message }, '方块墙加载失败')
      : null
  };
}

export async function uploadBlockWallImage(file) {
  const moderation = await moderateForumImageFile(file);
  if (moderation.status !== 'approved') throw normalizeDbError({ message: moderation.reason || '图片未通过安全检测' });
  return uploadImageToCloudinary(file, { folder: 'boh-block-wall', pendingSource: 'block_wall' });
}

export async function createBlockWallItem(input = {}) {
  const type = input.itemType === 'photo' ? 'photo' : 'note';
  const content = String(input.content || '').trim().slice(0, type === 'photo' ? 80 : 420);
  if (!content && type === 'note') return { ok: false, data: null, error: normalizeDbError({ message: '纸条还没有写内容' }) };
  if (content) {
    const keyword = runKeywordPrecheck(content, { scene: 'forum_post' });
    if (keyword.status === UNIFIED_REJECTED_STATUS) return { ok: false, data: null, error: normalizeDbError({ message: keyword.message || '文字内容未通过检查' }) };
    const moderation = await runSyncStrictModeration(content, { scene: 'forum_post', timeoutMs: 12000 });
    if (moderation.status === UNIFIED_REJECTED_STATUS) return { ok: false, data: null, error: normalizeDbError({ message: moderation.message || '文字内容未通过检查' }) };
  }
  const payload = {
    author_id: input.authorId,
    author_username: String(input.authorUsername || '').trim().slice(0, 80),
    author_avatar_url: String(input.authorAvatarUrl || '').trim().slice(0, 2048) || null,
    item_type: type, content,
    color: ALLOWED_COLORS.has(input.color) ? input.color : 'butter',
    image_url: type === 'photo' ? String(input.image?.url || '') : null,
    image_public_id: type === 'photo' ? String(input.image?.publicId || '') : null,
    image_width: type === 'photo' ? Number(input.image?.width || 0) : null,
    image_height: type === 'photo' ? Number(input.image?.height || 0) : null,
    position_x: Math.min(92, Math.max(8, Number(input.positionX || 50))),
    position_y: Math.min(92, Math.max(8, Number(input.positionY || 50))),
    rotation: Math.min(8, Math.max(-8, Number(input.rotation || 0)))
  };
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) return { ok: false, data: null, error: normalizeDbError(error, '没有贴成功，请稍后重试') };
  if (payload.image_public_id) await markCloudinaryUploadsClaimed([payload.image_public_id]);
  return { ok: true, data: normalizeItem(data), error: null };
}

export async function moveBlockWallItem(id, positionX, positionY, rotation) {
  const { data, error } = await supabase.from(TABLE).update({
    position_x: Math.min(92, Math.max(8, Number(positionX || 50))),
    position_y: Math.min(92, Math.max(8, Number(positionY || 50))),
    rotation: Math.min(8, Math.max(-8, Number(rotation || 0)))
  }).eq('id', id).select().single();
  return { ok: !error, data: data ? normalizeItem(data) : null, error: error ? normalizeDbError(error, '位置保存失败') : null };
}

export async function removeBlockWallItem(item = {}) {
  const { error } = await supabase.from(TABLE).delete().eq('id', item.id);
  if (error) return { ok: false, error: normalizeDbError(error, '纸条没有取下来') };
  if (item.image_public_id) void deleteCloudinaryAssetsByPublicIds([item.image_public_id]);
  return { ok: true, error: null };
}
