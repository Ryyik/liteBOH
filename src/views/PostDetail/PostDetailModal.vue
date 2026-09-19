<script setup>
/**
 * 帖子详情弹窗（横屏）— 全局唯一宿主，挂在 App.vue。
 *
 * - 本组件很轻，静态导入不增首屏负担；重的 PostDetailMain 走 defineAsyncComponent，
 *   与整页路由共享同一 chunk，首次打开弹窗时才加载。
 * - 开关状态与历史栈同步在 usePostDetailModal（单源），本组件只负责壳与视觉。
 * - 层级：overlay z-index 2147482400 —— 盖过 UserSpace bottom-nav(2147482200)/
 *   BohaiSidebar 底层(2147482100/2200)，让位图片查看器(2147483000)与全局弹窗(2147483647)。
 *   编辑器等 fixed 子层在 panel 的 stacking context 内自然置顶，无需改其 z-index。
 */
import { defineAsyncComponent, h } from 'vue';
import { usePostDetailModal } from '@/composables/usePostDetailModal.js';

// runtime-only 构建不支持 template 选项，加载占位用 h() 渲染函数
const PdModalLoading = () => h('div', { class: 'pd-modal-loading', 'aria-hidden': 'true' }, [
  h('span', { class: 'pd-modal-loading-dot' }),
  h('span', { class: 'pd-modal-loading-dot' }),
  h('span', { class: 'pd-modal-loading-dot' })
]);

const PostDetailMain = defineAsyncComponent({
  loader: () => import('./PostDetailMain.vue'),
  delay: 200,
  loadingComponent: PdModalLoading
});

const { isOpen, postId, close, open } = usePostDetailModal();

const handleClose = (options) => close(options);
const handleOpenPost = (id) => open(id, { replace: true });
</script>

<template>
  <Teleport to="body">
    <Transition name="pd-modal">
      <div v-if="isOpen" class="pd-modal-overlay" @click="handleClose()">
        <div class="pd-modal-panel" role="dialog" aria-modal="true" aria-label="帖子详情" @click.stop>
          <button class="pd-modal-close" type="button" aria-label="关闭" @click="handleClose()">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" />
            </svg>
          </button>
          <div class="pd-modal-scroll">
            <PostDetailMain :post-id-override="postId" modal-mode @close="handleClose" @open-post="handleOpenPost" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pd-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147482400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.pd-modal-panel {
  position: relative;
  width: min(1120px, calc(100vw - 48px));
  height: min(880px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border-radius: var(--liquid-radius-lg, 28px);
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  box-shadow: var(--liquid-shadow-overlay, 0 24px 80px rgba(15, 23, 42, 0.14));
  backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%));
  -webkit-backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%));
  overflow: hidden;
}

.pd-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--liquid-radius-pill, 999px);
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  color: var(--liquid-text-secondary, #6e6e73);
  cursor: pointer;
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%));
  transition: background var(--duration-fast, 180ms) ease, color var(--duration-fast, 180ms) ease,
    transform var(--duration-fast, 180ms) ease;
}

.pd-modal-close:hover {
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  color: var(--liquid-text-primary, #1d1d1f);
}

.pd-modal-close:active {
  transform: scale(0.94);
}

.pd-modal-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.pd-modal-scroll::-webkit-scrollbar {
  display: none;
}

.pd-modal-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 200px;
}

.pd-modal-loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--liquid-text-tertiary, #8b9098);
  opacity: 0.5;
  animation: pd-modal-dot-pulse 1.1s ease-in-out infinite;
}

.pd-modal-loading-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.pd-modal-loading-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes pd-modal-dot-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 0.9;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pd-modal-loading-dot {
    animation: none;
  }
}

/* 过渡：淡入 + 轻微上浮缩放 */
.pd-modal-enter-active,
.pd-modal-leave-active {
  transition: opacity var(--duration-base, 240ms) ease;
}

.pd-modal-enter-active .pd-modal-panel,
.pd-modal-leave-active .pd-modal-panel {
  transition: transform 0.36s cubic-bezier(0.16, 1, 0.3, 1);
}

.pd-modal-enter-from,
.pd-modal-leave-to {
  opacity: 0;
}

.pd-modal-enter-from .pd-modal-panel,
.pd-modal-leave-to .pd-modal-panel {
  transform: translateY(20px) scale(0.975);
}

@media (prefers-reduced-motion: reduce) {
  .pd-modal-enter-active,
  .pd-modal-leave-active,
  .pd-modal-enter-active .pd-modal-panel,
  .pd-modal-leave-active .pd-modal-panel {
    transition: none;
  }
}
</style>
