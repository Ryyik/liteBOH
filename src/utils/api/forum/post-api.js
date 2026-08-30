import { supabase } from '../../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../../request-core.js';
import { CACHE_TTL_LEVELS } from '../../cache-strategy.js';
import { logger } from '../../logger.js';
import { markCloudinaryUploadsClaimed } from '../../cloudinary-client.js';
import { deleteCloudinaryAssetsByPublicIds } from '../../cloudinary-client.js';
import {
  runKeywordPrecheck,
  runAsyncRelaxedModeration,
  runSyncStrictModeration
} from '../../unified-content-moderation.js';
import { cleanupOrphanedUploads } from '../../cloud-upload-guard.js';
import {
  ALLOWED_CONTENT_STATUS,
  APPROVED_STATUS,
  FORUM_IMAGE_MAX_COUNT,
  REJECTED_STATUS,
  applyForumTagFilter,
  buildPostModerationInput,
  getEffectiveForumTag,
  matchesForumTagFilter,
  normalizeContentStatus,
  normalizeForumDraftRecord,
  normalizeForumImagePostError,
  normalizeForumImages,
  normalizeForumReportError,
  normalizeForumTag,
  normalizePostListRows,
  normalizePostRecord,
  splitPostContent,
  toForumImageRpcPayload
} from '../forum-format.js';
import {
  getForumPostImages
} from '../forum-images-api.js';
import {
  isMissingRpcFunctionError,
  writeAsyncModerationLog,
  ensureModerationNotification
} from './_shared.js';

const ALLOWED_SORT_MODE = new Set(['latest', 'hottest']);
const POST_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const POST_REJECTED_NOTIFICATION_TYPE = 'post_rejected';

function normalizePagination(pagination = {}) {
  const page = Math.max(1, Number(pagination.page || 1));
  const pageSize = Math.max(1, Number(pagination.pageSize || 10));
  const offset = Math.max(0, Number(
    pagination.offset !== undefined ? pagination.offset : (page - 1) * pageSize
  ));
  const limit = Math.max(1, Number(pagination.limit || pageSize));
  return { page, pageSize, offset, limit };
}

function encodePostCursor(payload = {}) {
  try {
    return btoa(JSON.stringify(payload));
  } catch (_error) {
    return '';
  }
}

function decodePostCursor(cursorToken = '') {
  const safeToken = String(cursorToken || '').trim();
  if (!safeToken) return null;

  try {
    const parsed = JSON.parse(atob(safeToken));
    const createdAt = String(parsed?.createdAt || parsed?.created_at || '').trim();
    const id = String(parsed?.id || '').trim();
    if (!createdAt || !id) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(createdAt)) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return { createdAt, id };
  } catch (_error) {
    return null;
  }
}

function buildNextPostCursor(rows = [], hasMore = false) {
  if (!hasMore || !Array.isArray(rows) || rows.length === 0) return '';
  const last = rows[rows.length - 1];
  const createdAt = String(last?.created_at || '').trim();
  const id = String(last?.id || '').trim();
  if (!createdAt || !id) return '';
  return encodePostCursor({ createdAt, id });
}

function withAbortSignal(query, signal) {
  if (!signal || typeof query?.abortSignal !== 'function') return query;
  return query.abortSignal(signal);
}

function resolveFallbackUsernameFromAuthUser(user = null) {
  const safeUser = user || {};
  const fromMeta = String(safeUser.user_metadata?.username || '').trim();
  if (fromMeta) return fromMeta;

  const email = String(safeUser.email || '').trim();
  if (email.includes('@')) {
    const account = String(email.split('@')[0] || '').trim();
    if (account) return account.slice(0, 40);
  }

  const userId = String(safeUser.id || '').trim();
  if (userId) {
    return `user_${userId.slice(0, 8)}`;
  }
  return '';
}

async function resolvePostAuthorIdentity(authorId, authorUsername) {
  let safeAuthorId = String(authorId || '').trim();
  let safeAuthorUsername = String(authorUsername || '').trim();

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (!authError && authData?.user?.id) {
      const authUser = authData.user;
      const authUserId = String(authUser.id || '').trim();
      if (authUserId) {
        // 统一以当前会话用户为准，避免本地状态滞后导致 RLS 拒绝。
        safeAuthorId = authUserId;
      }
      if (!safeAuthorUsername) {
        safeAuthorUsername = resolveFallbackUsernameFromAuthUser(authUser);
      }
    }
  } catch (error) {
    logger.warn('forum-api', '解析当前登录用户失败，继续使用调用方参数', { error });
  }

  if (!safeAuthorUsername) {
    safeAuthorUsername = safeAuthorId ? `user_${safeAuthorId.slice(0, 8)}` : '';
  }

  return {
    authorId: safeAuthorId,
    authorUsername: safeAuthorUsername
  };
}

async function schedulePostModeration(post = {}) {
  const postId = String(post.id || '').trim();
  const authorId = String(post.author_id || '').trim();
  const content = String(post.content || '').trim();
  if (!postId || !authorId || !content) return;

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 发帖场景采用"先发后审"：创建成功后异步复审，避免审查服务波动阻断发布。
      const moderationInput = buildPostModerationInput(content);
      const moderationResult = await runAsyncRelaxedModeration(moderationInput, {
        scene: 'forum_post',
        timeoutMs: POST_ASYNC_MODERATION_TIMEOUT_MS
      });
      await writeAsyncModerationLog(postId, 'post', moderationResult);

      if (moderationResult.status !== REJECTED_STATUS) {
        return;
      }

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          status: REJECTED_STATUS,
          updated_at: new Date().toISOString()
        })
        .eq('id', postId)
        .eq('author_id', authorId)
        .eq('status', APPROVED_STATUS);

      if (updateError) {
        logger.warn('forum-api', '异步发帖审查回写失败', {
          postId,
          authorId,
          attempt,
          error: updateError
        });
        return;
      }

      await ensureModerationNotification({
        recipientId: authorId,
        type: POST_REJECTED_NOTIFICATION_TYPE,
        postId
      });

      invalidateByTags(['posts', 'profiles', 'notifications']);
      return;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      logger.warn('forum-api', `异步发帖审查失败（第${attempt}次，${isLastAttempt ? '已耗尽重试次数' : '即将重试'}）`, {
        postId,
        authorId,
        attempt,
        error
      });
      if (isLastAttempt) {
        logger.warn('forum-api', '异步发帖审查已耗尽所有重试次数，帖子保持当前状态', { postId, authorId });
        return;
      }
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function formatPosts(rawPosts = [], currentUserId = null) {
  return rawPosts.map((post) => {
    const {
      comments,
      likes,
      likes_count,
      author,
      user_likes,
      ...rest
    } = post;

    return {
      ...rest,
      comment_count: rest.comment_count ?? comments?.[0]?.count ?? 0,
      like_count: rest.like_count ?? likes_count?.[0]?.count ?? likes?.[0]?.count ?? 0,
      author_avatar_url: author?.avatar_url,
      author_is_banned: Boolean(author?.is_banned),
      isLiked: currentUserId ? Boolean(user_likes?.some((like) => like.user_id === currentUserId)) : false
    };
  });
}

