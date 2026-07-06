<template>
  <Teleport to="body">
    <Transition name="quota-slide">
      <div v-if="visible" class="quota-backdrop" style="z-index: 2147483660 !important;" role="presentation"
        @click.self="$emit('close')" @keydown.escape="$emit('close')">
        <aside class="quota-drawer" @click.stop role="dialog" aria-modal="true" aria-label="AI 使用额度">
          <header class="quota-header">
            <h2 tabindex="-1">AI 使用额度</h2>
            <button type="button" class="quota-close-btn" title="关闭 (Esc)" @click="$emit('close')" aria-label="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="quota-body custom-scrollbar">
            <div v-if="loading" class="quota-loading">加载中...</div>

            <template v-else-if="quota">
              <!-- 会员等级卡片 -->
              <div class="quota-card">
                <div class="quota-tier-section">
                  <div class="quota-icon bg-blue">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                  <div class="quota-label-stack">
                    <span class="quota-label">会员等级</span>
                    <span class="quota-desc">{{ tierLabel }}</span>
                  </div>
                </div>
              </div>

              <!-- 使用额度卡片 -->
              <div class="quota-card">
                <div class="quota-group-title">今日额度</div>
                
                <div v-if="quota.limit === -1" class="quota-unlimited-row">
                  <div class="quota-icon bg-green">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div class="quota-label-stack">
                    <span class="quota-label">无限额度</span>
                    <span class="quota-desc">尽情使用 BOH AI</span>
                  </div>
                </div>

                <div v-else class="quota-meter-row">
                  <div class="quota-meter-info">
                    <strong>使用情况</strong>
                    <small>{{ quota.used }} / {{ quota.limit }} 条</small>
                  </div>
                  <div class="quota-meter-track">
                    <div class="quota-meter-fill" :style="{ width: barPercent + '%' }"
                      :class="{ warn: barPercent >= 80, danger: barPercent >= 95 }" />
                  </div>
                  <div class="quota-meter-details">
                    <div class="quota-meter-detail-row">
                      <span>剩余额度</span>
                      <strong>{{ quota.limit - quota.used }} 条</strong>
                    </div>
                    <div class="quota-meter-detail-row">
                      <span>重置时间</span>
                      <strong>明日 0:00</strong>
                    </div>
                  </div>
                  <p v-if="quota.used >= quota.limit" class="quota-exhausted">今日额度已用完</p>
                </div>
              </div>
            </template>
          </div>

          <footer class="quota-footer">
            <button v-if="!authStore.isLoggedIn" type="button" class="quota-action-btn primary" @click="handleLogin">
              登录享受更高额度
            </button>
            <button v-else-if="quota && quota.tier === 'free'" type="button" class="quota-action-btn primary" @click="handleUpgrade">
              升级订阅解锁更多
            </button>
            <div v-else-if="quota" class="quota-tier-note">
              <strong>{{ TIER_LABELS[quota.tier] || quota.tier }}</strong>
              <span>{{ quota.limit === -1 ? '无限额度' : `每日 ${quota.limit} 条` }}</span>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getAiQuotaStatus } from '@/utils/api/api-key-runtime-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import { resolveHighestTierCode } from '@/utils/subscription-benefits.js';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);

// 调试日志：显示层级信息
watch(() => props.visible, (val) => {
  if (val) {
    setTimeout(() => {
      const backdrop = document.querySelector('.quota-backdrop');
      const glassOverlay = document.querySelector('.global-ai-glass-overlay');
      console.log('===== AiQuotaSidePanel 层级调试 =====');
      console.log('AiQuotaSidePanel (.quota-backdrop):', {
        存在: !!backdrop,
        zIndex: backdrop ? backdrop.style.zIndex || getComputedStyle(backdrop).zIndex : 'N/A',
        computedZIndex: backdrop ? getComputedStyle(backdrop).zIndex : 'N/A',
        DOM位置: backdrop ? Array.from(document.body.children).indexOf(backdrop) : 'N/A'
      });
      console.log('GlobalAiGlassOverlay (.global-ai-glass-overlay):', {
        存在: !!glassOverlay,
        computedZIndex: glassOverlay ? getComputedStyle(glassOverlay).zIndex : 'N/A',
        DOM位置: glassOverlay ? Array.from(document.body.children).indexOf(glassOverlay) : 'N/A'
      });
      console.log('body子元素顺序:', Array.from(document.body.children).map(el => el.className || el.id || el.tagName).slice(0, 15));
      console.log('========================================');
    }, 50);
  }
});
const router = useRouter();

