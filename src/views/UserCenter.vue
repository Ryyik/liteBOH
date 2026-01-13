<template>
  <div class="user-center-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />
    
    <!-- 主内容区域 -->
    <main class="user-center-container">
      <!-- 移动端侧边栏切换按钮 -->
      <button v-if="isLoggedIn" class="mobile-sidebar-toggle" @click="toggleSidebar" :class="{ 'active': isSidebarOpen }">
        <span class="toggle-icon">{{ isSidebarOpen ? '✕' : '☰' }}</span>
        <span class="toggle-text">{{ isSidebarOpen ? '关闭菜单' : '个人中心菜单' }}</span>
      </button>

      <!-- 左侧导航栏 - 仅在登录状态显示 -->
      <aside v-if="isLoggedIn" class="user-center-sidebar" :class="{ 'is-open': isSidebarOpen }">
        <UserCenterNav @click="handleNavClick" />
      </aside>
      
      <!-- 遮罩层 (移动端) -->
      <div v-if="isLoggedIn && isSidebarOpen" class="sidebar-overlay" @click="toggleSidebar"></div>
      
      <!-- 右侧内容区域 -->
      <section class="user-center-content">
        <!-- 登录提示 - 未登录状态显示 -->
        <div v-if="!isLoggedIn" class="login-prompt">
          <div class="login-prompt-content">
            <h2 class="login-prompt-title">请先登录</h2>
            <p class="login-prompt-text">您需要登录后才能访问个人中心</p>
            <button class="login-prompt-button" @click="redirectToLogin">立即登录</button>
          </div>
        </div>
        <!-- 已登录状态显示正常内容 -->
        <router-view v-else />
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UnifiedNavbar from '@components/UnifiedNavbar.vue';
import UserCenterNav from '@components/UserCenterNav.vue';

const route = useRoute();
const router = useRouter();
const isSidebarOpen = ref(false);
const isLoggedIn = ref(false);

// 检查登录状态
const checkLoginStatus = () => {
  isLoggedIn.value = window.AuthManager ? window.AuthManager.isLoggedIn() : false;
};

// 跳转到登录页面
const redirectToLogin = () => {
  router.push('/login');
};

// 切换侧边栏
const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
  if (isSidebarOpen.value) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
};

// 处理导航点击
const handleNavClick = () => {
  if (window.innerWidth <= 768) {
    isSidebarOpen.value = false;
    document.body.style.overflow = '';
  }
};

// 监听路由变化，确保在移动端跳转后关闭侧边栏
watch(() => route.path, () => {
  if (window.innerWidth <= 768) {
    isSidebarOpen.value = false;
    document.body.style.overflow = '';
  }
});

// 监听登录状态变化
const handleStorageChange = () => {
  checkLoginStatus();
};

// 定期检查登录状态
let loginStatusInterval = null;

// 组件挂载时初始化
onMounted(() => {
  // 检查初始登录状态
  checkLoginStatus();
  
  // 监听localStorage变化，响应退出登录
  window.addEventListener('storage', handleStorageChange);
  
  // 定期检查登录状态（每200ms）
  loginStatusInterval = setInterval(checkLoginStatus, 200);
});

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange);
  if (loginStatusInterval) {
    clearInterval(loginStatusInterval);
  }
});
</script>

<style scoped>
/* 基础样式 */
.user-center-page {
  min-height: 100vh;
  background-color: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  /* 增强背景渐变，使玻璃效果更明显 */
  background-image: 
    radial-gradient(at 0% 0%, rgba(0, 123, 255, 0.05) 0px, transparent 50%),
    radial-gradient(at 100% 0%, rgba(108, 117, 125, 0.05) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(0, 123, 255, 0.05) 0px, transparent 50%),
    radial-gradient(at 0% 100%, rgba(108, 117, 125, 0.05) 0px, transparent 50%),
    linear-gradient(135deg, #f5f7fa 0%, #e4e7eb 100%);
  background-attachment: fixed;
}

.user-center-container {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  padding: 80px 20px 20px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: auto;
  height: auto;
  position: relative;
  align-items: start;
}

.mobile-sidebar-toggle {
  display: none;
}

/* 玻璃UI样式 - 侧边栏 */
.user-center-sidebar {
  /* 玻璃效果 */
  background-color: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  /* 边框和阴影 */
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  padding: 20px;
  height: 100%;
  min-height: calc(100vh - 160px);
  position: sticky;
  top: 80px;
  z-index: 100;
  transition: all 0.3s ease;
}

/* 竖屏模式特殊样式 */
@media (max-width: 768px) and (orientation: portrait) {
  .user-center-sidebar {
    border-radius: 0 20px 20px 0;
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.1);
    padding: 0;
    min-height: 100vh;
  }
}

