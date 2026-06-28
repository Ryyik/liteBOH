import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
import { createNotification } from './notifications-api.js';
import { logger } from '../logger.js';
import { getForumPostParts } from '../forum-post-format.js';
import { getCloudinaryTransformedUrl } from '../cloudinary-client.js';
import {
  UNIFIED_APPROVED_STATUS,
  UNIFIED_REJECTED_STATUS,
  runKeywordPrecheck,
  runAsyncRelaxedModeration,
  writeModerationAuditLog,
  isMissingDbColumnError
} from '../unified-content-moderation.js';

const CONTENT_STATUS_FILTER = 'status.is.null,status.eq.approved';
const IMPRESSION_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const PROFILE_POST_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_720,h_540';

function normalizePageArgs(options = {}) {
  const hasPagingOption =
    Object.prototype.hasOwnProperty.call(options || {}, 'page') ||
    Object.prototype.hasOwnProperty.call(options || {}, 'pageSize');

  if (!hasPagingOption) {
    return { enabled: false, page: 1, pageSize: 20, from: 0, to: 19 };
  }

  const safePage = Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 1;
  const safePageSize = Number.isFinite(options.pageSize) ? Math.min(100, Math.max(1, Math.trunc(options.pageSize))) : 20;
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  return { enabled: true, page: safePage, pageSize: safePageSize, from, to };
}

function normalizeProfileCommentRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((comment) => {
    const postParts = comment?.post ? getForumPostParts(comment.post) : { title: '', body: '' };
    return {
      ...comment,
      post: comment?.post
        ? {
          ...comment.post,
          title: postParts.title,
          content: postParts.body
        }
        : comment?.post
    };
  });
}

