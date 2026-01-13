<template>
  <div
    id="unified-nav-container"
    class="unified-nav"
    :class="{ 'mobile-menu-open': isMobileMenuOpen }"
  >
    <div class="nav-container">
      <router-link to="/" class="nav-logo">
        <div class="nav-logo-icon">
          <img :src="getImageUrl('favicon.png')" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;">
        </div>
        <span class="nav-logo-text">方块之家</span>
      </router-link>

      <ul class="nav-menu">
        <li v-for="page in pages" :key="page.name">
          <router-link
            :to="page.path"
            :class="{ active: currentRoute === page.path }"
          >
            {{ page.label }}
          </router-link>
        </li>
      </ul>

      <div class="nav-user" id="nav-user-area">
        <template v-if="isLoggedIn">
          <div
            class="nav-user-info"
            id="nav-user-info"
            title="点击查看更多"
            @click="toggleDropdown"
            :class="{ 'show-dropdown': showDropdown }"
          >
            <div class="nav-avatar">
              {{ username.charAt(0).toUpperCase() }}
              <!-- 未读消息红点 -->
              <div v-if="hasUnreadMessages" class="unread-dot-nav"></div>
            </div>
            <span class="nav-username">{{ username }}</span>
            <div class="nav-dropdown" ref="dropdownRef">
              <router-link
                to="/user-center"
                class="nav-dropdown-item"
                @click="showDropdown = false"
              >
                个人中心
              </router-link>
              <div class="nav-dropdown-divider"></div>
              <a
                href="#"
                class="nav-dropdown-item"
                @click.prevent="handleLogout"
              >
                退出登录
              </a>
            </div>
          </div>
        </template>
        <template v-else>
          <button
            class="nav-login-btn"
            id="nav-login-btn"
            @click="showLoginModal = true"
          >
            登录
          </button>
        </template>
      </div>

      <div class="nav-hamburger" id="nav-hamburger" @click="toggleMobileMenu">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>

    <div
      class="nav-menu-mobile"
      id="nav-menu-mobile"
      :class="{ active: isMobileMenuOpen }"
    >
      <router-link
        v-for="page in pages"
        :key="page.name"
        :to="page.path"
        :class="{ active: currentRoute === page.path }"
        @click="isMobileMenuOpen = false"
      >
        {{ page.label }}
      </router-link>
    </div>
  </div>

  <!-- 登录模态框 - 移出导航栏容器，确保独立显示 -->
  <div
    class="boh-login-modal-overlay"
    id="nav-login-modal-overlay"
    v-if="showLoginModal"
    @click="showLoginModal = false"
  >
    <div class="boh-login-modal-container" @click.stop>
      <button
        class="boh-login-modal-close"
        id="nav-login-modal-close"
        @click="showLoginModal = false"
      >
        &times;
      </button>
      <div class="boh-login-modal-header">
        <h2>方块之家</h2>
        <p>这里不只有方块。</p>
      </div>
      <form
        class="boh-login-form"
        id="nav-login-form"
        @submit.prevent="handleLogin"
      >
        <div class="boh-form-group">
          <label for="nav-username">方块ID</label>
          <input
            type="text"
            id="nav-username"
            v-model="loginForm.username"
            placeholder="请输入你的用户名"
            required
          />
          <div class="boh-error-message">方块ID不能为空</div>
        </div>
        <div class="boh-form-group">
          <label for="nav-password">密码</label>
          <div class="boh-password-wrap">
            <input
              :type="showPassword ? 'text' : 'password'"
              id="nav-password"
              v-model="loginForm.password"
              placeholder="请输入你的密码"
              required
            />
            <button
              type="button"
              class="boh-toggle-password"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? "隐藏" : "显示" }}
            </button>
          </div>
          <div class="boh-error-message">密码不能为空（至少6位）</div>
        </div>
        <div class="boh-auth-error" id="nav-auth-error" v-if="authError">
          用户名或密码错误，请重试
        </div>
        <div class="boh-form-links">
          <a
            href="#"
            class="boh-forgot-password"
            @click.prevent="handleForgotPassword"
            >忘记密码？</a
          >
          <a
            href="https://docs.qq.com/form/page/DRVZ2TmtwZWRYaU5o"
            class="boh-register-link"
            target="_blank"
            >还没有账号？立即注册</a
          >
        </div>
        <button type="submit" class="boh-login-btn" :disabled="isLoggingIn">
          {{ isLoggingIn ? "登录中..." : "登录方块之家" }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getImageUrl } from "../utils/asset-helper.js";
