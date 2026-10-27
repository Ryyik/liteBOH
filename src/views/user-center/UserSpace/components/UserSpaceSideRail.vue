<template>
  <aside class="userspace-rail liquid-glass" aria-label="用户空间导航">
    <!-- 品牌位：占进「与内容区首屏对齐」留出的顶部空白，绝对定位、不进文档流 ——
         因此不增加内容高度、也不推挤首个条目（实测首项 top 不变）。
         2026-10-08：原来这里还挂着一个「更多」（主题 / 退出登录）按钮，
         已搬到滚动区**最底部** —— 低频 + 破坏性操作靠底是惯例，且底部菜单向上弹，
         不会再像挂在品牌位时那样横向跑出 88px 窄栏、被视口裁掉。 -->
    <div class="userspace-rail-brand">
      <img
        class="userspace-rail-brand-mark"
        src="/favicon.png"
        alt=""
        width="26"
        height="26"
        aria-hidden="true"
      />
      <span class="userspace-rail-brand-name">方块之家</span>
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
            :size="18"
            :stroke-width="1.9"
            aria-hidden="true"
          />
          <span class="userspace-rail-label">{{ item.label }}</span>
          <span v-if="item.id === 'messages' && hasUnreadMessages" class="userspace-rail-badge">
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </span>
        </button>
      </nav>

      <div class="userspace-rail-divider" aria-hidden="true"></div>

      <nav class="userspace-rail-group" aria-label="便捷操作">
        <button
          v-for="action in quickActionItems"
          :key="action.id"
          type="button"
          class="userspace-rail-item"
          :class="{ active: activeAction === action.id }"
          :aria-current="activeAction === action.id ? 'true' : undefined"
          :aria-label="action.label"
          :title="action.label"
          :data-rail-action="action.id"
          @click.stop="$emit('action', action.id)"
        >
          <component
            :is="action.icon"
            class="userspace-rail-icon"
            :size="18"
            :stroke-width="1.9"
            aria-hidden="true"
          />
          <span class="userspace-rail-label">{{ action.label }}</span>
        </button>
      </nav>

      <div class="userspace-rail-divider" aria-hidden="true"></div>

      <nav class="userspace-rail-group userspace-rail-group--footer" aria-label="工具">
        <button
          type="button"
          class="userspace-rail-item"
          data-rail-action="home"
          aria-label="首页"
          title="首页"
          @click.stop="$emit('action', 'home')"
        >
          <House class="userspace-rail-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
          <span class="userspace-rail-label">首页</span>
        </button>
      </nav>
    </div>

    <!-- 更多（主题 / 退出登录）：收低频偏好与破坏性操作 —— 要两步才登出，
         这是用一点点可用性换误触成本，取舍已确认。菜单**向上**弹。

         ⚠️ 它必须是 .userspace-rail-scroll 的**兄弟**、不能放在滚动容器里面
         （2026-10-11 修）：滚动容器是 `overflow-x: hidden + overflow-y: auto`
         （见 side-rail.css），绝对定位的后代会被它的 padding box 裁掉 ——
         88px 窄栏下浮层宽 172px，实际只剩 68px 可见，用户看到的是
         「深色模式 → 深」「退出登录 → 退」这种只剩图标 + 半个字的残条。
         240px 宽栏恰好没暴露（滚动容器 215px > 浮层 172px），所以此前三处
         探针全绿。挂在 scroll 外面后浮层不再受裁剪，窄栏下正常向右展开盖住内容区
         （左栏 z-index 2 高于内容层）；「更多」按钮同时变成常驻栏底、不再随内容滚走。 -->
    <div ref="moreWrapRef" class="userspace-rail-more-wrap">
      <button
        ref="moreBtnRef"
        type="button"
        class="userspace-rail-item userspace-rail-more"
        data-rail-action="more"
        :aria-expanded="moreOpen ? 'true' : 'false'"
        aria-haspopup="menu"
        aria-label="更多"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * 便捷区：**全站一份，发布 / 资产**（2026-10-26 用户纠偏后收敛）。
 *
 * 原先这里是「发布 / 搜索」，且允许宿主用 `quick-actions` 覆盖 —— 「我的」页传了
 * 「发布 / 资产」，于是同一个左栏在首页/他人空间/BOH 主区显示「搜索」、进「我」页
 * 又变成「资产」。用户读成 bug（「为啥我有时候还是会看到搜索，点击别的之后就会变成资产」）。
 *
 * 现在：左栏是**全局导航**，位置固定、内容也固定 —— 两个入口在所有宿主里一致：
 *   · 发布 → 有本地发布器的宿主自己开；没有的（他人空间 / 图库）走 `/?compose=1` 深链
 *   · 资产 → `/user-space?tab=assets`（全局可达，不会变成死按钮）
 * 搜索不再占左栏席位：它是论坛的能力，论坛自己的顶栏/`?search=1` 深链仍在。
 */
const DEFAULT_QUICK_ACTIONS = [
  { id: 'compose', label: '发布', icon: PenLine },
  { id: 'assets', label: '资产', icon: Wallet },
];

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
 * ⚠️ 默认值**不能**写在 defineProps 里（`default: () => DEFAULT_QUICK_ACTIONS`）——
 * `<script setup>` 的 defineProps 会被提升到 setup 之外，引用本地常量直接编译失败
 * （实测整页 500：`defineProps() cannot reference locally declared variables`）。
 * 所以常量只在 setup 内使用，模板读 computed。
 */
const quickActionItems = computed(() => DEFAULT_QUICK_ACTIONS);

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
