<template>
  <aside :class="['g-sidebar', { open: isOpen }]" :aria-label="'网站管理导航'">
    <!-- Brand -->
    <div class="g-sidebar-brand">
      <div class="g-sidebar-brand-mark" aria-hidden="true">B</div>
      <div class="g-sidebar-brand-copy">
        <strong>BOH Admin</strong>
        <span>站点数据工作台</span>
      </div>
    </div>

    <!-- Search pill -->
    <div class="g-sidebar-search">
      <SearchIcon :size="14" class="g-search-icon" />
      <input
        v-model="localSearchQuery"
        type="text"
        placeholder="快速搜索..."
        class="g-sidebar-search-input"
        aria-label="快速搜索"
        @input="onSearchInput"
        @keydown.esc="clearSearch"
      />
      <button v-if="localSearchQuery" type="button" class="g-sidebar-search-clear" @click="clearSearch" aria-label="清除搜索">×</button>
    </div>

    <div v-if="localSearchQuery" class="g-sidebar-search-status">
      <LoaderCircle :size="13" class="g-spin" />
      <span>正在搜索...</span>
    </div>

    <!-- Navigation (flat, no groups) -->
    <nav class="g-sidebar-nav" aria-label="管理导航">
      <template v-for="(mod, idx) in modules" :key="mod.id">
        <button
          type="button"
          :class="['g-nav-btn', { 'is-active': isModuleActive(mod.id) }]"
          @click="$emit('module-click', mod)"
        >
          <component :is="mod.icon" :size="16" class="g-nav-glyph" />
          <span class="g-nav-label">{{ mod.label }}</span>
          <span
            v-if="mod.id === 'moderation' && hasUnmoderated"
            class="g-nav-dot"
            aria-hidden="true"
          ></span>
        </button>

        <!-- Divider between modules (skip last) -->
        <div v-if="idx < modules.length - 1" class="g-sidebar-divider" aria-hidden="true"></div>
      </template>
    </nav>

    <!-- Quick actions -->
    <div class="g-sidebar-quick">
      <button type="button" class="g-icon-btn is-sm" title="新增记录" @click="$emit('create-record')">
        <Plus :size="14" />
      </button>
      <button type="button" class="g-icon-btn is-sm" title="刷新数据" @click="$emit('refresh-data')">
        <RefreshCw :size="14" />
      </button>
      <span class="g-sidebar-quick-label">快捷操作</span>
    </div>

    <!-- Footer -->
    <div class="g-sidebar-foot">
      <span class="g-sidebar-dot" aria-hidden="true" />
      <span>BOH 数据管理 · v2.5</span>
    </div>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue';
import {
  LoaderCircle,
  Plus,
  RefreshCw,
  Search as SearchIcon
} from 'lucide-vue-next';

const props = defineProps({
  activeModule: { type: String, required: true },
  modules: { type: Array, required: true },
  isOpen: { type: Boolean, required: true },
  searchQuery: { type: String, default: '' },
  hasUnmoderated: { type: Boolean, default: false }
});

const emit = defineEmits([
  'module-click',
  'update:searchQuery',
  'create-record',
  'refresh-data'
]);

const localSearchQuery = ref(props.searchQuery || '');

watch(() => props.searchQuery, (val) => {
  if (val !== localSearchQuery.value) localSearchQuery.value = val || '';
});

const isModuleActive = (modId) => props.activeModule === modId;

const onSearchInput = () => {
  emit('update:searchQuery', localSearchQuery.value);
};

const clearSearch = () => {
  localSearchQuery.value = '';
  emit('update:searchQuery', '');
};
</script>

<style scoped>
@import '../styles/google-components.css';

/* Sidebar shell — 透明液态玻璃侧栏 */
.g-sidebar {
  position: sticky;
  top: var(--dm-nav-height);
  height: calc(100vh - var(--dm-nav-height));
  height: calc(100dvh - var(--dm-nav-height));
  background: var(--dm-liquid-sidebar, rgba(240, 246, 255, 0.6));
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  color: var(--sidebar-foreground);
  border-right: 1px solid var(--sidebar-border);
  padding: calc(var(--spacing) * 4);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  z-index: 1002;
  overflow: hidden;
  width: var(--dm-sidebar-width);
  flex: 0 0 var(--dm-sidebar-width);
}

