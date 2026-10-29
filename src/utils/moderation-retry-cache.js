export const POST_REJECTED_NOTICE_TEXT =
  '很抱歉，您的发帖暂未通过审查，建议原帖不修改内容且重试一次，若还有问题请联系客服。';
export const POST_REJECTED_NOTIFICATION_TYPE = 'post_rejected';
export const POST_REPORT_LIMITED_NOTICE_TEXT =
  '你的帖子因收到多位用户举报，已暂时设为仅自己可见。管理员复核后可能恢复公开或维持处理。';
export const POST_REPORT_LIMITED_NOTIFICATION_TYPE = 'post_report_limited';
export const COMMENT_REJECTED_NOTICE_TEXT =
  '很抱歉，您的评论暂未通过审查，已被系统自动删除。请注意用词规范。';
export const COMMENT_REJECTED_NOTIFICATION_TYPE = 'comment_rejected';
/* 图片级复审拒绝（2026-10-29）：与 post_rejected 区分开 —— 帖子还在，只是被撤掉一张图。
   文案必须说清「帖子与其余内容不受影响」，否则用户会以为整帖没了。 */
export const POST_IMAGE_REJECTED_NOTICE_TEXT =
  '你帖子中的图片未通过内容安全复审，已从帖子中移除；帖子本身与其余内容不受影响。如认为误判可重新上传该图片。';
export const POST_IMAGE_REJECTED_NOTIFICATION_TYPE = 'post_image_rejected';
export const MODERATION_RETRY_STORAGE_KEY = 'boh_post_moderation_retry_once_v1';

export const loadRetriedNotificationIdSet = (storageKey = MODERATION_RETRY_STORAGE_KEY) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => String(id)));
  } catch (error) {
    console.warn('读取帖子复审重试记录失败:', error);
    return new Set();
  }
};

export const persistRetriedNotificationIdSet = (
  idSet,
  storageKey = MODERATION_RETRY_STORAGE_KEY,
) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(idSet || [])));
  } catch (error) {
    console.warn('保存帖子复审重试记录失败:', error);
  }
};

export const markRetriedNotificationId = (idSet, notificationId) => {
  const safeId = String(notificationId || '').trim();
  if (!safeId) return false;
  idSet.add(safeId);
  return true;
};

export const canRetryModerationNotificationBySet = (
  notification,
  retriedIdSet,
  retryType = POST_REJECTED_NOTIFICATION_TYPE,
) => {
  const safeId = String(notification?.id || '').trim();
  const hasPostId = Boolean(notification?.post?.id || notification?.post_id);
  return notification?.type === retryType && hasPostId && safeId && !retriedIdSet.has(safeId);
};
