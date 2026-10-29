import { supabase } from '../supabase-client.js';
import { logger } from '../logger.js';
import { normalizeDbError } from '../request-core.js';

/**
 * 「关注的人邮件通知」。
 *
 * 两条写入通道，职责刻意分开：
 *   · 开关（follow_mail_enabled）→ profiles 直改：2026102901 已补列级 UPDATE grant，
 *     开关无权益含义，直改没有漏洞。
 *   · 窗口（follow_mail_window_minutes）→ **只能走 RPC** boh_set_follow_mail_window：
 *     profiles 对 authenticated 的 UPDATE 是列级白名单，新列刻意**没有** grant ——
 *     实时档（15min）是 Max+ 订阅权益，直改 profiles 等于绕过校验 = 权益漏洞。
 *     服务端在 RPC 内查 user_subscriptions（max/ultra、active、未过期）强校验，
 *     无权益时抛 `MAX_ONLY_REQUIRED`（协议串，前端据此弹订阅引导，别改字面量）。
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
 * 读取邮件通知完整偏好：开关 + 去重窗口 + 投递方式 + 是否有实时权益。
 * 一次 RPC 拿全（权益判定要查 user_subscriptions，前端无法也不应该自己判）。
 * @returns {Promise<{enabled: boolean, windowMinutes: number, canRealtime: boolean, digest: boolean, error: Error|null}>}
 */
export async function getFollowMailPrefs() {
  try {
    const { data, error } = await supabase.rpc('boh_get_follow_mail_prefs');
    if (error) {
      logger.error('mail-notify-api', '读取邮件通知偏好失败', error);
      return {
        enabled: false,
        windowMinutes: 60,
        canRealtime: false,
        digest: false,
        error: normalizeDbError(error),
      };
    }
    // returns table ⇒ PostgREST 给数组；未登录/无行时为空
    const row = Array.isArray(data) ? data[0] : data;
    return {
      enabled: Boolean(row?.enabled),
      windowMinutes: Number(row?.window_minutes) === 15 ? 15 : 60,
      canRealtime: Boolean(row?.can_realtime),
      digest: Boolean(row?.digest),
      error: null,
    };
  } catch (error) {
    logger.error('mail-notify-api', '读取邮件通知偏好异常', error);
    return {
      enabled: false,
      windowMinutes: 60,
      canRealtime: false,
      digest: false,
      error: normalizeDbError(error),
    };
  }
}

/**
 * 保存投递方式（false = 及时，true = 聚合摘要）。无权益门槛：两种都人人可用。
 * @param {boolean} digest
 * @returns {Promise<{success: boolean, message: string, digest?: boolean, error: Error|null}>}
 */
export async function saveFollowMailDigest(digest) {
  try {
    const { data, error } = await supabase.rpc('boh_set_follow_mail_digest', {
      p_digest: Boolean(digest),
    });

    if (error) {
      logger.error('mail-notify-api', '保存投递方式失败', error);
      return { success: false, message: '设置保存失败，请稍后重试', error: normalizeDbError(error) };
    }

    const next = Boolean(data);
    return {
      success: true,
      message: next ? '已切换为聚合摘要' : '已切换为及时通知',
      digest: next,
      error: null,
    };
  } catch (error) {
    logger.error('mail-notify-api', '保存投递方式异常', error);
    return { success: false, message: '设置保存失败，请稍后重试', error: normalizeDbError(error) };
  }
}

/**
 * 保存去重窗口（15 = 实时 Max+ Only，60 = 标准）。
 * @param {number} windowMinutes
 * @returns {Promise<{success: boolean, message: string, maxOnlyRequired?: boolean, error: Error|null}>}
 */
export async function saveFollowMailWindow(windowMinutes) {
  if (![15, 60].includes(windowMinutes)) {
    return { success: false, message: '无效的提醒频率', error: null };
  }
  try {
    const { data, error } = await supabase.rpc('boh_set_follow_mail_window', {
      p_window: windowMinutes,
    });

    if (error) {
      const raw = String(error.message || '');
      // 服务端权益校验的协议串（见迁移 2026102902 的 raise）——前端据此弹订阅引导
      if (raw.includes('MAX_ONLY_REQUIRED')) {
        return {
          success: false,
          maxOnlyRequired: true,
          message: '实时提醒需要 Max 订阅',
          error: null,
        };
      }
      logger.error('mail-notify-api', '保存提醒频率失败', error);
      return { success: false, message: '设置保存失败，请稍后重试', error: normalizeDbError(error) };
    }

    return {
      success: true,
      message: windowMinutes === 15 ? '已切换为实时提醒' : '已切换为标准提醒',
      windowMinutes: Number(data) === 15 ? 15 : 60,
      error: null,
    };
  } catch (error) {
    logger.error('mail-notify-api', '保存提醒频率异常', error);
    return { success: false, message: '设置保存失败，请稍后重试', error: normalizeDbError(error) };
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
