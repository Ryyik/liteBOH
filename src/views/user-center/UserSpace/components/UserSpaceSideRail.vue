<template>
  <aside class="userspace-rail liquid-glass" aria-label="用户空间导航">
    <!-- 品牌位：占进「与内容区首屏对齐」留出的顶部空白，绝对定位、不进文档流 ——
         因此不增加内容高度、也不推挤首个条目（实测首项 top 不变）。
         右侧「更多」承载低频偏好与破坏性操作：主题、退出登录。
         退出登录原本与「首页」同级吸底，等于给破坏性操作发了常用操作的权重，
         移进来后要两步才登出 —— 这是用一点点可用性换误触成本，取舍已确认。 -->
    <div ref="brandRef" class="userspace-rail-brand">
      <img class="userspace-rail-brand-mark" src="/favicon.png" alt="" width="26" height="26" aria-hidden="true" />
      <span class="userspace-rail-brand-name">方块之家</span>
      <button ref="moreBtnRef" type="button" class="userspace-rail-more" data-rail-action="more"
        :aria-expanded="moreOpen ? 'true' : 'false'" aria-haspopup="menu" aria-label="更多"
        @click.stop="toggleMore">
        <svg class="userspace-rail-more-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
      <div v-if="moreOpen" class="userspace-rail-menu" role="menu">
        <button type="button" role="menuitem" class="userspace-rail-menu-item" data-rail-action="theme"
          @click.stop="pickAction('theme')">
          <component :is="currentTheme === 'dark' ? Sun : Moon" :size="16" :stroke-width="1.9" aria-hidden="true" />
          <span>{{ currentTheme === 'dark' ? '浅色模式' : '深色模式' }}</span>
        </button>
        <button v-if="isLoggedIn" type="button" role="menuitem"
          class="userspace-rail-menu-item is-danger" data-rail-action="logout"
          @click.stop="pickAction('logout')">
          <LogOut :size="16" :stroke-width="1.9" aria-hidden="true" />
          <span>退出登录</span>
        </button>
      </div>
    </div>

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
        <button type="button" class="userspace-rail-item" data-rail-action="home"
          @click.stop="$emit('action', 'home')">
          <House class="userspace-rail-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
          <span class="userspace-rail-label">首页</span>
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
// onScrollSync 的 RAF 去重闸：0 = 当前无待执行帧回调（requestAnimationFrame 返回值恒为正数）
let scrollRafId = 0;

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
  // 捕获阶段监听：即便菜单项自身 stop 了冒泡，也能拿到最外层的 pointerdown
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onDocKeydown);
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
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onDocKeydown);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

/* 「更多」菜单（主题 / 退出登录）。
   outside-click 判定用品牌位容器而不是按钮本身：菜单也挂在容器内，
   否则 pointerdown 会先于 click 关掉菜单，菜单项永远点不到。 */
const brandRef = ref(null);
const moreBtnRef = ref(null);
const moreOpen = ref(false);

const toggleMore = () => {
  moreOpen.value = !moreOpen.value;
};

const pickAction = (actionId) => {
  moreOpen.value = false;
  emit('action', actionId);
};

const onDocPointerDown = (event) => {
  if (!moreOpen.value) return;
  const root = brandRef.value;
  if (root && event.target && root.contains(event.target)) return;
  moreOpen.value = false;
};

const onDocKeydown = (event) => {
  if (event.key === 'Escape' && moreOpen.value) moreOpen.value = false;
};

const handleNavClick = (itemId) => {
  emit('nav-click', itemId);
};
</script>

<style src="./side-rail.css"></style>
