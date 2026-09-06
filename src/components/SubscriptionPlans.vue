<template>
  <main class="apple-pricing v2" :class="{ 'is-mounted': pageMounted }">

    <!-- Hero -->
    <section class="hero">
      <p class="kicker reveal">BOH SUBSCRIPTION</p>
      <h1 class="hero-title reveal d1">最完整的 BOH，<br />一个计划全都拥有。</h1>
      <p class="hero-sub reveal d2">一个订阅融合更快的模型、更高并发与更大的创作空间。选一个档位，即享 BOH AI 的完整体验。</p>
      <div class="hero-cta-row reveal d3">
        <a class="hero-cta" href="#plans" @click.prevent="scrollToPlans">查看订阅计划</a>
        <button v-if="canShowTrial" type="button" class="hero-ghost" :disabled="isSubmitting || isLoadingSubscriptions" @click="handleStartTrial">免费试用 Pro 3 天 ›</button>
      </div>
      <div class="hero-meta reveal d4">
        <span><Check :size="14" /> 按积分扣费</span>
        <span><Check :size="14" /> 随时升级折算</span>
        <span><Check :size="14" /> 到期顺延</span>
      </div>
    </section>

    <!-- 权益介绍 -->
    <section class="intro" aria-label="BOH 订阅包含的权益服务">
      <div class="section-head">
        <p class="kicker reveal">权益总览</p>
        <h2 class="section-title reveal">一个计划，多项权益。</h2>
        <p class="section-sub reveal">BOH 订阅不是单一会员，而是一整套创作与思考服务的合集。</p>
      </div>
      <div class="intro-grid">
        <figure v-for="(f, i) in introFeatures" :key="f.title" class="liquid-glass intro-card reveal" :style="{ transitionDelay: `${(i % 6) * 70}ms` }">
          <div class="intro-icon" aria-hidden="true"><component :is="f.icon" :size="20" /></div>
          <h3>{{ f.title }}</h3><p>{{ f.copy }}</p>
        </figure>
      </div>
    </section>

    <!-- 价格区 -->
    <section id="plans" ref="plansSection" class="cards-wrap" aria-label="会员套餐">
      <div class="section-head center">
        <p class="kicker center reveal">选择档位</p>
        <h2 class="section-title center reveal">按你的节奏，选择一个计划。</h2>
        <p class="section-sub center reveal">年付相当于 10 个月价格，直接省 2 个月。升级按剩余天数折算，不浪费。</p>
      </div>

      <!-- sticky 状态条：去 reveal（transform 会破坏 sticky），只做 opacity 入场 -->
      <div ref="toolbarRef" class="liquid-glass toolbar toolbar-in" :class="{ stuck: toolbarStuck }">
        <div class="seg" role="tablist" aria-label="计费周期">
          <span
            class="seg-thumb" aria-hidden="true"
            :style="{ left: `calc(${(billingCycle === BILLING_YEARLY ? 1 : 0) * 50}% + 4px)`, width: 'calc(50% - 8px)' }"
          />
          <button
            v-for="tab in billingTabs" :key="tab.value" type="button" role="tab"
            class="seg-btn" :class="{ active: billingCycle === tab.value }"
            :aria-selected="billingCycle === tab.value"
            @click="handleTabClick(tab)"
          >{{ tab.label }}<em v-if="tab.discount">{{ tab.discount }}</em></button>
        </div>
        <span class="toolbar-divider" aria-hidden="true" />
        <div class="toolbar-mid">
          <div v-if="highestActivePlan" class="sub-pill" :class="{ trial: topIsTrial }">
            <span class="sub-icon"><Crown :size="15" aria-hidden="true" /></span>
            <span class="sub-text"><b>{{ topIsTrial ? '试用中' : '当前订阅' }} · {{ highestActivePlan.name }}</b><small>至 {{ formatDateText(highestActivePlan.expiresAt) }}</small></span>
          </div>
          <div v-else class="sub-pill none">
            <span class="sub-icon dim"><Sparkles :size="15" aria-hidden="true" /></span>
            <span class="sub-text"><b>尚未订阅</b><small>试用或选个档位开始</small></span>
          </div>
          <!-- 积分 + 充值合一：整颗液态玻璃 pill 可点 -->
          <button type="button" class="liquid-glass--subtle points-recharge" aria-live="polite" aria-label="当前积分，点击充值" @click="showRechargeModal = true">
            <span class="points-coin"><Coins :size="16" :stroke-width="1.9" aria-hidden="true" /></span>
            <span class="points-text"><small>当前积分</small><strong :key="currentPoints" class="points-num" :class="{ bump: pointsBump }">{{ currentPoints }}</strong></span>
            <span class="recharge-sep" aria-hidden="true" />
            <span class="recharge-go"><b>充值</b><ChevronRight :size="14" aria-hidden="true" /></span>
          </button>
        </div>
      </div>

      <div v-if="canShowTrial" class="trial-banner reveal">
        <div class="trial-text"><strong>免费试用 Pro 3 天</strong><span>完整体验 Pro 档权益，每个账号限一次，无需付积分。</span></div>
        <button class="trial-button" type="button" :disabled="isSubmitting || isLoadingSubscriptions" @click="handleStartTrial">{{ isSubmitting ? '开启中…' : '免费试用' }}</button>
      </div>
      <div v-else-if="isTrialing" class="trial-banner trialing reveal">
        <div class="trial-text"><strong>正在试用 Pro（剩余 {{ trialRemainingDays }} 天）</strong><span>试用权益已生效，升级正式版可享更长有效期。</span></div>
        <button class="trial-button ghost" type="button" :disabled="isSubmitting || isLoadingSubscriptions" @click="handleTrialUpgrade">升级正式版</button>
      </div>

      <div class="cards" aria-label="会员套餐">
        <article
          v-for="(plan, i) in paidPlans" :key="plan.code"
          class="liquid-glass liquid-glass--interactive plan-card reveal tilt"
          :class="{ featured: plan.featured }"
          :style="{ transitionDelay: `${i * 80}ms` }"
        >
          <span v-if="plan.featured" class="recommended"><span class="rec-dot" aria-hidden="true" />最受欢迎</span>
          <div class="plan-head"><h2>{{ plan.name }}</h2><p>{{ resolvePlanPosition(plan.code) }}</p></div>
          <div class="price" aria-live="polite">
            <span class="price-cny">￥</span>
            <Transition :name="priceDir >= 0 ? 'num-next' : 'num-prev'" mode="out-in">
              <strong :key="billingCycle + plan.code" class="price-num">{{ tweenedPrice(plan) }}</strong>
            </Transition>
            <span class="price-per">/ {{ billingCycle === BILLING_YEARLY ? '年' : '月' }}</span>
          </div>
          <p class="price-note">
            <span v-if="plan.monthlyCost && billingCycle === BILLING_YEARLY">相当于 ￥{{ Math.round(calculatePrice(plan) / 12) }} / 月 · </span>
            <span v-if="plan.monthlyCost && billingCycle === BILLING_YEARLY" :key="billingCycle" class="save-badge pop">省 {{ plan.monthlyCost * 2 }} 积分</span>
            <span v-else>&nbsp;</span>
          </p>
          <button
            class="subscribe" :class="{ active: plan.status === 'active', ghost: plan.status === 'blocked', blue: plan.featured && (plan.status === 'purchasable' || plan.status === 'upgradable' || plan.status === 'renew' || plan.status === 'convert') }"
            :disabled="plan.status === 'active' || plan.status === 'blocked' || isSubmitting || isLoadingSubscriptions"
            @click="handleSubscribe(plan)"
          >{{ getButtonText(plan) }}</button>
          <ul class="benefits"><li v-for="item in plan.features" :key="item"><span class="tick" aria-hidden="true"><Check :size="13" /></span>{{ item }}</li></ul>
        </article>
      </div>
    </section>

    <!-- 对比表 -->
    <section class="comparison" aria-labelledby="comparison-title">
      <p class="kicker center reveal">对比</p>
      <h2 id="comparison-title" class="section-title center reveal">哪个计划更适合你</h2>
      <p class="section-sub center reveal">按使用频率选方案，再用权益表做最后确认。表格可横滑。</p>
      <div class="liquid-glass table-scroll reveal">
        <table aria-describedby="comparison-title">
          <thead><tr><th scope="col">订阅计划</th><th v-for="plan in displayPlans" :key="plan.code" scope="col" :class="{ hl: plan.featured }"><span>{{ plan.name }}</span><strong>{{ calculatePrice(plan) }}<small> / {{ billingCycle === BILLING_YEARLY ? '年' : '月' }}</small></strong></th></tr></thead>
          <tbody>
            <tr v-for="row in comparisonRows" :key="row.label">
              <th scope="row">{{ row.label }}</th>
              <td v-for="plan in displayPlans" :key="plan.code + row.label" :class="{ hl: plan.featured }">
                <span v-if="row.values[plan.code] === true" class="mono-check"><Check :size="14" /></span>
                <span v-else class="mono-mark">{{ row.values[plan.code] === false ? '—' : row.values[plan.code] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- FAQ：高度手风琴 -->
    <section class="faq" aria-labelledby="faq-title">
      <p class="kicker center reveal">问答</p>
      <h2 id="faq-title" class="section-title center reveal">常见问题</h2>
      <div class="faq-list reveal">
        <div v-for="(item, index) in faqList" :key="item.q" class="faq-item" :class="{ open: openFaqIndex === index }">
          <button type="button" :aria-expanded="openFaqIndex === index" @click="toggleFaq(index)"><span>{{ item.q }}</span><ChevronDown :size="16" /></button>
          <div class="faq-answer" aria-hidden="false"><div class="faq-inner"><p v-for="paragraph in item.a" :key="paragraph">{{ paragraph }}</p></div></div>
        </div>
      </div>
    </section>

    <!-- 收尾 CTA -->
    <section class="closing">
      <div class="liquid-glass liquid-glass--strong close-card reveal">
        <h2>今天，想先开通哪个档位？</h2>
        <p>从免费试用开始，或直接选择 Pro。升级、续费都自动折算。</p>
        <div class="close-cta">
          <button type="button" class="cta-primary" @click="scrollToPlans">对比并订阅</button>
          <button v-if="canShowTrial" type="button" class="cta-quiet" :disabled="isSubmitting" @click="handleStartTrial">先试用 Pro 3 天 ›</button>
        </div>
      </div>
      <p class="fine">支付即表示您已阅读并同意《BOH 订阅服务协议》与《隐私政策》</p>
    </section>

    <Transition name="modal">
      <div v-if="showModal || showConfirmModal" class="modal-overlay liquid-glass--overlay" @click="closeAllModals">
        <section class="payment-sheet liquid-glass--strong" role="dialog" aria-modal="true" @click.stop>
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
    <Teleport to="body">
    <Transition name="recharge-modal">
      <div v-if="showRechargeModal" class="recharge-overlay" @click.self="showRechargeModal = false">
        <section class="recharge-sheet" role="dialog" aria-modal="true" aria-labelledby="subscription-recharge-title" @click.stop>
          <button class="recharge-close" type="button" aria-label="关闭充值积分" @click="showRechargeModal = false"><X :size="17" :stroke-width="2" /></button>
          <span class="recharge-kicker">积分服务</span><h2 id="subscription-recharge-title">充值积分</h2>
          <p>扫描收款码并备注 UID，管理员确认后会为你补充积分。</p>
          <div class="recharge-qr-frame"><img :src="sponsorQrImage" alt="积分充值收款二维码" /></div>
          <span class="recharge-uid">UID · {{ String(userInfo?.id || '').slice(0, 8) }}</span>
        </section>
      </div>
    </Transition>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { Check, ChevronDown, X, Zap, Cloud, Bot, FileText, Eye, Gift, Coins, ChevronRight, Crown, Sparkles } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { getMySubscriptions, subscribeWithPoints, startSubscriptionTrial } from '@/utils/api/subscription-api.js';
import { clearUserTierCache } from '@/utils/api/api-key-runtime-api.js';
import { showIsland } from '@/composables/useIsland.js';
import PointsCard from '@/views/user-center/UserSpace/components/PointsCard.vue';
import { logger } from '@/utils/logger.js';
import sponsorQrImage from '@/assets/images/qrcode.webp';

const BILLING_MONTHLY = 'monthly';
const BILLING_YEARLY = 'yearly';
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);
const billingCycle = ref(BILLING_MONTHLY);
const priceDir = ref(1);
const pageMounted = ref(false);
const plansSection = ref(null);
const toolbarRef = ref(null);
const toolbarStuck = ref(false);
const pointsBump = ref(false);
let bumpTimer = null;
let scrollTick = false;
const currentPoints = ref(0);
const subscriptions = ref([]);
const activeSubscriptions = ref({});
const isSubmitting = ref(false);
const isLoadingSubscriptions = ref(false);
const showModal = ref(false);
const showConfirmModal = ref(false);
const showRechargeModal = ref(false);
const currentService = ref(null);
const confirmPlan = ref(null);
const openFaqIndex = ref(0);
let revealObserver = null;

/* 价格数字滚动：rAF tween，只动展示 */
const displayPrices = reactive({});
function tweenNumber(from, to, onUpdate) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || from === to) { onUpdate(to); return }
  const t0 = performance.now(); const dur = 320
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3)
    onUpdate(Math.round(from + (to - from) * e))
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
watch(billingCycle, (nv, ov) => {
  priceDir.value = nv === BILLING_YEARLY ? 1 : -1
  if (!ov || nv === ov) return
  paidPlans.value.forEach((p) => {
    const to = calculatePrice(p)
    const from = displayPrices[p.code] ?? to
    tweenNumber(from, to, (v) => { displayPrices[p.code] = v })
  })
});
const tweenedPrice = (plan) => displayPrices[plan.code] ?? calculatePrice(plan);

