import { supabase } from '../supabase-client.js';
import { executeRead, normalizeDbError, invalidateByTags } from '../request-core.js';
import { logger } from '../logger.js';
import { createNotification, sendPushplusForNotification } from './notifications-api.js';
import {
  assertCloudinaryUploadAllowed,
  deleteCloudinaryAssetByToken,
  deleteCloudinaryAssetsByPublicIds,
  getCloudinaryTransformedUrl,
  markCloudinaryUploadsClaimed,
  uploadImageToCloudinary
} from '../cloudinary-client.js';
import {
  runKeywordPrecheck,
  runAsyncRelaxedModeration,
  runSyncStrictModeration,
  writeModerationAuditLog
} from '../unified-content-moderation.js';

const APPROVED_STATUS = 'approved';
const REJECTED_STATUS = 'rejected';
const ALLOWED_CONTENT_STATUS = new Set([APPROVED_STATUS, REJECTED_STATUS]);
const ALLOWED_SORT_MODE = new Set(['latest', 'hottest']);
const ALLOWED_FORUM_TAGS = new Set(['server', 'activity', 'daily', 'question']);
const DEFAULT_FORUM_TAG = 'daily';
const COMMENT_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const COMMENT_SYNC_MODERATION_TIMEOUT_MS = 12000;
const POST_ASYNC_MODERATION_TIMEOUT_MS = 45000;
const POST_REJECTED_NOTIFICATION_TYPE = 'post_rejected';
const COMMENT_REJECTED_NOTIFICATION_TYPE = 'comment_rejected';
const FORUM_IMAGE_MAX_COUNT = 6;
const FORUM_IMAGE_MAX_SIZE_MB = 10;
const FORUM_IMAGE_MAX_SIZE_BYTES = FORUM_IMAGE_MAX_SIZE_MB * 1024 * 1024;
const FORUM_ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT = 4;
const FORUM_LIST_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_720,h_540';
const FORUM_LIST_IMAGE_TRANSFORM_SM = 'f_auto,q_auto:good,c_fill,w_360,h_270';
const FORUM_LIST_IMAGE_TRANSFORM_MD = 'f_auto,q_auto:good,c_fill,w_540,h_405';
const FORUM_LIST_LQIP_TRANSFORM = 'f_auto,q_auto:low,c_fill,w_72,h_54,e_blur:1000';
const FORUM_DETAIL_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1600';
const FORUM_CLOUDINARY_FOLDER = String(
  import.meta.env.VITE_CLOUDINARY_FORUM_FOLDER
  || `${String(import.meta.env.VITE_CLOUDINARY_CLOUD_PLUS_FOLDER || 'boh-cloud-plus').replace(/\/+$/, '')}/forum`
).trim();
let forumImageModerationModulePromise = null;

async function loadForumImageModeration() {
  if (!forumImageModerationModulePromise) {
    forumImageModerationModulePromise = import('../forum-image-moderation.js');
  }
  try {
    return await forumImageModerationModulePromise;
  } catch (error) {
    forumImageModerationModulePromise = null;
    throw error;
  }
}

export async function preloadForumImageModeration() {
  try {
    const { preloadForumImageModerationModel } = await loadForumImageModeration();
    if (typeof preloadForumImageModerationModel !== 'function') {
      return { ok: false, skipped: true, error: null };
    }
    await preloadForumImageModerationModel();
    return { ok: true, skipped: false, error: null };
  } catch (error) {
    logger.warn('forum-api', '论坛图片安全检测模型预加载失败（不阻断发帖）', error);
    return { ok: false, skipped: false, error: normalizeDbError(error, '图片安全检测模型预加载失败') };
  }
}

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

function normalizeContentStatus(status, fallback = APPROVED_STATUS) {
  const normalized = String(status || '').trim().toLowerCase();
  return ALLOWED_CONTENT_STATUS.has(normalized) ? normalized : fallback;
}

function withAbortSignal(query, signal) {
  if (!signal || typeof query?.abortSignal !== 'function') return query;
  return query.abortSignal(signal);
}

