<template>
  <Teleport to="body">
    <aside v-show="isComponentVisible"
      :class="['sidebar', { open: isOpen, 'is-embedded': embedded }]">
      <div class="sidebar-header">
        <span class="sidebar-mark" aria-hidden="true">BOH</span>
        <button class="sidebar-icon-btn sidebar-close-btn" type="button" title="收起侧栏"
          @click="closeSidebar">
          <span aria-hidden="true">«</span>
        </button>
      </div>

      <button class="sidebar-nav-row" type="button" @click="toggleSidebarSearch">
        <Search size="27" />
        <span>搜索</span>
      </button>

      <div v-if="showSidebarSearch" class="sidebar-search-row">
        <input v-model="sidebarSearchQuery" type="text" class="sidebar-search-input" placeholder="搜索对话"
          autofocus @keydown.escape="showSidebarSearch = false" />
      </div>

      <div class="sidebar-quick-actions">
        <button class="sidebar-quick-action" type="button" @click="$emit('startNewChat')">
          <span class="quick-action-icon">
            <Plus size="18" />
          </span>
          <span>新对话</span>
        </button>
      </div>

      <div class="sidebar-section-title">
        <span>历史记录</span>
        <ChevronDown size="18" />
      </div>

      <div class="session-list custom-scrollbar">
        <div v-for="group in filteredGroupedChatSessions" :key="group.id" class="session-group">
          <div v-if="group.label && filteredGroupedChatSessions.length > 1"
            class="session-group-title">
            {{ group.label }}
          </div>
          <div v-for="item in group.items" :key="item.session.timestamp"
            @click="selectSession(item.index)"
            @touchstart.passive="onSessionTouchStart($event, item.index)"
            @touchmove.passive="onSessionTouchMove($event, item.index)"
            @touchend="onSessionTouchEnd(item.index)"
            :class="['session-item', { active: currentSessionIndex === item.index, 'is-swiping': swipeState.index === item.index }]"
            :style="swipeState.index === item.index ? { transform: `translateX(${swipeState.offset}px)` } : {}">
            <span class="session-title">{{ item.session.title || '新对话' }}</span>
            <button v-if="chatSessions.length > 1" @click.stop="$emit('deleteSession', item.index)"
              class="delete-btn" title="删除">
              <Trash2 size="14" />
            </button>
          </div>
        </div>
        <div v-if="filteredGroupedChatSessions.length === 0" class="session-empty">
          没有匹配的对话
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user sidebar-user-with-settings">
          <span class="sidebar-user-avatar">{{ sidebarUserInitial }}</span>
          <span class="sidebar-user-copy">
            <strong>{{ sidebarUsername }}</strong>
            <small>{{ sidebarUserEmail }}</small>
          </span>
          <button class="sidebar-footer-btn sidebar-settings-btn" type="button" title="设置"
            @click.stop="$emit('openSettings')">
            <Settings size="16" />
          </button>
        </div>
      </div>
    </aside>

    <div v-if="isOpen" v-show="isComponentVisible"
      :class="['sidebar-overlay', { 'is-embedded': embedded }]" @click="closeSidebar"></div>
  </Teleport>

  <button v-if="!isOpen" class="sidebar-open-btn" type="button" title="打开侧边栏"
    @click="openSidebar">
    <PanelLeft size="20" />
  </button>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Search, Plus, ChevronDown, Trash2, Settings, PanelLeft } from 'lucide-vue-next';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  chatSessions: {
    type: Array,
    default: () => []
  },
  currentSessionIndex: {
    type: Number,
    default: 0
  },
  userInfo: {
    type: Object,
    default: () => ({})
  },
  embedded: {
    type: Boolean,
    default: false
  },
  isComponentVisible: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['update:modelValue', 'startNewChat', 'switchSession', 'deleteSession', 'openSettings']);

const isOpen = computed(() => props.modelValue);

const showSidebarSearch = ref(false);
const sidebarSearchQuery = ref('');

const sidebarUsername = computed(() => {
  return String(props.userInfo?.username || 'BOH 用户').trim();
});

const sidebarUserEmail = computed(() => {
  return String(props.userInfo?.email || '').trim() || '欢迎回来';
});

const sidebarUserInitial = computed(() => {
  const name = sidebarUsername.value || sidebarUserEmail.value || 'B';
  return name.trim().slice(0, 1).toUpperCase();
});

// ─── 对话列表右滑删除 ──────────────────────────────────────────────────────────
const swipeState = ref({ index: null, startX: 0, offset: 0 });

