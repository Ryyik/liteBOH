<template>
  <Teleport to="body">
    <Transition name="agreement-modal">
      <div v-if="visible" class="agreement-overlay" @click="handleOverlayClick">
        <div class="agreement-modal" @click.stop>
          <!-- 顶部栏 -->
          <div class="agreement-header">
            <h2 class="agreement-title">{{ title }}</h2>
            <button class="agreement-close-btn" @click="close" aria-label="关闭">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          
          <!-- 内容区域 -->
          <div class="agreement-content">
            <slot></slot>
          </div>
          
          <!-- 底部按钮 -->
          <div class="agreement-footer">
            <button class="agreement-confirm-btn" @click="close">
              我已阅读
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '用户协议'
  },
  closeOnOverlay: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['update:visible', 'close']);

const close = () => {
  emit('update:visible', false);
  emit('close');
};

const handleOverlayClick = () => {
  if (props.closeOnOverlay) {
    close();
  }
};
</script>

<style scoped>
.agreement-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
  padding: 20px;
}

.agreement-modal {
  background: #ffffff;
  border-radius: 24px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.agreement-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 16px;
  border-bottom: 1px solid #f2f2f7;
  flex-shrink: 0;
}

.agreement-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.02em;
}

.agreement-close-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: #f2f2f7;
  color: #86868b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.agreement-close-btn:hover {
  background: #e5e5ea;
  color: #1d1d1f;
  transform: scale(1.05);
}

.agreement-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  color: #1d1d1f;
  line-height: 1.7;
  font-size: 15px;
}

.agreement-content::-webkit-scrollbar {
  width: 6px;
}

.agreement-content::-webkit-scrollbar-track {
  background: #f2f2f7;
}

.agreement-content::-webkit-scrollbar-thumb {
  background: #c7c7cc;
  border-radius: 3px;
}

.agreement-content::-webkit-scrollbar-thumb:hover {
  background: #aeaeae;
}

/* 协议内容样式 */
.agreement-content h1,
.agreement-content h2,
.agreement-content h3 {
  margin-top: 24px;
  margin-bottom: 12px;
  color: #1d1d1f;
  font-weight: 700;
}

.agreement-content h1 {
  font-size: 20px;
  margin-top: 0;
}

.agreement-content h2 {
  font-size: 18px;
}

.agreement-content h3 {
  font-size: 16px;
}

.agreement-content p {
  margin: 12px 0;
}

.agreement-content ul,
.agreement-content ol {
  margin: 12px 0;
  padding-left: 24px;
}

.agreement-content li {
  margin: 8px 0;
}

.agreement-content a {
  color: #0071e3;
  text-decoration: none;
}

.agreement-content a:hover {
  text-decoration: underline;
}

.agreement-footer {
  padding: 16px 24px 24px;
  border-top: 1px solid #f2f2f7;
  flex-shrink: 0;
}

.agreement-confirm-btn {
  width: 100%;
  padding: 16px 32px;
  background: #1d1d1f;
  color: #ffffff;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.agreement-confirm-btn:hover {
  background: #000000;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.agreement-confirm-btn:active {
  transform: translateY(0);
}

/* 弹窗动画 */
.agreement-modal-enter-active,
.agreement-modal-leave-active {
  transition: opacity 0.3s ease;
}

.agreement-modal-enter-from,
.agreement-modal-leave-to {
  opacity: 0;
}

.agreement-modal-enter-active .agreement-modal,
.agreement-modal-leave-active .agreement-modal {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.agreement-modal-enter-from .agreement-modal {
  transform: scale(0.9) translateY(20px);
  opacity: 0;
}

.agreement-modal-leave-to .agreement-modal {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .agreement-overlay {
    padding: 12px;
  }
  
  .agreement-modal {
    border-radius: 16px;
    max-height: 95vh;
  }
  
  .agreement-header {
    padding: 16px 16px 12px;
  }
  
  .agreement-title {
    font-size: 18px;
  }
  
  .agreement-content {
    padding: 16px;
    font-size: 14px;
  }
  
  .agreement-footer {
    padding: 12px 16px 16px;
  }
  
  .agreement-confirm-btn {
    padding: 14px 24px;
    font-size: 15px;
    border-radius: 10px;
  }
}

@media (max-width: 480px) {
  .agreement-overlay {
    padding: 0;
  }
  
  .agreement-modal {
    border-radius: 0;
    max-height: 100vh;
    height: 100%;
  }
  
  .agreement-header {
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
  }
  
  .agreement-footer {
    padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
