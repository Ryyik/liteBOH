<template>
  <button
    class="theme-toggle-btn"
    :class="{ 'is-dark': isDark }"
    :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
    @click="toggleTheme"
  >
    <span class="theme-icon-wrapper">
      <!-- 太阳图标（浅色模式） -->
      <svg
        v-if="isDark"
        class="theme-icon sun-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
      
      <!-- 月亮图标（深色模式） -->
      <svg
        v-else
        class="theme-icon moon-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    </span>
    <span v-if="showLabel" class="theme-label">{{ isDark ? '浅色' : '深色' }}</span>
  </button>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { themeManager } from '@/utils/theme-manager.js';

defineProps({
  showLabel: {
    type: Boolean,
    default: false
  }
});

const isDark = ref(false);

// 主题变化监听函数
const handleThemeChange = (theme) => {
  isDark.value = theme === 'dark';
};

// 切换主题
const toggleTheme = () => {
  themeManager.toggle();
};

onMounted(() => {
  // 初始化当前主题状态
  isDark.value = themeManager.isDark();
  // 添加主题变化监听
  themeManager.addListener(handleThemeChange);
});

onUnmounted(() => {
  // 移除主题变化监听
  themeManager.removeListener(handleThemeChange);
});
</script>

<style scoped>
.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: inherit;
}

.theme-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.theme-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}

.theme-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease, opacity 0.2s ease;
}

.theme-toggle-btn:hover .theme-icon {
  transform: scale(1.1);
}

.theme-label {
  font-size: 14px;
  font-weight: 500;
}

/* 深色模式下的样式 */
[data-theme="dark"] .theme-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* 动画效果 */
@keyframes rotate-in {
  from {
    transform: rotate(-90deg);
    opacity: 0;
  }
  to {
    transform: rotate(0);
    opacity: 1;
  }
}

.theme-icon {
  animation: rotate-in 0.3s ease;
}
</style>
