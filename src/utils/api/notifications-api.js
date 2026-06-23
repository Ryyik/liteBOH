import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
import { logger } from '../logger.js';
import { getUserPushplusToken } from './pushplus-api.js';
import { sendNotificationPush } from '../pushplus.js';
import { getForumPostExcerpt } from '../forum-post-format.js';

export function filterSelfActionNotifications(notifications = []) {
  return notifications.filter((n) => {
    if (n.sender_id && n.recipient_id && n.sender_id === n.recipient_id) {
      if (n.type === 'like' || n.type === 'comment') {
        return false;
      }
    }
    return true;
  });
}

function isMissingRpcFunctionError(error, functionName = '') {
  if (!error) return false;
  if (String(error.code || '').trim().toUpperCase() === 'PGRST202') return true;
  const message = String(error.message || '').toLowerCase();
  const safeFunctionName = String(functionName || '').trim().toLowerCase();
  if (!safeFunctionName) {
    return message.includes('could not find the function');
  }
  return message.includes('could not find the function') && message.includes(safeFunctionName);
}

function extractMissingColumnName(error) {
  const message = String(error?.message || '');
  const details = String(error?.details || '');
  const combined = `${message} ${details}`;

  const directMatch = combined.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
  if (directMatch?.[1]) return directMatch[1];

  const schemaCacheMatch = combined.match(/["']([a-zA-Z0-9_]+)["']\s+column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  return '';
}

async function insertNotificationWithCompatibility(notificationData = {}) {
  let payload = { ...notificationData };
  let lastError = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase
      .from('notifications')
      .insert(payload)
      .select()
      .single();

    if (!error) {
      return { data, error: null, payload };
    }

    lastError = error;
    const missingColumn = extractMissingColumnName(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      break;
    }

    logger.warn('notifications-api', `notifications 表缺少字段 ${missingColumn}，降级移除后重试`, { error });
    const { [missingColumn]: _removed, ...rest } = payload;
    payload = rest;
  }

  return { data: null, error: lastError, payload };
}

export async function getUserNotifications(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const cursor = String(options.cursor || '').trim();

  return executeRead(
    'notifications.getUserNotifications',
    { userId, limit, cursor },
    async () => {
      let query = supabase
        .from('notifications')
        .select(`
          *,
          sender:sender_id(id, username, avatar_url),
          post:post_id(id, title, body, content),
          comment:comment_id(
            id,
            content,
            parent_id,
            author_username,
            parent:parent_id(id, parent_id, author_username)
          )
        `)
        .eq('recipient_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(limit + 1);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('notifications-api', '获取通知列表失败', error);
        return { data: [], error, hasMore: false, nextCursor: null };
      }
      const rows = data || [];
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at || null : null;
      return { data: pageRows, error: null, hasMore, nextCursor };
    },
    { ttlMs: 5000, tags: ['notifications', `notifications:user:${userId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function getArchivedNotifications(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const cursor = String(options.cursor || '').trim();

  return executeRead(
    'notifications.getArchivedNotifications',
    { userId, limit, cursor },
    async () => {
      let query = supabase
        .from('notifications')
        .select(`
          *,
          sender:sender_id(id, username, avatar_url),
          post:post_id(id, title, body, content),
          comment:comment_id(
            id,
            content,
            parent_id,
            author_username,
            parent:parent_id(id, parent_id, author_username)
          )
        `)
        .eq('recipient_id', userId)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
        .limit(limit + 1);

      if (cursor) {
        query = query.lt('archived_at', cursor);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('notifications-api', '获取已归档通知列表失败', error);
        return { data: [], error, hasMore: false, nextCursor: null };
      }
      const rows = data || [];
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.archived_at || null : null;
      return { data: pageRows, error: null, hasMore, nextCursor };
    },
    { ttlMs: 5000, tags: ['notifications', `notifications:user:${userId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function archiveNotification(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) {
    logger.error('notifications-api', '归档通知失败', error);
    return { ok: false, error: normalizeDbError(error) };
  }
  invalidateByTags(['notifications']);
  return { ok: true, data: true, error: null };
}

export async function unarchiveNotification(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: null })
    .eq('id', notificationId);

  if (error) {
    logger.error('notifications-api', '取消归档通知失败', error);
    return { ok: false, error: normalizeDbError(error) };
  }
  invalidateByTags(['notifications']);
  return { ok: true, data: true, error: null };
}

export async function archiveAllNotifications(userId, types = null) {
  let query = supabase
    .from('notifications')
    .update({ archived_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('archived_at', null);

  if (Array.isArray(types) && types.length > 0) {
    query = query.in('type', types);
  } else if (typeof types === 'string' && types) {
    query = query.eq('type', types);
  }

  const { error } = await query;

  if (error) {
    logger.error('notifications-api', '批量归档通知失败', error);
    return { ok: false, error: normalizeDbError(error) };
  }
  invalidateByTags(['notifications']);
  return { ok: true, data: true, error: null };
}

export async function markNotificationAsRead(notificationId) {
  let { error } = await supabase.rpc('mark_single_as_read', { notification_id: notificationId });

  if (error && isMissingRpcFunctionError(error, 'mark_single_as_read')) {
    logger.warn('notifications-api', '缺少 mark_single_as_read RPC，降级为直接更新 notifications.status', { error });
    const fallback = await supabase
      .from('notifications')
      .update({ status: 'read' })
      .eq('id', notificationId);
    error = fallback.error;
  }

  if (error) {
    logger.error('notifications-api', '标记单条已读失败', error);
    return { ok: false, error: normalizeDbError(error) };
  }
  invalidateByTags(['notifications']);
  return { ok: true, data: true, error: null };
}

export async function markAllNotificationsAsRead(userId) {
  let { error } = await supabase.rpc('mark_all_as_read', { target_user_id: userId });

  if (error && isMissingRpcFunctionError(error, 'mark_all_as_read')) {
    logger.warn('notifications-api', '缺少 mark_all_as_read RPC，降级为批量更新 notifications.status', { error });
    const fallback = await supabase
      .from('notifications')
      .update({ status: 'read' })
      .eq('recipient_id', userId)
      .eq('status', 'unread')
      .is('archived_at', null);
    error = fallback.error;
  }

  if (error) {
    logger.error('notifications-api', '标记全部已读失败', error);
    return { ok: false, error: normalizeDbError(error) };
  }
  invalidateByTags(['notifications']);
  return { ok: true, data: true, error: null };
}

export async function createNotification(recipientId, senderId, type, data = {}) {
  const notificationData = {
    recipient_id: recipientId,
    sender_id: senderId || null,
    type,
    status: 'unread',
    ...data
  };

  const { data: result, error } = await insertNotificationWithCompatibility(notificationData);

  if (!error) {
    invalidateByTags(['notifications']);
    try {
      const pushResult = await sendPushplusForNotification(result || notificationData);
      const skipWarnReasons = new Set([
        '当前通知类型不发送 Pushplus',
        '接收者未启用 Pushplus',
        '跳过自操作推送'
      ]);
      if (!pushResult?.success && !skipWarnReasons.has(pushResult?.message || '')) {
        logger.warn('notifications-api', 'Pushplus 推送未发送', {
          reason: pushResult?.message || 'unknown',
          type: notificationData.type,
          recipientId: notificationData.recipient_id
        });
      }
    } catch (pushError) {
      logger.warn('notifications-api', '发送 Pushplus 推送失败(静默)', pushError);
    }
  }
  return { ok: !error, data: result, error: normalizeDbError(error) };
}

export async function getUnreadNotificationCount(userId) {
  const { data, error } = await executeRead(
    'notifications.getUnreadNotificationCount',
    { userId },
    async () => {
      const { data: countData, error: rpcError } = await supabase
        .rpc('get_unread_notification_count', { p_recipient_id: userId });

      if (!rpcError) {
        const rawCount = Array.isArray(countData) ? (countData[0]?.count ?? 0) : (countData?.count ?? 0);
        return {
          data: { count: rawCount, notifCount: rawCount, mailCount: 0 },
          error: null
        };
      }

      // 仅当 RPC 函数缺失时才降级，其他错误直接返回
      if (isMissingRpcFunctionError(rpcError, 'get_unread_notification_count')) {
        logger.warn('notifications-api', '缺少 get_unread_notification_count RPC，降级为直接查询', { error: rpcError });
        const { data: notifData, error: fallbackError } = await supabase
          .from('notifications')
          .select('id, sender_id, recipient_id, type')
          .eq('recipient_id', userId)
          .eq('status', 'unread')
          .is('archived_at', null);
        const filteredNotifications = filterSelfActionNotifications(notifData || []);
        const notifCount = filteredNotifications.length;

        return {
          data: { count: notifCount, notifCount, mailCount: 0 },
          error: fallbackError
        };
      }

      // 其他 RPC 错误直接返回，不触发降级
      logger.error('notifications-api', '获取未读通知数量 RPC 调用失败', rpcError);
      return {
        data: { count: 0, notifCount: 0, mailCount: 0 },
        error: rpcError
      };
    },
    { ttlMs: 5000, tags: ['notifications', `notifications:user:${userId}`], timeoutMs: 8000, retry: 1 }
  );

  return {
    ok: !error,
    count: data?.count || 0,
    notifCount: data?.notifCount || 0,
    mailCount: data?.mailCount || 0,
    data,
    error
  };
}

export function subscribeToNotifications(userId, callback) {
  const safeUserId = String(userId || '').replace(/[^\w\-]/g, '');
  const channel = supabase
    .channel('public:notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${safeUserId}`
      },
      (payload) => {
        try {
          callback(payload.new);
        } catch (error) {
          logger.error('notifications-api', '实时订阅回调处理失败', {
            error,
            payload: payload.new,
            userId
          });
          // 不中断订阅，继续监听后续事件
        }
      }
    )
    .on('system', (payload) => {
      // 监听连接状态变化
      const status = payload?.status;
      logger.debug('notifications-api', '实时订阅状态变化', { status, userId });
      
      // 连接断开或错误时，记录日志
      if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        logger.warn('notifications-api', '实时订阅连接异常', { status, userId });
      }
    })
    .subscribe((status) => {
      // 订阅状态回调
      logger.debug('notifications-api', '订阅状态', { status, userId });
      
      if (status === 'SUBSCRIBED') {
        logger.info('notifications-api', '实时订阅成功', { userId });
      } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        logger.error('notifications-api', '实时订阅失败或断开', { status, userId });
      }
    });
  
  return channel;
}

async function getProfileUsername(userId) {
  if (!userId) return '';

  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();

  if (error) {
    logger.warn('notifications-api', '获取通知发送者用户名失败', error);
    return '';
  }

  return data?.username || '';
}

async function getPostContent(postId) {
  if (!postId) return '';

  const { data, error } = await supabase
    .from('posts')
    .select('title, body, content')
    .eq('id', postId)
    .single();

  if (error) {
    logger.warn('notifications-api', '获取帖子内容失败', error);
    return '';
  }

  return getForumPostExcerpt(data || {}, 150);
}

async function getCommentContent(commentId) {
  if (!commentId) return '';

  const { data, error } = await supabase
    .from('comments')
    .select('content')
    .eq('id', commentId)
    .single();

  if (error) {
    logger.warn('notifications-api', '获取评论内容失败', error);
    return '';
  }

  return data?.content || '';
}

export async function sendPushplusForNotification(notification = {}) {
  const recipientId = notification.recipient_id;
  const senderId = notification.sender_id || null;
  const type = notification.type;

  if (!recipientId || !type) return { success: false, message: '缺少通知关键信息', data: null };
  if (senderId && recipientId === senderId) return { success: false, message: '跳过自操作推送', data: null };
  if (!['like', 'comment', 'impression'].includes(type)) {
    return { success: false, message: '当前通知类型不发送 Pushplus', data: null };
  }

  const token = await getUserPushplusToken(recipientId);
  if (!token) {
    return { success: false, message: '接收者未启用 Pushplus', data: null };
  }

  const [senderName, postContent, commentContent] = await Promise.all([
    getProfileUsername(senderId),
    getPostContent(notification.post_id),
    getCommentContent(notification.comment_id)
  ]);

  return sendNotificationPush(token, type, {
    senderName: senderName || '有人',
    postContent,
    commentContent,
    impressionContent: notification.content || ''
  });
}
