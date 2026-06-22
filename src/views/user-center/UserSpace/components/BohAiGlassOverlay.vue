<template>
  <Teleport to="body">
    <Transition name="boh-ai-glass">
      <div v-if="show"
        class="boh-ai-glass-overlay"
        :data-theme="theme"
        role="dialog"
        aria-modal="true"
        aria-label="BOH AI 快速对话"
        @keydown.esc="$emit('close')"
      >
        <button class="boh-ai-glass-close" type="button" aria-label="关闭 BOH AI" @click="$emit('close')">
          <X :size="19" :stroke-width="2" aria-hidden="true" />
        </button>

        <div class="boh-ai-glass-chat">
          <BOHAIChat :embedded="true" :overlay-mode="true" @island-message="$emit('island-message', $event)" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';
import { AsyncBOHAI as BOHAIChat } from '../async-loaders.js';

defineProps({
  theme: {
    type: String,
    default: ''
  },
  show: {
    type: Boolean,
    default: true
  }
});

defineEmits(['close', 'island-message']);

onMounted(() => {
  document.body.classList.add('boh-ai-glass-open');
});

onUnmounted(() => {
  document.body.classList.remove('boh-ai-glass-open');
});
</script>

<style scoped>
.boh-ai-glass-overlay {
  --boh-ai-bottom-nav-clearance: max(104px, calc(96px + env(safe-area-inset-bottom, 0px)));
  position: fixed;
  inset: 0;
  z-index: 2147481800;
  width: 100vw;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 0;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.3), rgba(226, 232, 240, 0.2)),
    rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #0f172a;
  isolation: isolate;
  transform-origin: bottom center;
}

.boh-ai-glass-close {
  position: fixed;
  top: max(14px, env(safe-area-inset-top, 0px));
  right: max(14px, env(safe-area-inset-right, 0px));
  z-index: 2147482100;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.58);
  color: #111827;
  cursor: pointer;
  transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
}

.boh-ai-glass-close:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.86);
  border-color: rgba(255, 255, 255, 0.92);
}

