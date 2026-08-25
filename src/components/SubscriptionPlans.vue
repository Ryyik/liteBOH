<template>
  <main class="apple-pricing">
    <!-- 精简 Hero -->
    <section class="hero">
      <h1 class="hero-title">最完整的 BOH，<br />一个计划全都拥有。</h1>
      <p class="hero-sub">一个订阅计划融合更快的模型、更高并发与更大的创作空间。选一个档位，即享 BOH AI 的完整体验。</p>
      <a class="hero-cta" href="#plans" @click.prevent="scrollToPlans">查看订阅计划</a>
    </section>

    <!-- 权益服务卡介绍 -->
    <section class="intro" aria-label="BOH 订阅包含的权益服务">
      <div class="section-head">
        <h2 class="section-title">一个计划，多项权益。</h2>
        <p class="section-sub">BOH 订阅不是一个单一的会员，而是一整套创作与思考服务的合集。</p>
      </div>
      <div class="intro-grid">
        <figure class="intro-card"><div class="intro-icon" aria-hidden="true"><Zap :size="20" /></div><h3>更快模型与 Token</h3><p>解锁更快、更强的 AI 模型与每日 Token 额度，交流与创作效率大幅提升。</p></figure>
        <figure class="intro-card"><div class="intro-icon" aria-hidden="true"><Cloud :size="20" /></div><h3>Cloud+ 存储空间</h3><p>扩充云端存储，文档、PPT、Word 与素材随取随用，再多创作也装得下。</p></figure>
        <figure class="intro-card"><div class="intro-icon" aria-hidden="true"><Bot :size="20" /></div><h3>Agent 任务并行</h3><p>支持多个并行 Agent 工作在后台同步推进，复杂任务一次完成不再等待。</p></figure>
        <figure class="intro-card"><div class="intro-icon" aria-hidden="true"><FileText :size="20" /></div><h3>实验室 PPT / Word</h3><p>一键生成文档与演示，产出次数随档位升级，研究汇报十指飞首页。</p></figure>
        <figure class="intro-card"><div class="intro-icon" aria-hidden="true"><Eye :size="20" /></div><h3>多模态交互</h3><p>融合视觉与语音的多模态能力，让交流更自然，想法落地更直观。</p></figure>
        <figure class="intro-card"><div class="intro-icon" aria-hidden="true"><Gift :size="20" /></div><h3>会员尊享与抽奖</h3><p>专属昵称效果与抽奖保底累计，让每一次使用都更有归属感。</p></figure>
      </div>
    </section>

    <!-- 价格卡片：多行列对称网格 -->
    <section id="plans" class="cards-wrap" aria-label="会员套餐">
      <div class="cards-toolbar">
        <div class="billing-switch" role="tablist" aria-label="计费周期">
          <button v-for="tab in billingTabs" :key="tab.value" :class="{ active: billingCycle === tab.value }" @click="handleTabClick(tab)">{{ tab.label }}<em v-if="tab.discount">{{ tab.discount }}</em></button>
        </div>
        <div v-if="highestActivePlan" class="active-chip" :class="{ 'is-trial': topIsTrial }">{{ topIsTrial ? '试用中' : '当前订阅' }}：{{ highestActivePlan.name }} · 至 {{ formatDateText(highestActivePlan.expiresAt) }}</div>
        <div class="points-row"><span>当前积分</span><strong>{{ currentPoints }}</strong><span>积分</span></div>
      </div>
      <div v-if="canShowTrial" class="trial-banner">
        <div class="trial-banner-text">
          <strong>免费试用 Pro 3 天</strong>
          <span>完整体验 BOH AI Pro 档权益，每个账号限一次，无需付积分。</span>
        </div>
        <button class="trial-button" type="button" :disabled="isSubmitting || isLoadingSubscriptions" @click="handleStartTrial">{{ isSubmitting ? '开启中…' : '免费试用' }}</button>
      </div>
      <div v-else-if="isTrialing" class="trial-banner trialing">
        <div class="trial-banner-text">
          <strong>正在试用 Pro（剩余 {{ trialRemainingDays }} 天）</strong>
          <span>试用权益已生效，升级正式版可享更长有效期与完整服务。</span>
        </div>
        <button class="trial-button ghost" type="button" :disabled="isSubmitting || isLoadingSubscriptions" @click="handleTrialUpgrade">升级正式版</button>
      </div>
      <div class="cards" aria-label="会员套餐">
      <article v-for="plan in paidPlans" :key="plan.code" class="plan-card" :class="{ featured: plan.featured }">
        <span v-if="plan.featured" class="recommended">最受欢迎</span>
        <div class="plan-head"><h2>{{ plan.name }}</h2><p>{{ resolvePlanPosition(plan.code) }}</p></div>
        <div class="price"><span class="price-cny">￥</span><strong>{{ calculatePrice(plan) }}</strong><span class="price-per">/ {{ billingCycle === BILLING_YEARLY ? '年' : '月' }}</span><span v-if="plan.monthlyCost && billingCycle === BILLING_YEARLY" class="save-badge">省 {{ plan.monthlyCost * 2 }} 积分</span></div>
        <p class="price-note" v-if="plan.monthlyCost && billingCycle === BILLING_YEARLY">相当于 ￥{{ Math.round(calculatePrice(plan) / 12) }} / 月 · 年付日均更划算</p>
        <button class="subscribe" :class="{ active: plan.status === 'active', ghost: plan.status === 'blocked' }" :disabled="plan.status === 'active' || plan.status === 'blocked' || isSubmitting || isLoadingSubscriptions" @click="handleSubscribe(plan)">{{ getButtonText(plan) }}</button>
        <ul class="benefits"><li v-for="item in plan.features" :key="item"><span class="tick" aria-hidden="true"><Check :size="13" /></span>{{ item }}</li></ul>
      </article>
      </div>
    </section>

    <!-- 对比表 -->
    <section class="comparison" aria-labelledby="comparison-title">
      <h2 id="comparison-title" class="section-title">哪个计划更适合你</h2>
      <p class="section-sub">按你的使用频率选择方案，再用权益表做最后确认。</p>
      <div class="table-scroll"><table><thead><tr><th>订阅计划</th><th v-for="plan in displayPlans" :key="plan.code"><span>{{ plan.name }}</span><strong>{{ calculatePrice(plan) }}<small> / {{ billingCycle === BILLING_YEARLY ? '年' : '月' }}</small></strong></th></tr></thead><tbody><tr v-for="row in comparisonRows" :key="row.label"><th>{{ row.label }}</th><td v-for="plan in displayPlans" :key="plan.code + row.label"><span v-if="row.values[plan.code] === true" class="mono-check"><Check :size="14" /></span><span v-else class="mono-mark">{{ row.values[plan.code] === false ? '—' : row.values[plan.code] }}</span></td></tr></tbody></table></div>
    </section>

    <!-- FAQ -->
    <section class="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" class="section-title">常见问题</h2>
      <div class="faq-list">
        <div v-for="(item, index) in faqList" :key="item.q" class="faq-item" :class="{ open: openFaqIndex === index }">
          <button @click="toggleFaq(index)"><span>{{ item.q }}</span><ChevronDown :size="16" /></button>
          <div v-if="openFaqIndex === index" class="answer"><p v-for="paragraph in item.a" :key="paragraph">{{ paragraph }}</p></div>
        </div>
      </div>
    </section>

    <footer class="apple-footer"><p>支付即表示您已阅读并同意《BOH 订阅服务协议》与《隐私政策》</p></footer>

    <Transition name="modal">
      <div v-if="showModal || showConfirmModal" class="modal-overlay" @click="closeAllModals">
        <section class="payment-sheet" role="dialog" aria-modal="true" @click.stop>
          <button class="close-button" type="button" aria-label="关闭" @click="closeAllModals"><X :size="19" /></button>
          <p class="section-kicker">BOH SUBSCRIPTION</p>

          <div class="payment-card-wrap">
            <PointsCard
              :points="currentPoints"
              :username="userInfo?.username || '未命名用户'"
              tier-label="BOH"
              :skin="userInfo?.pointsCardSkin || 'blank'"
              :image-url="userInfo?.pointsCardImageUrl || ''"
              compact
            />
          </div>

          <template v-if="showConfirmModal">
            <h2>确认订阅</h2>
            <p class="sheet-desc">请确认你选择的订阅计划与计费周期，确认后将扣除对应积分。</p>
          </template>
          <template v-else>
            <h2>积分不足</h2>
            <p class="sheet-desc">当前积分不足以{{ currentService?.status === 'upgradable' ? '升级至' : '订阅' }} {{ currentService?.name }}，请先补充积分后再试。</p>
          </template>

          <div v-if="showConfirmModal" class="summary-list">
            <div class="summary-row"><span>订阅计划</span><strong>{{ confirmPlan?.name }} · {{ resolvePlanPosition(confirmPlan?.code || '') }}</strong></div>
            <div class="summary-row"><span>计费时长</span><strong>{{ billingCycle === BILLING_YEARLY ? '单年 (12 个月)' : '单月' }}</strong></div>
            <template v-if="confirmPlanPreview">
              <div class="summary-row"><span>当前订阅抵扣</span><strong>−{{ confirmPlanPreview.credit }} 积分（剩余 {{ confirmPlanPreview.remainingDays }} 天）</strong></div>
            </template>
            <div v-else-if="confirmPlan?.status === 'renew'" class="summary-row"><span>生效方式</span><strong>当前订阅到期后顺延</strong></div>
            <div class="summary-row accent"><span>需扣除积分</span><strong>{{ confirmDue }} 积分</strong></div>
          </div>
          <div v-else class="summary-list">
            <div class="summary-row"><span>当前积分</span><strong>{{ currentPoints }} 积分</strong></div>
            <div class="summary-row"><span>所需积分</span><strong>{{ requiredCostFor(currentService) }} 积分</strong></div>
            <div class="summary-row accent shortage"><span>积分差额</span><strong>{{ Math.max(0, requiredCostFor(currentService) - currentPoints) }} 积分</strong></div>
          </div>

          <button v-if="showConfirmModal" class="checkout-button" type="button" @click="confirmSubscribe">确认订阅</button>
          <button v-else class="checkout-button" type="button" @click="closeAllModals">我知道了</button>
        </section>
      </div>
    </Transition>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Check, ChevronDown, X, Zap, Cloud, Bot, FileText, Eye, Gift } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { getMySubscriptions, subscribeWithPoints, startSubscriptionTrial } from '@/utils/api/subscription-api.js';
