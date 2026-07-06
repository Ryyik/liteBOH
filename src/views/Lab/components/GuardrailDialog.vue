<template>
  <Teleport to="body">
    <Transition name="guardrail">
      <div v-if="visible" class="guardrail-overlay" @click.self="cancel">
        <div class="guardrail-dialog" role="alertdialog">
          <div class="guardrail-header">
            <div class="guardrail-icon" :class="`guardrail-icon--${config.severity || 'warning'}`">
              <svg v-if="config.severity === 'danger'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
          </div>
          <h3 class="guardrail-title">{{ config.title || '确认操作' }}</h3>
          <p class="guardrail-message">{{ config.message }}</p>
          <div class="guardrail-actions">
            <button
              class="guardrail-btn guardrail-btn--cancel"
              @click="cancel"
            >
              {{ config.cancelLabel || '取消' }}
            </button>
            <button
              class="guardrail-btn"
              :class="config.severity === 'danger' ? 'guardrail-btn--danger' : 'guardrail-btn--confirm'"
              @click="confirm"
            >
              {{ config.confirmLabel || '确认' }}
            </button>
          </div>
          <div v-if="config.reminder" class="guardrail-footer">
            <label class="guardrail-reminder">
              <input type="checkbox" v-model="dontShowAgain" />
              <span>{{ config.reminder }}</span>
            </label>
          </div>
          <button class="guardrail-close" @click="cancel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  config: { type: Object, default: () => ({
    title: '确认操作',
    message: '确定要执行此操作吗？',
    severity: 'warning',
    confirmLabel: '确认',
    cancelLabel: '取消',
    reminder: '',
  })},
})

const emit = defineEmits(['confirm', 'cancel'])

const visible = ref(false)
const resolvePromise = ref(null)
const dontShowAgain = ref(false)

let currentConfig = ref({})

function show(config = {}) {
  currentConfig.value = { ...props.config, ...config }
  visible.value = true
  dontShowAgain.value = false

  return new Promise((resolve) => {
    resolvePromise.value = resolve
  })
}

function confirm() {
  visible.value = false
  resolvePromise.value?.({ confirmed: true, dontShowAgain: dontShowAgain.value })
}

function cancel() {
  visible.value = false
  resolvePromise.value?.({ confirmed: false, dontShowAgain: false })
}

defineExpose({ show, confirm, cancel })
</script>

<style scoped>
.guardrail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.4);
  z-index: 11000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.guardrail-dialog {
  position: relative;
  width: 400px;
  max-width: 90vw;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 40px rgba(0,0,0,0.2);
  padding: 28px 24px 20px;
  text-align: center;
}
.guardrail-header {
  margin-bottom: 16px;
}
.guardrail-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
}
.guardrail-icon--warning {
  background: #fef3e2;
  color: #a67c2e;
}
.guardrail-icon--danger {
  background: #fde8e8;
  color: #c41a1a;
}
.guardrail-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
}
.guardrail-close:hover { background: var(--accent); color: var(--foreground); }
.guardrail-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 8px;
  font-family: var(--font-sans);
}
.guardrail-message {
  font-size: 13px;
  color: var(--muted-foreground);
  line-height: 1.5;
  margin: 0 0 20px;
  font-family: var(--font-sans);
}
.guardrail-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.guardrail-btn {
  padding: 9px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 13px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
  min-width: 80px;
}
.guardrail-btn--cancel {
  background: var(--popover);
  color: var(--foreground);
}
.guardrail-btn--cancel:hover { background: var(--accent); }
.guardrail-btn--confirm {
  background: var(--primary);
  color: var(--primary-foreground, #fff);
}
.guardrail-btn--confirm:hover { opacity: 0.85; }
.guardrail-btn--danger {
  background: #d64545;
  color: #fff;
  border-color: #d64545;
}
.guardrail-btn--danger:hover { background: #b33a3a; }
.guardrail-footer {
  margin-top: 16px;
}
.guardrail-reminder {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  cursor: pointer;
}
.guardrail-reminder input {
  accent-color: var(--primary);
}
.guardrail-enter-from { opacity: 0; }
.guardrail-leave-to { opacity: 0; }
.guardrail-enter-active, .guardrail-leave-active { transition: opacity 0.2s ease; }
.guardrail-enter-from .guardrail-dialog { transform: scale(0.92); }
.guardrail-leave-to .guardrail-dialog { transform: scale(0.92); }
.guardrail-enter-active .guardrail-dialog { transition: transform 0.2s ease; }
.guardrail-leave-active .guardrail-dialog { transition: transform 0.15s ease; }
</style>
