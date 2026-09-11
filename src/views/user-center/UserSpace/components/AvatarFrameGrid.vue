<template>
  <div class="afg-root">
    <!-- 试戴预览条：即点即换，配合同页顶卡头像同步 -->
    <div class="afg-preview">
      <FramedAvatar :src="avatarUrl" :initial="displayInitial" :size="88"
        :frame-url="effectiveFrame.url" :ring="effectiveFrame.url ? '' : effectiveFrame.ring"
        :frame-scale="effectiveFrame.scale || 0" />
      <div class="afg-preview-info">
        <div class="afg-preview-name-row">
          <strong>{{ effectiveFrame.name }}</strong>
          <span v-if="effectiveFrame.id !== 'none'" class="afg-tier-pill" :class="`is-${effectiveFrame.tier}`">
            {{ tierLabel(effectiveFrame.tier) }}
          </span>
          <span class="afg-wearing">{{ isEquippedOwned ? '佩戴中' : '未佩戴' }}</span>
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
        <span v-if="frame.id === effectiveFrame.id" class="afg-check" aria-hidden="true">
          <Check :size="11" :stroke-width="3" />
        </span>
        <FramedAvatar :src="avatarUrl" :initial="displayInitial" :size="52"
          :frame-url="frame.url" :ring="frame.url ? '' : frame.ring" :frame-scale="frame.scale || 0" class="afg-card-avatar" />
        <span class="afg-card-name">{{ frame.name }}</span>
        <span v-if="!ownedIds.includes(frame.id)" class="afg-lock-pill" :class="`is-${frame.tier}`">
          <Lock :size="9" :stroke-width="2.4" />
          {{ tierLabel(frame.tier) }}
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
        <span v-if="frame.id === effectiveFrame.id" class="afg-check" aria-hidden="true">
          <Check :size="11" :stroke-width="3" />
        </span>
        <FramedAvatar :src="avatarUrl" :initial="displayInitial" :size="52"
          :frame-url="frame.url" :ring="frame.url ? '' : frame.ring" :frame-scale="frame.scale || 0" class="afg-card-avatar" />
        <span class="afg-card-name">{{ frame.name }}</span>
        <span v-if="!ownedIds.includes(frame.id)" class="afg-lock-pill" :class="`is-${frame.tier}`">
          <Lock :size="9" :stroke-width="2.4" />
          {{ tierLabel(frame.tier) }}
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

const { frames, effectiveFrame, ownedIds, equip } = useAvatarFrame(tierRef);

const displayInitial = computed(() => (userInfo.value?.username || 'U').charAt(0).toUpperCase());
const regularFrames = computed(() => frames.filter((f) => !f.limited));
const limitedFrames = computed(() => frames.filter((f) => f.limited));
const isEquippedOwned = computed(() => effectiveFrame.value.id !== 'none');

const TIER_LABELS = { plus: 'Plus 解锁', pro: 'Pro 解锁', max: 'Max 解锁', ultra: 'Ultra 专属', limit: '活动限定' };
const tierLabel = (tier) => TIER_LABELS[tier] || tier;

function handleCardClick(frame) {
  if (ownedIds.value.includes(frame.id)) {
    equip(frame.id);
    return;
  }
  emit('unlock', frame);
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

.afg-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.09);
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
