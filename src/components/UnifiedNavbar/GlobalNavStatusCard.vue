<template>
  <Transition name="global-nav-status" @after-leave="$emit('after-leave')">
    <button
      v-if="item?.visible"
      type="button"
      class="global-nav-status-card"
      ref="card"
      :class="{ 'is-long': isLong, 'is-reduced-motion': item.reducedMotion }"
      :style="cardStyle"
      @click="$emit('action')"
    >
      <span class="status-icon" :class="`tone-${item.icon}`">
        <component :is="activeIcon" :size="18" :stroke-width="2.1" aria-hidden="true" />
      </span>
      <span class="status-copy">
        <strong>{{ item.title }}</strong>
        <span>{{ item.message }}</span>
      </span>
      <ChevronRight :size="18" aria-hidden="true" />
    </button>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Bell, Bot, Check, ChevronRight, CircleAlert, MessageCircle, Newspaper, Search } from 'lucide-vue-next';

const props = defineProps({
  item: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['action', 'after-leave', 'resize']);
const card = ref(null);
let resizeObserver;

const iconMap = {
  success: Check,
  message: MessageCircle,
  comment: MessageCircle,
  notification: Bell,
  post: Newspaper,
  search: Search,
  warning: CircleAlert,
  ai: Bot
};

const activeIcon = computed(() => iconMap[props.item?.icon] || Check);
const isLong = computed(() => props.item?.isLong || String(props.item?.message || '').length > 24);
const cardStyle = computed(() => ({
  '--global-nav-status-duration': `${props.item?.duration || 240}ms`,
  '--global-nav-status-distance': `${props.item?.distance || 22}px`,
  '--global-nav-status-blur': `${props.item?.blur || 20}px`
}));

const reportHeight = () => {
  const height = card.value?.getBoundingClientRect().height;
  if (height) emit('resize', height);
};

onMounted(async () => {
  await nextTick();
  reportHeight();
  resizeObserver = new ResizeObserver(reportHeight);
  if (card.value) resizeObserver.observe(card.value);
});

onBeforeUnmount(() => resizeObserver?.disconnect());

watch(
  () => [props.item?.visible, props.item?.title, props.item?.message, props.item?.isLong],
  async () => {
    await nextTick();
    reportHeight();
  }
);
</script>

<style scoped>
.global-nav-status-card {
  position: absolute;
  z-index: 1;
  top: var(--global-nav-status-top);
  right: 7px;
  left: 7px;
  display: flex;
  align-items: center;
  gap: 11px;
  width: auto;
  min-height: 58px;
  padding: 10px 13px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 22px;
  color: #1e2938;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  cursor: pointer;
  text-align: left;
  transform: none;
  transform-origin: center top;
  clip-path: inset(0 round 22px);
  will-change: transform, opacity;
}

.global-nav-status-card.is-long { min-height: 74px; border-radius: 20px; }
.status-icon { display: inline-grid; flex: 0 0 auto; place-items: center; width: 34px; height: 34px; border-radius: 50%; }
.status-icon.tone-success { color: #057857; background: #d8f4e9; }
.status-icon.tone-message { color: #1d62d4; background: #dbeafe; }
.status-icon.tone-comment { color: #1d62d4; background: #dbeafe; }
.status-icon.tone-notification { color: #9a5b06; background: #fef3c7; }
.status-icon.tone-post { color: #146b96; background: #dff3fc; }
.status-icon.tone-search { color: #465569; background: #e8edf3; }
.status-icon.tone-warning { color: #b84212; background: #ffedd5; }
.status-icon.tone-ai { color: #6d38c8; background: #eee4ff; }
.status-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.status-copy strong { color: #1d2938; font-size: 13px; font-weight: 760; line-height: 1.25; }
.status-copy span { overflow: hidden; color: #617084; font-size: 12px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.is-long .status-copy span { overflow: visible; overflow-wrap: anywhere; text-overflow: clip; white-space: normal; }

:global(#unified-nav-container[data-theme="dark"]) .global-nav-status-card {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
}

:global(#unified-nav-container[data-theme="dark"]) .status-copy strong { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"]) .status-copy span { color: rgba(226, 232, 240, 0.76); }

.global-nav-status-enter-active,
.global-nav-status-leave-active {
  transition:
    clip-path var(--global-nav-status-duration) var(--ease-emphasized, cubic-bezier(0.16, 1, 0.3, 1)),
    transform var(--global-nav-status-duration) var(--ease-emphasized, cubic-bezier(0.16, 1, 0.3, 1)),
    opacity calc(var(--global-nav-status-duration) * 0.68) ease,
    filter calc(var(--global-nav-status-duration) * 0.72) ease;
}
.global-nav-status-enter-from,
.global-nav-status-leave-to {
  opacity: 0;
  filter: blur(2px);
  clip-path: inset(0 0 100% 0 round 22px);
  transform: translateY(calc(var(--global-nav-status-distance) * -0.45));
}
.is-reduced-motion.global-nav-status-card { transition-duration: 120ms; }

@media (max-width: 768px) {
  .global-nav-status-card { right: 5px; left: 5px; min-height: 54px; }
}

@media (prefers-reduced-motion: reduce) {
  .global-nav-status-enter-active,
  .global-nav-status-leave-active { transition-duration: 120ms; }
  .global-nav-status-enter-from,
  .global-nav-status-leave-to { filter: none; transform: none; }
}
</style>
