<template>
  <div class="subscription-plans">
    <!-- Header Area -->
    <div class="header-section">
      <h1 class="page-title">BOH订阅计划</h1>

      <!-- Points Balance Display (New) -->
      <div class="points-balance-pill glass-container-light">
        <span class="label">当前积分</span>
        <span class="value">{{ currentPoints }}</span>
        <span class="unit">pts</span>
      </div>
      <p v-if="isLoadingSubscriptions" class="sync-hint">正在同步订阅状态...</p>

      <!-- Toggle Switch -->
      <div class="toggle-container">
        <div class="toggle-wrapper" @click="billingCycle = billingCycle === 'monthly' ? 'yearly' : 'monthly'">
          <div class="toggle-bg"
            :class="{ 'active-left': billingCycle === 'monthly', 'active-right': billingCycle === 'yearly' }"></div>
          <button class="toggle-btn" :class="{ active: billingCycle === 'monthly' }"
            @click.stop="billingCycle = 'monthly'">
            月付
          </button>
          <button class="toggle-btn" :class="{ active: billingCycle === 'yearly' }"
            @click.stop="billingCycle = 'yearly'">
            年付 <span class="discount-tag">省 17%</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Current Subscription Banner -->
    <div v-if="highestActivePlan" class="current-sub-banner">
      <div class="banner-icon-wrapper">
        <component :is="highestActivePlan.icon" class="banner-icon" :size="22" :stroke-width="1.7" />
      </div>
      <div class="banner-info">
        <span class="banner-tier-name">{{ highestActivePlan.name }}</span>
        <span class="banner-expiry">有效期至 {{ formatDateText(highestActivePlan.expiresAt) }}</span>
      </div>
    </div>

    <!-- Music Decoration -->
    <div class="music-decor">
      <div class="music-stave-bg"></div>
      <div class="floating-note note-1">♪</div>
      <div class="floating-note note-2">♫</div>
      <div class="floating-note note-3">♩</div>
      <div class="floating-note note-4">♬</div>
    </div>

    <!-- Pricing Cards Container -->
    <div class="pricing-container">
      <TransitionGroup name="card-transition" tag="div" class="pricing-grid-wrapper">
        <div v-for="(plan, index) in plans" :key="plan.code" class="pricing-card"
          :class="{ 'featured': plan.featured, 'active-plan': plan.status === 'active' }"
          :style="{ '--delay': index * 0.1 + 's', '--card-index': index }">
          <div class="card-note n1">♩</div>
          <div class="card-note n2">♪</div>
          <div class="card-note n3">♫</div>
          <div class="card-content">
            <div class="plan-header">
              <component :is="plan.icon" class="plan-icon" :size="28" :stroke-width="1.7" aria-hidden="true" />
              <h3 class="plan-name">{{ plan.name }}</h3>
              <div class="plan-price">
                <span class="amount">{{ calculatePrice(plan) }}</span>
                <span class="period">积分{{ billingCycle === 'monthly' ? '/月' : '/年' }}</span>
              </div>
              <div class="billing-desc" v-if="billingCycle === 'yearly' && plan.monthlyCost > 0">
                相当于 {{ Math.round(plan.monthlyCost * 10 / 12) }} 积分/月
              </div>
              <div class="active-period" v-if="plan.activeSubscription">
                生效至 {{ formatDateText(plan.activeSubscription.expiresAt) }}
              </div>
            </div>

            <ul class="feature-list">
              <li v-for="(feature, fIndex) in plan.features" :key="fIndex" class="feature-item">
                <Check class="check-icon" :size="15" :stroke-width="2" aria-hidden="true" />
                <span class="feature-text">{{ feature }}</span>
              </li>
            </ul>

            <div class="card-footer">
              <button class="action-btn full-width" :class="getButtonClass(plan)" @click="handleSubscribe(plan)"
                :disabled="plan.status === 'active' || isSubmitting || isLoadingSubscriptions">
                {{ getButtonText(plan) }}
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Coding Plans Section -->
    <div class="coding-section">
      <div class="coding-section-header">
        <Code :size="22" class="coding-section-icon" />
        <h2 class="coding-section-title">BOH AI Coding 附加包</h2>
        <p class="coding-section-desc">在现有订阅基础上叠加，解锁编码专属 AI 能力。额度叠加计算。</p>
      </div>
      <div class="coding-grid">
        <div v-for="(plan, index) in codingPlans" :key="plan.code" class="coding-card"
          :class="{ 'coding-featured': plan.featured, 'coding-active': plan.status === 'active' }"
          :style="{ '--coding-delay': index * 0.1 + 's' }">
          <div class="coding-card-badge" v-if="plan.featured">推荐</div>
          <div class="coding-card-content">
            <div class="coding-card-header">
              <component :is="plan.icon" class="coding-card-icon" :size="24" :stroke-width="1.5" />
              <h3 class="coding-card-name">{{ plan.name }}</h3>
              <div class="coding-card-price">
                <span class="coding-amount">{{ calculatePrice(plan) }}</span>
                <span class="coding-period">积分{{ billingCycle === 'monthly' ? '/月' : '/年' }}</span>
              </div>
            </div>
            <ul class="coding-feature-list">
              <li v-for="(feature, fIndex) in plan.features" :key="fIndex" class="coding-feature-item">
                <Check :size="14" class="coding-check" />
                <span>{{ feature }}</span>
              </li>
            </ul>
            <div class="coding-card-footer">
              <div class="coding-stack-hint">叠加于任何现有订阅之上</div>
              <button class="coding-action-btn" :class="getCodingButtonClass(plan)"
                @click="handleCodingSubscribe(plan)"
                :disabled="plan.status === 'active' || isSubmitting || isLoadingSubscriptions">
                {{ getCodingButtonText(plan) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <Transition name="toast-fade">
      <div v-if="showToast" class="toast-notification-wrapper">
        <div class="toast-notification glass-container-heavy">
          {{ toastMessage }}
        </div>
      </div>
    </Transition>

    <!-- Insufficient Points Modal -->
    <Transition name="glass-fade">
      <div v-if="showModal" class="glass-modal-clean-overlay" @click="closeModal">
        <div class="glass-modal-container" @click.stop>
          <div class="modal-clean-header">
            <h3 class="modal-clean-title">积分不足</h3>
          </div>
          <div class="modal-clean-divider"></div>
          <div class="modal-clean-body">
            <p class="modal-clean-message" v-if="currentService">
              订阅 <span class="highlight-text">{{ currentService.name }}</span> 需要 <span class="highlight-text">{{
                calculatePrice(currentService) }}</span> 积分。
              <br>
              当前积分余额 <span class="highlight-text">{{ currentPoints }}</span>，无法完成订阅。
            </p>
          </div>
          <button class="modal-clean-btn" @click="closeModal">知道了</button>
        </div>
      </div>
    </Transition>

    <!-- Confirm Subscription Modal -->
    <Transition name="glass-fade">
      <div v-if="showConfirmModal" class="glass-modal-clean-overlay" @click="closeConfirmModal">
        <div class="glass-modal-container" @click.stop>
          <div class="modal-clean-header">
            <h3 class="modal-clean-title">确认订阅</h3>
          </div>
          <div class="modal-clean-divider"></div>
          <div class="modal-clean-body">
            <div v-if="confirmPlan" class="confirm-detail">
              <div class="confirm-row">
                <span class="confirm-label">订阅计划</span>
                <span class="confirm-value">{{ confirmPlan.name }}</span>
              </div>
              <div class="confirm-row">
                <span class="confirm-label">付费周期</span>
                <span class="confirm-value">{{ billingCycle === 'monthly' ? '月付' : '年付' }}</span>
              </div>
              <div class="confirm-row">
                <span class="confirm-label">所需积分</span>
                <span class="confirm-value highlight">{{ calculatePrice(confirmPlan) }}</span>
              </div>
              <div class="confirm-divider"></div>
              <div class="confirm-row">
                <span class="confirm-label">当前积分</span>
                <span class="confirm-value">{{ currentPoints }}</span>
              </div>
              <div class="confirm-row">
                <span class="confirm-label">订阅后剩余</span>
                <span class="confirm-value" :class="currentPoints - calculatePrice(confirmPlan) >= 0 ? 'text-green' : 'text-red'">
                  {{ currentPoints - calculatePrice(confirmPlan) }}
                </span>
              </div>
            </div>
          </div>
          <div class="modal-clean-actions">
            <button class="modal-clean-btn modal-cancel-btn" @click="closeConfirmModal">取消</button>
            <button class="modal-clean-btn modal-confirm-btn" @click="confirmSubscribe">确认订阅</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { Bot, Cake, Check, Crown, Gift, Zap, Code, Rocket, Star, Cpu } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { getMySubscriptions, subscribeWithPoints } from '@/utils/api/subscription-api.js';
import { clearUserTierCache } from '@/utils/api/api-key-runtime-api.js';
import { logger } from '@/utils/logger.js';

const BILLING_MONTHLY = 'monthly';

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const BASE_PLANS = [
  {
    id: 1,
    code: 'free',
    name: 'Free',
    icon: Cake,
    monthlyCost: 0,
    features: ['生日当天专属祝福', '神秘生日礼物', '社区徽章', 'BOH AI 20万 Token/天', 'Cloud+ 150张', '实验室 PPT/Word 10次/月'],
    featured: false,
    alwaysActive: true
  },
  {
    id: 2,
    code: 'plus',
    name: 'Plus',
    icon: Bot,
    monthlyCost: 8,
    features: ['BOH AI 80万 Token/天', 'Cloud+ 300张', '礼物定制月×1次', '多模态交互', '实验室 PPT/Word 15次/月'],
    featured: true
  },
  {
    id: 3,
    code: 'pro',
    name: 'Pro',
    icon: Zap,
    monthlyCost: 20,
    features: ['BOH AI 200万 Token/天', 'Cloud+ 450张', '礼物定制月×2次', '多模态交互', '金色昵称', '实验室 PPT/Word 20次/月'],
    featured: false
  },
  {
    id: 4,
    code: 'max',
    name: 'Max',
    icon: Gift,
    monthlyCost: 40,
    features: ['BOH AI 500万 Token/天', 'Cloud+ 900张', '礼物定制月×4次', 'Agent & Plan', '金色昵称', '实验室 PPT/Word 30次/月'],
    featured: false
  },
  {
    id: 5,
    code: 'ultra',
    name: 'Ultra',
    icon: Crown,
    monthlyCost: 70,
    features: ['BOH AI 1000万 Token/天', 'Cloud+ 1200张', '礼物定制月×8次', 'Agent & Plan', '彩虹昵称', '实验室 PPT/Word 不限次数'],
    featured: false
  }
];

const CODING_PLANS = [
  {
    id: 6,
    code: 'coding-lite',
    name: 'Coding Lite',
    icon: Code,
    monthlyCost: 5,
    features: ['BOH AI 编码附加 +50万 Token/天', 'Web Searching 10次/天', '基础代码补全', '适用于轻度编码辅助'],
    featured: false
  },
  {
    id: 7,
    code: 'coding-plus',
    name: 'Coding Plus',
    icon: Cpu,
    monthlyCost: 12,
    features: ['BOH AI 编码附加 +150万 Token/天', 'Web Searching 30次/天', '专属 Coding 模型', '代码解释与优化', '文件级上下文分析'],
    featured: true
  },
  {
    id: 8,
    code: 'coding-pro',
    name: 'Coding Pro',
    icon: Rocket,
    monthlyCost: 20,
    features: ['BOH AI 编码附加 +300万 Token/天', 'Web Searching 60次/天', '专属 Coding 模型', '多文件项目分析', '批量代码重构', '优先响应'],
    featured: false
  },
  {
    id: 9,
    code: 'coding-ultra',
    name: 'Coding Ultra',
    icon: Star,
    monthlyCost: 35,
    features: ['BOH AI 编码附加 +600万 Token/天', 'Web Searching 120次/天', '专属 Coding 模型', '全项目分析', 'Agent 自动编码', '无限文件上传', '最高优先级'],
    featured: false
  }
];

const billingCycle = ref(BILLING_MONTHLY);
const showToast = ref(false);
const toastMessage = ref('');
const showModal = ref(false);
const showConfirmModal = ref(false);
const confirmPlan = ref(null);
const currentService = ref(null);
const currentPoints = ref(0);
const isSubmitting = ref(false);
const isLoadingSubscriptions = ref(false);
const subscriptions = ref([]);
const activeSubscriptions = ref({});
let toastTimer = null;

watch(() => userInfo.value?.points, (newPoints) => {
  currentPoints.value = Number(newPoints || 0);
}, { immediate: true });

watch(() => userInfo.value?.id, () => {
  void loadMySubscriptions();
}, { immediate: true });

const plans = computed(() => BASE_PLANS.map((plan) => {
  const activeSubscription = activeSubscriptions.value[plan.code] || null;
  const status = (plan.alwaysActive || activeSubscription) ? 'active' : 'purchasable';
  return { ...plan, status, activeSubscription };
}));

const calculatePrice = (plan) => {
  if (plan.monthlyCost === 0) return 0;
  return billingCycle.value === BILLING_MONTHLY ? plan.monthlyCost : plan.monthlyCost * 10;
};

const resolveDurationMonths = () => (
  billingCycle.value === BILLING_MONTHLY ? 1 : 12
);

const formatDateText = (dateText) => {
  if (!dateText) return '--';
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

const getButtonText = (plan) => {
  if (isSubmitting.value && currentService.value?.code === plan.code) return '处理中...';
  if (plan.status === 'active') return '正在生效';
  if (plan.monthlyCost === 0) return '免费加入';
  return `订阅 ${plan.name}`;
};

const getButtonClass = (plan) => {
  if (plan.status === 'active') return 'btn-success';
  if (isSubmitting.value && currentService.value?.code === plan.code) return 'btn-disabled';
  return 'btn-primary';
};

const showToastMessage = (message) => {
  toastMessage.value = message;
  showToast.value = true;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    showToast.value = false;
    toastTimer = null;
  }, 3000);
};

const buildActiveSubscriptionMap = (list = []) => {
  const nowTs = Date.now();
  const map = {};

  list.forEach((item) => {
    if (!item || item.status !== 'active' || !item.planCode) return;
    const expiresTs = Date.parse(item.expiresAt || '');
    if (!Number.isFinite(expiresTs) || expiresTs <= nowTs) return;

    const existing = map[item.planCode];
    if (!existing) {
      map[item.planCode] = item;
      return;
    }

    const existingExpiresTs = Date.parse(existing.expiresAt || '');
    if (!Number.isFinite(existingExpiresTs) || expiresTs > existingExpiresTs) {
      map[item.planCode] = item;
    }
  });

  activeSubscriptions.value = map;
};

async function loadMySubscriptions() {
  if (!userInfo.value?.id) {
    subscriptions.value = [];
    activeSubscriptions.value = {};
    return;
  }

  isLoadingSubscriptions.value = true;
  const { ok, data, error } = await getMySubscriptions(userInfo.value.id, { includeExpired: true });
  isLoadingSubscriptions.value = false;

  if (!ok) {
    subscriptions.value = [];
    activeSubscriptions.value = {};
    logger.error('subscription', '加载订阅记录失败:', error);
    return;
  }

  subscriptions.value = Array.isArray(data) ? data : [];
  buildActiveSubscriptionMap(subscriptions.value);
}

const openInsufficientModal = (plan) => {
  currentService.value = plan;
  showModal.value = true;
};

const handleSubscribe = async (plan) => {
  if (plan.status === 'active' || isSubmitting.value || isLoadingSubscriptions.value) return;

  if (!authStore.isLoggedIn || !userInfo.value?.id) {
    showToastMessage('请先登录后再订阅');
    authStore.showLoginModal = true;
    return;
  }

  if (plan.monthlyCost <= 0) {
    showToastMessage('该订阅为免费权益，无需积分扣费');
    return;
  }

  const price = calculatePrice(plan);
  if (currentPoints.value < price) {
    openInsufficientModal(plan);
    return;
  }

  confirmPlan.value = plan;
  showConfirmModal.value = true;
};

const confirmSubscribe = async () => {
  const plan = confirmPlan.value;
  if (!plan) return;
  showConfirmModal.value = false;

  const price = calculatePrice(plan);

  isSubmitting.value = true;
  currentService.value = plan;

  try {
    const durationMonths = resolveDurationMonths();
    const { ok, data, error } = await subscribeWithPoints({
      planCode: plan.code,
      planName: plan.name,
      billingCycle: billingCycle.value,
      pointsCost: price,
      durationMonths,
      metadata: {
        planIcon: plan.icon,
        source: 'user-center/subscription'
      }
    });

    if (!ok) {
      if (error?.message) {
        showToastMessage(error.message);
        return;
      }

      if (data?.message === 'NOT_AUTHENTICATED') {
        showToastMessage('请先登录后再订阅');
        authStore.showLoginModal = true;
        return;
      }

      if (data?.message === 'INSUFFICIENT_POINTS') {
        const latestPoints = Number(data.currentPoints || currentPoints.value || 0);
        currentPoints.value = latestPoints;
        authStore.$patch({ userInfo: { ...authStore.userInfo, points: latestPoints } });
        openInsufficientModal(plan);
        return;
      }

      showToastMessage('订阅失败，请稍后重试');
      return;
    }

    const latestPoints = Number(data.currentPoints || 0);
    currentPoints.value = latestPoints;
    authStore.$patch({ userInfo: { ...authStore.userInfo, points: latestPoints } });

    await loadMySubscriptions();

    clearUserTierCache().catch(() => undefined);

    const expiresText = data.expiresAt ? `，有效期至 ${formatDateText(data.expiresAt)}` : '';
    showToastMessage(`订阅成功！已开通 ${plan.name}${expiresText}`);
  } catch (error) {
    logger.error('subscription', '订阅失败:', error);
    showToastMessage('订阅失败，请稍后重试');
  } finally {
    isSubmitting.value = false;
    currentService.value = null;
    showModal.value = false;
  }
};

const closeModal = () => {
  showModal.value = false;
};

const closeConfirmModal = () => {
  showConfirmModal.value = false;
  confirmPlan.value = null;
};

const codingPlans = computed(() => CODING_PLANS.map((plan) => {
  const activeSubscription = activeSubscriptions.value[plan.code] || null;
  const status = activeSubscription ? 'active' : 'purchasable';
  return { ...plan, status, activeSubscription };
}));

const getCodingButtonText = (plan) => {
  if (isSubmitting.value && currentService.value?.code === plan.code) return '处理中...';
  if (plan.status === 'active') return '已生效';
  return `订阅 ${plan.name}`;
};

const getCodingButtonClass = (plan) => {
  if (plan.status === 'active') return 'coding-btn-success';
  if (isSubmitting.value && currentService.value?.code === plan.code) return 'coding-btn-disabled';
  return 'coding-btn-primary';
};

const handleCodingSubscribe = async (plan) => {
  if (plan.status === 'active' || isSubmitting.value || isLoadingSubscriptions.value) return;

  if (!authStore.isLoggedIn || !userInfo.value?.id) {
    showToastMessage('请先登录后再订阅');
    authStore.showLoginModal = true;
    return;
  }

  const price = calculatePrice(plan);
  if (currentPoints.value < price) {
    currentService.value = plan;
    showModal.value = true;
    return;
  }

  confirmPlan.value = plan;
  showConfirmModal.value = true;
};

const TIER_ORDER = ['free', 'plus', 'pro', 'max', 'ultra'];
const highestActivePlan = computed(() => {
  const entries = Object.entries(activeSubscriptions.value);
  if (entries.length === 0) return null;
  let best = null;
  let bestIdx = -1;
  for (const [, sub] of entries) {
    const idx = TIER_ORDER.indexOf(sub.planCode);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = sub;
    }
  }
  if (!best) return null;
  const planDef = BASE_PLANS.find(p => p.code === best.planCode);
  if (!planDef) return null;
  return {
    ...best,
    name: planDef.name,
    icon: planDef.icon
  };
});