function hasRpcLikeState(row = {}) {
  return typeof row?.isLiked === 'boolean' || typeof row?.is_liked === 'boolean';
}

function normalizeRpcReplyPreview(replies = []) {
  const source = Array.isArray(replies) ? replies : [];
  return source.map((reply) => ({
    ...reply,
    author_avatar_url: reply?.author_avatar_url || reply?.author?.avatar_url || null,
    author_is_banned: Boolean(reply?.author_is_banned ?? reply?.author?.is_banned)
  }));
}

function normalizeSortMode(sortMode, fallback = 'latest') {
  const normalized = String(sortMode || '').trim().toLowerCase();
  return ALLOWED_SORT_MODE.has(normalized) ? normalized : fallback;
}

async function attachLikedFlags(posts = [], userId = null) {
  const safePosts = Array.isArray(posts) ? posts : [];
  if (safePosts.every(hasRpcLikeState)) {
    return safePosts.map((post) => ({
      ...post,
      isLiked: typeof post.isLiked === 'boolean' ? post.isLiked : Boolean(post.is_liked)
    }));
  }

  if (!userId || !Array.isArray(posts) || posts.length === 0) {
    return (posts || []).map((post) => ({ ...post, isLiked: false }));
  }

  const postIds = posts.map((post) => post.id).filter(Boolean);
  if (!postIds.length) {
    return posts.map((post) => ({ ...post, isLiked: false }));
  }

  const { data: likeRows, error } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if (error) {
    logger.warn('forum-api', '批量查询点赞状态失败，降级为未点赞', { error, userId, postCount: postIds.length });
    return posts.map((post) => ({ ...post, isLiked: false }));
  }

  const likedPostIdSet = new Set((likeRows || []).map((row) => row.post_id));
  return posts.map((post) => ({
    ...post,
    isLiked: likedPostIdSet.has(post.id)
  }));
}

function normalizeWeeklyCheckinPayload(payload = {}) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const safe = source || {};
  const streakTotal = Number(safe.streak_total ?? safe.current_streak ?? 0);
  const cycleSize = Math.max(1, Number(safe.cycle_size || 4));
  const cycleProgress = Math.max(0, Number(
    safe.cycle_progress ?? (streakTotal === 0 ? 0 : ((streakTotal - 1) % cycleSize) + 1)
  ));
  const hasSignedThisWeek = Boolean(safe.has_signed_this_week);

  return {
    ok: safe.ok !== false,
    alreadySigned: Boolean(safe.already_signed),
    hasSignedThisWeek,
    streakTotal,
    currentStreak: streakTotal,
    cycleProgress,
    cycleSize,
    rewardCompletedThisWeek: Boolean(
      safe.reward_completed_this_week ?? (hasSignedThisWeek && streakTotal > 0 && cycleProgress === cycleSize)
    ),
    pointsAwarded: Number(safe.points_awarded || 0),
    currentPoints: Number(safe.current_points || 0),
    nextRewardIn: Number(safe.next_reward_in || 4),
    currentWeekStart: safe.current_week_start || null,
    message: String(safe.message || '')
  };
}

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function getPreviousWeekDateString(isoDate) {
  if (!isIsoDateString(isoDate)) return null;
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(utcDate.getTime())) return null;
  utcDate.setUTCDate(utcDate.getUTCDate() - 7);
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcNextRewardIn(streak) {
  const normalizedStreak = Math.max(0, Number(streak || 0));
  const value = 4 - (normalizedStreak % 4);
  return value === 0 ? 4 : value;
}

function calcCycleProgress(streak) {
  const normalizedStreak = Math.max(0, Number(streak || 0));
  return normalizedStreak === 0 ? 0 : ((normalizedStreak - 1) % 4) + 1;
}

function computeStreakFromWeekSet(anchorWeek, weekSet) {
  if (!anchorWeek || !weekSet?.size) return 0;
  let targetWeek = anchorWeek;
  let streak = 0;

  while (targetWeek && weekSet.has(targetWeek)) {
    streak += 1;
    targetWeek = getPreviousWeekDateString(targetWeek);
  }

  return streak;
}

async function enrichWeeklyCheckinStatusFallback(status, userId = null) {
  if (!status || status.hasSignedThisWeek || Number(status.currentStreak || 0) > 0) {
    return status;
  }

  const safeUserId = String(userId || '').trim();
  if (!safeUserId) {
    return status;
  }

  const currentWeekStart = String(status.currentWeekStart || '').trim();
  if (!isIsoDateString(currentWeekStart)) {
    return status;
  }

  const anchorWeek = getPreviousWeekDateString(currentWeekStart);
  if (!anchorWeek) {
    return status;
  }

  const { data, error } = await supabase
    .from('forum_weekly_checkins')
    .select('week_start_date')
    .eq('user_id', safeUserId)
    .lte('week_start_date', anchorWeek)
    .order('week_start_date', { ascending: false })
    .limit(32);

  if (error || !Array.isArray(data) || data.length === 0) {
    return status;
  }

  const weekSet = new Set(
    data
      .map((item) => String(item?.week_start_date || '').trim())
      .filter((dateStr) => isIsoDateString(dateStr))
  );

  const computedStreak = computeStreakFromWeekSet(anchorWeek, weekSet);
  if (computedStreak <= 0) {
    return status;
  }

  return {
    ...status,
    streakTotal: computedStreak,
    currentStreak: computedStreak,
    cycleProgress: calcCycleProgress(computedStreak),
    cycleSize: 4,
    rewardCompletedThisWeek: false,
    nextRewardIn: calcNextRewardIn(computedStreak)
  };
}

