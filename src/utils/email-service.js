
import { logger } from './logger.js';

// email-service.js
// 统一的邮件发送服务，用于处理礼物请求和其他相关邮件发送
// 通过 Supabase Edge Function 发送，避免在客户端暴露 EmailJS 凭证。

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const EMAIL_SEND_FUNCTION_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/email-send` : '';

const callSendEmailFunction = async (templateType, templateParams) => {
  if (!EMAIL_SEND_FUNCTION_URL) {
    throw new Error('邮件服务未配置（缺少 VITE_SUPABASE_URL）');
  }

  const { supabase } = await import('./supabase-client.js');
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token || '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(EMAIL_SEND_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ templateType, templateParams }),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = result?.message || `邮件发送失败 (${response.status})`;
      logger.error('email', 'Email sending failed:', errorMsg);
      throw new Error(errorMsg);
    }
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * 发送礼物请求邮件
 * @param {Object} data - 邮件数据对象
 * @returns {Promise<Object>}
 */
export const sendGiftEmail = async (data) => {
  const templateParams = {
    product: data.product || '未指定',
    specifications: data.specifications || 'N/A',
    giftOptions: data.giftOptions || '无',
    paymentMethod: data.paymentMethod || '无',
    paymentAmount: data.paymentAmount || '0',
    deliveryMethod: data.deliveryMethod || '无',
    totalPrice: data.totalPrice || '0',
    giftMessage: data.giftMessage || '',
    buyerName: data.buyerName || '匿名用户',
    buyerRole: data.buyerRole || '普通用户',
    isLoggedIn: data.isLoggedIn ? '是' : '否',
    orderTime: new Date().toLocaleString('zh-CN'),
  };

  return callSendEmailFunction('gift', templateParams);
};

/**
 * 发送周边结算邮件
 * @param {Object} data - 邮件数据对象
 * @returns {Promise<Object>}
 */
export const sendMerchandiseSettlementEmail = async (data) => {
  const orderId = String(data?.orderId || '').trim();
  if (!orderId) throw new Error('订单 ID 缺失，无法发送订单邮件');

  // 服务端按订单 ID 读取已落库的商品与联系方式，避免使用页面上的可篡改快照。
  return callSendEmailFunction('merchandise_settlement', { orderId });
};
