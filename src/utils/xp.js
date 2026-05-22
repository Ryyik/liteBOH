/**
 * 社区经验与等级系统管理器
 */

// 等级配置：每级所需经验 = level * 100
export const getLevelInfo = (xp) => {
  let level = 1;
  let currentXP = xp;
  let nextLevelXP = 100;

  while (currentXP >= nextLevelXP) {
    currentXP -= nextLevelXP;
    level++;
    nextLevelXP = level * 100;
  }

  const progress = Math.min(100, Math.floor((currentXP / nextLevelXP) * 100));

  return {
    level,
    currentLevelXP: currentXP,
    nextLevelXP,
    progress,
    totalXP: xp
  };
};

// 经验奖励配置
export const XP_REWARDS = {
  POST: 20,      // 发帖奖励
  REPLY: 10,     // 回复奖励
  LIKE: 2,       // 点赞奖励
  BE_LIKED: 5    // 被点赞奖励（额外激励）
};

/**
 * 增加经验值的通用函数
 * @param {Object} supabase Supabase 客户端实例
 * @param {String} userId 用户ID
 * @param {Number} amount 增加的经验值数量
 */
export async function addExperience(supabase, userId, amount) {
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: new Error('无效的经验值参数') };
  }

  try {
    // 仅使用数据库原子操作，避免并发更新导致经验值覆盖。
    const { error } = await supabase.rpc('increment_xp', {
      user_id: userId,
      xp_amount: amount
    });

    if (error) {
      console.error('增加经验值失败: increment_xp RPC 执行失败', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('增加经验值失败:', err);
    return { success: false, error: err };
  }
}