const plans = [
  { code: 'free', name: 'Free', monthlyCost: 0, featured: false, alwaysActive: true, position: '日常使用', features: ['BOH AI 20 万 Token / 天', 'Cloud+ 150 张', '实验室 PPT / Word 10 次 / 月', '可参与抽奖'] },
  { code: 'plus', name: 'Plus', monthlyCost: 8, featured: false, position: '效率升级', features: ['BOH AI 80 万 Token / 天', 'Cloud+ 300 张', '多模态交互', '实验室 PPT / Word 15 次 / 月', '抽奖保底累计 24 次（门槛较高）'] },
  { code: 'pro', name: 'Pro', monthlyCost: 20, featured: true, position: '专业创作', features: ['BOH AI 200 万 Token / 天', 'Cloud+ 450 张', '多模态交互', '金色昵称', '实验室 PPT / Word 20 次 / 月', '抽奖保底累计 18 次（门槛中等）'] },
  { code: 'max', name: 'Max', monthlyCost: 40, featured: false, position: '全能尊享', features: ['BOH AI 500 万 Token / 天', 'Cloud+ 900 张', 'Agent & Plan', '金色昵称', '实验室 PPT / Word 30 次 / 月', '抽奖保底累计 12 次（门槛较低）'] },
  { code: 'ultra', name: 'Ultra', monthlyCost: 70, featured: false, position: '研究级无限', features: ['BOH AI 1000 万 Token / 天', 'Cloud+ 1200 张', 'Agent & Plan', '彩虹昵称', '实验室 PPT / Word 不限次数', '抽奖保底累计 8 次（门槛最低·最易保底）'] }
];
const introFeatures = [
  { icon: Zap, title: '更快模型与 Token', copy: '解锁更快、更强的 AI 模型与每日 Token 额度，交流与创作效率大幅提升。' },
  { icon: Cloud, title: 'Cloud+ 存储空间', copy: '扩充云端存储，文档、PPT、Word 与素材随取随用，再多创作也装得下。' },
  { icon: Bot, title: 'Agent 任务并行', copy: '支持多个并行 Agent 在后台同步推进，复杂任务一次完成不再等待。' },
  { icon: FileText, title: '实验室 PPT / Word', copy: '一键生成文档与演示，产出次数随档位升级，研究汇报十指飞快。' },
  { icon: Eye, title: '多模态交互', copy: '融合视觉与语音的多模态能力，让交流更自然，想法落地更直观。' },
  { icon: Gift, title: '会员尊享与抽奖', copy: '专属昵称效果与抽奖保底累计，让每一次使用都更有归属感。' }
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
  { q: '如何升级会员计划？', a: ['选择比当前更高级别的计划并点击“升级”，升级立即生效；已购订阅会按剩余天数折算成积分抵扣升级差额，不会浪费。'] },
  { q: '订阅快到期了怎么续费？', a: ['在订阅页选择你当前的档位并点击“续费”，新周期会在当前订阅到期后自动顺延，无需等待到期重买。'] },
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
const notify = (title, message = '', icon = 'success') => { showIsland.notify({ title, message, icon, durationMs: 2800 }); };
const handleTabClick = (tab) => { billingCycle.value = tab.value; };
const toggleFaq = (index) => { openFaqIndex.value = openFaqIndex.value === index ? null : index; };
const scrollToPlans = () => { (plansSection.value || document.getElementById('plans'))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); };

