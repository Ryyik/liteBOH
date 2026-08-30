<template>
  <div id="unified-nav-container" class="unified-nav" :class="{
    'mobile-menu-open': isMobileMenuOpen,
    scrolled: isScrolled
  }" data-theme>
    <div
      class="unified-nav-surface"
      :class="{
        'has-status-card': navStatus.visible,
        'has-long-status-card': navStatus.visible && navStatus.isLong,
        'has-login-card': showLoginModal,
      }"
      :style="{
        '--global-nav-status-duration': `${navStatus.duration}ms`,
        '--global-nav-status-card-height': `${navStatusCardHeight}px`,
      }"
    >
    <div class="nav-container">
      <router-link to="/" class="nav-logo">
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
        <template v-if="isLoggedIn">
          <router-link to="/user-space?tab=posts" class="nav-user-info nav-user-profile" id="nav-user-info" title="进入我的方块" @click="handleMyBlockClick">
            <div class="nav-avatar">
              <img v-if="avatarUrl" :src="avatarUrl" alt="头像" class="nav-avatar-img" loading="lazy" decoding="async">
              <span v-else>{{ username ? username.charAt(0).toUpperCase() : 'U' }}</span>
              <!-- 未读消息红点 -->
              <div v-if="hasUnreadMessages" class="unread-badge-nav">
                {{ unreadCount > 99 ? '99+' : unreadCount }}
              </div>
            </div>
            <span class="nav-username">我的方块</span>
          </router-link>
        </template>
        <template v-else-if="isInitialized">
          <button class="nav-login-btn" id="nav-login-btn" @click="showLoginModal = true">
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
        @click="toggleMobileMenu">
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
      :item="navStatus"
      @action="handleNavStatusAction"
      @after-leave="handleNavStatusAfterLeave"
      @resize="handleStatusCardResize"
    />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getImageUrl } from "../../utils/asset-helper.js";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { loadNotificationStore, getNotificationStoreSync } from "@/stores/notification-loader";
import HomeCatMascot from "@/components/HomeCatMascot.vue";
import { themeManager } from "@/utils/theme-manager.js";
import { isHomeCatTheme } from "@/utils/home-cat-theme.js";
import { useConfirmDialog } from "@/composables/useConfirmDialog.js";
import { useAppMode } from "@/composables/useAppMode.js";
import { useVersionCheck } from "@/composables/useVersionCheck.js";
import { GLOBAL_NAV_STATUS_EVENT, LEGACY_ISLAND_EVENT } from "@/composables/useGlobalNavStatus.js";
import { toggleHiagentChat } from "@/utils/hiagent-widget.js";
import GlobalNavStatusCard from "./GlobalNavStatusCard.vue";

const authStore = useAuthStore();
const { isLoggedIn, isInitialized, showLoginModal, isAdmin } = storeToRefs(authStore);
const notificationStoreRef = ref(getNotificationStoreSync());
const { alert, confirm } = useConfirmDialog();
const { checkForUpdate, applyUpdate, isChecking } = useVersionCheck();
const { isBeta5 } = useAppMode();
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
const navStatusQueue = [];
let navStatusDismissTimer = null;

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

  return {
    visible: true,
    title,
    message,
    icon,
    isLong: Boolean(payload.isLong) || `${title}${message}`.length > 24,
    duration: Math.min(Math.max(Number(payload.motionDuration) || 620, 240), 1200),
    distance: Math.min(Math.max(Number(payload.distance) || 22, 0), 48),
    blur: Math.min(Math.max(Number(payload.blur) || 20, 0), 28),
    reducedMotion: Boolean(payload.reducedMotion),
    durationMs,
    onAction: typeof payload.onAction === 'function' ? payload.onAction : null
  };
};

const presentNavStatus = (item) => {
  clearNavStatusDismissTimer();
  navStatusCardHeight.value = 58;
  navStatus.value = item;
  navStatusDismissTimer = setTimeout(() => {
    navStatus.value = { ...navStatus.value, visible: false };
  }, item.durationMs);
};

