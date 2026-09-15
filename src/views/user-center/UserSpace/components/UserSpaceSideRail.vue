<template>
  <aside class="userspace-rail liquid-glass" aria-label="用户空间导航">
    <div class="userspace-rail-scroll">
      <nav ref="navGroupRef" class="userspace-rail-group" aria-label="主导航">
        <span
          class="userspace-rail-indicator"
          :class="{ 'no-anim': indicatorSettled === false }"
          :style="indicatorStyle"
          aria-hidden="true"
        ></span>
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="userspace-rail-item"
          :class="{ active: currentTab === item.id }"
          :aria-current="currentTab === item.id ? 'page' : undefined"
          :data-tab="item.id"
          @pointerenter="$emit('preload-tab', item.id)"
          @focus="$emit('preload-tab', item.id)"
          @click.stop="handleNavClick(item.id)"
        >
          <component :is="item.icon" class="userspace-rail-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
          <span class="userspace-rail-label">{{ item.label }}</span>
          <span v-if="item.id === 'messages' && hasUnreadMessages" class="userspace-rail-badge">
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </span>
        </button>
      </nav>

      <div class="userspace-rail-divider" aria-hidden="true"></div>

      <nav class="userspace-rail-group" aria-label="便捷操作">
        <button
          v-for="action in QUICK_ACTIONS"
          :key="action.id"
          type="button"
          class="userspace-rail-item"
          :data-rail-action="action.id"
          @click.stop="$emit('action', action.id)"
        >
          <component :is="action.icon" class="userspace-rail-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
          <span class="userspace-rail-label">{{ action.label }}</span>
        </button>
      </nav>

      <div class="userspace-rail-divider" aria-hidden="true"></div>

      <nav class="userspace-rail-group userspace-rail-group--footer" aria-label="工具">
        <button type="button" class="userspace-rail-item" data-rail-action="theme"
          @click.stop="$emit('action', 'theme')">
          <component :is="currentTheme === 'dark' ? Sun : Moon" class="userspace-rail-icon" :size="18"
            :stroke-width="1.9" aria-hidden="true" />
          <span class="userspace-rail-label">主题</span>
        </button>
        <button type="button" class="userspace-rail-item" data-rail-action="home"
          @click.stop="$emit('action', 'home')">
          <House class="userspace-rail-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
          <span class="userspace-rail-label">首页</span>
        </button>
        <button v-if="isLoggedIn" type="button" class="userspace-rail-item" data-rail-action="logout"
          @click.stop="$emit('action', 'logout')">
          <LogOut class="userspace-rail-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
          <span class="userspace-rail-label">退出登录</span>
        </button>
      </nav>
    </div>
  </aside>
</template>

<script setup>
// 横屏左栏（电脑 + 平板横屏）。纯展示：
// · 主导航沿用 UserSpaceBottomNav 的同一份 navItems 与同一套点击事件
// · 便捷/工具区的动作统一走 action 事件，由 UserSpaceMain 分发到已有 handler
// 可见性由 side-rail.css 的媒体查询决定（默认 display:none），不新增任何状态或请求
import { House, LogOut, Moon, PenLine, Search, Sun } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const QUICK_ACTIONS = [
  { id: 'compose', label: '发布', icon: PenLine },
  { id: 'search', label: '搜索', icon: Search }
];

const emit = defineEmits(['preload-tab', 'nav-click', 'action']);

const props = defineProps({
  navItems: {
    type: Array,
    required: true
  },
  currentTab: {
    type: String,
    required: true
  },
  hasUnreadMessages: {
    type: Boolean,
    default: false
  },
  unreadCount: {
    type: Number,
    default: 0
  },
  currentTheme: {
    type: String,
    default: 'light'
  },
  isLoggedIn: {
    type: Boolean,
    default: false
  }
});

/* 滑动玻璃胶囊指示器：nav group 内 absolute（z0 在条目文字之下），
   offsetTop/offsetHeight 定位——随内容流天然跟随内层滚动，无需 scroll 监听；
   切 tab 240ms 滑动；首次定位与 ResizeObserver（宽窄栏断点 1280 / 字体重排）走 no-anim */
const navGroupRef = ref(null);
const indicatorStyle = ref({ transform: 'translateY(0px)', height: '56px', opacity: 0 });
const indicatorSettled = ref(true);
let resizeObserver = null;

const syncIndicator = async () => {
  await nextTick();
  const group = navGroupRef.value;
  const active = group ? group.querySelector('.userspace-rail-item.active') : null;
  if (!group || !active) {
    indicatorStyle.value = { ...indicatorStyle.value, opacity: 0 };
    return;
  }
  indicatorStyle.value = {
    transform: `translateY(${Math.round(active.offsetTop)}px)`,
    height: `${Math.round(active.offsetHeight)}px`,
    opacity: 1
  };
};

const syncIndicatorWithoutAnim = async () => {
  indicatorSettled.value = false;
  await syncIndicator();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      indicatorSettled.value = true;
    });
  });
};

const onScrollSync = () => {
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0;
    indicatorSettled.value = false;
    syncIndicator().then(() => {
      indicatorSettled.value = true;
    });
  });
};

watch(() => props.currentTab, () => {
  syncIndicator();
});

onMounted(() => {
  syncIndicatorWithoutAnim();
  if (typeof ResizeObserver === 'function' && navGroupRef.value) {
    resizeObserver = new ResizeObserver(() => {
      indicatorSettled.value = false;
      syncIndicator().then(() => {
        requestAnimationFrame(() => {
          indicatorSettled.value = true;
        });
      });
    });
    resizeObserver.observe(navGroupRef.value);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

const handleNavClick = (itemId) => {
  emit('nav-click', itemId);
};
</script>

<style src="./side-rail.css"></style>
