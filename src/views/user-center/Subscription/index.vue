<template>
  <div class="subscription-page">
    <UserCenterPageHeader title="订阅与积分" @back="goBack" />

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
import { Bot, Cake, Check, Crown, Gift, Zap } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { getMySubscriptions, subscribeWithPoints } from '@/utils/api/subscription-api.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { logger } from '@/utils/logger.js';

const BILLING_MONTHLY = 'monthly';

const router = useRouter();
const route = useRoute();
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
    features: ['生日当天专属祝福', '神秘生日礼物', '社区徽章', 'BOH AI 100次/天', 'Cloud+ 150张', '实验室 PPT/Word 10次/月'],
    featured: false,
    alwaysActive: true
  },
  {
    id: 2,
    code: 'plus',
    name: 'Plus',
    icon: Bot,
    monthlyCost: 8,
    features: ['BOH AI 200次/天', 'Cloud+ 300张', '礼物定制月×1次', '多模态交互', '实验室 PPT/Word 15次/月'],
    featured: true
  },
  {
    id: 3,
    code: 'pro',
    name: 'Pro',
    icon: Zap,
    monthlyCost: 20,
    features: ['BOH AI 300次/天', 'Cloud+ 450张', '礼物定制月×2次', '多模态交互', '金色昵称', '实验室 PPT/Word 20次/月'],
    featured: false
  },
  {
    id: 4,
    code: 'max',
    name: 'Max',
    icon: Gift,
    monthlyCost: 40,
    features: ['BOH AI 500次/天', 'Cloud+ 900张', '礼物定制月×4次', 'Agent & Plan', '金色昵称', '实验室 PPT/Word 30次/月'],
    featured: false
  },
  {
    id: 5,
    code: 'ultra',
    name: 'Ultra',
    icon: Crown,
    monthlyCost: 70,
    features: ['BOH AI 不限次数', 'Cloud+ 1200张', '礼物定制月×8次', 'Agent & Plan', '彩虹昵称', '实验室 PPT/Word 不限次数'],
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
</style>