export async function getPosts(userId = null, pagination = {}) {
  const { page, pageSize, offset, limit } = normalizePagination(pagination);
  const normalizedPageSize = Math.max(1, Number(pageSize || 10));
  const shouldOverfetch = Number(limit) > normalizedPageSize;
  const fallbackLimit = shouldOverfetch ? normalizedPageSize + 1 : normalizedPageSize;
  const sortMode = normalizeSortMode(pagination.sortMode || pagination.sort || 'latest');
  const searchQuery = String(pagination.searchQuery || '').trim();
  const tagFilter = normalizeForumTag(pagination.tag || pagination.tagFilter || '');
  const includeUnapprovedForAuthor = Boolean(pagination.includeUnapprovedForAuthor);
  const cursorMode = String(pagination.cursorMode || '').trim().toLowerCase();
  const cursorToken = String(pagination.cursor || '').trim();
  const abortSignal = pagination.signal;
  const followingUserIds = pagination.followingUserIds;
  const parsedCursor = decodePostCursor(cursorToken);
  const useCursorMode = (cursorMode === 'keyset' || Boolean(parsedCursor))
    && sortMode === 'latest'
    && !searchQuery
    && !(Array.isArray(followingUserIds) && followingUserIds.length);

  return executeRead(
    'posts.getPosts',
    {
      userId,
      page,
      pageSize: normalizedPageSize,
      offset,
      limit,
      sortMode,
      searchQuery,
      tagFilter,
      includeUnapprovedForAuthor,
      cursorMode,
      cursorToken,
      followingUserIds: Array.isArray(followingUserIds) ? followingUserIds.sort().join(',') : null
    },
    async () => {
      if (useCursorMode) {
        const statusFilter = 'status.is.null,status.eq.approved';
        let query;
        if (userId) {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              user_likes:likes!left(user_id),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        }

        query = query
          .or(statusFilter)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(normalizedPageSize + 1);

        query = applyForumTagFilter(query, tagFilter);

        if (parsedCursor?.createdAt && parsedCursor?.id) {
          query = query.or(
            `created_at.lt.${parsedCursor.createdAt},and(created_at.eq.${parsedCursor.createdAt},id.lt.${parsedCursor.id})`
          );
        }

        const { data, error } = await withAbortSignal(query, abortSignal);
        if (error) return { data: [], error };

        const formattedRows = normalizePostListRows(formatPosts(data || [], userId));
        const hasMore = formattedRows.length > normalizedPageSize;
        const pagedRows = formattedRows.slice(0, normalizedPageSize);
        const nextCursor = buildNextPostCursor(pagedRows, hasMore);
        return { data: pagedRows, error: null, hasMore, nextCursor };
      }

      const rpcPage = page;
      // list_forum_posts 采用 page + page_size 计算 offset，不能传递 overfetch limit（会导致翻页错位漏帖）。
      const rpcPageSize = normalizedPageSize;

      const rpcPayload = {
        p_page: rpcPage,
        p_page_size: rpcPageSize,
        p_sort: sortMode,
        p_author_id: null,
        p_include_author_non_approved: includeUnapprovedForAuthor,
        p_search_query: searchQuery || null,
        p_tag_filter: tagFilter || null,
        p_following_user_ids: Array.isArray(followingUserIds) && followingUserIds.length
          ? followingUserIds
          : null
      };

      let { data: rpcData, error: rpcError } = await withAbortSignal(
        supabase.rpc('list_forum_posts', rpcPayload),
        abortSignal
      );
      if (rpcError && isMissingRpcFunctionError(rpcError, 'list_forum_posts')) {
        const legacyPayload = { ...rpcPayload };
        delete legacyPayload.p_tag_filter;
        const legacyResult = await withAbortSignal(
          supabase.rpc('list_forum_posts', legacyPayload),
          abortSignal
        );
        rpcData = tagFilter && Array.isArray(legacyResult.data)
          ? legacyResult.data.filter((row) => matchesForumTagFilter(row?.tag, tagFilter))
          : legacyResult.data;
        rpcError = legacyResult.error;
      }

      if (rpcError) {
        const fallbackReason = isMissingRpcFunctionError(rpcError, 'list_forum_posts')
          ? '缺少 list_forum_posts RPC，回退旧查询逻辑'
          : 'list_forum_posts RPC 调用失败，回退旧查询逻辑';
        logger.warn('forum-api', fallbackReason, rpcError);

        const statusFilter = 'status.is.null,status.eq.approved';
        let query;
        if (userId) {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              user_likes:likes!left(user_id),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        }

        query = query.or(statusFilter);
        query = applyForumTagFilter(query, tagFilter);
        if (Array.isArray(followingUserIds) && followingUserIds.length) {
          query = query.in('author_id', followingUserIds);
        }

        const { data, error } = await withAbortSignal(
          query
            .order('created_at', { ascending: false })
            .range(offset, offset + fallbackLimit - 1),
          abortSignal
        );

        if (error) return { data: [], error };
        const formattedRows = normalizePostListRows(formatPosts(data || [], userId));
        const hasMore = shouldOverfetch
          ? formattedRows.length > normalizedPageSize
          : formattedRows.length >= normalizedPageSize;
        const pagedRows = shouldOverfetch
          ? formattedRows.slice(0, normalizedPageSize)
          : formattedRows;
        const nextCursor = buildNextPostCursor(pagedRows, hasMore);
        return { data: pagedRows, error: null, hasMore, nextCursor };
      }

      const safeRows = Array.isArray(rpcData) ? rpcData : [];
      const withLikeState = await attachLikedFlags(safeRows, userId);
      const normalizedRows = normalizePostListRows(withLikeState
        .slice(0, normalizedPageSize)
        .map((row) => ({
          ...row,
          comment_count: Number(row.comment_count || 0),
          like_count: Number(row.like_count || 0),
          isLiked: typeof row.isLiked === 'boolean' ? row.isLiked : Boolean(row.is_liked),
          replies: normalizeRpcReplyPreview(row.replies),
          replies_has_more: Boolean(row.replies_has_more),
          replies_preloaded: Array.isArray(row.replies),
          search_excerpt: row.search_excerpt || null,
          hot_score: Number(row.hot_score || 0),
          search_rank: Number(row.search_rank || 0)
        })));
      const rpcHasMore = safeRows.find((row) => typeof row?.has_more === 'boolean')?.has_more;
      const hasMore = typeof rpcHasMore === 'boolean' ? rpcHasMore : safeRows.length >= normalizedPageSize;
      const nextCursor = buildNextPostCursor(normalizedRows, hasMore);
      return { data: normalizedRows, error: null, hasMore, nextCursor };
    },
    { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['posts'], timeoutMs: 8000, retry: 1 }
  );
}

