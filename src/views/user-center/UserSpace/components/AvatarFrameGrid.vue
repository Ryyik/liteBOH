<template>
  <div class="afg-root">
    <!-- 积分解锁确认：只有带 points_price 的框才走这里，其余仍交给壳跳订阅 tab -->
    <div v-if="pendingPurchase" class="afg-purchase">
      <div class="afg-purchase-txt">
        <b>解锁「{{ pendingPurchase.name }}」</b>
        <span>需要 <em>{{ pendingPurchase.pointsPrice }}</em> 积分 · 当前 {{ myPoints }} 积分</span>
        <span v-if="pendingPurchase.freeUntil" class="note">
          限免期内本来就能直接佩戴；现在买断则是<strong>永久</strong>解锁，限免结束后仍然可用。
        </span>
        <span v-if="purchaseError" class="err">{{ purchaseError }}</span>
      </div>
      <div class="afg-purchase-actions">
        <button type="button" class="afg-p-btn" :disabled="purchasing" @click="pendingPurchase = null">取消</button>
        <button type="button" class="afg-p-btn primary" :disabled="purchasing" @click="confirmPurchase">
          {{ purchasing ? '解锁中…' : '确认解锁' }}
        </button>
      </div>
    </div>

    <!-- 试戴预览条：即点即换，配合同页顶卡头像同步 -->
    <div class="afg-preview">
      <FramedAvatar :src="avatarUrl" :initial="displayInitial" :size="88"
        :frame-url="effectiveFrame.url" :ring="effectiveFrame.url ? '' : effectiveFrame.ring"
        :frame-scale="effectiveFrame.scale || 0" />
      <div class="afg-preview-info">
        <div class="afg-preview-name-row">
          <strong>{{ effectiveFrame.name }}</strong>
          <span v-if="effectiveFrame.id !== 'none'" class="afg-tier-pill" :class="`is-${previewPill.tier}`">
            {{ previewPill.text }}
          </span>
          <span class="afg-wearing">{{ isEquippedOwned ? '佩戴中' : '未佩戴' }}</span>
          <!-- 限免期内 / 档位够 时本来就能戴，但想永久买断的人得有个入口，否则只能等限免结束 -->
          <button v-if="canBuyPermanent" type="button" class="afg-buy-btn" @click="startPurchase(effectiveFrame)">
            永久解锁 {{ effectiveFrame.pointsPrice }} 积分
          </button>
        </div>
        <p class="afg-preview-desc">{{ effectiveFrame.desc }}</p>
      </div>
    </div>

    <p class="afg-group-label">我的框</p>
    <div class="afg-grid">
      <button v-for="frame in regularFrames" :key="frame.id" type="button" class="afg-card"
        :class="{ 'is-active': frame.id === effectiveFrame.id, 'is-locked': !ownedIds.includes(frame.id) }"
        :aria-pressed="frame.id === effectiveFrame.id"
        @click="handleCardClick(frame)">
        <span v-if="isFreeCampaign(frame)" class="afg-limit-flag is-campaign">限时免费</span>
        <span v-if="frame.id === effectiveFrame.id" class="afg-check" aria-hidden="true">
          <Check :size="11" :stroke-width="3" />
        </span>
        <FramedAvatar :src="avatarUrl" :initial="displayInitial" :size="52"
          :frame-url="frame.url" :ring="frame.url ? '' : frame.ring" :frame-scale="frame.scale || 0" class="afg-card-avatar" />
        <span class="afg-card-name">{{ frame.name }}</span>
        <span v-if="!ownedIds.includes(frame.id)" class="afg-lock-pill" :class="`is-${tierOf(frame)}`">
          <Lock :size="9" :stroke-width="2.4" />
          {{ tierLabel(tierOf(frame)) }}
        </span>
      </button>
      <div class="afg-card is-placeholder" aria-hidden="true">
        <span class="afg-placeholder-avatar">+</span>
        <span class="afg-card-name">敬请期待</span>
      </div>
    </div>

    <p class="afg-group-label">限定收藏</p>
    <div class="afg-grid">
      <button v-for="frame in limitedFrames" :key="frame.id" type="button" class="afg-card"
        :class="{ 'is-active': frame.id === effectiveFrame.id, 'is-locked': !ownedIds.includes(frame.id) }"
        :aria-pressed="frame.id === effectiveFrame.id"
        @click="handleCardClick(frame)">
        <span class="afg-limit-flag">限定</span>
        <span v-if="isFreeCampaign(frame)" class="afg-limit-flag is-campaign">限时免费</span>
        <span v-if="frame.id === effectiveFrame.id" class="afg-check" aria-hidden="true">
          <Check :size="11" :stroke-width="3" />
        </span>
        <FramedAvatar :src="avatarUrl" :initial="displayInitial" :size="52"
          :frame-url="frame.url" :ring="frame.url ? '' : frame.ring" :frame-scale="frame.scale || 0" class="afg-card-avatar" />
        <span class="afg-card-name">{{ frame.name }}</span>
        <span v-if="!ownedIds.includes(frame.id)" class="afg-lock-pill" :class="`is-${tierOf(frame)}`">
          <Lock :size="9" :stroke-width="2.4" />
          {{ tierLabel(tierOf(frame)) }}
        </span>
      </button>
      <div class="afg-card is-placeholder" aria-hidden="true">
        <span class="afg-placeholder-avatar">+</span>
        <span class="afg-card-name">敬请期待</span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 头像框选择 · 内容组件（弹层与资产中心「装扮」tab 共用）
 * 状态单源 useAvatarFrame；点击已解锁即换（equip 内部写 localStorage 单例同步），
 * 未解锁 emit('unlock', frame) 由壳决定去向（内嵌 → 订阅 tab；弹层 → 关闭）。
 */
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { Check, Lock } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { useUserTier } from '@/composables/useUserTier.js';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';
import { freeUntilLabel, isFrameFreeNow } from '@/utils/avatar-frame-campaign.js';
import { purchaseAvatarFrame } from '@/utils/api/avatar-frames-api.js';
import FramedAvatar from './FramedAvatar.vue';