onBeforeUnmount(() => {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
});
</script>

<style scoped>
/* ==========================================
   极简毛玻璃 · 黑白灰订阅卡片
   ========================================== */

.subscription-plans {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  position: relative;
  background: transparent;
}

/* ==========================================
   Sync Hint
   ========================================== */

.sync-hint {
  margin: 0;
  font-size: 13px;
  color: #8e8e93;
  font-weight: 500;
  text-align: center;
}

/* ==========================================
   Active Period
   ========================================== */

.active-period {
  margin-top: 8px;
  padding: 3px 10px;
  font-size: 11px;
  color: #34c759;
  border-radius: 4px;
  background: rgba(52, 199, 89, 0.1);
  font-weight: 600;
  display: inline-block;
}

/* ==========================================
   Current Subscription Banner
   ========================================== */

.current-sub-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 14px;
  background: rgba(52, 199, 89, 0.06);
  border: 1px solid rgba(52, 199, 89, 0.15);
  margin: 0 16px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.banner-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(52, 199, 89, 0.1);
  flex-shrink: 0;
}

.banner-icon {
  color: #34c759;
}

.banner-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.banner-tier-name {
  font-size: 15px;
  font-weight: 700;
  color: #1d1d1f;
}

.banner-expiry {
  font-size: 12px;
  color: #34c759;
  font-weight: 600;
}

