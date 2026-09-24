<template>
  <div id="unified-nav-container" class="unified-nav" :class="{
    'mobile-menu-open': isMobileMenuOpen
  }" data-theme>
    <div
      class="unified-nav-surface"
      :class="{
        'has-status-card': statusCardItem.visible,
        'has-long-status-card': statusCardItem.visible && statusCardItem.isLong,
        'has-login-card': showLoginModal,
        'has-bohai-island': isBohaiIslandOpen,
        'has-task-card': isTaskCardShown,
        'has-custom-card': !!islandCustomSlot.component,
        // 新闻中心的搜索/筛选是从灵动导航栏向下衍生的扩展卡片，不占用导航文字行。
        'has-nav-island-panel': false,
        'has-nav-search-panel': false,
        'has-nav-filter-menu': false,
        // 竖屏 Mini 形态（plans/009）：nav-mini-caps = 机制生效，nav-expanded = 当前视觉长条
        'nav-mini-caps': navMini,
        'nav-expanded': isExpandedLooking
      }"
      @click="handleSurfaceTap"
      :style="{
        '--global-nav-status-duration': `${navStatus.duration}ms`,
        '--global-nav-status-card-height': `${navStatusCardHeight}px`,
        '--global-nav-custom-card-height': `${customCardHeight}px`,
      }"
    >
    <div class="nav-container">
      <router-link to="/" class="nav-logo" @click.stop>
        <div class="nav-logo-icon">
          <img :src="getImageUrl('favicon.webp')" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        <span class="nav-logo-text">方块之家</span>
      </router-link>

      <ul class="nav-menu">
        <li v-for="item in navItems" :key="item.name" class="nav-menu-item"
          :class="{ 'has-dropdown': hasChildren(item) }">
          <template v-if="hasChildren(item)">
            <a href="javascript:;" class="nav-link-wrapper"
              :class="{ active: item.isActive, expanded: item.isExpanded }" @click="toggleSubMenu(item.name)">
              <span>{{ item.label }}</span>
            </a>
            <ul class="nav-submenu" :class="{ active: item.isExpanded }">
              <!-- 有分组的菜单：分组列表 ↔ 三级下钻（带切换动画） -->
              <template v-if="hasGroupChildren(item)">
                <Transition name="nav-drill" mode="out-in">
                  <div v-if="activeGroup" :key="`grand-${item.name}-${activeGroup}`" class="nav-submenu-pane nav-submenu-pane-grand">
                    <li class="nav-submenu-back">
                      <a href="javascript:;" @click="activeGroup = null">
                        <span class="nav-submenu-back-arrow">←</span> 返回
                      </a>
                    </li>
                    <li v-for="grand in activeGroupChildren(item)" :key="grand.name">
                      <router-link v-if="grand.path" :to="grand.path" :class="{ active: isActive(grand.path) }"
                        @click="expandedMenu = null">
                        {{ grand.label }}
                      </router-link>
                      <a v-else-if="grand.action" href="javascript:;"
                        @click="handleMenuAction(grand.action); expandedMenu = null">
                        {{ grand.label }}
                      </a>
                    </li>
                  </div>
                  <div v-else :key="`groups-${item.name}`" class="nav-submenu-pane nav-submenu-pane-groups">
                    <li v-for="child in item.children" :key="child.name">
                      <router-link v-if="child.path" :to="child.path" :class="{ active: isActive(child.path) }"
                        @click="expandedMenu = null">
                        {{ child.label }}
                      </router-link>
                      <a v-else-if="child.action" href="javascript:;"
                        @click="handleMenuAction(child.action); expandedMenu = null">
                        {{ child.label }}
                      </a>
                      <a v-else href="javascript:;" class="nav-submenu-group-title"
                        @click="activeGroup = child.name; activeGroupParent = item.name">
                        {{ child.label }}
                      </a>
                    </li>
                  </div>
                </Transition>
              </template>
              <!-- 扁平二级（无分组，如社区） -->
              <template v-else>
                <li v-for="child in item.children" :key="child.name">
                  <router-link v-if="child.path" :to="child.path" :class="{ active: isActive(child.path) }"
                    @click="expandedMenu = null">
                    {{ child.label }}
                  </router-link>
                  <a v-else-if="child.action" href="javascript:;"
                    @click="handleMenuAction(child.action); expandedMenu = null">
                    {{ child.label }}
                  </a>
                </li>
              </template>
            </ul>
          </template>
          <template v-else>
            <router-link :to="item.path" :class="{ active: item.isActive }" active-class="" exact-active-class="">
              {{ item.label }}
            </router-link>
          </template>
        </li>
      </ul>

      <div class="nav-user" id="nav-user-area">
        <!-- DEV-TEST：智能概览灵动岛手动触发按钮（仅开发环境渲染，上线前整块删除） -->
        <button
          v-if="isDevMode && isLoggedIn"
          type="button"
          class="nav-dev-island-btn"
          title="测试：模拟离线 30 天，用数据库真实内容强制触发智能概览灵动岛"
          @click.stop="forceShowOverviewIsland({ simulateDays: 30 })"
        >
          <Bot :size="13" :stroke-width="2.2" aria-hidden="true" />
          <span>岛</span>
        </button>
        <template v-if="isLoggedIn">
          <router-link to="/user-space" class="nav-user-info nav-user-profile" id="nav-user-info" title="进入我的方块" @click="handleMyBlockClick">
            <span class="boh-avatar-wrap">
              <div class="nav-avatar">
                <img v-if="avatarUrl" :src="avatarUrl" alt="头像" class="nav-avatar-img" loading="lazy" decoding="async">
                <span v-else>{{ username ? username.charAt(0).toUpperCase() : 'U' }}</span>
                <!-- 未读消息红点 -->
                <div v-if="hasUnreadMessages" class="unread-badge-nav">
                  {{ unreadCount > 99 ? '99+' : unreadCount }}
                </div>
              </div>
              <span v-if="navFrame" class="boh-avatar-frame"
                :style="{ '--boh-avatar-frame-url': `url(${navFrame.url})`, '--boh-avatar-frame-scale': String(navFrame.scale) }"
                aria-hidden="true"></span>
            </span>
            <span class="nav-username">我的方块</span>
          </router-link>
        </template>
        <template v-else-if="isInitialized">
          <button class="nav-login-btn" id="nav-login-btn" @click.stop="showLoginModal = true">
            登录
          </button>
        </template>
        <template v-else>
          <!-- 初始化中，显示一个极简的占位 -->
          <div class="nav-user-loading"></div>
        </template>
      </div>

      <button type="button" class="nav-hamburger" id="nav-hamburger"
        :class="{ active: isMobileMenuOpen }" :aria-expanded="isMobileMenuOpen"
        aria-controls="nav-menu-mobile" :aria-label="isMobileMenuOpen ? '关闭导航菜单' : '打开导航菜单'"
        @click.stop="toggleMobileMenu">
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>

    <div class="nav-menu-mobile" id="nav-menu-mobile" :class="{ active: isMobileMenuOpen }">
      <div class="nav-menu-mobile-content">
        <HomeCatMascot v-if="isHomeCatActive" class="nav-mobile-menu-cat" pool="background"
          :seed="`mobile-menu-${mobileMenuOpenCount}`" size="lg" decorative />
        <div class="nav-mobile-main-menu" :class="{ hidden: expandedMenu }">
          <template v-for="item in navItems" :key="item.name">
            <template v-if="hasChildren(item)">
              <div class="nav-mobile-item has-children">
                <a href="javascript:;" class="nav-mobile-link" :class="{ active: item.isActive }"
                  @click="toggleSubMenu(item.name)">
                  <span>{{ item.label }}</span>
                </a>
              </div>
            </template>
            <template v-else>
              <router-link class="nav-mobile-link" :class="{ active: item.isActive }" :to="item.path"
                @click="closeMobileMenu">
                {{ item.label }}
              </router-link>
            </template>
          </template>
        </div>
        <div class="nav-mobile-submenu-container" :class="{ active: expandedMenu }" data-panel-variant="glass">
          <div class="nav-mobile-back" @click="closeSubMenu">
            <span class="back-arrow">←</span>
            <span>返回</span>
          </div>
          <template v-for="item in navItems" :key="item.name">
            <div v-show="hasChildren(item) && item.isExpanded" class="nav-mobile-submenu-section">
              <div class="nav-mobile-submenu-heading">{{ item.label }}</div>
              <div class="nav-mobile-submenu" :class="{ active: item.isExpanded }">
                <!-- 有分组的菜单：分组列表 ↔ 三级下钻 -->
                <template v-if="hasGroupChildren(item)">
                  <template v-if="activeGroup && activeGroupParent === item.name">
                    <div class="nav-mobile-group-back" @click="activeGroup = null; activeGroupParent = null">
                      <span class="group-back-arrow">←</span>
                      <span>返回分组</span>
                    </div>
                    <template v-for="grand in activeGroupChildren(item)" :key="grand.name">
                      <router-link v-if="grand.path" :to="grand.path" :class="{ active: isActive(grand.path) }"
                        @click="closeMobileMenu">
                        {{ grand.label }}
                      </router-link>
                      <a v-else-if="grand.action" href="javascript:;"
                        @click="handleMenuAction(grand.action); closeMobileMenu()">
                        {{ grand.label }}
                      </a>
                    </template>
                  </template>
                  <template v-else>
                    <template v-for="child in item.children" :key="child.name">
                      <router-link v-if="child.path" :to="child.path" :class="{ active: isActive(child.path) }"
                        @click="closeMobileMenu">
                        {{ child.label }}
                      </router-link>
                      <a v-else-if="child.action" href="javascript:;"
                        @click="handleMenuAction(child.action); closeMobileMenu()">
                        {{ child.label }}
                      </a>
                      <div v-else class="nav-mobile-group-entry"
                        @click="activeGroup = child.name; activeGroupParent = item.name">
                        <span class="nav-mobile-group-entry-label">{{ child.label }}</span>
                      </div>
                    </template>
                  </template>
                </template>
                <!-- 扁平二级（无分组，如社区） -->
                <template v-else>
                  <template v-for="child in item.children" :key="child.name">
                    <router-link v-if="child.path" :to="child.path" :class="{ active: isActive(child.path) }"
                      @click="closeMobileMenu">
                      {{ child.label }}
                    </router-link>
                    <a v-else-if="child.action" href="javascript:;"
                      @click="handleMenuAction(child.action); closeMobileMenu()">
                      {{ child.label }}
                    </a>
                  </template>
                </template>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <GlobalNavStatusCard
      :item="statusCardItem"
      @action="handleNavStatusAction"
      @after-leave="handleNavStatusAfterLeave"
      @resize="handleStatusCardResize"
    />
    <GlobalNavTaskCard
      :item="islandTaskView"
      @action="handleIslandTaskAction"
      @after-leave="handleIslandTaskAfterLeave"
      @resize="handleStatusCardResize"
    />
    <div
      v-show="!isTaskCardShown && !isBohaiIslandOpen"
      v-if="islandCustomSlot.component"
      :key="`island-custom-${islandCustomSlot.key}`"
      ref="islandCustomHost"
      class="island-custom-host"
    >
      <!-- 仲裁：任务岛/AI 岛占用 surface 时自定义岛让位（v-show 保状态，隐藏后高度上报 0，收起后自动回归） -->
      <component :is="islandCustomSlot.component" v-bind="islandCustomSlot.props || {}" />
    </div>
    <BOHAIIsland />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getImageUrl } from "../../utils/asset-helper.js";