.boh-ai-glass-chat {
  position: relative;
  z-index: 2;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.boh-ai-glass-chat :deep(.bohai-page) {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.boh-ai-glass-chat :deep(.bohai-page),
.boh-ai-glass-chat :deep(.bohai-container),
.boh-ai-glass-chat :deep(.main-content) {
  height: 100%;
  min-height: 0;
  background: transparent !important;
}

.boh-ai-glass-chat :deep(.bohai-page) {
  --bohai-bg: transparent;
  --bohai-chat-rail-width: min(calc(100% - 28px), 920px);
  --bohai-composer: 860px;
}

.boh-ai-glass-chat :deep(.sidebar),
.boh-ai-glass-chat :deep(.sidebar-overlay) {
  top: 0;
  bottom: 0;
}

.boh-ai-glass-chat :deep(.main-content) {
  margin-left: 0;
}

.boh-ai-glass-chat :deep(.sidebar-open-btn) {
  top: max(14px, env(safe-area-inset-top, 0px));
  left: max(14px, env(safe-area-inset-left, 0px));
  background: rgba(255, 255, 255, 0.62);
  border-color: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
}

.boh-ai-glass-chat :deep(.chat-container) {
  padding-top: max(126px, calc(118px + env(safe-area-inset-top, 0px)));
  padding-bottom: calc(var(--boh-ai-bottom-nav-clearance) + 96px);
}

.boh-ai-glass-chat :deep(.input-area) {
  width: min(calc(100% - 32px), 860px);
  bottom: var(--boh-ai-bottom-nav-clearance) !important;
  padding-bottom: 0;
  opacity: 1 !important;
  visibility: visible !important;
}

.boh-ai-glass-chat :deep(.input-box) {
  background: rgba(255, 255, 255, 0.74);
  border-color: rgba(255, 255, 255, 0.78);
  box-shadow:
    0 18px 50px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
  transition: transform 520ms cubic-bezier(0.16, 1, 0.3, 1), opacity 360ms ease;
}

.boh-ai-glass-chat :deep(.empty-state) {
  min-height: auto;
  justify-content: center;
  padding-top: 0;
  padding-bottom: 0;
}

/* Override nested BOHAI backdrop-filter on Safari (causes flickering) */
.boh-ai-glass-chat :deep(.input-box),
.boh-ai-glass-chat :deep(.sidebar-inner),
.boh-ai-glass-chat :deep(.sidebar-item),
.boh-ai-glass-chat :deep(.message-actions),
.boh-ai-glass-chat :deep(.scroll-to-bottom),
.boh-ai-glass-chat :deep(.message.user .message-content),
.boh-ai-glass-chat :deep(.conversation-jump-nav),
.boh-ai-glass-chat :deep(.message-tile),
.boh-ai-glass-chat :deep(.empty-suggestion-card),
.boh-ai-glass-chat :deep(.features-menu),
.boh-ai-glass-chat :deep(.header-glass),
.boh-ai-glass-chat :deep(.sidebar-toggle),
.boh-ai-glass-chat :deep(.settings-btn),
.boh-ai-glass-chat :deep(.share-btn),
.boh-ai-glass-chat :deep(.search-box),
.boh-ai-glass-chat :deep(.model-selector-content),
.boh-ai-glass-chat :deep(.knowledge-btn),
.boh-ai-glass-chat :deep(.compact-input),
.boh-ai-glass-chat :deep(.compact-popup),
.boh-ai-glass-chat :deep(.ai-settings-drawer),
.boh-ai-glass-chat :deep(.sidebar-open-btn),
.boh-ai-glass-chat :deep(.conversation-header) {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.boh-ai-glass-chat :deep(.input-box) {
  background: rgba(255, 255, 255, 0.82);
}

:global(body.boh-ai-glass-open .sidebar.is-embedded),
:global(body.boh-ai-glass-open .sidebar.open.is-embedded) {
  z-index: 2147482500 !important;
}

:global(body.boh-ai-glass-open .sidebar-overlay.is-embedded) {
  z-index: 2147482400 !important;
}

:global(body.boh-ai-glass-open .sidebar-open-btn) {
  z-index: 2147482100 !important;
}

/* Settings drawer: must be above the glass overlay (2147481800) */
:global(body.boh-ai-glass-open .ai-settings-backdrop) {
  z-index: 2147483000 !important;
}

:global(body.boh-ai-glass-open .ai-settings-drawer) {
  z-index: 2147483100 !important;
}

/* Settings button inside sidebar-user: glass overlay style */
.boh-ai-glass-chat :deep(.sidebar-user-with-settings .sidebar-settings-btn) {
  color: #64748b;
}

.boh-ai-glass-chat :deep(.sidebar-user-with-settings .sidebar-settings-btn:hover) {
  background: rgba(255, 255, 255, 0.58);
  color: #0f172a;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.sidebar-user-with-settings .sidebar-settings-btn) {
  color: #9ca3af;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.sidebar-user-with-settings .sidebar-settings-btn:hover) {
  background: rgba(15, 23, 42, 0.52);
  color: #f8fafc;
}

/* Settings drawer glass overlay adaptation */
.boh-ai-glass-chat :deep(.ai-settings-drawer) {
  background: rgba(255, 255, 255, 0.94);
  border-color: rgba(255, 255, 255, 0.72);
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
  backdrop-filter: blur(26px) saturate(1.3);
  -webkit-backdrop-filter: blur(26px) saturate(1.3);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-drawer) {
  background: rgba(31, 31, 31, 0.94);
  border-color: rgba(255, 255, 255, 0.1);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-card) {
  background: rgba(40, 40, 42, 0.8);
  border-color: rgba(255, 255, 255, 0.08);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-group-title) {
  color: #9ca3af;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-label) {
  color: #f8fafc;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-desc),
.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-value) {
  color: #9ca3af;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-chevron) {
  color: #6b7280;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-row:hover),
.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-row.expanded) {
  background: rgba(255, 255, 255, 0.06);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-inline-options) {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-inline-option) {
  background: rgba(40, 40, 42, 0.6);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-inline-option.active) {
  border-color: rgba(16, 163, 127, 0.45);
  background: rgba(16, 163, 127, 0.12);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-option-main strong) {
  color: #f8fafc;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-option-main small) {
  color: #9ca3af;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-icon) {
  background: rgba(255, 255, 255, 0.08);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-header) {
  border-color: rgba(255, 255, 255, 0.1);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-close-btn) {
  color: #9ca3af;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-close-btn:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-meter-track) {
  background: rgba(255, 255, 255, 0.1);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-footer strong),
.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.ai-settings-footer span) {
  color: #9ca3af;
}

.boh-ai-glass-chat :deep(.conversation-jump-nav) {
  width: min(calc(100% - 32px), 860px);
}

.boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav) {
  position: fixed !important;
  top: 50% !important;
  right: max(14px, calc(env(safe-area-inset-right, 0px) + 14px)) !important;
  z-index: 2147482060 !important;
  width: 32px !important;
  max-height: min(58dvh, 520px) !important;
  display: flex !important;
  padding: 12px 8px !important;
  border: 1px solid transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: hidden !important;
  transform: translateY(-50%) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav:hover),
.boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav:focus-within) {
  width: min(280px, 32vw) !important;
  max-height: min(66dvh, 620px) !important;
  padding: 14px 16px !important;
  border-radius: 24px !important;
  background: rgba(255, 255, 255, 0.34) !important;
  border-color: rgba(255, 255, 255, 0.42) !important;
  box-shadow:
    0 24px 58px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.52) !important;
  overflow-y: auto !important;
  backdrop-filter: blur(30px) saturate(150%) !important;
  -webkit-backdrop-filter: blur(30px) saturate(150%) !important;
}

.boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-mark) {
  background: rgba(15, 23, 42, 0.34) !important;
}

.boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-label) {
  color: rgba(15, 23, 42, 0.7) !important;
}

.boh-ai-glass-overlay[data-theme="dark"] {
  color: #f8fafc;
  background:
    linear-gradient(180deg, rgba(15, 18, 24, 0.62), rgba(15, 18, 24, 0.48)),
    rgba(2, 6, 23, 0.28);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-close {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.58);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.input-box),
.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.sidebar-open-btn) {
  background: rgba(15, 23, 42, 0.72);
  border-color: rgba(255, 255, 255, 0.12);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.bohai-page.embedded-mode .sidebar) {
  background: rgba(15, 23, 42, 0.72);
  border-right-color: rgba(255, 255, 255, 0.12);
  box-shadow: 18px 0 44px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav) {
  background: transparent !important;
  border-color: transparent !important;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav:hover),
.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav:focus-within) {
  background: rgba(15, 23, 42, 0.42) !important;
  border-color: rgba(255, 255, 255, 0.22) !important;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-mark) {
  background: rgba(248, 250, 252, 0.46) !important;
}

.boh-ai-glass-overlay[data-theme="dark"] .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-label) {
  color: rgba(248, 250, 252, 0.76) !important;
}

.boh-ai-glass-enter-active,
.boh-ai-glass-leave-active {
  transition: opacity 360ms ease, transform 520ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom center;
  will-change: transform, opacity;
}

.boh-ai-glass-leave-active {
  transition-duration: 260ms, 360ms;
  transition-timing-function: ease, cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.boh-ai-glass-enter-from,
.boh-ai-glass-leave-to {
  opacity: 0;
  transform: translate3d(0, 34px, 0);
}

.boh-ai-glass-leave-to {
  transform: translate3d(0, 24px, 0);
}

.boh-ai-glass-enter-from .boh-ai-glass-chat :deep(.input-box) {
  opacity: 0;
  transform: translate3d(0, 18px, 0);
}

@media (max-width: 767px) {
  .boh-ai-glass-close {
    top: max(14px, env(safe-area-inset-top, 0px));
  }

  .boh-ai-glass-chat :deep(.bohai-page) {
    --bohai-chat-rail-width: min(calc(100% - 24px), 860px);
    --bohai-composer: 860px;
  }

  .boh-ai-glass-chat :deep(.input-area),
  .boh-ai-glass-chat :deep(.conversation-jump-nav) {
    width: min(calc(100% - 24px), 860px);
  }

  .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav) {
    display: none !important;
  }
}

@media (orientation: landscape) and (max-height: 560px) {
  .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav) {
    right: max(10px, calc(env(safe-area-inset-right, 0px) + 10px)) !important;
    max-height: min(54dvh, 360px) !important;
  }

  .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav:hover),
  .boh-ai-glass-chat :deep(.bohai-page.overlay-mode .conversation-jump-nav:focus-within) {
    width: min(240px, 34vw) !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .boh-ai-glass-enter-active,
  .boh-ai-glass-leave-active {
    transition-duration: 1ms !important;
  }
}
</style>