/* ==========================================
   Header Section
   ========================================== */

.header-section {
  text-align: center;
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
}

.page-title {
  font-size: 32px;
  font-weight: 800;
  color: #1d1d1f;
  margin: 0;
  letter-spacing: -0.5px;
}

/* ==========================================
   Points Balance Pill (Glass)
   ========================================== */

.points-balance-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 28px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.points-balance-pill .label {
  font-size: 13px;
  color: #8e8e93;
  font-weight: 600;
}

.points-balance-pill .value {
  font-size: 24px;
  font-weight: 800;
  color: #1d1d1f;
  line-height: 1;
}

.points-balance-pill .unit {
  font-size: 13px;
  color: #6e6e73;
  font-weight: 600;
}

/* ==========================================
   Billing Toggle
   ========================================== */

.toggle-container {
  display: flex;
  justify-content: center;
}

.toggle-wrapper {
  background: rgba(233, 236, 239, 0.4);
  padding: 4px;
  border-radius: 100px;
  display: flex;
  position: relative;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.04);
  min-width: 240px;
}

.toggle-bg {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: rgba(255, 255, 255, 0.85);
  border-radius: 100px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.toggle-bg.active-right {
  transform: translateX(100%);
}

.toggle-btn {
  position: relative;
  z-index: 1;
  padding: 8px 0;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: #8e8e93;
  cursor: pointer;
  transition: color 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  flex: 1;
  width: 0;
}

.toggle-btn.active {
  color: #1d1d1f;
}

.discount-tag {
  font-size: 11px;
  color: #8e8e93;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}

/* ==========================================
   Music Decoration
   ========================================== */

.music-decor {
  position: relative;
  width: 100%;
  height: 0;
  z-index: 0;
  pointer-events: none;
}

.music-stave-bg {
  position: absolute;
  top: 50%;
  left: -5%;
  width: 110%;
  height: 160px;
  transform: translateY(-50%) rotate(-1.5deg);
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.05) 0,
    rgba(0, 0, 0, 0.05) 1px,
    transparent 1px,
    transparent 22px
  );
  pointer-events: none;
}

