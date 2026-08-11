<template>
  <div class="subscription-page" :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">
    <UserCenterPageHeader v-if="isFromUserSpace" title="订阅与积分" max-width="1200px" @back="goBack" />

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
import { useRoute, useRouter } from 'vue-router';
import { Bot, Cake, Check, Crown, Gift, Zap, Code, Cloud, Rocket, Star, Cpu } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { getMySubscriptions, subscribeWithPoints } from '@/utils/api/subscription-api.js';
import { clearUserTierCache } from '@/utils/api/api-key-runtime-api.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { logger } from '@/utils/logger.js';

const BILLING_MONTHLY = 'monthly';

const router = useRouter();
const route = useRoute();
const isFromUserSpace = computed(() => String(route.query.from || '').startsWith('userspace'));
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

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
@import './style.scoped.css';

/* ==========================================
   BOH AI Coding 附加包
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

/* Responsive */
@media (max-width: 1200px) {
  .coding-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .coding-section { padding: 0 24px 40px; }
}

@media (max-width: 640px) {
  .coding-grid {
    grid-template-columns: 1fr;
    max-width: 400px;
    margin: 0 auto;
  }
  .coding-section { padding: 0 12px 32px; }
  .coding-section-title { font-size: 22px; }
  .coding-amount { font-size: 30px; }
}
</style>
