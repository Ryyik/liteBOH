import { supabase } from '../supabase-client.js';
import { logger } from '../logger.js';
import { normalizeDbError } from '../request-core.js';

/**
 * 「关注的人邮件通知」开关。
 *
 * 真源是 profiles.follow_mail_enabled（默认 false）：
 *   · 数据库侧的唯一判定点在 boh_enqueue_follow_mail()，它每次发信前都会重查这一列，
 *     所以用户关掉开关后，已经入账但还没发出去的邮件也会被跳过（respect 最新意图）。
 *   · 这里只负责读写，不做任何业务判定，避免出现「前端以为开了、后端没开」的分叉。
 *
 * 收件邮箱不在这里处理：profiles 表没有 email 列，邮箱在 auth.users 里，
 * 由服务端 RPC boh_get_user_emails 读取（只返回已验证邮箱）。
 */

/**
 * 读取当前用户是否开启关注邮件通知
 * @param {string} userId
 * @returns {Promise<{enabled: boolean, error: Error|null}>}
 */
export async function getFollowMailEnabled(userId) {
  if (!userId) return { enabled: false, error: null };
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('follow_mail_enabled')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error('mail-notify-api', '读取关注邮件开关失败', error);
      return { enabled: false, error: normalizeDbError(error) };
    }
    return { enabled: Boolean(data?.follow_mail_enabled), error: null };
  } catch (error) {
    logger.error('mail-notify-api', '读取关注邮件开关异常', error);
    return { enabled: false, error: normalizeDbError(error) };
  }
}

/**
 * 切换关注邮件通知开关
 * @param {string} userId
 * @param {boolean} enabled
 * @returns {Promise<{success: boolean, message: string, error: Error|null}>}
 */
export async function toggleFollowMail(userId, enabled) {
  if (!userId) {
    return { success: false, message: '请先登录', error: null };
  }
  try {
    const next = Boolean(enabled);
    const { error } = await supabase
      .from('profiles')
      .update({ follow_mail_enabled: next })
      .eq('id', userId);

    if (error) {
      logger.error('mail-notify-api', '保存关注邮件开关失败', error);
      return { success: false, message: '设置保存失败，请稍后重试', error: normalizeDbError(error) };
    }

    return {
      success: true,
      message: next ? '已开启：关注的人发帖或回复你时会发邮件' : '已关闭关注邮件通知',
      error: null,
    };
  } catch (error) {
    logger.error('mail-notify-api', '保存关注邮件开关异常', error);
    return {
      success: false,
      message: '设置保存失败，请稍后重试',
      error: normalizeDbError(error),
    };
  }
}
