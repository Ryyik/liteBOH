<template>
  <Teleport to="body">
    <Transition :name="animationClass">
        <div v-if="visible" class="common-alert-overlay" @click="handleOverlayClick" :style="overlayStyle">
          <div class="common-alert-modal" :class="[type, materialClass]" @click.stop :style="modalStyle">
            <!-- Frosted Glass Effect Layer -->
            <div v-if="material === 'frosted'" class="frosted-layer" :style="frostedStyle"></div>

          <!-- Content -->
          <div class="alert-content">
            <div v-if="mascotSrc" class="alert-mascot-wrapper">
              <img :src="mascotSrc" :alt="mascotAlt" draggable="false"  loading="lazy" />
            </div>
            <div v-else class="alert-icon-wrapper" :class="type" :style="iconStyle">
              <span class="alert-icon">{{ icon }}</span>
            </div>
            <h3 class="alert-title" :style="titleStyle">{{ title }}</h3>
            <p class="alert-message" :style="messageStyle">{{ message }}</p>
            <button class="alert-confirm-btn" :style="btnStyle" @click="close">
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'success',
    validator: (value) => ['success', 'error', 'warning', 'info'].includes(value)
  },
  title: {
    type: String,
    default: '提示'
  },
  message: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '确定'
  },
  closeOnOverlay: {
    type: Boolean,
    default: true
  },
  material: {
    type: String,
    default: 'standard',
    validator: (value) => ['standard', 'frosted'].includes(value)
  },
  styles: {
    type: Object,
    default: () => ({})
  },
  mascotSrc: {
    type: String,
    default: ''
  },
  mascotAlt: {
    type: String,
    default: '提示插画'
  }
});

const emit = defineEmits(['update:visible', 'confirm', 'close']);

const icon = computed(() => {
  switch (props.type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '✅';
  }
});

const materialClass = computed(() => `material-${props.material}`);

const animationClass = computed(() => {
  const animType = props.styles.animationType || 'scale';
  return `modal-${animType}`;
});

const overlayStyle = computed(() => ({
  background: props.styles.overlayBg || `rgba(0, 0, 0, ${props.styles.overlayOpacity ?? 0.5})`,
  backdropFilter: `blur(${props.styles.overlayBlur ?? 8}px)`,
  WebkitBackdropFilter: `blur(${props.styles.overlayBlur ?? 8}px)`
}));

const modalStyle = computed(() => {
  const baseStyle = {
    background: props.material === 'standard' ? (props.styles.modalBg || 'white') : 'transparent',
    width: '100%',
    maxWidth: `${props.styles.maxWidth || 360}px`,
    borderRadius: `${props.styles.radius || 24}px`,
    padding: `${props.styles.padding || 32}px`,
    boxShadow: props.styles.shadow || '0 20px 40px -10px rgba(0, 0, 0, 0.2)',
    border: props.styles.borderWidth > 0
      ? `${props.styles.borderWidth}px solid ${props.styles.borderColor || '#e5e5ea'}`
      : 'none'
  };

  if (props.material === 'frosted') {
    baseStyle.background = `rgba(${hexToRgb(props.styles.modalBg || '#ffffff')}, ${props.styles.bgOpacity ?? 0.85})`;
    baseStyle.backdropFilter = `blur(${props.styles.frostedBlur ?? 20}px) saturate(${props.styles.frostedSaturation ?? 140}%)`;
    baseStyle.WebkitBackdropFilter = `blur(${props.styles.frostedBlur ?? 20}px) saturate(${props.styles.frostedSaturation ?? 140}%)`;
  }

  return baseStyle;
});

const frostedStyle = computed(() => ({
  backdropFilter: `blur(${props.styles.frostedBlur ?? 20}px) saturate(${props.styles.frostedSaturation ?? 140}%)`,
  WebkitBackdropFilter: `blur(${props.styles.frostedBlur ?? 20}px) saturate(${props.styles.frostedSaturation ?? 140}%)`,
  background: `rgba(${hexToRgb(props.styles.modalBg || '#ffffff')}, ${props.styles.bgOpacity ?? 0.85})`
}));

const iconStyle = computed(() => ({
  background: getTypeColor(props.type, 0.15),
  color: getTypeColor(props.type, 1)
}));

const titleStyle = computed(() => ({
  fontSize: `${props.styles.titleSize || 20}px`,
  fontWeight: props.styles.titleWeight || 700,
  color: props.styles.titleColor || '#1d1d1f'
}));

const messageStyle = computed(() => ({
  fontSize: `${props.styles.messageSize || 15}px`,
  color: props.styles.messageColor || '#86868b'
}));