import { useAuthStore } from "@/stores/auth";
import { resolveFrameForAuthor } from "@/composables/useAvatarFrame.js";
import { storeToRefs } from "pinia";
import { loadNotificationStore, getNotificationStoreSync } from "@/stores/notification-loader";
import { Bot } from "lucide-vue-next";
import HomeCatMascot from "@/components/HomeCatMascot.vue";
import { themeManager } from "@/utils/theme-manager.js";
import { isHomeCatTheme } from "@/utils/home-cat-theme.js";
import { useConfirmDialog } from "@/composables/useConfirmDialog.js";
import { useVersionCheck } from "@/composables/useVersionCheck.js";
import { useOverviewIsland } from "@/composables/useOverviewIsland.js";
import { toggleHiagentChat } from "@/utils/hiagent-widget.js";
import GlobalNavStatusCard from "./GlobalNavStatusCard.vue";
import GlobalNavTaskCard from "./GlobalNavTaskCard.vue";
import BOHAIIsland from "./BOHAIIsland.vue";
import { useGlobalAiOverlay } from "@/composables/useGlobalAiOverlay.js";
import {
  GLOBAL_NAV_STATUS_EVENT,
  registerIslandAiOpener,
  setIslandAiPaused,
  islandTaskAction,
  islandTaskCardLeft,
  islandTaskView,
  islandCustomSlot
} from "@/composables/useIsland.js";

