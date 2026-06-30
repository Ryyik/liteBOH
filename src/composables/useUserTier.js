import { supabase } from '@/utils/supabase-client.js';
import { resolveNicknameTierClass } from '@/utils/subscription-benefits.js';

const tierCache = new Map();

export function useUserTier() {
  async function fetchUserTier(userId) {
    if (!userId) return '';
    const cached = tierCache.get(userId);
    if (cached !== undefined) return cached;
    const { data, error } = await supabase
      .rpc('get_user_subscription_tier', { p_user_id: userId });
    const tier = (!error && data) ? String(data).trim().toLowerCase() : '';
    // 统一处理：空tier视为free，确保缓存和返回值一致
    const normalizedTier = tier || 'free';
    tierCache.set(userId, normalizedTier);
    return normalizedTier;
  }

  function getNicknameClass(userId) {
    const tier = tierCache.get(userId);
    if (!tier) return '';
    return resolveNicknameTierClass(tier);
  }

  function setTierCache(userId, tierCode) {
    if (userId && tierCode) tierCache.set(userId, tierCode);
  }

  return { fetchUserTier, getNicknameClass, setTierCache };
}