// 导入统一认证管理器
import "../utils/auth-manager.js";

// ============================================
// 路由相关配置
// ============================================

const route = useRoute();
const router = useRouter();
// 计算当前路由路径，用于高亮显示当前页面
const currentRoute = computed(() => route.path);

// ============================================
// 导航菜单配置
// ============================================

/**
 * 页面列表配置
 * 定义所有导航菜单项
 */
const pages = [
  { name: "index", path: "/", label: "首页" },
  { name: "newsroom", path: "/newsroom", label: "新闻" },
  { name: "activities", path: "/activities", label: "活动" },
  { name: "shop", path: "/shop", label: "周边" },
  { name: "tutorial", path: "/tutorial", label: "教程" },
];

// ============================================
// 移动端菜单控制
// ============================================

/**
 * 移动端菜单开关状态
 */
const isMobileMenuOpen = ref(false);

/**
 * 切换移动端菜单
 * 同时控制body滚动，防止菜单打开时页面滚动/**
 * 切换移动端菜单显示状态
 */
const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;

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
// ============================================
// 下拉菜单控制
// ============================================

/**
 * 下拉菜单显示状态
 */
const showDropdown = ref(false);
const dropdownRef = ref(null);

/**
 * 切换下拉菜单显示状态
 */
const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value;
};

/**
 * 点击外部关闭下拉菜单
 */
const handleClickOutside = (event) => {
  if (
    dropdownRef.value &&
    !dropdownRef.value.contains(event.target) &&
    !event.target.closest(".nav-user-info")
  ) {
    showDropdown.value = false;
  }
};

// ============================================
// 登录状态管理
// ============================================

/**
 * 登录状态
 * 使用ref管理，确保响应式更新
 */
const isLoggedIn = ref(false);
const username = ref("");

/**
 * 未读消息状态
 */
const hasUnreadMessages = ref(false);

/**
 * 检查是否有未读消息
 */
const checkUnreadMessages = () => {
  try {
    const rawData = localStorage.getItem("boh_read_messages");
    const readIds = rawData ? JSON.parse(rawData) : [];
    
    // 这里的消息ID列表与 Messages.vue 中的一致
    const messageIds = [1, 2]; 
    
    // 如果 readIds 包含所有 messageIds，则 hasUnreadMessages 为 false
    hasUnreadMessages.value = messageIds.some(id => !readIds.includes(id));
  } catch (e) {
    console.error("Error checking unread messages:", e);
    hasUnreadMessages.value = false;
  }
};

/**
 * 初始化登录状态
 * 使用统一认证管理器
 */
const initLoginState = () => {
  isLoggedIn.value = window.AuthManager.isLoggedIn();
  const user = window.AuthManager.getCurrentUser();
  username.value = user ? user.username : "";
};

// ============================================
// 登录模态框控制
// ============================================

/**
 * 模态框状态控制
 */
const showLoginModal = ref(false);
const showPassword = ref(false);
const isLoggingIn = ref(false);
const authError = ref(false);
const loginForm = ref({
  username: "",
  password: "",
});

// 预设账号通过统一认证管理器处理，无需在此定义

// ============================================
// 登录处理函数
// ============================================

/**
 * 处理登录
 * 使用统一认证管理器
 */