const authStore = useAuthStore();
const { isLoggedIn, isInitialized, showLoginModal, isAdmin } = storeToRefs(authStore);
const { maybeShowOverviewIsland, forceShowOverviewIsland } = useOverviewIsland();
// BOHAI 灵动岛：岛组件内部已订阅 isExpanded，navbar 仅读取用于 surface 类名联动
// （原 useBohaiIsland 薄包装已内联，状态统一来自 useGlobalAiOverlay 单例）
const { isOpen: isBohaiOverlayOpen, canOpen: isBohaiIslandAllowed, open: openBohaiOverlay } = useGlobalAiOverlay();
const isBohaiIslandOpen = computed(() => isBohaiOverlayOpen.value && isBohaiIslandAllowed.value);
// 注册 AI 岛 opener：showIsland.ai() 由这里真正打开 BOH AI 岛（可带种子 prompt 与期望模型模式）
registerIslandAiOpener(({ prompt, mode } = {}) => {
  if (!isBohaiIslandAllowed.value) return false;
  openBohaiOverlay({ prompt, mode });
  return true;
});
// DEV-TEST：仅开发环境显示灵动岛测试按钮（与模板中 DEV-TEST 块一起删除）
const isDevMode = import.meta.env.DEV;
const notificationStoreRef = ref(getNotificationStoreSync());
const { alert, confirm } = useConfirmDialog();
const { checkForUpdate, applyUpdate, isChecking } = useVersionCheck();
const router = useRouter();
const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const isHomeCatActive = computed(() => (
  isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value)
));
const navStatus = ref({
  visible: false,
  title: '',
  message: '',
  icon: 'success',
  isLong: false,
  duration: 620,
  distance: 22,
  blur: 20,
  reducedMotion: false
});
const navStatusCardHeight = ref(58);
const customCardHeight = ref(0);
const navStatusQueue = [];
let navStatusDismissTimer = null;

// ============================================
// 灵动岛统一仲裁（useIsland 调度中心）
// 优先级：AI 岛 > 任务岛 > 通知岛，同一时刻 surface 只展示一张卡
// ============================================

const isTaskCardShown = computed(() => !!islandTaskView.value);

// 任务岛/AI 岛占用期间通知卡暂停展示（转为隐藏并保持队列，收起后自动恢复）
const statusCardItem = computed(() => {
  if (isBohaiIslandOpen.value || isTaskCardShown.value) {
    return { ...navStatus.value, visible: false };
  }
  return navStatus.value;
});

const clearNavStatusDismissTimer = () => {
  if (!navStatusDismissTimer) return;
  clearTimeout(navStatusDismissTimer);
  navStatusDismissTimer = null;
};

