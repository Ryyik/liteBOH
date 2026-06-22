import { logger } from './logger.js';
import DOMPurify from './dompurify.js';

const PUSHPLUS_API_URL = 'https://www.pushplus.plus/send';

// 频率控制配置
const RATE_LIMIT = {
  maxRequestsPerMinute: 10, // 每分钟最多10条
  minIntervalMs: 5000, // 同类型消息最小间隔5秒
};

// 记录上次发送时间
const lastSendTime = new Map();

/**
 * 检查是否可以发送消息（频率控制）
 * @param {string} key - 消息类型标识
 * @returns {boolean}
 */
function canSend(key) {
  const now = Date.now();
  const lastTime = lastSendTime.get(key);

  if (!lastTime) {
    lastSendTime.set(key, now);
    return true;
  }

  if (now - lastTime < RATE_LIMIT.minIntervalMs) {
    logger.warn('pushplus', '频率限制，跳过发送', { key, lastTime, now });
    return false;
  }

  lastSendTime.set(key, now);
  return true;
}

/**
 * 使用 Pushplus 发送推送消息
 * @param {string} token - Pushplus Token
 * @param {string} title - 消息标题
 * @param {string} content - 消息内容（支持 HTML）
 * @param {string} template - 模板类型：html、txt、json、markdown
 * @param {string} topic - 群组编码（可选，用于群发）
 * @returns {Promise<{success: boolean, message: string, data: Object}>}
 */