const handleLogin = () => {
  const { username: inputUsername, password: inputPassword } = loginForm.value;
  authError.value = false;

  // 基础验证
  if (
    !inputUsername.trim() ||
    !inputPassword.trim() ||
    inputPassword.length < 6
  ) {
    return;
  }

  isLoggingIn.value = true;

  // 使用统一认证管理器登录
  setTimeout(() => {
    const result = window.AuthManager.login(inputUsername, inputPassword);

    if (result.success) {
      // 登录成功
      isLoggedIn.value = true;
      username.value = inputUsername;
      showLoginModal.value = false;
      loginForm.value = { username: "", password: "" };
    } else {
      // 登录失败
      authError.value = true;
    }

    isLoggingIn.value = false;
  }, 500);
};

/**
 * 处理登出
 * 使用统一认证管理器
 */
const handleLogout = () => {
  window.AuthManager.logout();
  isLoggedIn.value = false;
  username.value = "";
};

/**
 * 处理忘记密码
 */
const handleForgotPassword = () => {
  alert("由于技术限制，请联系网站开发者解决该问题。");
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
 * 监听localStorage变化
 * 同步多标签页的登录状态
 */
const handleStorageChange = () => {
  initLoginState();
  checkUnreadMessages();
};

/**
 * 定期检查登录状态和消息状态
 * 每200ms检查一次，确保状态同步
 */
let loginStatusCheckInterval = null;

const startLoginStatusCheck = () => {
  if (loginStatusCheckInterval) {
    clearInterval(loginStatusCheckInterval);
  }
  loginStatusCheckInterval = setInterval(() => {
    // 检查登录状态
    const currentIsLoggedIn = window.AuthManager.isLoggedIn();
    const user = window.AuthManager.getCurrentUser();
    const currentUsername = user ? user.username : "";

    if (
      currentIsLoggedIn !== isLoggedIn.value ||
      currentUsername !== username.value
    ) {
      initLoginState();
    }

    // 检查未读消息
    checkUnreadMessages();
  }, 200);
};

const stopLoginStatusCheck = () => {
  if (loginStatusCheckInterval) {
    clearInterval(loginStatusCheckInterval);
    loginStatusCheckInterval = null;
  }
};

/**
 * 组件挂载时初始化
 */
onMounted(() => {
  initLoginState();
  checkUnreadMessages();
  // 确保页面加载时滚动正常
  isMobileMenuOpen.value = false;
  document.body.style.overflow = "";
  window.addEventListener("resize", handleResize);
  window.addEventListener("storage", handleStorageChange);
  startLoginStatusCheck();
  // 添加点击外部关闭下拉菜单的事件监听
  document.addEventListener("click", handleClickOutside);
});

/**
 * 组件卸载时清理
 */
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("storage", handleStorageChange);
  stopLoginStatusCheck();
  // 移除点击外部关闭下拉菜单的事件监听
  document.removeEventListener("click", handleClickOutside);
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
</script>

<style scoped>
/* ============================================
   引入统一导航栏样式
   ============================================ */
@import url("../styles/vendor/unified-nav.css");

/* 统一导航栏毛玻璃效果优化 - 降低模糊效果 */
#unified-nav-container {
  background-color: rgba(255, 255, 255, 0.4) !important;
  backdrop-filter: blur(10px) !important; /* 降低模糊半径至 10px */
  -webkit-backdrop-filter: blur(10px) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.02) !important;
  transition: all 0.3s ease !important;
}

.unified-nav {
  background-color: rgba(255, 255, 255, 0.4) !important;
}

/* ============================================
   移动端菜单切换动画
   ============================================ */

/**
 * 移动端菜单显示状态
 */
.nav-menu-mobile.active {
  display: flex;
}

/**
 * 汉堡菜单按钮动画 - X形态
 */
.nav-hamburger.active span:nth-child(1) {
  transform: rotate(45deg) translate(6px, 6px);
}

.nav-hamburger.active span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}

.nav-hamburger.active span:nth-child(3) {
  transform: rotate(-45deg) translate(6px, -6px);
}

/* ============================================
   确保页面加载时导航栏显示
   ============================================ */
.unified-nav {
  display: flex;
  opacity: 1;
  transform: translateY(0);
}

/* ============================================
   登录模态框样式覆盖
   ============================================ */

/**
 * 模态框遮罩层 - 增强毛玻璃效果
 */