const props = defineProps({
  avatarUrl: { type: String, default: '' },
  /** 档位 code；传了直接用（内嵌壳），不传内部 fetch（弹层壳） */
  tierCode: { type: String, default: '' }
});

const emit = defineEmits(['unlock']);

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);
const { fetchUserTier, getUserTierCode } = useUserTier();

const internalTier = ref(props.tierCode || 'free');
if (!props.tierCode) {
  onMounted(async () => {
    try {
      const id = userInfo.value?.id;
      if (id) await fetchUserTier(id);
      const code = getUserTierCode(id) || 'free';
      if (code) internalTier.value = code;
    } catch { /* 保持 free 兜底 */ }
  });
}
const tierRef = computed(() => props.tierCode || internalTier.value);

const { frames, effectiveFrame, ownedIds, equip, nowMs, tierOf, purchasedIds, refreshMyAvatarFrameUnlocks } = useAvatarFrame(tierRef);

/* ── 积分解锁 ── */
const pendingPurchase = ref(null);
const purchasing = ref(false);
const purchaseError = ref('');
const myPoints = computed(() => Number(userInfo.value?.points) || 0);

/** 已用积分永久买断（与「档位够 / 限免中」区分开，后者不该再劝买） */
const isPermanentlyOwned = computed(() => Boolean(effectiveFrame.value?.id) && purchasedIds.value.has(effectiveFrame.value.id));
const canBuyPermanent = computed(() => {
  const f = effectiveFrame.value;
  return Boolean(f && f.pointsPrice && f.id !== 'none' && !isPermanentlyOwned.value);
});

function startPurchase(frame) {
  pendingPurchase.value = frame;
  purchaseError.value = '';
}