function normalizeProfilePostImages(images = []) {
  return (Array.isArray(images) ? images : [])
    .filter((image) => String(image?.moderation_status || 'approved') === UNIFIED_APPROVED_STATUS)
    .map((image) => {
      const originalUrl = String(image?.url || image?.original_url || '').trim();
      if (!originalUrl) return null;
      return {
        id: String(image?.id || '').trim(),
        url: getCloudinaryTransformedUrl(originalUrl, PROFILE_POST_IMAGE_TRANSFORM),
        originalUrl,
        publicId: String(image?.public_id || image?.publicId || '').trim(),
        width: Number(image?.width || 0),
        height: Number(image?.height || 0),
        format: String(image?.format || '').trim(),
        sortOrder: Number(image?.sort_order ?? image?.sortOrder ?? 0) || 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function getProfilePostCoverFromImages(post = {}, images = []) {
  const firstImage = images[0] || null;
  if (firstImage?.url) return firstImage.url;

  const coverUrl = String(post.cover_image_url || '').trim();
  return coverUrl ? getCloudinaryTransformedUrl(coverUrl, PROFILE_POST_IMAGE_TRANSFORM) : '';
}

export async function getUserImpressions(targetId, options = {}) {
  const paging = normalizePageArgs(options);
  return executeRead(
    'impressions.getUserImpressions',
    { targetId, page: paging.page, pageSize: paging.pageSize, paging: paging.enabled },
    async () => {
      let query = supabase
        .from('user_impressions')
        .select(`
          id,
          content,
          created_at,
          author_id,
          target_id,
          moderation_status,
          moderation_reason,
          author:author_id(username, avatar_url)
        `)
        .eq('target_id', targetId)
        .eq('moderation_status', UNIFIED_APPROVED_STATUS)
        .order('created_at', { ascending: false });

      if (paging.enabled) {
        query = query.range(paging.from, paging.to);
      }

      let result = await query;
      if (!result.error) return result;

      if (!isMissingDbColumnError(result.error, 'moderation_status')) {
        return result;
      }

      logger.warn('profile-api', 'user_impressions 缺少审核列，读取降级为旧版兼容', { error: result.error });
      let fallbackQuery = supabase
        .from('user_impressions')
        .select(`
          id,
          content,
          created_at,
          author_id,
          target_id,
          author:author_id(username, avatar_url)
        `)
        .eq('target_id', targetId)
        .order('created_at', { ascending: false });

      if (paging.enabled) {
        fallbackQuery = fallbackQuery.range(paging.from, paging.to);
      }

      result = await fallbackQuery;
      return result;
    },
    { ttlMs: 15000, tags: ['impressions', `impressions:target:${targetId}`], timeoutMs: 8000, retry: 1 }
  );
}

function buildImpressionModerationInput(content = '') {
  const safeContent = String(content || '').trim();
  return `正文：${safeContent}`;
}

async function updateImpressionModerationDecision(impressionId, status, reason = '') {
  const safeId = String(impressionId || '').trim();
  if (!safeId) return;
  const normalizedStatus = status === UNIFIED_REJECTED_STATUS ? UNIFIED_REJECTED_STATUS : UNIFIED_APPROVED_STATUS;
  const payload = {
    moderation_status: normalizedStatus,
    moderation_reason: normalizedStatus === UNIFIED_APPROVED_STATUS ? null : (String(reason || '').trim() || null)
  };

  let result = await supabase
    .from('user_impressions')
    .update(payload)
    .eq('id', safeId)
    .eq('moderation_status', UNIFIED_APPROVED_STATUS);

  if (!result.error) return;
  if (!isMissingDbColumnError(result.error, 'moderation_status')) return;

  logger.warn('profile-api', 'user_impressions 缺少审核列，跳过异步回写', { error: result.error, impressionId: safeId });
}

async function scheduleImpressionModeration(impression = {}) {
  const impressionId = String(impression?.id || '').trim();
  const authorId = String(impression?.author_id || '').trim();
  const content = String(impression?.content || '').trim();
  if (!impressionId || !authorId || !content) return;

  try {
    const moderationInput = buildImpressionModerationInput(content);
    const moderationResult = await runAsyncRelaxedModeration(moderationInput, {
      scene: 'user_impression',
      timeoutMs: IMPRESSION_ASYNC_MODERATION_TIMEOUT_MS
    });

    await writeModerationAuditLog({
      targetId: impressionId,
      targetType: 'impression',
      result: moderationResult,
      moderatorId: null
    });

    if (moderationResult.status !== UNIFIED_REJECTED_STATUS) return;

    await updateImpressionModerationDecision(
      impressionId,
      UNIFIED_REJECTED_STATUS,
      moderationResult.message || moderationResult.reason || '内容审查未通过'
    );
    invalidateByTags(['impressions', `impressions:target:${impression.target_id || ''}`]);
  } catch (error) {
    logger.warn('profile-api', '异步印象审查失败（不阻断）', { impressionId, authorId, error });
  }
}

export async function addUserImpression(authorId, targetId, content) {
  const safeContent = String(content || '').trim();
  const moderationInput = buildImpressionModerationInput(safeContent);
  const keywordCheckResult = runKeywordPrecheck(moderationInput, { scene: 'user_impression' });
  if (keywordCheckResult.status === UNIFIED_REJECTED_STATUS) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'LOCAL_KEYWORD_BLOCK',
        message: keywordCheckResult.message || '命中高风险违禁词，已拒绝发布'
      })
    };
  }

  const enhancedPayload = [{
    author_id: authorId,
    target_id: targetId,
    content: safeContent,
    moderation_status: UNIFIED_APPROVED_STATUS,
    moderation_reason: null
  }];
  const legacyPayload = [{ author_id: authorId, target_id: targetId, content: safeContent }];

  let { data, error } = await supabase
    .from('user_impressions')
    .insert(enhancedPayload)
    .select();

  if (error && isMissingDbColumnError(error, 'moderation_status')) {
    logger.warn('profile-api', 'user_impressions 缺少审核列，写入降级为旧版兼容', { error });
    const fallbackResult = await supabase
      .from('user_impressions')
      .insert(legacyPayload)
      .select();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) return { ok: false, data, error: normalizeDbError(error) };

  const inserted = Array.isArray(data) ? data[0] : null;
  const insertedImpressionId = String(inserted?.id || '').trim();
  if (insertedImpressionId) {
    void scheduleImpressionModeration({
      id: insertedImpressionId,
      author_id: authorId,
      target_id: targetId,
      content: safeContent
    });
  }

  try {
    await createNotification(targetId, authorId, 'impression', { content: safeContent });
  } catch (err) {
    logger.warn('profile-api', '印象通知失败(静默)', err);
  }

  invalidateByTags(['impressions', 'notifications']);
  return { ok: true, data, error: null };
}