function shouldSyncModerateComment(content = '') {
  const text = String(content || '').trim();
  if (!text) return false;
  const lowerText = text.toLowerCase();
  const repeatedChars = /(.)\1{8,}/u.test(text);
  const repeatedSegments = /(.{2,12})\1{4,}/u.test(text);
  const hasLink = /https?:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|top|xyz|cc|io|me)(\/|\s|$)/iu.test(text);
  const hasContactHook = /(加我|私聊|联系我|联系方式|vx|微信|qq|群号|代购|出售|购买|交易|带价|渠道)/iu.test(text);
  const hasRiskyAction = /(教程|配方|怎么做|怎么买|怎么卖|求购|接单|外挂|破解|刷号)/iu.test(text);
  return text.length > 500
    || hasLink
    || repeatedChars
    || repeatedSegments
    || hasContactHook
    || hasRiskyAction
    || lowerText.includes('telegram')
    || lowerText.includes('discord.gg');
}

export function normalizeForumTag(tag = '') {
  const normalized = String(tag || '').trim().toLowerCase();
  return ALLOWED_FORUM_TAGS.has(normalized) ? normalized : '';
}

function getEffectiveForumTag(tag = '') {
  return normalizeForumTag(tag) || DEFAULT_FORUM_TAG;
}

function normalizeForumDraftRecord(draft = {}) {
  if (!draft || typeof draft !== 'object') return null;
  const title = String(draft.title || '');
  const content = String(draft.content || '');
  if (!title.trim() && !content.trim()) return null;
  return {
    title,
    content,
    tag: getEffectiveForumTag(draft.tag),
    savedAt: new Date(draft.updated_at || draft.updatedAt || draft.savedAt || Date.now()).getTime()
  };
}

function matchesForumTagFilter(tag = '', tagFilter = '') {
  const safeFilter = normalizeForumTag(tagFilter);
  return !safeFilter || getEffectiveForumTag(tag) === safeFilter;
}

function applyForumTagFilter(query, tagFilter = '') {
  const safeFilter = normalizeForumTag(tagFilter);
  if (!safeFilter) return query;
  if (safeFilter === DEFAULT_FORUM_TAG) {
    return query.or(`tag.eq.${DEFAULT_FORUM_TAG},tag.is.null`);
  }
  return query.eq('tag', safeFilter);
}

function buildPostModerationInput(content) {
  const raw = String(content || '').trim();
  if (!raw) return '';

  const titleMatch = raw.match(/^【(.*?)】\n?([\s\S]*)$/);
  if (!titleMatch) {
    return `正文：${raw}`;
  }

  const title = String(titleMatch[1] || '').trim();
  const body = String(titleMatch[2] || '').trim();
  return `标题：${title}\n正文：${body}`;
}

function buildCommentModerationInput(content) {
  const safeContent = String(content || '').trim();
  return `正文：${safeContent}`;
}

function splitPostContent(content, title = '', body = '') {
  const explicitTitle = String(title || '').trim();
  const explicitBody = String(body || '').trim();
  if (explicitTitle || explicitBody) {
    return {
      title: explicitTitle || '无标题',
      body: stripLegacyPostTitlePrefix(explicitBody, explicitTitle)
    };
  }

  const raw = String(content || '').trim();
  if (!raw) {
    return { title: '无标题', body: '' };
  }

  const titleMatch = raw.match(/^【(.*?)】\n?([\s\S]*)$/);
  if (!titleMatch) {
    return { title: '无标题', body: raw };
  }

  return {
    title: String(titleMatch[1] || '').trim() || '无标题',
    body: stripLegacyPostTitlePrefix(String(titleMatch[2] || '').trim(), String(titleMatch[1] || '').trim())
  };
}

function stripLegacyPostTitlePrefix(body = '', title = '') {
  const safeBody = String(body || '').trim();
  const safeTitle = String(title || '').trim();
  if (!safeBody) return '';
  if (!safeTitle) {
    return safeBody.replace(/^【[^】]+】\s*/, '');
  }
  const titlePattern = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const legacyPattern = new RegExp(`^【\\s*${titlePattern}\\s*】\\s*`);
  return safeBody.replace(legacyPattern, '');
}

