<template>
  <aside
    :class="['g-sidebar', { open: isOpen, 'is-collapsed': collapsed }]"
    :aria-label="'网站管理导航'"
  >
    <!-- Brand：点击回到概览 -->
    <button type="button" class="g-sidebar-brand is-clickable" title="回到站点概览" @click="goHome">
      <div class="g-sidebar-brand-mark" aria-hidden="true">B</div>
      <div class="g-sidebar-brand-copy">
        <strong>BOH Admin</strong>
        <span>站点数据工作台</span>
      </div>
    </button>

    <!-- Search pill：真实过滤侧栏模块 -->
    <div class="g-sidebar-search">
      <SearchIcon :size="14" class="g-search-icon" />
      <input
        v-model="localSearchQuery"
        type="text"
        placeholder="筛选模块..."
        class="g-sidebar-search-input"
        aria-label="筛选导航模块"
        @input="onSearchInput"
        @keydown.esc="clearSearch"
      />
      <button v-if="localSearchQuery" type="button" class="g-sidebar-search-clear" @click="clearSearch" aria-label="清除搜索">×</button>
    </div>

    <div v-if="normalizedQuery" class="g-sidebar-search-status" role="status">
      <span v-if="matchCount > 0">找到 {{ matchCount }} 个模块</span>
      <span v-else>无匹配模块</span>
    </div>

    <!-- Navigation (grouped by section) -->
    <nav class="g-sidebar-nav" aria-label="管理导航">
      <template v-for="group in groupedModules" :key="group.section">
        <div v-if="group.items.length" class="g-sidebar-group">
          <span class="g-sidebar-group-label">{{ group.label }}</span>
          <button
            v-for="mod in group.items"
            :key="mod.id"
            type="button"
            :class="['g-nav-btn', { 'is-active': isModuleActive(mod.id), 'is-denied': mod.denied }]"
            :aria-disabled="mod.denied"
            :title="mod.denied ? `${mod.label}（当前角色无权限）` : mod.description || mod.label"
            @click="selectModule(mod)"
          >
            <component :is="mod.icon" :size="16" class="g-nav-glyph" />
            <span class="g-nav-label">{{ mod.label }}</span>
            <Lock v-if="mod.denied" :size="12" class="g-nav-lock" aria-hidden="true" />
            <span
              v-else-if="mod.id === 'moderation' && hasUnmoderated"
              class="g-nav-dot"
              aria-hidden="true"
            ></span>
          </button>
        </div>
      </template>
      <p v-if="normalizedQuery && matchCount === 0" class="g-sidebar-empty">换个关键词试试</p>
      <p v-if="!modules.length" class="g-sidebar-empty">暂无可用模块，请刷新重试</p>
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
import { computed, ref, watch } from 'vue';
import {
  Lock,
  Plus,
  RefreshCw,
  Search as SearchIcon
} from 'lucide-vue-next';
import { SIDEBAR_SECTION_LABELS } from '../config/rbac.js';

const SECTION_ORDER = ['overview', 'data', 'system'];

const props = defineProps({
  activeModule: { type: String, required: true },
  modules: { type: Array, required: true },
  /** 当前角色无权访问的模块 id（置灰禁用，不断层隐藏，便于审计） */
  deniedIds: { type: Array, default: () => [] },
  isOpen: { type: Boolean, required: true },
  /** 桌面端折叠为图标栏（移动端抽屉不受影响） */
  collapsed: { type: Boolean, default: false },
  searchQuery: { type: String, default: '' },
  hasUnmoderated: { type: Boolean, default: false }
});

const emit = defineEmits([
  'module-click',
  'denied-click',
  'update:searchQuery',
  'create-record',
  'refresh-data'
]);

const localSearchQuery = ref(props.searchQuery || '');

watch(() => props.searchQuery, (val) => {
  if (val !== localSearchQuery.value) localSearchQuery.value = val || '';
});

const deniedSet = computed(() => new Set(props.deniedIds || []));
const normalizedQuery = computed(() => localSearchQuery.value.trim().toLowerCase());

const filteredModules = computed(() => {
  const q = normalizedQuery.value;
  const list = Array.isArray(props.modules) ? props.modules : [];
  const matched = q
    ? list.filter((mod) => `${mod.label || ''}${mod.description || ''}`.toLowerCase().includes(q))
    : list;
  return matched.map((mod) => ({ ...mod, denied: deniedSet.value.has(mod.id) }));
});

const matchCount = computed(() => filteredModules.value.length);

const groupedModules = computed(() =>
  SECTION_ORDER.map((section) => ({
    section,
    label: SIDEBAR_SECTION_LABELS[section] || section,
    items: filteredModules.value.filter((mod) => (mod.section || 'data') === section)
  }))
);

const isModuleActive = (modId) => props.activeModule === modId;

const onSearchInput = () => {
  emit('update:searchQuery', localSearchQuery.value);
};

const clearSearch = () => {
  localSearchQuery.value = '';
  emit('update:searchQuery', '');
};

const selectModule = (mod) => {
  if (mod.denied) {
    emit('denied-click', mod);
    return;
  }
  emit('module-click', mod);
};