const normalizeNavStatus = (payload = {}) => {
  const title = String(payload.title || '').trim() || '已完成';
  const message = String(payload.message || '').trim();
  const icon = String(payload.icon || payload.type || 'success').trim();
  const durationMs = Math.min(Math.max(Number(payload.durationMs) || 4200, 1800), 10000);
  const previews = Array.isArray(payload.previews)
    ? payload.previews
        .filter((p) => p && typeof p === 'object' && String(p.title || '').trim())
        .slice(0, 3)
        .map((p) => ({
          type: p.type === 'news' ? 'news' : 'post',
          title: String(p.title).trim(),
          excerpt: String(p.excerpt || '').trim(),
          time: String(p.time || '').trim(),
          image: String(p.image || '').trim()
        }))
    : [];

  return {
    visible: true,
    kind: payload.kind || '',
    title,
    message,
    icon,
    previews,
    isLong: Boolean(payload.isLong) || `${title}${message}`.length > 24,
    duration: Math.min(Math.max(Number(payload.motionDuration) || 620, 240), 1200),
    distance: Math.min(Math.max(Number(payload.distance) || 22, 0), 48),
    blur: Math.min(Math.max(Number(payload.blur) || 20, 0), 28),
    reducedMotion: Boolean(payload.reducedMotion),
    durationMs,
    onAction: typeof payload.onAction === 'function' ? payload.onAction : null,
    query: payload.query || '',
    filter: payload.filter || 'all',
    options: payload.options || [],
    onSearch: payload.onSearch,
    onFilter: payload.onFilter,
    persistent: Boolean(payload.persistent)
  };
};

const presentNavStatus = (item) => {
  clearNavStatusDismissTimer();
  navStatusCardHeight.value = 58;
  navStatus.value = item;
  if (item.persistent) return;
  navStatusDismissTimer = setTimeout(() => {
    // 队列非空时无缝接管（不先置 visible=false）：若先摘 has-status-card，
    // leave 动画期间展开态缺席 → mini 形态会启动回缩又被下一条拉回，出现半收闪断（plans/009 §3-1）
    const next = navStatusQueue.shift();
    if (next) {
      presentNavStatus(next);
      return;
    }
    navStatus.value = { ...navStatus.value, visible: false };
  }, item.durationMs);
};

const flushNavStatusQueue = () => {
  if (navStatus.value.visible || isTaskCardShown.value || isBohaiIslandOpen.value) return;
  const next = navStatusQueue.shift();
  if (next) presentNavStatus(next);
};

const handleGlobalNavStatus = (event) => {
  const item = normalizeNavStatus(event?.detail || {});
  if (navStatus.value.visible || isTaskCardShown.value || isBohaiIslandOpen.value) {
    navStatusQueue.push(item);
    return;
  }
  presentNavStatus(item);
};

const handleNavStatusPreview = (event) => {
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  const detail = event?.detail || {};
  navStatus.value = {
    visible: Boolean(detail.visible),
    title: String(detail.title || '已完成'),
    message: String(detail.message || ''),
    icon: String(detail.icon || 'success'),
    isLong: Boolean(detail.isLong),
    duration: Number(detail.duration) || 620,
    distance: Number(detail.distance) || 22,
    blur: Number(detail.blur) || 20,
    reducedMotion: Boolean(detail.reducedMotion)
  };
};

const handleNavStatusAction = () => {
  const { onAction } = navStatus.value;
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  navStatus.value = { ...navStatus.value, visible: false };
  onAction?.();
};

const handleNavStatusAfterLeave = () => {
  clearNavStatusDismissTimer();
  flushNavStatusQueue();
};

const handleStatusCardResize = (height) => {
  const nextHeight = Math.ceil(Number(height) || 58);
  if (Math.abs(nextHeight - navStatusCardHeight.value) > 1) {
    navStatusCardHeight.value = nextHeight;
  }
};

// 自定义岛（showIsland.custom）高度：独立变量上报。
// 不可写入 navStatusCardHeight —— 否则岛关闭后常驻状态卡会继承被撑大的高度，导航 surface 无法复原。
const handleCustomCardResize = (height) => {
  const nextHeight = Math.max(0, Math.ceil(Number(height) || 0));
  if (Math.abs(nextHeight - customCardHeight.value) > 1) {
    customCardHeight.value = nextHeight;
  }
};

// ---- 任务岛（GlobalNavTaskCard）事件 ----

const handleIslandTaskAction = (actionId) => {
  islandTaskAction(actionId);
};

const handleIslandTaskAfterLeave = () => {
  islandTaskCardLeft();
  flushNavStatusQueue();
};

// 任务岛收起后恢复队列中的通知
watch(isTaskCardShown, (shown, prev) => {
  if (!shown && prev) flushNavStatusQueue();
});

// AI 岛开关：占用期间暂停任务卡展示，收起后恢复并冲刷通知队列
// immediate：navbar 卸载期间 AI 岛仍可能保持展开，重挂载时需同步一次
watch(isBohaiIslandOpen, (open) => {
  setIslandAiPaused(open);
  if (!open) flushNavStatusQueue();
}, { immediate: true });

// ---- 自定义岛（showIsland.custom）高度上报 ----

