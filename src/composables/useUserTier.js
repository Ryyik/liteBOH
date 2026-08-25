import { supabase } from '@/utils/supabase-client.js';
import { normalizeSubscriptionPlanCode, resolveNicknameTierClass } from '@/utils/subscription-benefits.js';

const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const TIER_CACHE_MAX_ENTRIES = 500;
const tierCache = new Map();
const tierRequestInFlight = new Map();
const tierBatchInFlight = new Map();

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
  // Map 迭代序即插入序：容量超限时淘汰最早写入的条目
  while (tierCache.size > TIER_CACHE_MAX_ENTRIES) {
    const oldestKey = tierCache.keys().next().value;
    if (oldestKey === undefined) break;
    tierCache.delete(oldestKey);
  }
}

export function useUserTier() {
  async function fetchUserTier(userId) {
    if (!userId) return '';
    const cached = getCachedTier(userId);
    if (cached !== undefined) return cached;
    if (tierRequestInFlight.has(userId)) return tierRequestInFlight.get(userId);

    const request = (async () => {
      const { data, error } = await supabase
        .rpc('get_user_subscription_tier', { p_user_id: userId });
      if (error || !data) {
        // RPC 失败不写缓存（避免负缓存 free 5 分钟），当次渲染回退 free，下次仍会重试
        return 'free';
      }
      const normalizedTier = normalizeSubscriptionPlanCode(data) || 'free';
      setCachedTier(userId, normalizedTier);
      return normalizedTier;
    })();
    tierRequestInFlight.set(userId, request);
    try {
      return await request;
    } finally {
      tierRequestInFlight.delete(userId);
    }
  }

  /**
   * 批量获取多个用户的订阅等级，调用 get_user_subscription_tiers RPC。
   * 已缓存且未过期的用户直接使用缓存，未命中的批量查询。
   * @param {string[]} userIds
   * @returns {Promise<Map<string, string>>} userId -> tier
   */
  async function fetchUserTiersBatch(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return new Map();

    // in-flight 去重：相同 id 集合的并发批量请求共享同一次 RPC
    const batchKey = [...new Set(userIds.filter(Boolean))].sort().join(',');
    if (!batchKey) return new Map();
    const inFlight = tierBatchInFlight.get(batchKey);
    if (inFlight) return inFlight;

    const request = (async () => {
      const result = new Map();
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

      const pending = uncached.filter((id) => tierRequestInFlight.has(id));
      const requestIds = uncached.filter((id) => !tierRequestInFlight.has(id));
      await Promise.all(pending.map(async (id) => result.set(id, await tierRequestInFlight.get(id))));
      if (requestIds.length === 0) return result;

      const { data, error } = await supabase
        .rpc('get_user_subscription_tiers', { p_user_ids: requestIds });

      if (error || !Array.isArray(data)) {
        // 回退：逐个调用 fetchUserTier
        for (const id of requestIds) {
          result.set(id, await fetchUserTier(id));
        }
        return result;
      }

      for (const row of data) {
        const tier = normalizeSubscriptionPlanCode(row.tier) || 'free';
        setCachedTier(row.user_id, tier);
        result.set(row.user_id, tier);
      }
      // RPC 正常返回但缺少成员时同样缓存 free，避免每次渲染重新查询。
      for (const id of requestIds) {
        if (!result.has(id)) {
          setCachedTier(id, 'free');
          result.set(id, 'free');
        }
      }
      return result;
    })();

    tierBatchInFlight.set(batchKey, request);
    try {
      return await request;
    } finally {
      tierBatchInFlight.delete(batchKey);
    }
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