const flushNavStatusQueue = () => {
  if (navStatus.value.visible) return;
  const next = navStatusQueue.shift();
  if (next) presentNavStatus(next);
};

const handleGlobalNavStatus = (event) => {
  const item = normalizeNavStatus(event?.detail || {});
  if (navStatus.value.visible) {
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

// ============================================
// 滚动悬浮效果控制
// ============================================

const isScrolled = ref(false);
const SCROLL_ENTER_THRESHOLD = 72;
const SCROLL_EXIT_THRESHOLD = 32;

let scrollRafId = null;
let resizeRafId = null;
let pendingScrollY = 0;

const getUserSpaceScrollTarget = (target) => {
  if (!target?.classList?.contains('tab-page')) return null;
  return target.closest?.('.user-space-page') ? target : null;
};

const getCurrentScrollOffset = () => {
  const activeUserSpaceTab = document.querySelector('.user-space-page .tab-page:not(.is-leaving)');
  return activeUserSpaceTab ? activeUserSpaceTab.scrollTop : window.scrollY;
};

const updateScrolledState = (scrollTop) => {
  isScrolled.value = isScrolled.value
    ? scrollTop > SCROLL_EXIT_THRESHOLD
    : scrollTop > SCROLL_ENTER_THRESHOLD;
};

const handleScroll = (event) => {
  if (isBeta5.value) {
    if (isScrolled.value) isScrolled.value = false;
    return;
  }

  const target = event?.target;
  const userSpaceScrollTarget = getUserSpaceScrollTarget(target);
  const isPageScroll = !target || target === document || target === document.documentElement
    || target === document.body || target === window;
  // 用户空间桌面端由 tab-page 承担页面级滚动；其余嵌套容器（评论、代码块等）不应影响顶栏。
  if (!isPageScroll && !userSpaceScrollTarget) return;
  // 始终刷新为最新滚动源的位置，避免同一帧内读取到陈旧坐标。
  pendingScrollY = userSpaceScrollTarget ? userSpaceScrollTarget.scrollTop : window.scrollY;
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    updateScrolledState(pendingScrollY);
    scrollRafId = null;
  });
};

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
  if (path === '/user-space?tab=posts') {
    return route.path === '/user-space' && String(route.query.tab || 'posts') === 'posts';
  }
  if (path === '/') {
    return route.path === '/';
  }
  // 确保匹配完整路径或子路径，避免类似 /shop 匹配 /shopping 的情况
  return route.path === path || route.path.startsWith(path + '/');
};

