/**
 * 论坛公共工具函数（纯函数，可单元测试）
 */

/**
 * 按 Unicode 码点安全截断文本，避免截断多字节字符（emoji、中文等）
 * @param {string} text - 原始文本
 * @param {number} maxChars - 最大字符数（按码点计）
 * @returns {string} 截断后的文本
 */
export function truncateTextSafe(text, maxChars = 20) {
  const str = String(text ?? '');
  if (str.length <= maxChars) return str;
  return [...str].slice(0, maxChars).join('');
}

/**
 * 生成回复引用草稿
 * @param {string|null} username - 被回复者用户名
 * @param {string|null} quotedContent - 被引用的内容
 * @returns {string} 引用格式的草稿文本，例如 "> @username：content\n\n"
 */
export function buildReplyDraft(username, quotedContent) {
  if (!username || !quotedContent) return '';
  const safeUsername = String(username).trim();
  const safeQuote = String(quotedContent).trim();
  if (!safeUsername || !safeQuote) return '';
  return `> @${safeUsername}：${safeQuote}\n\n`;
}

/**
 * HTML 转义，防止 XSS
 * @param {string} unsafe - 不安全的文本
 * @returns {string} 转义后的安全文本
 */
export function escapeHtml(unsafe) {
  const str = String(unsafe ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// 以下函数从 index.vue 组件逻辑中提取，用于 Mock 测试覆盖
// ============================================================

/**
 * 解析回复时的安全用户名（Bug #5 修复）
 * 当 userInfo.username 为空时，使用 user_ 前缀 + ID 前8位作为兜底
 * @param {object} userInfo - { id, username }
 * @returns {string} 安全的用户名字符串
 */
export function resolveReplyUsername(userInfo) {
  return String(userInfo?.username || '').trim() || `user_${String(userInfo?.id || '').slice(0, 8)}`;
}

/**
 * 乐观更新点赞数（Bug #7 修复：统一 liked/unliked 的 fallback 逻辑）
 * @param {number} currentCount - 当前前端显示的点赞数
 * @param {'liked'|'unliked'} action - 点赞动作
 * @param {number|null|undefined} serverLikeCount - 服务端返回的准确点赞数
 * @returns {number} 更新后的点赞数
 */
export function calculateOptimisticLikeCount(currentCount, action, serverLikeCount) {
  const current = Number(currentCount || 0);

  // 仅当 serverLikeCount 是有效数字时才使用（排除 null/undefined/NaN/非数字字符串）
  if (serverLikeCount != null && serverLikeCount !== '') {
    const server = Number(serverLikeCount);
    if (Number.isFinite(server)) {
      return server;
    }
  }

  if (action === 'liked') {
    return current + 1;
  }
  if (action === 'unliked') {
    return Math.max(0, current - 1);
  }
  return current;
}

/**
 * 将新增图片恢复到数组中的指定位置（Bug #8 修复）
 * @param {Array} existingImages - 已有的图片数组
 * @param {Array} newImages - 新上传的图片（通常放在末尾）
 * @param {number} targetIndex - 目标插入位置
 * @returns {Array} 恢复位置后的图片数组
 */
export function restoreImageAtPosition(existingImages, newImages, targetIndex) {
  if (!Array.isArray(existingImages) || !Array.isArray(newImages) || newImages.length === 0) {
    return existingImages;
  }
  const before = existingImages.slice(0, targetIndex);
  const after = existingImages.slice(targetIndex);
  return [...before, ...newImages, ...after];
}

/**
 * 判断是否需要降级重试回复预览查询（Bug #1 修复）
 * 当 topLevelOnly 查询返回空但帖子有评论数时，应降级为无过滤查询
 * @param {Array|null} data - 首次查询返回的数据
 * @param {number|string|null} commentCount - 帖子的评论总数
 * @returns {boolean} 是否需要降级重试
 */
export function shouldFallbackReplyPreview(data, commentCount) {
  return (!Array.isArray(data) || data.length === 0) && Number(commentCount || 0) > 0;
}

/**
 * 构建回复预览的降级查询参数（移除 topLevelOnly）
 * @param {object} baseOptions - 基础查询参数
 * @returns {object} 移除 topLevelOnly 后的查询参数
 */
export function buildFallbackReplyPreviewOptions(baseOptions) {
  const { topLevelOnly, ...rest } = baseOptions || {};
  return rest;
}

/**
 * 生成点赞失败时的用户提示（Bug #3 修复）
 * @param {Error|object} error - 错误对象
 * @returns {{ title: string, message: string }} 提示内容
 */
export function getLikeErrorToast(error) {
  const message = error?.message || error?.error || '点赞未生效，请稍后重试';
  return {
    title: '操作失败',
    message
  };
}