const displayInitial = computed(() => (userInfo.value?.username || 'U').charAt(0).toUpperCase());
const regularFrames = computed(() => frames.value.filter((f) => !f.limited));
const limitedFrames = computed(() => frames.value.filter((f) => f.limited));
const isEquippedOwned = computed(() => effectiveFrame.value.id !== 'none');

const TIER_LABELS = { free: '全员可戴', plus: 'Plus 解锁', pro: 'Pro 解锁', max: 'Max 解锁', ultra: 'Ultra 专属', limit: '活动限定' };
const tierLabel = (tier) => TIER_LABELS[tier] || tier;

/** 该框当刻是否在限时免费期内（卡片角标用） */
const isFreeCampaign = (frame) => isFrameFreeNow(frame, nowMs.value);

/** 预览条 pill：限免期优先展示限免信息，到期自动回落到声明档位标 */
const previewPill = computed(() => {
  const f = effectiveFrame.value;
  if (isFrameFreeNow(f, nowMs.value)) {
    const d = freeUntilLabel(f);
    return { text: d ? `限时免费至 ${d}` : '限时免费', tier: 'free' };
  }
  const t = tierOf(f);
  return { text: tierLabel(t), tier: t };
});

function handleCardClick(frame) {
  if (ownedIds.value.includes(frame.id)) {
    equip(frame.id);
    return;
  }
  // 有积分价的框走站内购买；没有的交给壳（跳订阅 tab）
  if (frame.pointsPrice) {
    startPurchase(frame);
    return;
  }
  emit('unlock', frame);
}

const PURCHASE_ERROR_TEXT = {
  INSUFFICIENT_POINTS: '积分不足',
  NOT_PURCHASABLE: '这个框当前不支持积分购买',
  FRAME_NOT_FOUND: '这个框已下架',
  NOT_AUTHENTICATED: '请先登录后再解锁'
};

async function confirmPurchase() {
  const frame = pendingPurchase.value;
  if (!frame || purchasing.value) return;
  purchasing.value = true;
  purchaseError.value = '';
  try {
    const res = await purchaseAvatarFrame(frame.id);
    if (!res.ok) {
      const base = PURCHASE_ERROR_TEXT[res.message] || `解锁失败：${res.message || '未知错误'}`;
      purchaseError.value = res.message === 'INSUFFICIENT_POINTS'
        ? `${base}：需要 ${res.requiredPoints}，当前 ${res.currentPoints}`
        : base;
      return;
    }
    // 余额以服务端返回值为准就地同步，不必等下次登录
    if (userInfo.value) userInfo.value.points = res.currentPoints;
    await refreshMyAvatarFrameUnlocks();
    equip(frame.id);
    pendingPurchase.value = null;
  } catch {
    purchaseError.value = '解锁失败，请稍后重试';
  } finally {
    purchasing.value = false;
  }
}
</script>

<style scoped>
.afg-root {
  display: flex;
  flex-direction: column;
  /* 内嵌资产中心（横屏）时限宽居中，与下方积分卡面区块对齐；弹层内 560px 容器下不生效 */
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
}

/* 预览条上的永久解锁入口 */
.afg-buy-btn {
  padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(20, 89, 217, 0.3);
  background: rgba(20, 89, 217, 0.08); color: #1459d9; font-size: 11.5px; font-weight: 600;
  font-family: inherit; cursor: pointer; transition: .16s;
}
.afg-buy-btn:hover { background: rgba(20, 89, 217, 0.16); }
.user-space-page[data-theme="dark"] .afg-buy-btn {
  border-color: rgba(41, 151, 255, 0.4); background: rgba(41, 151, 255, 0.14); color: #7fc0ff;
}

