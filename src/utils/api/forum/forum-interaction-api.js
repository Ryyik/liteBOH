import { supabase } from '../../supabase-client.js';
import { normalizeDbError, invalidateByTags } from '../../request-core.js';
import { logger } from '../../logger.js';
import {
  normalizeForumReportError
} from '../forum-format.js';
import {
  isMissingRpcFunctionError,
  notifyPostAuthorForLike,
  notifyPostAuthorForRepost
} from './_shared.js';

export async function toggleLike(postId, userId) {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('toggle_forum_like', {
      p_post_id: postId
    });

    if (!rpcError) {
      const resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const action = String(resultRow?.action || '').trim();
      if (action) {
        invalidateByTags(['likes', 'posts', 'notifications']);
        if (action === 'liked') {
          void notifyPostAuthorForLike({ postId, senderId: userId });
        }
        return {
          ok: true,
          action,
          data: {
            likeCount: Number(resultRow?.like_count || 0),
            isLiked: Boolean(resultRow?.is_liked)
          },
          error: null
        };
      }
    } else if (!isMissingRpcFunctionError(rpcError, 'toggle_forum_like')) {
      logger.error('forum-api', 'toggle_forum_like RPC 失败', rpcError);
      return { ok: false, action: null, error: normalizeDbError(rpcError) };
    }

    const { data: existingLike, error: checkError } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('forum-api', '检查点赞状态失败', checkError);
      return { ok: false, action: null, error: normalizeDbError(checkError) };
    }

    if (existingLike) {
      const { error: deleteError } = await supabase
        .from('likes')
        .delete()
        .eq('id', existingLike.id);

      if (!deleteError) invalidateByTags(['likes', 'posts', 'notifications']);
      return {
        ok: !deleteError,
        action: 'unliked',
        data: { likeCount: null, isLiked: false },
        error: normalizeDbError(deleteError)
      };
    }

    const { error: insertError } = await supabase
      .from('likes')
      .insert([{ post_id: postId, user_id: userId }]);

    if (!insertError) {
      invalidateByTags(['likes', 'posts', 'notifications']);
      void notifyPostAuthorForLike({ postId, senderId: userId });
    }
    return {
      ok: !insertError,
      action: insertError ? null : 'liked',
      data: { likeCount: null, isLiked: !insertError },
      error: normalizeDbError(insertError)
    };
  } catch (error) {
    logger.error('forum-api', 'toggleLike 异常', error);
    return { ok: false, action: null, error: normalizeDbError(error) };
  }
}

export async function checkIfLiked(postId, userId) {
  const safePostId = String(postId || '').trim();
  const safeUserId = String(userId || '').trim();
  if (!safePostId || !safeUserId) return false;

  const { data, error } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', safePostId)
    .eq('user_id', safeUserId)
    .maybeSingle();

  if (error) {
    logger.warn('forum-api', '查询点赞状态失败，按未点赞处理', {
      postId: safePostId,
      userId: safeUserId,
      error
    });
    return false;
  }

  return !!data;
}

/**
 * 评论点赞切换：主通道 toggle_forum_comment_like RPC（原子返回 action/like_count/is_liked），
 * RPC 缺失（42883）时降级直查/写 comment_likes 表 —— 与 toggleLike 同构。
 */
export async function toggleCommentLike(commentId, userId) {
  const safeCommentId = String(commentId || '').trim();
  if (!safeCommentId) return { ok: false, action: null, error: { message: '缺少评论 id' } };

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('toggle_forum_comment_like', {
      p_comment_id: safeCommentId
    });

    if (!rpcError) {
      const resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const action = String(resultRow?.action || '').trim();
      if (action) {
        invalidateByTags(['comment_likes', 'comments']);
        return {
          ok: true,
          action,
          data: {
            likeCount: Number(resultRow?.like_count || 0),
            isLiked: Boolean(resultRow?.is_liked)
          },
          error: null
        };
      }
    } else if (!isMissingRpcFunctionError(rpcError, 'toggle_forum_comment_like')) {
      if (String(rpcError?.message || '').includes('NOT_AUTHENTICATED')) {
        return { ok: false, action: null, error: { message: '请先登录', code: 'NOT_AUTHENTICATED' } };
      }
      logger.error('forum-api', 'toggle_forum_comment_like RPC 失败', rpcError);
      return { ok: false, action: null, error: normalizeDbError(rpcError) };
    }

    // 降级：直查/写 comment_likes
    const { data: existingLike, error: checkError } = await supabase
      .from('comment_likes')
      .select('id')
      .eq('comment_id', safeCommentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      logger.error('forum-api', '检查评论点赞状态失败', checkError);
      return { ok: false, action: null, error: normalizeDbError(checkError) };
    }

    if (existingLike) {
      const { error: deleteError } = await supabase
        .from('comment_likes')
        .delete()
        .eq('id', existingLike.id);
      if (!deleteError) invalidateByTags(['comment_likes', 'comments']);
      return { ok: !deleteError, action: 'unliked', data: { likeCount: null, isLiked: false }, error: normalizeDbError(deleteError) };
    }

    const { error: insertError } = await supabase
      .from('comment_likes')
      .insert([{ comment_id: safeCommentId, user_id: userId }]);

    if (!insertError) invalidateByTags(['comment_likes', 'comments']);
    return {
      ok: !insertError,
      action: insertError ? null : 'liked',
      data: { likeCount: null, isLiked: !insertError },
      error: normalizeDbError(insertError)
    };
  } catch (error) {
    logger.error('forum-api', 'toggleCommentLike 异常', error);
    return { ok: false, action: null, error: normalizeDbError(error) };
  }
}

