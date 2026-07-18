<template>
  <Teleport to="body" :disabled="embedded">
    <Transition name="quota-slide">
      <div v-if="visible" class="quota-backdrop" :class="{ 'is-embedded': embedded }" role="presentation"
        @click.self="$emit('close')" @keydown.escape="$emit('close')">
        <aside class="quota-drawer" @click.stop role="dialog" aria-modal="true" aria-label="AI 使用情况">
          <header class="quota-header">
            <div><h2 tabindex="-1">使用情况</h2><p>今日额度 · 北京时间 0:00 重置</p></div>
            <button type="button" class="quota-close-btn" title="关闭 (Esc)" @click="$emit('close')" aria-label="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path v-if="embedded" d="M15 18l-6-6 6-6" />
                <path v-else d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="quota-body custom-scrollbar">
            <div v-if="loading" class="quota-loading">加载中...</div>

            <template v-else-if="quota">
              <div class="usage-plan-row"><div><span>当前方案</span><strong>{{ tierLabel }}</strong></div><span class="usage-plan-chip">{{ tokenLimit === -1 ? '不限量' : '每日额度' }}</span></div>

              <section class="usage-section" aria-labelledby="token-usage-title">
                <div class="usage-section-head">
                  <div><strong id="token-usage-title">Token</strong><span>对话、思考与工具调用</span></div>
                  <b>{{ tokenLimit === -1 ? '不限' : `${barPercentLabel}%` }}</b>
                </div>
                <div class="quota-meter-track" role="progressbar" aria-label="今日 Token 使用比例"
                  :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="tokenLimit === -1 ? undefined : Number(barPercent.toFixed(2))">
                  <div class="quota-meter-fill" :class="{ 'has-usage': usedTokens > 0, unlimited: tokenLimit === -1, warn: barPercent >= 80, danger: barPercent >= 95 }"
                    :style="{ width: tokenLimit === -1 ? '100%' : barPercent + '%' }" />
                </div>
                <div class="usage-values"><span>已用 {{ formatTokenCount(usedTokens) }}</span><span>{{ tokenLimit === -1 ? '无限额度' : `共 ${formatTokenCount(tokenLimit)}` }}</span></div>
                <div class="usage-remaining">{{ tokenLimit === -1 ? '当前方案不限制 Token 用量' : `还可使用 ${formatTokenCount(remainingTokens)} Tokens` }}</div>
              </section>

              <section class="usage-section" aria-labelledby="web-usage-title">
                <div class="usage-section-head">
                  <div><strong id="web-usage-title">Web Searching</strong><span>联网搜索次数</span></div>
                  <b>{{ webSearchLimit === -1 ? '不限' : `${webPercentLabel}%` }}</b>
                </div>
                <div class="quota-meter-track" role="progressbar" aria-label="今日联网搜索使用比例"
                  :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="webSearchLimit === -1 ? undefined : Number(webPercent.toFixed(2))">
                  <div class="quota-meter-fill web" :class="{ 'has-usage': webSearchUsed > 0, unlimited: webSearchLimit === -1, warn: webPercent >= 80, danger: webPercent >= 95 }"
                    :style="{ width: webSearchLimit === -1 ? '100%' : webPercent + '%' }" />
                </div>
                <div class="usage-values"><span>已用 {{ formatTokenCount(webSearchUsed) }} 次</span><span>{{ webSearchLimit === -1 ? '无限次数' : `共 ${formatTokenCount(webSearchLimit)} 次` }}</span></div>
                <div class="usage-remaining">{{ webSearchLimit === -1 ? '当前方案不限制联网搜索' : `今天还可搜索 ${formatTokenCount(webSearchRemaining)} 次` }}</div>
              </section>

              <p class="usage-note">高倍率模型会更快消耗 Token 额度；失败的 Web Searching 不计入次数。</p>
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
              <span>明日 0:00 自动重置</span>
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
  visible: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);

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
const usedTokens = computed(() => Math.max(0, Number(quota.value?.usedTokens ?? quota.value?.used ?? 0)));
const tokenLimit = computed(() => Number(quota.value?.tokenLimit ?? quota.value?.limit ?? 0));
const remainingTokens = computed(() => tokenLimit.value === -1
  ? -1
  : Math.max(0, Number(quota.value?.remainingTokens ?? (tokenLimit.value - usedTokens.value))));
const formatTokenCount = (value) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })
  .format(Math.max(0, Number(value || 0)));
