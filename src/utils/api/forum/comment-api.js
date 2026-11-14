import { supabase } from '../../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../../request-core.js';
import { CACHE_TTL_LEVELS } from '../../cache-strategy.js';
import { logger } from '../../logger.js';
import {
  runKeywordPrecheck,
  runAsyncRelaxedModeration,
  runSyncStrictModeration,
} from '../../unified-content-moderation.js';
import {
  ALLOWED_CONTENT_STATUS,
  APPROVED_STATUS,
  REJECTED_STATUS,
  buildCommentModerationInput,
  normalizeContentStatus,
  shouldSyncModerateComment,
} from '../forum-format.js';
import {
  canMutateForumContent,
  isMissingRpcFunctionError,
  resolveAuthoritativeForumActor,
  toPositiveInt,
  writeAsyncModerationLog,
  ensureModerationNotification,
} from './_shared.js';

const COMMENT_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const COMMENT_SYNC_MODERATION_TIMEOUT_MS = 12000;
const COMMENT_REJECTED_NOTIFICATION_TYPE = 'comment_rejected';

async function scheduleCommentModeration(comment = {}) {
  const commentId = String(comment.id || '').trim();
  const authorId = String(comment.author_id || '').trim();
  const postId = String(comment.post_id || '').trim();
  const content = String(comment.content || '').trim();
  if (!commentId || !authorId || !postId || !content) return;

  try {
    // 回复场景改为"先发后审"：发送阶段不阻断，异步复审仅在高风险时回写 rejected。
    const moderationInput = buildCommentModerationInput(content);
    const moderationResult = await runAsyncRelaxedModeration(moderationInput, {
      scene: 'forum_comment',
      timeoutMs: COMMENT_ASYNC_MODERATION_TIMEOUT_MS,
    });
    await writeAsyncModerationLog(commentId, 'comment', moderationResult);

    // 2026-11-10：Pushplus 下线后这里不再有推送分支 —— 评论通知由 DB 触发器落库。
    if (moderationResult.status !== REJECTED_STATUS) {
      return;
    }

    const { error: updateError } = await supabase
      .from('comments')
      .update({
        status: REJECTED_STATUS,
        updated_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('author_id', authorId)
      .eq('status', APPROVED_STATUS);

    if (updateError) {
      logger.warn('forum-api', '异步评论审查回写失败', {
        commentId,
        postId,
        error: updateError,
      });
      return;
    }

    const { error: purgeError } = await supabase
      .from('notifications')
      .delete()
      .eq('type', 'comment')
      .eq('comment_id', commentId);

    if (purgeError) {
      logger.warn('forum-api', '删除已拒绝评论关联通知失败（不阻断）', {
        commentId,
        postId,
        error: purgeError,
      });
    }

    await ensureModerationNotification({
      recipientId: authorId,
      type: COMMENT_REJECTED_NOTIFICATION_TYPE,
      postId,
      commentId,
    });

    invalidateByTags(['comments', `comments:post:${postId}`, 'posts', 'notifications']);
  } catch (error) {
    logger.warn('forum-api', '异步评论审查失败（不阻断已发送）', {
      commentId,
      postId,
      error,
    });
  }
}

/* 评论行 → 视图行（作者头像三件套拍平）。
   单帖查询与跨帖批量共用，避免两条路径渲染出的 PostCard 结构不一致。 */
const formatCommentRow = (comment) => ({
  ...comment,
  author_avatar_url: comment.author?.avatar_url,
  author_avatar_frame_url: comment.author?.avatar_frame_url || null,
  author_is_banned: Boolean(comment.author?.is_banned),
});

export async function getComments(postId, currentUserId = null, options = {}) {
  const safePostId = String(postId || '').trim();
  const parentId = options.parentId;
  const topLevelOnly = Boolean(options.topLevelOnly);
  const normalizedOrder =
    String(options.order || 'asc')
      .trim()
      .toLowerCase() === 'desc'
      ? 'desc'
      : 'asc';
  const page = toPositiveInt(options.page, 1);
  const pageSize = Math.min(100, toPositiveInt(options.pageSize, 20));
  // 注意：hasPagination 仍按**原始入参**判定（`?page=abc` 时 Number() 是 NaN ⇒ 不分页），
  // 这是既有行为，不在本次归一里改动 —— 改了会让「非法 page」从「不分页」变成「第 1 页」。
  const hasPagination =
    Number.isFinite(Number(options.page)) || Number.isFinite(Number(options.pageSize));
  const offset = (page - 1) * pageSize;
  const limit = pageSize + 1;
  if (!safePostId) {
    return {
      ok: false,
      data: [],
      hasMore: false,
      error: normalizeDbError({ message: '缺少帖子 ID' }),
    };
  }

  return executeRead(
    'comments.getComments',
    {
      safePostId,
      currentUserId,
      parentId: parentId || null,
      topLevelOnly,
      normalizedOrder,
      page,
      pageSize,
      hasPagination,
    },
    async () => {
      let query = supabase
        .from('comments')
        .select(
          `
          *,
          author:author_id(avatar_url, avatar_frame_url, is_banned)
        `,
        )
        .eq('post_id', safePostId)
        .or('status.is.null,status.eq.approved');

      if (topLevelOnly) {
        query = query.is('parent_id', null);
      } else if (parentId !== undefined && parentId !== null && String(parentId || '').trim()) {
        query = query.eq('parent_id', String(parentId).trim());
      }

      query = query.order('created_at', { ascending: normalizedOrder !== 'desc' });

      if (hasPagination) {
        query = query.range(offset, offset + limit - 1);
      }

      const { data, error } = await query;

      if (error) return { data: [], error };

      const safeRows = Array.isArray(data) ? data : [];
      const hasMore = hasPagination ? safeRows.length > pageSize : false;
      const slicedRows = hasPagination ? safeRows.slice(0, pageSize) : safeRows;

      const formattedData = slicedRows.map(formatCommentRow);

      return { data: formattedData, error: null, hasMore };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.LIST_DATA,
      tags: ['comments', `comments:post:${safePostId}`],
      timeoutMs: 8000,
      retry: 1,
    },
  );
}

/**
 * 跨帖批量取「顶层评论预览」—— 论坛列表页 idle 预取用（2026-11-14）。
 *
 * 为什么需要：feed 的 keyset 直查不带 replies，PostCard 只能逐帖回源，
 * 于是每进一次列表就有 N 条 `comments?post_id=eq.…` 请求，且**每条自带一次
 * OPTIONS 预检**（预检缓存按 URL 分组，不同 post_id 不互通）。
 * 实测（probe-forum-feed-causal）：这些请求串行发出（550ms/条），
 * 4 条就吃掉 8 个往返。合并成 1 条 `in.(…)` 后只剩 1 个往返 + 1 次预检。
 *
 * 返回 `{ ok, data: { [postId]: { rows, truncated } } }`：
 *   · rows 已按 created_at desc 取前 perPost 条，结构与 getComments 完全一致
 *   · truncated = 该帖还有更多（调用方用来定 replies_has_more）
 *   · 被「热帖吃满 limit」而一条都没拿到的帖，rows 为空 —— 调用方**不要**写
 *     replies_preloaded，留待用户展开时按单帖兜底（不写比写错好）。
 *
 * 第二个参数只为与 getComments 的调用形状对齐而保留（预览行不含 is_liked 之类
 * 的观看者态，用不到 viewer id）。
 */
export async function getCommentPreviewsForPosts(
  postIds = [],
  _currentUserId = null,
  options = {},
) {
  const ids = [
    ...new Set(
      (Array.isArray(postIds) ? postIds : []).map((id) => String(id || '').trim()).filter(Boolean),
    ),
  ].slice(0, 12);
  const perPost = Math.min(5, toPositiveInt(options.perPost, 3));

  if (!ids.length) return { ok: true, data: {}, error: null };

  return executeRead(
    'comments.getCommentPreviewsForPosts',
    { ids, perPost },
    async () => {
      // 上限留给「某条热帖评论特别多」的挤压：按帖数 × 每帖条数 × 6 倍余量，
      // 再封 200（PostgREST 默认 max-rows 1000，200 足够且不至于拖慢序列化）。
      const rowCap = Math.min(200, ids.length * perPost * 6);
      const { data, error } = await supabase
        .from('comments')
        .select(
          `
          *,
          author:author_id(avatar_url, avatar_frame_url, is_banned)
        `,
        )
        .in('post_id', ids)
        .is('parent_id', null)
        .or('status.is.null,status.eq.approved')
        .order('created_at', { ascending: false })
        .limit(rowCap);

      if (error) return { data: null, error };

      const grouped = {};
      for (const id of ids) grouped[id] = { rows: [], truncated: false };
      for (const row of Array.isArray(data) ? data : []) {
        const bucket = grouped[row.post_id];
        if (!bucket) continue;
        if (bucket.rows.length >= perPost) {
          bucket.truncated = true;
          continue;
        }
        bucket.rows.push(formatCommentRow(row));
      }
      return { data: grouped, error: null };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.LIST_DATA,
      tags: ['comments'],
      timeoutMs: 8000,
      retry: 1,
    },
  );
}

export async function getCommentThreadReplies(
  postId,
  rootCommentId,
  currentUserId = null,
  options = {},
) {
  const safePostId = String(postId || '').trim();
  const safeRootCommentId = String(rootCommentId || '').trim();
  const page = toPositiveInt(options.page, 1);
  const pageSize = Math.min(100, toPositiveInt(options.pageSize, 50));

  if (!safePostId || !safeRootCommentId) {
    return {
      ok: false,
      data: [],
      hasMore: false,
      error: normalizeDbError({ message: '评论参数不完整' }),
    };
  }

  return executeRead(
    'comments.getCommentThreadReplies',
    { safePostId, safeRootCommentId, currentUserId, page, pageSize },
    async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc('list_forum_comment_thread', {
        p_post_id: safePostId,
        p_root_comment_id: safeRootCommentId,
        p_page: page,
        p_page_size: pageSize,
      });

      if (!rpcError) {
        const safeRows = Array.isArray(rpcData) ? rpcData : [];
        const hasMoreFromRpc = safeRows.find((row) => typeof row?.has_more === 'boolean')?.has_more;
        return {
          data: safeRows.map((comment) => ({
            ...comment,
            author_avatar_url: comment.author_avatar_url || comment.author?.avatar_url,
          })),
          error: null,
          hasMore:
            typeof hasMoreFromRpc === 'boolean' ? hasMoreFromRpc : safeRows.length >= pageSize,
        };
      }

      if (!isMissingRpcFunctionError(rpcError, 'list_forum_comment_thread')) {
        return { data: [], error: rpcError, hasMore: false };
      }

      const offset = (page - 1) * pageSize;
      const { data, error } = await supabase
        .from('comments')
        .select(
          `
          *,
          author:author_id(avatar_url, avatar_frame_url, is_banned)
        `,
        )
        .eq('post_id', safePostId)
        .or('status.is.null,status.eq.approved')
        .eq('parent_id', safeRootCommentId)
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize);

      if (error) return { data: [], error, hasMore: false };
      const safeRows = Array.isArray(data) ? data : [];
      return {
        data: safeRows.slice(0, pageSize).map((comment) => ({
          ...comment,
          author_avatar_url: comment.author?.avatar_url,
          author_avatar_frame_url: comment.author?.avatar_frame_url || null,
          author_is_banned: Boolean(comment.author?.is_banned),
        })),
        error: null,
        hasMore: safeRows.length > pageSize,
      };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.LIST_DATA,
      tags: ['comments', `comments:post:${safePostId}`],
      timeoutMs: 8000,
      retry: 1,
    },
  );
}