export async function getPostsCount(userId = null, { countMode = 'planned' } = {}) {
  const statusFilter = 'status.is.null,status.eq.approved';
  const safeCountMode = ['exact', 'planned', 'estimated'].includes(countMode) ? countMode : 'planned';

  const { data, error, ok } = await executeRead(
    'posts.getPostsCount',
    { userId, countMode: safeCountMode },
    async () => {
      const { count, error } = await supabase
        .from('posts')
        .select('id', { count: safeCountMode, head: true })
        .or(statusFilter);
      if (error) return { data: { count: 0 }, error };
      return { data: { count: count || 0 }, error: null };
    },
    { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['posts'], timeoutMs: 8000, retry: 1 }
  );

  return { ok, count: data?.count || 0, data, error };
}

export async function getForumTagStats() {
  const { data, error, ok } = await executeRead(
    'posts.getForumTagStats',
    {},
    async () => {
      const { data, error } = await supabase.rpc('get_forum_tag_stats');
      if (!error) return { data, error: null };

      if (!isMissingRpcFunctionError(error, 'get_forum_tag_stats')) {
        return { data: [], error };
      }

      const fallback = await supabase
        .from('posts')
        .select('tag')
        .eq('status', APPROVED_STATUS)
        .not('tag', 'is', null);
      if (fallback.error) return { data: [], error: fallback.error };

      const counts = new Map();
      for (const row of (fallback.data || [])) {
        const tag = normalizeForumTag(row?.tag);
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }

      return {
        data: [...counts.entries()].map(([tag, count]) => ({ tag, post_count: count })),
        error: null
      };
    },
    { ttlMs: CACHE_TTL_LEVELS.STATIC_DATA, tags: ['posts'], timeoutMs: 8000, retry: 1 }
  );

  return { ok, data: Array.isArray(data) ? data : [], error: normalizeDbError(error) };
}

export async function getPostEngagementStats(postId) {
  const safePostId = String(postId || '').trim();
  if (!safePostId) {
    return {
      ok: false,
      data: { commentCount: 0, likeCount: 0 },
      error: normalizeDbError({ message: '缺少帖子 ID' })
    };
  }

  const { data: counterRow, error: counterError } = await supabase
    .from('posts')
    .select('comment_count, like_count')
    .eq('id', safePostId)
    .single();

  if (!counterError && counterRow) {
    return {
      ok: true,
      data: {
        commentCount: Number(counterRow.comment_count || 0),
        likeCount: Number(counterRow.like_count || 0)
      },
      error: null
    };
  }

  const [commentRes, likeRes] = await Promise.all([
    supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', safePostId)
      .or('status.is.null,status.eq.approved'),
    supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', safePostId)
  ]);

  const error = commentRes.error || likeRes.error;
  return {
    ok: !error,
    data: {
      commentCount: Number(commentRes.count || 0),
      likeCount: Number(likeRes.count || 0)
    },
    error: normalizeDbError(error)
  };
}

export async function createPostWithImages(content, authorId, authorUsername, status = 'approved', title = '', images = [], tag = '', location = null, options = {}) {
  const safeImages = normalizeForumImages(images);
  const safeTag = normalizeForumTag(tag);
  if (safeImages.length > FORUM_IMAGE_MAX_COUNT) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'FORUM_IMAGE_LIMIT',
        message: `每个帖子最多发布 ${FORUM_IMAGE_MAX_COUNT} 张图片`
      })
    };
  }

  const safeTitle = String(title || '').trim();
  const safeContent = String(content || '').trim();
  if (!safeTitle) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'EMPTY_POST_CONTENT',
        message: '请填写标题'
      })
    };
  }

  const {
    authorId: resolvedAuthorId,
    authorUsername: resolvedAuthorUsername
  } = await resolvePostAuthorIdentity(authorId, authorUsername);

  if (!resolvedAuthorId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'NOT_AUTHENTICATED',
        message: '登录状态已失效，请重新登录后再发帖'
      })
    };
  }

  const finalContent = `【${safeTitle}】\n${safeContent}`;
  const moderationInput = buildPostModerationInput(finalContent);
  const keywordModerationResult = runKeywordPrecheck(moderationInput, { scene: 'forum_post' });
  if (keywordModerationResult.status === REJECTED_STATUS) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'LOCAL_KEYWORD_BLOCK',
        message: keywordModerationResult.message || '命中高风险违禁词，已拒绝发布'
      })
    };
  }

  const rpcPayload = {
    p_title: safeTitle,
    p_body: safeContent,
    p_author_username: resolvedAuthorUsername,
    p_images: toForumImageRpcPayload(safeImages),
    p_tag: safeTag || null,
    p_location_name: location?.name || null,
    p_location_lat: location?.lat ?? null,
    p_location_lng: location?.lng ?? null
  };
  const submissionId = String(options?.submissionId || '').trim();
  const rpcName = submissionId ? 'create_forum_post_with_images_idempotent' : 'create_forum_post_with_images';
  const requestPayload = submissionId ? { ...rpcPayload, p_submission_id: submissionId } : rpcPayload;
  let { data, error } = await supabase.rpc(rpcName, requestPayload);
  if (submissionId && error && isMissingRpcFunctionError(error, rpcName)) {
    // Deploy compatibility: existing installations still publish through the stable RPC.
    // 降级会失去幂等保护（网络超时重试可能重复发帖），必须留下可观测告警提醒尽快执行迁移
    logger.warn('forum-api', '幂等发帖 RPC 未部署，已降级为普通 RPC（请尽快执行 2026081503 迁移）', {
      rpcName,
      submissionId
    });
    ({ data, error } = await supabase.rpc('create_forum_post_with_images', rpcPayload));
  }
  if (error && isMissingRpcFunctionError(error, 'create_forum_post_with_images')) {
    const legacyPayload = { ...rpcPayload };
    delete legacyPayload.p_tag;
    delete legacyPayload.p_location_name;
    delete legacyPayload.p_location_lat;
    delete legacyPayload.p_location_lng;
    const legacyResult = await supabase.rpc('create_forum_post_with_images', legacyPayload);
    data = legacyResult.data;
    error = legacyResult.error;
  }
  if (error) {
    if (isMissingRpcFunctionError(error, 'create_forum_post_with_images')) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          code: 'FORUM_IMAGE_MIGRATION_REQUIRED',
          message: '论坛图片发布功能的数据库迁移尚未部署，请先执行最新 Supabase migration 后再试'
        })
      };
    }
    return { ok: false, data: null, error: normalizeForumImagePostError(error) };
  }

  const insertedPost = normalizePostRecord(data || {});
  const insertedPostId = String(insertedPost?.id || '').trim();
  if (!error && safeTag && insertedPostId && normalizeForumTag(insertedPost.tag) !== safeTag) {
    const { error: tagUpdateError } = await supabase
      .from('posts')
      .update({ tag: safeTag })
      .eq('id', insertedPostId)
      .eq('author_id', resolvedAuthorId);
    if (tagUpdateError) {
      logger.warn('forum-api', '图片帖标签回写失败', {
        postId: insertedPostId,
        tag: safeTag,
        error: tagUpdateError
      });
    } else {
      insertedPost.tag = safeTag;
    }
  }
  invalidateByTags(['posts', 'profiles', 'boh-cloud']);
  if (normalizeContentStatus(status) === APPROVED_STATUS && insertedPostId) {
    void schedulePostModeration({
      id: insertedPostId,
      author_id: resolvedAuthorId,
      content: finalContent
    });
  }
  const claimResult = await markCloudinaryUploadsClaimed(safeImages);
  if (!claimResult.ok) {
    logger.warn('forum-api', '论坛图片 pending 归属标记失败', claimResult.error);
    const orphanPublicIds = cleanupOrphanedUploads(safeImages);
    if (orphanPublicIds.length > 0) {
      deleteCloudinaryAssetsByPublicIds(orphanPublicIds).then((cleanupResult) => {
        if (!cleanupResult.ok) {
          logger.warn('forum-api', '清理孤儿 Cloudinary 图片失败', cleanupResult.error);
        }
      });
    }
  }

  return { ok: true, data: [insertedPost], error: null };
}

