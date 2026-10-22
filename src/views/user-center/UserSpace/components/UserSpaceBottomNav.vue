<template>
  <div
    v-if="visible"
    class="bottom-nav-glass"
    :class="{
      'is-hidden': navHidden,
      'is-entering': isEntering,
      'ai-overlay-open': aiOverlayOpen,
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
        <component
          :is="item.icon"
          class="nav-icon"
          :size="18"
          :stroke-width="1.9"
          aria-hidden="true"
        />
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
import { useKeyboardInset } from '@/composables/useKeyboardInset.js';

/* 键盘态隐藏（2026-09-24）：iOS 上 position:fixed 元素锚定布局视口，软键盘弹起时
   底栏不会消失、浮在键盘上方压住输入区。useKeyboardInset 不传 target = 纯判据、不写变量；
   与滚动隐藏取 OR —— 键盘收起后自动回到原有滚动状态。 */
const { isKeyboardOpen } = useKeyboardInset();

/* 入场动画（2026-09-23 加，2026-09-24 调慢调柔）：底栏首次出现时从下方缓慢滑入 ——
   首页下滑进入论坛、UserSpace 首次进入都走这里。用 keyframes 而非 transition：
   基类的 transition 是 220ms 缓动（服务于 island 展开 / 滚动隐藏等交互），
   入场要的是「浮上来」的柔和落定，两者不能共用一个 transition 声明。
   ⚠️ 时长必须与 bottom-nav.css 的 bottomNavSlideIn 默认值一致（由 CSS 变量覆写时以传入为准）。 */
const BOTTOM_NAV_ENTER_MS = 760;
const isEntering = ref(true);
let enterTimer = null;

/* 会话级「入场只播一次」闩锁（2026-10-22）：底栏在 首页 / 我 / 图库 三处**各自挂一份**，
   跨路由切换 = 旧实例卸载 + 新实例挂载。没有这个闩锁，每次切图库/回我都会把 760ms
   滑入重播一遍 —— 用户原话「底部导航栏又重新刷新了一下」。
   首次挂载（含首页 gate 揭示）保持原行为：从挂载时刻起算时长，与改动前完全一致。

   ⚠️ 闩锁挂 window 而不是模块级变量：dev 下本组件会被两条 import 路径
   （UserSpaceMain 的相对路径 / Cloud+ 的 @ 别名）解析成**两个模块实例**，
   模块级变量各记各的、等于没锁（实测 flag 两次都是 false）。window 恰好就是
   「本次会话」的天然单例。 */
let hasPlayedEnterThisSession = () => {
  if (typeof window === 'undefined') return false;
  return window.__bohBottomNavHasEntered === true;
};
const markEnterPlayed = () => {
  if (typeof window !== 'undefined') window.__bohBottomNavHasEntered = true;
};

const emit = defineEmits(['preload-tab', 'nav-click']);

const props = defineProps({
  visible: {
    type: Boolean,
    default: true,
  },
  hidden: {
    type: Boolean,
    default: false,
  },
  navItems: {
    type: Array,
    required: true,
  },
  currentTab: {
    type: String,
    required: true,
  },
  aiOverlayOpen: {
    type: Boolean,
    default: false,
  },
  hasUnreadMessages: {
    type: Boolean,
    default: false,
  },
  unreadCount: {
    type: Number,
    default: 0,
  },
  navIndicatorStyle: {
    type: Object,
    default: () => ({}),
  },
  /* 入场滑入时长（ms）。<= 0 表示用内置默认 760 ——「本页常显」场景（UserSpace）。
     首页是「开场画退场后底栏才浮现」，需要比默认更慢，由调用方传值。 */
  enterDuration: {
    type: Number,
    default: 0,
  },
});

const enterDurationMs = computed(() =>
  props.enterDuration > 0 ? props.enterDuration : BOTTOM_NAV_ENTER_MS,
);

const navHidden = computed(() => props.hidden || isKeyboardOpen.value);

onMounted(() => {
  /* 已播过就不再播：直接落到终态（无 keyframes ⇒ 无位移，视觉上是「原地就在」，
     而不是从屏幕外再滑一遍）。 */
  if (hasPlayedEnterThisSession()) {
    isEntering.value = false;
    return;
  }
  markEnterPlayed();
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
