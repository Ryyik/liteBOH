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
        <div class="toggle-wrapper" @click="billingCycle = 'monthly'">
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

    <!-- Pricing Cards Container -->
    <div class="music-stave-container">
      <div class="music-lines"></div>

      <!-- Floating Notes Decoration -->
      <div class="floating-note note-1">♪</div>
      <div class="floating-note note-2">♫</div>
      <div class="floating-note note-3">♩</div>
      <div class="floating-note note-4">♬</div>
      <div class="floating-note note-5">𝄞</div>

      <div class="pricing-container">
        <div v-for="(plan, index) in plans" :key="plan.code" class="pricing-card"
          :class="{ 'featured': plan.featured, 'active-plan': plan.status === 'active' }"
          :style="{ '--delay': index * 0.1 + 's' }">
          <div class="card-content">
            <div class="plan-header">
              <div class="icon-wrapper">
                <component :is="plan.icon" class="plan-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
              </div>
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

            <div class="divider"></div>

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
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bot, Cake, Check, Crown, Gift, Zap } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { getMySubscriptions, subscribeWithPoints } from '@/utils/api/subscription-api.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';

const BILLING_MONTHLY = 'monthly';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { userInfo } = authStore;

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

const BASE_PLANS = [
  {
    id: 1,
    code: 'birthday-party',
    name: '方块生日会',
    icon: Cake,
    monthlyCost: 0,
    features: ['生日当天专属祝福', '神秘生日礼物', '社区徽章', '免费加入'],
    featured: false,
    alwaysActive: true
  },
  {
    id: 2,
    code: 'gift-custom',
    name: '礼物定制',
    icon: Gift,
    monthlyCost: 30,
    features: ['根据提示词定制周边', '专属设计服务', '优先发货', '精美包装'],
    featured: false
  },
  {
    id: 3,
    code: 'boh-ai-plus',
    name: 'BOH Plus',
    icon: Bot,
    monthlyCost: 120,
    features: ['BOH AI 全部功能', '高速响应优先队列', '多模态交互', '无限对话轮次', 'Cloud+ 300 张图片额度'],
    featured: true
  },
  {
    id: 4,
    code: 'boh-pro',
    name: 'BOH Pro',
    icon: Zap,
    monthlyCost: 180,
    features: ['包含 BOH Plus 全部权益', '高级地图服务', 'AI Ultra 模式', '每月礼物定制额度', 'Cloud+ 500 张图片额度'],
    featured: false
  },
  {
    id: 5,
    code: 'boh-max',
    name: 'BOH Max',
    icon: Crown,
    monthlyCost: 280,
    features: ['包含 Pro 所有权益', '活动定制服务', '专属AI定制', '全套生态服务', 'Cloud+ 800 张图片额度'],
    featured: false
  }
];

const billingCycle = ref(BILLING_MONTHLY);
const showToast = ref(false);
const toastMessage = ref('');
const showModal = ref(false);
const currentService = ref(null);
const currentPoints = ref(0);
const isSubmitting = ref(false);
const isLoadingSubscriptions = ref(false);
const subscriptions = ref([]);
const activeSubscriptions = ref({});
let toastTimer = null;

watch(() => userInfo.points, (newPoints) => {
  currentPoints.value = Number(newPoints || 0);
}, { immediate: true });

watch(() => userInfo.id, () => {
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
  if (!userInfo.id) {
    subscriptions.value = [];
    activeSubscriptions.value = {};
    return;
  }

  isLoadingSubscriptions.value = true;
  const { ok, data, error } = await getMySubscriptions(userInfo.id, { includeExpired: true });
  isLoadingSubscriptions.value = false;

  if (!ok) {
    subscriptions.value = [];
    activeSubscriptions.value = {};
    console.error('加载订阅记录失败:', error);
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

  if (!authStore.isLoggedIn || !userInfo.id) {
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

  const cycleText = billingCycle.value === BILLING_MONTHLY ? '月付' : '年付';
  const remaining = currentPoints.value - price;
  const confirmSub = confirm(
    `确认消耗 ${price} 积分订阅“${plan.name}”(${cycleText})吗？\n当前积分：${currentPoints.value}\n订阅后剩余：${remaining}`
  );
  if (!confirmSub) {
    return;
  }

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
        userInfo.points = latestPoints;
        openInsufficientModal(plan);
        return;
      }

      showToastMessage('订阅失败，请稍后重试');
      return;
    }

    const latestPoints = Number(data.currentPoints || 0);
    currentPoints.value = latestPoints;
    userInfo.points = latestPoints;

    await loadMySubscriptions();

    const expiresText = data.expiresAt ? `，有效期至 ${formatDateText(data.expiresAt)}` : '';
    showToastMessage(`订阅成功！已开通 ${plan.name}${expiresText}`);
  } catch (error) {
    console.error('订阅失败:', error);
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
</script>
<style scoped>
@import './style.scoped.css';
</style>
