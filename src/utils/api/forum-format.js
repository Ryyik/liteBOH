import { getCloudinaryTransformedUrl } from '../cloudinary-client.js';
import { normalizeDbError } from '../request-core.js';

export const APPROVED_STATUS = 'approved';
export const REJECTED_STATUS = 'rejected';
export const ALLOWED_CONTENT_STATUS = new Set([APPROVED_STATUS, REJECTED_STATUS]);
export const ALLOWED_FORUM_TAGS = new Set(['server', 'activity', 'daily', 'question']);
export const DEFAULT_FORUM_TAG = 'daily';
export const FORUM_IMAGE_MAX_COUNT = 6;
export const FORUM_IMAGE_MAX_SIZE_MB = 10;
export const FORUM_IMAGE_MAX_SIZE_BYTES = FORUM_IMAGE_MAX_SIZE_MB * 1024 * 1024;
export const FORUM_ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT = 4;
export const FORUM_LIST_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_720,h_540';
export const FORUM_LIST_IMAGE_TRANSFORM_SM = 'f_auto,q_auto:good,c_fill,w_360,h_270';
export const FORUM_LIST_IMAGE_TRANSFORM_MD = 'f_auto,q_auto:good,c_fill,w_540,h_405';
export const FORUM_LIST_LQIP_TRANSFORM = 'f_auto,q_auto:low,c_fill,w_72,h_54,e_blur:1000';
export const FORUM_DETAIL_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1600';
export const FORUM_CLOUDINARY_FOLDER = String(
  import.meta.env.VITE_CLOUDINARY_FORUM_FOLDER
  || `${String(import.meta.env.VITE_CLOUDINARY_CLOUD_PLUS_FOLDER || 'boh-cloud-plus').replace(/\/+$/, '')}/forum`
).trim();

export function normalizeContentStatus(status, fallback = APPROVED_STATUS) {
  const normalized = String(status || '').trim().toLowerCase();
  return ALLOWED_CONTENT_STATUS.has(normalized) ? normalized : fallback;
}

export function shouldSyncModerateComment(content = '') {
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

export function getEffectiveForumTag(tag = '') {
  return normalizeForumTag(tag) || DEFAULT_FORUM_TAG;
}

export function normalizeForumDraftRecord(draft = {}) {
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

export function matchesForumTagFilter(tag = '', tagFilter = '') {
  const safeFilter = normalizeForumTag(tagFilter);
  return !safeFilter || getEffectiveForumTag(tag) === safeFilter;
}

export function applyForumTagFilter(query, tagFilter = '') {
  const safeFilter = normalizeForumTag(tagFilter);
  if (!safeFilter) return query;
  if (safeFilter === DEFAULT_FORUM_TAG) {
    return query.or(`tag.eq.${DEFAULT_FORUM_TAG},tag.is.null`);
  }
  return query.eq('tag', safeFilter);
}

export function buildPostModerationInput(content) {
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

export function buildCommentModerationInput(content) {
  const safeContent = String(content || '').trim();
  return `正文：${safeContent}`;
}

export function splitPostContent(content, title = '', body = '') {
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

export function stripLegacyPostTitlePrefix(body = '', title = '') {
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

export function normalizePostRecord(post = {}) {
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

export function normalizePostListRecord(post = {}) {
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

export function normalizePostListRows(rows = []) {
  return Array.isArray(rows) ? rows.map(normalizePostListRecord) : [];
}

export function normalizeForumImage(image = {}, { variant = 'detail' } = {}) {
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

export function normalizeForumImages(images = [], options = {}) {
  const source = Array.isArray(images) ? images : [];
  const { includeNonApproved = false } = options;
  return source
    .map((image) => normalizeForumImage(image, options))
    .filter((image) => image && (includeNonApproved || image.moderationStatus === 'approved'))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export function toForumImageRpcPayload(images = []) {
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

export function normalizeForumImageUploadError(error) {
  const normalized = normalizeDbError(error, '论坛图片上传失败');
  const message = String(normalized?.message || '').trim();
  if (message.includes('GIF')) return normalized;
  return normalized;
}

export function normalizeForumReportError(error) {
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

export function normalizeForumImagePostError(error) {
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