.floating-note {
  position: absolute;
  font-size: 40px;
  color: rgba(0, 0, 0, 0.15);
  animation: floatNote 7s ease-in-out infinite;
  pointer-events: none;
}

.note-1 {
  top: -20px;
  left: 6%;
  animation-delay: 0s;
  font-size: 44px;
  transform: rotate(-12deg);
}

.note-2 {
  top: -10px;
  right: 10%;
  animation-delay: 1.8s;
  font-size: 32px;
  transform: rotate(8deg);
}

.note-3 {
  bottom: -30px;
  left: 18%;
  animation-delay: 3s;
  font-size: 36px;
  transform: rotate(-5deg);
}

.note-4 {
  bottom: -20px;
  right: 6%;
  animation-delay: 4.2s;
  font-size: 48px;
  transform: rotate(10deg);
}

@keyframes floatNote {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-12px) rotate(3deg); }
}

/* ==========================================
   Pricing Cards Container
   ========================================== */

.pricing-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0;
  padding: 40px 40px 60px;
  position: relative;
  z-index: 1;
  max-width: 100%;
  margin: 0 auto;
  overflow: visible;
}

.pricing-grid-wrapper {
  display: contents;
}

/* ==========================================
   Pricing Card — Glass Fan Spread
   ========================================== */