/**
 * 查询评论祖先链（从目标到根，含目标自身）
 * 用于 PostDetailMain.vue 的深链定位，替代循环向上查询
 * RPC 不存在时返回 fallback: true，调用方据此降级
 */
export async function getCommentAncestors(commentId, postId) {
  const safeCommentId = String(commentId || '').trim();
  const safePostId = String(postId || '').trim();

  if (!safeCommentId || !safePostId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '评论参数不完整' }),
      fallback: false,
    };
  }

  return executeRead(
    'comments.getCommentAncestors',
    { safeCommentId, safePostId },
    async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_comment_ancestors', {
        p_comment_id: safeCommentId,
        p_post_id: safePostId,
      });

      if (!rpcError) {
        return { data: Array.isArray(rpcData) ? rpcData : [], error: null, fallback: false };
      }

      if (isMissingRpcFunctionError(rpcError, 'get_comment_ancestors')) {
        return { data: null, error: null, fallback: true };
      }
      return { data: null, error: rpcError, fallback: false };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.USER_DATA,
      tags: ['comments', `comments:post:${safePostId}`],
      timeoutMs: 5000,
      retry: 1,
    },
  );
}

/**
 * 批量查询多个顶层评论的子回复预览（每条最早 1 条 + has_more）
 * 用于 PostDetailMain.vue 的楼中楼预加载，替代逐条加载
 * RPC 不存在时返回 fallback: true，调用方据此降级
 */
