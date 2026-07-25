<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div
        v-for="item in toasts"
        :key="item.id"
        class="toast"
        :class="[`toast--${item.type || 'info'}`, { 'toast--visible': item.visible }]"
        @click="dismiss(item.id)"
      >
        <div class="toast-icon-wrap">
          <div class="toast-icon" :class="`icon-${item.type || 'info'}`"></div>
        </div>
        <div class="toast-body">
          <div class="toast-title">{{ item.title }}</div>
          <div v-if="item.message" class="toast-message">{{ item.message }}</div>
        </div>
        <button class="toast-close" @click.stop="dismiss(item.id)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

const toasts = ref([])
let nextId = 0

function show({ title, message, type = 'info', duration = 3500 }) {
  const id = nextId++
  const toast = { id, title, message, type, visible: false }
  toasts.value.push(toast)
  requestAnimationFrame(() => { toast.visible = true })
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration)
  }
  return id
}

function dismiss(id) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx === -1) return
  toasts.value[idx].visible = false
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 400)
}

defineExpose({ show, dismiss, success: (t, m, d) => show({ title: t, message: m, type: 'success', duration: d }),
  error: (t, m, d) => show({ title: t, message: m, type: 'error', duration: d }),
  info: (t, m, d) => show({ title: t, message: m, type: 'info', duration: d }),
  warning: (t, m, d) => show({ title: t, message: m, type: 'warning', duration: d }),
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 96px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  min-width: 300px;
  max-width: 420px;
  border-radius: 16px;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.1), 0 8px 10px -1px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
  font-family: ui-sans-serif, system-ui, sans-serif;
  border: 1px solid #dad9d4;
}
.toast--info { background: #ffffff; }
.toast--success { background: #ffffff; }
.toast--warning { background: #fff8e6; border-color: #f0c36d; }
.toast--error { background: #d64545; color: #ffffff; border-color: transparent; }
.toast--error .toast-title { color: #ffffff; }
.toast--error .toast-message { color: rgba(255, 255, 255, 0.85); }
.toast--error .toast-close { color: rgba(255, 255, 255, 0.7); }
.toast--error .toast-close:hover { color: #ffffff; background: rgba(255, 255, 255, 0.15); }

.toast-icon-wrap { flex-shrink: 0; }
.toast-icon {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.icon-info { background: #fbf2ed; }
.icon-success { background: #f0f3ea; }
.icon-warning { background: #fff3d6; }
.icon-error { background: rgba(255, 255, 255, 0.2); }
.icon-info::after { content: 'i'; color: #C96442; font-weight: 700; font-size: 15px; font-style: italic; }
.icon-success::after { content: '✓'; color: #788c5d; font-weight: 700; font-size: 16px; }
.icon-warning::after { content: '!'; color: #b7791f; font-weight: 700; font-size: 15px; }
.icon-error::after { content: '!'; color: #fff; font-weight: 700; font-size: 15px; }

.toast-body { flex: 1; min-width: 0; }
.toast-title { font-size: 14px; font-weight: 600; color: #3d3929; line-height: 1.3; }
.toast-message { font-size: 13px; color: #6e6d68; margin-top: 2px; line-height: 1.4; }

.toast-close {
  background: #f5f4ef; border: none;
  color: #6e6d68; cursor: pointer;
  padding: 4px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.16s ease; flex-shrink: 0;
}
.toast-close:hover { background: #e3e0d4; color: #3d3929; }

/* Transitions */
.toast-enter-from { opacity: 0; transform: translateX(80px) scale(0.95); }
.toast-leave-to { opacity: 0; transform: translateX(80px) scale(0.95); }
.toast-enter-active, .toast-leave-active { transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1); }

@media (max-width: 768px) {
  .toast-container { top: auto; bottom: 20px; right: 12px; left: 12px; }
  .toast { min-width: unset; max-width: unset; width: 100%; }
}
</style>
