<template>
  <div v-if="hasError" class="error-boundary">
    <div class="error-boundary-icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <h3 class="error-boundary-title">组件渲染异常</h3>
    <p class="error-boundary-message">{{ errorMessage }}</p>
    <div class="error-boundary-actions">
      <button class="error-boundary-btn" @click="retry">重试</button>
      <button class="error-boundary-btn error-boundary-btn--secondary" @click="resetAndRetry">重置并重试</button>
    </div>
    <details v-if="showDetails" class="error-boundary-details">
      <summary>错误详情</summary>
      <pre>{{ errorStack }}</pre>
    </details>
  </div>
  <slot v-else />
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'

const props = defineProps({
  showDetails: { type: Boolean, default: false },
  fallbackMessage: { type: String, default: '组件渲染出现错误' },
})

const emit = defineEmits(['error'])

const hasError = ref(false)
const errorMessage = ref('')
const errorStack = ref('')

onErrorCaptured((err, instance, info) => {
  hasError.value = true
  errorMessage.value = err?.message || props.fallbackMessage
  errorStack.value = err?.stack || ''
  emit('error', { error: err, info })
  return false
})

function retry() {
  hasError.value = false
  errorMessage.value = ''
  errorStack.value = ''
}

function resetAndRetry() {
  hasError.value = false
  errorMessage.value = ''
  errorStack.value = ''
  window.location.reload()
}
</script>

<style scoped>
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  min-height: 200px;
}
.error-boundary-icon {
  color: var(--destructive, #d64545);
  margin-bottom: 12px;
}
.error-boundary-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 8px;
}
.error-boundary-message {
  font-size: 13px;
  color: var(--muted-foreground);
  margin: 0 0 16px;
  max-width: 360px;
  line-height: 1.5;
}
.error-boundary-actions {
  display: flex;
  gap: 8px;
}
.error-boundary-btn {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--primary);
  color: var(--primary-foreground, #fff);
  font-size: 13px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
}
.error-boundary-btn:hover {
  opacity: 0.85;
}
.error-boundary-btn--secondary {
  background: var(--popover);
  color: var(--foreground);
}
.error-boundary-btn--secondary:hover {
  background: var(--accent);
}
.error-boundary-details {
  margin-top: 16px;
  text-align: left;
  width: 100%;
  max-width: 480px;
}
.error-boundary-details summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-bottom: 8px;
}
.error-boundary-details pre {
  font-size: 11px;
  background: var(--accent);
  padding: 12px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  max-height: 200px;
  color: var(--foreground);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