.pricing-card {
  width: 340px;
  min-width: 0;
  max-width: 340px;
  padding: 34px 28px 24px;
  border-radius: 28px;
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 7px,
      rgba(0, 0, 0, 0.025) 7px,
      rgba(0, 0, 0, 0.025) 8px
    ),
    rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: flex;
  flex-direction: column;
  position: relative;
  animation: cardFadeUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  animation-delay: var(--delay, 0s);
  transform-origin: center bottom;
  margin-right: -52px;
}

.pricing-card:last-child {
  margin-right: 0;
}

/* Fan spread rotation */
.pricing-card:nth-child(1) {
  transform: rotate(-4.5deg) translateY(12px);
  z-index: 1;
}

.pricing-card:nth-child(2) {
  transform: rotate(-2deg) translateY(2px);
  z-index: 2;
}

.pricing-card:nth-child(3) {
  transform: rotate(0deg) translateY(-18px) scale(1.03);
  z-index: 4;
}

.pricing-card:nth-child(4) {
  transform: rotate(2deg) translateY(2px);
  z-index: 2;
}

.pricing-card:nth-child(5) {
  transform: rotate(4.5deg) translateY(12px);
  z-index: 1;
}

/* Featured card — override rotation for prominence */
.pricing-card.featured {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.07);
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 7px,
      rgba(0, 0, 0, 0.025) 7px,
      rgba(0, 0, 0, 0.025) 8px
    ),
    rgba(255, 255, 255, 0.4);
  border-color: rgba(0, 0, 0, 0.08);
}

