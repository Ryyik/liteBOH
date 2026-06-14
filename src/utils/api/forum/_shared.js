import { supabase } from '../../supabase-client.js';
import { logger } from '../../logger.js';
import { createNotification, sendPushplusForNotification } from '../notifications-api.js';
import { writeModerationAuditLog } from '../../unified-content-moderation.js';

export function isMissingRpcFunctionError(error, functionName) {
  if (!error) return false;
  if (String(error.code || '') === 'PGRST202') return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('could not find the function') && message.includes(String(functionName || '').toLowerCase());
}

export async function writeAsyncModerationLog(targetId, targetType, moderationResult = {}) {
  await writeModerationAuditLog({
    targetId,
    targetType,
    result: moderationResult,
    moderatorId: null
  });
}

export async function ensureModerationNotification({
  recipientId,
  type,
  postId = null,
  commentId = null
} = {}) {
  const safeRecipientId = String(recipientId || '').trim();
  const safeType = String(type || '').trim();
  const safePostId = String(postId || '').trim();
  const safeCommentId = String(commentId || '').trim();

  if (!safeRecipientId || !safeType) return;

  try {
    let existingQuery = supabase
      .from('notifications')
      .select('id')
      .eq('recipient_id', safeRecipientId)
      .eq('type', safeType);

    if (safePostId) existingQuery = existingQuery.eq('post_id', safePostId);
    if (safeCommentId) existingQuery = existingQuery.eq('comment_id', safeCommentId);

    const { data: existingRows, error: existingError } = await existingQuery
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      logger.warn('forum-api', '查询既有审查通知失败，降级为直接插入', {
        recipientId: safeRecipientId,
        type: safeType,
        postId: safePostId || null,
        commentId: safeCommentId || null,
        error: existingError
      });
    } else if (Array.isArray(existingRows) && existingRows.length > 0) {
      return;
    }

    const payload = {};
    if (safePostId) payload.post_id = safePostId;
    if (safeCommentId) payload.comment_id = safeCommentId;

    const result = await createNotification(safeRecipientId, null, safeType, payload);
    if (!result.ok) {
      logger.warn('forum-api', '写入审查通知失败（不阻断）', {
        recipientId: safeRecipientId,
        type: safeType,
        postId: safePostId || null,
        commentId: safeCommentId || null,
        error: result.error
      });
    }
  } catch (error) {
    logger.warn('forum-api', '写入审查通知异常（不阻断）', {
      recipientId: safeRecipientId,
      type: safeType,
      postId: safePostId || null,
      commentId: safeCommentId || null,
      error
    });
  }
}

export async function notifyPostAuthorForComment({
  postId,
  senderId,
  commentId
} = {}) {
  const safePostId = String(postId || '').trim();
  const safeSenderId = String(senderId || '').trim();
  const safeCommentId = String(commentId || '').trim();
  if (!safePostId || !safeSenderId || !safeCommentId) return;

  try {
    const { data: postInfo, error: postError } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', safePostId)
      .single();

    if (postError || !postInfo?.author_id || postInfo.author_id === safeSenderId) {
      return;
    }

    const pushResult = await sendPushplusForNotification({
      recipient_id: postInfo.author_id,
      sender_id: safeSenderId,
      type: 'comment',
      post_id: safePostId,
      comment_id: safeCommentId
    });
    if (!pushResult?.success) {
      logger.warn('forum-api', '评论 Pushplus 推送未发送', {
        reason: pushResult?.message || 'unknown',
        postId: safePostId,
        commentId: safeCommentId,
        recipientId: postInfo.author_id
      });
    }
  } catch (pushError) {
    logger.warn('forum-api', '评论 Pushplus 推送失败(静默)', pushError);
  }
}

export async function notifyPostAuthorForLike({
  postId,
  senderId
} = {}) {
  const safePostId = String(postId || '').trim();
  const safeSenderId = String(senderId || '').trim();
  if (!safePostId || !safeSenderId) return;

  try {
    const { data: postInfo, error: postError } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', safePostId)
      .single();

    if (postError || !postInfo?.author_id || postInfo.author_id === safeSenderId) {
      return;
    }

    const pushResult = await sendPushplusForNotification({
      recipient_id: postInfo.author_id,
      sender_id: safeSenderId,
      type: 'like',
      post_id: safePostId
    });
    if (!pushResult?.success) {
      logger.warn('forum-api', '点赞 Pushplus 推送未发送', {
        reason: pushResult?.message || 'unknown',
        postId: safePostId,
        recipientId: postInfo.author_id
      });
    }
  } catch (pushError) {
    logger.warn('forum-api', '点赞 Pushplus 推送失败(静默)', pushError);
  }
}