export async function createPost(content, authorId, authorUsername, status = 'approved', title = '', images = [], tag = '', location = null, options = {}) {
  if (Array.isArray(images) && images.length > 0) {
    return createPostWithImages(content, authorId, authorUsername, status, title, images, tag, location, options);
  }

  const safeTitle = String(title || '').trim();
  const safeContent = String(content || '').trim();
  const safeTag = normalizeForumTag(tag);
  const normalizedStatus = normalizeContentStatus(status);
  const finalContent = (safeTitle && !/^【.*?】/.test(safeContent))
    ? `【${safeTitle}】\n${safeContent}`
    : safeContent;
  const postParts = splitPostContent(finalContent, safeTitle, safeTitle ? safeContent : '');

  if (!finalContent) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'EMPTY_POST_CONTENT',
        message: '帖子内容不能为空'
      })
    };
  }

  const {
    authorId: resolvedAuthorId,
    authorUsername: resolvedAuthorUsername
  } = await resolvePostAuthorIdentity(authorId, authorUsername);

  if (!resolvedAuthorId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'NOT_AUTHENTICATED',
        message: '登录状态已失效，请重新登录后再发帖'
      })
    };
  }

  const moderationInput = buildPostModerationInput(finalContent);
  const keywordModerationResult = runKeywordPrecheck(moderationInput, { scene: 'forum_post' });

  if (keywordModerationResult.status === REJECTED_STATUS) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'LOCAL_KEYWORD_BLOCK',
        message: keywordModerationResult.message || '命中高风险违禁词，已拒绝发布'
      })
    };
  }

  const buildInsertPayload = (includeTag = true) => ({
    content: finalContent,
    title: postParts.title,
    body: postParts.body,
    author_id: resolvedAuthorId,
    author_username: resolvedAuthorUsername,
    status: normalizedStatus,
    ...(includeTag && safeTag ? { tag: safeTag } : {}),
    location_name: location?.name || null,
    location_lat: location?.lat ?? null,
    location_lng: location?.lng ?? null
  });

  let { data, error } = await supabase
    .from('posts')
    .insert([buildInsertPayload(true)])
    .select();
  if (error && safeTag && /tag.+column|column.+tag|schema cache/i.test(String(error.message || ''))) {
    const fallbackResult = await supabase
      .from('posts')
      .insert([buildInsertPayload(false)])
      .select();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }
  const insertedPost = Array.isArray(data) ? data[0] : null;
  const insertedPostId = String(insertedPost?.id || '').trim();

  if (!error && Array.isArray(data) && data[0]?.id) {
    const inserted = data[0];
    const insertedStatus = String(inserted.status || '').trim().toLowerCase();
    if (!ALLOWED_CONTENT_STATUS.has(insertedStatus)) {
      const { error: normalizeError } = await supabase
        .from('posts')
        .update({ status: normalizedStatus })
        .eq('id', inserted.id)
        .eq('author_id', resolvedAuthorId);

      if (normalizeError) {
        logger.warn('forum-api', '帖子状态纠正失败', {
          postId: inserted.id,
          status: inserted.status,
          normalizeTo: normalizedStatus,
          error: normalizeError
        });
      } else {
        inserted.status = normalizedStatus;
      }
    }
  }

  if (!error) {
    invalidateByTags(['posts', 'profiles']);
    if (normalizedStatus === APPROVED_STATUS && insertedPostId) {
      void schedulePostModeration({
        id: insertedPostId,
        author_id: resolvedAuthorId,
        content: finalContent
      });
    }
  }
  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function getForumPostDraft(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'NOT_AUTHENTICATED',
        message: '登录后才能读取云端草稿'
      })
    };
  }

  const { data, error } = await supabase
    .from('forum_post_drafts')
    .select('title, content, tag, updated_at')
    .eq('user_id', safeUserId)
    .maybeSingle();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  return { ok: true, data: normalizeForumDraftRecord(data), error: null };
}

