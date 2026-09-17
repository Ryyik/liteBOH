<template>
  <div v-if="hasError" class="geb-root" role="alert" aria-live="assertive">
    <div class="geb-card liquid-glass liquid-glass--strong">
      <div class="geb-icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 class="geb-title">{{ title }}</h2>
      <p class="geb-message">{{ displayMessage }}</p>
      <div class="geb-actions">
        <button type="button" class="geb-btn geb-btn--primary" @click="handleRetry">重试</button>
        <button type="button" class="geb-btn" @click="handleGoHome">回到首页</button>
        <button type="button" class="geb-btn" :disabled="isHardReloading" @click="handleHardReload">
          {{ isHardReloading ? '正在重载…' : '清除缓存后重载' }}
        </button>
      </div>
      <p class="geb-hint">若反复出现，请点「清除缓存后重载」以获取最新版本。</p>
      <details v-if="showDetails && errorStack" class="geb-details">
        <summary>技术细节</summary>
        <pre>{{ errorStack }}</pre>
      </details>
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
/**
 * 全局渲染错误边界。
 *
 * 为什么需要它：main.js 的 app.config.errorHandler 只负责「记录」，渲染管线抛错后
 * 组件树已经崩掉、界面不会自愈，用户看到的是纯白页且没有任何出口（release 报告 S6）。
 * 本组件是 RouterView 唯一的兜底 UI。
 *
 * 与 views/Lab/components/ErrorBoundary.vue 的区别：Lab 版样式依赖 Lab 作用域的
 * 局部变量（--card / --foreground / --radius-sm，其中 --radius-sm 全局并未定义），
 * 直接搬来全局会裸奔。因此本组件只取全局单一源 --liquid-*（自带亮暗两套），
 * Lab 版保持原样不动，避免回归。
 *
 * 复用纪律：只用 --liquid-* token，不自行写死主题色；暗色由 token 自动翻转，
 * 不写死宿主 class。
 */
import { computed, onErrorCaptured, ref } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  title: { type: String, default: '页面出了点问题' },
  fallbackMessage: {
    type: String,
    default: '这个页面在加载时遇到了错误，你的数据不会丢失。'
  },
  showDetails: { type: Boolean, default: false }
});

const emit = defineEmits(['error', 'recover']);

const router = useRouter();

const hasError = ref(false);
const errorMessage = ref('');
const errorStack = ref('');
const isHardReloading = ref(false);

const displayMessage = computed(() => errorMessage.value || props.fallbackMessage);

const resetState = () => {
  hasError.value = false;
  errorMessage.value = '';
  errorStack.value = '';
};

onErrorCaptured((err, instance, info) => {
  hasError.value = true;
  errorMessage.value = err?.message ? String(err.message) : props.fallbackMessage;
  errorStack.value = err?.stack ? String(err.stack) : String(err ?? '');
  emit('error', { error: err, info });
  // 返回 false 阻止错误继续向上冒泡；同时本组件切到 fallback 分支，
  // 出错的 slot 子树不再渲染，白屏被提示卡替代。
  return false;
});

const handleRetry = () => {
  resetState();
  emit('recover', 'retry');
};

const handleGoHome = () => {
  resetState();
  emit('recover', 'home');
  const current = router.currentRoute.value;
  if (current.path !== '/') {
    // 同一路由重复 push 会抛 NavigationDuplicated，这里吞掉即可
    Promise.resolve(router.push('/')).catch(() => {});
  }
};

const handleHardReload = async () => {
  if (isHardReloading.value) return;
  isHardReloading.value = true;
  try {
    // 动态 import：出错状态下避免再为静态依赖增加加载失败面
    const mod = await import('@/utils/version-checker.js');
    await mod.forceCleanAndReload();
  } catch {
    window.location.reload();
  }
};
</script>

<style scoped>
.geb-root {
  --geb-danger: #d64545;
  --geb-on-primary: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 60vh;
  padding: 32px 20px;
}

html[data-theme="dark"] .geb-root {
  --geb-danger: #ff7b7b;
  --geb-on-primary: #1d1d1f;
}

.geb-card {
  box-sizing: border-box;
  width: 100%;
  max-width: 420px;
  padding: 28px 24px;
  text-align: center;
}

.geb-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
  color: var(--geb-danger);
}

.geb-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 500;
  color: var(--liquid-text-primary);
}

.geb-message {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--liquid-text-secondary);
  overflow-wrap: anywhere;
}

.geb-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.geb-btn {
  padding: 9px 16px;
  border: 1px solid var(--liquid-border-hairline);
  border-radius: var(--liquid-radius-pill);
  background: var(--liquid-bg-strong);
  color: var(--liquid-text-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--duration-fast) var(--ease-out),
    transform var(--duration-press) var(--ease-out);
}

.geb-btn:hover:not(:disabled) {
  opacity: 0.82;
}

.geb-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.geb-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.geb-btn--primary {
  border-color: transparent;
  background: var(--liquid-text-primary);
  color: var(--geb-on-primary);
}

.geb-hint {
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--liquid-text-tertiary);
}

.geb-details {
  width: 100%;
  margin-top: 16px;
  text-align: left;
}

.geb-details summary {
  margin-bottom: 8px;
  color: var(--liquid-text-tertiary);
  font-size: 12px;
  cursor: pointer;
}

.geb-details pre {
  max-height: 200px;
  padding: 12px;
  overflow: auto;
  border-radius: var(--liquid-radius-md);
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-secondary);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
