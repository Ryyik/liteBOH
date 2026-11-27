<template>
  <aside
    class="userspace-rail liquid-glass"
    :class="{ 'is-more-open': moreOpen }"
    aria-label="用户空间导航"
  >
    <!-- 品牌位：胶囊顶部。文字在 72px 宽下隐藏（按钮自带 aria-label / title）。 -->
    <div class="userspace-rail-brand">
      <img
        class="userspace-rail-brand-mark"
        :src="brandMarkUrl"
        alt=""
        width="24"
        height="24"
        aria-hidden="true"
      />
      <span class="userspace-rail-brand-name">方块之家</span>
    </div>

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
        :aria-label="item.label"
        :title="item.label"
        :data-tab="item.id"
        @pointerenter="$emit('preload-tab', item.id)"
        @focus="$emit('preload-tab', item.id)"
        @click.stop="handleNavClick(item.id)"
      >
        <component
          :is="item.icon"
          class="userspace-rail-icon"
          :size="22"
          :stroke-width="1.9"
          aria-hidden="true"
        />
        <span class="userspace-rail-label">{{ item.label }}</span>
        <span v-if="item.id === 'messages' && hasUnreadMessages" class="userspace-rail-badge">
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </button>
    </nav>

    <!-- 第 6 行：更多。发布 / 资产 / 首页 / 主题 / 退出全部收进这里，
         低频偏好与破坏性操作要两步才登出。菜单向上弹。 -->
    <div ref="moreWrapRef" class="userspace-rail-more-wrap">
      <button
        ref="moreBtnRef"
        type="button"
        class="userspace-rail-item userspace-rail-more"
        :class="{ active: moreOpen || !!activeAction }"
        data-rail-action="more"
        :aria-expanded="moreOpen ? 'true' : 'false'"
        aria-haspopup="menu"
        aria-label="更多"
        title="更多"
        @click.stop="toggleMore"
      >
        <svg
          class="userspace-rail-icon userspace-rail-more-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
        <span class="userspace-rail-label">更多</span>
      </button>
      <div v-if="moreOpen" class="userspace-rail-menu" role="menu">
        <button
          type="button"
          role="menuitem"
          class="userspace-rail-menu-item"
          :class="{ 'is-active': activeAction === 'compose' }"
          data-rail-action="compose"
          @click.stop="pickAction('compose')"
        >
          <PenLine :size="16" :stroke-width="1.9" aria-hidden="true" />
          <span>发布</span>
        </button>
        <button
          type="button"
          role="menuitem"
          class="userspace-rail-menu-item"
          data-rail-action="assets"
          @click.stop="pickAction('assets')"
        >
          <Wallet :size="16" :stroke-width="1.9" aria-hidden="true" />
          <span>资产</span>
        </button>
        <button
          type="button"
          role="menuitem"
          class="userspace-rail-menu-item"
          data-rail-action="home"
          @click.stop="pickAction('home')"
        >
          <House :size="16" :stroke-width="1.9" aria-hidden="true" />
          <span>首页</span>
        </button>
        <div class="userspace-rail-menu-divider" aria-hidden="true"></div>
        <button
          type="button"
          role="menuitem"
          class="userspace-rail-menu-item"
          data-rail-action="theme"
          @click.stop="pickAction('theme')"
        >
          <component
            :is="currentTheme === 'dark' ? Sun : Moon"
            :size="16"
            :stroke-width="1.9"
            aria-hidden="true"
          />
          <span>{{ currentTheme === 'dark' ? '浅色模式' : '深色模式' }}</span>
        </button>
        <button
          v-if="isLoggedIn"
          type="button"
          role="menuitem"
          class="userspace-rail-menu-item is-danger"
          data-rail-action="logout"
          @click.stop="pickAction('logout')"
        >
          <LogOut :size="16" :stroke-width="1.9" aria-hidden="true" />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup>
// 横屏左栏（电脑 + 平板横屏）。纯展示：
// · 主导航沿用 UserSpaceBottomNav 的同一份 navItems 与同一套点击事件
// · 便捷/工具区的动作统一走 action 事件，由 UserSpaceMain 分发到已有 handler
// 可见性由 side-rail.css 的媒体查询决定（默认 display:none），不新增任何状态或请求
import { House, LogOut, Moon, PenLine, Sun, Wallet } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
/* 品牌位那枚 26px 图标：改用打包进产物的 64px webp（872 B，小于 4096 的内联阈值
   ⇒ 直接内联进本 chunk，**零额外请求**），不再指向 public/favicon.png
   （8.2 KiB 的 1024px 大图；它在 index.html 里曾同时被 4 条 icon 声明引用，
   浏览器软导航时会反复重取，见性能勘察 §4.1）。2026-11-14。 */
import brandMarkUrl from '@/assets/images/brand-mark-64.webp';

/**
 * 便捷 / 工具入口（发布 / 资产 / 首页）已收进「更多」菜单（2026-11-26）：
 * 左栏只保留 5 席主导航 + 更多，宽度从 240/88 收成 72 的竖排胶囊。
 * 这些入口仍走 `action` 事件，由宿主分发到已有 handler。
 */
const emit = defineEmits(['preload-tab', 'nav-click', 'action']);

const props = defineProps({
  navItems: {
    type: Array,
    required: true,
  },
  currentTab: {
    type: String,
    required: true,
  },
  /**
   * 便捷区（发布 / 搜索）里当前处于「已打开会话」的那一项 id，没有则空串。
   * 与 currentTab 分开是有意的：会话是浮层、页面仍是内容页，两者语义不同层级。
   * 状态真源在 ForumMain（composer-state 事件），本组件只做展示。
   */
  activeAction: {
    type: String,
    default: '',
  },
  hasUnreadMessages: {
    type: Boolean,
    default: false,
  },
  unreadCount: {
    type: Number,
    default: 0,
  },
  currentTheme: {
    type: String,
    default: 'light',
  },
  isLoggedIn: {
    type: Boolean,
    default: false,
  },
});

/**
 * ⚠️ 默认值**不能**写在 defineProps 里（`default: () => …`）——
 * `<script setup>` 的 defineProps 会被提升到 setup 之外，引用本地常量直接编译失败
 * （实测整页 500：`defineProps() cannot reference locally declared variables`）。
 */

/* 滑动胶囊指示器：nav group 内 absolute（z0 在条目文字之下），
   offsetTop/offsetHeight 定位——切 tab 320ms 滑动；首次定位与 ResizeObserver 走 no-anim。
   胶囊内缩 2px（与竖屏底栏的选中框内缩同口径），高度取条目高 - 4。 */
const navGroupRef = ref(null);
const indicatorStyle = ref({ transform: 'translateY(0px)', height: '42px', opacity: 0 });
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
    transform: `translateY(${Math.round(active.offsetTop + 2)}px)`,
    height: `${Math.round(active.offsetHeight - 4)}px`,
    opacity: 1,
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

watch(
  () => props.currentTab,
  () => {
    syncIndicator();
  },
);

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
   outside-click 判定用**外层容器**而不是按钮本身：菜单也挂在容器内，
   否则 pointerdown 会先于 click 关掉菜单，菜单项永远点不到。 */
const moreWrapRef = ref(null);
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
  const root = moreWrapRef.value;
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