export async function getCommentThreadPreviewsBatch(postId, commentIds) {
  const safePostId = String(postId || '').trim();
  const safeCommentIds = Array.isArray(commentIds)
    ? commentIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  if (!safePostId || safeCommentIds.length === 0) {
    return {
      ok: false,
      data: [],
      error: normalizeDbError({ message: '评论参数不完整' }),
      fallback: false,
    };
  }

  return executeRead(
    'comments.getCommentThreadPreviewsBatch',
    { safePostId, safeCommentIds },
    async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_comment_thread_previews', {
        p_post_id: safePostId,
        p_comment_ids: safeCommentIds,
      });

      if (!rpcError) {
        return { data: Array.isArray(rpcData) ? rpcData : [], error: null, fallback: false };
      }

      if (isMissingRpcFunctionError(rpcError, 'get_comment_thread_previews')) {
        return { data: null, error: null, fallback: true };
      }
      return { data: null, error: rpcError, fallback: false };
    },
    {
      ttlMs: CACHE_TTL_LEVELS.LIST_DATA,
      tags: ['comments', `comments:post:${safePostId}`],
      timeoutMs: 8000,
      retry: 1,
    },
  );
}

export async function createComment(
  postId,
  content,
  authorId,
  authorUsername,
  status = 'approved',
  parentId = null,
  replyToUsername = null,
) {
  const safePostId = String(postId || '').trim();
  const safeContent = String(content || '').trim();
  const safeAuthorId = String(authorId || '').trim();

  if (!safePostId || !safeContent || !safeAuthorId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'INVALID_COMMENT_PARAMS',
        message: '评论信息不完整，请刷新页面后重试',
      }),
    };
  }

  const normalizedStatus = normalizeContentStatus(status);
  const moderationInput = buildCommentModerationInput(safeContent);
  const keywordModerationResult = runKeywordPrecheck(moderationInput, { scene: 'forum_comment' });

  if (keywordModerationResult.status === REJECTED_STATUS) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'LOCAL_KEYWORD_BLOCK',
        message: keywordModerationResult.message || '命中高风险违禁词，已拒绝发布',
      }),
    };
  }

  if (normalizedStatus === APPROVED_STATUS && shouldSyncModerateComment(content)) {
    const strictModerationResult = await runSyncStrictModeration(moderationInput, {
      scene: 'forum_comment',
      timeoutMs: COMMENT_SYNC_MODERATION_TIMEOUT_MS,
    });
    if (strictModerationResult.status === REJECTED_STATUS) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          code: 'SYNC_MODERATION_BLOCK',
          message: strictModerationResult.message || '评论需要先通过内容审查，请调整后再发送',
        }),
      };
    }
  }

  const commentData = {
    post_id: safePostId,
    content: safeContent,
    author_id: safeAuthorId,
    author_username: authorUsername,
    status: normalizedStatus,
  };

  if (parentId) commentData.parent_id = parentId;
  if (replyToUsername) commentData.reply_to_username = replyToUsername;

  const { data, error } = await supabase.from('comments').insert([commentData]).select();
  const insertedComment = Array.isArray(data) ? data[0] : null;
  const insertedCommentId = String(insertedComment?.id || '').trim();

  if (!error && Array.isArray(data) && data[0]?.id) {
    const inserted = data[0];
    const insertedStatus = String(inserted.status || '')
      .trim()
      .toLowerCase();
    if (!ALLOWED_CONTENT_STATUS.has(insertedStatus)) {
      const { error: normalizeError } = await supabase
        .from('comments')
        .update({ status: normalizedStatus })
        .eq('id', inserted.id)
        .eq('author_id', safeAuthorId);

      if (normalizeError) {
        logger.warn('forum-api', '评论状态纠正失败', {
          commentId: inserted.id,
          status: inserted.status,
          normalizeTo: normalizedStatus,
          error: normalizeError,
        });
      } else {
        inserted.status = normalizedStatus;
      }
    }
  }

  if (!error) {
    invalidateByTags(['comments', 'posts', 'notifications']);
    if (normalizedStatus === APPROVED_STATUS && insertedCommentId) {
      void scheduleCommentModeration({
        id: insertedCommentId,
        post_id: safePostId,
        author_id: safeAuthorId,
        content: safeContent,
      });
    }
  }
  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function deleteComment(commentId, userId, _userRole) {
  const { data: comment, error: commentError } = await supabase
    .from('comments')
    .select('author_id, status')
    .eq('id', commentId)
    .single();

  if (commentError) {
    return { ok: false, success: false, error: '评论不存在' };
  }

  const actor = await resolveAuthoritativeForumActor(userId);
  if (!canMutateForumContent(actor, comment.author_id)) {
    // roleResolved=false ⇒「没查到身份」而非「查到了但不够权限」，别谎称没有权限
    return {
      ok: false,
      success: false,
      error: actor.roleResolved ? '没有权限删除此评论' : '网络异常，暂时无法校验权限，请稍后重试',
    };
  }

  const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId);
  if (deleteError) {
    logger.error('forum-api', '删除评论失败', deleteError);
    const denied =
      deleteError.code === '42501' ||
      /permission|policy|authorized/i.test(String(deleteError.message || ''));
    return {
      ok: false,
      success: false,
      error: denied ? '没有权限删除此评论' : `删除失败: ${deleteError.message}`,
    };
  }

  invalidateByTags(['comments', 'posts', 'notifications']);
  return { ok: true, success: true, error: null };
}
