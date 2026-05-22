import { supabase } from '../supabase-client.js';
import { executeRead, invalidateByTags, normalizeDbError } from '../request-core.js';
import { logger } from '../logger.js';
import { sendPushplusForMessage } from './notifications-api.js';
import {
  UNIFIED_APPROVED_STATUS,
  UNIFIED_REJECTED_STATUS,
  runAsyncRelaxedModeration,
  runKeywordPrecheck,
  writeModerationAuditLog,
  isMissingDbColumnError
} from '../unified-content-moderation.js';

function normalizeRecipient(recipient = {}) {
  const id = String(recipient?.id || '').trim();
  const username = String(recipient?.username || '').trim();
  if (!id || !username) return null;
  return { id, username };
}

function buildMessageModerationInput(subject = '', content = '') {
  const safeSubject = String(subject || '').trim();
  const safeContent = String(content || '').trim();
  if (!safeSubject) return safeContent;
  return `主题：${safeSubject}\n正文：${safeContent}`;
}

export async function getUserMessages(userId, options = {}) {
  const safeUserId = String(userId || '').trim();
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const cursor = String(options.cursor || '').trim();

  if (!safeUserId) {
    return {
      ok: false,
      data: [],
      error: normalizeDbError({ message: '缺少用户信息', code: 'MISSING_USER' }),
      hasMore: false,
      nextCursor: null
    };
  }

  return executeRead(
    'messages.getUserMessages',
    { userId: safeUserId, limit, cursor },
    async () => {
      const buildQuery = ({ includeModerationFilter = true } = {}) => {
        let query = supabase
          .from('messages')
          .select('*')
          .or(includeModerationFilter
            ? `sender_id.eq.${safeUserId},and(receiver_id.eq.${safeUserId},moderation_status.eq.approved)`
            : `sender_id.eq.${safeUserId},receiver_id.eq.${safeUserId}`)
          .order('created_at', { ascending: false })
          .limit(limit + 1);

        if (cursor) {
          query = query.lt('created_at', cursor);
        }

        return query;
      };

      let { data, error } = await buildQuery({ includeModerationFilter: true });

      if (error && isMissingDbColumnError(error, 'moderation_status')) {
        logger.warn('messages-api', 'messages 表缺少 moderation_status 字段，降级读取旧版信件列表', {
          userId: safeUserId,
          error
        });
        const fallback = await buildQuery({ includeModerationFilter: false });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        return { data: [], error, hasMore: false, nextCursor: null };
      }

      const rows = data || [];
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at || null : null;

      return {
        data: pageRows,
        error: null,
        hasMore,
        nextCursor
      };
    },
    { ttlMs: 5000, tags: ['messages', `messages:user:${safeUserId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function markMessageAsRead(messageId) {
  const safeMessageId = String(messageId || '').trim();
  if (!safeMessageId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '缺少信件 ID', code: 'MISSING_MESSAGE_ID' })
    };
  }

  const { error } = await supabase
    .from('messages')
    .update({ status: 'read' })
    .eq('id', safeMessageId);

  if (error) {
    logger.error('messages-api', '标记信件已读失败', error);
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateByTags(['messages', 'notifications']);
  return { ok: true, data: true, error: null };
}

export async function markMessagesAsRead(messageIds = []) {
  const safeMessageIds = [...new Set(
    (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )];

  if (!safeMessageIds.length) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '缺少信件 ID', code: 'MISSING_MESSAGE_ID' })
    };
  }

  const { error } = await supabase
    .from('messages')
    .update({ status: 'read' })
    .in('id', safeMessageIds);

  if (error) {
    logger.error('messages-api', '批量标记信件已读失败', error);
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateByTags(['messages', 'notifications']);
  return { ok: true, data: { count: safeMessageIds.length }, error: null };
}

export async function deleteMessage(messageId) {
  const safeMessageId = String(messageId || '').trim();
  if (!safeMessageId) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '缺少信件 ID', code: 'MISSING_MESSAGE_ID' })
    };
  }

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', safeMessageId);

  if (error) {
    logger.error('messages-api', '删除信件失败', error);
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  invalidateByTags(['messages', 'notifications']);
  return { ok: true, data: true, error: null };
}

async function insertMessageWithCompatibility(payload = {}) {
  const {
    sender_id,
    sender_name,
    receiver_id,
    receiver_name,
    subject,
    content,
    moderation_status,
    moderation_reason
  } = payload;

  const basePayload = {
    sender_id,
    sender_name,
    receiver_id,
    receiver_name,
    subject,
    content
  };

  const moderationPayload = {
    ...basePayload,
    moderation_status,
    moderation_reason
  };

  const insertWithSelect = (insertPayload) => {
    const query = supabase.from('messages').insert(insertPayload);
    return typeof query?.select === 'function' ? query.select('id') : query;
  };

  let result = await insertWithSelect(moderationPayload);
  if (!result.error) return result;

  const missingModerationStatus = isMissingDbColumnError(result.error, 'moderation_status');
  const missingModerationReason = isMissingDbColumnError(result.error, 'moderation_reason');
  if (!missingModerationStatus && !missingModerationReason) {
    return result;
  }

  logger.warn('messages-api', 'messages 表缺少审核字段，降级为旧版写入', {
    error: result.error
  });
  result = await insertWithSelect(basePayload);
  return result;
}

async function reviewMessageAfterSend({ messageId, subject, content, scene }) {
  const safeMessageId = String(messageId || '').trim();
  const safeContent = buildMessageModerationInput(subject, content);
  if (!safeMessageId || !safeContent) return;

  try {
    const moderation = await runAsyncRelaxedModeration(safeContent, { scene });
    await writeModerationAuditLog({
      targetId: safeMessageId,
      targetType: 'message',
      result: moderation
    });

    if (moderation.status !== UNIFIED_REJECTED_STATUS) return;

    const { error } = await supabase
      .from('messages')
      .update({
        moderation_status: UNIFIED_REJECTED_STATUS,
        moderation_reason: moderation.message || moderation.reason || '内容审查未通过'
      })
      .eq('id', safeMessageId);

    if (error) {
      logger.warn('messages-api', '异步私信复审回写失败', {
        messageId: safeMessageId,
        error
      });
    }
  } catch (error) {
    logger.warn('messages-api', '异步私信复审失败（不阻断发送）', {
      messageId: safeMessageId,
      error
    });
  }
}

export async function sendModeratedMessages({
  senderId,
  senderName,
  recipients = [],
  subject = '',
  content = '',
  scene = 'mail',
  failClosed = true,
  pushplus = true
} = {}) {
  const safeSenderId = String(senderId || '').trim();
  const safeSenderName = String(senderName || '').trim();
  const safeContent = String(content || '').trim();
  const safeSubject = String(subject || '').trim();
  const safeRecipients = (Array.isArray(recipients) ? recipients : [])
    .map((item) => normalizeRecipient(item))
    .filter(Boolean);

  if (!safeSenderId || !safeSenderName) {
    return {
      ok: false,
      blocked: false,
      sentCount: 0,
      failedCount: 0,
      moderation: null,
      results: [],
      error: normalizeDbError({ message: '缺少发件人信息', code: 'MISSING_SENDER' })
    };
  }

  if (!safeContent) {
    return {
      ok: false,
      blocked: false,
      sentCount: 0,
      failedCount: 0,
      moderation: null,
      results: [],
      error: normalizeDbError({ message: '信件内容不能为空', code: 'EMPTY_MESSAGE_CONTENT' })
    };
  }

  if (!safeRecipients.length) {
    return {
      ok: false,
      blocked: false,
      sentCount: 0,
      failedCount: 0,
      moderation: null,
      results: [],
      error: normalizeDbError({ message: '缺少有效收件人', code: 'MISSING_RECIPIENT' })
    };
  }

  const moderationInput = buildMessageModerationInput(safeSubject, safeContent);
  const moderation = runKeywordPrecheck(moderationInput, { scene });
  const moderationStatus = moderation.status === UNIFIED_REJECTED_STATUS
    ? UNIFIED_REJECTED_STATUS
    : UNIFIED_APPROVED_STATUS;
  const moderationReason = moderationStatus === UNIFIED_APPROVED_STATUS
    ? null
    : (moderation.message || moderation.reason || '内容审查未通过');

  if (moderationStatus === UNIFIED_REJECTED_STATUS && failClosed) {
    return {
      ok: false,
      blocked: true,
      sentCount: 0,
      failedCount: safeRecipients.length,
      moderation,
      results: [],
      error: normalizeDbError({ message: moderationReason, code: 'MODERATION_REJECTED' })
    };
  }

  const tasks = safeRecipients.map(async (recipient) => {
    const insertResult = await insertMessageWithCompatibility({
      sender_id: safeSenderId,
      sender_name: safeSenderName,
      receiver_id: recipient.id,
      receiver_name: recipient.username,
      subject: safeSubject,
      content: safeContent,
      moderation_status: moderationStatus,
      moderation_reason: moderationReason
    });

    if (!insertResult.error && moderationStatus === UNIFIED_APPROVED_STATUS && pushplus) {
      try {
        await sendPushplusForMessage({
          recipientId: recipient.id,
          senderId: safeSenderId,
          senderName: safeSenderName,
          subject: safeSubject,
          content: safeContent
        });
      } catch (pushError) {
        logger.warn('messages-api', '私信 Pushplus 推送失败(静默)', {
          recipientId: recipient.id,
          error: pushError
        });
      }
    }

    const insertedRow = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data;
    const messageId = String(insertedRow?.id || '').trim();
    if (!insertResult.error && moderationStatus === UNIFIED_APPROVED_STATUS && messageId) {
      void reviewMessageAfterSend({
        messageId,
        subject: safeSubject,
        content: safeContent,
        scene
      });
    }

    return {
      recipient,
      messageId: messageId || null,
      error: insertResult.error ? normalizeDbError(insertResult.error) : null
    };
  });

  const settled = await Promise.all(tasks);
  const errors = settled.filter((item) => item.error);

  return {
    ok: errors.length === 0,
    blocked: false,
    sentCount: settled.length - errors.length,
    failedCount: errors.length,
    moderation,
    results: settled,
    error: errors.length ? normalizeDbError({ message: `部分发送失败（${errors.length}）`, code: 'PARTIAL_FAILURE' }) : null
  };
}