const authStore = useAuthStore();
const loading = ref(false);
const quota = ref(null);

const TIER_LABELS = {
  guest: '未登录用户',
  free: '免费用户',
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra'
};

const tierLabel = computed(() => TIER_LABELS[quota.value?.tier] || quota.value?.tier || '');
const barPercent = computed(() => {
  if (!quota.value || quota.value.limit <= 0) return 0;
  return Math.min(100, Math.round((quota.value.used / quota.value.limit) * 100));
});

const fetchQuota = async () => {
  loading.value = true;
  try {
    const [quotaRes, subsRes] = await Promise.all([
      getAiQuotaStatus(),
      authStore.userInfo?.id ? getMySubscriptions(authStore.userInfo.id, { includeExpired: false }) : Promise.resolve({ ok: false, data: [] })
    ]);
    if (quotaRes.ok && quotaRes.data) {
      quota.value = quotaRes.data;
      const realTier = resolveHighestTierCode(subsRes.data || []);
      if (realTier) {
        quota.value.tier = realTier;
      }
    }
  } catch {
    quota.value = null;
  } finally {
    loading.value = false;
  }
};

watch(() => props.visible, (v) => {
  if (v) fetchQuota();
});

const handleLogin = () => {
  authStore.showLoginModal = true;
  emit('close');
};

const handleUpgrade = () => {
  emit('close');
  router.push('/user-center/subscriptions');
};
</script>

<style scoped>
/* 背景层 - 与设置面板一致，但层级更高 */
.quota-backdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483660 !important; /* 最高层级，超过所有已知元素（GlobalAiGlassOverlay: 2147483646，BohaiSidebar: 2147483651） */
  display: flex !important;
  align-items: stretch !important;
  justify-content: flex-end !important;
  padding: 12px !important;
    background: rgba(61, 57, 41, 0.22) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  isolation: isolate;
  will-change: transform;
}

/* 侧拉面板 - 从右侧滑入 */
.quota-drawer {
  width: min(420px, calc(100vw - 24px)) !important;
  height: calc(100dvh - 24px) !important;
  display: grid !important;
  grid-template-rows: auto minmax(0, 1fr) auto !important;
  overflow: hidden !important;
  border: 1px solid #dad9d4 !important;
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  color: #3d3929 !important;
  box-shadow: 0 24px 70px rgba(61, 57, 41, 0.24) !important;
}

/* 头部 */
.quota-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid #dad9d4;
}

.quota-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #3d3929;
}

.quota-close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #6e6d68;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quota-close-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #3d3929;
}

/* 主体内容 */
.quota-body {
  padding: 12px 14px;
  overflow-y: auto;
}

.quota-loading {
  padding: 40px 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

/* 卡片样式 - 与设置面板一致 */
.quota-card {
  background: #f5f4ef;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}

.quota-card:last-child {
  margin-bottom: 0;
}

.quota-group-title {
  font-size: 12px;
  font-weight: 600;
  color: #6e6d68;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  padding-bottom: 6px;
}

/* 行样式 - 与设置面板一致 */
.quota-tier-section,
.quota-unlimited-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
}

.quota-label-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quota-label {
  font-size: 14px;
  font-weight: 600;
  color: #3d3929;
}

.quota-desc {
  font-size: 13px;
  color: #6e6d68;
}

/* 图标样式 */
.quota-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(201, 100, 66, 0.12);
  color: #C96442;
}

.quota-icon.bg-blue {
  background: rgba(201, 100, 66, 0.12);
  color: #C96442;
}

.quota-icon.bg-green {
  background: rgba(120, 140, 93, 0.12);
  color: #788c5d;
}

/* 进度条样式 - 与设置面板上下文使用率一致 */
.quota-meter-row {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 10px;
}

.quota-meter-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.quota-meter-info strong {
  font-size: 14px;
  font-weight: 600;
  color: #3d3929;
}

.quota-meter-info small {
  font-size: 12px;
  color: #6e6d68;
}

.quota-meter-track {
  height: 6px;
  background: #dad9d4;
  border-radius: 999px;
  overflow: hidden;
}

