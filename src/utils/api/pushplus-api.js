import { supabase } from '../supabase-client.js';
import { logger } from '../logger.js';
import { normalizeDbError } from '../request-core.js';
import { validatePushplusToken } from '../pushplus.js';

function normalizePushplusToken(rawToken) {
  if (typeof rawToken !== 'string') return null;
  const trimmed = rawToken.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 获取用户的 Pushplus 设置
 * @param {string} userId - 用户 ID
 * @returns {Promise<{data: Object, error: Error}>}
 */
export async function getPushplusSettings(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('pushplus_token, pushplus_enabled')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('pushplus-api', '获取 Pushplus 设置失败', error);
      return { data: null, error: normalizeDbError(error) };
    }

    return {
      data: {
        token: data?.pushplus_token || '',
        enabled: data?.pushplus_enabled || false
      },
      error: null
    };
  } catch (error) {
    logger.error('pushplus-api', '获取 Pushplus 设置异常', error);
    return { data: null, error: normalizeDbError(error) };
  }
}

/**
 * 更新用户的 Pushplus Token
 * @param {string} userId - 用户 ID
 * @param {string} token - Pushplus Token
 * @returns {Promise<{success: boolean, message: string, error: Error}>}
 */
export async function updatePushplusToken(userId, token) {
  try {
    // 验证 Token 格式
    if (!token || token.trim().length < 10) {
      return { success: false, message: 'Token 格式不正确', error: null };
    }

    const trimmedToken = token.trim();

    // 验证 Token 是否有效
    const validationResult = await validatePushplusToken(trimmedToken);
    // 兼容原来的 boolean 返回值以及新的对象返回值
    const isValid = typeof validationResult === 'boolean' ? validationResult : validationResult.success;

    if (!isValid) {
      const errorMsg = typeof validationResult === 'object' && validationResult.message
        ? `Token 验证失败: ${validationResult.message}`
        : 'Token 验证失败，请检查 Token 是否正确';
      return { success: false, message: errorMsg, error: null };
    }

    // 保存到数据库
    const { error } = await supabase
      .from('profiles')
      .update({
        pushplus_token: trimmedToken,
        pushplus_enabled: true
      })
      .eq('id', userId);

    if (error) {
      logger.error('pushplus-api', '保存 Pushplus Token 失败', error);
      return { success: false, message: '保存失败', error: normalizeDbError(error) };
    }

    return { success: true, message: 'Token 保存成功，已发送测试消息', error: null };
  } catch (error) {
    logger.error('pushplus-api', '更新 Pushplus Token 异常', error);
    return { success: false, message: '更新失败', error: normalizeDbError(error) };
  }
}

/**
 * 启用/禁用 Pushplus 推送
 * @param {string} userId - 用户 ID
 * @param {boolean} enabled - 是否启用
 * @returns {Promise<{success: boolean, message: string, error: Error}>}
 */
export async function togglePushplusEnabled(userId, enabled) {
  try {
    // 如果启用，先检查是否有 Token
    if (enabled) {
      const { data } = await getPushplusSettings(userId);
      if (!data?.token) {
        return { success: false, message: '请先配置 Pushplus Token', error: null };
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ pushplus_enabled: enabled })
      .eq('id', userId);

    if (error) {
      logger.error('pushplus-api', '切换 Pushplus 状态失败', error);
      return { success: false, message: '设置失败', error: normalizeDbError(error) };
    }

    return {
      success: true,
      message: enabled ? '已启用离线推送' : '已禁用离线推送',
      error: null
    };
  } catch (error) {
    logger.error('pushplus-api', '切换 Pushplus 状态异常', error);
    return { success: false, message: '设置失败', error: normalizeDbError(error) };
  }
}

/**
 * 删除用户的 Pushplus Token
 * @param {string} userId - 用户 ID
 * @returns {Promise<{success: boolean, message: string, error: Error}>}
 */
export async function deletePushplusToken(userId) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        pushplus_token: null,
        pushplus_enabled: false
      })
      .eq('id', userId);

    if (error) {
      logger.error('pushplus-api', '删除 Pushplus Token 失败', error);
      return { success: false, message: '删除失败', error: normalizeDbError(error) };
    }

    return { success: true, message: '已删除推送配置', error: null };
  } catch (error) {
    logger.error('pushplus-api', '删除 Pushplus Token 异常', error);
    return { success: false, message: '删除失败', error: normalizeDbError(error) };
  }
}

/**
 * 获取用户的 Pushplus Token（用于发送推送）
 * @param {string} userId - 用户 ID
 * @returns {Promise<string|null>}
 */
export async function getUserPushplusToken(userId) {
  try {
    if (!userId) return null;

    // 优先走安全函数读取，避免受 profiles 字段权限影响
    const { data: rpcToken, error: rpcError } = await supabase.rpc('get_pushplus_token_for_notification', {
      target_user_id: userId
    });

    if (!rpcError) {
      return normalizePushplusToken(rpcToken);
    }

    // 兼容旧环境：函数未部署时回退到原有直连查询逻辑
    if (rpcError.code !== 'PGRST202') {
      logger.warn('pushplus-api', 'RPC 获取用户 Token 失败，回退直连查询', rpcError);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('pushplus_token, pushplus_enabled')
      .eq('id', userId)
      .eq('pushplus_enabled', true)
      .single();

    if (error) {
      logger.warn('pushplus-api', '直连查询用户 Token 失败', error);
      return null;
    }

    return normalizePushplusToken(data?.pushplus_token);
  } catch (error) {
    logger.error('pushplus-api', '获取用户 Token 失败', error);
    return null;
  }
}