watch(() => userInfo.value?.points, (value) => { currentPoints.value = Number(value || 0); }, { immediate: true });
watch(currentPoints, () => {
  pointsBump.value = true;
  if (bumpTimer) clearTimeout(bumpTimer);
  bumpTimer = setTimeout(() => { pointsBump.value = false }, 450);
});
watch(() => userInfo.value?.id, () => { void loadMySubscriptions(); }, { immediate: true });
function buildActiveSubscriptionMap(list) { const now = Date.now(); activeSubscriptions.value = Object.fromEntries((list || []).filter((item) => (item?.status === 'active' || item?.status === 'trial') && item.planCode && Date.parse(item.expiresAt || '') > now).map((item) => [item.planCode, item])); }
async function loadMySubscriptions() { if (!userInfo.value?.id) { activeSubscriptions.value = {}; return; } isLoadingSubscriptions.value = true; const result = await getMySubscriptions(userInfo.value.id, { includeExpired: true }); isLoadingSubscriptions.value = false; if (!result.ok) { logger.error('subscription', '加载订阅记录失败:', result.error); return; } subscriptions.value = Array.isArray(result.data) ? result.data : []; buildActiveSubscriptionMap(subscriptions.value); }
const highestActivePlan = computed(() => { const active = Object.values(activeSubscriptions.value); if (!active.length) return null; const current = active.sort((a, b) => plans.findIndex((p) => p.code === b.planCode) - plans.findIndex((p) => p.code === a.planCode))[0]; return { ...current, name: plans.find((p) => p.code === current.planCode)?.name || current.planCode }; });
const topIsTrial = computed(() => highestActivePlan.value?.status === 'trial');

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
  if (!authStore.isLoggedIn || !userInfo.value?.id) { authStore.showLoginModal = true; return; }
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
  if (!authStore.isLoggedIn || !userInfo.value?.id) { authStore.showLoginModal = true; return; }
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