.boh-login-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/**
 * 模态框容器 - 增强毛玻璃效果
 */
.boh-login-modal-container {
  width: 90%;
  max-width: 420px;
  max-height: calc(100vh - 40px);
  padding: 40px 30px;
  /* 增强毛玻璃效果 */
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  -moz-backdrop-filter: blur(30px);
  -ms-backdrop-filter: blur(30px);
  /* 边框和阴影 */
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
  /* 布局 */
  position: relative;
  overflow-y: auto;
  box-sizing: border-box;
  z-index: 10001;
  /* 动画 */
  animation: modalSlideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/**
 * 关闭按钮 - 圆形毛玻璃效果
 */
.boh-login-modal-close {
  position: absolute;
  top: 15px;
  right: 15px;
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 50%;
  cursor: pointer;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10002;
}

.boh-login-modal-close:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg) scale(1.1);
}

/**
 * 模态框头部
 */
.boh-login-modal-header {
  text-align: center;
  margin-bottom: 30px;
}

.boh-login-modal-header h2 {
  color: rgba(255, 255, 255, 0.95);
  font-size: 26px;
  margin: 10px 0;
  font-weight: 600;
  letter-spacing: 2px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.boh-login-modal-header p {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin: 0;
}

/**
 * 表单样式
 */
.boh-login-form .boh-form-group {
  margin-bottom: 20px;
}

.boh-login-form label {
  display: block;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 500;
}

/**
 * 输入框 - 毛玻璃效果
 */
.boh-login-form input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.95);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
  outline: none;
}

.boh-login-form input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.boh-login-form input:focus {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(102, 126, 234, 0.7);
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2);
}

/**
 * 密码输入框容器
 */
.boh-password-wrap {
  position: relative;
}

/**
 * 密码显示/隐藏按钮
 */
.boh-toggle-password {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(102, 126, 234, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(102, 126, 234, 0.3);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.boh-toggle-password:hover {
  background: rgba(102, 126, 234, 0.3);
  border-color: rgba(102, 126, 234, 0.5);
  transform: translateY(-50%) scale(1.05);
}

/**
 * 错误提示
 */
.boh-error-message {
  color: rgba(255, 85, 85, 0.95);
  font-size: 12px;
  margin-top: 6px;
  display: none;
}

.boh-auth-error {
  color: rgba(255, 85, 85, 0.95);
  background: rgba(255, 85, 85, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 85, 85, 0.3);
  border-radius: 10px;
  padding: 12px;
  font-size: 13px;
  text-align: center;
  margin-bottom: 15px;
}

/**
 * 表单链接
 */
.boh-form-links {
  display: flex;
  justify-content: space-between;
  margin: 15px 0 25px;
  font-size: 13px;
  flex-wrap: wrap;
  gap: 10px;
}

.boh-form-links a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.boh-form-links a:hover {
  color: rgba(102, 126, 234, 0.95);
  text-decoration: underline;
}

/**
 * 登录按钮 - 渐变毛玻璃效果
 */
.boh-login-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  letter-spacing: 1px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

/**
 * 按钮光扫效果
 */
.boh-login-btn::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  transition: left 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ============================================
   未读消息红点 (导航栏)
   ============================================ */
.nav-avatar {
  position: relative; /* 确保红点相对于头像定位 */
}

.unread-dot-nav {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background-color: #ff4d4f;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 4px rgba(255, 77, 79, 0.4);
  z-index: 10;
}

.boh-login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
}

.boh-login-btn:hover::before {
  left: 100%;
}

.boh-login-btn:active {
  transform: translateY(0);
}

.boh-login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* ============================================
   响应式设计
   ============================================ */

/**
 * 移动设备适配
 */
@media (max-width: 576px) {
  .boh-login-modal-container {
    padding: 30px 20px;
    margin: 20px;
  }

  .boh-form-links {
    flex-direction: column;
    gap: 10px;
    text-align: center;
  }
}

/* ============================================
   动画定义
   ============================================ */

/**
 * 淡入动画
 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/**
 * 模态框上滑动画
 */
@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
