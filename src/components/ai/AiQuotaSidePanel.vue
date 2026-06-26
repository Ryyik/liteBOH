<template>
  <Teleport to="body">
    <Transition name="quota-panel">
      <div v-if="visible" class="quota-overlay" @click.self="$emit('close')">
        <aside class="quota-panel" @click.stop>
          <header class="quota-header">
            <h3>AI 使用额度</h3>
            <button type="button" class="close-btn" @click="$emit('close')" aria-label="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div v-if="loading" class="quota-loading">加载中...</div>

          <template v-else-if="quota">
            <section class="quota-body">
              <div class="tier-badge">{{ tierLabel }}</div>

              <div v-if="quota.limit === -1" class="quota-unlimited">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>无限额度</span>
              </div>

              <div v-else class="quota-bar-section">
                <div class="quota-bar-label">
                  <span>今日已用</span>
                  <span class="quota-count">{{ quota.used }} / {{ quota.limit }} 条</span>
                </div>
                <div class="quota-bar-track">
                  <div class="quota-bar-fill" :style="{ width: barPercent + '%' }"
                    :class="{ warn: barPercent >= 80, danger: barPercent >= 95 }" />
                </div>
                <p class="quota-reset">明日北京时间 0:00 重置</p>
                <p v-if="quota.used >= quota.limit" class="quota-exhausted">今日额度已用完</p>
              </div>
            </section>

            <footer class="quota-footer">
              <button v-if="!authStore.isLoggedIn" type="button" class="quota-btn primary" @click="handleLogin">
                登录享受更高额度
              </button>
              <button v-else-if="quota.tier === 'free'" type="button" class="quota-btn primary" @click="handleUpgrade">
                升级订阅
              </button>
              <div v-else class="quota-upgrade-note">
                {{ quota.tier === 'boh-ai-plus' ? 'BOH Plus 会员' : quota.tier === 'boh-pro' ? 'BOH Pro 会员' : 'BOH Max 会员' }} · 每日 {{ quota.limit === -1 ? '无限' : quota.limit + ' 条' }}
              </div>
            </footer>
          </template>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getAiQuotaStatus } from '@/utils/api/api-key-runtime-api.js';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
  visible: { type: Boolean, default: false }
});

const emit = defineEmits(['close']);
const router = useRouter();

const authStore = useAuthStore();
const loading = ref(false);
const quota = ref(null);

const TIER_LABELS = {
  guest: '未登录用户',
  free: '免费用户',
  'boh-ai-plus': 'BOH Plus',
  'boh-pro': 'BOH Pro',
  'boh-max': 'BOH Max'
};

const tierLabel = computed(() => TIER_LABELS[quota.value?.tier] || quota.value?.tier || '');
const barPercent = computed(() => {
  if (!quota.value || quota.value.limit <= 0) return 0;
  return Math.min(100, Math.round((quota.value.used / quota.value.limit) * 100));
});

const fetchQuota = async () => {
  loading.value = true;
  try {
    const res = await getAiQuotaStatus();
    if (res.ok && res.data) {
      quota.value = res.data;
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
  router.push('/user-center/subscription');
};
</script>

<style scoped>
.quota-overlay {
  position: fixed;
  inset: 0;
  z-index: 1080;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(2px);
  display: flex;
  justify-content: flex-end;
}

.quota-panel {
  width: 320px;
  max-width: 90vw;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -6px 0 24px rgba(0, 0, 0, 0.1);
}

.quota-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.quota-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #6b7280;
  padding: 4px;
  border-radius: 6px;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.quota-loading {
  padding: 40px 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

.quota-body {
  flex: 1;
  padding: 24px 20px;
}

.tier-badge {
  display: inline-block;
  padding: 3px 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 500;
  border-radius: 999px;
  margin-bottom: 20px;
}

.quota-unlimited {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0;
  color: #059669;
  font-size: 18px;
  font-weight: 500;
}

.quota-bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #374151;
  margin-bottom: 8px;
}

.quota-count {
  font-weight: 600;
  color: #111827;
}

.quota-bar-track {
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.quota-bar-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 999px;
  transition: width 0.5s ease;
}

.quota-bar-fill.warn {
  background: #f59e0b;
}

.quota-bar-fill.danger {
  background: #ef4444;
}

.quota-reset {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 8px;
}

.quota-exhausted {
  font-size: 14px;
  color: #ef4444;
  font-weight: 500;
  margin-top: 12px;
}

.quota-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}

.quota-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.quota-btn.primary {
  background: #1459d9;
  color: #fff;
}

.quota-btn.primary:hover {
  background: #1149b8;
}

.quota-upgrade-note {
  text-align: center;
  font-size: 13px;
  color: #6b7280;
  padding: 6px 0;
}

.quota-panel-enter-active,
.quota-panel-leave-active {
  transition: all 0.25s ease;
}

.quota-panel-enter-from .quota-panel,
.quota-panel-leave-to .quota-panel {
  transform: translateX(100%);
}

.quota-panel-enter-from,
.quota-panel-leave-to {
  opacity: 0;
}
</style>
