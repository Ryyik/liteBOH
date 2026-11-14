<template>
  <div
    v-if="visible"
    ref="rootRef"
    class="bottom-nav-glass"
    :class="{
      'is-collapsed': navCollapsed,
      'is-hidden': navGone,
      'is-entering': isEntering,
      'ai-overlay-open': aiOverlayOpen,
    }"
    :style="{
      '--bottom-nav-enter-duration': `${enterDurationMs}ms`,
      /* 席位数交给 CSS 反推「居中档」的展开宽度（--bottom-nav-expanded-w）——
         底栏自己的 root 读不到 .nav-items 上那份内联变量（自定义属性不向上继承）。 */
      '--nav-count': navItems.length,
      /* 展开态高度（实测）。收起的球靠它做 height 过渡：auto 与长度之间不可过渡。 */
      '--bottom-nav-shell-h': shellH ? `${shellH}px` : undefined,
    }"
  >
    <div class="nav-items" :inert="navCollapsed" :style="resolvedNavIndicatorStyle">
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

    <!-- 收起态唯一可点的面：整颗圆就是「展开」按钮（2026-11-14）。
         点击只展开、不导航 —— 收起时用户想找的是「导航去哪了」，
         不是「我刚好点到了哪一席」，所以这里刻意不复用 nav-item 的点击链路。 -->
    <button
      class="nav-compact"
      type="button"
      :aria-label="compactLabel"
      aria-expanded="false"
      @click.stop="handleCompactClick"
    >
      <component
        :is="activeItem.icon"
        class="nav-compact-icon"
        :size="26"
        :stroke-width="1.9"
        aria-hidden="true"
      />
      <span v-if="hasUnreadMessages" class="nav-compact-dot" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';
import { useKeyboardInset } from '@/composables/useKeyboardInset.js';
import {
  beginBottomNavHandoff,
  consumeBottomNavHandoff,
  refreshBottomNavHandoff,
} from '@/views/user-center/UserSpace/composables/bottom-nav-motion.js';

/* 键盘态隐藏（2026-09-24）：iOS 上 position:fixed 元素锚定布局视口，软键盘弹起时
   底栏不会消失、浮在键盘上方压住输入区。useKeyboardInset 不传 target = 纯判据、不写变量；
   与滚动隐藏取 OR —— 键盘收起后自动回到原有滚动状态。 */
const { isKeyboardOpen } = useKeyboardInset();
const route = useRoute();

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

const emit = defineEmits(['preload-tab', 'nav-click', 'expand-request']);

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

/* 两种「不在展开态」，语义必须分开（2026-11-14 收起态改造）：
   · is-collapsed —— 滚动方向驱动的**收起**：缩成左下角一颗圆，仍在，点一下就回来
   · is-hidden    —— 键盘弹起 / 消息选择态的**真消失**：键盘上方浮一颗圆反而挡手
   合并成一个布尔回到旧行为（向中间捏扁淡出）；拆开才能让「滚回去」和
   「键盘收起」两件事看起来不一样。 */
const navCollapsed = computed(() => props.hidden && !isKeyboardOpen.value);
const navGone = computed(() => isKeyboardOpen.value);

/* ── 展开态高度 = 实测值（2026-11-14）────────────────────────────────
   收起态要把整条压成一颗 60 的球，height 必须能从「条高」过渡到 60；而
   height: auto ↔ 长度**不可过渡**，所以量一次写进 --bottom-nav-shell-h。
   ⚠️ 只在展开态量：收起时的高度是我们强制的 60，量回去会把真值污染成 60。
   ⚠️ 不用 ResizeObserver：收起动画全程宽度/高度都在变，RO 会把中间态写回去，
      形成「动画越走越偏」的自激。横竖屏与字号变化走 window resize 足够。 */
const rootRef = ref(null);
const shellH = ref(0);