/* Brand */
.g-sidebar-brand {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 1) 0 calc(var(--spacing) * 2);
  border-bottom: 1px solid var(--sidebar-border);
  flex: 0 0 auto;
}
.g-sidebar-brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);
  font-weight: 700;
  font-size: 0.9rem;
  flex: 0 0 32px;
}
.g-sidebar-brand-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
  line-height: 1.2;
}
.g-sidebar-brand-copy strong {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--sidebar-foreground);
}
.g-sidebar-brand-copy span {
  font-size: 0.7rem;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Search */
.g-sidebar-search {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  height: 32px;
  padding: 0 calc(var(--spacing) * 3);
  border: 1px solid var(--input);
  border-radius: 999px;
  background: var(--card);
  color: var(--foreground);
  transition: border-color 0.2s ease;
  flex: 0 0 auto;
}
.g-sidebar-search:focus-within { border-color: var(--primary); }
.g-sidebar-search .g-search-icon { color: var(--muted-foreground); flex: 0 0 14px; }
.g-sidebar-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  min-width: 0;
}
.g-sidebar-search-input::placeholder { color: var(--muted-foreground); }
.g-sidebar-search-clear {
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

/* Search status */
.g-sidebar-search-status {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--muted-foreground);
  border-radius: var(--radius);
  font-size: 0.74rem;
  flex: 0 0 auto;
}

/* Nav list (flat) */
.g-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.5);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.g-sidebar-nav::-webkit-scrollbar { width: 3px; }
.g-sidebar-nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }

.g-nav-btn {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  width: 100%;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border: none;
  background: transparent;
  color: var(--sidebar-foreground);
  border-radius: var(--radius);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.16s ease;
  min-height: 36px;
  overflow: hidden;
  flex: 0 0 auto;
}
.g-nav-btn:hover { background: var(--sidebar-accent); color: var(--sidebar-accent-foreground); }
.g-nav-btn:active { transform: scale(0.98); }
.g-nav-btn.is-active {
  background: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);
  font-weight: 600;
}
.g-nav-btn .g-nav-glyph {
  width: 16px;
  text-align: center;
  flex: 0 0 16px;
  color: currentColor;
}
.g-nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Status dot (for moderation) */
.g-nav-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--chart-2);
  flex: 0 0 8px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--chart-2) 24%, transparent);
}
.g-nav-btn.is-active .g-nav-dot {
  background: var(--sidebar-primary-foreground);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sidebar-primary-foreground) 28%, transparent);
}

/* Module divider */
.g-sidebar-divider {
  height: 1px;
  background: var(--sidebar-border);
  margin: calc(var(--spacing) * 1.5) calc(var(--spacing) * 1);
  flex: 0 0 auto;
}

/* Quick action row (bottom) */
.g-sidebar-quick {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding-top: calc(var(--spacing) * 2);
  border-top: 1px solid var(--sidebar-border);
  flex: 0 0 auto;
}
.g-sidebar-quick-label {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  font-weight: 600;
  margin-left: auto;
}

/* Footer */
.g-sidebar-foot {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-size: 0.7rem;
  color: var(--muted-foreground);
  flex: 0 0 auto;
}
.g-sidebar-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--chart-5);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--chart-5) 22%, transparent);
  flex: 0 0 6px;
}

/* Spinner */
.g-spin { animation: g-spin 1s linear infinite; }
@keyframes g-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

/* Responsive */
@media (max-width: 1024px) {
  .g-sidebar { width: 220px; flex-basis: 220px; padding: calc(var(--spacing) * 3); }
}

@media (max-width: 768px) {
  .g-sidebar {
    position: fixed;
    top: var(--dm-nav-height);
    left: 0;
    width: min(86vw, 302px);
    flex-basis: auto;
    transform: translateX(-100%);
    transition: transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
    z-index: 1050;
    padding-bottom: calc(var(--spacing) * 4 + env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }
  .g-sidebar.open { transform: translateX(0); }
}
</style>
