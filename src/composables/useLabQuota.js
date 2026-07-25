import { ref, computed } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { useAuthStore } from '@/stores/auth.ts';
import { useUserTier } from '@/composables/useUserTier.js';
import { logger } from '@/utils/logger.js';

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

  // 结构化展示数据（供 UI 直接绑定）
  const quotaDisplayData = computed(() => ({
    used: usageCount.value,
    limit: monthlyQuota.value,
    remaining: remainingCount.value,
    percent: usagePercent.value,
    isExceeded: isExceeded.value,
    isUnlimited: isUnlimited.value,
    tier: effectiveTier.value,
    nextTier: getNextTier(effectiveTier.value),
    nextTierQuota: getNextTierQuota(effectiveTier.value),
  }));

  function getNextTier(tier) {
    const map = { anonymous: 'free', free: 'plus', plus: 'pro', pro: 'max', max: 'ultra' };
    return map[tier] || null;
  }

  function getNextTierQuota(tier) {
    const next = getNextTier(tier);
    return next ? TIER_QUOTA_MAP[next] : null;
  }

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
      // 静默处理：未登录态或网络中断时不应噪音化，兜底为 0 次
      lastError.value = null;
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
    if (flowType !== 'ppt' && flowType !== 'word' && flowType !== 'code') {
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
   * 预扣减配额（AI 调用前调用，防止 TOCTOU 竞态导致无限生成消耗 token）
   * H-3 修复：将配额扣减从"下载时"提前到"AI 调用前"。
   * 若 AI 调用失败，调用 refundQuota 回退。
   * @param {string} flowType - 'ppt' | 'word' | 'code'
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function preConsumeQuota(flowType) {
    if (flowType !== 'ppt' && flowType !== 'word' && flowType !== 'code') {
      return { success: false, error: '无效的生成类型' };
    }

    // Ultra 用户不限次数
    if (isUnlimited.value) {
      return { success: true };
    }

    // 检查是否已超限
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

      // 立即递增本地计数（预扣减）
      usageCount.value += 1;
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || '配额预扣减失败' };
    }
  }

  /**
   * 回退配额（AI 调用失败时调用，回退 preConsumeQuota 的扣减）
   * @param {string} flowType - 'ppt' | 'word' | 'code'
   */
  async function refundQuota(flowType) {
    if (flowType !== 'ppt' && flowType !== 'word' && flowType !== 'code') {
      return;
    }

    // Ultra 用户不限次数，无需回退
    if (isUnlimited.value) {
      return;
    }

    try {
      const deviceId = isLoggedIn.value ? null : getOrCreateDeviceId();
      // 通过 RPC 回退（record_lab_usage 内部 count - 1，若不支持则本地回退）
      const { error } = await supabase.rpc('refund_lab_usage', {
        p_user_id: isLoggedIn.value ? userId.value : null,
        p_device_id: deviceId,
        p_flow_type: flowType
      });

      if (error) {
        // RPC 不存在或失败时，本地回退保证 UI 一致
        logger.warn('lab-quota', 'refund_lab_usage RPC 失败，本地回退:', error?.message);
      }
    } catch (e) {
      logger.warn('lab-quota', 'refundQuota 异常:', e?.message);
    } finally {
      // 无论 RPC 是否成功，本地计数回退 1（不超过 0）
      usageCount.value = Math.max(0, usageCount.value - 1);
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

    // 结构化展示数据
    quotaDisplayData,

    // 方法
    initialize,
    recordUsage,
    preConsumeQuota,
    refundQuota,
    refreshUsageCount,
    getQuotaHint,
    getUpgradeHint
  };
}

// 导出限额配置（供订阅页面使用）
export { TIER_QUOTA_MAP };