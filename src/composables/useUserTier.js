import { supabase } from '@/utils/supabase-client.js';
import { resolveNicknameTierClass, resolveHighestTierCode } from '@/utils/subscription-benefits.js';

const tierCache = new Map();

export function useUserTier() {
  async function fetchUserTier(userId) {
    if (!userId) return '';
    const cached = tierCache.get(userId);
    if (cached !== undefined) return cached;
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('plan_code')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false });
    if (error || !data || data.length === 0) {
      tierCache.set(userId, 'free');
      return '';
    }
    const planCodes = [...new Set(data.map(r => r.plan_code))];
    const tier = resolveHighestTierCode(
      planCodes.map(code => ({ planCode: code, status: 'active', expiresAt: new Date(Date.now() + 86400000).toISOString() }))
    );
    tierCache.set(userId, tier);
    return tier;
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
