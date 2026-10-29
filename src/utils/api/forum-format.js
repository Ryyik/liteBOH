import { getCloudinaryTransformedUrl } from '../cloudinary-client.js';
import { normalizeDbError } from '../request-core.js';
import { resolveDbImageUrl } from '../db-image-url.js';

export const APPROVED_STATUS = 'approved';
export const REJECTED_STATUS = 'rejected';
/* 两级审核都没给出有效裁决时的中间态（2026-10-29）：
   云端不可达 + 本地模型未就绪 ⇒ 放行可见，由服务端 image_recheck 在约 6 分钟内复审。
   ⚠️ 它**不是** moderation_status 的取值（落库仍是 approved，否则图片立刻不可见），
   只在本地上传管线内部传递，落库时转成 forum_post_images.recheck_status='pending'。 */
export const PENDING_REVIEW_STATUS = 'pending_review';
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
/* LQIP 占位图：尺寸与质量都压到极限（单张 300 字节级）。
   它唯一的任务是「在主图到达之前先给出这张图的色调」，而且渲染时还要被 CSS blur(18px) 罩住 ——
   所以 32×24 与 72×54 在观感上没有区别，但请求小一个量级、先到的概率高得多。
   e_blur:1500 保证它在极小尺寸下仍是平滑色块而不是马赛克。
   ⚠️ 2026-09-27：原 w_72,h_54 + q_auto:low 实测会在弱网下与主图抢带宽、迟迟不到，
   用户看到的是「一直转圈 + 空白」＝以为图片加载失败（点进详情却是好的，因为详情走原图）。
   同批还把「静默超时就撤转圈」的兜底加在了 feed.css 的 .image-post-thumb-shell::before 上。 */
export const FORUM_LIST_LQIP_TRANSFORM = 'f_auto,q_1,c_fill,w_32,h_24,e_blur:1500';
export const FORUM_DETAIL_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1600';
/* 上传侧压缩档位（2026-10-29 定案）：**必须 ≤ 展示上限，且默认贴着上限**。
   展示侧真正会加载的最大宽度就是上面那个 w_1600 ——
   列表走 w_720、详情走 w_1600，而 ForumImageViewer 的取图顺序是
   `[detailUrl, originalUrl, url, thumbUrl]`，detailUrl 恒存在 ⇒ originalUrl **永不被下载**。
   所以上传端长边超过 1600 的部分是「死像素」：只付上行时间、只占 Cloudinary 存储与出图流量，
   用户在任何界面都看不到一个像素。
   实测（2026-10-29，**真实管线**：vite dev 里直接调 getImageCompressionPlan +
   compressImageFileToUploadLimit，三个 4032px 样本）：
     2048 档 379KB / 256ms → 1600 档 249KB / 205ms（照片样本，体积 −34%）；
     另两个壁纸样本 −27% / −26%。**体积降幅 −26%~−34%**（不是纯面积比的 −39%，WebP 有编码非线性）。
   ⚠️ **压缩耗时基本持平**（205~269ms vs 222~264ms，属噪声）：Web Worker 启动 + 库质量迭代是
      固定成本，把省下的编码时间吃掉了。别把「像素少了 39%」直接写成「压缩快了一倍」——
      早先按单次 canvas 编码读数写成「200→100ms」，实测被打回。
   ✅ **清晰度实测（同一 4032×3024 照片，最终展示尺寸都是 1600×1200，故可直接对比）**：
        旧路径（→2048→WebP→再缩 1600）PSNR 39.70dB / 平均像素差 1.78
        新路径（→1600 一步到位）        PSNR 39.67dB / 平均像素差 1.88
      差 0.03dB ＝ 噪声级（PSNR 差 1dB 肉眼都难辨）。也**没有**「少一次重采样所以更清晰」
      这回事 —— 两条路径打平。结论：砍掉的是死像素，不是画质。
   6 张上行量级 2.5~3.6MB（强依赖内容 —— 同一张 4032 壁纸压完 55KB，照片 379KB），
   能确定的是**相对降幅 −26%~−34%**；别把某次样本的 KB 数当通则。
   收益随上行带宽放大：1Mbps 省 ~8s、2Mbps 省 ~5s、50Mbps 基本无感。它只压了发帖关键路径里
   「上传」一段的约 30%，**不是「卡」的解药**（审核 RTT 与上行物理下限仍在）。
   ⚠️ 动这里必须同时看 FORUM_DETAIL_IMAGE_TRANSFORM：只有先把详情上限调大，才允许同步调大；
      反过来单独调大这里＝白付带宽。 */
