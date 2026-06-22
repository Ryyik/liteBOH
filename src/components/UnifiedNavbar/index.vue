<template>
  <div id="unified-nav-container" class="unified-nav" :class="{
    'mobile-menu-open': isMobileMenuOpen,
    scrolled: isScrolled
  }" data-theme>
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
          <router-link to="/user-space" class="nav-user-info nav-user-profile" id="nav-user-info" title="进入我的方块">
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

      <div class="nav-hamburger" id="nav-hamburger" @click="toggleMobileMenu">
        <span></span>
        <span></span>
        <span></span>
      </div>
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
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, onActivated, onDeactivated } from "vue";
import { useRoute } from "vue-router";
import { getImageUrl } from "../../utils/asset-helper.js";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { loadNotificationStore, getNotificationStoreSync } from "@/stores/notification-loader";
import HomeCatMascot from "@/components/HomeCatMascot.vue";
import { themeManager } from "@/utils/theme-manager.js";
import { isHomeCatTheme } from "@/utils/home-cat-theme.js";

const authStore = useAuthStore();
const { isLoggedIn, isInitialized, showLoginModal } = storeToRefs(authStore);
const notificationStoreRef = ref(getNotificationStoreSync());
const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const isHomeCatActive = computed(() => (
  isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value)
));

// ============================================
// 滚动悬浮效果控制
// ============================================

const isScrolled = ref(false);
const SCROLL_THRESHOLD = 50;

let scrollRafId = null;
let pendingScrollY = 0;

const handleScroll = (event) => {
  const target = event?.target;
  if (target && target !== document && target !== document.documentElement && target !== window) {
    pendingScrollY = target.scrollTop;
  } else {
    pendingScrollY = window.scrollY;
  }
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    isScrolled.value = pendingScrollY > SCROLL_THRESHOLD;
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

// 使用 store 中的状态
const username = computed(() => authStore.userInfo.username);
const avatarUrl = computed(() => authStore.userInfo.avatarUrl || '');

// ============================================
// 导航菜单配置
// ============================================

/**
 * 导航菜单配置
 * 支持二级菜单嵌套结构
 */
const navMenuItems = [
  { name: "index", path: "/", label: "首页" },
  {
    name: "community",
    label: "社区",
    children: [
      { name: "forum", path: "/user-space?tab=posts", label: "论坛" },
      { name: "activities", path: "/activities", label: "活动" },
      { name: "lotteries", path: "/lotteries", label: "抽奖" },
      { name: "shows", path: "/shows", label: "节目" }
    ]
  },
  {
    name: "explore",
    label: "探索",
    children: [
      { name: "character-book", path: "/character-book", label: "设定集" },
      { name: "ai-plaza", path: "/ai-plaza", label: "AI广场" },
      { name: "mbti", path: "/mbti", label: "MBTI" },
      { name: "lab", path: "/lab", label: "实验室" }
    ]
  },
  {
    name: "services",
    label: "服务",
    children: [
      { name: "ai-chat", path: "/ai-chat", label: "BOH AI" },
      { name: "shop", path: "/shop", label: "周边商城" },
      { name: "tutorial", path: "/tutorial", label: "教程中心" },
      { name: "download", path: "/download", label: "下载中心" }
    ]
  },
  { name: "about", path: "/about", label: "关于" }
];

/**
 * 当前展开的一级菜单名称
 * 用于控制二级菜单的显示/隐藏
 */
const expandedMenu = ref(null);

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
};

/**
 * 关闭二级菜单，返回一级菜单
 */
const closeSubMenu = () => {
  expandedMenu.value = null;
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
const handleMenuAction = (action) => {
  if (action === "createDesktop") {
    createDesktopShortcut();
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
 * 判断一级菜单是否激活（自身或子菜单匹配当前路由）
 * @param {Object} item - 菜单项
 * @returns {boolean}
 */
const isMenuActive = (item) => {
  if (item.path) {
    return isActive(item.path);
  }
  if (item.children) {
    return item.children.some(child => isActive(child.path));
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
  if (isPortrait) {
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
  document.body.style.overflow = "";
};
/**
 * 点击外部关闭下拉菜单和二级菜单
 */
const handleClickOutside = (event) => {
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
  // 检查是否为竖屏模式（高度大于宽度）
  const isPortrait = window.innerHeight > window.innerWidth;

  // 当屏幕宽度大于768px时，关闭移动端菜单
  if (window.innerWidth > 768 && isMobileMenuOpen.value) {
    isMobileMenuOpen.value = false;
  }

  // 在竖屏模式下，始终允许页面滚动
  if (isPortrait) {
    document.body.style.overflow = "";
  } else {
    // 仅在非竖屏模式且移动端菜单打开时，才禁用滚动
    document.body.style.overflow = isMobileMenuOpen.value ? "hidden" : "";
  }
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
      isScrolled.value = window.scrollY > SCROLL_THRESHOLD;
    });
  });
});

/**
 * 组件卸载时清理
 */
onUnmounted(() => {
  if (unreadRefreshInterval) {
    clearInterval(unreadRefreshInterval);
  }
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
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
    if (isPortrait) {
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

onActivated(() => {
  document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isScrolled.value = window.scrollY > SCROLL_THRESHOLD;
    });
  });
});

onDeactivated(() => {
  if (scrollRafId) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  document.removeEventListener("scroll", handleScroll, { capture: true });
});
</script>

<style scoped src="./style.scoped.css"></style>
