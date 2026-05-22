<template>
  <div class="notification-bell-container">
    <button class="notification-bell-btn"
      :class="{ 'has-notification': !isSubscribed && permissionStatus !== 'denied' && isLoggedIn }" @click="handleClick"
      :disabled="isLoading" :title="getTooltipText">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        <circle v-if="!isSubscribed && permissionStatus !== 'denied' && isLoggedIn" cx="18" cy="4" r="3" fill="#ff3b30"
          stroke="none"></circle>
      </svg>
      <span v-if="isLoading" class="loading-spinner"></span>
    </button>

    <Transition name="toast">
      <div v-if="showToast" class="notification-toast">
        <div class="toast-icon" :class="toastType">
          <svg v-if="toastType === 'success'" width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <svg v-else-if="toastType === 'error'" width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <span class="toast-message">{{ toastMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useNotifications } from '../composables/useNotifications'
import { useAuthStore } from '@/stores/auth'
import { storeToRefs } from 'pinia'

const authStore = useAuthStore()
const { isLoggedIn } = storeToRefs(authStore)

const {
  isSupported,
  isSubscribed,
  permissionStatus,
  isLoading,
  error,
  requestPermission,
  unsubscribe
} = useNotifications()

const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref('info')

const getTooltipText = computed(() => {
  if (!isLoggedIn.value) return '请先登录后再订阅通知'
  if (!isSupported.value) return error.value || '您的浏览器不支持通知'
  if (permissionStatus.value === 'denied') return '通知已被阻止，请在浏览器设置中允许通知'
  if (isSubscribed.value) return '已订阅通知，点击取消订阅'
  return '点击订阅方块之家通知'
})

const showToastMessage = (message, type = 'info') => {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 3000)
}

const handleClick = async () => {
  if (!isLoggedIn.value) {
    showToastMessage('请先登录后再订阅通知', 'error')
    return
  }

  if (!isSupported.value) {
    showToastMessage(error.value || '您的浏览器不支持推送通知', 'error')
    return
  }

  if (permissionStatus.value === 'denied') {
    showToastMessage('通知已被阻止，请在浏览器设置中允许通知', 'error')
    return
  }

  if (isSubscribed.value) {
    const success = await unsubscribe()
    if (success) {
      showToastMessage('已取消订阅通知', 'info')
    } else {
      showToastMessage('取消订阅失败，请稍后重试', 'error')
    }
  } else {
    const success = await requestPermission()
    if (success) {
      showToastMessage('订阅成功！感谢您的关注', 'success')
    } else {
      showToastMessage('订阅失败，请稍后重试', 'error')
    }
  }
}
</script>

<style scoped>
.notification-bell-container {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.notification-bell-btn {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  color: #1d1d1f;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.notification-bell-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  transform: scale(1.05);
}

.notification-bell-btn:active {
  transform: scale(0.95);
}

.notification-bell-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.notification-bell-btn.has-notification {
  animation: pulse 2s infinite;
}

@keyframes pulse {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.4);
  }

  50% {
    box-shadow: 0 0 0 8px rgba(255, 59, 48, 0);
  }
}

.loading-spinner {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #0071e3;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.notification-toast {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  background: #ffffff;
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  z-index: 1000;
  min-width: 200px;
  max-width: 300px;
}

.toast-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.toast-icon.success {
  background: rgba(52, 199, 89, 0.15);
  color: #34c759;
}

.toast-icon.error {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
}

.toast-icon.info {
  background: rgba(0, 113, 227, 0.15);
  color: #0071e3;
}

.toast-message {
  font-size: 14px;
  font-weight: 500;
  color: #1d1d1f;
  white-space: normal;
  word-break: break-word;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 768px) {
  .notification-bell-btn {
    width: 40px;
    height: 40px;
  }

  .notification-toast {
    right: -50px;
    min-width: 180px;
  }
}
</style>
