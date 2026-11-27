/**
 * 社区经验与等级系统管理器
 */
import { logger } from './logger.js';

// 等级配置：每级所需经验 = level * 100
export const getLevelInfo = (xp) => {
  const safeXP = Number(xp);
  if (!Number.isFinite(safeXP) || safeXP < 0) {
    return {
      level: 1,
      currentLevelXP: 0,
      nextLevelXP: 100,
      progress: 0,
      totalXP: 0,
    };
  }

  const MAX_LEVEL = 9999;
  let level = 1;
  let currentXP = safeXP;
  let nextLevelXP = 100;

  while (currentXP >= nextLevelXP && level < MAX_LEVEL) {
    currentXP -= nextLevelXP;
    level++;
    nextLevelXP = level * 100;
  }

  if (level >= MAX_LEVEL) {
    currentXP = nextLevelXP;
    nextLevelXP = level * 100;
  }

  const progress = Math.min(100, Math.floor((currentXP / nextLevelXP) * 100));

  return {
    level,
    currentLevelXP: currentXP,
    nextLevelXP,
    progress,
    totalXP: safeXP,
  };
};

// 经验奖励配置
export const XP_REWARDS = {
  POST: 20, // 发帖奖励
  REPLY: 10, // 回复奖励
  LIKE: 2, // 点赞奖励
  BE_LIKED: 5, // 被点赞奖励（额外激励）
};

/**
 * 按服务端固定奖励发放经验；金额与用户身份都不接受客户端传入。
 * @param {Object} supabase Supabase 客户端实例
 * @param {'POST'|'REPLY'|'LIKE'|'BE_LIKED'} reason XP_REWARDS 中的奖励原因
 * @param {string} eventId 触发奖励的真实帖子 / 评论 / 点赞事件 ID
 */
export async function addExperience(supabase, reason, eventId) {
  if (!Object.prototype.hasOwnProperty.call(XP_REWARDS, reason)) {
    return { success: false, error: new Error('无效的经验奖励原因') };
  }
  if (!String(eventId || '').trim()) {
    return { success: false, error: new Error('缺少经验奖励事件 ID') };
  }

  try {
    const { data, error } = await supabase.rpc('award_forum_experience', {
      p_reason: reason.toLowerCase(),
      p_event_id: String(eventId).trim(),
    });

    if (error) {
      logger.error('xp', 'award_forum_experience RPC 执行失败', error);
      return { success: false, error };
    }

    return { success: data === true };
  } catch (err) {
    logger.error('xp', '增加经验值失败:', err);
    return { success: false, error: err };
  }
}
