<template>
  <div
    v-if="visible"
    class="bottom-nav-glass"
    :class="{
      'is-hidden': hidden,
      'is-entering': isEntering,
      'ai-overlay-open': aiOverlayOpen
    }"
    :style="{ '--bottom-nav-enter-duration': `${enterDurationMs}ms` }"
  >
    <div class="nav-items" :style="navIndicatorStyle">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: currentTab === item.id || (item.id === 'ai' && aiOverlayOpen) }"
        type="button"
        @pointerenter="$emit('preload-tab', item.id)"
        @focus="$emit('preload-tab', item.id)"
        @click.stop="handleNavClick(item.id)"
      >
        <component :is="item.icon" class="nav-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
        <span class="nav-label">{{ item.label }}</span>
        <div v-if="item.id === 'messages' && hasUnreadMessages" class="unread-badge">
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/* 入场动画（2026-09-23 加，2026-09-24 调慢调柔）：底栏首次出现时从下方缓慢滑入 ——
   首页下滑进入论坛、UserSpace 首次进入都走这里。用 keyframes 而非 transition：
   基类的 transition 是 220ms 缓动（服务于 island 展开 / 滚动隐藏等交互），
   入场要的是「浮上来」的柔和落定，两者不能共用一个 transition 声明。
   ⚠️ 时长必须与 bottom-nav.css 的 bottomNavSlideIn 默认值一致（由 CSS 变量覆写时以传入为准）。 */
const BOTTOM_NAV_ENTER_MS = 760;
const isEntering = ref(true);
let enterTimer = null;

const emit = defineEmits(['preload-tab', 'nav-click']);

const props = defineProps({
  visible: {
    type: Boolean,
    default: true
  },
  hidden: {
    type: Boolean,
    default: false
  },
  navItems: {
    type: Array,
    required: true
  },
  currentTab: {
    type: String,
    required: true
  },
  aiOverlayOpen: {
    type: Boolean,
    default: false
  },
  hasUnreadMessages: {
    type: Boolean,
    default: false
  },
  unreadCount: {
    type: Number,
    default: 0
  },
  navIndicatorStyle: {
    type: Object,
    default: () => ({})
  },
  /* 入场滑入时长（ms）。<= 0 表示用内置默认 760 ——「本页常显」场景（UserSpace）。
     首页是「开场画退场后底栏才浮现」，需要比默认更慢，由调用方传值。 */
  enterDuration: {
    type: Number,
    default: 0
  }
});

const enterDurationMs = computed(() => (props.enterDuration > 0 ? props.enterDuration : BOTTOM_NAV_ENTER_MS));

onMounted(() => {
  enterTimer = window.setTimeout(() => {
    enterTimer = null;
    isEntering.value = false;
  }, enterDurationMs.value);
});

onBeforeUnmount(() => {
  if (enterTimer) {
    window.clearTimeout(enterTimer);
    enterTimer = null;
  }
});

const handleNavClick = (itemId) => {
  emit('nav-click', itemId);
};
</script>

<style src="./bottom-nav.css"></style>