function normalizePostRecord(post = {}) {
  const parts = splitPostContent(post.content, post.title, post.body);
  const rawCoverUrl = String(post.cover_image_url || post.coverImageUrl || '').trim();
  const coverImageUrl = getCloudinaryTransformedUrl(rawCoverUrl, FORUM_DETAIL_IMAGE_TRANSFORM);
  const normalizedImages = normalizeForumImages(post.images || post.forum_post_images || [], { variant: 'detail' });
  const fallbackImages = normalizedImages.length || !coverImageUrl
    ? normalizedImages
    : normalizeForumImages([{
      id: `${String(post.id || 'post').trim() || 'post'}-cover`,
      url: rawCoverUrl || coverImageUrl,
      width: Number(post.cover_image_width || post.coverImageWidth || 0),
      height: Number(post.cover_image_height || post.coverImageHeight || 0),
      sortOrder: 0
    }], { variant: 'detail' });
  return {
    ...post,
    title: parts.title,
    body: parts.body,
    tag: getEffectiveForumTag(post.tag),
    image_count: Number(post.image_count || 0),
    cover_image_url: coverImageUrl,
    images: fallbackImages
  };
}

function normalizePostListRecord(post = {}) {
  const parts = splitPostContent(post.content, post.title, post.body);
  const explicitImages = normalizeForumImages(post.images || post.forum_post_images || [], { variant: 'list' });
  const firstImage = explicitImages[0] || null;
  const rawCoverUrl = String(
    post.cover_image_url
    || post.coverImageUrl
    || firstImage?.originalUrl
    || firstImage?.url
    || ''
  ).trim();
  const coverImageUrl = getCloudinaryTransformedUrl(rawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM);
  const previewImages = explicitImages.length
    ? explicitImages.slice(0, FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT)
    : coverImageUrl
    ? normalizeForumImages([{
      id: `${String(post.id || 'post').trim() || 'post'}-cover`,
      url: rawCoverUrl || coverImageUrl,
      publicId: firstImage?.publicId || '',
      width: Number(post.cover_image_width || post.coverImageWidth || firstImage?.width || 0),
      height: Number(post.cover_image_height || post.coverImageHeight || firstImage?.height || 0),
      sortOrder: 0
    }], { variant: 'list' })
    : [];

  return {
    ...post,
    title: parts.title,
    body: parts.body,
    tag: getEffectiveForumTag(post.tag),
    image_count: Math.max(Number(post.image_count || 0), explicitImages.length),
    cover_image_url: coverImageUrl,
    images: previewImages
  };
}

function normalizePostListRows(rows = []) {
  return Array.isArray(rows) ? rows.map(normalizePostListRecord) : [];
}

function normalizeForumImage(image = {}, { variant = 'detail' } = {}) {
  if (!image || typeof image !== 'object') return null;
  const originalUrl = String(
    image.originalUrl
    || image.original_url
    || image.secure_url
    || image.url
    || ''
  ).trim();
  if (!originalUrl) return null;

  const isList = variant === 'list';
  const transform = isList ? FORUM_LIST_IMAGE_TRANSFORM : FORUM_DETAIL_IMAGE_TRANSFORM;
  const detailUrl = getCloudinaryTransformedUrl(originalUrl, FORUM_DETAIL_IMAGE_TRANSFORM);
  const thumbUrl = getCloudinaryTransformedUrl(originalUrl, FORUM_LIST_IMAGE_TRANSFORM);

  const result = {
    id: String(image.id || '').trim(),
    url: getCloudinaryTransformedUrl(originalUrl, transform),
    originalUrl,
    detailUrl,
    thumbUrl,
    publicId: String(image.publicId || image.public_id || '').trim(),
    deleteToken: String(image.deleteToken || image.delete_token || '').trim(),
    width: Number(image.width || 0),
    height: Number(image.height || 0),
    format: String(image.format || '').trim().toLowerCase(),
    moderationStatus: String(image.moderationStatus || image.moderation_status || 'approved').trim() || 'approved',
    moderationScore: Number(image.moderationScore ?? image.moderation_score ?? 0) || 0,
    moderationReason: String(image.moderationReason || image.moderation_reason || '').trim(),
    sortOrder: Number(image.sortOrder ?? image.sort_order ?? 0) || 0
  };

  if (isList) {
    result.srcset = [
      `${getCloudinaryTransformedUrl(originalUrl, FORUM_LIST_IMAGE_TRANSFORM_SM)} 360w`,
      `${getCloudinaryTransformedUrl(originalUrl, FORUM_LIST_IMAGE_TRANSFORM_MD)} 540w`,
      `${thumbUrl} 720w`
    ].join(', ');
    result.lqipUrl = getCloudinaryTransformedUrl(originalUrl, FORUM_LIST_LQIP_TRANSFORM);
  }

  return result;
}

