<template>
  <header class="g-topbar">
    <div class="g-topbar-left">
      <button
        type="button"
        class="g-icon-btn round is-ghost"
        :aria-label="isSidebarOpen ? '收起管理导航' : '展开管理导航'"
        :title="isSidebarOpen ? '收起导航' : '展开导航'"
        @click="$emit('toggle-sidebar')"
      >
        <PanelLeft v-if="!isSidebarOpen" :size="18" />
        <PanelLeftClose v-else :size="18" />
      </button>

      <div class="g-topbar-titles" v-if="$slots.title || title">
        <slot name="title">
          <span v-if="eyebrow" class="g-eyebrow">{{ eyebrow }}</span>
          <h1 v-if="title">{{ title }}</h1>
        </slot>
      </div>
    </div>

    <div class="g-topbar-center">
      <div v-if="searchable" class="g-topbar-search">
        <SearchIcon :size="16" class="g-search-icon" />
        <input
          v-model="searchModel"
          type="text"
          :placeholder="searchPlaceholder"
          aria-label="全局搜索"
          @input="onSearchInput"
          @keydown.enter.prevent="$emit('search', searchModel)"
        />
        <kbd v-if="!isMobile" class="g-topbar-kbd">/</kbd>
        <button
          v-if="searchModel"
          type="button"
          class="g-topbar-search-clear"
          aria-label="清除搜索"
          @click="clearSearch"
        >×</button>
      </div>
    </div>

    <div class="g-topbar-right">
      <slot name="actions">
        <button
          type="button"
          class="g-btn g-btn-ghost"
          :class="{ 'is-spinning': isRefreshing }"
          aria-label="刷新数据"
          @click="$emit('refresh')"
          :disabled="isRefreshing"
        >
          <RefreshCw :size="16" :class="{ 'g-spin': isRefreshing }" />
          <span>刷新数据</span>
        </button>
        <button
          v-if="canCreate"
          type="button"
          class="g-btn g-btn-primary"
          aria-label="新增记录"
          @click="$emit('create')"
        >
          <Plus :size="16" />
          <span>新增记录</span>
        </button>
        <button
          type="button"
          class="g-icon-btn round is-ghost"
          :aria-label="theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'"
          :title="theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'"
          @click="$emit('toggle-theme')"
        >
          <Sun v-if="theme === 'dark'" :size="18" />
          <Moon v-else :size="18" />
        </button>
        <slot name="avatar">
          <div class="g-topbar-avatar" aria-hidden="true">A</div>
        </slot>
      </slot>
    </div>
  </header>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  PanelLeft,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Sun,
  Moon
} from 'lucide-vue-next';

const props = defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  searchable: { type: Boolean, default: true },
  searchPlaceholder: { type: String, default: '搜索数据、记录、配置...' },
  searchValue: { type: String, default: '' },
  isRefreshing: { type: Boolean, default: false },
  isSidebarOpen: { type: Boolean, default: false },
  canCreate: { type: Boolean, default: true },
  theme: { type: String, default: 'light' }
});

const emit = defineEmits(['refresh', 'create', 'toggle-sidebar', 'search', 'update:searchValue', 'toggle-theme']);

const searchModel = ref(props.searchValue);

// 同步父级 searchValue 变化（如外部清空）
watch(() => props.searchValue, (v) => {
  if (v !== searchModel.value) searchModel.value = v;
});

const onSearchInput = () => {
  emit('update:searchValue', searchModel.value);
};

const clearSearch = () => {
  searchModel.value = '';
  emit('update:searchValue', '');
};

const isMobile = ref(false);

const detect = () => {
  if (typeof window === 'undefined') return;
  isMobile.value = window.innerWidth < 760;
};

const handleResize = () => detect();

onMounted(() => {
  detect();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
});

defineExpose({ searchModel });
</script>

<style scoped>
.g-topbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  height: calc(var(--dm-header-height) + env(safe-area-inset-top));
  background: var(--dm-liquid-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  box-shadow: var(--dm-liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.55));
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 4);
  padding: env(safe-area-inset-top) calc(var(--spacing) * 6) 0;
}

.g-topbar-left,
.g-topbar-right {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  min-width: 0;
}

.g-topbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.g-topbar-titles {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.g-topbar-titles h1 {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.g-topbar-search {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  width: min(420px, 46vw);
  height: 38px;
  padding: 0 calc(var(--spacing) * 4);
  border: 1px solid var(--input);
  border-radius: 999px;
  background: var(--popover);
  color: var(--foreground);
  transition: border-color 0.2s ease;
}
.g-topbar-search:focus-within { border-color: var(--primary); }
.g-topbar-search > input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  min-width: 0;
}
.g-topbar-search > input::placeholder { color: var(--muted-foreground); }
.g-topbar-kbd {
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--muted-foreground);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  flex: 0 0 auto;
}
.g-topbar-search-clear {
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.g-topbar-search-clear:hover { color: var(--foreground); }

.g-topbar-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 700;
  font-size: 0.85rem;
  flex: 0 0 36px;
  border: 1px solid var(--border);
}

.is-spinning {
  pointer-events: none;
}

@media (max-width: 900px) {
  .g-topbar { padding: 0 calc(var(--spacing) * 4); gap: calc(var(--spacing) * 3); }
  .g-topbar-center { display: none; }
}

@media (max-width: 600px) {
  .g-topbar-titles h1 { display: none; }
  .g-btn span { display: none; }
}
</style>
