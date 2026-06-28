<template>
  <aside class="admin-sidebar" :class="{ open: isOpen }">
    <div class="sidebar-search">
      <svg class="sidebar-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        v-model="localSearchQuery"
        type="text"
        placeholder="快速搜索记录..."
        class="sidebar-search-input"
        @input="onSearchInput"
        @keydown.esc="clearSearch"
      />
      <button v-if="localSearchQuery" class="sidebar-search-clear" @click="clearSearch" aria-label="清除搜索">×</button>
    </div>

    <div class="sidebar-quick-actions">
      <button class="quick-action-btn" @click="$emit('create-record')" title="新增记录">
        <Plus :size="15" />
      </button>
      <button class="quick-action-btn" @click="$emit('refresh-data')" title="刷新数据">
        <RefreshCw :size="15" />
      </button>
      <button class="quick-action-btn" @click="$emit('toggle-theme')" title="切换主题">
        <Sun :size="15" />
      </button>
    </div>

    <div v-if="localSearchQuery && localSearchQuery.length > 0" class="sidebar-search-status">
      <span>正在跨表搜索...</span>
    </div>

    <nav class="sidebar-nav" aria-label="网站管理导航">
      <template v-for="item in navigation" :key="item.id">
        <button
          class="sidebar-link"
          :class="{ active: item.active }"
          type="button"
          @click="$emit('nav-click', item)"
        >
          <component :is="item.icon" :size="17" />
          <span>{{ item.label }}</span>
          <span v-if="item.badge" class="sidebar-badge">{{ item.badge }}</span>
          <span
            v-if="item.id === 'data'"
            class="sidebar-collapse-indicator"
            :class="{ collapsed: isDataTreeCollapsed }"
          >
            ▾
          </span>
        </button>

        <div v-if="item.id === 'data' && !isDataTreeCollapsed" class="sidebar-data-tree">
          <div v-if="pinnedTabs.length" class="sidebar-quick-block">
            <div class="sidebar-quick-title">置顶表</div>
            <button
              v-for="tab in pinnedTabs"
              :key="`pinned-${tab.id}`"
              class="sidebar-sub-link"
              :class="{ active: activeAdminSection === 'data' && currentTab === tab.id }"
              type="button"
              @click="$emit('tab-click', tab.id)"
            >
              <span>{{ tab.label }}</span>
              <span v-if="getTabCount(tab.id) > 0" class="sidebar-mini-badge">{{ getTabCount(tab.id) }}</span>
            </button>
          </div>

          <div
            v-for="group in tabGroups"
            :key="group.id"
            class="sidebar-tab-group"
            :class="{ expanded: expandedGroups.has(group.id) }"
          >
            <button
              class="sidebar-group-link"
              :class="{ active: activeAdminSection === 'data' && activeTabGroupId === group.id }"
              type="button"
              @click="toggleGroup(group.id)"
            >
              <span>{{ group.label }}</span>
              <span class="sidebar-badge">{{ group.count }}</span>
              <span class="sidebar-group-arrow">▾</span>
            </button>
            <div class="sidebar-subnav">
              <button
                v-for="tab in getTabsByGroup(group)"
                :key="tab.id"
                class="sidebar-sub-link"
                :class="{ active: activeAdminSection === 'data' && currentTab === tab.id }"
                type="button"
                @click="$emit('tab-click', tab.id)"
              >
                <span>{{ tab.label }}</span>
                <span v-if="getTabCount(tab.id) > 0" class="sidebar-mini-badge">{{ getTabCount(tab.id) }}</span>
              </button>
            </div>
          </div>

          <div v-if="recentRecords.length" class="sidebar-quick-block">
            <div class="sidebar-quick-title">最近操作</div>
            <div class="sidebar-recent-list">
              <button
                v-for="record in recentRecords.slice(0, 5)"
                :key="`${record.tabId}-${record.id}`"
                class="sidebar-recent-item"
                type="button"
                @click="$emit('recent-click', record)"
              >
                <span class="sidebar-recent-label">{{ record.tabLabel }}</span>
                <span class="sidebar-recent-title">{{ record.title }}</span>
                <span class="sidebar-recent-edit" @click.stop="$emit('quick-edit', record)" title="快速编辑">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </nav>
  </aside>
</template>

<script setup>
import { ref } from 'vue';
import { Plus, RefreshCw, Sun } from 'lucide-vue-next';

const props = defineProps({
  activeAdminSection: { type: String, required: true },
  activeTabGroupId: { type: String, required: true },
  currentTab: { type: String, required: true },
  getTabCount: { type: Function, required: true },
  getTabsByGroup: { type: Function, required: true },
  isDataTreeCollapsed: { type: Boolean, required: true },
  isOpen: { type: Boolean, required: true },
  navigation: { type: Array, required: true },
  pinnedTabs: { type: Array, required: true },
  recentRecords: { type: Array, required: true },
  tabGroups: { type: Array, required: true },
  searchQuery: { type: String, default: '' }
});

const emit = defineEmits(['nav-click', 'recent-click', 'tab-click', 'update:searchQuery', 'create-record', 'refresh-data', 'toggle-theme', 'quick-edit']);

const localSearchQuery = ref(props.searchQuery || '');
const expandedGroups = ref(new Set());

const toggleGroup = (groupId) => {
  const next = new Set(expandedGroups.value);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  expandedGroups.value = next;
};

const onSearchInput = () => {
  emit('update:searchQuery', localSearchQuery.value);
};

const clearSearch = () => {
  localSearchQuery.value = '';
  emit('update:searchQuery', '');
};
</script>

<style scoped>
@import '../styles/console.css';
@import '../styles/responsive.css';

.sidebar-tab-group .sidebar-subnav {
  display: none;
}
.sidebar-tab-group.expanded .sidebar-subnav {
  display: flex;
}

.sidebar-group-arrow {
  margin-left: auto;
  font-size: 10px;
  color: var(--dm-muted, #86868b);
  transition: transform 0.2s;
}
.sidebar-tab-group.expanded .sidebar-group-arrow {
  transform: rotate(180deg);
}

.sidebar-recent-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sidebar-recent-item {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 6px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #86868b;
  padding: 5px 6px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  font-size: 12px;
  min-height: 28px;
}
.sidebar-recent-item:hover {
  background: rgba(0,0,0,0.06);
}
.sidebar-recent-label {
  font-size: 10px;
  font-weight: 700;
  color: #86868b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 52px;
}
.sidebar-recent-title {
  font-weight: 650;
  color: #1d1d1f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-recent-edit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: #86868b;
  flex-shrink: 0;
  transition: all 0.15s;
}
.sidebar-recent-edit:hover {
  background: rgba(0,113,227,0.1);
  color: #0071e3;
}

.sidebar-search-status {
  padding: 10px 8px;
  font-size: 12px;
  color: #86868b;
  text-align: center;
  border-radius: 8px;
  background: rgba(0,0,0,0.03);
}
</style>