const btnStyle = computed(() => ({
  background: props.styles.btnBg || '#1d1d1f',
  color: props.styles.btnColor || '#ffffff'
}));

const close = () => {
  emit('update:visible', false);
  emit('close');
  emit('confirm');
};

const handleOverlayClick = () => {
  if (props.closeOnOverlay) {
    close();
  }
};

// Helper functions
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255, 255, 255';
}

function getTypeColor(type, alpha) {
  const colors = {
    success: alpha === 1 ? '#34c759' : `rgba(52, 199, 89, ${alpha})`,
    error: alpha === 1 ? '#ff3b30' : `rgba(255, 59, 48, ${alpha})`,
    warning: alpha === 1 ? '#ff9500' : `rgba(255, 149, 0, ${alpha})`,
    info: alpha === 1 ? '#007aff' : `rgba(0, 122, 255, ${alpha})`
  };
  return colors[type] || colors.success;
}
</script>

<style scoped>
.common-alert-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 210000;
  padding: 20px;
}

.common-alert-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  overflow: hidden;
}

/* Material: Standard */
.material-standard {
  animation: alertScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Material: Frosted */
.material-frosted {
  animation: alertScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.frosted-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* Content */
.alert-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.alert-icon-wrapper {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  font-size: 36px;
  transition: transform 0.3s ease;
}

.alert-icon-wrapper:hover {
  transform: scale(1.05);
}

.alert-mascot-wrapper {
  width: 106px;
  height: 86px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: -4px 0 14px;
}

.alert-mascot-wrapper img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}

.alert-title {
  margin: 0 0 12px 0;
  line-height: 1.3;
}

.alert-message {
  margin: 0 0 24px 0;
  line-height: 1.6;
  max-width: 100%;
}

.alert-confirm-btn {
  border: none;
  padding: 14px 32px;
  border-radius: 100px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  max-width: 200px;
}

.alert-confirm-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.alert-confirm-btn:active {
  transform: translateY(0);
}

/* Animations */
.modal-scale-enter-active,
.modal-scale-leave-active {
  transition: opacity 0.3s ease;
}

.modal-scale-enter-from,
.modal-scale-leave-to {
  opacity: 0;
}

.modal-scale-enter-active .common-alert-modal,
.modal-scale-leave-active .common-alert-modal {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.modal-scale-enter-from .common-alert-modal,
.modal-scale-leave-to .common-alert-modal {
  transform: scale(0.9);
  opacity: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-slide-up-enter-active,
.modal-slide-up-leave-active {
  transition: opacity 0.3s ease;
}

.modal-slide-up-enter-from,
.modal-slide-up-leave-to {
  opacity: 0;
}

.modal-slide-up-enter-active .common-alert-modal,
.modal-slide-up-leave-active .common-alert-modal {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.modal-slide-up-enter-from .common-alert-modal {
  transform: translateY(50px);
  opacity: 0;
}

.modal-slide-up-leave-to .common-alert-modal {
  transform: translateY(-30px);
  opacity: 0;
}

.modal-slide-down-enter-active,
.modal-slide-down-leave-active {
  transition: opacity 0.3s ease;
}

.modal-slide-down-enter-from,
.modal-slide-down-leave-to {
  opacity: 0;
}

.modal-slide-down-enter-active .common-alert-modal,
.modal-slide-down-leave-active .common-alert-modal {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.modal-slide-down-enter-from .common-alert-modal {
  transform: translateY(-50px);
  opacity: 0;
}

.modal-slide-down-leave-to .common-alert-modal {
  transform: translateY(30px);
  opacity: 0;
}

.modal-bounce-enter-active,
.modal-bounce-leave-active {
  transition: opacity 0.3s ease;
}

.modal-bounce-enter-from,
.modal-bounce-leave-to {
  opacity: 0;
}

.modal-bounce-enter-active .common-alert-modal,
.modal-bounce-leave-active .common-alert-modal {
  transition: transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.3s ease;
}

.modal-bounce-enter-from .common-alert-modal {
  transform: scale(0.3);
  opacity: 0;
}

.modal-bounce-leave-to .common-alert-modal {
  transform: scale(0.8);
  opacity: 0;
}

@keyframes alertScaleIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Responsive */
@media (max-width: 480px) {
  .common-alert-modal {
    max-width: 100% !important;
    margin: 16px;
  }

  .alert-icon-wrapper {
    width: 60px;
    height: 60px;
    font-size: 28px;
  }
}
</style>