export async function sendPushplusMessage(token, title, content, template = 'html', topic = '') {
  if (!token) {
    logger.warn('pushplus', 'Token 为空，跳过推送');
    return { success: false, message: 'Token 不能为空', data: null };
  }

  try {
    const payload = {
      token,
      title,
      content,
      template
    };

    if (topic) {
      payload.topic = topic;
    }

    const response = await fetch(PUSHPLUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    // 根据文档，code 200 表示请求成功，但消息是否发送成功需要查询流水号
    if (result.code === 200) {
      logger.debug('pushplus', '推送请求成功', { title, result });
      return {
        success: true,
        message: '推送请求已发送',
        data: result
      };
    } else {
      // 根据官方文档处理各种错误码
      // https://www.pushplus.plus/doc/guide/api.html
      const errorMessages = {
        200: '请求成功',
        302: '未登录',
        401: '请求未授权',
        403: '请求 IP 未授权',
        500: '系统异常，请稍后再试',
        600: '数据异常，操作失败',
        805: '无权查看',
        888: '积分不足，需要充值',
        900: '用户账号使用受限（请求次数过多）',
        903: '无效的用户令牌（Token 不正确）',
        905: '账户未进行实名认证',
        999: '服务端验证错误'
      };
      const errorMsg = errorMessages[result.code] || result.msg || `推送发送失败（错误码：${result.code}）`;
      logger.error('pushplus', '推送请求失败', { code: result.code, msg: result.msg, result });
      return {
        success: false,
        message: errorMsg,
        data: result
      };
    }
  } catch (error) {
    logger.error('pushplus', '推送请求异常', error);
    return {
      success: false,
      message: error.message || '推送请求异常',
      data: null
    };
  }
}

/**
 * 发送通知类型的推送（带频率控制）
 * @param {string} token - Pushplus Token
 * @param {string} type - 通知类型：like、comment、impression、message
 * @param {Object} data - 通知数据
 * @returns {Promise<{success: boolean, message: string, data: Object}>}
 */
export async function sendNotificationPush(token, type, data = {}) {
  // 频率控制：检查是否可以发送
  const rateKey = `${token}:${type}`;
  if (!canSend(rateKey)) {
    return {
      success: false,
      message: '发送过于频繁，请稍后再试',
      data: null
    };
  }

  // 构建推送内容，显示具体信息
  const safeSenderName = DOMPurify.sanitize(data.senderName || '有人');
  const rawPostContent = data.postContent || '';
  const safePostContent = rawPostContent ? DOMPurify.sanitize(rawPostContent.substring(0, 150)) : '';
  const isPostTruncated = rawPostContent.length > 150;
  const safeCommentContent = DOMPurify.sanitize(data.commentContent || '');
  const safeImpressionContent = DOMPurify.sanitize(data.impressionContent || '');

  const templates = {
    like: {
      title: `❤️ ${safeSenderName}点赞了你的帖子`,
      content: `<div style="padding: 16px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="font-size: 24px;">👍</span>
          <span style="font-size: 16px; font-weight: 600; color: #1d1d1f;">${safeSenderName}点赞了你的帖子</span>
        </div>
        ${safePostContent ? `<div style="background: #f5f5f7; padding: 12px; border-radius: 8px; margin: 12px 0; color: #333; font-size: 14px; line-height: 1.5;">${safePostContent}${isPostTruncated ? '...' : ''}</div>` : ''}
        <div style="font-size: 12px; color: #86868b; margin-top: 12px;">${new Date().toLocaleString('zh-CN')}</div>
      </div>`
    },
    comment: {
      title: `💬 ${safeSenderName}评论了你的帖子`,
      content: `<div style="padding: 16px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="font-size: 24px;">💭</span>
          <span style="font-size: 16px; font-weight: 600; color: #1d1d1f;">${safeSenderName}评论道：</span>
        </div>
        <div style="background: #f5f5f7; padding: 12px; border-radius: 8px; margin: 12px 0; color: #333; font-size: 14px; line-height: 1.6;">${safeCommentContent}</div>
        <div style="font-size: 12px; color: #86868b; margin-top: 12px;">${new Date().toLocaleString('zh-CN')}</div>
      </div>`
    },
    impression: {
      title: `✨ ${safeSenderName}给你留下了印象`,
      content: `<div style="padding: 16px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="font-size: 24px;">🌟</span>
          <span style="font-size: 16px; font-weight: 600; color: #1d1d1f;">${safeSenderName}给你的印象：</span>
        </div>
        <div style="background: #f5f5f7; padding: 12px; border-radius: 8px; margin: 12px 0; color: #333; font-size: 14px; line-height: 1.6;">${safeImpressionContent}</div>
        <div style="font-size: 12px; color: #86868b; margin-top: 12px;">${new Date().toLocaleString('zh-CN')}</div>
      </div>`
    }
  };

  const template = templates[type];
  if (!template) {
    logger.warn('pushplus', '未知的通知类型', { type });
    return { success: false, message: '未知的通知类型', data: null };
  }

  return sendPushplusMessage(token, template.title, template.content, 'html');
}

/**
 * 验证 Pushplus Token 是否有效
 * @param {string} token - Pushplus Token
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function validatePushplusToken(token) {
  if (!token || token.length < 10) {
    return { success: false, message: 'Token 格式不正确' };
  }

  try {
    // 发送测试消息验证 Token
    const result = await sendPushplusMessage(
      token,
      '🔔 方块之家 - 推送测试',
      '<div style="padding: 20px; text-align: center;"><h3>✅ 推送服务配置成功！</h3><p>您已成功开启离线消息推送功能。</p></div>',
      'html'
    );

    if (result.success) {
      return { success: true };
    } else {
      return { success: false, message: result.message || 'Token 验证失败' };
    }
  } catch (error) {
    logger.error('pushplus', 'Token 验证失败', error);
    return { success: false, message: error.message || '验证过程发生异常' };
  }
}

/**
 * 查询消息发送结果（根据流水号）
 * @param {string} messageId - 消息流水号
 * @returns {Promise<{success: boolean, status: string, data: Object}>}
 */
export async function queryMessageStatus(messageId) {
  try {
    const response = await fetch(`https://www.pushplus.plus/api/message/status?messageId=${messageId}`);
    const result = await response.json();

    if (result.code === 200) {
      return {
        success: true,
        status: result.data?.status || 'unknown',
        data: result.data
      };
    } else {
      return {
        success: false,
        status: 'error',
        data: result
      };
    }
  } catch (error) {
    logger.error('pushplus', '查询消息状态失败', error);
    return {
      success: false,
      status: 'error',
      data: null
    };
  }
}

/**
 * 发送消息（高级版本，支持更多参数）
 * @param {Object} options - 发送选项
 * @param {string} options.token - 用户 Token
 * @param {string} options.title - 消息标题
 * @param {string} options.content - 消息内容
 * @param {string} options.template - 模板类型 (html/txt/json/markdown)
 * @param {string} options.channel - 发送渠道 (wechat/webhook/cp/mail/sms/voice/extension/app)
 * @param {string} options.topic - 群组编码
 * @param {string} options.callbackUrl - 回调地址
 * @param {number} options.timestamp - 毫秒时间戳（用于防重）
 * @returns {Promise<{success: boolean, message: string, data: Object}>}
 */
export async function sendAdvancedMessage(options) {
  const {
    token,
    title,
    content,
    template = 'html',
    channel = 'wechat',
    topic = '',
    callbackUrl = '',
    timestamp = null
  } = options;

  if (!token) {
    logger.warn('pushplus', 'Token 为空，跳过推送');
    return { success: false, message: 'Token 不能为空', data: null };
  }

  if (!content) {
    return { success: false, message: '消息内容不能为空', data: null };
  }

  try {
    const payload = {
      token,
      title,
      content,
      template,
      channel
    };

    if (topic) payload.topic = topic;
    if (callbackUrl) payload.callbackUrl = callbackUrl;
    if (timestamp) payload.timestamp = timestamp;

    const response = await fetch(PUSHPLUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.code === 200) {
      logger.debug('pushplus', '高级推送请求成功', { title, channel, result });
      return {
        success: true,
        message: '推送请求已发送',
        data: result
      };
    } else {
      const errorMessages = {
        200: '请求成功',
        302: '未登录',
        401: '请求未授权',
        403: '请求 IP 未授权',
        500: '系统异常，请稍后再试',
        600: '数据异常，操作失败',
        805: '无权查看',
        888: '积分不足，需要充值',
        900: '用户账号使用受限（请求次数过多）',
        903: '无效的用户令牌（Token 不正确）',
        905: '账户未进行实名认证',
        999: '服务端验证错误'
      };
      const errorMsg = errorMessages[result.code] || result.msg || `推送发送失败（错误码：${result.code}）`;
      logger.error('pushplus', '高级推送请求失败', { code: result.code, msg: result.msg, result });
      return {
        success: false,
        message: errorMsg,
        data: result
      };
    }
  } catch (error) {
    logger.error('pushplus', '高级推送请求异常', error);
    return {
      success: false,
      message: error.message || '推送请求异常',
      data: null
    };
  }
}