/* ─── 积分解锁确认条 ─── */
.afg-purchase {
  display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap;
  margin-bottom: 12px; padding: 12px 14px; border-radius: 14px;
  border: 1px solid rgba(20, 89, 217, 0.22); background: rgba(20, 89, 217, 0.06);
}
.afg-purchase-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.afg-purchase-txt b { font-size: 13px; color: #16336e; }
.afg-purchase-txt span { font-size: 12px; color: #4a5a78; }
.afg-purchase-txt em { font-style: normal; font-weight: 700; color: #1459d9; }
.afg-purchase-txt .note { color: #7a8399; font-size: 11.5px; }
.afg-purchase-txt .err { color: #b3261e; font-weight: 600; }
.afg-purchase-actions { display: flex; gap: 8px; }
.afg-p-btn {
  padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(31, 41, 66, 0.14);
  background: #fff; color: #1f2430; font-size: 12.5px; font-family: inherit; cursor: pointer;
}
.afg-p-btn.primary { background: #1459d9; border-color: #1459d9; color: #fff; }
.afg-p-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.user-space-page[data-theme="dark"] .afg-purchase {
  border-color: rgba(41, 151, 255, 0.28); background: rgba(41, 151, 255, 0.1);
}
.user-space-page[data-theme="dark"] .afg-purchase-txt b { color: #cfe0ff; }
.user-space-page[data-theme="dark"] .afg-purchase-txt span { color: #a9b6cc; }
.user-space-page[data-theme="dark"] .afg-p-btn { background: rgba(255,255,255,.08); color: #f5f5f7; border-color: rgba(255,255,255,.14); }
.user-space-page[data-theme="dark"] .afg-p-btn.primary { background: #2997ff; border-color: #2997ff; color: #fff; }

/* ─── 试戴预览条 ─── */
.afg-preview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border: 0.5px solid rgba(255, 255, 255, 0.62);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.afg-preview-info {
  min-width: 0;
}

.afg-preview-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.afg-preview-name-row strong {
  font-size: 15px;
  font-weight: 750;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

.afg-wearing {
  font-size: 11px;
  font-weight: 600;
  color: #8e8e93;
}

.afg-preview-desc {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #747b86;
}

.afg-tier-pill {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
}

.afg-tier-pill.is-free { background: rgba(216, 90, 48, 0.12); color: #b3491f; }
.afg-tier-pill.is-plus { background: rgba(0, 113, 227, 0.1); color: #0071e3; }
.afg-tier-pill.is-pro { background: rgba(154, 163, 178, 0.16); color: #5f6b80; }
.afg-tier-pill.is-max { background: rgba(232, 147, 12, 0.14); color: #b07508; }
.afg-tier-pill.is-ultra { background: rgba(127, 119, 221, 0.14); color: #534ab7; }
.afg-tier-pill.is-limit { background: rgba(216, 90, 48, 0.12); color: #993c1d; }

/* ─── 分组 + 网格 ─── */
.afg-group-label {
  margin: 14px 2px 8px;
  font-size: 12px;
  font-weight: 650;
  color: #8e8e93;
}

.afg-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.afg-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 14px 6px 11px;
  border: 0.5px solid rgba(255, 255, 255, 0.66);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.56);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: transform 180ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 180ms ease, border-color 150ms ease, background-color 150ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .afg-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.09);
  }
}

.afg-card:active {
  transform: scale(0.97);
}

.afg-card.is-active {
  border: 2px solid #0071e3;
  background: rgba(0, 113, 227, 0.07);
}

.afg-card.is-locked {
  cursor: pointer;
  opacity: 0.62;
}

.afg-card.is-locked :deep(.fa-mock-ring),
.afg-card.is-locked :deep(.fa-img),
.afg-card.is-locked :deep(.fa-fallback) {
  filter: grayscale(1);
}

.afg-card.is-placeholder {
  border: 1.5px dashed rgba(15, 23, 42, 0.16);
  background: transparent;
  box-shadow: none;
  cursor: default;
}

.afg-card.is-placeholder:hover {
  transform: none;
  box-shadow: none;
}

.afg-check {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #0071e3;
  color: #fff;
}

.afg-limit-flag {
  position: absolute;
  top: -7px;
  right: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #fac775;
  color: #633806;
  font-size: 10px;
  font-weight: 700;
}

/* 限时免费角标：与「限定」区分色相，走暖橙 */
.afg-limit-flag.is-campaign {
  background: linear-gradient(135deg, #ffb27a, #f2793f);
  color: #5c2408;
}

.afg-card-avatar {
  margin-top: 2px;
}

.afg-card-name {
  font-size: 12px;
  font-weight: 600;
  color: #3a3a3c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.afg-card.is-active .afg-card-name {
  color: #0071e3;
}

.afg-lock-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 650;
}

.afg-lock-pill.is-plus { background: rgba(0, 113, 227, 0.1); color: #005bb8; }
.afg-lock-pill.is-pro { background: rgba(154, 163, 178, 0.16); color: #5f6b80; }
.afg-lock-pill.is-max { background: rgba(232, 147, 12, 0.14); color: #8a5506; }
.afg-lock-pill.is-ultra { background: rgba(127, 119, 221, 0.14); color: #3c3489; }

.afg-placeholder-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-top: 2px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.05);
  color: #a1a1a6;
  font-size: 18px;
  font-weight: 500;
}

/* ─── 暗色 ─── */
.user-space-page[data-theme="dark"] .afg-preview {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: none;
}

.user-space-page[data-theme="dark"] .afg-preview-name-row strong {
  color: #f5f5f7;
}

.user-space-page[data-theme="dark"] .afg-preview-desc {
  color: #a1a1a6;
}

.user-space-page[data-theme="dark"] .afg-tier-pill.is-free { background: rgba(240, 153, 123, 0.18); color: #f0997b; }
.user-space-page[data-theme="dark"] .afg-tier-pill.is-plus { background: rgba(41, 151, 255, 0.16); color: #2997ff; }
.user-space-page[data-theme="dark"] .afg-tier-pill.is-pro { background: rgba(184, 192, 206, 0.16); color: #b8c0ce; }
.user-space-page[data-theme="dark"] .afg-tier-pill.is-max { background: rgba(255, 179, 64, 0.16); color: #ffb340; }
.user-space-page[data-theme="dark"] .afg-tier-pill.is-ultra { background: rgba(175, 169, 236, 0.18); color: #afa9ec; }
.user-space-page[data-theme="dark"] .afg-tier-pill.is-limit { background: rgba(240, 153, 123, 0.16); color: #f0997b; }

.user-space-page[data-theme="dark"] .afg-group-label {
  color: #a1a1a6;
}

.user-space-page[data-theme="dark"] .afg-card {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.045);
  box-shadow: none;
}

.user-space-page[data-theme="dark"] .afg-card.is-active {
  border-color: #2997ff;
  background: rgba(41, 151, 255, 0.12);
}

.user-space-page[data-theme="dark"] .afg-card.is-active .afg-card-name,
.user-space-page[data-theme="dark"] .afg-check {
  color: #f5f5f7;
}

.user-space-page[data-theme="dark"] .afg-check {
  background: #2997ff;
}

.user-space-page[data-theme="dark"] .afg-card.is-placeholder {
  border-color: rgba(255, 255, 255, 0.16);
}

.user-space-page[data-theme="dark"] .afg-card-name {
  color: #d1d1d6;
}

.user-space-page[data-theme="dark"] .afg-lock-pill.is-plus { background: rgba(41, 151, 255, 0.16); color: #2997ff; }
.user-space-page[data-theme="dark"] .afg-lock-pill.is-pro { background: rgba(184, 192, 206, 0.16); color: #b8c0ce; }
.user-space-page[data-theme="dark"] .afg-lock-pill.is-max { background: rgba(255, 179, 64, 0.16); color: #ffb340; }
.user-space-page[data-theme="dark"] .afg-lock-pill.is-ultra { background: rgba(175, 169, 236, 0.18); color: #afa9ec; }

.user-space-page[data-theme="dark"] .afg-placeholder-avatar {
  background: rgba(255, 255, 255, 0.06);
  color: #6e6e73;
}

/* ─── 响应式 ─── */
@media (max-width: 640px) {
  .afg-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .afg-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .afg-preview {
    padding: 13px 14px;
    gap: 13px;
  }
}
</style>