export async function upsertForumPostDraft(userId, draft = {}) {
  const safeUserId = String(userId || '').trim();
  const title = String(draft.title || '');
  const content = String(draft.content || '');
  const tag = getEffectiveForumTag(draft.tag);

  if (!safeUserId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'NOT_AUTHENTICATED',
        message: '登录后才能保存云端草稿'
      })
    };
  }

  if (!title.trim() && !content.trim()) {
    return deleteForumPostDraft(safeUserId);
  }

  const { data, error } = await supabase
    .from('forum_post_drafts')
    .upsert({
      user_id: safeUserId,
      title,
      content,
      tag,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select('title, content, tag, updated_at')
    .single();

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  return { ok: true, data: normalizeForumDraftRecord(data), error: null };
}

export async function deleteForumPostDraft(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'NOT_AUTHENTICATED',
        message: '登录后才能删除云端草稿'
      })
    };
  }

  const { error } = await supabase
    .from('forum_post_drafts')
    .delete()
    .eq('user_id', safeUserId);

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  return { ok: true, data: null, error: null };
}

export async function deletePost(postId, userId, userRole) {
  const safePostId = String(postId || '').trim();
  if (!safePostId) {
    return { ok: false, success: false, error: '帖子不存在' };
  }

  const [{ data: post, error: postError }, imageResult] = await Promise.all([
    supabase
      .from('posts')
      .select('author_id')
      .eq('id', safePostId)
      .single(),
    getForumPostImages(safePostId)
  ]);

  if (postError) {
    return { ok: false, success: false, error: '帖子不存在' };
  }

  if (post.author_id !== userId && userRole !== 'admin') {
    return { ok: false, success: false, error: '没有权限删除此帖子' };
  }

  const { error: deleteError } = await supabase.from('posts').delete().eq('id', safePostId);
  if (deleteError) {
    return { ok: false, success: false, error: '删除失败' };
  }

  const publicIds = (Array.isArray(imageResult?.data) ? imageResult.data : [])
    .map((image) => image.publicId)
    .filter(Boolean);
  if (publicIds.length > 0) {
    void deleteCloudinaryAssetsByPublicIds(publicIds).then((result) => {
      if (!result.ok) {
        logger.warn('forum-api', '删除帖子后清理 Cloudinary 图片失败（不阻断）', {
          postId: safePostId,
          error: result.error
        });
      }
    });
  }

  invalidateByTags(['posts', 'comments', 'likes', 'notifications']);
  return { ok: true, success: true, error: null };
}