import { clearUserTierCache } from '@/utils/api/api-key-runtime-api.js';
import { showGlobalNavStatus } from '@/composables/useGlobalNavStatus.js';
import PointsCard from '@/views/user-center/UserSpace/components/PointsCard.vue';
import { logger } from '@/utils/logger.js';

const BILLING_MONTHLY = 'monthly';
const BILLING_YEARLY = 'yearly';
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);
const billingCycle = ref(BILLING_MONTHLY);
const currentPoints = ref(0);
const subscriptions = ref([]);
const activeSubscriptions = ref({});
const isSubmitting = ref(false);
const isLoadingSubscriptions = ref(false);
const showModal = ref(false);
const showConfirmModal = ref(false);
const currentService = ref(null);
const confirmPlan = ref(null);
const openFaqIndex = ref(0);

const plans = [
  { code: 'free', name: 'Free', monthlyCost: 0, featured: false, alwaysActive: true, position: '日常使用', features: ['BOH AI 20 万 Token / 天', 'Cloud+ 150 张', '实验室 PPT / Word 10 次 / 月', '可参与抽奖'] },
  { code: 'plus', name: 'Plus', monthlyCost: 8, featured: false, position: '效率升级', features: ['BOH AI 80 万 Token / 天', 'Cloud+ 300 张', '多模态交互', '实验室 PPT / Word 15 次 / 月', '抽奖保底累计 24 次（门槛较高）'] },
  { code: 'pro', name: 'Pro', monthlyCost: 20, featured: true, position: '专业创作', features: ['BOH AI 200 万 Token / 天', 'Cloud+ 450 张', '多模态交互', '金色昵称', '实验室 PPT / Word 20 次 / 月', '抽奖保底累计 18 次（门槛中等）'] },
  { code: 'max', name: 'Max', monthlyCost: 40, featured: false, position: '全能尊享', features: ['BOH AI 500 万 Token / 天', 'Cloud+ 900 张', 'Agent & Plan', '金色昵称', '实验室 PPT / Word 30 次 / 月', '抽奖保底累计 12 次（门槛较低）'] },
  { code: 'ultra', name: 'Ultra', monthlyCost: 70, featured: false, position: '研究级无限', features: ['BOH AI 1000 万 Token / 天', 'Cloud+ 1200 张', 'Agent & Plan', '彩虹昵称', '实验室 PPT / Word 不限次数', '抽奖保底累计 8 次（门槛最低·最易保底）'] }
];
const TIER_RANK = { free: 0, plus: 1, pro: 2, max: 3, ultra: 4 };
const paidPlans = computed(() => plans.slice(1).map(withStatus));
const currentTopTierCode = computed(() => {
  const active = Object.values(activeSubscriptions.value).filter((s) => s?.planCode && TIER_RANK[s.planCode] !== undefined);
  if (!active.length) return '';
  return active.reduce((top, sub) => (TIER_RANK[sub.planCode] > TIER_RANK[top] ? sub.planCode : top), active[0].planCode);
});
const withStatus = (plan) => {
  if (plan.alwaysActive) return { ...plan, status: 'active', activeSubscription: null };
  const top = currentTopTierCode.value;
  const topRank = TIER_RANK[top] ?? -1;
  const rank = TIER_RANK[plan.code] ?? -1;
  const activeSubscription = activeSubscriptions.value[plan.code];
  if (top && rank < topRank) return { ...plan, status: 'blocked', activeSubscription };
  if (activeSubscription) {
    if (activeSubscription.status === 'trial') return { ...plan, status: 'convert', activeSubscription };
    return { ...plan, status: 'renew', activeSubscription };
  }
  if (top && rank > topRank) return { ...plan, status: 'upgradable', activeSubscription };
  return { ...plan, status: 'purchasable', activeSubscription };
};
const displayPlans = computed(() => plans.map(withStatus));
const billingTabs = [{ value: BILLING_MONTHLY, label: '单月' }, { value: BILLING_YEARLY, label: '单年', discount: '省 17%' }];
const comparisonRows = [
  { label: 'BOH AI Token / 天', values: { free: '20 万', plus: '80 万', pro: '200 万', max: '500 万', ultra: '1000 万' } },
  { label: 'Agent 任务并行', values: { free: '1 个任务', plus: '1 个任务', pro: '2 个任务', max: '4 个任务', ultra: '8 个任务' } },
  { label: 'Cloud+ 存储空间', values: { free: '150 张', plus: '300 张', pro: '450 张', max: '900 张', ultra: '1200 张' } },
  { label: '多模态交互', values: { free: false, plus: true, pro: true, max: true, ultra: true } },
  { label: 'Agent & Plan 工作流', values: { free: false, plus: false, pro: false, max: true, ultra: true } },
  { label: '实验室 PPT / Word', values: { free: '10 次 / 月', plus: '15 次 / 月', pro: '20 次 / 月', max: '30 次 / 月', ultra: '不限次数' } },
  { label: '定制化看板', values: { free: true, plus: true, pro: true, max: true, ultra: true } },
  { label: '年度会员纪念徽章', values: { free: false, plus: true, pro: true, max: true, ultra: true } },
  { label: '客服优先级', values: { free: '普通', plus: '普通', pro: '普通', max: '优先', ultra: '最高优先级' } }
];
const faqList = [
  { q: '如何升级会员计划？', a: ['选择比当前更高级别的计划并点击"升级"，升级立即生效；已购订阅会按剩余天数折算成积分抵扣升级差额，不会浪费。'] },
  { q: '订阅快到期了怎么续费？', a: ['在订阅页选择你当前的档位并点击"续费"，新周期会在当前订阅到期后自动顺延，无需等待到期重买。'] },
  { q: '会员权益有效期多久？', a: ['单月订阅自开通日起 30 天有效；单年订阅自开通日起 365 天有效。'] },
  { q: '积分不够怎么办？', a: ['完成每日签到、参与社区活动或邀请好友注册，可获得额外积分奖励。'] },
  { q: '可以免费试用吗？', a: ['新用户可免费试用 Pro 3 天，每个账号限一次，无需消耗积分。试用期间享受 Pro 完整权益，到期前可随时升级为正式会员，升级后权益立即生效、无需等待试用结束。'] }
];