// 处理"我的方块"按钮点击：如果在论坛页面，刷新并滚动到顶部
const handleMyBlockClick = (event) => {
  const isAlreadyInForum = route.path === '/user-space' && String(route.query.tab || 'posts') === 'posts';
  if (isAlreadyInForum) {
    // 阻止路由跳转，触发刷新和滚动到顶部
    event.preventDefault();
    // 发送自定义事件，通知论坛组件刷新
    window.dispatchEvent(new CustomEvent('boh_forum_refresh_request'));
    // 滚动到顶部
    const scrollContainer = document.querySelector('.tab-page.posts-tab') || window;
    if (scrollContainer !== window) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
};

// 使用 store 中的状态
const username = computed(() => authStore.userInfo.username);
const avatarUrl = computed(() => authStore.userInfo.avatarUrl || '');

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
      { name: "forum", path: "/user-space?tab=posts", label: "论坛" },
      { name: "block-wall", path: "/block-wall", label: "方块墙" },
      { name: "activities", path: "/activities", label: "活动" },
      { name: "lotteries", path: "/lotteries", label: "抽奖" },
      { name: "shows", path: "/shows", label: "节目" }
    ]
  },
  {
    name: "explore",
    label: "探索",
    children: [
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
      { name: "shop", path: "/shop", label: "周边商城" },
      { name: "subscription", path: "/user-space/subscriptions", label: "订阅计划" },
      {
        name: "support-group",
        label: "支持中心",
        children: [
          { name: "tutorial", path: "/tutorial", label: "教程中心" },
          { name: "download", path: "/download", label: "下载中心" },
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

  // 检查是否为竖屏模式（高度大于宽度）
  const isPortrait = window.innerHeight > window.innerWidth;

  // 在竖屏模式下，始终允许页面滚动
  if (isBeta5.value || isPortrait) {
    document.body.style.overflow = "";
  } else {
    // 仅在非竖屏模式且移动端菜单打开时，才禁用滚动
    document.body.style.overflow = isMobileMenuOpen.value ? "hidden" : "";
  }
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
    // 检查是否为竖屏模式（高度大于宽度）
    const isPortrait = window.innerHeight > window.innerWidth;

    // 当屏幕宽度大于768px时，关闭移动端菜单
    if (window.innerWidth > 768 && isMobileMenuOpen.value) {
      isMobileMenuOpen.value = false;
    }

    // 在竖屏模式下，始终允许页面滚动
    if (isBeta5.value || isPortrait) {
      document.body.style.overflow = "";
    } else {
      // 仅在非竖屏模式且移动端菜单打开时，才禁用滚动
      document.body.style.overflow = isMobileMenuOpen.value ? "hidden" : "";
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
  window.addEventListener(LEGACY_ISLAND_EVENT, handleGlobalNavStatus);
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
  themeManager.addListener(handleThemeChange);
  // 添加点击外部关闭下拉菜单的事件监听
  document.addEventListener("click", handleClickOutside);
  // 滚动悬浮效果（capture 模式捕获嵌套滚动容器的 scroll 事件）
  document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
  // 双层 requestAnimationFrame：确保首次浏览器绘制完成后再应用 scrolled 类
  // 这样浏览器先绘制了无 scrolled 的基准状态，过渡才能正确触发
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isScrolled.value = isBeta5.value ? false : getCurrentScrollOffset() > SCROLL_ENTER_THRESHOLD;
    });
  });
});

watch(isBeta5, (enabled) => {
  if (enabled) {
    isScrolled.value = false;
    return;
  }
  updateScrolledState(getCurrentScrollOffset());
});

/**
 * 组件卸载时清理
 */
onUnmounted(() => {
  window.removeEventListener('boh_global_nav_status_preview', handleNavStatusPreview);
  window.removeEventListener(GLOBAL_NAV_STATUS_EVENT, handleGlobalNavStatus);
  window.removeEventListener(LEGACY_ISLAND_EVENT, handleGlobalNavStatus);
  clearNavStatusDismissTimer();
  navStatusQueue.length = 0;
  if (unreadRefreshInterval) {
    clearInterval(unreadRefreshInterval);
  }
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("storage", handleStorageChange);
  window.removeEventListener("boh_unread_refresh", handleUnreadRefresh);
  themeManager.removeListener(handleThemeChange);
  // 移除点击外部关闭下拉菜单的事件监听
  document.removeEventListener("click", handleClickOutside);
  // 移除滚动监听
  document.removeEventListener("scroll", handleScroll, { capture: true });
});

/**
 * 监听移动菜单状态变化
 */
watch(
  () => isMobileMenuOpen.value,
  (newValue) => {
    // 检查是否为竖屏模式（高度大于宽度）
    const isPortrait = window.innerHeight > window.innerWidth;

    // 在竖屏模式下，始终允许页面滚动
    if (isBeta5.value || isPortrait) {
      document.body.style.overflow = "";
    } else {
      // 仅在非竖屏模式且移动端菜单打开时，才禁用滚动
      document.body.style.overflow = newValue ? "hidden" : "";
    }
  }
);

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    void checkUnreadMessages();
  }
});
</script>

<style scoped src="./style.scoped.css"></style>