const syncShellHeight = () => {
  const el = rootRef.value;
  if (!el || navCollapsed.value) return;
  const h = Math.ceil(el.getBoundingClientRect().height);
  if (h > 0 && h !== shellH.value) shellH.value = h;
};

/* ── 收起态要给发帖 FAB 一个信号（2026-11-14）──────────────────────────
   .mobile-compose-fab 是 Teleport 到 body 的兄弟节点，拿不到底栏的 class，
   只能在 body 上挂一枚标记，由 compose-fab.css 负责「跟着降下来 / 跟着升回去」。
   标记必须是**这个组件**加的：收起态的真源只有这里，别在别处再推断一次。 */
const NAV_COLLAPSED_BODY_CLASS = 'boh-bottom-nav-collapsed';
let ownsBodyFlag = false;

const syncBodyFlag = () => {
  if (typeof document === 'undefined') return;
  if (navCollapsed.value) {
    document.body.classList.add(NAV_COLLAPSED_BODY_CLASS);
    ownsBodyFlag = true;
    return;
  }
  if (ownsBodyFlag) {
    document.body.classList.remove(NAV_COLLAPSED_BODY_CLASS);
    ownsBodyFlag = false;
  }
};

watch(navCollapsed, syncBodyFlag, { immediate: true });

/* ── 选中态位移（2026-10-26）─────────────────────────────────────────────
   displayIndex 是「指示器此刻停在哪」，activeIndex 是「它应该去哪」。
   同页切换由 watch 一帧内把 displayIndex 追到 activeIndex，CSS 负责滑动；
   跨页切换则在 setup / onActivated 消费一次接力状态：先以来源席为起点，
   下一帧再交给真实选中席，避免新底栏直接在终点挂载。 */
const activeIndex = computed(() => {
  const found = props.navItems.findIndex((item) => item.id === props.currentTab);
  return Math.max(0, found);
});

/* 收起态圆里那颗图标 = 当前席（与选中指示器同一个 index 口径）。
   navItems 为空时给一个空对象兜底：模板里 :is 会渲染成注释节点，不会炸。 */
const activeItem = computed(() => props.navItems[activeIndex.value] || props.navItems[0] || {});
const compactLabel = computed(() => `展开底部导航，当前：${activeItem.value.label || ''}`);

const initialHandoff = consumeBottomNavHandoff({
  toId: props.currentTab,
  navCount: props.navItems.length,
});

const displayIndex = ref(initialHandoff ? initialHandoff.fromIndex : activeIndex.value);
const indicatorDurationMs = ref(320);
const suppressIndicatorTransition = ref(false);

const durationForDistance = (distance) => {
  if (distance <= 1) return 320;
  if (distance === 2) return 380;
  return 440;
};

let handoffRaf = 0;

const cancelHandoffRaf = () => {
  if (handoffRaf) {
    cancelAnimationFrame(handoffRaf);
    handoffRaf = 0;
  }
};

const moveToActiveIndex = () => {
  cancelHandoffRaf();
  const distance = Math.abs(activeIndex.value - displayIndex.value);
  if (distance === 0) return;
  indicatorDurationMs.value = durationForDistance(distance);
  handoffRaf = requestAnimationFrame(() => {
    handoffRaf = 0;
    displayIndex.value = activeIndex.value;
  });
};

/* KeepAlive 的实例在重新激活时不会重跑 setup。先无动画对齐到来源席，
   再走一次正常的滑入；两帧之间保留「先定位、后移动」的边界。 */
const replayActivatedHandoff = async (handoff) => {
  if (handoff.fromIndex === activeIndex.value) return;
  cancelHandoffRaf();
  suppressIndicatorTransition.value = true;
  displayIndex.value = handoff.fromIndex;
  await nextTick();
  requestAnimationFrame(() => {
    suppressIndicatorTransition.value = false;
    moveToActiveIndex();
  });
};

const applyActivatedHandoff = () => {
  const handoff = consumeBottomNavHandoff({
    toId: props.currentTab,
    navCount: props.navItems.length,
  });
  if (!handoff) return;
  void replayActivatedHandoff(handoff);
};