const islandCustomHost = ref(null);
let customHostResizeObserver = null;

const observeIslandCustomHost = async () => {
  await nextTick();
  customHostResizeObserver?.disconnect();
  customHostResizeObserver = null;
  if (!islandCustomHost.value) return;
  customHostResizeObserver = new ResizeObserver(() => {
    const height = islandCustomHost.value?.getBoundingClientRect().height;
    handleCustomCardResize(height);
  });
  customHostResizeObserver.observe(islandCustomHost.value);
};

watch(() => islandCustomSlot.component, (component) => {
  if (!component) customCardHeight.value = 0;
  observeIslandCustomHost();
});

// ============================================
// 窗口缩放
// ============================================
// Beta 6 起导航为常驻悬浮岛，滚动收纳（stable .scrolled）机制已随 4.9.1 回退通道一并移除。

let resizeRafId = null;

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);

// ============================================
// 路由相关配置
// ============================================

const route = useRoute();

const isActive = (path) => {
  // 2026-09-22 首页社区化改版：论坛迁到首页（下滑直达），顶栏「论坛」与「首页」同指 `/`，
  // 靠 view 参数区分当前意图 —— 带 view 视为「为论坛而来」，不带 view 视为首页。
  if (path === '/?view=latest') {
    return route.path === '/' && String(route.query.view || '') !== '';
  }
  if (path === '/') {
    return route.path === '/' && String(route.query.view || '') === '';
  }
  // 确保匹配完整路径或子路径，避免类似 /shop 匹配 /shopping 的情况
  return route.path === path || route.path.startsWith(path + '/');
};