/* 玻璃UI样式 - 内容区域 */
.user-center-content {
  /* 玻璃效果 */
  background-color: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  /* 边框和阴影 */
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  padding: 30px;
  min-height: calc(100vh - 160px);
  height: 100%;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .user-center-container {
    grid-template-columns: 280px 1fr;
    gap: 16px;
    padding: 80px 16px 16px;
  }
  
  .user-center-sidebar {
    padding: 16px;
    min-height: calc(100vh - 140px);
    top: 80px;
  }
  
  .user-center-content {
    padding: 24px;
    min-height: calc(100vh - 140px);
  }
}

@media (max-width: 768px) {
  .user-center-container {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 12px;
    padding-top: 140px; /* 增加边距，为固定的切换按钮留出空间 */
  }
  
  .mobile-sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  position: fixed;
  top: 76px; /* 稍微向上移动一点 */
  left: 12px;
  right: 12px;
  height: 48px; /* 固定高度 */
  z-index: 101;
  /* 玻璃效果 */
  background-color: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  padding: 12px 20px;
  font-size: 15px;
  font-weight: 600;
  color: #24292e;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.3s ease;
}

.mobile-sidebar-toggle.active {
  border-color: rgba(0, 123, 255, 0.5);
  color: #007bff;
  background-color: rgba(240, 248, 255, 0.7);
}

  .toggle-icon {
    font-size: 18px;
  }
  
  .user-center-sidebar {
    position: fixed;
    top: 0;
    left: -300px; /* 初始隐藏 */
    width: 280px;
    height: 100vh;
    border-radius: 0 12px 12px 0;
    margin: 0;
    padding: 80px 20px 20px;
    box-shadow: 4px 0 15px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    min-height: auto;
  }

  .user-center-sidebar.is-open {
    left: 0;
  }

  .sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    z-index: 999;
  }
  
  .user-center-content {
    padding: 20px;
    margin-top: 0;
    min-height: auto;
  }
}

@media (max-width: 480px) {
  .user-center-container {
    padding: 10px;
    padding-top: 140px; /* 统一为 140px */
  }
  
  .user-center-sidebar {
    width: 260px;
  }
  
  .user-center-content {
    padding: 16px;
  }
}

/* 登录提示样式 */
.login-prompt {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: calc(100vh - 160px);
  text-align: center;
  padding: 20px;
}

/* 玻璃UI样式 - 登录提示 */
.login-prompt-content {
  max-width: 400px;
  /* 玻璃效果 */
  background-color: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  /* 边框和阴影 */
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  padding: 40px 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.login-prompt-content:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

.login-prompt-title {
  font-size: 24px;
  font-weight: 600;
  color: #24292e;
  margin-bottom: 16px;
}

.login-prompt-text {
  font-size: 16px;
  color: #656d76;
  margin-bottom: 32px;
  line-height: 1.5;
}

.login-prompt-button {
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 16px;
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  letter-spacing: 0.5px;
  box-shadow: 0 6px 20px rgba(0, 123, 255, 0.3);
}

.login-prompt-button:hover {
  background-color: #0056b3;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 123, 255, 0.4);
}

.login-prompt-button:active {
  transform: translateY(0);
}

/* 响应式登录提示 */
@media (max-width: 768px) {
  .login-prompt {
    min-height: auto;
    padding: 20px;
  }
  
  .login-prompt-content {
    padding: 30px 20px;
    margin: 20px 0;
  }
  
  .login-prompt-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  
  .login-prompt-title {
    font-size: 20px;
  }
  
  .login-prompt-text {
    font-size: 14px;
    margin-bottom: 24px;
  }
  
  .login-prompt-button {
    padding: 12px 24px;
    font-size: 15px;
  }
}

/* 调整未登录状态下的容器样式 */
.user-center-container:has(.login-prompt) {
  grid-template-columns: 1fr;
}
</style>