function normalizeForumImages(images = [], options = {}) {
  const source = Array.isArray(images) ? images : [];
  return source
    .map((image) => normalizeForumImage(image, options))
    .filter((image) => image && image.moderationStatus === 'approved')
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function toForumImageRpcPayload(images = []) {
  const normalizedImages = normalizeForumImages(images).slice(0, FORUM_IMAGE_MAX_COUNT);
  return normalizedImages.map((image) => ({
    url: image.originalUrl || image.url,
    publicId: image.publicId,
    width: image.width,
    height: image.height,
    format: image.format,
    moderationStatus: image.moderationStatus || 'approved',
    moderationScore: image.moderationScore || 0,
    moderationReason: image.moderationReason || ''
  }));
}

function normalizeForumImageUploadError(error) {
  const normalized = normalizeDbError(error, '论坛图片上传失败');
  const message = String(normalized?.message || '').trim();
  if (message.includes('GIF')) return normalized;
  return normalized;
}

function normalizeForumReportError(error) {
  const normalized = normalizeDbError(error, '举报提交失败');
  const message = String(normalized?.message || '').trim();
  const code = String(normalized?.code || '').trim();

  const messages = {
    NOT_AUTHENTICATED: '请先登录后再举报',
    INVALID_POST_ID: '帖子不存在或已被删除',
    POST_NOT_FOUND: '帖子不存在或已被删除',
    CANNOT_REPORT_SELF: '不能举报自己的帖子',
    POST_ALREADY_LIMITED: '该帖子已被处理',
    POST_ALREADY_REJECTED: '该帖子已被处理',
    REPORT_RATE_LIMITED: '举报过于频繁，请稍后再试',
    ALREADY_REPORTED: '你已经举报过这篇帖子'
  };

  const reportCode = [code, message, String(normalized?.details || '').trim()]
    .find((item) => Object.prototype.hasOwnProperty.call(messages, item));

  if (reportCode) {
    return normalizeDbError({ code: reportCode, message: messages[reportCode] }, '举报提交失败');
  }

  return normalized;
}

function normalizeForumImagePostError(error) {
  const normalized = normalizeDbError(error, '论坛图片发布失败');
  const guardCode = [
    String(normalized?.message || '').trim(),
    String(normalized?.code || '').trim(),
    String(normalized?.details || '').trim(),
    String(error?.message || '').trim(),
    String(error?.code || '').trim(),
    String(error?.details || '').trim()
  ].find((item) => /^CLOUD_|^INVALID_CLOUD_|^EMPTY_CLOUD_ENTRY$/.test(item));

  const messages = {
    CLOUD_IMAGE_LIMIT_EXCEEDED: 'Cloud+ 图片额度已满：论坛图片和 Cloud+ 共享额度，请删除旧图片或升级方案',
    CLOUD_IMAGE_RATE_LIMITED: '图片上传过于频繁，请稍后再试',
    CLOUD_ENTRY_RATE_LIMITED: '发布过于频繁，请稍后再试',
    DAILY_IMAGE_POST_LIMIT: '今天带图帖子发布额度已满，每天最多 5 条',
    INVALID_CLOUD_IMAGE_URL: '图片来源异常，已阻止发布，请重新上传图片',
    INVALID_CLOUD_COVER_IMAGE_URL: '图片来源异常，已阻止发布，请重新上传图片',
    INVALID_CLOUD_IMAGE_PUBLIC_ID: '图片资源标识异常，已阻止发布，请重新上传图片',
    INVALID_CLOUD_IMAGE_DIMENSIONS: '图片尺寸异常，请换一张图片',
    CLOUD_ENTRY_IMAGE_LIMIT_EXCEEDED: '单条 Cloud+ 图片数量超限，请减少图片后再发布',
    CLOUD_BLOCKS_TOO_MANY: '同步到 Cloud+ 的内容过多，请减少图片或正文后再发布',
    CLOUD_TEXT_BLOCK_TOO_LONG: '正文过长，请缩短后再发布',
    CLOUD_TEXT_BLOCKS_TOO_MANY: '正文段落过多，请精简后再发布',
    EMPTY_CLOUD_ENTRY: '同步到 Cloud+ 的内容为空，请重新编辑后再发布'
  };

  if (guardCode && messages[guardCode]) {
    return normalizeDbError({
      code: guardCode,
      message: messages[guardCode],
      details: normalized?.details || error?.details || null,
      hint: normalized?.hint || error?.hint || null
    }, '论坛图片发布失败');
  }

  return normalized;
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

async function writeAsyncModerationLog(targetId, targetType, moderationResult = {}) {
  await writeModerationAuditLog({
    targetId,
    targetType,
    result: moderationResult,
    moderatorId: null
  });
}

async function ensureModerationNotification({
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

async function notifyPostAuthorForComment({
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

async function notifyPostAuthorForLike({
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

async function scheduleCommentModeration(comment = {}) {
  const commentId = String(comment.id || '').trim();
  const authorId = String(comment.author_id || '').trim();
  const postId = String(comment.post_id || '').trim();
  const content = String(comment.content || '').trim();
  if (!commentId || !authorId || !postId || !content) return;

  try {
    // 回复场景改为“先发后审”：发送阶段不阻断，异步复审仅在高风险时回写 rejected。
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

async function schedulePostModeration(post = {}) {
  const postId = String(post.id || '').trim();
  const authorId = String(post.author_id || '').trim();
  const content = String(post.content || '').trim();
  if (!postId || !authorId || !content) return;

  try {
    // 发帖场景采用“先发后审”：创建成功后异步复审，避免审查服务波动阻断发布。
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
  } catch (error) {
    logger.warn('forum-api', '异步发帖审查失败（不阻断已发布）', {
      postId,
      authorId,
      error
    });
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

    return normalizePostRecord({
      ...rest,
      comment_count: rest.comment_count ?? comments?.[0]?.count ?? 0,
      like_count: rest.like_count ?? likes_count?.[0]?.count ?? likes?.[0]?.count ?? 0,
      author_avatar_url: author?.avatar_url,
      isLiked: currentUserId ? Boolean(user_likes?.some((like) => like.user_id === currentUserId)) : false
    });
  });
}

function normalizeSortMode(sortMode, fallback = 'latest') {
  const normalized = String(sortMode || '').trim().toLowerCase();
  return ALLOWED_SORT_MODE.has(normalized) ? normalized : fallback;
}

function isMissingRpcFunctionError(error, functionName) {
  if (!error) return false;
  if (String(error.code || '') === 'PGRST202') return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('could not find the function') && message.includes(String(functionName || '').toLowerCase());
}

async function attachLikedFlags(posts = [], userId = null) {
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
    safe.cycle_progress ?? (streakTotal % cycleSize)
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
      safe.reward_completed_this_week ?? (hasSignedThisWeek && streakTotal > 0 && cycleProgress === 0)
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
  return normalizedStreak % 4;
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
  const parsedCursor = decodePostCursor(cursorToken);
  const useCursorMode = (cursorMode === 'keyset' || Boolean(parsedCursor))
    && sortMode === 'latest'
    && !searchQuery;

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
      cursorToken
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
              author:author_id(avatar_url),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url),
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
              author:author_id(avatar_url),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        }

        query = query.or(statusFilter);
        query = applyForumTagFilter(query, tagFilter);

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
        .map((row) => normalizePostRecord({
          ...row,
          comment_count: Number(row.comment_count || 0),
          like_count: Number(row.like_count || 0),
          search_excerpt: row.search_excerpt || null,
          hot_score: Number(row.hot_score || 0),
          search_rank: Number(row.search_rank || 0)
        })));
      const rpcHasMore = safeRows.find((row) => typeof row?.has_more === 'boolean')?.has_more;
      const hasMore = typeof rpcHasMore === 'boolean' ? rpcHasMore : safeRows.length >= normalizedPageSize;
      const nextCursor = buildNextPostCursor(normalizedRows, hasMore);
      return { data: normalizedRows, error: null, hasMore, nextCursor };
    },
    { ttlMs: 10000, tags: ['posts'], timeoutMs: 8000, retry: 1 }
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
    { ttlMs: 10000, tags: ['posts'], timeoutMs: 8000, retry: 1 }
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
    { ttlMs: 30000, tags: ['posts'], timeoutMs: 8000, retry: 1 }
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

export async function uploadForumImage(file) {
  try {
    if (!file || typeof file !== 'object') {
      throw new Error('请选择有效的图片文件');
    }

    const mimeType = String(file.type || '').trim().toLowerCase();
    if (!FORUM_ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error('论坛图片仅支持 PNG、JPG 或 WebP，暂不开放 GIF');
    }
    if (Number(file.size || 0) > FORUM_IMAGE_MAX_SIZE_BYTES) {
      throw new Error(`单张论坛图片大小不能超过 ${FORUM_IMAGE_MAX_SIZE_MB}MB`);
    }

    await assertCloudinaryUploadAllowed({ source: 'forum' });

    const { moderateForumImageFile } = await loadForumImageModeration();
    const moderation = await moderateForumImageFile(file);
    if (moderation.status !== APPROVED_STATUS) {
      throw new Error(moderation.reason || '图片未通过安全检测');
    }

    const uploaded = await uploadImageToCloudinary(file, {
      folder: FORUM_CLOUDINARY_FOLDER,
      pendingSource: 'forum',
      skipUploadPreflight: true
    });

    return {
      ok: true,
      data: normalizeForumImage({
        ...uploaded,
        moderationStatus: APPROVED_STATUS,
        moderationScore: moderation.score || 0,
        moderationReason: moderation.reason || 'NSFWJS 预筛通过'
      }),
      error: null,
      moderation
    };
  } catch (error) {
    logger.warn('forum-api', '论坛图片上传/预筛失败', error);
    return { ok: false, data: null, error: normalizeForumImageUploadError(error) };
  }
}

export async function deleteUploadedForumImage(image = {}) {
  const deleteToken = String(image?.deleteToken || image?.delete_token || '').trim();
  const publicId = String(image?.publicId || image?.public_id || '').trim();

  try {
    if (deleteToken) {
      await deleteCloudinaryAssetByToken(deleteToken, { keepalive: true });
      return { ok: true, error: null };
    }
    if (publicId) {
      const result = await deleteCloudinaryAssetsByPublicIds([publicId]);
      return { ok: result.ok, error: result.error };
    }
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('forum-api', '清理未提交的论坛图片失败（不阻断）', error);
    return { ok: false, error: normalizeDbError(error) };
  }
}

export async function getForumPostImages(postId) {
  const safePostId = String(postId || '').trim();
  if (!safePostId) {
    return { ok: false, data: [], error: normalizeDbError({ message: '缺少帖子 ID' }) };
  }

  const { data, error } = await supabase
    .from('forum_post_images')
    .select('id, url, public_id, width, height, format, sort_order')
    .eq('post_id', safePostId)
    .eq('moderation_status', APPROVED_STATUS)
    .order('sort_order', { ascending: true });

  return {
    ok: !error,
    data: normalizeForumImages(data || []),
    error: normalizeDbError(error)
  };
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

export async function createPostWithImages(content, authorId, authorUsername, status = 'approved', title = '', images = [], tag = '') {
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
  if (!safeTitle || !safeContent) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({
        code: 'EMPTY_POST_CONTENT',
        message: '请填写标题和内容'
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
    p_tag: safeTag || null
  };
  let { data, error } = await supabase.rpc('create_forum_post_with_images', rpcPayload);
  if (error && isMissingRpcFunctionError(error, 'create_forum_post_with_images')) {
    const legacyPayload = { ...rpcPayload };
    delete legacyPayload.p_tag;
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
  }

  return { ok: true, data: [insertedPost], error: null };
}

export async function createPost(content, authorId, authorUsername, status = 'approved', title = '', images = [], tag = '') {
  if (Array.isArray(images) && images.length > 0) {
    return createPostWithImages(content, authorId, authorUsername, status, title, images, tag);
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
    ...(includeTag && safeTag ? { tag: safeTag } : {})
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
    { ttlMs: 10000, tags: ['comments', `comments:post:${safePostId}`], timeoutMs: 8000, retry: 1 }
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
    { ttlMs: 10000, tags: ['comments', `comments:post:${safePostId}`], timeoutMs: 8000, retry: 1 }
  );
}

export async function createComment(postId, content, authorId, authorUsername, status = 'approved', parentId = null, replyToUsername = null) {
  const normalizedStatus = normalizeContentStatus(status);
  const moderationInput = buildCommentModerationInput(content);
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
    post_id: postId,
    content,
    author_id: authorId,
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
        .eq('author_id', authorId);

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
        post_id: postId,
        author_id: authorId,
        content
      });
    }
  }
  return { ok: !error, data, error: normalizeDbError(error) };
}

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
      return { ok: !deleteError, action: 'unliked', error: normalizeDbError(deleteError) };
    }

    const { error: insertError } = await supabase
      .from('likes')
      .insert([{ post_id: postId, user_id: userId }]);

    if (!insertError) {
      invalidateByTags(['likes', 'posts', 'notifications']);
      void notifyPostAuthorForLike({ postId, senderId: userId });
    }
    return { ok: !insertError, action: insertError ? null : 'liked', error: normalizeDbError(insertError) };
  } catch (error) {
    logger.error('forum-api', 'toggleLike 异常', error);
    return { ok: false, action: null, error: normalizeDbError(error) };
  }
}

export async function checkIfLiked(postId, userId) {
  if (!userId) return false;
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

export async function deletePost(postId, userId, userRole) {
  const [{ data: post, error: postError }, imageResult] = await Promise.all([
    supabase
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single(),
    getForumPostImages(postId)
  ]);

  if (postError) {
    return { ok: false, success: false, error: '帖子不存在' };
  }

  if (post.author_id !== userId && userRole !== 'admin') {
    return { ok: false, success: false, error: '没有权限删除此帖子' };
  }

  const { error: deleteError } = await supabase.from('posts').delete().eq('id', postId);
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
          postId,
          error: result.error
        });
      }
    });
  }

  invalidateByTags(['posts', 'comments', 'likes', 'notifications']);
  return { ok: true, success: true, error: null };
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
              author:author_id(avatar_url),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        }

        query = query
          .eq('author_id', targetUserId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(normalizedPageSize + 1);

        if (!(includeUnapprovedForAuthor && String(targetUserId || '') === String(currentUserId || ''))) {
          query = query.eq('status', APPROVED_STATUS);
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
              author:author_id(avatar_url),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        } else {
          query = supabase
            .from('posts')
            .select(`
              *,
              comments:comments(count),
              likes_count:likes(count),
              author:author_id(avatar_url),
              forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)
            `);
        }

        if (!(includeUnapprovedForAuthor && String(targetUserId || '') === String(currentUserId || ''))) {
          query = query.eq('status', APPROVED_STATUS);
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
        .map((row) => normalizePostRecord({
          ...row,
          comment_count: Number(row.comment_count || 0),
          like_count: Number(row.like_count || 0),
          search_excerpt: row.search_excerpt || null,
          hot_score: Number(row.hot_score || 0),
          search_rank: Number(row.search_rank || 0)
        })));
      const rpcHasMore = safeRows.find((row) => typeof row?.has_more === 'boolean')?.has_more;
      const hasMore = typeof rpcHasMore === 'boolean' ? rpcHasMore : safeRows.length >= normalizedPageSize;
      const nextCursor = buildNextPostCursor(normalizedRows, hasMore);
      return { data: normalizedRows, error: null, hasMore, nextCursor };
    },
    { ttlMs: 10000, tags: ['posts', `posts:user:${targetUserId}`], timeoutMs: 8000, retry: 1 }
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
      ttlMs: 5000,
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