/* "推荐" badge */
.pricing-card.featured::before {
  content: '推荐';
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 4px 14px;
  border-radius: 0 0 8px 8px;
  background: #1d1d1f;
  color: #fff;
  z-index: 3;
}

/* Card-level floating music notes */
.card-note {
  position: absolute;
  font-size: 22px;
  color: rgba(0, 0, 0, 0.18);
  pointer-events: none;
  z-index: 5;
  animation: cardNoteFloat 5s ease-in-out infinite;
}

.card-note.n2 { animation-delay: -1.5s; }
.card-note.n3 { animation-delay: -3s; }

@keyframes cardNoteFloat {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(4deg); }
}

/* Per-card note positions */
.pricing-card:nth-child(1) .n1 { top: 8%; right: 8%; font-size: 24px; }
.pricing-card:nth-child(1) .n2 { bottom: 15%; left: 6%; font-size: 18px; }
.pricing-card:nth-child(1) .n3 { top: 50%; right: 5%; font-size: 16px; }

.pricing-card:nth-child(2) .n1 { top: 6%; left: 6%; font-size: 22px; }
.pricing-card:nth-child(2) .n2 { bottom: 18%; right: 8%; font-size: 20px; }
.pricing-card:nth-child(2) .n3 { top: 55%; left: 5%; font-size: 15px; }

.pricing-card:nth-child(3) .n1 { top: 8%; right: 10%; font-size: 26px; }
.pricing-card:nth-child(3) .n2 { bottom: 12%; left: 8%; font-size: 18px; }
.pricing-card:nth-child(3) .n3 { top: 58%; right: 4%; font-size: 14px; }

.pricing-card:nth-child(4) .n1 { top: 12%; left: 5%; font-size: 20px; }
.pricing-card:nth-child(4) .n2 { bottom: 16%; right: 6%; font-size: 22px; }
.pricing-card:nth-child(4) .n3 { top: 52%; left: 10%; font-size: 16px; }

.pricing-card:nth-child(5) .n1 { top: 6%; right: 6%; font-size: 25px; }
.pricing-card:nth-child(5) .n2 { bottom: 20%; left: 4%; font-size: 18px; }
.pricing-card:nth-child(5) .n3 { top: 55%; right: 8%; font-size: 15px; }

/* Subtle glass border highlight overlay */
.pricing-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  pointer-events: none;
}

/* Active subscription card — green border */
.pricing-card.active-plan {
  border-color: rgba(52, 199, 89, 0.35);
  box-shadow: 0 4px 20px rgba(52, 199, 89, 0.08);
  background:
    repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 7px,
      rgba(52, 199, 89, 0.035) 7px,
      rgba(52, 199, 89, 0.035) 8px
    ),
    rgba(255, 255, 255, 0.4);
}

.pricing-card.active-plan::after {
  border-color: rgba(52, 199, 89, 0.1);
}

/* Hover — pull card out of fan, straighten, lift */
.pricing-card:hover {
  transform: translateY(-20px) scale(1.05) rotate(0deg) !important;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.65);
  border-color: rgba(0, 0, 0, 0.12);
  z-index: 10 !important;
}

.pricing-card.active-plan:hover {
  border-color: rgba(52, 199, 89, 0.45);
  box-shadow: 0 24px 64px rgba(52, 199, 89, 0.1);
}

/* Card entrance animation */
@keyframes cardFadeUp {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.95);
  }
  to {
    opacity: 1;
  }
}

/* ==========================================
   Card Inner Content
   ========================================== */

.card-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  z-index: 1;
}

.plan-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 24px;
}

.plan-icon {
  color: #1d1d1f;
  margin-bottom: 12px;
  display: block;
}

.plan-name {
  font-size: 17px;
  font-weight: 700;
  color: #6e6e73;
  margin: 0 0 8px;
  letter-spacing: -0.2px;
}

.plan-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  color: #1d1d1f;
  width: 100%;
}

.amount {
  font-size: 44px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -2px;
  color: #1d1d1f;
}

.period {
  font-size: 14px;
  color: #8e8e93;
  margin-left: 6px;
  font-weight: 500;
}

.billing-desc {
  font-size: 11px;
  color: #8e8e93;
  margin-top: 6px;
  background: rgba(0, 0, 0, 0.03);
  padding: 3px 10px;
  border-radius: 4px;
  font-weight: 600;
}

/* ==========================================
   Feature List
   ========================================== */

.feature-list {
  list-style: none;
  padding: 0;
  margin: 24px 0 32px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #3a3a3c;
  line-height: 1.5;
  font-weight: 500;
}

.check-icon {
  color: #1d1d1f;
  margin-top: 3px;
  min-width: 15px;
  flex-shrink: 0;
}

/* ==========================================
   Card Footer / Button
   ========================================== */

.card-footer {
  margin-top: auto;
  position: relative;
  z-index: 1;
}

.full-width {
  width: 100%;
}

.action-btn {
  padding: 13px 20px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 100px;
  border: none;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  letter-spacing: 0.2px;
  width: 100%;
}