.quota-meter-fill {
  height: 100%;
  background: #C96442;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.quota-meter-fill.warn {
  background: #f59e0b;
}

.quota-meter-fill.danger {
  background: #ef4444;
}

.quota-meter-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #dad9d4;
}

.quota-meter-detail-row {
  display: flex;
  justify-content: space-between;
}

.quota-meter-detail-row span {
  font-size: 12px;
  color: #6e6d68;
}

.quota-meter-detail-row strong {
  font-size: 13px;
  font-weight: 600;
  color: #3d3929;
}

.quota-exhausted {
  font-size: 14px;
  color: #ef4444;
  font-weight: 500;
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border-radius: 8px;
}

/* 底部 */
.quota-footer {
  padding: 16px 18px;
  border-top: 1px solid #dad9d4;
}

.quota-action-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.quota-action-btn.primary {
  background: #C96442;
  color: #fff;
}

.quota-action-btn.primary:hover {
  background: #b0562f;
}

.quota-tier-note {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quota-tier-note strong {
  font-size: 13px;
  font-weight: 700;
  color: #6e6d68;
}

.quota-tier-note span {
  font-size: 12px;
  color: #9b988c;
}

/* 过渡动画 */
.quota-slide-enter-active,
.quota-slide-leave-active {
  transition: all 0.3s ease;
  z-index: 2147483660 !important; /* 确保过渡期间层级最高 */
  isolation: isolate;
  will-change: transform;
}

.quota-slide-enter-active .quota-drawer,
.quota-slide-leave-active .quota-drawer {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.quota-slide-enter-from .quota-drawer,
.quota-slide-leave-to .quota-drawer {
  transform: translateX(100%);
}

.quota-slide-enter-from,
.quota-slide-leave-to {
  opacity: 0;
  z-index: 2147483660 !important; /* 确保开始/结束状态层级最高 */
  isolation: isolate;
  will-change: transform;
}

/* 深色模式 */
[data-boh-theme="dark"] .quota-drawer {
  background: rgba(28, 28, 30, 0.98);
  border-color: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

[data-boh-theme="dark"] .quota-header {
  border-color: rgba(255, 255, 255, 0.1);
}

[data-boh-theme="dark"] .quota-header h2 {
  color: #f8fafc;
}

[data-boh-theme="dark"] .quota-close-btn {
  color: #9ca3af;
}

[data-boh-theme="dark"] .quota-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

[data-boh-theme="dark"] .quota-card {
  background: rgba(40, 40, 42, 0.6);
}

[data-boh-theme="dark"] .quota-group-title {
  color: #9ca3af;
}

[data-boh-theme="dark"] .quota-tier-section,
[data-boh-theme="dark"] .quota-unlimited-row,
[data-boh-theme="dark"] .quota-meter-row {
  background: rgba(40, 40, 42, 0.6);
}

[data-boh-theme="dark"] .quota-label {
  color: #f8fafc;
}

[data-boh-theme="dark"] .quota-desc {
  color: #9ca3af;
}

[data-boh-theme="dark"] .quota-icon {
  background: rgba(255, 255, 255, 0.08);
}

[data-boh-theme="dark"] .quota-icon.bg-blue {
  background: rgba(201, 100, 66, 0.15);
}

[data-boh-theme="dark"] .quota-icon.bg-green {
  background: rgba(120, 140, 93, 0.15);
}

[data-boh-theme="dark"] .quota-meter-track {
  background: rgba(255, 255, 255, 0.1);
}

[data-boh-theme="dark"] .quota-meter-details {
  border-top-color: rgba(255, 255, 255, 0.08);
}

[data-boh-theme="dark"] .quota-meter-info strong,
[data-boh-theme="dark"] .quota-meter-detail-row strong {
  color: #f8fafc;
}

[data-boh-theme="dark"] .quota-meter-info small,
[data-boh-theme="dark"] .quota-meter-detail-row span {
  color: #9ca3af;
}

[data-boh-theme="dark"] .quota-footer {
  border-color: rgba(255, 255, 255, 0.1);
}

[data-boh-theme="dark"] .quota-tier-note strong,
[data-boh-theme="dark"] .quota-tier-note span {
  color: #9ca3af;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .quota-backdrop {
    padding: 0 !important;
  }
  
  .quota-drawer {
    width: 100vw !important;
    height: 100dvh !important;
    border-radius: 0 !important;
    border: none !important;
  }
}
</style>
