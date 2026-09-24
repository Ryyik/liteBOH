<template>
  <transition name="afpm-fade">
    <div v-if="open" class="afpm-overlay" @click.self="$emit('close')">
      <div class="afpm-card" role="dialog" aria-modal="true" aria-label="头像框">
        <div class="afpm-header">
          <div class="afpm-icon-circle" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4.5" />
            </svg>
          </div>
          <div class="afpm-heading">
            <h3>头像框</h3>
            <p>即点即换 · 论坛、评论、个人主页同步展示</p>
          </div>
          <button type="button" class="afpm-close" aria-label="关闭" @click="$emit('close')">
            <X :size="17" :stroke-width="1.9" />
          </button>
        </div>

        <div class="afpm-body">
          <AvatarFrameGrid :avatar-url="avatarUrl" @unlock="$emit('close')" />
        </div>

        <div class="afpm-actions">
          <button type="button" class="afpm-btn-ghost" @click="handleClear">不佩戴</button>
          <button type="button" class="afpm-btn-primary" @click="$emit('close')">完成</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
/**
 * 头像框试戴弹层壳（编辑资料页入口用）：ThemeModal 式 overlay，内容复用 AvatarFrameGrid。
 * 佩戴状态即时生效（useAvatarFrame 单例），底部按钮只做「不佩戴」与关闭。
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { X } from 'lucide-vue-next';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';
import AvatarFrameGrid from './AvatarFrameGrid.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  avatarUrl: { type: String, default: '' }
});

const emit = defineEmits(['close']);

const { equip } = useAvatarFrame();
const handleClear = () => equip('none');

const onKeydown = (event) => {
  if (props.open && event.key === 'Escape') emit('close');
};

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.afpm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.34);
}

.afpm-card {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(86vh, 760px);
  padding: 18px 20px 16px;
  border: 0.5px solid rgba(255, 255, 255, 0.72);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: var(--liquid-filter, blur(24px));
  -webkit-backdrop-filter: var(--liquid-filter, blur(24px));
  box-shadow: 0 28px 68px rgba(15, 23, 42, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.afpm-header {
  display: flex;
  align-items: center;
  gap: 11px;
  padding-bottom: 13px;
  border-bottom: 0.5px solid rgba(15, 23, 42, 0.08);
}

.afpm-icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 113, 227, 0.11);
  color: #0071e3;
  flex-shrink: 0;
}

.afpm-heading {
  min-width: 0;
}

.afpm-heading h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

.afpm-heading p {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: #8e8e93;
}

.afpm-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-left: auto;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.05);
  color: #6e6e73;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.afpm-close:hover {
  background: rgba(15, 23, 42, 0.09);
  color: #1d1d1f;
}

.afpm-body {
  overflow-y: auto;
  padding: 14px 2px 4px;
}

.afpm-actions {
  display: flex;
  gap: 10px;
  padding-top: 13px;
  border-top: 0.5px solid rgba(15, 23, 42, 0.08);
}

.afpm-btn-ghost {
  flex: 1;
  padding: 10px 0;
  border: 0.5px solid rgba(15, 23, 42, 0.14);
  border-radius: 999px;
  background: transparent;
  color: #3a3a3c;
  font-size: 13.5px;
  font-weight: 650;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.afpm-btn-ghost:hover {
  background: rgba(15, 23, 42, 0.05);
}

.afpm-btn-primary {
  flex: 2;
  padding: 10px 0;
  border: none;
  border-radius: 999px;
  background: #0071e3;
  color: #fff;
  font-size: 13.5px;
  font-weight: 650;
  cursor: pointer;
  transition: filter 150ms ease, transform 130ms ease;
}

.afpm-btn-primary:hover {
  filter: brightness(1.06);
}

.afpm-btn-primary:active {
  transform: scale(0.98);
}

/* ─── 暗色（平铺祖先选择器，teleport/overlay 场景通用） ─── */
.user-space-page[data-theme="dark"] .afpm-overlay {
  background: rgba(0, 0, 0, 0.5);
}

.user-space-page[data-theme="dark"] .afpm-card {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(28, 28, 30, 0.88);
  box-shadow: 0 28px 68px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.user-space-page[data-theme="dark"] .afpm-header,
.user-space-page[data-theme="dark"] .afpm-actions {
  border-color: rgba(255, 255, 255, 0.1);
}

.user-space-page[data-theme="dark"] .afpm-heading h3 {
  color: #f5f5f7;
}

.user-space-page[data-theme="dark"] .afpm-heading p {
  color: #a1a1a6;
}

.user-space-page[data-theme="dark"] .afpm-icon-circle {
  background: rgba(41, 151, 255, 0.16);
  color: #2997ff;
}

.user-space-page[data-theme="dark"] .afpm-close {
  background: rgba(255, 255, 255, 0.08);
  color: #a1a1a6;
}

.user-space-page[data-theme="dark"] .afpm-close:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
}

.user-space-page[data-theme="dark"] .afpm-btn-ghost {
  border-color: rgba(255, 255, 255, 0.16);
  color: #d1d1d6;
}

.user-space-page[data-theme="dark"] .afpm-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
}

.user-space-page[data-theme="dark"] .afpm-btn-primary {
  background: #2997ff;
}

/* ─── 过渡 ─── */
.afpm-fade-enter-active {
  transition: opacity 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.afpm-fade-leave-active {
  transition: opacity 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.afpm-fade-enter-active .afpm-card {
  transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
}

.afpm-fade-leave-active .afpm-card {
  transition: transform 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

.afpm-fade-enter-from,
.afpm-fade-leave-to {
  opacity: 0;
}

.afpm-fade-enter-from .afpm-card {
  transform: translateY(14px) scale(0.975);
}

.afpm-fade-leave-to .afpm-card {
  transform: translateY(8px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .afpm-fade-enter-active,
  .afpm-fade-leave-active {
    transition-duration: 1ms;
  }

  .afpm-fade-enter-from .afpm-card,
  .afpm-fade-leave-to .afpm-card {
    transform: none;
  }
}

@media (max-width: 480px) {
  .afpm-overlay {
    padding: 14px;
    align-items: flex-end;
  }

  .afpm-card {
    max-height: 88vh;
  }
}
</style>
