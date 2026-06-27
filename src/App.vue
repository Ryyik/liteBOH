<script setup>
import { watch, onMounted, onUnmounted, ref, computed, defineAsyncComponent } from "vue";
import { useRoute } from "vue-router";
import Footer from "./components/Footer.vue";
import UnifiedNavbar from "@/components/UnifiedNavbar/index.vue";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { loadNotificationStore, getNotificationStoreSync } from "@/stores/notification-loader";
import { logger } from "@/utils/logger.js";
import { useGlobalAiOverlay } from "@/composables/useGlobalAiOverlay";
import GlobalAiGlassOverlay from "@/components/GlobalAiGlassOverlay.vue";
import AiEdgeTrigger from "@/components/AiEdgeTrigger.vue";

const route = useRoute();
const authStore = useAuthStore();
const { showLoginModal, isLoggedIn, isInitialized } = storeToRefs(authStore);
const userInfo = authStore.userInfo;
const notificationStoreRef = ref(getNotificationStoreSync());
const LoginView = defineAsyncComponent(() => import("./views/Login/index.vue"));
const showToast = computed(() => notificationStoreRef.value?.showToast || false);

const {
  isOpen: globalAiOpen, open: openGlobalAi, close: closeGlobalAi,
  theme: globalAiTheme
} = useGlobalAiOverlay();
const toastTitle = computed(() => notificationStoreRef.value?.toastTitle || "");
const toastDesc = computed(() => notificationStoreRef.value?.toastDesc || "");
const toastIcon = computed(() => notificationStoreRef.value?.toastIcon || "🔔");
let activeListenerUserId = '';

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

const hideToast = () => {
  notificationStoreRef.value?.hideToast();
};

const startNotificationListener = async () => {
  if (!isInitialized.value || !isLoggedIn.value || !userInfo.id) {
    return;
  }

  if (activeListenerUserId === userInfo.id) {
    return;
  }

  const notificationStore = await ensureNotificationStore();
  logger.debug("app", "启动实时通知监听器", { userId: userInfo.id });
  await notificationStore.startNotificationListener(userInfo.id);
  activeListenerUserId = userInfo.id;
};

const checkAndStartListener = () => {
  if (isInitialized.value && isLoggedIn.value) {
    void startNotificationListener();
  }
};

// 根据当前路由为body添加对应的class
const updateBodyClass = () => {
  // 移除所有页面相关的class
  document.body.className = document.body.className.replace(/page-\w+/g, "");

  // 根据路由添加对应的class，确保route.name存在
  if (route.name) {
    const pageClass = `page-${route.name.toLowerCase()}`;
    document.body.classList.add(pageClass);
  }
};

// 初始化
updateBodyClass();

onMounted(() => {
  window.scrollTo(0, 0);

  // 等待 auth store 初始化完成后再启动通知监听
  checkAndStartListener();
});

// 监听路由变化
watch(() => route.name, updateBodyClass);

// 监听 notify 自定义事件（来自路由守卫等非组件上下文）
let notifyListener = null;
onMounted(() => {
  notifyListener = (event) => {
    const { message, type } = event.detail || {};
    if (message && notificationStoreRef.value) {
      const iconMap = { info: 'ℹ️', warning: '⚠️', error: '❌', success: '✅' };
      notificationStoreRef.value.displayToast(
        type === 'error' ? '操作受限' : type === 'warning' ? '提示' : '通知',
        message,
        iconMap[type] || 'ℹ️'
      );
    }
  };
  window.addEventListener('boh_notify', notifyListener);
});
onUnmounted(() => {
  if (notifyListener) {
    window.removeEventListener('boh_notify', notifyListener);
  }
  activeListenerUserId = '';
  notificationStoreRef.value?.stopNotificationListener();
});

// 全局 AI 覆盖层：键盘快捷键 (Cmd+K / Ctrl+K)
const handleGlobalAiKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (route.name === 'AiChat') return;
    e.preventDefault();
    if (globalAiOpen.value) closeGlobalAi();
    else openGlobalAi();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleGlobalAiKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalAiKeydown);
});

// 监听用户ID变化，开启通知监听
watch(() => userInfo.id, (newId) => {
  if (newId && isInitialized.value && isLoggedIn.value) {
    void startNotificationListener();
  } else {
    activeListenerUserId = '';
    notificationStoreRef.value?.stopNotificationListener();
  }
}, { immediate: true });