// 处理"我的方块"按钮点击：如果在论坛页（2026-09-22 起论坛在首页），刷新并滚动到顶部
const handleMyBlockClick = (event) => {
  // mini 形态下头像保留直达，不冒泡到 surface 的展开热区（plans/009）
  event.stopPropagation();
  // 首页带 view = 用户此刻在论坛分区（见 isActive 的口径）
  const isAlreadyInForum = route.path === '/' && String(route.query.view || '') !== '';
  if (isAlreadyInForum) {
    // 阻止路由跳转，触发刷新和滚动到顶部
    event.preventDefault();
    // 发送自定义事件，通知论坛组件刷新
    window.dispatchEvent(new CustomEvent('boh_forum_refresh_request'));
    // 滚动到顶部：首页是文档流滚动（论坛不再是嵌套滚动容器）
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  // 进入我的方块时触发智能概览灵动岛（天粒度「当日已读」游标去重：当天上线过不再自动推送，
  // 仅当上次在线日的次日起有新内容才弹，详见 useOverviewIsland.js）
  maybeShowOverviewIsland({ currentPath: route.path });
};

// 使用 store 中的状态
const username = computed(() => authStore.userInfo.username);
const avatarUrl = computed(() => authStore.userInfo.avatarUrl || '');
const navFrame = computed(() => resolveFrameForAuthor('', authStore.userInfo?.id));

// ============================================
// 导航菜单配置
// ============================================

/**
 * 导航菜单配置
 * 支持二级/三级菜单嵌套结构：
 * - children 为二级项（直接链接）
 * - children[].children 为三级分组（分组标题 + 入口链接）
 */
const navMenuItems = [
  { name: "index", path: "/", label: "首页" },
  {
    name: "community",
    label: "社区",
    children: [
      { name: "smart-overview", path: "/overview", label: "智能概览" },
      { name: "news-shows", path: "/newsroom", label: "新闻&节目" },
      { name: "forum", path: "/?view=latest", label: "论坛" },
      { name: "activities-wall", path: "/activities-wall", label: "活动&方块墙" },
      { name: "lotteries", path: "/lotteries", label: "抽奖" }
    ]
  },
  {
    name: "explore",
    label: "探索",
    children: [
      { name: "boh-app", path: "/app", label: "BOH App" },
      {
        name: "ai-group",
        label: "AI 助手",
        children: [
          { name: "boh-agent", action: "openAiAssistant", label: "BOHAgent" },
          { name: "ai-chat", path: "/ai-chat", label: "BOH AI" }
        ]
      },
      {
        name: "lab-group",
        label: "实验室",
        children: [
          { name: "lab", path: "/lab", label: "实验室" },
          { name: "mbti", path: "/mbti", label: "MBTI" }
        ]
      },
      {
        name: "world-group",
        label: "方块世界",
        children: [
          { name: "character-book", path: "/character-book", label: "设定集" },
          { name: "birthday", path: "/birthday", label: "生日会" },
          { name: "boh-8-years-journey", path: "/boh-8-years-journey", label: "八周年" }
        ]
      }
    ]
  },
  {
    name: "services",
    label: "服务",
    children: [
      {
        name: "health-group",
        label: "健康服务",
        children: [
          { name: "boh-health", path: "/health", label: "BOH Health" }
        ]
      },
      { name: "shop", path: "/shop", label: "周边商城" },
      { name: "subscription", path: "/user-space/subscriptions", label: "订阅计划" },
      {
        name: "support-group",
        label: "支持中心",
        children: [
          // 下载中心与教程中心已融合为「资源中心」单页（/download）
          { name: "resources", path: "/download", label: "资源中心" },
          { name: "admin-panel", action: "goToAdmin", label: "管理面板", adminOnly: true }
        ]
      }
    ]
  },
  {
    name: "about",
    label: "关于",
    children: [
      { name: "anniversary-cafe", path: "/anniversary-cafe", label: "云上咖啡店" },
      { name: "version-check", action: "checkVersion", label: "版本检测" },
      { name: "about", path: "/about", label: "关于我们" }
    ]
  }
];

/**
 * 当前展开的一级菜单名称
 * 用于控制二级菜单的显示/隐藏
 */
const expandedMenu = ref(null);

/**
 * 当前下钻的三级分组名称（用于三级菜单）
 */
const activeGroup = ref(null);
/**
 * 当前下钻分组所属的一级菜单名称
 */
const activeGroupParent = ref(null);

/**
 * 判断菜单项的子菜单中是否存在分组（三级结构）
 * @param {Object} item - 菜单项
 * @returns {boolean}
 */
const hasGroupChildren = (item) => {
  return item.children && item.children.some(child => child.children && child.children.length > 0);
};

/**
 * 获取当前下钻分组的三级菜单项
 * @param {Object} item - 菜单项
 * @returns {Array}
 */
const activeGroupChildren = (item) => {
  const group = item.children.find(child => child.name === activeGroup.value);
  return group ? group.children : [];
};

/**
 * 切换二级菜单展开状态
 * @param {string} menuName - 一级菜单名称
 */
const toggleSubMenu = (menuName) => {
  if (expandedMenu.value === menuName) {
    expandedMenu.value = null;
  } else {
    expandedMenu.value = menuName;
  }
  // 切换一级菜单时重置三级下钻状态
  activeGroup.value = null;
  activeGroupParent.value = null;
};

/**
 * 关闭二级菜单，返回一级菜单
 */
const closeSubMenu = () => {
  expandedMenu.value = null;
  activeGroup.value = null;
  activeGroupParent.value = null;
};

/**
 * 判断菜单项是否有子菜单
 * @param {Object} item - 菜单项
 * @returns {boolean}
 */
const hasChildren = (item) => {
  return item.children && item.children.length > 0;
};

/**
 * 处理菜单项操作
 * @param {string} action - 操作类型
 */
const handleMenuAction = async (action) => {
  if (action === "createDesktop") {
    createDesktopShortcut();
  } else if (action === "goToAdmin") {
    // 权限检查：未登录或非管理员时拦截
    if (!isLoggedIn.value) {
      await alert({
        title: "权限不足",
        message: "请先登录后再访问管理面板。",
        tone: "warning"
      });
      showLoginModal.value = true;
      return;
    }
    if (!isAdmin.value) {
      await alert({
        title: "权限不足",
        message: "您没有管理员权限，无法访问管理面板。",
        tone: "warning"
      });
      return;
    }
    // 有权限，跳转到管理面板
    router.push("/admin/data-management");
  } else if (action === "openAiAssistant") {
    // 打开 BOHAgent AI 助手
    toggleHiagentChat();
  } else if (action === "checkVersion") {
    // 版本检测
    if (isChecking.value) {
      await alert({
        title: "检测中",
        message: "版本检测正在进行中，请稍候...",
        tone: "default"
      });
      return;
    }
    const result = await checkForUpdate();
    if (result.hasUpdate) {
      // 发现新版本，询问用户是否立即更新
      const shouldUpdate = await confirm({
        title: "发现新版本",
        message: result.message + "\n是否立即更新到最新版本？",
        confirmText: "立即更新",
        cancelText: "稍后更新",
        tone: "success"
      });
      if (shouldUpdate) {
        await applyUpdate(result.remoteBuildId);
        // 更新后会自动刷新页面
      }
    } else {
      // 已是最新版本，询问用户是否强制刷新
      await alert({
        title: "版本检测",
        message: result.message,
        tone: "success"
      });
    }
  }
};

/**
 * 创建桌面快捷方式
 * 使用 PWA beforeinstallprompt 事件请求将网页添加到桌面
 */
const createDesktopShortcut = async () => {
  // 检查是否支持 beforeinstallprompt 事件
  if (window.deferredPrompt) {
    // 显示安装提示
    window.deferredPrompt.prompt();
    // 等待用户响应
    const { outcome } = await window.deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("用户接受了添加到桌面的请求");
    } else {
      console.log("用户拒绝了添加到桌面的请求");
    }
    // 清除保存的事件
    window.deferredPrompt = null;
  } else {
    // 如果不支持或已经安装，显示提示信息
    if (window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true) {
      alert("您已经在使用BOH桌面版应用了！");
    } else {
      // 尝试直接调用浏览器的添加到主屏幕功能
      // 对于 iOS Safari
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        alert('请按分享按钮，然后选择"添加到主屏幕"');
      }
      // 对于 Android Chrome
      else if (/Android/.test(navigator.userAgent)) {
        alert('请点击菜单按钮（⋮），然后选择"添加到主屏幕"或"安装应用"');
      }
      // 对于桌面 Chrome/Edge
      else if (window.chrome || navigator.userAgent.includes('Edg')) {
        // 尝试触发安装
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          alert('请点击地址栏右侧的"安装"图标，或在菜单中选择"安装方块之家"');
        } else {
          alert('请在浏览器菜单中选择"安装方块之家"或"添加到主屏幕"');
        }
      }
      // 其他浏览器
      else {
        alert("您的浏览器不支持直接创建桌面快捷方式。请使用浏览器的\"添加到主屏幕\"或\"安装应用\"功能。");
      }
    }
  }
};