/* All buttons uniform black — no tier colors */
.btn-primary {
  background: #1d1d1f;
  color: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}

.btn-primary:hover {
  background: #000;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.btn-primary:active {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.btn-success {
  background: #f5f5f7;
  color: #6e6e73;
  cursor: default;
  font-weight: 600;
  box-shadow: none;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.btn-disabled {
  background: #f5f5f7;
  color: #c7c7cc;
  cursor: not-allowed;
  box-shadow: none;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

/* ==========================================
   Toast Notification (Glass)
   ========================================== */

.toast-notification-wrapper {
  position: fixed;
  top: 100px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 10002;
  pointer-events: none;
}

.toast-notification {
  padding: 12px 28px;
  border-radius: 100px;
  color: #1d1d1f;
  font-size: 14px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-16px);
}

/* ==========================================
   Modals (Glass)
   ========================================== */

.glass-modal-clean-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.glass-modal-container {
  width: 100%;
  max-width: 380px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-clean-header {
  padding: 28px 24px 16px;
  text-align: center;
}

.modal-clean-title {
  margin: 0;
  color: #1d1d1f;
  font-size: 20px;
  font-weight: 800;
}

.modal-clean-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.05);
  margin: 0 24px;
}

.modal-clean-body {
  padding: 20px 24px 24px;
}

.modal-clean-message {
  margin: 0;
  color: #6e6e73;
  font-size: 15px;
  line-height: 1.7;
  text-align: center;
}

.highlight-text {
  color: #1d1d1f;
  font-weight: 700;
}

/* Confirm modal */
.confirm-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.confirm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.confirm-label {
  font-size: 14px;
  color: #8e8e93;
  font-weight: 500;
}

.confirm-value {
  font-size: 14px;
  color: #1d1d1f;
  font-weight: 600;
}

.confirm-value.highlight {
  color: #ff375f;
  font-weight: 800;
  font-size: 16px;
}

.confirm-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.05);
  margin: 2px 0;
}

.text-green {
  color: #34c759;
}

.text-red {
  color: #ff3b30;
}

.modal-clean-actions {
  display: flex;
  gap: 8px;
  padding: 0 24px 24px;
}

.modal-clean-btn {
  flex: 1;
  border: none;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-cancel-btn {
  background: rgba(0, 0, 0, 0.04);
  color: #1d1d1f;
}

.modal-cancel-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.modal-confirm-btn {
  background: #1d1d1f;
  color: #fff;
}

.modal-confirm-btn:hover {
  background: #000;
  transform: translateY(-1px);
}

.glass-fade-enter-active,
.glass-fade-leave-active {
  transition: opacity 0.28s ease;
}

.glass-fade-enter-from,
.glass-fade-leave-to {
  opacity: 0;
}

/* ==========================================
   TransitionGroup Animations
   ========================================== */

.card-transition-enter-active {
  animation: fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: calc(var(--card-index, 0) * 0.08s);
}

.card-transition-leave-active {
  animation: zoomOut 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.card-transition-move {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes zoomOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* ==========================================
   Coding Plans Section
   ========================================== */

.coding-section {
  padding: 0 40px 60px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.coding-section-header {
  text-align: center;
  margin-bottom: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.coding-section-icon {
  color: #007aff;
  margin-bottom: 4px;
}

.coding-section-title {
  font-size: 26px;
  font-weight: 800;
  color: #1d1d1f;
  margin: 0;
  letter-spacing: -0.3px;
}

.coding-section-desc {
  font-size: 14px;
  color: #8e8e93;
  margin: 0;
  font-weight: 500;
}

.coding-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.coding-card {
  background: rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  padding: 28px 22px 22px;
  position: relative;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  animation: cardFadeUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  animation-delay: var(--coding-delay, 0s);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.coding-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  pointer-events: none;
}

.coding-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(0, 0, 0, 0.1);
}

.coding-featured {
  background: rgba(0, 122, 255, 0.06);
  border-color: rgba(0, 122, 255, 0.2);
  box-shadow: 0 4px 20px rgba(0, 122, 255, 0.06);
}

.coding-featured:hover {
  border-color: rgba(0, 122, 255, 0.35);
  box-shadow: 0 16px 48px rgba(0, 122, 255, 0.08);
}

.coding-card-badge {
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 3px 12px;
  border-radius: 0 0 8px 8px;
  background: #007aff;
  color: #fff;
  z-index: 2;
}

.coding-active {
  border-color: rgba(52, 199, 89, 0.35);
  box-shadow: 0 4px 20px rgba(52, 199, 89, 0.08);
}

.coding-active::after {
  border-color: rgba(52, 199, 89, 0.1);
}

.coding-card-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  z-index: 1;
}

.coding-card-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 20px;
}

.coding-card-icon {
  color: #007aff;
  margin-bottom: 10px;
}

.coding-card-name {
  font-size: 16px;
  font-weight: 700;
  color: #1d1d1f;
  margin: 0 0 6px;
}

.coding-card-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
}

.coding-amount {
  font-size: 36px;
  font-weight: 800;
  color: #1d1d1f;
  line-height: 1;
  letter-spacing: -1.5px;
}

.coding-period {
  font-size: 13px;
  color: #8e8e93;
  margin-left: 4px;
  font-weight: 500;
}

.coding-feature-list {
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coding-feature-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12.5px;
  color: #3a3a3c;
  line-height: 1.5;
  font-weight: 500;
}

.coding-check {
  color: #007aff;
  margin-top: 3px;
  min-width: 14px;
  flex-shrink: 0;
}

.coding-card-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coding-stack-hint {
  font-size: 10.5px;
  color: #8e8e93;
  text-align: center;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.03);
  padding: 3px 8px;
  border-radius: 4px;
}