const onSessionTouchStart = (e, sessionIndex) => {
  swipeState.value = {
    index: sessionIndex,
    startX: e.touches[0].clientX,
    offset: 0
  };
};

const onSessionTouchMove = (e, sessionIndex) => {
  if (swipeState.value.index !== sessionIndex) return;
  const deltaX = e.touches[0].clientX - swipeState.value.startX;
  swipeState.value.offset = Math.max(0, deltaX);
};

const onSessionTouchEnd = (sessionIndex) => {
  if (swipeState.value.index !== sessionIndex) return;
  const threshold = 80;
  if (swipeState.value.offset > threshold && props.chatSessions.length > 1) {
    emit('deleteSession', sessionIndex);
  }
  swipeState.value = { index: null, startX: 0, offset: 0 };
};

// ─── 会话分组 ──────────────────────────────────────────────────────────────────
const getSessionGroupId = (timestamp) => {
  const value = Number(timestamp || Date.now());
  const date = Number.isFinite(value) ? new Date(value) : new Date();
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.floor((startOfToday - startOfTarget) / 86400000);

  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return 'thisWeek';
  if (dayDiff < 30) return 'thisMonth';
  return 'earlier';
};

const groupedChatSessions = computed(() => {
  const groups = [
    { id: 'today', label: '今天', items: [] },
    { id: 'yesterday', label: '昨天', items: [] },
    { id: 'thisWeek', label: '本周', items: [] },
    { id: 'thisMonth', label: '本月', items: [] },
    { id: 'earlier', label: '更早', items: [] }
  ];
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

  props.chatSessions.forEach((session, index) => {
    const group = groupMap[getSessionGroupId(session?.timestamp)] || groupMap['earlier'];
    group.items.push({ session, index });
  });
  return groups.filter((group) => group.items.length > 0);
});

const filteredGroupedChatSessions = computed(() => {
  const query = String(sidebarSearchQuery.value || '').trim().toLowerCase();
  if (!query) return groupedChatSessions.value;
  const matchedItems = (group) => group.items.filter((item) => {
    const title = String(item.session?.title || '').toLowerCase();
    if (title.includes(query)) return true;
    const messages = Array.isArray(item.session?.messages) ? item.session.messages : [];
    return messages.some((msg) => {
      const text = String(msg?.content || msg?.text || '').toLowerCase();
      return text.includes(query);
    });
  }).map((item) => ({ ...item, _matched: true }));
  return groupedChatSessions.value
    .map((group) => ({ ...group, items: matchedItems(group) }))
    .filter((group) => group.items.length > 0);
});

// ─── 侧栏操作 ──────────────────────────────────────────────────────────────────
const closeSidebar = () => {
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) overlay.classList.add('exiting');
  setTimeout(() => {
    emit('update:modelValue', false);
  }, 280);
};

const openSidebar = () => {
  emit('update:modelValue', true);
};

const selectSession = (index) => {
  emit('switchSession', index);
  closeSidebar();
};

const toggleSidebarSearch = () => {
  showSidebarSearch.value = !showSidebarSearch.value;
  if (!showSidebarSearch.value) {
    sidebarSearchQuery.value = '';
  }
};
</script>

<style>
/* Sidebar: white translucent frosted glass with rounded corners */
.sidebar,
.sidebar.is-embedded {
  background: rgba(255, 255, 255, 0.72) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.45) !important;
  border-radius: 0 28px 28px 0 !important;
  box-shadow: 14px 0 36px rgba(15, 23, 42, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.5) !important;
  backdrop-filter: blur(28px) saturate(1.4) !important;
  -webkit-backdrop-filter: blur(28px) saturate(1.4) !important;
}

/* Desktop: sidebar is persistent, with rounded right corners */
@media (min-width: 1024px) {
  .sidebar,
  .sidebar.is-embedded {
    border-radius: 0 28px 28px 0 !important;
    background: rgba(255, 255, 255, 0.82) !important;
    border-right: 1px solid rgba(148, 163, 184, 0.14) !important;
    box-shadow: 1px 0 0 rgba(255, 255, 255, 0.72) inset !important;
    backdrop-filter: blur(20px) saturate(1.3) !important;
    -webkit-backdrop-filter: blur(20px) saturate(1.3) !important;
  }
}

/* Dark mode sidebar */
[data-theme="dark"] .sidebar,
[data-theme="dark"] .sidebar.is-embedded {
  background: rgba(15, 23, 42, 0.72) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.12) !important;
  box-shadow: 18px 0 44px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
}

.sidebar-user.sidebar-user-with-settings {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}

.sidebar-user.sidebar-user-with-settings .sidebar-user-copy {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
</style>