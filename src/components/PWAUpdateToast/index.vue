<template>
  <Transition name="slide-up">
    <div v-if="hasUpdate" class="pwa-update-toast" data-panel-variant="glass">
      <div class="toast-content">
        <div class="toast-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <div class="toast-message">
          <span class="toast-title">新版本可用</span>
          <span class="toast-desc">{{ updateMessage }}</span>
        </div>
        <div class="toast-actions">
          <button class="toast-btn toast-btn-primary" @click="handleUpdate">
            立即更新
          </button>
          <button class="toast-btn toast-btn-secondary" @click="handlePostpone">
            稍后
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { usePWAUpdate } from '@/composables/usePWAUpdate.js';

const { hasUpdate, updateMessage, applyUpdate, postponeUpdate } = usePWAUpdate();

const handleUpdate = async () => {
  await applyUpdate();
};

const handlePostpone = () => {
  postponeUpdate();
};
</script>

<style scoped>
.pwa-update-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: 400px;
  width: calc(100% - 32px);
  animation: bounce-in 0.4s ease-out;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--boh-primary), var(--boh-secondary));
  border-radius: 50%;
  color: white;
}

.toast-message {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  display: block;
}

.toast-desc {
  font-size: 12px;
  color: var(--text-secondary);
  display: block;
  margin-top: 2px;
}

.toast-actions {
  display: flex;
  gap: 8px;
}

.toast-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.toast-btn-primary {
  background: linear-gradient(135deg, var(--boh-primary), var(--boh-secondary));
  color: white;
}

.toast-btn-primary:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.4);
}

.toast-btn-secondary {
  background: rgba(128, 128, 128, 0.2);
  color: var(--text-secondary);
}

.toast-btn-secondary:hover {
  background: rgba(128, 128, 128, 0.3);
}

/* 动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

@keyframes bounce-in {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(30px);
  }
  50% {
    transform: translateX(-50%) translateY(-5px);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 移动端适配 */
@media (max-width: 480px) {
  .pwa-update-toast {
    bottom: 70px;
    padding: 10px 12px;
  }

  .toast-content {
    gap: 8px;
  }

  .toast-icon {
    width: 28px;
    height: 28px;
  }

  .toast-btn {
    padding: 6px 12px;
    font-size: 12px;
  }
}
</style>