import { supabase } from '../../supabase-client.js';
import { normalizeDbError, invalidateByTags } from '../../request-core.js';
import { logger } from '../../logger.js';
import {
  normalizeForumReportError
} from '../forum-format.js';
import {
  isMissingRpcFunctionError,
  notifyPostAuthorForLike
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