const resolvePlanPosition = (code) => plans.find((p) => p.code === code)?.position || '';
const calculatePrice = (plan) => !plan ? 0 : (billingCycle.value === BILLING_YEARLY ? plan.monthlyCost * 10 : plan.monthlyCost);
const formatDateText = (value) => value ? new Intl.DateTimeFormat('zh-CN').format(new Date(value)) : '--';
const getButtonText = (plan) => ({
  active: '正在生效',
  renew: '续费',
  convert: '升级正式版',
  upgradable: '升级',
  blocked: '已是更高级会员',
  purchasable: plan.monthlyCost ? '立即订阅' : '免费加入'
}[plan.status] || '立即订阅');
const buildUpgradePreview = (plan, fullCost) => {
  if (!plan || plan.status !== 'upgradable') return null;
  const active = Object.values(activeSubscriptions.value).filter((s) => s?.planCode && TIER_RANK[s.planCode] !== undefined);
  if (!active.length) return null;
  const top = active.reduce((a, b) => (TIER_RANK[b.planCode] > TIER_RANK[a.planCode] ? b : a));
  const expiresAt = Date.parse(top.expiresAt || '');
  if (!Number.isFinite(expiresAt)) return null;
  const remainingDays = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000));
  const totalDays = (top.durationMonths || 1) * 30;
  const daily = (Number(top.pointsCost) || 0) / totalDays;
  const credit = Math.round(daily * remainingDays);
  const due = Math.max(0, Number(fullCost || 0) - credit);
  return { credit, due, remainingDays, previousPlanCode: top.planCode };
};
const requiredCostFor = (plan) => {
  if (!plan) return 0;
  const full = calculatePrice(plan);
  const preview = buildUpgradePreview(plan, full);
  return preview ? preview.due : full;
};
const confirmPlanPreview = computed(() => {
  if (!confirmPlan.value) return null;
  return buildUpgradePreview(confirmPlan.value, calculatePrice(confirmPlan.value));
});
const confirmDue = computed(() => {
  if (!confirmPlan.value) return 0;
  const full = calculatePrice(confirmPlan.value);
  const preview = confirmPlanPreview.value;
  return preview ? preview.due : full;
});
const notify = (title, message = '', icon = 'success') => { showGlobalNavStatus({ title, message, icon, durationMs: 2800 }); };
const handleTabClick = (tab) => { billingCycle.value = tab.value; };
const toggleFaq = (index) => { openFaqIndex.value = openFaqIndex.value === index ? null : index; };
const scrollToPlans = () => { document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

watch(() => userInfo.value?.points, (value) => { currentPoints.value = Number(value || 0); }, { immediate: true });
watch(() => userInfo.value?.id, () => { void loadMySubscriptions(); }, { immediate: true });
function buildActiveSubscriptionMap(list) { const now = Date.now(); activeSubscriptions.value = Object.fromEntries((list || []).filter((item) => (item?.status === 'active' || item?.status === 'trial') && item.planCode && Date.parse(item.expiresAt || '') > now).map((item) => [item.planCode, item])); }
async function loadMySubscriptions() { if (!userInfo.value?.id) { activeSubscriptions.value = {}; return; } isLoadingSubscriptions.value = true; const result = await getMySubscriptions(userInfo.value.id, { includeExpired: true }); isLoadingSubscriptions.value = false; if (!result.ok) { logger.error('subscription', '加载订阅记录失败:', result.error); return; } subscriptions.value = Array.isArray(result.data) ? result.data : []; buildActiveSubscriptionMap(subscriptions.value); }
const highestActivePlan = computed(() => { const active = Object.values(activeSubscriptions.value); if (!active.length) return null; const current = active.sort((a, b) => plans.findIndex((p) => p.code === b.planCode) - plans.findIndex((p) => p.code === a.planCode))[0]; return { ...current, name: plans.find((p) => p.code === current.planCode)?.name || current.planCode }; });
const topIsTrial = computed(() => highestActivePlan.value?.status === 'trial');

// 试用状态：trial 记录（有效中） / 是否曾领取过 / 是否可展示试用入口
const trialSubscription = computed(() => {
  const now = Date.now();
  return (subscriptions.value || []).find((s) => s?.status === 'trial' && s.planCode && Date.parse(s.expiresAt || '') > now) || null;
});
const isTrialing = computed(() => !!trialSubscription.value);
const trialEverUsed = computed(() => (subscriptions.value || []).some((s) => s?.metadata && s.metadata.source === 'trial'));
const canShowTrial = computed(() => !currentTopTierCode.value && !isTrialing.value && !trialEverUsed.value);
const trialRemainingDays = computed(() => {
  if (!trialSubscription.value) return 0;
  const expires = Date.parse(trialSubscription.value.expiresAt || '');
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.ceil((expires - Date.now()) / 86400000));
});
const proPlan = computed(() => plans.find((p) => p.code === 'pro') || null);

