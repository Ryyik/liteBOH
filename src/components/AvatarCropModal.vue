<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="glass-modal-overlay" @click.self="cancel" @touchmove.prevent>
        <div class="crop-modal glass-container-heavy" :class="{ 'wide-crop-modal': isWideCrop }">
          <header class="modal-header">
            <div class="modal-header-left">
              <button class="close-btn" @click="cancel">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <h3>{{ title }}</h3>
            </div>
            <button class="save-btn" @click="confirmCrop" :disabled="loading">
              {{ loading ? '处理中...' : '确定' }}
            </button>
          </header>

          <div class="modal-body">
            <div class="cropper-container" :style="{ '--cropper-aspect-ratio': String(aspectRatio) }">
              <Cropper ref="cropperRef" class="cropper" :src="imageSrc" :stencil-props="{
                aspectRatio,
                class: stencilClass
              }" :stencil-component="stencilComponent" image-restriction="none" />
            </div>

            <div class="crop-hint">
              <p>{{ hint }}</p>
              <p class="sub-hint">{{ subHint }}</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { Cropper, CircleStencil, RectangleStencil } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';

const props = defineProps({
  visible: Boolean,
  imageSrc: String,
  loading: Boolean,
  title: {
    type: String,
    default: '裁切头像'
  },
  hint: {
    type: String,
    default: '拖动以调整位置，缩放以改变大小'
  },
  subHint: {
    type: String,
    default: '裁切后的效果将作为您的新头像'
  },
  aspectRatio: {
    type: Number,
    default: 1
  },
  shape: {
    type: String,
    default: 'circle'
  },
  outputType: {
    type: String,
    default: 'image/png'
  },
  outputQuality: {
    type: Number,
    default: 1
  }
});

const emit = defineEmits(['update:visible', 'confirm', 'cancel']);

const cropperRef = ref(null);
const isCircleCrop = computed(() => props.shape === 'circle');
const isWideCrop = computed(() => Number(props.aspectRatio || 1) > 1.5);
const stencilComponent = computed(() => (isCircleCrop.value ? CircleStencil : RectangleStencil));
const stencilClass = computed(() => (isCircleCrop.value ? 'circle-stencil' : 'rectangle-stencil'));

// 锁定/解锁页面滚动
watch(() => props.visible, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  } else {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }
}, { immediate: true });

// 确保组件销毁时恢复滚动
onBeforeUnmount(() => {
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
});

const confirmCrop = () => {
  if (cropperRef.value) {
    // 明确请求裁切结果, 并指定一个较好的输出尺寸
    const result = cropperRef.value.getResult();
    const canvas = result.canvas;

    if (canvas) {
      // 这里的 canvas 已经是裁切后的内容
      // 如果 canvas 很大，toBlob 会保持比例，我们只需要它被裁切过
      canvas.toBlob((blob) => {
        if (blob) {
          console.log('裁切完成, blob 大小:', (blob.size / 1024).toFixed(2), 'KB');
          emit('confirm', blob);
        } else {
          console.error('裁切失败: 无法生成 blob');
        }
      }, props.outputType, props.outputQuality);
    } else {
      console.error('裁切失败: 无法获取 canvas');
    }
  }
};

const cancel = () => {
  emit('update:visible', false);
  emit('cancel');
};
</script>

<style scoped>
@import '@/styles/common/glass-ui.css';

.crop-modal {
  width: 100%;
  max-width: 480px;
  border-radius: 28px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  max-height: 90dvh;
  margin: 16px;
  animation: modal-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overscroll-behavior: contain;
}

.crop-modal.wide-crop-modal {
  max-width: min(760px, calc(100vw - 32px));
}

@keyframes modal-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1d1d1f;
}

.close-btn {
  background: none;
  border: none;
  color: #86868b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1d1d1f;
}

.save-btn {
  background: #007AFF;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
}

.save-btn:hover {
  background: #0062CC;
  transform: translateY(-1px);
}

.save-btn:active {
  transform: translateY(0);
}

.save-btn:disabled {
  background: #999;
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cropper-container {
  width: 100%;
  aspect-ratio: var(--cropper-aspect-ratio, 1);
  background: #000;
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: 20px;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
  touch-action: none;
}

.cropper {
  width: 100%;
  height: 100%;
}

.crop-hint {
  text-align: center;
}

.crop-hint p {
  margin: 0;
  font-size: 15px;
  color: #1d1d1f;
  font-weight: 500;
}

.sub-hint {
  font-size: 13px !important;
  color: #86868b !important;
  margin-top: 4px !important;
  font-weight: 400 !important;
}

/* 覆盖 vue-advanced-cropper 默认样式 */
:deep(.circle-stencil) {
  border: 2px solid #fff;
  box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.6);
}

:deep(.rectangle-stencil) {
  border: 2px solid #fff;
  box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.58);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