onMounted(async () => {
  requestAnimationFrame(() => { pageMounted.value = true });
  await nextTick();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /* 滚动进度 + toolbar 吸顶阴影（rAF 节流） */
  const onScroll = () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      if (toolbarRef.value) {
        const r = toolbarRef.value.getBoundingClientRect();
        toolbarStuck.value = r.top <= 84;
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  /* 卡片 3D 轻倾斜（桌面 + 非 reduced-motion） */
  const canTilt = !reduceMotion && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const tiltCards = [];
  if (canTilt) {
    document.querySelectorAll('.apple-pricing.v2 .plan-card.tilt').forEach((card) => {
      const move = (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--rx', `${(-py * 4).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(px * 5).toFixed(2)}deg`);
      };
      const leave = () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); };
      card.addEventListener('mousemove', move);
      card.addEventListener('mouseleave', leave);
      tiltCards.push([card, move, leave]);
    });
  }
  window.__subCleanup = () => {
    window.removeEventListener('scroll', onScroll);
    tiltCards.forEach(([card, move, leave]) => { card.removeEventListener('mousemove', move); card.removeEventListener('mouseleave', leave) });
  };
  const els = document.querySelectorAll('.apple-pricing.v2 .reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); }
  else {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); revealObserver.unobserve(en.target) } });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => revealObserver.observe(el));
  }
  paidPlans.value.forEach((p) => { displayPrices[p.code] = calculatePrice(p) });
});
onUnmounted(() => { revealObserver?.disconnect(); window.__subCleanup?.(); if (bumpTimer) clearTimeout(bumpTimer); });
</script>