export const FORUM_UPLOAD_IMAGE_MAX_DIMENSION = 1600;
export const FORUM_UPLOAD_IMAGE_TARGET_SIZE_MB = 0.9;
export const FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS = Object.freeze({
  optimizeForUpload: true,
  optimizedMaxDimension: FORUM_UPLOAD_IMAGE_MAX_DIMENSION,
  optimizedTargetSizeMB: FORUM_UPLOAD_IMAGE_TARGET_SIZE_MB,
});
export const FORUM_CLOUDINARY_FOLDER = String(
  import.meta.env.VITE_CLOUDINARY_FORUM_FOLDER ||
    `${String(import.meta.env.VITE_CLOUDINARY_CLOUD_PLUS_FOLDER || 'boh-cloud-plus').replace(/\/+$/, '')}/forum`,
).trim();

export function normalizeContentStatus(status, fallback = APPROVED_STATUS) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();
  return ALLOWED_CONTENT_STATUS.has(normalized) ? normalized : fallback;
}

export function shouldSyncModerateComment(content = '') {
  const text = String(content || '').trim();
  if (!text) return false;
  const lowerText = text.toLowerCase();
  const repeatedChars = /(.)\1{8,}/u.test(text);
  const repeatedSegments = /(.{2,12})\1{4,}/u.test(text);
  const hasLink = /https?:\/\/|www\.|[a-z0-9-]+\.(com|cn|net|org|top|xyz|cc|io|me)(\/|\s|$)/iu.test(
    text,
  );
  const hasContactHook =
    /(加我|私聊|联系我|联系方式|vx|微信|qq|群号|代购|出售|购买|交易|带价|渠道)/iu.test(text);
  const hasRiskyAction = /(教程|配方|怎么做|怎么买|怎么卖|求购|接单|外挂|破解|刷号)/iu.test(text);
  return (
    text.length > 500 ||
    hasLink ||
    repeatedChars ||
    repeatedSegments ||
    hasContactHook ||
    hasRiskyAction ||
    lowerText.includes('telegram') ||
    lowerText.includes('discord.gg')
  );
}