const handleStartTrial = async () => {
  if (isSubmitting.value || isLoadingSubscriptions.value) return;
  if (!authStore.isLoggedIn || !userInfo.value?.id) { notify('请先登录后再开启试用', '', 'warning'); authStore.showLoginModal = true; return; }
  isSubmitting.value = true;
  try {
    const result = await startSubscriptionTrial({ planCode: 'pro', durationDays: 3, metadata: { source: 'user-center/subscription' } });
    if (!result.ok) {
      const msg = result.error?.message || result.data?.message || '请稍后重试';
      notify('开启试用失败', msg, 'warning');
      return;
    }
    await loadMySubscriptions();
    clearUserTierCache().catch(() => undefined);
    notify('试用已开启！Pro 权益已生效，有效期 3 天', '', 'success');
  } catch (error) {
    logger.error('subscription', '开启试用失败:', error);
    notify('开启试用失败', '请稍后重试', 'warning');
  } finally {
    isSubmitting.value = false;
  }
};
const handleTrialUpgrade = () => {
  const plan = proPlan.value;
  if (plan) handleSubscribe(plan);
};
const handleSubscribe = async (plan) => {
  if (plan.status === 'active' || plan.status === 'blocked' || isSubmitting.value || isLoadingSubscriptions.value) return;
  if (!authStore.isLoggedIn || !userInfo.value?.id) { notify('请先登录后再订阅', '', 'warning'); authStore.showLoginModal = true; return; }
  if (!plan.monthlyCost) { notify('免费权益无需扣除积分', '', 'success'); return; }
  if (currentPoints.value < requiredCostFor(plan)) { currentService.value = plan; showModal.value = true; return; }
  confirmPlan.value = plan; showConfirmModal.value = true;
};
const confirmSubscribe = async () => {
  const plan = confirmPlan.value;
  if (!plan) return;
  showConfirmModal.value = false;
  isSubmitting.value = true;
  currentService.value = plan;
  const price = calculatePrice(plan);
  try {
    const result = await subscribeWithPoints({
      planCode: plan.code,
      planName: plan.name,
      billingCycle: billingCycle.value,
      pointsCost: price,
      durationMonths: billingCycle.value === BILLING_YEARLY ? 12 : 1,
      metadata: { source: 'user-center/subscription', action: plan.status }
    });
    if (!result.ok) {
      notify('订阅失败', result.error?.message || result.data?.message || '请稍后重试', 'warning');
      return;
    }
    const deducted = Number(result.data?.pointsDeducted ?? price);
    const points = Number(result.data?.currentPoints ?? currentPoints.value - deducted);
    currentPoints.value = points;
    authStore.$patch({ userInfo: { ...authStore.userInfo, points } });
    await loadMySubscriptions();
    clearUserTierCache().catch(() => undefined);
    const action = result.data?.action || plan.status;
    const credit = Number(result.data?.creditApplied || 0);
    if (action === 'upgrade') {
      notify(`已升级至 ${plan.name}`, credit > 0 ? `当前订阅抵扣 ${credit} 积分` : '', 'success');
    } else if (action === 'renew') {
      notify(`续费成功！${plan.name} 将在当前订阅到期后顺延生效`, '', 'success');
    } else if (action === 'convert') {
      notify(`试用已转为正式会员！${plan.name} 权益立即生效`, '', 'success');
    } else {
      notify(`订阅成功！已开通 ${plan.name}`, '', 'success');
    }
  } catch (error) {
    logger.error('subscription', '订阅失败:', error);
    notify('订阅失败', '请稍后重试', 'warning');
  } finally {
    isSubmitting.value = false;
    currentService.value = null;
    confirmPlan.value = null;
  }
};
const closeAllModals = () => { showModal.value = false; showConfirmModal.value = false; confirmPlan.value = null; };
</script>