<style scoped>
.apple-pricing.v2 {
  --ink: var(--liquid-text-primary, #1d1d1f);
  --muted: var(--liquid-text-secondary, #6e6e73);
  --subtle: var(--liquid-text-tertiary, #86868b);
  --blue: #0071e3; --blue-hover: #0077ed;
  width: 100%; min-height: 100vh; box-sizing: border-box;
  background: #fbfbfd; color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
  padding-top: 40px; position: relative; overflow: visible;
  -webkit-font-smoothing: antialiased;
}
.hero, .intro, .cards-wrap, .comparison, .faq, .closing { width: min(1160px, calc(100% - 48px)); margin-left: auto; margin-right: auto; position: relative; z-index: 1; }

/* reveal 下滑 */
.reveal { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(0.16,1,0.3,1), transform .8s cubic-bezier(0.16,1,0.3,1); }
.reveal.is-visible { opacity: 1; transform: none; }
.is-mounted .hero .reveal { opacity: 0; transform: translateY(20px); animation: heroUp .9s cubic-bezier(0.16,1,0.3,1) forwards; }
.is-mounted .hero .d1 { animation-delay: .08s; } .is-mounted .hero .d2 { animation-delay: .16s; }
.is-mounted .hero .d3 { animation-delay: .24s; } .is-mounted .hero .d4 { animation-delay: .34s; }
.is-mounted .hero .reveal.is-visible { animation: none; opacity: 1; transform: none; }
@keyframes heroUp { to { opacity: 1; transform: none; } }

.kicker { margin: 0; color: var(--blue); font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.kicker.center { text-align: center; }
.hero { padding: 72px 0 30px; text-align: center; }
.hero-title { margin: 10px 0 0; font-size: clamp(42px, 6vw, 66px); line-height: 1.06; font-weight: 750; letter-spacing: -0.025em; }
.hero-sub { margin: 20px auto 0; max-width: 620px; color: var(--muted); font-size: 18px; line-height: 1.65; }
.hero-cta-row { display: flex; justify-content: center; align-items: center; gap: 18px; margin-top: 28px; flex-wrap: wrap; }
.hero-cta { display: inline-block; padding: 14px 34px; border-radius: 980px; background: #1d1d1f; color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; box-shadow: 0 8px 24px rgba(0,0,0,.22); transition: transform .2s cubic-bezier(0.16,1,0.3,1), background .2s; }
.hero-cta:hover { transform: translateY(-1px); background: #000; }
.hero-ghost { border: 0; background: none; color: var(--blue); font-size: 15px; font-weight: 600; cursor: pointer; }
.hero-meta { display: flex; justify-content: center; gap: 18px; margin-top: 22px; color: var(--muted); font-size: 13px; flex-wrap: wrap; }
.hero-meta span { display: inline-flex; align-items: center; gap: 6px; }

.intro { padding: 40px 0 8px; }
.section-head { margin-bottom: 36px; }
.section-head.center { text-align: center; }
.section-title { margin: 8px 0 0; font-size: clamp(30px, 4vw, 44px); line-height: 1.1; font-weight: 750; letter-spacing: -0.02em; }
.section-title.center { text-align: center; }
.section-sub { margin: 12px 0 0; color: var(--muted); font-size: 17px; line-height: 1.6; }
.section-sub.center { text-align: center; max-width: 640px; margin-left: auto; margin-right: auto; }
.intro-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.intro-card { margin: 0; padding: 30px 28px !important; border-radius: 24px !important; }
.intro-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: var(--blue); background: rgba(0,113,227,.1); margin-bottom: 16px; }
.intro-card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.intro-card p { margin: 0; color: var(--muted); font-size: 14.5px; line-height: 1.65; }

.cards-wrap { padding-top: 56px; scroll-margin-top: 88px; }
/* 状态条：sticky 不允许祖先 overflow 非 visible、不允许自身有 transform——故无 reveal、无 transform 过渡 */
.toolbar { position: sticky; top: 76px; z-index: 20; display: flex; align-items: center; gap: 12px;
  margin-bottom: 22px; padding: 10px !important; border-radius: 22px !important;
  transition: box-shadow .35s, border-color .3s; will-change: box-shadow; }
.toolbar-in { animation: toolbarIn .7s cubic-bezier(0.16,1,0.3,1) backwards; animation-delay: .3s; }
@keyframes toolbarIn { from { opacity: 0; } }
.seg { position: relative; display: grid; grid-template-columns: 1fr 1fr; min-width: 250px; padding: 4px; border-radius: 980px; background: rgba(120,120,128,.16); }
.seg-thumb { position: absolute; top: 4px; bottom: 4px; border-radius: 980px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.14); transition: left .45s cubic-bezier(0.32,0.72,0,1); }
.seg-btn { position: relative; z-index: 1; border: 0; background: transparent; border-radius: 980px; min-height: 40px; padding: 0 20px; color: var(--muted); font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.seg-btn.active { color: var(--ink); }
.seg-btn em { font-style: normal; margin-left: 6px; font-size: 12px; color: var(--blue); }
.toolbar-divider { flex: none; width: 1px; align-self: stretch; margin: 6px 0; background: rgba(120,120,128,.22); }
.toolbar-mid { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.sub-pill { display: inline-flex; align-items: center; gap: 10px; min-width: 0; padding: 7px 14px 7px 8px; border-radius: 16px;
  background: rgba(0,113,227,.08); border: 1px solid rgba(0,113,227,.16); }
.sub-pill.none { background: rgba(120,120,128,.1); border-color: rgba(120,120,128,.18); }
.sub-icon { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 10px;
  background: linear-gradient(135deg, #0071e3, #42a5f5); color: #fff; }
.sub-icon.dim { background: rgba(120,120,128,.2); color: var(--muted); }
.sub-text { display: grid; gap: 1px; line-height: 1.25; min-width: 0; }
.sub-text b { font-size: 13px; font-weight: 700; white-space: nowrap; }
.sub-text small { font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.sub-pill.trial .sub-icon { background: linear-gradient(135deg, #0f8a6a, #34d399); }
.points-recharge { display: inline-flex; align-items: center; gap: 10px; padding: 7px 14px 7px 8px; border-radius: 16px;
  border: 1px solid rgba(255,255,255,.65); cursor: pointer; color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.7), 0 6px 18px rgba(15,23,42,.07);
  transition: transform .2s cubic-bezier(0.16,1,0.3,1), box-shadow .25s, border-color .25s; }
.points-recharge:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 10px 26px rgba(0,113,227,.14); border-color: rgba(0,113,227,.3); }
.points-recharge:active { transform: scale(.97); }
.points-coin { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 10px;
  background: rgba(0,113,227,.12); color: var(--blue); }
.points-text { display: grid; gap: 1px; line-height: 1.2; text-align: left; white-space: nowrap; }
.points-text small { font-size: 10.5px; color: var(--muted); }
.points-num { font-size: 19px; font-weight: 750; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.recharge-sep { flex: none; width: 1px; align-self: stretch; margin: 4px 0; background: rgba(120,120,128,.25); }
.recharge-go { flex: none; display: inline-flex; align-items: center; gap: 2px; color: var(--blue); font-size: 13px; font-weight: 700; }
.recharge-go b { font-weight: 700; }

.trial-banner { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; padding: 18px 22px; border-radius: 20px; background: rgba(0,113,227,.07); border: 1px solid rgba(0,113,227,.22); }
.trial-banner.trialing { background: rgba(255,255,255,.8); }
.trial-text { display: grid; gap: 4px; } .trial-text strong { font-size: 16px; } .trial-text span { font-size: 13px; color: var(--muted); }
.trial-button { border: 0; border-radius: 980px; background: var(--blue); color: #fff; padding: 12px 28px; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 20px rgba(0,113,227,.28); }
.trial-button.ghost { background: #1d1d1f; box-shadow: 0 8px 20px rgba(0,0,0,.18); }
.trial-button:disabled { opacity: .65; }

.cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.plan-card { border-radius: 24px !important; padding: 30px 24px 24px !important; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.plan-card.featured { border: 1.5px solid var(--blue) !important; box-shadow: 0 14px 40px rgba(0,113,227,.16), var(--liquid-shadow, 0 20px 60px rgba(15,23,42,.07)) !important; }
@media (min-width: 1100px) { .plan-card.featured { transform: scale(1.02); } .plan-card.featured:hover { transform: scale(1.02) translateY(-4px); } }
.recommended { position: absolute; top: 16px; right: 16px; background: #1d1d1f; color: #fff; border-radius: 980px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; }
.plan-card.featured .recommended { background: var(--blue); }
.plan-head h2 { margin: 0; font-size: 20px; font-weight: 700; }
.plan-head p { margin: 6px 0 0; color: var(--muted); font-size: 13.5px; }
.price { display: flex; align-items: baseline; gap: 3px; margin-top: 26px; min-height: 52px; }
.price-cny { font-size: 19px; font-weight: 650; }
.price-num { display: inline-block; font-size: 46px; line-height: 1; font-weight: 750; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; min-width: 2ch; }
.price-per { color: var(--muted); font-size: 14px; }
.price-note { min-height: 22px; margin: 8px 0 0; color: var(--subtle); font-size: 12.5px; }
.save-badge { padding: 3px 10px; border-radius: 980px; background: rgba(0,113,227,.12); color: var(--blue); font-size: 11.5px; font-weight: 700; }
.subscribe { margin: 20px 0; width: 100%; border: 0; border-radius: 980px; background: #1d1d1f; color: #fff; padding: 13px 16px; font-size: 15px; font-weight: 650; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,.16); transition: transform .2s cubic-bezier(0.16,1,0.3,1), background .2s; }
.subscribe:hover { transform: translateY(-1px); }
.subscribe.blue { background: var(--blue); box-shadow: 0 8px 20px rgba(0,113,227,.3); }
.subscribe.blue:hover { background: var(--blue-hover); }
.subscribe.active { background: rgba(120,120,128,.18); color: var(--muted); box-shadow: none; cursor: default; }
.subscribe.ghost { background: rgba(120,120,128,.16); color: var(--muted); box-shadow: none; }
.benefits { border-top: 1px solid rgba(0,0,0,.07); padding: 18px 0 0; margin: auto 0 0; list-style: none; display: grid; gap: 12px; }
.benefits li { display: flex; gap: 10px; color: #3a3a3c; font-size: 13.5px; line-height: 1.55; }
.tick { flex: none; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,113,227,.12); color: var(--blue); display: grid; place-items: center; margin-top: 1px; }

/* 价格数字滑动 */
.num-next-enter-active, .num-next-leave-active, .num-prev-enter-active, .num-prev-leave-active { transition: opacity .28s cubic-bezier(0.16,1,0.3,1), transform .28s cubic-bezier(0.16,1,0.3,1); }
.num-next-enter-from { opacity: 0; transform: translateY(14px); } .num-next-leave-to { opacity: 0; transform: translateY(-14px); }
.num-prev-enter-from { opacity: 0; transform: translateY(-14px); } .num-prev-leave-to { opacity: 0; transform: translateY(14px); }

.comparison { margin-top: 80px; }
.table-scroll { margin-top: 30px; overflow-x: auto; border-radius: 24px !important; }
.table-scroll table { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 640px; }
.table-scroll th, .table-scroll td { border-bottom: 1px solid rgba(0,0,0,.07); padding: 16px; text-align: center; font-size: 14.5px; color: #48484a; }
.table-scroll thead th { position: sticky; top: 0; background: rgba(255,255,255,.92); backdrop-filter: none; z-index: 2; height: 64px; }
.table-scroll thead th:first-child, .table-scroll tbody th { width: 190px; text-align: left; color: var(--muted); font-weight: 500; position: sticky; left: 0; background: rgba(255,255,255,.94); z-index: 1; }
.table-scroll thead span { display: block; color: var(--ink); font-weight: 700; font-size: 15px; }
.table-scroll thead strong { display: block; color: var(--subtle); font-size: 13.5px; margin-top: 4px; }
.mono-check { color: var(--blue); display: inline-flex; } .mono-mark { color: var(--subtle); }

.faq { margin-top: 80px; padding-bottom: 10px; max-width: 780px; }
.faq-list { margin-top: 28px; border-top: 1px solid rgba(0,0,0,.09); }
.faq-item { border-bottom: 1px solid rgba(0,0,0,.09); }
.faq-item > button { width: 100%; min-height: 56px; border: 0; background: transparent; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px 0; color: var(--ink); font-size: 16.5px; font-weight: 650; text-align: left; cursor: pointer; }
.faq-item > button svg { flex: none; transition: transform .3s cubic-bezier(0.16,1,0.3,1); color: var(--subtle); }
.faq-item.open > button svg { transform: rotate(180deg); }
.faq-answer { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .38s cubic-bezier(0.16,1,0.3,1), opacity .3s; }
.faq-item.open .faq-answer { grid-template-rows: 1fr; opacity: 1; }
.faq-inner { overflow: hidden; } .faq-inner p { margin: 0 0 18px; padding-right: 32px; color: var(--muted); font-size: 15px; line-height: 1.75; }

.closing { padding: 56px 0 70px; text-align: center; }
.close-card { max-width: 860px; margin: 0 auto; padding: 64px 32px !important; border-radius: 32px !important; }
.close-card h2 { margin: 0; font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.02em; }
.close-card p { margin: 12px 0 0; color: var(--muted); font-size: 16px; }
.close-cta { display: flex; justify-content: center; align-items: center; gap: 18px; margin-top: 28px; flex-wrap: wrap; }
.cta-primary { border: 0; border-radius: 980px; background: var(--blue); color: #fff; padding: 14px 34px; font-size: 16px; font-weight: 650; cursor: pointer; box-shadow: 0 8px 24px rgba(0,113,227,.3); }
.cta-quiet { border: 0; background: none; color: var(--blue); font-size: 15px; font-weight: 650; cursor: pointer; }
.fine { margin: 24px 0 0; color: var(--subtle); font-size: 12.5px; }

/* 弹窗：overlay唯一blur，sheet强玻璃，内行实色 */
.modal-overlay { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 24px;
  background: rgba(248,250,252,.6); backdrop-filter: blur(24px) saturate(170%); -webkit-backdrop-filter: blur(24px) saturate(170%); }
.payment-sheet { width: min(440px, 100%); position: relative; padding: 36px !important; box-sizing: border-box; border-radius: 28px !important;
  background: rgba(255,255,255,.86) !important; border: 1px solid rgba(255,255,255,.7) !important;
  backdrop-filter: blur(20px) saturate(170%); -webkit-backdrop-filter: blur(20px) saturate(170%);
  box-shadow: 0 24px 64px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.9) !important; }
.payment-sheet > .close-button { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(0,0,0,.06); background: #fff; color: #5d6269; cursor: pointer; display: grid; place-items: center; }
.section-kicker { margin: 0 0 12px; color: var(--subtle); font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.payment-card-wrap { margin-bottom: 20px; } .payment-card-wrap .points-card { max-width: none; }
.payment-sheet h2 { margin: 0; font-size: 26px; letter-spacing: -0.01em; }
.sheet-desc { margin: 10px 0 18px; color: var(--muted); font-size: 14px; line-height: 1.6; }
.summary-list { display: grid; gap: 8px; }
.summary-row { display: flex; justify-content: space-between; gap: 12px; padding: 11px 14px; border-radius: 12px; background: #f5f5f7; font-size: 14px; }
.summary-row span { color: var(--muted); } .summary-row strong { font-weight: 650; }
.summary-row.accent { background: rgba(0,113,227,.09); } .summary-row.accent strong { color: var(--blue); }
.summary-row.shortage strong { color: #d70015; }
.checkout-button { width: 100%; min-height: 48px; margin-top: 18px; border: 0; border-radius: 980px; background: #1d1d1f; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; }
.modal-enter-active, .modal-leave-active { transition: opacity .3s cubic-bezier(.32,.72,0,1); }
.modal-enter-active .payment-sheet, .modal-leave-active .payment-sheet { transition: transform .4s cubic-bezier(.32,.72,0,1), opacity .3s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .payment-sheet { transform: scale(.94) translateY(18px); opacity: 0; }
.modal-leave-to .payment-sheet { transform: scale(.96) translateY(10px); opacity: 0; }

.recharge-overlay { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(225,232,242,.14); backdrop-filter: blur(22px) saturate(125%); -webkit-backdrop-filter: blur(22px) saturate(125%); }
.recharge-sheet { position: relative; display: grid; justify-items: center; width: min(100%, 340px); padding: 28px 26px 24px; border-radius: 28px; background: rgba(255,255,255,.88); border: 1px solid rgba(255,255,255,.72); box-shadow: 0 24px 65px rgba(31,41,55,.13), inset 0 1px 0 rgba(255,255,255,.9); text-align: center; }
.recharge-close { position: absolute; top: 12px; right: 13px; width: 30px; height: 30px; border: 0; border-radius: 50%; background: rgba(0,0,0,.05); color: #64748b; cursor: pointer; display: grid; place-items: center; }
.recharge-kicker { color: #2563eb; font-size: 12px; font-weight: 800; } .recharge-sheet h2 { margin: 5px 0 7px; font-size: 21px; }
.recharge-sheet p { max-width: 270px; margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.6; }
.recharge-qr-frame { margin: 16px 0 12px; padding: 10px; border-radius: 20px; background: #fff; box-shadow: 0 12px 28px rgba(31,41,55,.08); }
.recharge-qr-frame img { display: block; width: 200px; height: 200px; border-radius: 12px; }
.recharge-uid { color: #8e8e93; font: 600 11px ui-monospace, Menlo, monospace; letter-spacing: .05em; }
.recharge-modal-enter-active, .recharge-modal-leave-active { transition: opacity .22s; }
.recharge-modal-enter-active .recharge-sheet, .recharge-modal-leave-active .recharge-sheet { transition: transform .3s cubic-bezier(.32,.72,0,1), opacity .2s; }
.recharge-modal-enter-from, .recharge-modal-leave-to { opacity: 0; }
.recharge-modal-enter-from .recharge-sheet, .recharge-modal-leave-to .recharge-sheet { opacity: 0; transform: translateY(10px) scale(.97); }

/* 深色：新类全映射 */
[data-theme="dark"] .apple-pricing.v2 { background: #000; --ink: #f5f5f7; --muted: #a1a1a6; --subtle: #86868b; }
[data-theme="dark"] .hero-cta { background: #fff; color: #000; box-shadow: none; }
[data-theme="dark"] .seg { background: rgba(255,255,255,.12); } [data-theme="dark"] .seg-thumb { background: #2c2c2e; }
[data-theme="dark"] .seg-btn.active { color: #fff; }
[data-theme="dark"] .toolbar-divider { background: rgba(255,255,255,.14); }
[data-theme="dark"] .sub-pill { background: rgba(0,113,227,.18); border-color: rgba(0,113,227,.4); }
[data-theme="dark"] .sub-pill.none { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.14); }
[data-theme="dark"] .sub-text small { color: #a1a1a6; }
[data-theme="dark"] .recharge-sep { background: rgba(255,255,255,.16); }
[data-theme="dark"] .trial-banner { background: rgba(0,113,227,.16); border-color: rgba(0,113,227,.4); }
[data-theme="dark"] .trial-banner.trialing { background: rgba(255,255,255,.08); }
[data-theme="dark"] .trial-text strong { color: #f5f5f7; }
[data-theme="dark"] .benefits li { color: #d7d7db; } [data-theme="dark"] .benefits { border-color: rgba(255,255,255,.12); }
[data-theme="dark"] .subscribe { background: #fff; color: #000; } [data-theme="dark"] .subscribe.active, [data-theme="dark"] .subscribe.ghost { background: rgba(255,255,255,.14); color: #a1a1a6; }
[data-theme="dark"] .table-scroll thead th { background: #1c1c1e; } [data-theme="dark"] .table-scroll thead th:first-child, [data-theme="dark"] .table-scroll tbody th { background: #1c1c1e; }
[data-theme="dark"] .table-scroll th, [data-theme="dark"] .table-scroll td { border-color: rgba(255,255,255,.1); color: #d7d7db; }
[data-theme="dark"] .faq-list, [data-theme="dark"] .faq-item { border-color: rgba(255,255,255,.14); }
[data-theme="dark"] .summary-row { background: #1c1c1e; } [data-theme="dark"] .checkout-button { background: #fff; color: #000; }
[data-theme="dark"] .modal-overlay { background: rgba(10,10,14,.6); }
[data-theme="dark"] .recharge-sheet { background: rgba(30,30,34,.92); border-color: rgba(255,255,255,.12); }
[data-theme="dark"] .recharge-qr-frame { background: #fff; }

@media (max-width: 1100px) { .cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) {
  .hero, .intro, .cards-wrap, .comparison, .faq, .closing { width: min(100% - 40px, 720px); }
  .intro-grid { grid-template-columns: repeat(2, 1fr); }
  .toolbar { top: 64px; }
}
@media (max-width: 620px) {
  .apple-pricing.v2 { padding-top: 20px; }
  .hero { padding: 44px 0 18px; } .hero-title { font-size: clamp(32px, 9vw, 42px); } .hero-sub { font-size: 16px; }
  .hero-cta { width: 100%; text-align: center; box-sizing: border-box; }
  .intro-grid, .cards { grid-template-columns: 1fr; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .seg { min-width: 0; width: 100%; }
  .toolbar-divider { display: none; }
  .toolbar-mid { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .sub-pill, .points-recharge { justify-content: flex-start; min-width: 0; }
  .sub-pill .sub-text { overflow: hidden; }
  .trial-banner { flex-direction: column; align-items: stretch; text-align: center; } .trial-button { width: 100%; }
  .comparison { margin-top: 56px; } .faq { margin-top: 48px; }
  .close-card { padding: 48px 22px !important; }
  .modal-overlay { padding: 0; align-items: end; } .payment-sheet { width: calc(100% - 16px); margin: 0 8px 8px; }
}
/* ===== 精致化 + 细节交互（v2.1 polish，不改布局逻辑） ===== */
::selection { background: rgba(0,113,227,.18); }
button:focus-visible, a:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; border-radius: 12px; }

/* Hero */
.hero-title { text-wrap: balance; }
.hero-cta:active { transform: scale(.98); }
.hero-ghost { position: relative; padding: 10px 4px; border-radius: 8px; transition: color .2s, transform .2s; }
.hero-ghost:hover { color: var(--blue-hover); transform: translateY(-1px); }
.hero-meta span { padding: 7px 12px; border-radius: 980px; background: rgba(255,255,255,.66);
  border: 1px solid rgba(255,255,255,.7); box-shadow: 0 4px 14px rgba(15,23,42,.06);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }

/* 权益卡 */
.intro-card { transition: transform .35s cubic-bezier(0.16,1,0.3,1), box-shadow .35s, border-color .3s; }
.intro-card:hover { transform: translateY(-5px); box-shadow: 0 18px 44px rgba(15,23,42,.1); border-color: rgba(0,113,227,.25); }
.intro-card:hover .intro-icon { transform: scale(1.08) rotate(-4deg); background: rgba(0,113,227,.16); }
.intro-icon { transition: transform .3s cubic-bezier(0.34,1.56,0.64,1), background .3s; }

/* 工具条吸顶 + 分段弹簧 */
.toolbar { transition: box-shadow .35s, border-color .3s; }
.toolbar.stuck { box-shadow: 0 16px 44px rgba(15,23,42,.12), var(--liquid-shadow, 0 8px 24px rgba(15,23,42,.06)) !important;
  border-color: rgba(0,113,227,.22) !important; }
.seg-thumb { transition: left .5s cubic-bezier(0.34,1.3,0.64,1); }
.seg-btn { transition: color .25s, transform .15s; }
.seg-btn:active { transform: scale(.96); }
.points-num { display: inline-block; }
.points-num.bump { animation: pointsBump .45s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes pointsBump { 30% { transform: translateY(-4px) scale(1.12); color: var(--blue); } 100% { transform: none; } }
.points-recharge:active { transform: scale(.97); }

/* 试用条微光 */
.trial-banner { position: relative; overflow: hidden; }
.trial-banner::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
  background: linear-gradient(110deg, rgba(0,113,227,.45), rgba(66,165,245,.12) 40%, rgba(15,138,106,.35));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: .7; pointer-events: none; }
.trial-button { transition: transform .2s cubic-bezier(0.16,1,0.3,1), box-shadow .25s, background .2s; }
.trial-button:hover { transform: translateY(-1px); }
.trial-button:active { transform: scale(.97); }

/* 价格卡：档位色 + 光泽 + 倾斜 */
.plan-card { transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transition: transform .35s cubic-bezier(0.16,1,0.3,1), box-shadow .35s, border-color .3s; }
.plan-card:hover { box-shadow: 0 22px 55px rgba(15,23,42,.13) !important; border-color: rgba(0,0,0,.14) !important; }
.plan-card.featured:hover { box-shadow: 0 22px 60px rgba(0,113,227,.22), var(--liquid-shadow) !important; }
.recommended { display: inline-flex; align-items: center; gap: 6px; }
.rec-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; animation: recPulse 2s ease-in-out infinite; }
@keyframes recPulse { 50% { box-shadow: 0 0 0 5px rgba(74,222,128,.25); } }
.price-num { text-shadow: 0 1px 0 rgba(255,255,255,.6); }
.save-badge.pop { display: inline-block; animation: badgePop .45s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes badgePop { from { transform: scale(.6); opacity: 0; } }
.subscribe:active { transform: scale(.98); }
.subscribe:disabled { cursor: default; }
.benefits li { border-radius: 10px; padding: 2px 6px; margin: 0 -6px; transition: background .25s, transform .25s; }
.benefits li:hover { background: rgba(0,113,227,.06); transform: translateX(2px); }
.benefits li:hover .tick { transform: scale(1.15); background: var(--blue); color: #fff; }
.tick { transition: transform .25s cubic-bezier(0.34,1.56,0.64,1), background .25s, color .25s; }
.is-visible.plan-card .benefits li { animation: tickIn .5s cubic-bezier(0.16,1,0.3,1) backwards; }
.is-visible.plan-card .benefits li:nth-child(2) { animation-delay: .06s; } .is-visible.plan-card .benefits li:nth-child(3) { animation-delay: .12s; }
.is-visible.plan-card .benefits li:nth-child(4) { animation-delay: .18s; } .is-visible.plan-card .benefits li:nth-child(5) { animation-delay: .24s; }
.is-visible.plan-card .benefits li:nth-child(6) { animation-delay: .3s; }
@keyframes tickIn { from { opacity: 0; transform: translateX(-8px); } }

/* 对比表：Pro 列高亮 + 行悬停 + 滚动边缘 */
.table-scroll { position: relative; }
.table-scroll::after { content: ''; position: sticky; display: block; }
.table-scroll table { border-collapse: separate; border-spacing: 0; }
.table-scroll tbody tr { transition: background .25s; }
.table-scroll tbody tr:hover { background: rgba(0,113,227,.045); }
.table-scroll th.hl, .table-scroll td.hl { background: rgba(0,113,227,.06) !important; }
.table-scroll thead th.hl { box-shadow: inset 0 2px 0 var(--blue); }
.table-scroll thead th { transition: background .3s; }
.mono-check { animation: tickIn .4s backwards; }
.table-scroll::-webkit-scrollbar { height: 8px; }
.table-scroll::-webkit-scrollbar-thumb { background: rgba(120,120,128,.35); border-radius: 99px; }
.table-scroll::-webkit-scrollbar-track { background: transparent; }

/* FAQ 更细 */
.faq-item { border-radius: 14px; padding: 0 16px; margin: 0 -16px; transition: background .3s; }
.faq-item:hover { background: rgba(120,120,128,.08); }
.faq-item.open { background: rgba(255,255,255,.7); box-shadow: 0 8px 24px rgba(15,23,42,.06); }
.faq-item > button svg { width: 30px; height: 30px; padding: 7px; border-radius: 50%; background: rgba(120,120,128,.12); transition: transform .4s cubic-bezier(0.34,1.3,0.64,1), background .3s, color .3s; }
.faq-item.open > button svg { background: var(--blue); color: #fff; }
.faq-answer { transition: grid-template-rows .45s cubic-bezier(0.16,1,0.3,1), opacity .35s; }

/* 收尾 + 弹窗弹簧 */
.close-card { position: relative; overflow: hidden; }
.cta-primary { position: relative; overflow: hidden; transition: transform .2s cubic-bezier(0.16,1,0.3,1), box-shadow .25s; }
.cta-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(0,113,227,.38); }
.cta-primary:active { transform: scale(.98); }
.modal-enter-active .payment-sheet { transition: transform .5s cubic-bezier(0.34,1.3,0.64,1), opacity .3s !important; }
.payment-sheet > .close-button { transition: transform .2s, background .2s, rotate .3s; }
.payment-sheet > .close-button:hover { transform: scale(1.06); rotate: 90deg; background: #fff; }
.checkout-button { transition: transform .15s, background .2s, box-shadow .25s; }
.checkout-button:hover { box-shadow: 0 12px 28px rgba(0,0,0,.25); }
.checkout-button:active { transform: scale(.98); }
.summary-row { transition: transform .2s, background .25s; }
.summary-row:hover { transform: translateX(2px); }
.recharge-qr-frame { transition: transform .3s cubic-bezier(0.34,1.56,0.64,1); }
.recharge-qr-frame:hover { transform: scale(1.03); }

[data-theme="dark"] .hero-meta span { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.12); }
[data-theme="dark"] .faq-item.open { background: rgba(255,255,255,.07); }
[data-theme="dark"] .faq-item:hover { background: rgba(255,255,255,.05); }
[data-theme="dark"] .table-scroll tbody tr:hover { background: rgba(0,113,227,.12); }
[data-theme="dark"] .benefits li:hover { background: rgba(0,113,227,.14); }

@media (prefers-reduced-motion: reduce) {
  .rec-dot { display: none !important; }
  .plan-card { transform: none !important; }
  .reveal, .is-mounted .hero .reveal { opacity: 1 !important; transform: none !important; animation: none !important; transition: none !important; }
  .seg-thumb { transition: none; }
  .num-next-enter-active, .num-prev-enter-active, .num-next-leave-active, .num-prev-leave-active, .faq-answer { transition: none !important; }
}
</style>
