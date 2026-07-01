import { supabase } from '@/utils/supabase-client.js';
import { resolveNicknameTierClass } from '@/utils/subscription-benefits.js';

const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const tierCache = new Map();

function getCachedTier(userId) {
  const entry = tierCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    tierCache.delete(userId);
    return undefined;
  }
  return entry.tier;
}

function setCachedTier(userId, tier) {
  if (!userId) return;
  tierCache.set(userId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
}

export function useUserTier() {
  async function fetchUserTier(userId) {
    if (!userId) return '';
    const cached = getCachedTier(userId);
    if (cached !== undefined) return cached;
    const { data, error } = await supabase
      .rpc('get_user_subscription_tier', { p_user_id: userId });
    const tier = (!error && data) ? String(data).trim().toLowerCase() : '';
    // 统一处理：空tier视为free，确保缓存和返回值一致
    const normalizedTier = tier || 'free';
    setCachedTier(userId, normalizedTier);
    return normalizedTier;
  }

  /**
   * 批量获取多个用户的订阅等级，调用 get_user_subscription_tiers RPC。
   * 已缓存且未过期的用户直接使用缓存，未命中的批量查询。
   * @param {string[]} userIds
   * @returns {Promise<Map<string, string>>} userId -> tier
   */
  async function fetchUserTiersBatch(userIds) {
    const result = new Map();
    if (!Array.isArray(userIds) || userIds.length === 0) return result;

    const uncached = [];
    for (const id of userIds) {
      const cached = getCachedTier(id);
      if (cached !== undefined) {
        result.set(id, cached);
      } else {
        uncached.push(id);
      }
    }
    if (uncached.length === 0) return result;

    const { data, error } = await supabase
      .rpc('get_user_subscription_tiers', { p_user_ids: uncached });

    if (error || !Array.isArray(data)) {
      // 回退：逐个调用 fetchUserTier
      for (const id of uncached) {
        result.set(id, await fetchUserTier(id));
      }
      return result;
    }

    for (const row of data) {
      const tier = String(row.tier || '').trim().toLowerCase() || 'free';
      setCachedTier(row.user_id, tier);
      result.set(row.user_id, tier);
    }
    return result;
  }

  function getNicknameClass(userId) {
    const tier = getCachedTier(userId);
    if (!tier) return '';
    return resolveNicknameTierClass(tier);
  }

  function getUserTierCode(userId) {
    return getCachedTier(userId) || '';
  }

  function setTierCache(userId, tierCode) {
    if (userId && tierCode) setCachedTier(userId, tierCode);
  }

  return { fetchUserTier, fetchUserTiersBatch, getNicknameClass, setTierCache, getUserTierCode };
}