// 监听初始化状态
watch(isInitialized, (newVal) => {
  if (newVal) {
    checkAndStartListener();
  }
});

// 全局导航栏：隐藏在桌面嵌入模式或路由标记隐藏时
const showGlobalNavbar = computed(() =>
  route.query?.embed !== 'desktop' && !route.meta?.hideNavbar
);
</script>

<template>
  <UnifiedNavbar v-if="showGlobalNavbar" />
  <Suspense>
    <template #default>
      <router-view />
    </template>
    <template #fallback>
      <div class="page-suspense-fallback">
        <div class="suspense-skeleton">
          <div class="suspense-skeleton-bar"></div>
          <div class="suspense-skeleton-content">
            <div class="suspense-skeleton-line w-60"></div>
            <div class="suspense-skeleton-line w-80"></div>
            <div class="suspense-skeleton-line w-40"></div>
          </div>
        </div>
      </div>
    </template>
  </Suspense>
  <Footer />

  <!-- 全局登录模态框 -->
  <LoginView :show="showLoginModal" :is-modal="true" @close="showLoginModal = false" />

  <!-- AI 边缘触发区（移动端侧拉唤起） -->
  <AiEdgeTrigger :show="!globalAiOpen" @trigger="openGlobalAi" />

  <!-- 全局 AI 快速对话覆盖层 -->
  <GlobalAiGlassOverlay
    :show="globalAiOpen"
    :theme="globalAiTheme"
    @close="closeGlobalAi"
  />

  <!-- 首次进入提示 & 消息通知 -->
  <Transition name="toast">
    <div v-if="showToast" class="welcome-toast" @click="hideToast">
      <div class="toast-content">
        <div class="toast-icon">{{ toastIcon }}</div>
        <div class="toast-text">
          <div class="toast-title">{{ toastTitle }}</div>
          <div class="toast-desc">{{ toastDesc }}</div>
        </div>
        <button class="toast-close" @click.stop="hideToast">&times;</button>
      </div>
    </div>
  </Transition>
</template>

<style>
/* ... 现有样式保持不变 ... */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", "微软雅黑", sans-serif;
}

/* 移除全局平滑滚动，它会干扰路由跳转的回顶逻辑 */
html {
  scroll-behavior: auto !important;
}

/* 绿色玻璃效果消息提示窗 */
.welcome-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  cursor: pointer;
  pointer-events: auto;
}

.toast-content {
  background: rgba(34, 197, 94, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(34, 197, 94, 0.2);
  padding: 16px 20px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1),
    inset 0 0 20px rgba(34, 197, 94, 0.05);
  min-width: 300px;
}

.toast-icon {
  font-size: 24px;
}

.toast-text {
  flex: 1;
}

.toast-title {
  color: #15803d;
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 2px;
}

.toast-desc {
  color: #166534;
  font-size: 13px;
  opacity: 0.9;
}

.toast-close {
  background: none;
  border: none;
  color: #15803d;
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.toast-close:hover {
  opacity: 1;
}

/* 动画效果 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
}

.toast-enter-from {
  transform: translateX(100px) scale(0.9);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(50px);
  opacity: 0;
}

/* 响应式调整：避免竖屏或窄屏遮挡导航栏 */
@media (max-width: 768px),
(orientation: portrait) {
  .welcome-toast {
    top: 80px;
    /* 避开导航栏高度 */
    right: 16px;
    left: 16px;
    /* 在窄屏下左右边距一致 */
  }

  .toast-content {
    min-width: unset;
    width: 100%;
    justify-content: center;
  }
}

/* Suspense 路由切换骨架屏 */
.page-suspense-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 40px 20px;
}

.suspense-skeleton {
  width: 100%;
  max-width: 600px;
}

.suspense-skeleton-bar {
  height: 180px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: suspense-shimmer 1.5s infinite;
  border-radius: 12px;
  margin-bottom: 24px;
}

.suspense-skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 8px;
}

.suspense-skeleton-line {
  height: 16px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: suspense-shimmer 1.5s infinite;
  border-radius: 8px;
}

.suspense-skeleton-line.w-60 { width: 60%; }
.suspense-skeleton-line.w-80 { width: 80%; }
.suspense-skeleton-line.w-40 { width: 40%; }

@keyframes suspense-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
