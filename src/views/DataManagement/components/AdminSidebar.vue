<template>
  <aside class="admin-sidebar" :class="{ open: isOpen }">
    <div class="sidebar-brand">
      <div class="brand-mark">B</div>
      <div>
        <div class="brand-title">BOH Admin</div>
        <div class="brand-subtitle">Website Console</div>
      </div>
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
          >
            <button
              class="sidebar-group-link"
              :class="{ active: activeAdminSection === 'data' && activeTabGroupId === group.id }"
              type="button"
              @click="$emit('group-click', group)"
            >
              <span>{{ group.label }}</span>
              <span class="sidebar-badge">{{ group.count }}</span>
              <span
                class="sidebar-collapse-indicator"
                :class="{ collapsed: isGroupCollapsed(group.id) }"
              >
                ▾
              </span>
            </button>
            <div v-if="!isGroupCollapsed(group.id)" class="sidebar-subnav">
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
            <div class="sidebar-quick-title">最近查看</div>
            <button
              v-for="record in recentRecords"
              :key="`${record.tabId}-${record.id}`"
              class="sidebar-recent-link"
              type="button"
              @click="$emit('recent-click', record)"
            >
              <span>{{ record.title }}</span>
              <small>{{ record.tabLabel }}</small>
            </button>
          </div>
        </div>
      </template>
    </nav>

    <div class="sidebar-status">
      <div class="status-dot"></div>
      <div>
        <div class="status-label">Production</div>
        <div class="status-value">所有服务在线</div>
      </div>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  activeAdminSection: { type: String, required: true },
  activeTabGroupId: { type: String, required: true },
  currentTab: { type: String, required: true },
  getTabCount: { type: Function, required: true },
  getTabsByGroup: { type: Function, required: true },
  isDataTreeCollapsed: { type: Boolean, required: true },
  isGroupCollapsed: { type: Function, required: true },
  isOpen: { type: Boolean, required: true },
  navigation: { type: Array, required: true },
  pinnedTabs: { type: Array, required: true },
  recentRecords: { type: Array, required: true },
  tabGroups: { type: Array, required: true }
});

defineEmits(['group-click', 'nav-click', 'recent-click', 'tab-click']);
</script>
