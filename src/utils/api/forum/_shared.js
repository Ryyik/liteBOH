import { supabase } from '../../supabase-client.js';
import { logger } from '../../logger.js';
import { createNotification, sendPushplusForNotification } from '../notifications-api.js';
import { writeModerationAuditLog } from '../../unified-content-moderation.js';

/**
 * 把「可能非法」的数值入参归一成非负数（转不了就用 fallback）。
 *
 * ⚠️ 为什么不能用 `Math.max(0, Number(x))` 代替：`Number('abc')` 是 `NaN`，而
 * **`Math.max(0, NaN) === NaN`**（不是 0）—— 夹逼对 NaN 是恒等传播，不是兜底。
 * 深链 `?page=abc` / 外部组件传字符串就是最近的触发面：`NaN` 会一路流进
 * `.range(NaN, NaN)` 或 RPC 的 `p_page: NaN`，表现为 400 或静默空列表。
 *
 * 语义：能转成有限数就夹到 ≥0（**不取整**，不在这里偷偷改口径）；否则用 fallback。
 */
export function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/** 同 `toNonNegativeNumber`，但下界是 1（page / pageSize / limit 用）。 */
export function toPositiveInt(value, fallback = 1) {
  return Math.max(1, toNonNegativeNumber(value, fallback));
}

export function isMissingRpcFunctionError(error, functionName) {
  if (!error) return false;
  if (String(error.code || '') === 'PGRST202') return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('could not find the function') &&
    message.includes(String(functionName || '').toLowerCase())
  );
}

/**
 * 「写入的列还不存在」判定 —— 给「前端已上线、迁移未 apply」这个窗口用。
 *
 * 为什么需要：前端是 CI 自动部署，迁移要人工 apply，两者顺序不可控。
 * 2026-10-29 新增 posts.edited_at 时，若前端先上线，updatePost 会带一个不存在的列
 * → PostgREST 直接 400 ⇒ **编辑帖子整体失败**。有这条判定就能降级重试（少个标记而已）。
 *
 * 三种形态都要认（PostgREST 不同版本报法不同）：
 *   · 42703            PostgreSQL undefined_column
 *   · PGRST204         PostgREST「could not find the 'x' column ... in the schema cache」
 *   · 文案匹配         兜底，覆盖网关改写过的 message
 */
export function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204') return true;
  const message = String(error.message || '').toLowerCase();
  const column = String(columnName || '').toLowerCase();
  const mentionsMissing =
    message.includes('does not exist') ||
    message.includes('not found') ||
    message.includes('schema cache');
  if (!mentionsMissing) return false;
  return column ? message.includes(column) : message.includes('column');
}

// —— 转发原帖批量回源（论坛列表引用框 / 个人空间帖子网格共用，真相源单一） ——
// 转发帖只存转发留言，原帖靠 repost_of_post_id 引用；会话级缓存，
// 查不到（limited 非本人/rejected/删除）也缓存 null 防重复查询。
const quotedPostCache = new Map();

export async function fetchQuotedPostsByIds(ids = []) {
  const allIds = [
    ...new Set(
      (Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean),
    ),
  ];
  const missing = allIds.filter((id) => !quotedPostCache.has(id));

  if (missing.length) {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, body, content, author_id, author_username, created_at, cover_image_url')
        .in('id', missing);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const found = new Set();
      rows.forEach((row) => {
        quotedPostCache.set(row.id, row);
        found.add(row.id);
      });
      missing.forEach((id) => {
        if (!found.has(id)) quotedPostCache.set(id, null);
      });
    } catch (error) {
      logger.warn('forum-api', '转发原帖批量回源失败（引用展示降级）', { ids: missing, error });
      return new Map();
    }
  }

  const result = new Map();
  allIds.forEach((id) => {
    if (quotedPostCache.has(id)) result.set(id, quotedPostCache.get(id));
  });
  return result;
}

export function getCachedQuotedPost(id) {
  const key = String(id || '').trim();
  return key && quotedPostCache.has(key) ? quotedPostCache.get(key) : null;
}

export async function writeAsyncModerationLog(targetId, targetType, moderationResult = {}) {
  await writeModerationAuditLog({
    targetId,
    targetType,
    result: moderationResult,
    moderatorId: null,
  });
}

export async function ensureModerationNotification({
  recipientId,
  type,
  postId = null,
  commentId = null,
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
        error: existingError,
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
        error: result.error,
      });
    }
  } catch (error) {
    logger.warn('forum-api', '写入审查通知异常（不阻断）', {
      recipientId: safeRecipientId,
      type: safeType,
      postId: safePostId || null,
      commentId: safeCommentId || null,
      error,
    });
  }
}

export async function notifyPostAuthorForComment({ postId, senderId, commentId } = {}) {
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
      comment_id: safeCommentId,
    });
    if (!pushResult?.success) {
      logger.warn('forum-api', '评论 Pushplus 推送未发送', {
        reason: pushResult?.message || 'unknown',
        postId: safePostId,
        commentId: safeCommentId,
        recipientId: postInfo.author_id,
      });
    }
  } catch (pushError) {
    logger.warn('forum-api', '评论 Pushplus 推送失败(静默)', pushError);
  }
}

export async function notifyPostAuthorForLike({ postId, senderId } = {}) {
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
      post_id: safePostId,
    });
    if (!pushResult?.success) {
      logger.warn('forum-api', '点赞 Pushplus 推送未发送', {
        reason: pushResult?.message || 'unknown',
        postId: safePostId,
        recipientId: postInfo.author_id,
      });
    }
  } catch (pushError) {
    logger.warn('forum-api', '点赞 Pushplus 推送失败(静默)', pushError);
  }
}

// 转发推送：通知行由 create_forum_quote_repost RPC 落库（migration 2026091101），
// 这里只负责 Pushplus 推送（与 like/comment 同模式）
export async function notifyPostAuthorForRepost({ postId, senderId } = {}) {
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
      type: 'repost',
      post_id: safePostId,
    });
    if (!pushResult?.success) {
      logger.warn('forum-api', '转发 Pushplus 推送未发送', {
        reason: pushResult?.message || 'unknown',
        postId: safePostId,
        recipientId: postInfo.author_id,
      });
    }
  } catch (pushError) {
    logger.warn('forum-api', '转发 Pushplus 推送失败(静默)', pushError);
  }
}
