<template>
  <header class="dm-header">
    <div class="header-content">
      <div class="header-left">
        <button class="sidebar-toggle" type="button" @click="$emit('toggle-sidebar')" aria-label="切换管理导航">
          <PanelLeft v-if="!isSidebarOpen" :size="19" />
          <PanelRightClose v-else :size="19" />
        </button>
      </div>
      <div class="header-actions">
        <button class="refresh-btn" @click="$emit('refresh')" :class="{ spinning: isRefreshing }">
          <RefreshCw :size="17" />
          <span>刷新数据</span>
        </button>
        <button v-if="canCreate" class="publish-btn" @click="$emit('create')">
          <Plus :size="17" />
          <span>新增记录</span>
        </button>
        <button class="theme-toggle-btn" @click="toggleTheme" :title="isDark ? '切换到浅色模式' : '切换到深色模式'">
          <Sun v-if="isDark" :size="17" />
          <Moon v-else :size="17" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue';
import { PanelLeft, PanelRightClose, Plus, RefreshCw, Sun, Moon } from 'lucide-vue-next';

defineProps({
  canCreate: { type: Boolean, default: false },
  isRefreshing: { type: Boolean, default: false },
  isSidebarOpen: { type: Boolean, default: false }
});

defineEmits(['create', 'refresh', 'toggle-sidebar']);

const isDark = ref(false);

function initTheme() {
  const stored = localStorage.getItem('theme');
  isDark.value = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

initTheme();
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/responsive.css';

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