export async function deleteUserImpression(impressionId, currentUserId) {
  const { data: impression, error: fetchError } = await supabase
    .from('user_impressions')
    .select('author_id, target_id')
    .eq('id', impressionId)
    .single();

  if (fetchError) {
    return { ok: false, error: normalizeDbError(fetchError) };
  }

  if (impression.author_id !== currentUserId && impression.target_id !== currentUserId) {
    return { ok: false, error: normalizeDbError({ message: '没有权限删除此印象', code: 'NO_PERMISSION' }) };
  }

  const { error } = await supabase
    .from('user_impressions')
    .delete()
    .eq('id', impressionId);

  if (!error) invalidateByTags(['impressions', 'notifications']);
  return { ok: !error, error: normalizeDbError(error) };
}

export async function getProfileByUsername(username) {
  return executeRead(
    'profiles.getProfileByUsername',
    { username },
    async () => supabase
      .from('profiles')
      .select(`
        id,
        username,
        bio,
        avatar_url,
        join_date,
        points,
        birth_month,
        birth_day,
        experience,
        tags,
        role,
        is_boh_creator,
        creator_platform_ids,
        creator_platform_visibility,
        creator_platform_order,
        showcase_post_ids,
        last_active_at,
        hide_online_status
      `)
      .eq('username', username)
      .single(),
    { ttlMs: 30000, tags: ['profiles', `profiles:username:${username}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function getPostsByIds(postIds = [], options = {}) {
  const ids = Array.isArray(postIds)
    ? postIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  if (!ids.length) {
    return { ok: true, data: [], error: null };
  }

  return executeRead(
    'posts.getPostsByIds',
    { ids: ids.join(','), includeUnapprovedForAuthor: Boolean(options.includeUnapprovedForAuthor) },
    async () => {
      let query = supabase
        .from('posts')
        .select(`
          *,
          comments:comments(count),
          likes:likes(count)
        `)
        .in('id', ids);

      if (!options.includeUnapprovedForAuthor) {
        query = query.or(CONTENT_STATUS_FILTER);
      }

      const { data, error } = await query;

      if (error) return { data: [], error };

      const postMap = new Map();
      for (const post of (data || [])) {
        const parsed = getForumPostParts(post);
        postMap.set(post.id, {
          ...post,
          title: parsed.title,
          content: parsed.body,
          comment_count: post.comments?.[0]?.count || 0,
          like_count: post.likes?.[0]?.count || 0
        });
      }

      const ordered = ids.map((id) => postMap.get(id)).filter(Boolean);
      return { data: ordered, error: null };
    },
    { ttlMs: 10000, tags: ['posts'], timeoutMs: 8000, retry: 1 }
  );
}

export async function getPostsByUsername(username, userId = null, options = {}) {
  const paging = normalizePageArgs(options);
  const includeUnapprovedForAuthor = Boolean(options.includeUnapprovedForAuthor);
  return executeRead(
    'posts.getPostsByUsername',
    { username, userId, page: paging.page, pageSize: paging.pageSize, paging: paging.enabled, includeUnapprovedForAuthor },
    async () => {
      const safeUsername = String(username || '').trim();

      const baseQuery = () => supabase
        .from('posts')
        .select(`
          *,
          forum_post_images(id, url, public_id, width, height, format, sort_order, moderation_status),
          comments:comments(count),
          likes:likes(count)
        `)
        .order('created_at', { ascending: false });

      const visibleQuery = () => {
        const query = baseQuery();
        return includeUnapprovedForAuthor ? query : query.or(CONTENT_STATUS_FILTER);
      };

      let data = [];
      let error = null;

      // 同时按 author_id 和 author_username 匹配，确保不会遗漏只有其中之一的帖子。
      if (userId && safeUsername) {
        let query = baseQuery().or(`author_id.eq.${userId},author_username.eq.${safeUsername}`);
        if (!includeUnapprovedForAuthor) {
          query = query.or(CONTENT_STATUS_FILTER);
        }
        if (paging.enabled) {
          query = query.range(paging.from, paging.to);
        }
        const result = await query;
        data = result.data || [];
        error = result.error;
      } else if (userId) {
        let byIdQuery = visibleQuery().eq('author_id', userId);
        if (paging.enabled) {
          byIdQuery = byIdQuery.range(paging.from, paging.to);
        }
        const byId = await byIdQuery;
        data = byId.data || [];
        error = byId.error;
      } else if (safeUsername) {
        let byUsernameQuery = visibleQuery().eq('author_username', safeUsername);
        if (paging.enabled) {
          byUsernameQuery = byUsernameQuery.range(paging.from, paging.to);
        }
        const byUsername = await byUsernameQuery;
        data = byUsername.data || [];
        error = byUsername.error;
      }

      if (error) return { data: [], error };

      const formattedData = (data || []).map((post) => {
        const parsed = getForumPostParts(post);
        const images = normalizeProfilePostImages(post.forum_post_images || post.images || []);

        return {
          ...post,
          title: parsed.title,
          content: parsed.body,
          body: parsed.body,
          cover_image_url: getProfilePostCoverFromImages(post, images),
          images,
          image_count: Math.max(Number(post.image_count || 0), images.length),
          comment_count: post.comments?.[0]?.count || 0,
          like_count: post.likes?.[0]?.count || 0
        };
      });

      return { data: formattedData, error: null };
    },
    {
      ttlMs: 10000,
      tags: ['posts', `posts:username:${username}`, ...(userId ? [`posts:user:${userId}`] : [])],
      timeoutMs: 8000,
      retry: 1
    }
  );
}

export async function getCommentsByUsername(username, userId = null, options = {}) {
  const paging = normalizePageArgs(options);
  return executeRead(
    'comments.getCommentsByUsername',
    { username, userId, page: paging.page, pageSize: paging.pageSize, paging: paging.enabled },
    async () => {
      const safeUsername = String(username || '').trim();
      const baseQuery = () => supabase
        .from('comments')
        .select(`
          id,
          post_id,
          content,
          created_at,
          author_id,
          author_username,
          status,
          post:posts(title, body, content, author_username)
        `)
        .or(CONTENT_STATUS_FILTER)
        .order('created_at', { ascending: false });

      // 同时按 author_id 和 author_username 匹配，确保不会遗漏只有其中之一的回复。
      if (userId && safeUsername) {
        let query = supabase
          .from('comments')
          .select(`
            id,
            post_id,
            content,
            created_at,
            author_id,
            author_username,
            status,
            post:posts(title, body, content, author_username)
          `)
          .or(`author_id.eq.${userId},author_username.eq.${safeUsername}`)
          .or(CONTENT_STATUS_FILTER)
          .order('created_at', { ascending: false });

        if (paging.enabled) {
          query = query.range(paging.from, paging.to);
        }
        const result = await query;
        return { data: normalizeProfileCommentRows(result.data || []), error: result.error };
      }

      if (userId) {
        let byIdQuery = baseQuery().eq('author_id', userId);
        if (paging.enabled) {
          byIdQuery = byIdQuery.range(paging.from, paging.to);
        }
        const byId = await byIdQuery;
        if (byId.error) return byId;

        const byIdData = byId.data || [];
        if (byIdData.length > 0 || !safeUsername) {
          return { data: normalizeProfileCommentRows(byIdData), error: null };
        }

        let byUsernameQuery = baseQuery().eq('author_username', safeUsername);
        if (paging.enabled) {
          byUsernameQuery = byUsernameQuery.range(paging.from, paging.to);
        }
        const byUsername = await byUsernameQuery;
        return { data: normalizeProfileCommentRows(byUsername.data || []), error: byUsername.error };
      }

      if (!safeUsername) {
        return { data: [], error: null };
      }

      let byUsernameQuery = baseQuery().eq('author_username', safeUsername);
      if (paging.enabled) {
        byUsernameQuery = byUsernameQuery.range(paging.from, paging.to);
      }
      const byUsername = await byUsernameQuery;
      return { data: normalizeProfileCommentRows(byUsername.data || []), error: byUsername.error };
    },
    {
      ttlMs: 10000,
      tags: ['comments', `comments:username:${username}`, ...(userId ? [`comments:user:${userId}`] : [])],
      timeoutMs: 8000,
      retry: 1
    }
  );
}

const ALLOWED_PROFILE_FIELDS = new Set([
  'username', 'bio', 'avatar_url',
  'birth_month', 'birth_day',
  'shipping_recipient', 'shipping_phone', 'shipping_address',
  'pushplus_token', 'pushplus_enabled',
  'gift_status', 'gift_content', 'gift_no', 'gift_price',
  'profile_background_url', 'profile_background_public_id',
]);

export async function updateProfile(userId, updates) {
  if (!updates || typeof updates !== 'object') {
    return { ok: false, data: null, error: normalizeDbError({ message: '无效的更新数据', code: 'INVALID_INPUT' }) };
  }

  const safeUpdates = {};
  for (const key of Object.keys(updates)) {
    if (ALLOWED_PROFILE_FIELDS.has(key)) {
      safeUpdates[key] = updates[key];
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return { ok: false, data: null, error: normalizeDbError({ message: '没有可更新的字段', code: 'NO_ALLOWED_FIELDS' }) };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(safeUpdates)
    .eq('id', userId)
    .select();

  if (!error) invalidateByTags(['profiles', `profiles:user:${userId}`]);
  return { ok: !error, data, error: normalizeDbError(error) };
}

function normalizeShopOrderPayload(payload = {}) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const safe = source || {};

  return {
    ok: safe.ok !== false,
    message: String(safe.message || ''),
    orderId: safe.order_id || null,
    orderNo: safe.order_no || '',
    pointsDeducted: Number(safe.points_deducted || 0),
    currentPoints: Number(safe.current_points || 0),
    requiredPoints: Number(safe.required_points || 0),
    items: Array.isArray(safe.items) ? safe.items : []
  };
}

function normalizeShopItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const id = Number(item?.id);
      const quantity = Number(item?.quantity);
      return {
        id: Number.isInteger(id) ? id : null,
        quantity: Number.isInteger(quantity) ? quantity : 0,
        selected_spec: String(item?.selectedSpec || item?.selected_spec || ''),
        selected_spec_label: String(item?.selectedSpecLabel || item?.selected_spec_label || '')
      };
    })
    .filter((item) => Number.isInteger(item.id) && item.id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
}

export async function createShopOrderWithPoints(payload = {}) {
  const {
    items = [],
    contactType = '',
    contactValue = ''
  } = payload;

  const normalizedItems = normalizeShopItems(items);
  if (!normalizedItems.length) {
    return {
      ok: false,
      data: normalizeShopOrderPayload(),
      error: normalizeDbError({ message: '订单商品为空或格式错误', code: 'EMPTY_ITEMS' })
    };
  }

  const { data, error } = await supabase.rpc('create_shop_order_with_points', {
    p_items: normalizedItems,
    p_contact_type: String(contactType || '').trim(),
    p_contact_value: String(contactValue || '').trim()
  });

  if (error) {
    return {
      ok: false,
      data: normalizeShopOrderPayload(),
      error: normalizeDbError(error)
    };
  }

  const normalized = normalizeShopOrderPayload(data);
  if (!normalized.ok) {
    return {
      ok: false,
      data: normalized,
      error: normalizeDbError({ message: normalized.message || 'CREATE_ORDER_FAILED', code: normalized.message || 'CREATE_ORDER_FAILED' })
    };
  }

  invalidateByTags(['profiles', 'shop-points-orders']);
  return { ok: true, data: normalized, error: null };
}

export async function updateProfileBio(userId, bio) {
  return updateProfile(userId, { bio });
}

export async function updateProfileAvatar(userId, avatarUrl) {
  return updateProfile(userId, { avatar_url: avatarUrl });
}

export async function updateProfileBackground(userId, { url = '', publicId = '' } = {}) {
  return updateProfile(userId, {
    profile_background_url: url,
    profile_background_public_id: publicId
  });
}