const goHome = () => {
  const overview = (props.modules || []).find((mod) => mod.id === 'overview');
  selectModule(overview || { id: 'overview', label: '概览' });
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
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
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
.g-sidebar-brand.is-clickable {
  border-top: none;
  border-left: none;
  border-right: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
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

/* Nav list (grouped) */
.g-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.g-sidebar-nav::-webkit-scrollbar { width: 3px; }
.g-sidebar-nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
.g-sidebar-group {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.5);
}
.g-sidebar-group-label {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  padding: 0 calc(var(--spacing) * 3);
}
.g-sidebar-empty {
  font-size: 0.76rem;
  color: var(--muted-foreground);
  padding: 0 calc(var(--spacing) * 3);
  margin: 0;
}

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
.g-nav-btn.is-denied {
  opacity: 0.45;
  cursor: not-allowed;
}
.g-nav-btn.is-denied:hover { background: transparent; color: var(--sidebar-foreground); }
.g-nav-lock { flex: 0 0 12px; }

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

/* Collapsed (desktop icon rail) */
.g-sidebar.is-collapsed {
  width: 64px;
  flex-basis: 64px;
  padding-left: calc(var(--spacing) * 2);
  padding-right: calc(var(--spacing) * 2);
}
.g-sidebar.is-collapsed .g-sidebar-brand-copy,
.g-sidebar.is-collapsed .g-sidebar-search,
.g-sidebar.is-collapsed .g-sidebar-search-status,
.g-sidebar.is-collapsed .g-sidebar-group-label,
.g-sidebar.is-collapsed .g-nav-label,
.g-sidebar.is-collapsed .g-nav-dot,
.g-sidebar.is-collapsed .g-nav-lock,
.g-sidebar.is-collapsed .g-sidebar-quick-label,
.g-sidebar.is-collapsed .g-sidebar-foot span:last-child {
  display: none;
}
.g-sidebar.is-collapsed .g-sidebar-brand { justify-content: center; padding-bottom: calc(var(--spacing) * 2); }
.g-sidebar.is-collapsed .g-nav-btn { justify-content: center; padding-left: 0; padding-right: 0; }
.g-sidebar.is-collapsed .g-sidebar-quick { justify-content: center; }
.g-sidebar.is-collapsed .g-sidebar-foot { justify-content: center; }

/* 折叠态悬停浮层展开（桌面端）：悬停 150ms 后恢复全宽，无需点顶栏按钮 */
@media (min-width: 769px) {
  .g-sidebar.is-collapsed:hover {
    width: var(--dm-sidebar-width);
    flex-basis: var(--dm-sidebar-width);
    padding-left: calc(var(--spacing) * 4);
    padding-right: calc(var(--spacing) * 4);
    transition-delay: 0.15s;
    box-shadow: 12px 0 32px -16px rgba(0, 0, 0, 0.25);
  }
  .g-sidebar.is-collapsed:hover .g-sidebar-brand-copy,
  .g-sidebar.is-collapsed:hover .g-sidebar-search,
  .g-sidebar.is-collapsed:hover .g-sidebar-search-status,
  .g-sidebar.is-collapsed:hover .g-sidebar-group-label,
  .g-sidebar.is-collapsed:hover .g-nav-label,
  .g-sidebar.is-collapsed:hover .g-nav-dot,
  .g-sidebar.is-collapsed:hover .g-nav-lock,
  .g-sidebar.is-collapsed:hover .g-sidebar-quick-label,
  .g-sidebar.is-collapsed:hover .g-sidebar-foot span:last-child {
    display: revert;
    transition-delay: 0.15s;
  }
  .g-sidebar.is-collapsed:hover .g-sidebar-brand { justify-content: flex-start; }
  .g-sidebar.is-collapsed:hover .g-nav-btn { justify-content: flex-start; padding-left: calc(var(--spacing) * 3); padding-right: calc(var(--spacing) * 3); }
  .g-sidebar.is-collapsed:hover .g-sidebar-quick { justify-content: flex-start; }
  .g-sidebar.is-collapsed:hover .g-sidebar-foot { justify-content: flex-start; }
}

/* Responsive */
@media (max-width: 1024px) {
  .g-sidebar { width: 220px; flex-basis: 220px; padding: calc(var(--spacing) * 3); }
  .g-sidebar.is-collapsed { width: 64px; flex-basis: 64px; }
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
  /* 移动端抽屉内始终展开，不沿用桌面折叠态 */
  .g-sidebar.is-collapsed {
    width: min(86vw, 302px);
    padding: calc(var(--spacing) * 3);
  }
  .g-sidebar.is-collapsed .g-sidebar-brand-copy,
  .g-sidebar.is-collapsed .g-sidebar-search,
  .g-sidebar.is-collapsed .g-sidebar-search-status,
  .g-sidebar.is-collapsed .g-sidebar-group-label,
  .g-sidebar.is-collapsed .g-nav-label,
  .g-sidebar.is-collapsed .g-nav-dot,
  .g-sidebar.is-collapsed .g-nav-lock,
  .g-sidebar.is-collapsed .g-sidebar-quick-label,
  .g-sidebar.is-collapsed .g-sidebar-foot span:last-child {
    display: revert;
  }
  .g-sidebar.is-collapsed .g-nav-btn { justify-content: flex-start; }
}
</style>