export function normalizeForumTag(tag = '') {
  const normalized = String(tag || '')
    .trim()
    .toLowerCase();
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
    savedAt: new Date(draft.updated_at || draft.updatedAt || draft.savedAt || Date.now()).getTime(),
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
      body: stripLegacyPostTitlePrefix(explicitBody, explicitTitle),
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
    body: stripLegacyPostTitlePrefix(
      String(titleMatch[2] || '').trim(),
      String(titleMatch[1] || '').trim(),
    ),
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

/**
 * 解析帖子封面里的 Vite 资源引用。
 * 官方卡（新闻/活动镜像）的 cover_image_url 老数据存的是 `@/assets/images/xxx.webp`
 * （部分为 .png，同目录有同名 webp 兜底），不解析直接进 <img> 会裂图；
 * data:/http(s)/blob:/根路径等合法 URL 由 getImageUrl 原样直通。
 *
 * 实现已收敛到 `@/utils/db-image-url.js`（DB 图片地址解析的单一真源）。
 * 注意本函数**只做本地解析、不做 Cloudinary 改写**——调用方随后自行套 transform
 * （见下方 normalizePostRecord / normalizePostListRecord），保持既有语义不变。
 */
export function resolveStoredCoverUrl(rawUrl = '') {
  return resolveDbImageUrl(rawUrl);
}

export function normalizePostRecord(post = {}) {
  const parts = splitPostContent(post.content, post.title, post.body);
  const rawCoverUrl = resolveStoredCoverUrl(post.cover_image_url || post.coverImageUrl || '');
  const coverImageUrl = getCloudinaryTransformedUrl(rawCoverUrl, FORUM_DETAIL_IMAGE_TRANSFORM);
  const normalizedImages = normalizeForumImages(post.images || post.forum_post_images || [], {
    variant: 'detail',
  });
  const fallbackImages =
    normalizedImages.length || !coverImageUrl
      ? normalizedImages
      : normalizeForumImages(
          [
            {
              id: `${String(post.id || 'post').trim() || 'post'}-cover`,
              url: rawCoverUrl || coverImageUrl,
              width: Number(post.cover_image_width || post.coverImageWidth || 0),
              height: Number(post.cover_image_height || post.coverImageHeight || 0),
              sortOrder: 0,
            },
          ],
          { variant: 'detail' },
        );
  return {
    ...post,
    title: parts.title,
    body: parts.body,
    tag: getEffectiveForumTag(post.tag),
    image_count: Number(post.image_count || 0),
    cover_image_url: coverImageUrl,
    images: fallbackImages,
    location_name: String(post.location_name || '').trim() || undefined,
    location_lat: post.location_lat != null ? Number(post.location_lat) : undefined,
    location_lng: post.location_lng != null ? Number(post.location_lng) : undefined,
  };
}

export function normalizePostListRecord(post = {}) {
  const parts = splitPostContent(post.content, post.title, post.body);
  const explicitImages = normalizeForumImages(post.images || post.forum_post_images || [], {
    variant: 'list',
  });
  const firstImage = explicitImages[0] || null;
  const rawCoverUrl = resolveStoredCoverUrl(
    post.cover_image_url || post.coverImageUrl || firstImage?.originalUrl || firstImage?.url || '',
  );
  const coverImageUrl = getCloudinaryTransformedUrl(rawCoverUrl, FORUM_LIST_IMAGE_TRANSFORM);
  const previewImages = explicitImages.length
    ? explicitImages.slice(0, FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT)
    : coverImageUrl
      ? normalizeForumImages(
          [
            {
              id: `${String(post.id || 'post').trim() || 'post'}-cover`,
              url: rawCoverUrl || coverImageUrl,
              publicId: firstImage?.publicId || '',
              width: Number(
                post.cover_image_width || post.coverImageWidth || firstImage?.width || 0,
              ),
              height: Number(
                post.cover_image_height || post.coverImageHeight || firstImage?.height || 0,
              ),
              sortOrder: 0,
            },
          ],
          { variant: 'list' },
        )
      : [];

  return {
    ...post,
    title: parts.title,
    body: parts.body,
    tag: getEffectiveForumTag(post.tag),
    image_count: Math.max(Number(post.image_count || 0), explicitImages.length),
    cover_image_url: coverImageUrl,
    images: previewImages,
    location_name: String(post.location_name || '').trim() || undefined,
    location_lat: post.location_lat != null ? Number(post.location_lat) : undefined,
    location_lng: post.location_lng != null ? Number(post.location_lng) : undefined,
  };
}

export function normalizePostListRows(rows = []) {
  return Array.isArray(rows) ? rows.map(normalizePostListRecord) : [];
}

export function normalizeForumImage(image = {}, { variant = 'detail' } = {}) {
  if (!image || typeof image !== 'object') return null;
  const originalUrl = String(
    image.originalUrl || image.original_url || image.secure_url || image.url || '',
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
    format: String(image.format || '')
      .trim()
      .toLowerCase(),
    moderationStatus:
      String(image.moderationStatus || image.moderation_status || 'approved').trim() || 'approved',
    // 审核来源：云端命中（gemini）/ 本地兜底（local_fallback*）/ 历史遗留（client_nsfwjs）。
    // 2026-10-20 前论坛链路**从不携带**这个字段，服务端又硬编码 'client_nsfwjs'
    // ⇒ 云端成功也标成本地，来源维度完全失去信息量（实测 128 张图全同一值）。
    // 真源见 image-moderation-pipeline.js 的 source 取值；落库白名单由
    // forum_post_images_moderation_source_check 约束（新增值需配套迁移）。
    moderationSource: String(
      image.moderationSource || image.moderation_source || 'client_nsfwjs',
    ).trim(),
    moderationScore: Number(image.moderationScore ?? image.moderation_score ?? 0) || 0,
    moderationReason: String(image.moderationReason || image.moderation_reason || '').trim(),
    sortOrder: Number(image.sortOrder ?? image.sort_order ?? 0) || 0,
    /* 客户端内部标记：这张图是「两级审核都没裁决就放行」的，发布成功后要把它的
       forum_post_images.recheck_status 置 pending，交给后台复审。
       刻意不进数据库字段白名单（服务端 RPC 不读它），只在本机管线里传递。 */
    needsRecheck: Boolean(image.needsRecheck ?? image.needs_recheck),
  };

  if (isList) {
    result.srcset = [
      `${getCloudinaryTransformedUrl(originalUrl, FORUM_LIST_IMAGE_TRANSFORM_SM)} 360w`,
      `${getCloudinaryTransformedUrl(originalUrl, FORUM_LIST_IMAGE_TRANSFORM_MD)} 540w`,
      `${thumbUrl} 720w`,
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
    // 服务端只做白名单校验，不再写死来源（迁移 2026102004）
    moderationSource: image.moderationSource || 'client_nsfwjs',
    moderationScore: image.moderationScore || 0,
    moderationReason: image.moderationReason || '',
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
    ALREADY_REPORTED: '你已经举报过这篇帖子',
  };

  const reportCode = [code, message, String(normalized?.details || '').trim()].find((item) =>
    Object.prototype.hasOwnProperty.call(messages, item),
  );

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
    String(error?.details || '').trim(),
  ].find((item) => /^CLOUD_|^INVALID_CLOUD_|^EMPTY_CLOUD_ENTRY$/.test(item));

  const messages = {
    CLOUD_IMAGE_LIMIT_EXCEEDED:
      'Cloud+ 图片额度已满：论坛图片和 Cloud+ 共享额度，请删除旧图片或升级方案',
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
    EMPTY_CLOUD_ENTRY: '同步到 Cloud+ 的内容为空，请重新编辑后再发布',
  };

  if (guardCode && messages[guardCode]) {
    return normalizeDbError(
      {
        code: guardCode,
        message: messages[guardCode],
        details: normalized?.details || error?.details || null,
        hint: normalized?.hint || error?.hint || null,
      },
      '论坛图片发布失败',
    );
  }

  return normalized;
}