/** 批量查询当前用户对一组评论的已赞 id 集合（顶层+楼中楼统一入口）。 */
export async function getLikedCommentIds(commentIds, userId) {
  const safeUserId = String(userId || '').trim();
  const ids = (Array.isArray(commentIds) ? commentIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (!safeUserId || !ids.length) return new Set();

  const { data, error } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', safeUserId)
    .in('comment_id', ids);

  if (error) {
    logger.warn('forum-api', '批量查询评论点赞状态失败，按全部未赞处理', { error });
    return new Set();
  }
  return new Set((data || []).map((row) => String(row.comment_id)));
}

export async function createQuoteRepost(postId, commentary, { senderId } = {}) {
  const safePostId = String(postId || '').trim();
  const safeCommentary = String(commentary || '').trim();
  if (!safePostId || !safeCommentary) {
    return { ok: false, data: null, error: normalizeDbError({ code: 'INVALID_REPOST', message: '转发留言不能为空' }) };
  }
  const { data, error } = await supabase.rpc('create_forum_quote_repost', {
    p_post_id: safePostId,
    p_commentary: safeCommentary
  });
  if (error) {
    logger.error('forum-api', '引用转发失败', error);
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  invalidateByTags(['posts', 'notifications']);
  // 通知行由 create_forum_quote_repost RPC 落库（migration 2026091101），这里补 Pushplus 推送
  void notifyPostAuthorForRepost({ postId: safePostId, senderId });
  return { ok: true, data, error: null };
}

/**
 * 管理员投稿：把一条新闻/活动以官方卡形式发布到论坛信息流。
 * 幂等：官方卡已存在时 created = false，不改动已有卡。
 * @param {string} sourceType 'news' | 'activity'
 * @param {string} sourceId 来源表主键（字符串化）
 * @returns {{ ok: boolean, data: { postId: string, created: boolean } | null, error: object|null }}
 */
export async function publishOfficialForumCard(sourceType, sourceId) {
  const safeType = String(sourceType || '').trim().toLowerCase();
  const safeSourceId = String(sourceId ?? '').trim();
  if (!safeType || !safeSourceId) {
    return { ok: false, data: null, error: normalizeDbError({ code: 'INVALID_SOURCE', message: '来源类型或 ID 无效' }) };
  }
  const { data, error } = await supabase.rpc('publish_official_forum_card', {
    p_source_type: safeType,
    p_source_id: safeSourceId
  });
  if (error) {
    logger.error('forum-api', '官方内容投稿失败', error);
    return { ok: false, data: null, error: normalizeDbError(error) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  invalidateByTags(['posts']);
  return {
    ok: true,
    data: {
      postId: String(row?.post_id || ''),
      created: Boolean(row?.created)
    },
    error: null
  };
}

/**
 * 按官方卡来源（news/activity 镜像）解析可转发的 posts 卡 id。
 * @param {string} sourceType 'news' | 'activity'
 * @param {string} sourceId 来源表主键（字符串化）
 * @returns {{ id: string|null, error: object|null }}
 */
export async function findQuoteRepostSourceId(sourceType, sourceId) {
  const safeType = String(sourceType || '').trim().toLowerCase();
  const safeSourceId = String(sourceId ?? '').trim();
  if (!safeType || !safeSourceId) {
    return { id: null, error: null };
  }
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('source_type', safeType)
    .eq('source_id', safeSourceId)
    .eq('status', 'approved')
    .limit(1);
  if (error) {
    logger.error('forum-api', '解析官方转发卡失败', error);
    return { id: null, error: normalizeDbError(error) };
  }
  return { id: data?.[0]?.id || null, error: null };
}

export async function reportPost(postId, reason = 'other', detail = '') {
  const safePostId = String(postId || '').trim();
  const safeReason = String(reason || 'other').trim() || 'other';
  const safeDetail = String(detail || '').trim();

  if (!safePostId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ code: 'INVALID_POST_ID', message: '帖子不存在或已被删除' })
    };
  }

  const { data, error } = await supabase.rpc('submit_forum_post_report', {
    p_post_id: safePostId,
    p_reason: safeReason,
    p_detail: safeDetail
  });

  if (error) {
    if (isMissingRpcFunctionError(error, 'submit_forum_post_report')) {
      return {
        ok: false,
        data: null,
        error: normalizeDbError({
          code: 'FORUM_REPORT_MIGRATION_REQUIRED',
          message: '举报功能的数据库迁移尚未部署，请先执行最新 Supabase migration'
        })
      };
    }
    return { ok: false, data: null, error: normalizeForumReportError(error) };
  }

  if (data?.ok === false) {
    return {
      ok: false,
      data,
      error: normalizeForumReportError({
        code: data?.code || 'REPORT_FAILED',
        message: data?.message || '举报提交失败'
      })
    };
  }

  invalidateByTags(['posts', 'notifications']);
  return {
    ok: true,
    data: {
      reportId: data?.reportId || data?.report_id || null,
      reportCount: Number(data?.reportCount ?? data?.report_count ?? 0),
      threshold: Number(data?.threshold || 0),
      limited: Boolean(data?.limited),
      message: String(data?.message || '举报已提交，感谢反馈')
    },
    error: null
  };
}