const formatQuotaPercent = (value) => {
  if (value <= 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
};
const barPercent = computed(() => {
  if (!quota.value || tokenLimit.value <= 0) return 0;
  return Math.min(100, Math.max(0, (usedTokens.value / tokenLimit.value) * 100));
});
const barPercentLabel = computed(() => formatQuotaPercent(barPercent.value));
const webSearchUsed = computed(() => Math.max(0, Number(quota.value?.webSearchUsed ?? 0)));
const webSearchLimit = computed(() => Number(quota.value?.webSearchLimit ?? 0));
const webSearchRemaining = computed(() => webSearchLimit.value === -1 ? -1 : Math.max(0, Number(quota.value?.webSearchRemaining ?? (webSearchLimit.value - webSearchUsed.value))));
const webPercent = computed(() => webSearchLimit.value > 0 ? Math.min(100, Math.max(0, (webSearchUsed.value / webSearchLimit.value) * 100)) : 0);
const webPercentLabel = computed(() => formatQuotaPercent(webPercent.value));

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
  z-index: 2147483645 !important;
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

.quota-backdrop.is-embedded {
  position: absolute !important;
  padding: 0 !important;
  background: #ffffff !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  z-index: 310 !important;
}

.quota-backdrop.is-embedded .quota-drawer {
  width: 100% !important;
  height: 100% !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
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
.quota-header p { margin: 3px 0 0; color: #737373; font-size: 11px; }

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

.quota-close-btn,
.quota-action-btn {
  transition: transform 140ms ease, background-color 160ms ease, color 160ms ease, box-shadow 180ms ease;
}

.quota-close-btn:active,
.quota-action-btn:active { transform: scale(0.96); }

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

.usage-plan-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 2px 18px; border-bottom: 1px solid #e5e5e5;
}
.usage-plan-row > div { display: grid; gap: 3px; }
.usage-plan-row span { color: #737373; font-size: 12px; }
.usage-plan-row strong { color: #171717; font-size: 16px; }
.usage-plan-chip { padding: 5px 9px; border-radius: 999px; background: #f2f2f2; color: #525252 !important; font-weight: 600; }
.usage-section { padding: 20px 2px; border-bottom: 1px solid #e5e5e5; }
.usage-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 13px; }
.usage-section-head > div { display: grid; gap: 3px; }
.usage-section-head strong { color: #171717; font-size: 14px; }
.usage-section-head span { color: #737373; font-size: 11px; }
.usage-section-head b { color: #171717; font-size: 14px; font-variant-numeric: tabular-nums; }
.usage-values { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; color: #737373; font-size: 11px; }
.usage-remaining { margin-top: 12px; color: #404040; font-size: 12px; font-weight: 550; }
.usage-note { margin: 16px 2px 0; color: #737373; font-size: 11px; line-height: 1.5; }

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

.quota-card {
  animation: quota-card-enter 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.quota-card:nth-child(2) { animation-delay: 55ms; }
.quota-card:nth-child(3) { animation-delay: 100ms; }

.quota-meter-fill {
  animation: quota-meter-enter 520ms cubic-bezier(0.16, 1, 0.3, 1) 120ms both;
  transform-origin: left center;
}
.quota-meter-fill.web { background: #6b7280; }
.quota-meter-fill.unlimited { background: repeating-linear-gradient(90deg, #525252 0 10px, #a3a3a3 10px 18px); }

.quota-backdrop.is-embedded.quota-slide-enter-active,
.quota-backdrop.is-embedded.quota-slide-leave-active {
  transition: opacity 220ms ease !important;
}

.quota-backdrop.is-embedded.quota-slide-enter-active .quota-drawer,
.quota-backdrop.is-embedded.quota-slide-leave-active .quota-drawer {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease !important;
}

.quota-backdrop.is-embedded.quota-slide-enter-from .quota-drawer {
  transform: translateX(28px) !important;
  opacity: 0;
}

.quota-backdrop.is-embedded.quota-slide-leave-to .quota-drawer {
  transform: translateX(18px) !important;
  opacity: 0;
}

@keyframes quota-card-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes quota-meter-enter {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .quota-backdrop *,
  .quota-backdrop *::before,
  .quota-backdrop *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
  }
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

.quota-meter-percent {
  color: #3d3929;
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}

.quota-meter-values {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: -2px 0 10px;
  color: #6e6d68;
  font-size: 12px;
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

.quota-meter-fill.has-usage {
  min-width: 3px;
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
  z-index: 2147483645 !important;
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
  z-index: 2147483645 !important;
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
[data-boh-theme="dark"] .quota-header p,
[data-boh-theme="dark"] .usage-plan-row span,
[data-boh-theme="dark"] .usage-section-head span,
[data-boh-theme="dark"] .usage-values,
[data-boh-theme="dark"] .usage-note { color: #a3a3a3; }
[data-boh-theme="dark"] .usage-plan-row,
[data-boh-theme="dark"] .usage-section { border-color: rgba(255,255,255,.1); }
[data-boh-theme="dark"] .usage-plan-row strong,
[data-boh-theme="dark"] .usage-section-head strong,
[data-boh-theme="dark"] .usage-section-head b,
[data-boh-theme="dark"] .usage-remaining { color: #f5f5f5; }
[data-boh-theme="dark"] .usage-plan-chip { background: #303030; color: #d4d4d4 !important; }

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

[data-boh-theme="dark"] .quota-meter-percent { color: #f5f5f5; }
[data-boh-theme="dark"] .quota-meter-values { color: #a3a3a3; }

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