.coding-action-btn {
  padding: 11px 16px;
  font-size: 12.5px;
  font-weight: 700;
  border-radius: 100px;
  border: none;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  width: 100%;
  letter-spacing: 0.2px;
}

.coding-btn-primary {
  background: #007aff;
  color: #fff;
  box-shadow: 0 4px 14px rgba(0, 122, 255, 0.2);
}

.coding-btn-primary:hover {
  background: #0056cc;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 122, 255, 0.3);
}

.coding-btn-primary:active {
  transform: translateY(0);
  transition-duration: 0.05s;
}

.coding-btn-success {
  background: #f5f5f7;
  color: #6e6e73;
  cursor: default;
  font-weight: 600;
  box-shadow: none;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.coding-btn-disabled {
  background: #f5f5f7;
  color: #c7c7cc;
  cursor: not-allowed;
  box-shadow: none;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

/* ==========================================
   Responsive
   ========================================== */

/* Fan collapse at smaller desktop */
@media (max-width: 1400px) {
  .pricing-card {
    width: 300px;
    max-width: 300px;
    margin-right: -44px;
  }
  .pricing-card:nth-child(1) { transform: rotate(-3.5deg) translateY(10px); }
  .pricing-card:nth-child(2) { transform: rotate(-1.5deg) translateY(0px); }
  .pricing-card:nth-child(3) { transform: rotate(0deg) translateY(-14px) scale(1.02); }
  .pricing-card:nth-child(4) { transform: rotate(1.5deg) translateY(0px); }
  .pricing-card:nth-child(5) { transform: rotate(3.5deg) translateY(10px); }
}

@media (max-width: 1200px) {
  .pricing-card {
    width: 260px;
    max-width: 260px;
    padding: 28px 22px 20px;
    margin-right: -36px;
  }
  .pricing-card:nth-child(1) { transform: rotate(-3deg) translateY(8px); }
  .pricing-card:nth-child(2) { transform: rotate(-1deg) translateY(0px); }
  .pricing-card:nth-child(3) { transform: rotate(0deg) translateY(-12px) scale(1.02); }
  .pricing-card:nth-child(4) { transform: rotate(1deg) translateY(0px); }
  .pricing-card:nth-child(5) { transform: rotate(3deg) translateY(8px); }
}

/* Collapse fan → 2-column grid */
@media (max-width: 1024px) {
  .pricing-container {
    flex-wrap: wrap;
    gap: 16px;
    padding: 24px 16px;
  }

  .pricing-card {
    width: calc(50% - 8px);
    max-width: none;
    min-width: 240px;
    margin-right: 0;
    border-radius: 20px;
    padding: 26px 20px 20px;
    transform: none !important;
  }

  .pricing-card:nth-child(n) {
    transform: none !important;
  }

  .pricing-card.featured {
    transform: scale(1) !important;
  }

  .pricing-card::after {
    border-radius: 20px;
  }

  .pricing-card:hover {
    transform: translateY(-8px) !important;
  }

  /* Coding 附加包 → 2 列 */
  .coding-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Single column */
@media (max-width: 640px) {
  .header-section {
    margin-top: 16px;
    gap: 16px;
  }

  .page-title {
    font-size: 26px;
  }

  .points-balance-pill .value {
    font-size: 22px;
  }

  .pricing-container {
    padding: 20px 12px;
    gap: 14px;
  }

  .pricing-card {
    width: 100%;
    max-width: 420px;
    padding: 24px 20px 20px;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    transform: none !important;
  }

  .pricing-card:nth-child(n) {
    transform: none !important;
  }

  .pricing-card.featured {
    transform: scale(1) !important;
  }

  .pricing-card.featured::before {
    font-size: 9px;
    padding: 3px 12px;
  }

  .action-btn {
    text-transform: none;
  }

  .amount {
    font-size: 36px;
  }

  /* Coding 附加包 → 单列，收窄留白 */
  .coding-section {
    padding: 0 16px 40px;
  }

  .coding-section-header {
    margin-bottom: 24px;
  }

  .coding-section-title {
    font-size: 22px;
  }

  .coding-section-desc {
    font-size: 13px;
    padding: 0 8px;
  }

  .coding-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .coding-card {
    padding: 24px 20px 20px;
  }

  .coding-card-header {
    margin-bottom: 16px;
  }
}

@media (max-width: 480px) {
  .discount-tag {
    display: none;
  }

  .pricing-card {
    padding: 20px 16px 18px;
  }

  .coding-card {
    padding: 20px 16px 18px;
  }

  .coding-amount {
    font-size: 32px;
  }

  .coding-card-badge {
    font-size: 8px;
    padding: 3px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-transition-enter-active,
  .card-transition-leave-active,
  .card-transition-move {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 100ms !important;
  }
}
</style>
