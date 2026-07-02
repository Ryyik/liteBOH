import { ref, computed } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { useAuthStore } from '@/stores/auth.ts';
import { useUserTier } from '@/composables/useUserTier.js';

const DEVICE_ID_KEY = 'boh_lab_device_id';

// 各 tier 的月度限额（-1 表示不限）
const TIER_QUOTA_MAP = {
  anonymous: 3,   // 未登录用户
  free: 10,
  plus: 15,
  pro: 20,
  max: 30,
  ultra: -1  // 不限次数
};

/**
 * 获取或创建设备标识（用于未登录用户）
 */
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * 实验室使用限额管理
 */
export function useLabQuota() {
  const authStore = useAuthStore();
  const { fetchUserTier } = useUserTier();

  const usageCount = ref(0);
  const isLoading = ref(false);
  const lastError = ref(null);

  // 用户信息
  const userId = computed(() => authStore.userInfo?.id || null);
  const isLoggedIn = computed(() => authStore.isLoggedIn);

  // 用户 tier（需要登录后才能获取）
  const userTier = ref('free');

  // 实际使用的 tier（未登录用 anonymous，登录用实际 tier）
  const effectiveTier = computed(() => isLoggedIn.value ? userTier.value : 'anonymous');

  // 月度限额
  const monthlyQuota = computed(() => TIER_QUOTA_MAP[effectiveTier.value] || TIER_QUOTA_MAP.free);

  // 是否不限次数
  const isUnlimited = computed(() => monthlyQuota.value === -1);

  // 剩余次数
  const remainingCount = computed(() => {
    if (isUnlimited.value) return Infinity;
    return Math.max(0, monthlyQuota.value - usageCount.value);
  });

  // 是否已超限
  const isExceeded = computed(() => {
    if (isUnlimited.value) return false;
    return usageCount.value >= monthlyQuota.value;
  });

  // 进度百分比（用于 UI 展示）
  const usagePercent = computed(() => {
    if (isUnlimited.value) return 0;
    return Math.min(100, Math.round((usageCount.value / monthlyQuota.value) * 100));
  });

  /**
   * 初始化：获取用户 tier 和当前使用次数
   */
  async function initialize() {
    if (isLoading.value) return;
    isLoading.value = true;
    lastError.value = null;

    try {
      // 获取用户 tier
      if (isLoggedIn.value && userId.value) {
        const tier = await fetchUserTier(userId.value);
        userTier.value = tier || 'free';
      } else {
        userTier.value = 'anonymous';
      }

      // 获取当前使用次数
      const deviceId = isLoggedIn.value ? null : getOrCreateDeviceId();
      const { data, error } = await supabase.rpc('get_lab_usage_count', {
        p_user_id: isLoggedIn.value ? userId.value : null,
        p_device_id: deviceId
      });

      if (error) throw error;
      usageCount.value = Number(data) || 0;
    } catch (e) {
      lastError.value = e?.message || '获取使用次数失败';
      // 兜底：假设已用0次
      usageCount.value = 0;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 记录一次使用（下载按钮点击时调用）
   * @param {string} flowType - 'ppt' | 'word'
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function recordUsage(flowType) {
    if (flowType !== 'ppt' && flowType !== 'word') {
      return { success: false, error: '无效的生成类型' };
    }

    // Ultra 用户不限次数，无需记录
    if (isUnlimited.value) {
      return { success: true };
    }

    // 先检查是否已超限
    if (isExceeded.value) {
      return { success: false, error: `本月生成次数已达上限（${monthlyQuota.value}次）` };
    }

    try {
      const deviceId = isLoggedIn.value ? null : getOrCreateDeviceId();
      const { error } = await supabase.rpc('record_lab_usage', {
        p_user_id: isLoggedIn.value ? userId.value : null,
        p_device_id: deviceId,
        p_flow_type: flowType
      });

      if (error) throw error;

      // 更新本地计数
      usageCount.value += 1;
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || '记录使用失败' };
    }
  }

  /**
   * 刷新使用次数（从数据库重新获取）
   */
  async function refreshUsageCount() {
    await initialize();
  }

  /**
   * 获取限额提示文案
   */
  function getQuotaHint() {
    if (isUnlimited.value) {
      return '本月生成次数不限';
    }
    if (isExceeded.value) {
      return `本月已用 ${usageCount.value}/${monthlyQuota.value} 次，已达上限`;
    }
    return `本月已用 ${usageCount.value}/${monthlyQuota.value} 次，剩余 ${remainingCount.value} 次`;
  }

  /**
   * 获取升级提示文案（超限时使用）
   */
  function getUpgradeHint() {
    if (!isLoggedIn.value) {
      return '登录后可获得更多生成次数（10次/月）';
    }
    const nextTierMap = {
      anonymous: 'free',
      free: 'plus',
      plus: 'pro',
      pro: 'max',
      max: 'ultra'
    };
    const nextTier = nextTierMap[effectiveTier.value];
    if (!nextTier) return '';
    const nextQuota = TIER_QUOTA_MAP[nextTier];
    if (nextQuota === -1) {
      return `升级到 ${nextTier.toUpperCase()} 可获得无限生成次数`;
    }
    return `升级到 ${nextTier.toUpperCase()} 可获得 ${nextQuota} 次/月`;
  }

  return {
    // 状态
    usageCount,
    monthlyQuota,
    remainingCount,
    isExceeded,
    isUnlimited,
    usagePercent,
    isLoading,
    lastError,
    effectiveTier,

    // 方法
    initialize,
    recordUsage,
    refreshUsageCount,
    getQuotaHint,
    getUpgradeHint
  };
}

// 导出限额配置（供订阅页面使用）
export { TIER_QUOTA_MAP };