<style scoped>
:global(body) { background: #f5f5f7; }
.apple-pricing {
  --ink: #1d1d1f;
  --muted: #6e6e73;
  --subtle: #86868b;
  --accent-blue: #0071e3;
  --glass-bg: rgba(255, 255, 255, .62);
  --glass-border: 1px solid rgba(255, 255, 255, .6);
  --glass-blur: blur(30px) saturate(180%);
  width: 100%; min-height: 100vh; box-sizing: border-box;
  background: #f5f5f7;
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
  padding-top: 88px; position: relative; overflow-x: hidden;
}
.hero, .intro, .cards-wrap, .comparison, .faq { width: min(1160px, calc(100% - 96px)); margin-left: auto; margin-right: auto; position: relative; z-index: 1; }

/* Hero —— 精简，只留标题 + 副标 + CTA */
.hero { padding: 104px 0 40px; text-align: center; }
.hero-title { margin: 0; font-size: clamp(44px, 6vw, 68px); line-height: 1.06; font-weight: 700; letter-spacing: -0.025em; }
.hero-sub { margin: 22px auto 0; max-width: 620px; color: var(--muted); font-size: 20px; line-height: 1.6; }
.hero-cta { display: inline-block; margin-top: 28px; padding: 14px 34px; border-radius: 980px; background: #000; color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; transition: background .2s, transform .15s, box-shadow .2s; box-shadow: 0 8px 24px rgba(0,0,0,.22); }
.hero-cta:hover { background: #1d1d1f; transform: translateY(-1px); box-shadow: 0 12px 30px rgba(0,0,0,.26); }
.hero-cta:active { transform: scale(0.98); }

/* 权益服务卡介绍 */
.intro { padding: 24px 0 8px; }
.section-head { text-align: left; margin-bottom: 40px; }
.section-title { margin: 0; font-size: 44px; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
.section-sub { margin: 14px 0 0; color: var(--muted); font-size: 18px; }
.intro .section-sub { max-width: 620px; }
.intro-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.intro-card { margin: 0; background: var(--glass-bg); border: var(--glass-border); border-radius: 18px; padding: 34px 30px; box-shadow: 0 8px 30px rgba(0,0,0,.06); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); transition: transform .25s ease, box-shadow .25s ease, background .25s ease; }
.intro-card:hover { transform: translateY(-4px); box-shadow: 0 16px 42px rgba(0,0,0,.10); background: rgba(255,255,255,.72); }
.intro-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: var(--accent-blue); background: rgba(0,113,227,.12); margin-bottom: 18px; box-shadow: 0 4px 12px rgba(0,113,227,.12) inset; }
.intro-card h3 { margin: 0 0 8px; font-size: 19px; font-weight: 600; }
.intro-card p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.6; }

/* 价格卡片：多行列对称网格 */
.cards-wrap { padding-top: 64px; scroll-margin-top: 88px; }
.cards-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 26px; padding: 12px 18px; background: var(--glass-bg); border: var(--glass-border); border-radius: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.06); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }
.billing-switch { display: inline-flex; padding: 5px; background: rgba(0,0,0,.07); border: 1px solid rgba(255,255,255,.45); border-radius: 980px; }
.billing-switch button { border: 0; background: transparent; color: var(--muted); border-radius: 980px; padding: 11px 26px; font-size: 15px; transition: all .25s; cursor: pointer; }
.billing-switch button.active { background: #000; color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.18); }
.billing-switch em { color: rgba(0,113,227,.95); font-style: normal; margin-left: 6px; font-size: 13px; }
.active-chip { color: #1d1d1f; font-size: 13px; font-weight: 500; }
.active-chip.is-trial { color: #0071e3; font-weight: 600; }

/* 试用引导横幅 */
.trial-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; padding: 18px 22px; border-radius: 18px; background: linear-gradient(120deg, rgba(0,113,227,.10), rgba(0,113,227,.04)); border: 1px solid rgba(0,113,227,.28); box-shadow: 0 8px 30px rgba(0,113,227,.08); }
.trial-banner.trialing { background: rgba(255,255,255,.7); border-color: rgba(0,113,227,.35); }
.trial-banner-text { display: flex; flex-direction: column; gap: 4px; }
.trial-banner-text strong { font-size: 16px; font-weight: 700; color: #1d1d1f; letter-spacing: -0.01em; }
.trial-banner-text span { font-size: 13px; color: var(--muted); line-height: 1.5; }
.trial-button { flex: none; border: 0; border-radius: 980px; background: #0071e3; color: #fff; padding: 13px 30px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .2s, transform .1s, box-shadow .2s; box-shadow: 0 8px 20px rgba(0,113,227,.28); }
.trial-button:hover { background: #0077ed; box-shadow: 0 10px 26px rgba(0,113,227,.34); }
.trial-button:active { transform: scale(0.98); }
.trial-button.ghost { background: #1d1d1f; box-shadow: 0 8px 20px rgba(0,0,0,.18); }
.trial-button.ghost:hover { background: #2a2a2c; }
.trial-button:disabled { opacity: .7; cursor: default; }
@media (max-width: 620px) {
  .trial-banner { flex-direction: column; align-items: stretch; text-align: center; }
  .trial-button { width: 100%; }
}
.points-row { display: inline-flex; align-items: baseline; gap: 8px; color: var(--muted); font-size: 14px; }
.points-row strong { color: var(--ink); font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; align-items: stretch; }
.plan-card { background: var(--glass-bg); border: var(--glass-border); border-radius: 20px; padding: 32px 28px 26px; display: flex; flex-direction: column; box-shadow: 0 8px 30px rgba(0,0,0,.06); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); position: relative; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease, background .25s ease; }
.plan-card:hover { transform: translateY(-5px); box-shadow: 0 16px 44px rgba(0,0,0,.11); background: rgba(255,255,255,.72); }
.plan-card.featured { box-shadow: 0 14px 40px rgba(0,0,0,.12); background: rgba(255,255,255,.72); }
.recommended { position: absolute; top: 18px; right: 18px; background: #000; color: #fff; border-radius: 980px; padding: 5px 14px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,.22); }
.plan-head h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.plan-head p { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
.price { display: flex; align-items: baseline; gap: 3px; margin-top: 30px; }
.price-cny { color: var(--ink); font-size: 20px; font-weight: 600; }
.price strong { font-size: 48px; line-height: 1; font-weight: 700; letter-spacing: -0.03em; }
.price-per { color: var(--muted); font-size: 15px; }
.save-badge { margin-left: 8px; padding: 3px 11px; border-radius: 980px; background: rgba(0,113,227,.12); color: var(--accent-blue); font-size: 12px; font-weight: 600; }
.price-note { height: 20px; margin: 8px 0 0; color: var(--subtle); font-size: 13px; }
.subscribe { margin: 22px 0 22px; width: 100%; border: 0; border-radius: 980px; background: #000; color: #fff; padding: 14px 16px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background .2s, opacity .2s, transform .1s, box-shadow .2s; box-shadow: 0 8px 20px rgba(0,0,0,.18); }
.subscribe:hover { background: #1d1d1f; box-shadow: 0 10px 26px rgba(0,0,0,.24); }
.subscribe:active { transform: scale(0.98); }
.subscribe.active { background: rgba(0,0,0,.09); color: var(--muted); cursor: default; box-shadow: none; }
.subscribe.ghost { background: rgba(0,0,0,.08); color: var(--ink); box-shadow: none; }
.subscribe:disabled { opacity: .9; }
.benefits { border-top: 1px solid rgba(0,0,0,.07); padding: 18px 0 0; margin: auto 0 0; list-style: none; display: grid; gap: 13px; }
.benefits li { display: flex; align-items: flex-start; gap: 10px; color: #3a3a3c; font-size: 14px; line-height: 1.5; }
.tick { flex: none; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,113,227,.12); color: var(--accent-blue); display: grid; place-items: center; margin-top: 1px; }

/* 对比表 */
.comparison { margin-top: 84px; }
.comparison .section-title { text-align: center; }
.comparison .section-sub { text-align: center; }
.table-scroll { overflow-x: auto; border-radius: 20px; background: var(--glass-bg); border: var(--glass-border); box-shadow: 0 8px 30px rgba(0,0,0,.06); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }
.compare-table, table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border-bottom: 1px solid rgba(0,0,0,.07); padding: 18px 16px; text-align: center; vertical-align: middle; color: #48484a; font-size: 15px; }
thead th { height: 60px; vertical-align: middle; }
thead th:first-child, tbody th { width: 200px; text-align: left; color: var(--muted); font-weight: 500; }
thead span { display: block; color: var(--ink); font-weight: 600; font-size: 16px; }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
thead strong { display: block; color: var(--subtle); font-weight: 600; font-size: 15px; margin-top: 4px; }
thead strong small { font-size: 12px; font-weight: 400; }
.mono-check { color: var(--accent-blue); display: inline-flex; align-items: center; justify-content: center; }
.mono-mark { color: var(--subtle); display: inline-flex; align-items: center; justify-content: center; min-width: 16px; }

/* FAQ */
.faq { margin-top: 84px; padding-bottom: 90px; max-width: 760px; }
.faq-list { border-top: 1px solid rgba(0,0,0,.08); }
.faq-item { border-bottom: 1px solid rgba(0,0,0,.08); }
.faq-item > button { width: 100%; border: 0; background: transparent; display: flex; justify-content: space-between; align-items: center; padding: 22px 0; color: #1d1d1f; font-size: 17px; font-weight: 600; text-align: left; cursor: pointer; }
.faq-item > button svg { transition: transform .25s; color: var(--subtle); }
.faq-item.open > button svg { transform: rotate(180deg); }
.answer { padding: 0 36px 22px 0; color: var(--muted); font-size: 15px; line-height: 1.75; }
.answer p { margin: 4px 0; }

/* Footer */
.apple-footer { background: rgba(0,0,0,.04); border-top: 1px solid var(--glass-border); text-align: center; padding: 40px 24px 30px; position: relative; z-index: 1; }
.apple-footer p { margin: 0; color: var(--subtle); font-size: 13px; }

/* ===== 支付确认弹窗（商城风格） ===== */
.modal-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.28); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); display: grid; place-items: center; padding: 24px; }
.payment-sheet { width: min(440px, 100%); position: relative; padding: 38px; box-sizing: border-box; border-radius: 24px; background: rgba(255,255,255,.92); -webkit-backdrop-filter: blur(28px) saturate(170%); backdrop-filter: blur(28px) saturate(170%); box-shadow: 0 24px 64px -12px rgba(0,0,0,.18); border: 1px solid rgba(255,255,255,.4); }
.payment-sheet > .close-button { position: absolute; z-index: 2; top: 16px; right: 16px; width: 36px; height: 36px; padding: 0; border: 1px solid rgba(255,255,255,.5); border-radius: 50%; display: grid; place-items: center; color: #5d6269; background: rgba(255,255,255,.7); -webkit-backdrop-filter: blur(12px) saturate(160%); backdrop-filter: blur(12px) saturate(160%); cursor: pointer; transition: transform 160ms ease, background-color 160ms ease; }
.payment-sheet > .close-button:hover { background: #fff; }
.payment-sheet > .close-button:active { transform: scale(.92); }
.section-kicker { margin: 0 0 12px; color: #86868b; font-size: 11px; font-weight: 700; line-height: 1.2; letter-spacing: .08em; text-transform: uppercase; }
.payment-card-wrap { width: 100%; margin-bottom: 22px; }
.payment-card-wrap .points-card { max-width: none; }
.payment-sheet h2 { margin: 0; font-size: 28px; line-height: 1.15; font-weight: 700; letter-spacing: -0.01em; }
.sheet-desc { margin: 10px 0 20px; color: var(--muted); font-size: 14px; line-height: 1.55; }
.summary-list { display: grid; gap: 8px; }
.summary-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; border-radius: 12px; background: #f6f8fa; font-size: 14px; }
.summary-row span { color: var(--muted); }
.summary-row strong { font-size: 14px; font-weight: 600; color: var(--ink); }
.summary-row.accent { background: rgba(0,113,227,.08); }
.summary-row.accent strong { color: var(--accent-blue); }
.summary-row.shortage strong { color: #d70015; }
.checkout-button { width: 100%; min-height: 46px; margin-top: 20px; border: 0; border-radius: 12px; color: #fff; background: #1d1d1f; font-size: 15px; font-weight: 700; cursor: pointer; transition: background-color 160ms ease, transform 100ms ease; }
.checkout-button:hover { background: #2a2a2c; }
.checkout-button:active { transform: scale(.985); }
/* 弹窗进入/离开动效（仿商城 sheet） */
.modal-enter-active, .modal-leave-active { transition: opacity 300ms cubic-bezier(.32,.72,0,1); }
.modal-enter-active .payment-sheet, .modal-leave-active .payment-sheet { transition: transform 400ms cubic-bezier(.32,.72,0,1), opacity 300ms cubic-bezier(.32,.72,0,1); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .payment-sheet { transform: scale(.94) translateY(18px); opacity: 0; }
.modal-leave-to .payment-sheet { transform: scale(.96) translateY(10px); opacity: 0; }
@media (max-width: 440px) {
  .modal-overlay { padding: 0; align-items: end; }
  .payment-sheet { align-self: end; width: calc(100% - 16px); margin: 0 8px 8px; padding: 34px 22px calc(24px + env(safe-area-inset-bottom)); border-radius: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .payment-sheet { transition-duration: 1ms !important; }
}

/* 入场动效 */
.hero { animation: rise .7s ease both; }
.intro { animation: rise .7s ease .12s both; }
.cards-wrap { animation: rise .7s ease .24s both; }
@keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }

@media (prefers-reduced-motion: reduce) {
  .plan-card, .intro-card { transition: none; }
  .hero, .intro, .cards-wrap { animation: none; }
}
/* backdrop-filter 降级兜底：不支持的浏览器落到实底白 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .plan-card, .intro-card, .cards-toolbar, .table-scroll,
  .payment-sheet { background: #fff; }
}

/* --- 响应式断点 --- */
@media (min-width: 901px) and (max-width: 1100px) {
  .plan-card { padding: 28px 22px 22px; }
  .price strong { font-size: 42px; }
}
@media (max-width: 900px) {
  .hero, .intro, .cards-wrap, .comparison, .faq { width: min(100% - 40px, 720px); }
  .intro-grid { grid-template-columns: repeat(2, 1fr); }
  .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cards-toolbar { align-items: center; }
  .active-chip { order: 3; flex: 1 1 100%; text-align: center; margin-top: 4px; }
}
@media (max-width: 620px) {
  .apple-pricing { padding-top: 14px; }
  .hero { padding: 48px 0 20px; }
  .hero-title { font-size: clamp(32px, 9vw, 42px); line-height: 1.12; }
  .hero-sub { font-size: 16px; margin-top: 16px; }
  .hero-cta { width: 100%; box-sizing: border-box; text-align: center; margin-top: 22px; }
  .section-title { font-size: 28px; line-height: 1.15; }
  .section-sub { font-size: 15px; margin-top: 10px; }
  .intro { padding: 16px 0 4px; }
  .section-head { margin-bottom: 28px; }
  .intro-grid { grid-template-columns: 1fr; gap: 14px; }
  .intro-card { padding: 24px 20px; }
  .cards { grid-template-columns: 1fr; }
  .cards-wrap { padding-top: 40px; }
  .cards-toolbar { flex-direction: column; align-items: stretch; gap: 12px; padding: 16px; }
  .billing-switch { width: 100%; justify-content: space-between; }
  .billing-switch button { flex: 1; padding-inline: 8px; font-size: 14px; text-align: center; }
  .points-row { justify-content: center; }
  .plan-card { padding: 26px 20px 22px; }
  .price strong { font-size: 42px; }
  .price { margin-top: 24px; flex-wrap: wrap; }
  .table-scroll { border-radius: 14px; }
  .comparison table { min-width: 600px; }
  .comparison { margin-top: 56px; }
  .comparison .section-sub, .comparison .section-title { text-align: left; }
  .faq { margin-top: 44px; padding-bottom: 20px; }
  .faq-item > button { padding: 18px 0; font-size: 15px; }
  .answer { padding: 0 24px 18px 0; font-size: 14px; }
  .apple-footer { padding: 28px 20px 24px; padding-bottom: max(24px, env(safe-area-inset-bottom, 0px)); }
}
</style>