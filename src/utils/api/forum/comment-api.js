import { supabase } from '../../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../../request-core.js';
import { CACHE_TTL_LEVELS } from '../../cache-strategy.js';
import { logger } from '../../logger.js';
import {
  runKeywordPrecheck,
  runAsyncRelaxedModeration,
  runSyncStrictModeration
} from '../../unified-content-moderation.js';
import {
  ALLOWED_CONTENT_STATUS,
  APPROVED_STATUS,
  REJECTED_STATUS,
  buildCommentModerationInput,
  normalizeContentStatus,
  shouldSyncModerateComment
} from '../forum-format.js';
import {
  isMissingRpcFunctionError,
  writeAsyncModerationLog,
  ensureModerationNotification,
  notifyPostAuthorForComment
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
      timeoutMs: COMMENT_ASYNC_MODERATION_TIMEOUT_MS
    });
    await writeAsyncModerationLog(commentId, 'comment', moderationResult);

    if (moderationResult.status !== REJECTED_STATUS) {
      await notifyPostAuthorForComment({
        postId,
        senderId: authorId,
        commentId
      });
      return;
    }

    const { error: updateError } = await supabase
      .from('comments')
      .update({
        status: REJECTED_STATUS,
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .eq('author_id', authorId)
      .eq('status', APPROVED_STATUS);

    if (updateError) {
      logger.warn('forum-api', '异步评论审查回写失败', {
        commentId,
        postId,
        error: updateError
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
        error: purgeError
      });
    }

    await ensureModerationNotification({
      recipientId: authorId,
      type: COMMENT_REJECTED_NOTIFICATION_TYPE,
      postId,
      commentId
    });

    invalidateByTags(['comments', `comments:post:${postId}`, 'posts', 'notifications']);
  } catch (error) {
    logger.warn('forum-api', '异步评论审查失败（不阻断已发送）', {
      commentId,
      postId,
      error
    });
  }
}

export async function getComments(postId, currentUserId = null, options = {}) {
  const safePostId = String(postId || '').trim();
  const parentId = options.parentId;
  const topLevelOnly = Boolean(options.topLevelOnly);
  const normalizedOrder = String(options.order || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 20)));
  const hasPagination = Number.isFinite(Number(options.page)) || Number.isFinite(Number(options.pageSize));
  const offset = (page - 1) * pageSize;
  const limit = pageSize + 1;
  if (!safePostId) {
    return { ok: false, data: [], hasMore: false, error: normalizeDbError({ message: '缺少帖子 ID' }) };
  }

  return executeRead(
    'comments.getComments',
    { safePostId, currentUserId, parentId: parentId || null, topLevelOnly, normalizedOrder, page, pageSize, hasPagination },
    async () => {
      let query = supabase
        .from('comments')
        .select(`
          *,
          author:author_id(avatar_url)
        `)
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

      const formattedData = slicedRows.map((comment) => ({
        ...comment,
        author_avatar_url: comment.author?.avatar_url
      }));

      return { data: formattedData, error: null, hasMore };
    },
    { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['comments', `comments:post:${safePostId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function getCommentThreadReplies(postId, rootCommentId, currentUserId = null, options = {}) {
  const safePostId = String(postId || '').trim();
  const safeRootCommentId = String(rootCommentId || '').trim();
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 50)));

  if (!safePostId || !safeRootCommentId) {
    return { ok: false, data: [], hasMore: false, error: normalizeDbError({ message: '评论参数不完整' }) };
  }

  return executeRead(
    'comments.getCommentThreadReplies',
    { safePostId, safeRootCommentId, currentUserId, page, pageSize },
    async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc('list_forum_comment_thread', {
        p_post_id: safePostId,
        p_root_comment_id: safeRootCommentId,
        p_page: page,
        p_page_size: pageSize
      });

      if (!rpcError) {
        const safeRows = Array.isArray(rpcData) ? rpcData : [];
        const hasMoreFromRpc = safeRows.find((row) => typeof row?.has_more === 'boolean')?.has_more;
        return {
          data: safeRows.map((comment) => ({
            ...comment,
            author_avatar_url: comment.author_avatar_url || comment.author?.avatar_url
          })),
          error: null,
          hasMore: typeof hasMoreFromRpc === 'boolean' ? hasMoreFromRpc : safeRows.length >= pageSize
        };
      }

      if (!isMissingRpcFunctionError(rpcError, 'list_forum_comment_thread')) {
        return { data: [], error: rpcError, hasMore: false };
      }

      const offset = (page - 1) * pageSize;
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          author:author_id(avatar_url)
        `)
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
          author_avatar_url: comment.author?.avatar_url
        })),
        error: null,
        hasMore: safeRows.length > pageSize
      };
    },
    { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['comments', `comments:post:${safePostId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function createComment(postId, content, authorId, authorUsername, status = 'approved', parentId = null, replyToUsername = null) {
  const safePostId = String(postId || '').trim();
  const safeContent = String(content || '').trim();
  const safeAuthorId = String(authorId || '').trim();

  if (!safePostId || !safeContent || !safeAuthorId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'INVALID_COMMENT_PARAMS',
        message: '评论信息不完整，请刷新页面后重试'
      })
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
        message: keywordModerationResult.message || '命中高风险违禁词，已拒绝发布'
      })
    };
  }

  if (normalizedStatus === APPROVED_STATUS && shouldSyncModerateComment(content)) {
    const strictModerationResult = await runSyncStrictModeration(moderationInput, {
      scene: 'forum_comment',
      timeoutMs: COMMENT_SYNC_MODERATION_TIMEOUT_MS
    });
    if (strictModerationResult.status === REJECTED_STATUS) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          code: 'SYNC_MODERATION_BLOCK',
          message: strictModerationResult.message || '评论需要先通过内容审查，请调整后再发送'
        })
      };
    }
  }

  const commentData = {
    post_id: safePostId,
    content: safeContent,
    author_id: safeAuthorId,
    author_username: authorUsername,
    status: normalizedStatus
  };

  if (parentId) commentData.parent_id = parentId;
  if (replyToUsername) commentData.reply_to_username = replyToUsername;

  const { data, error } = await supabase.from('comments').insert([commentData]).select();
  const insertedComment = Array.isArray(data) ? data[0] : null;
  const insertedCommentId = String(insertedComment?.id || '').trim();

  if (!error && Array.isArray(data) && data[0]?.id) {
    const inserted = data[0];
    const insertedStatus = String(inserted.status || '').trim().toLowerCase();
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
          error: normalizeError
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
        content: safeContent
      });
    }
  }
  return { ok: !error, data, error: normalizeDbError(error) };
}

export async function deleteComment(commentId, userId, userRole) {
  const { data: comment, error: commentError } = await supabase
    .from('comments')
    .select('author_id, status')
    .eq('id', commentId)
    .single();

  if (commentError) {
    return { ok: false, success: false, error: '评论不存在' };
  }

  if (comment.author_id !== userId && userRole !== 'admin') {
    return { ok: false, success: false, error: '没有权限删除此评论' };
  }

  const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId);
  if (deleteError) {
    logger.error('forum-api', '删除评论失败', deleteError);
    return { ok: false, success: false, error: `删除失败: ${deleteError.message}` };
  }

  invalidateByTags(['comments', 'posts', 'notifications']);
  return { ok: true, success: true, error: null };
}