/**
 * 判断一级菜单是否激活（自身或子菜单匹配当前路由，支持三级嵌套）
 * @param {Object} item - 菜单项
 * @returns {boolean}
 */
const isMenuActive = (item) => {
  if (item.path) {
    return isActive(item.path);
  }
  if (item.children) {
    return item.children.some(child => isMenuActive(child));
  }
  return false;
};

/**
 * 计算带有激活状态的导航项
 * 使用 computed 确保响应式更新
 */
const navItems = computed(() => {
  return navMenuItems.map(item => ({
    ...item,
    children: item.children
      ? item.children
          .map(child => child.children
            ? { ...child, children: child.children.filter(g => g.adminOnly ? isAdmin.value : true) }
            : child)
          .filter(child => child.adminOnly ? isAdmin.value : true)
      : undefined,
    isActive: isMenuActive(item),
    isExpanded: expandedMenu.value === item.name
  }));
});

// ============================================
// 移动端菜单控制
// ============================================

/**
 * 移动端菜单开关状态
 */
const isMobileMenuOpen = ref(false);
const mobileMenuOpenCount = ref(0);

/**
 * 切换移动端菜单
 * 同时控制body滚动，防止菜单打开时页面滚动/**
 * 切换移动端菜单显示状态
 */
const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
  if (isMobileMenuOpen.value) {
    mobileMenuOpenCount.value += 1;
  }

  // Beta 6：常驻悬浮导航下移动端菜单始终允许页面滚动。
  document.body.style.overflow = "";
};

/**
 * 关闭移动端菜单
 * 同时重置展开的二级菜单
 */
const closeMobileMenu = () => {
  isMobileMenuOpen.value = false;
  expandedMenu.value = null;
  activeGroup.value = null;
  activeGroupParent.value = null;
  document.body.style.overflow = "";
};

// 页面跳转后自动收起：菜单内链接各自 closeMobileMenu，但 logo / 头像这两个
// 「直达」入口（stopPropagation 不触发展开）以及外部的程序化跳转、前进后退
// 都不经过菜单回调 → 跳转后菜单滞留在展开态。统一按路由变化兜底。
// 收起菜单即回到 mini（isExpandedLooking 是纯派生），无需额外处理形态。
watch(
  () => route.fullPath,
  () => {
    if (isMobileMenuOpen.value) closeMobileMenu();
  }
);

// ============================================
// 竖屏 Mini 形态（plans/009-portrait-nav-mini-bar.md）
// 展开态是纯派生：非竖屏 / 菜单开 / 任意岛在 → 长条，其余为 mini。
// 岛仲裁复用 statusCardItem / isTaskCardShown / isBohaiIslandOpen / islandCustomSlot，
// 岛组件零改动。
// ============================================

const portraitMiniQuery = window.matchMedia('(orientation: portrait) and (max-width: 768px)');
const navMini = ref(portraitMiniQuery.matches);
const handlePortraitMiniChange = (event) => {
  navMini.value = event.matches;
};

const isExpandedLooking = computed(() => (
  !navMini.value
  || isMobileMenuOpen.value
  || statusCardItem.value.visible
  || isTaskCardShown.value
  || isBohaiIslandOpen.value
  || !!islandCustomSlot.component
));

// 任意岛唤起时收起移动菜单（岛需要全宽 surface，菜单与岛互斥）
watch(
  () => statusCardItem.value.visible || isTaskCardShown.value || isBohaiIslandOpen.value || !!islandCustomSlot.component,
  (anyIsland) => {
    if (anyIsland && isMobileMenuOpen.value) closeMobileMenu();
  }
);

// mini 态点胶囊空白 = 展开（logo/头像/汉堡/登录按钮已 stopPropagation，各自直达）
const handleSurfaceTap = () => {
  if (navMini.value && !isExpandedLooking.value) {
    toggleMobileMenu();
  }
};

// mini 态滚动回缩：capture 覆盖 window 与论坛等内部滚动容器，
// 只认 scrollTop（横向轮播 scrollLeft 变化不触发回缩）
const MINI_COLLAPSE_SCROLL_THRESHOLD = 140;
let miniScrollRafId = null;

const collapseMiniOnScroll = (target) => {
  const scrollTop = target === document || target === document.documentElement || target === window
    ? (window.scrollY || document.documentElement.scrollTop || 0)
    : (target && typeof target.scrollTop === 'number' ? target.scrollTop : 0);
  if (scrollTop > MINI_COLLAPSE_SCROLL_THRESHOLD) {
    closeMobileMenu();
  }
};

const handleMiniCollapseScroll = (event) => {
  if (!navMini.value || miniScrollRafId) return;
  const target = event.target;
  miniScrollRafId = requestAnimationFrame(() => {
    miniScrollRafId = null;
    collapseMiniOnScroll(target);
  });
};

/**
 * 点击外部关闭下拉菜单和二级菜单
 */