export async function getUserPosts(targetUserId, currentUserId = null, pagination = {}) {
  const { page, pageSize, offset, limit } = normalizePagination(pagination);
  const normalizedPageSize = Math.max(1, Number(pageSize || 10));
  const shouldOverfetch = Number(limit) > normalizedPageSize;
  const fallbackLimit = shouldOverfetch ? normalizedPageSize + 1 : normalizedPageSize;
  const sortMode = normalizeSortMode(pagination.sortMode || pagination.sort || 'latest');
  const searchQuery = String(pagination.searchQuery || '').trim();
  const tagFilter = normalizeForumTag(pagination.tag || pagination.tagFilter || '');
  const cursorMode = String(pagination.cursorMode || '').trim().toLowerCase();
  const cursorToken = String(pagination.cursor || '').trim();
  const abortSignal = pagination.signal;
  const parsedCursor = decodePostCursor(cursorToken);
  const useCursorMode = (cursorMode === 'keyset' || Boolean(parsedCursor))
    && sortMode === 'latest'
    && !searchQuery;
  const includeUnapprovedForAuthor = Boolean(
    pagination.includeUnapprovedForAuthor !== undefined
      ? pagination.includeUnapprovedForAuthor
      : (targetUserId && currentUserId && String(targetUserId) === String(currentUserId))
  );

  return executeRead(
    'posts.getUserPosts',
    {
      targetUserId,
      currentUserId,
      page,
      pageSize: normalizedPageSize,
      offset,
      limit,
      sortMode,
      searchQuery,
      tagFilter,
      includeUnapprovedForAuthor,
      cursorMode,
      cursorToken
    },
    async () => {
      if (useCursorMode) {
        let query;
        if (currentUserId) {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              user_likes:likes!left(user_id),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        }

        query = query
          .eq('author_id', targetUserId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(normalizedPageSize + 1);

        if (!(includeUnapprovedForAuthor && String(targetUserId || '') === String(currentUserId || ''))) {
          query = query.or('status.is.null,status.eq.approved');
        }

        query = applyForumTagFilter(query, tagFilter);

        if (parsedCursor?.createdAt && parsedCursor?.id) {
          query = query.or(
            `created_at.lt.${parsedCursor.createdAt},and(created_at.eq.${parsedCursor.createdAt},id.lt.${parsedCursor.id})`
          );
        }

        const { data, error } = await withAbortSignal(query, abortSignal);
        if (error) return { data: [], error };

        const formattedRows = normalizePostListRows(formatPosts(data || [], currentUserId));
        const hasMore = formattedRows.length > normalizedPageSize;
        const pagedRows = formattedRows.slice(0, normalizedPageSize);
        const nextCursor = buildNextPostCursor(pagedRows, hasMore);
        return { data: pagedRows, error: null, hasMore, nextCursor };
      }

      const rpcPage = page;
      // list_forum_posts 采用 page + page_size 计算 offset，不能传递 overfetch limit（会导致翻页错位漏帖）。
      const rpcPageSize = normalizedPageSize;

      const rpcPayload = {
        p_page: rpcPage,
        p_page_size: rpcPageSize,
        p_sort: sortMode,
        p_author_id: targetUserId,
        p_include_author_non_approved: includeUnapprovedForAuthor,
        p_search_query: searchQuery || null,
        p_tag_filter: tagFilter || null
      };

      let { data: rpcData, error: rpcError } = await withAbortSignal(
        supabase.rpc('list_forum_posts', rpcPayload),
        abortSignal
      );
      if (rpcError && isMissingRpcFunctionError(rpcError, 'list_forum_posts')) {
        const legacyPayload = { ...rpcPayload };
        delete legacyPayload.p_tag_filter;
        const legacyResult = await withAbortSignal(
          supabase.rpc('list_forum_posts', legacyPayload),
          abortSignal
        );
        rpcData = tagFilter && Array.isArray(legacyResult.data)
          ? legacyResult.data.filter((row) => matchesForumTagFilter(row?.tag, tagFilter))
          : legacyResult.data;
        rpcError = legacyResult.error;
      }
      if (rpcError) {
        const fallbackReason = isMissingRpcFunctionError(rpcError, 'list_forum_posts')
          ? '缺少 list_forum_posts RPC，用户帖子查询回退旧逻辑'
          : 'list_forum_posts RPC 调用失败，用户帖子查询回退旧逻辑';
        logger.warn('forum-api', fallbackReason, rpcError);

        let query;
        if (currentUserId) {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              user_likes:likes!left(user_id),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url, is_banned),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        }

        if (!(includeUnapprovedForAuthor && String(targetUserId || '') === String(currentUserId || ''))) {
          query = query.or('status.is.null,status.eq.approved');
        }
        query = applyForumTagFilter(query, tagFilter);

        const { data, error } = await withAbortSignal(
          query
            .eq('author_id', targetUserId)
            .order('created_at', { ascending: false })
            .range(offset, offset + fallbackLimit - 1),
          abortSignal
        );

        if (error) return { data: [], error };
        const formattedRows = normalizePostListRows(formatPosts(data || [], currentUserId));
        const hasMore = shouldOverfetch
          ? formattedRows.length > normalizedPageSize
          : formattedRows.length >= normalizedPageSize;
        const pagedRows = shouldOverfetch
          ? formattedRows.slice(0, normalizedPageSize)
          : formattedRows;
        const nextCursor = buildNextPostCursor(pagedRows, hasMore);
        return { data: pagedRows, error: null, hasMore, nextCursor };
      }

      const safeRows = Array.isArray(rpcData) ? rpcData : [];
      const withLikeState = await attachLikedFlags(safeRows, currentUserId);
      const normalizedRows = normalizePostListRows(withLikeState
        .slice(0, normalizedPageSize)
        .map((row) => ({
          ...row,
          comment_count: Number(row.comment_count || 0),
          like_count: Number(row.like_count || 0),
          isLiked: typeof row.isLiked === 'boolean' ? row.isLiked : Boolean(row.is_liked),
          replies: normalizeRpcReplyPreview(row.replies),
          replies_has_more: Boolean(row.replies_has_more),
          replies_preloaded: Array.isArray(row.replies),
          search_excerpt: row.search_excerpt || null,
          hot_score: Number(row.hot_score || 0),
          search_rank: Number(row.search_rank || 0)
        })));
      const rpcHasMore = safeRows.find((row) => typeof row?.has_more === 'boolean')?.has_more;
      const hasMore = typeof rpcHasMore === 'boolean' ? rpcHasMore : safeRows.length >= normalizedPageSize;
      const nextCursor = buildNextPostCursor(normalizedRows, hasMore);
      return { data: normalizedRows, error: null, hasMore, nextCursor };
    },
    { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['posts', `posts:user:${targetUserId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function updatePost(postId, content, userId, userRole, title = '') {
  const safeTitle = String(title || '').trim();
  const safeBody = String(content || '').trim();
  const safeContent = safeTitle ? `【${safeTitle}】\n${safeBody}` : safeBody;
  if (!safeTitle && !safeBody) {
    return { ok: false, success: false, error: '帖子内容不能为空' };
  }
  if (safeTitle && !safeBody) {
    return { ok: false, success: false, error: '帖子正文不能为空' };
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('author_id, status')
    .eq('id', postId)
    .single();

  if (postError) {
    return { ok: false, success: false, error: '帖子不存在' };
  }

  if (post.author_id !== userId && userRole !== 'admin') {
    return { ok: false, success: false, error: '没有权限编辑此帖子' };
  }

  const moderationInput = buildPostModerationInput(safeContent);
  const keywordModerationResult = runKeywordPrecheck(moderationInput, { scene: 'forum_post' });
  if (keywordModerationResult.status === REJECTED_STATUS) {
    return {
      ok: false,
      success: false,
      error: keywordModerationResult.message || '命中高风险违禁词，已拒绝保存'
    };
  }

  const postParts = splitPostContent(safeContent, safeTitle, safeTitle ? safeBody : '');
  const currentStatus = normalizeContentStatus(post.status, APPROVED_STATUS);
  const updateData = {
    content: safeContent,
    title: postParts.title,
    body: postParts.body,
    status: userRole === 'admin' ? APPROVED_STATUS : currentStatus,
    updated_at: new Date().toISOString()
  };
  const { error: updateError } = await supabase
    .from('posts')
    .update(updateData)
    .eq('id', postId);

  if (updateError) {
    logger.error('forum-api', '更新帖子失败', updateError);
    return { ok: false, success: false, error: `更新失败: ${updateError.message}` };
  }

  void schedulePostModeration({
    id: postId,
    author_id: post.author_id,
    content: safeContent
  });

  invalidateByTags(['posts', 'comments', 'notifications']);
  return { ok: true, success: true, error: null };
}

/**
 * 帖子编辑：更新帖子的图片集合（删除被移除的旧图、插入新图、按传入顺序重排）。
 * images 元素格式：
 *  - 保留的旧图：{ id: '<forum_post_images.id>' }
 *  - 新图：{ url, publicId, width, height, format, moderationScore, moderationReason }
 * 通过 security definer RPC update_forum_post_images 完成（表级增删改仅 service_role 可用）。
 */
export async function updateForumPostImages(postId, images = []) {
  const safePostId = String(postId || '').trim();
  const safeImages = Array.isArray(images) ? images : [];
  if (!safePostId) {
    return { ok: false, data: null, error: normalizeDbError({ message: '缺少帖子 ID' }) };
  }

  try {
    const { data, error } = await supabase.rpc('update_forum_post_images', {
      p_post_id: safePostId,
      p_images: safeImages
    });

    if (error) {
      logger.warn('forum-api', '更新帖子图片失败', { postId: safePostId, error });
      const message = String(error.message || '').trim();
      // RPC 未部署时给出可操作的降级提示
      if (isMissingRpcFunctionError(error, 'update_forum_post_images')) {
        return {
          ok: false,
          data: null,
          error: normalizeDbError({
            code: 'FORUM_IMAGE_MIGRATION_REQUIRED',
            message: '帖子图片编辑的数据库迁移尚未部署，请先执行最新 Supabase migration 后再试'
          })
        };
      }
      // 拆出业务错误码与用户可读文案（RPC 内以 "CODE:message" 抛出）
      const colonIndex = message.indexOf(':');
      if (colonIndex > 0) {
        const code = message.slice(0, colonIndex).trim();
        return {
          ok: false,
          data: null,
          error: normalizeDbError({
            code,
            message: message.slice(colonIndex + 1).trim() || message
          })
        };
      }
      return { ok: false, data: null, error: normalizeDbError(error) };
    }

    invalidateByTags(['posts', 'comments', 'notifications', 'boh-cloud']);
    return { ok: true, data, error: null };
  } catch (error) {
    logger.error('forum-api', '更新帖子图片异常', error);
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
}

export async function retryPostModeration(postId, userId) {
  const safePostId = String(postId || '').trim();
  if (!safePostId || !userId) {
    return { ok: false, resultStatus: null, error: normalizeDbError({ message: '参数不完整' }) };
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, content, author_id')
    .eq('id', safePostId)
    .single();

  if (postError || !post) {
    return { ok: false, resultStatus: null, error: normalizeDbError(postError || { message: '帖子不存在' }) };
  }

  if (post.author_id !== userId) {
    return {
      ok: false,
      resultStatus: null,
      error: normalizeDbError({ message: '没有权限重试该帖子', code: 'NO_PERMISSION' })
    };
  }

  const moderationInput = buildPostModerationInput(post.content);
  const result = await runSyncStrictModeration(moderationInput, { scene: 'forum_post' });
  const nextStatus = result.status === 'approved' ? APPROVED_STATUS : REJECTED_STATUS;

  const { error: updateError } = await supabase
    .from('posts')
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', safePostId)
    .eq('author_id', userId);

  if (updateError) {
    return { ok: false, resultStatus: null, error: normalizeDbError(updateError) };
  }

  invalidateByTags(['posts', 'comments', 'notifications']);
  return {
    ok: true,
    resultStatus: result.status === 'approved' ? 'approved' : 'rejected',
    data: { postId: safePostId, status: nextStatus },
    error: null
  };
}

export async function getWeeklyCheckinStatus(userId = null) {
  let resolvedUserId = String(userId || '').trim();
  if (!resolvedUserId) {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!authError) {
        resolvedUserId = String(authData?.user?.id || '').trim();
      }
    } catch (_error) {
      resolvedUserId = '';
    }
  }

  const { data, error, ok } = await executeRead(
    'forum.getWeeklyCheckinStatus',
    { userId: resolvedUserId || 'anonymous' },
    async () => {
      const { data, error } = await supabase.rpc('get_weekly_checkin_status');
      if (error) return { data: null, error };
      const normalized = normalizeWeeklyCheckinPayload(data);
      const enriched = await enrichWeeklyCheckinStatusFallback(normalized, resolvedUserId);
      return { data: enriched, error: null };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.REALTIME,
      tags: ['weekly-checkin', `weekly-checkin:user:${resolvedUserId || 'anonymous'}`, 'profiles'],
      timeoutMs: 8000,
      retry: 0
    }
  );

  return { ok, data: data || normalizeWeeklyCheckinPayload(), error: normalizeDbError(error) };
}

export async function submitWeeklyCheckin() {
  const { data, error } = await supabase.rpc('submit_weekly_checkin');
  if (error) {
    return {
      ok: false,
      data: normalizeWeeklyCheckinPayload(),
      error: normalizeDbError(error)
    };
  }

  invalidateByTags(['weekly-checkin', 'profiles']);
  return {
    ok: true,
    data: normalizeWeeklyCheckinPayload(data),
    error: null
  };
}

/**
 * 发帖有奖：帖子发布成功后调用，按“当前进行中”的活动发放积分。
 * 返回 { ok, awarded, currentPoints, alreadyClaimed, skipped, reason, message }
 * - 无进行中活动 / 已达上限 / 已领过：awarded=0，不影响发帖主流程
 * - 成功：awarded>0 且 currentPoints 为新余额
 */
export async function claimPostPublishReward(supabaseClient, postId) {
  const safePostId = String(postId || '').trim();
  if (!safePostId) {
    return { ok: false, awarded: 0, error: new Error('缺少帖子 ID') };
  }
  try {
    const { data, error } = await supabaseClient.rpc('grant_post_publish_reward', {
      p_post_id: safePostId
    });
    if (error) {
      logger.warn('forum-api', '发帖奖励发放失败', { postId: safePostId, error });
      return { ok: false, awarded: 0, error: normalizeDbError(error) };
    }
    const safe = data && typeof data === 'object' ? data : {};
    return {
      ok: Boolean(safe.ok),
      awarded: Number(safe.awarded || 0),
      currentPoints: Number(safe.current_points || 0),
      alreadyClaimed: Boolean(safe.already_claimed),
      skipped: Boolean(safe.skipped),
      reason: safe.reason || '',
      campaignTitle: safe.campaign_title || '',
      message: safe.message || ''
    };
  } catch (err) {
    logger.error('forum-api', 'claimPostPublishReward 异常', err);
    return { ok: false, awarded: 0, error: err };
  }
}

/**
 * 查询当前进行中的“发帖有奖”活动，供论坛发帖区横幅展示。
 * 返回 { id, title, pointsPerPost, endAt } 或 null。
 */
export async function getActivePostReward(supabaseClient) {
  try {
    const { data, error } = await supabaseClient.rpc('get_active_post_reward');
    if (error) {
      logger.warn('forum-api', '查询进行中发帖活动失败', error);
      return null;
    }
    if (!data || typeof data !== 'object') return null;
    return {
      id: data.id,
      title: data.title || '',
      pointsPerPost: Number(data.pointsPerPost || 0),
      endAt: data.endAt || null
    };
  } catch (err) {
    logger.error('forum-api', 'getActivePostReward 异常', err);
    return null;
  }
}
