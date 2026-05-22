<template>
  <div class="user-center-nav">
    <!-- 我的 -->
    <router-link to="/user-space" class="nav-link"
      :class="{ active: currentRoute === '/user-space' }">
      <div class="nav-content">
        <span class="nav-text">我的</span>
        <ChevronRight class="nav-arrow" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </div>
    </router-link>
    <!-- 礼物 -->
    <router-link to="/user-space/gifts" class="nav-link"
      :class="{ active: currentRoute.includes('/user-space/gifts') || currentRoute.includes('/user-center/address') }">
      <div class="nav-content">
        <span class="nav-text">礼物</span>
        <ChevronRight class="nav-arrow" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </div>
    </router-link>
    <!-- 消息中心 -->
    <router-link to="/user-space/messages" class="nav-link"
      :class="{ active: currentRoute.includes('/user-space/messages') || currentRoute.includes('/user-center/messages') }">
      <div class="nav-content">
        <div class="nav-text-wrapper">
          <span class="nav-text">消息中心</span>
          <span v-if="unreadCount > 0" class="unread-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
        </div>
        <ChevronRight class="nav-arrow" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </div>
    </router-link>
    <!-- 订阅与积分 -->
    <router-link to="/user-space/subscriptions" class="nav-link" :class="{
      active:
        currentRoute.includes('/user-space/subscriptions') ||
        currentRoute.includes('/user-center/points') ||
        currentRoute.includes('/user-center/subscriptions'),
    }">
      <div class="nav-content">
        <span class="nav-text">订阅与积分</span>
        <ChevronRight class="nav-arrow" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </div>
    </router-link>
    <!-- 社区里的伙伴 -->
    <router-link to="/user-space/partners" class="nav-link"
      :class="{ active: currentRoute.includes('/user-space/partners') || currentRoute.includes('/user-center/partners') }">
      <div class="nav-content">
        <span class="nav-text">社区里的伙伴</span>
        <ChevronRight class="nav-arrow" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </div>
    </router-link>
    <!-- 公共记忆管理 -->
    <router-link to="/user-space/shared-memories" class="nav-link"
      :class="{ active: currentRoute.includes('/user-space/shared-memories') }">
      <div class="nav-content">
        <span class="nav-text">公共记忆管理</span>
        <ChevronRight class="nav-arrow" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </div>
    </router-link>
    <!-- 数据管理 (管理员) -->
    <router-link v-if="hasAdminAccess" to="/admin/data-management" class="nav-link"
      :class="{ active: currentRoute.includes('/admin/data-management') }">
      <div class="nav-content">
        <span class="nav-text">数据管理</span>
        <ChevronRight class="nav-arrow" :size="17" :stroke-width="1.8" aria-hidden="true" />
      </div>
    </router-link>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { ChevronRight } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { storeToRefs } from "pinia";
import { loadNotificationStore, getNotificationStoreSync } from "../stores/notification-loader.js";

const route = useRoute();
const authStore = useAuthStore();
const notificationStoreRef = ref(getNotificationStoreSync());
const { isAdmin: hasAdminAccess } = storeToRefs(authStore);
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);
const currentRoute = computed(() => route.path);

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

// 加载未读消息数量
const loadUnreadCount = async () => {
  try {
    const notificationStore = await ensureNotificationStore();
    await notificationStore.refreshUnreadCount();
  } catch (error) {
    console.error('加载未读消息数量失败:', error);
  }
};

// 监听路由变化，在进入消息中心页面时刷新
watch(currentRoute, (newPath) => {
  if (newPath.includes('/user-space/messages') || newPath.includes('/user-center/messages')) {
    loadUnreadCount();
  }
});

const handleStorageChange = (event) => {
  if (event.key === 'boh_unread_refresh') {
    loadUnreadCount();
  }
};

onMounted(() => {
  loadUnreadCount();
  // 监听 localStorage 变化
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('boh_unread_refresh', loadUnreadCount);
});

onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('boh_unread_refresh', loadUnreadCount);
});

// 暴露刷新方法给外部使用
defineExpose({
  refreshUnreadCount: loadUnreadCount
});
</script>

<style scoped>
.user-center-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

/* 玻璃UI样式 - 导航链接 */
.nav-link {
  display: block;
  text-decoration: none;
  color: #718096;
  padding: 18px 24px;
  margin-bottom: 12px;
  background-color: transparent;
  border-radius: 12px;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid transparent;
  position: relative;
  overflow: hidden;
}

.nav-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 3px;
  background: #2d3748;
  opacity: 0;
  transform: scaleY(0);
  transition: all 0.3s ease;
}

.nav-link:hover {
  background-color: rgba(255, 255, 255, 0.6);
  color: #2d3748;
  padding-left: 28px;
}

.nav-link.active {
  background-color: #fff;
  color: #1a202c;
  font-weight: 600;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  padding-left: 32px;
}

.nav-link.active::before {
  opacity: 1;
  transform: scaleY(1);
}

.nav-content {
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.nav-text-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-text {
  letter-spacing: 0.5px;
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background-color: #ff3b30;
  color: white;
  font-size: 11px;
  font-weight: 700;
  border-radius: 10px;
  line-height: 1;
}

.nav-arrow {
  opacity: 0;
  transform: translateX(-10px);
  transition: all 0.3s ease;
  color: #a0aec0;
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  stroke: currentColor;
}

.nav-link:hover .nav-arrow,
.nav-link.active .nav-arrow {
  opacity: 1;
  transform: translateX(0);
}

.nav-link.active .nav-arrow {
  color: #2d3748;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .user-center-nav {
    gap: 0;
  }

  .nav-link {
    padding: 16px;
  }

  .nav-item {
    font-size: 15px;
  }

  .nav-link::after {
    left: 16px;
    right: 16px;
  }
}

/* 竖屏模式特殊样式 */
@media (max-width: 768px) and (orientation: portrait) {
  .nav-link {
    padding: 24px 24px; /* 增加点击区域高度，确保 > 48px */
    font-size: 16px;
    margin-bottom: 16px;
  }

  .nav-item {
    font-size: 16px;
  }

  /* 移动端箭头始终显示 */
  .nav-arrow {
    opacity: 1;
    transform: translateX(0);
    color: #cbd5e0; /* 稍微淡一点的颜色 */
  }
  
  .nav-link.active .nav-arrow {
    color: #2d3748;
  }
}
</style>