const handleClickOutside = (event) => {
  // 点击目标在事件冒泡期间已被 Vue 重新渲染移除（如点击分组标题后 v-if 切换 DOM）
  // 说明点击发生在菜单内部，不应触发关闭
  if (!event.target || event.target.isConnected === false) {
    return;
  }
  if (
    expandedMenu.value &&
    !event.target.closest(".nav-menu-item") &&
    !event.target.closest(".nav-submenu") &&
    !event.target.closest(".nav-mobile-item") &&
    !event.target.closest(".nav-mobile-submenu")
  ) {
    expandedMenu.value = null;
  }
  // 竖屏 Mini 形态（plans/009）：移动菜单点外部关闭 → 派生态自动回缩 mini
  if (
    isMobileMenuOpen.value &&
    !event.target.closest(".unified-nav-surface") &&
    !event.target.closest(".nav-menu-mobile")
  ) {
    closeMobileMenu();
  }
};

// ============================================
// 消息管理
// ============================================

/**
 * 未读消息状态
 */
const hasUnreadMessages = computed(() => unreadCount.value > 0);
let unreadRefreshInterval = null;

/**
 * 检查是否有未读消息
 */
const checkUnreadMessages = async () => {
  if (!isLoggedIn.value) return;
  try {
    const notificationStore = await ensureNotificationStore();
    await notificationStore.refreshUnreadCount();
  } catch (_error) {
    console.error("Error checking unread messages:", _error);
  }
};

// ============================================
// 事件监听和生命周期
// ============================================

/**
 * 处理窗口大小变化
 * 当屏幕宽度大于768px时，关闭移动端菜单
 * 确保在竖屏模式下页面可以正常滚动
 */
const handleResize = () => {
  if (resizeRafId) return;
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    // 当屏幕宽度大于768px时，关闭移动端菜单
    if (window.innerWidth > 768 && isMobileMenuOpen.value) {
      isMobileMenuOpen.value = false;
    }
  });
};

/**
 * 监听localStorage变化和自定义事件
 * 同步多标签页和同标签页的未读计数
 */
const handleStorageChange = (event) => {
  if (event.key === 'boh_unread_refresh' || event.key === null) {
    checkUnreadMessages();
  }
};

const handleUnreadRefresh = () => {
  checkUnreadMessages();
};

const handleThemeChange = (theme, preference = themeManager.getPreference?.() || theme) => {
  currentTheme.value = theme;
  currentThemePreference.value = preference;
};

/**
 * 组件挂载时初始化
 */
onMounted(() => {
  window.addEventListener('boh_global_nav_status_preview', handleNavStatusPreview);
  window.addEventListener(GLOBAL_NAV_STATUS_EVENT, handleGlobalNavStatus);
  checkUnreadMessages();
  // 兜底轮询：实时订阅/事件异常时，最多 60 秒回补一次
  unreadRefreshInterval = setInterval(checkUnreadMessages, 60000);

  setTimeout(() => {
    if (!isInitialized.value) {
      console.warn("Auth initialization timeout, forcing display.");
      isInitialized.value = true;
    }
  }, 3000);

  // 确保页面加载时滚动正常
  isMobileMenuOpen.value = false;
  document.body.style.overflow = "";
  window.addEventListener("resize", handleResize);
  window.addEventListener("storage", handleStorageChange);
  window.addEventListener("boh_unread_refresh", handleUnreadRefresh);
  // 竖屏 Mini 形态（plans/009）：断点切换 + 滚动回缩
  portraitMiniQuery.addEventListener('change', handlePortraitMiniChange);
  window.addEventListener('scroll', handleMiniCollapseScroll, { capture: true, passive: true });
  themeManager.addListener(handleThemeChange);
  // 添加点击外部关闭下拉菜单的事件监听
  document.addEventListener("click", handleClickOutside);
});

/**
 * 监听移动菜单状态变化
 */
watch(
  () => isMobileMenuOpen.value,
  () => {
    // Beta 6：常驻悬浮导航下移动端菜单始终允许页面滚动。
    document.body.style.overflow = "";
  }
);

/**
 * 组件卸载时清理
 */
onUnmounted(() => {
  window.removeEventListener('boh_global_nav_status_preview', handleNavStatusPreview);
  window.removeEventListener(GLOBAL_NAV_STATUS_EVENT, handleGlobalNavStatus);
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  registerIslandAiOpener(null);
  customHostResizeObserver?.disconnect();
  customHostResizeObserver = null;
  if (unreadRefreshInterval) {
    clearInterval(unreadRefreshInterval);
  }
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("storage", handleStorageChange);
  window.removeEventListener("boh_unread_refresh", handleUnreadRefresh);
  portraitMiniQuery.removeEventListener('change', handlePortraitMiniChange);
  window.removeEventListener('scroll', handleMiniCollapseScroll, { capture: true });
  if (miniScrollRafId) {
    cancelAnimationFrame(miniScrollRafId);
    miniScrollRafId = null;
  }
  themeManager.removeListener(handleThemeChange);
  // 移除点击外部关闭下拉菜单的事件监听
  document.removeEventListener("click", handleClickOutside);
});

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    void checkUnreadMessages();
  }
});
</script>

<style scoped src="./style.scoped.css"></style>