watch(activeIndex, (next) => {
  if (suppressIndicatorTransition.value) {
    displayIndex.value = next;
    return;
  }
  const distance = Math.abs(next - displayIndex.value);
  if (distance === 0) return;
  indicatorDurationMs.value = durationForDistance(distance);
  displayIndex.value = next;
});

const resolvedNavIndicatorStyle = computed(() => ({
  ...props.navIndicatorStyle,
  '--active-nav-index': displayIndex.value,
  '--nav-indicator-duration': `${suppressIndicatorTransition.value ? 0 : indicatorDurationMs.value}ms`,
}));

/* 源实例停用 / 卸载时刷新接力时间：点击到真正导航之间可能隔着草稿确认。 */
let pendingNavigation = null;

const refreshPendingHandoff = () => {
  if (!pendingNavigation) return;
  refreshBottomNavHandoff(pendingNavigation);
};

onMounted(() => {
  syncShellHeight();
  window.addEventListener('resize', syncShellHeight, { passive: true });

  /* 已播过就不再播：直接落到终态（无 keyframes ⇒ 无位移，视觉上是「原地就在」，
     而不是从屏幕外再滑一遍）。 */
  if (initialHandoff) moveToActiveIndex();

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

let hasShownOnce = false;

onActivated(() => {
  /* 重新激活时尺寸可能已变（横竖屏切换 / 字号变化），重量一次 */
  syncShellHeight();
  syncBodyFlag();
  /* 首次挂载也会触发 onActivated：该次交给 onMounted，避免同一接力被消费两次。 */
  if (!hasShownOnce) {
    hasShownOnce = true;
    return;
  }
  applyActivatedHandoff();
});

/* visible 由 false 翻回 true 时元素是重新挂载的，高度要重新量 */
watch(
  () => props.visible,
  async (next) => {
    if (!next) return;
    await nextTick();
    syncShellHeight();
  },
);

onDeactivated(() => {
  refreshPendingHandoff();
  /* 页面切走时把 FAB 标记摘掉，否则下一个宿主在底栏展开的情况下
     仍会看到「+ 停在低位」（标记没有别人负责清） */
  if (ownsBodyFlag) {
    document.body.classList.remove(NAV_COLLAPSED_BODY_CLASS);
    ownsBodyFlag = false;
  }
});

onBeforeUnmount(() => {
  cancelHandoffRaf();
  refreshPendingHandoff();
  window.removeEventListener('resize', syncShellHeight);
  if (ownsBodyFlag) {
    document.body.classList.remove(NAV_COLLAPSED_BODY_CLASS);
    ownsBodyFlag = false;
  }
  if (enterTimer) {
    window.clearTimeout(enterTimer);
    enterTimer = null;
  }
});

/* 点圆只做「展开」这一件事，不导航。⚠️ 宿主必须接 expand-request 去调
   resetBottomNavAutoHide()：滚动位置没变时 props.hidden 不会自己回 false，
   不 reset 就会「点开一次之后再也收不起来」（这是本次改造最容易漏的一条）。 */
const handleCompactClick = () => {
  if (!navCollapsed.value) return;
  emit('expand-request');
};

const handleNavClick = (itemId) => {
  const fromId = props.currentTab;
  const target = props.navItems.find((item) => item.id === itemId);
  const targetPath = String(target?.route || '').split('?')[0];
  const leavesCurrentPage = Boolean(targetPath && targetPath !== route.path);
  if (fromId !== itemId && leavesCurrentPage) {
    pendingNavigation = { fromId, toId: itemId };
    beginBottomNavHandoff({
      fromId,
      toId: itemId,
      fromIndex: activeIndex.value,
      navCount: props.navItems.length,
    });
  } else {
    pendingNavigation = null;
  }
  emit('nav-click', itemId);
};
</script>

<style src="./bottom-nav.css"></style>
