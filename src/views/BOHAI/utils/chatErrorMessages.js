/**
 * BOHAI 聊天错误消息工具
 *
 * 统一管理聊天引擎中所有面向用户的错误消息，
 * 确保消息格式一致、可维护。
 */

/**
 * 将错误对象转为安全的用户可读消息。
 * 如果错误对象包含 message，取其前 300 字符；
 * 否则返回兜底文案。
 *
 * @param {Error|unknown} error - 捕获的错误对象
 * @param {string} [fallback='网络请求异常'] - 兜底文案
 * @returns {string} 截断后的错误消息
 */
export function safeErrorDetail(error, fallback = '网络请求异常') {
  if (error && typeof error.message === 'string') {
    return error.message.slice(0, 300);
  }
  if (error && typeof error === 'string') {
    return error.slice(0, 300);
  }
  return fallback;
}

/**
 * 判断是否为用户主动取消的 AbortError。
 *
 * @param {Error|unknown} error
 * @returns {boolean}
 */
export function isAbortError(error) {
  return !!(error && error.name === 'AbortError');
}

// ---- 面向用户的错误消息模板 ----

export const CHAT_ERROR_MESSAGES = {
  /** 通用生成失败 */
  generationFailed: (detail) =>
    detail ? `服务暂时繁忙，请稍后重试。\n\n详情：${detail}` : `服务暂时繁忙，请稍后重试。`,

  /** 资源搜索失败 */
  resourceSearchFailed: () =>
    `资源搜索暂时失败，你也可以先打开资源中心手动搜索。`,

  /** 回答内容异常 */
  abnormalReply: '回答内容出现异常，请重新发送一次。',

  /** 无有效内容 */
  noValidContent: '我暂时没有生成到有效内容，请再试一次。',

  /** 用户主动停止 */
  generationStopped: '已停止生成。',

  /** 带已有内容的停止提示 */
  generationStoppedWithContent: (content) =>
    `${content}\n\n（已停止生成）`,

  /** 生成超时 */
  generationTimeout: '生成超时已自动停止，请重试。',

  /** 回答异常自动停止 */
  degenerateReplyStopped: '回答出现异常已自动停止，请重试。',

  /** 资源搜索已停止 */
  resourceSearchStopped: '资源搜索已停止。',
};

/**
 * 为 catch 块中的 AbortError 生成用户可见的停止消息。
 *
 * @param {string} [currentContent=''] - 当前已有的回复内容
 * @param {object} [options]
 * @param {boolean} [options.timedOut=false] - 是否超时
 * @param {boolean} [options.isDegenerate=false] - 是否退化回复
 * @returns {string}
 */
export function getAbortMessage(currentContent = '', { timedOut = false, isDegenerate = false } = {}) {
  if (timedOut) return CHAT_ERROR_MESSAGES.generationTimeout;
  if (isDegenerate) return CHAT_ERROR_MESSAGES.degenerateReplyStopped;
  if (currentContent) return CHAT_ERROR_MESSAGES.generationStoppedWithContent(currentContent);
  return CHAT_ERROR_MESSAGES.generationStopped;
}