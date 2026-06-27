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
import { ref, computed, watch } from 'vue';
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

// 调试日志：显示层级信息
watch(isOpen, (val) => {
  if (val) {
    setTimeout(() => {
      const sidebar = document.querySelector('.sidebar');
      const sidebarOverlay = document.querySelector('.sidebar-overlay');
      const glassOverlay = document.querySelector('.global-ai-glass-overlay');
      console.log('===== BohaiSidebar 层级调试 =====');
      console.log('BohaiSidebar (.sidebar):', {
        存在: !!sidebar,
        computedZIndex: sidebar ? getComputedStyle(sidebar).zIndex : 'N/A',
        DOM位置: sidebar ? Array.from(document.body.children).indexOf(sidebar) : 'N/A',
        类名: sidebar ? sidebar.className : 'N/A'
      });
      console.log('Sidebar Overlay (.sidebar-overlay):', {
        存在: !!sidebarOverlay,
        computedZIndex: sidebarOverlay ? getComputedStyle(sidebarOverlay).zIndex : 'N/A',
        DOM位置: sidebarOverlay ? Array.from(document.body.children).indexOf(sidebarOverlay) : 'N/A'
      });
      console.log('GlobalAiGlassOverlay (.global-ai-glass-overlay):', {
        存在: !!glassOverlay,
        computedZIndex: glassOverlay ? getComputedStyle(glassOverlay).zIndex : 'N/A',
        DOM位置: glassOverlay ? Array.from(document.body.children).indexOf(glassOverlay) : 'N/A'
      });
      console.log('===================================');
    }, 50);
  }
});

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

/* sidebar-open-btn 现在在 .bohai-container 下，需要定位上下文 */
.bohai-page .bohai-container {
  position: relative;
}

/* sidebar-open-btn: 独立组件后 scoped CSS 失效，在此全局补回 */
.bohai-page .sidebar-open-btn {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  left: max(16px, env(safe-area-inset-left));
  z-index: 60;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bohai-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--bohai-text);
  box-shadow: 0 10px 26px rgba(17, 17, 17, 0.045);
  backdrop-filter: var(--bohai-blur);
  -webkit-backdrop-filter: var(--bohai-blur);
}

.bohai-page.overlay-mode .sidebar-open-btn {
  top: max(14px, env(safe-area-inset-top, 0px)) !important;
  left: max(14px, env(safe-area-inset-left, 0px)) !important;
  z-index: 2147482100 !important;
}

/* --- overlay-mode 侧栏层级提升 --- */
.bohai-page.overlay-mode .sidebar-overlay {
  z-index: 2147483648 !important; /* 高于 GlobalAiGlassOverlay 的 2147483646 */
}

.bohai-page.overlay-mode .sidebar {
  z-index: 2147483649 !important; /* 高于遮罩层，确保在最上层 */
}

/* ================================================================
   以下为侧栏独立组件后，原本在 shell-header.css / adaptive-layout.css
   中 scoped 到 BOHAIMain 的规则失效，在此全局补回
   ================================================================ */

/* --- 侧栏定位（:global() 规则中缺失 position/inset/z-index） --- */
.sidebar {
  position: fixed !important;
  inset: 0 auto 0 0 !important;
  z-index: 2147483650 !important; /* 高于 GlobalAiGlassOverlay 的 2147483646 */
}

.sidebar.open {
  transform: translateX(0) !important;
}

/* --- 侧栏嵌入模式定位 --- */
.sidebar.is-embedded {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483651 !important; /* 高于基础侧栏 */
}

.bohai-page.embedded-mode .sidebar {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483651 !important;
}

/* --- 侧栏遮罩层（:global() 规则中完全缺失） --- */
.sidebar-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483648 !important; /* 高于 GlobalAiGlassOverlay 的 2147483646 */
  background: rgba(15, 23, 42, 0.32) !important;
  backdrop-filter: blur(4px) !important;
  -webkit-backdrop-filter: blur(4px) !important;
  animation: sidebar-overlay-fade 0.2s ease !important;
}

@keyframes sidebar-overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sidebar-overlay.is-embedded {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483649 !important; /* 高于基础遮罩层 */
}

.bohai-page.embedded-mode .sidebar-overlay {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483649 !important;
}

/* --- 交互状态（hover/active，:global() 规则中缺失） --- */
.sidebar-close-btn:hover {
  background: rgba(17, 24, 39, 0.06) !important;
  color: #111111 !important;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.72) !important;
  color: #111111 !important;
}

.session-item.active {
  background: var(--bohai-liquid-fill-strong) !important;
  border-color: var(--bohai-liquid-border) !important;
  color: #111111 !important;
  box-shadow: var(--bohai-glass-shadow) !important;
}

.delete-btn {
  width: 28px !important;
  height: 28px !important;
  flex: 0 0 28px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #9ca3af !important;
  opacity: 0.68 !important;
  cursor: pointer !important;
  transition: background-color 0.16s ease, color 0.16s ease, opacity 0.16s ease !important;
}

.session-item:hover .delete-btn,
.session-item.active .delete-btn,
.delete-btn:focus-visible {
  opacity: 1 !important;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.08) !important;
  color: #ef4444 !important;
}

.sidebar-icon-btn:hover,
.sidebar-close-btn:hover,
.delete-btn:hover,
.delete-message-btn:hover,
.message-action-btn:hover {
  background: rgba(17, 17, 17, 0.045) !important;
  border-color: rgba(17, 17, 17, 0.06) !important;
}

/* --- 响应式：移动端嵌入模式 --- */
@media (max-width: 1023px) {
  .sidebar.is-embedded {
    top: 0 !important;
    bottom: 0 !important;
    padding-top: var(--userspace-top-offset, 60px) !important;
  }
  .sidebar-overlay.is-embedded {
    top: 0 !important;
    bottom: 0 !important;
  }
}

/* --- 响应式：桌面端侧栏常驻 --- */
@media (min-width: 1024px) {
  .sidebar {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    bottom: 0 !important;
    width: clamp(248px, 19vw, 312px) !important;
    z-index: 1100 !important;
    transform: none !important;
    border-radius: 0 28px 28px 0 !important;
    background: rgba(255, 255, 255, 0.82) !important;
    isolation: isolate !important;
    border-right: 1px solid rgba(148, 163, 184, 0.14) !important;
    box-shadow: 1px 0 0 rgba(255, 255, 255, 0.72) inset !important;
    backdrop-filter: blur(20px) saturate(1.3) !important;
    -webkit-backdrop-filter: blur(20px) saturate(1.3) !important;
  }

  .bohai-page.embedded-mode .sidebar {
    top: var(--userspace-top-offset, 0px) !important;
    bottom: var(--userspace-bottom-nav-offset, 0px) !important;
    z-index: 1100 !important;
  }

  .sidebar-close-btn,
  .sidebar-overlay,
  .sidebar-toggle-btn {
    display: none !important;
  }

  .sidebar-header {
    padding: 14px 14px 10px !important;
  }

  .session-list {
    padding: 8px 12px 18px !important;
  }

  .session-item {
    min-height: 42px !important;
    padding: 9px 10px !important;
    border-radius: 12px !important;
  }
}
</style>