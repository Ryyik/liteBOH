<template>
  <Teleport to="body" :disabled="overlayMode">
    <Transition name="bohai-sidebar-panel">
      <aside v-if="isComponentVisible && isOpen"
        :class="['sidebar', { open: isOpen, 'is-embedded': embedded, 'is-overlay-panel': overlayMode, 'is-standalone': standalone, 'reduce-motion': reduceMotion }]"
        :data-theme="theme">
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
        <button class="sidebar-quick-action secondary" type="button" @click="$emit('startTemporaryChat')">
          <span class="quick-action-icon">◌</span>
          <span>临时对话</span>
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
            :style="{ '--session-order': Math.min(item.index, 10), ...(swipeState.index === item.index ? { transform: `translateX(${swipeState.offset}px)` } : {}) }">
            <Pin v-if="item.session.pinned" class="session-pin" size="12" />
            <input v-if="renamingIndex === item.index" ref="renameInputRef" v-model="renameValue"
              class="session-rename-input" maxlength="48" @click.stop @keydown.enter.stop="commitRename(item.index)"
              @keydown.escape.stop="cancelRename" @blur="commitRename(item.index)" />
            <span v-else class="session-title-wrap">
              <span class="session-title">{{ item.session.title || '新对话' }}</span>
              <small v-if="sidebarSearchQuery && getMatchPreview(item.session)">{{ getMatchPreview(item.session) }}</small>
            </span>
            <span v-if="item.session.temporary" class="session-temporary-badge">临时</span>
            <button v-if="renamingIndex !== item.index" @click.stop="toggleSessionMenu(item.index)"
              class="delete-btn session-more-btn" title="更多操作"><MoreHorizontal size="15" /></button>
            <div v-if="sessionMenuIndex === item.index" class="session-action-menu" @click.stop>
              <button type="button" @click="beginRename(item)"><Pencil size="14" />重命名</button>
              <button type="button" @click="$emit('togglePin', item.index); sessionMenuIndex = null"><Pin size="14" />{{ item.session.pinned ? '取消置顶' : '置顶' }}</button>
              <button v-if="chatSessions.length > 1" type="button" class="danger" @click="$emit('deleteSession', item.index); sessionMenuIndex = null"><Trash2 size="14" />删除</button>
            </div>
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
    </Transition>

    <div v-if="isOpen" v-show="isComponentVisible"
      :class="['sidebar-overlay', { 'is-embedded': embedded }]" @click="closeSidebar"></div>
  </Teleport>

  <button v-if="!isOpen && showOpenButton" class="sidebar-open-btn" type="button" title="打开侧边栏"
    @click="openSidebar">
    <PanelLeft size="20" />
  </button>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Search, Plus, ChevronDown, Trash2, Settings, PanelLeft, MoreHorizontal, Pencil, Pin } from 'lucide-vue-next';

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
  overlayMode: { type: Boolean, default: false },
  standalone: { type: Boolean, default: false },
  showOpenButton: { type: Boolean, default: true },
  reduceMotion: { type: Boolean, default: false },
  theme: { type: String, default: 'light' },
  isComponentVisible: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['update:modelValue', 'startNewChat', 'startTemporaryChat', 'switchSession', 'deleteSession', 'renameSession', 'togglePin', 'openSettings']);

const isOpen = computed(() => props.modelValue);

const showSidebarSearch = ref(false);
const sidebarSearchQuery = ref('');
const sessionMenuIndex = ref(null);
const renamingIndex = ref(null);
const renameValue = ref('');

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
  // 滑动只提供视觉反馈，删除必须通过显式菜单确认，避免误删。
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
    { id: 'pinned', label: '置顶', items: [] },
    { id: 'today', label: '今天', items: [] },
    { id: 'yesterday', label: '昨天', items: [] },
    { id: 'thisWeek', label: '本周', items: [] },
    { id: 'thisMonth', label: '本月', items: [] },
    { id: 'earlier', label: '更早', items: [] }
  ];
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

  props.chatSessions.forEach((session, index) => {
    const group = session?.pinned ? groupMap.pinned : (groupMap[getSessionGroupId(session?.timestamp)] || groupMap['earlier']);
    group.items.push({ session, index });
  });
  groups.forEach((group) => group.items.sort((a, b) => Number(Boolean(b.session?.pinned)) - Number(Boolean(a.session?.pinned))));
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

const getMatchPreview = (session) => {
  const query = String(sidebarSearchQuery.value || '').trim().toLowerCase();
  if (!query) return '';
  const matched = (Array.isArray(session?.messages) ? session.messages : []).find((message) => String(message?.content || '').toLowerCase().includes(query));
  return String(matched?.content || '').replace(/\s+/g, ' ').slice(0, 62);
};

// ─── 侧栏操作 ──────────────────────────────────────────────────────────────────
const closeSidebar = () => {
  emit('update:modelValue', false);
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

const toggleSessionMenu = (index) => {
  sessionMenuIndex.value = sessionMenuIndex.value === index ? null : index;
};

const beginRename = (item) => {
  sessionMenuIndex.value = null;
  renamingIndex.value = item.index;
  renameValue.value = String(item.session?.title || '新对话');
};

const cancelRename = () => {
  renamingIndex.value = null;
  renameValue.value = '';
};

const commitRename = (index) => {
  if (renamingIndex.value !== index) return;
  const title = renameValue.value.trim();
  if (title) emit('renameSession', { index, title });
  cancelRename();
};
</script>

<style>
/* Quiet, utility-first conversation drawer. */
.sidebar,
.sidebar.is-embedded {
  background: #f9f9f9 !important;
  border-right: 1px solid #e5e5e5 !important;
  border-radius: 0 !important;
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.08) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* Desktop: sidebar is persistent, with rounded right corners */
@media (min-width: 1024px) {
  .sidebar,
  .sidebar.is-embedded {
    border-radius: 0 !important;
    background: #f9f9f9 !important;
    border-right: 1px solid #e5e5e5 !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
}

/* 快捷 AI 使用抽屉内部的独立历史列，不覆盖宿主页面。 */
.sidebar.is-overlay-panel {
  position: relative !important;
  inset: auto !important;
  width: 260px !important;
  height: 100% !important;
  flex: 0 0 260px !important;
  transform: translateX(0) !important;
  box-shadow: none !important;
  z-index: 2147483050 !important;
}

.sidebar.is-overlay-panel + .sidebar-overlay { display: none !important; }
.bohai-page.overlay-mode .sidebar-open-btn { display: none !important; }
.sidebar.is-standalone .sidebar-close-btn { display: inline-flex !important; }
.sidebar.is-standalone {
  top: var(--bohai-standalone-nav-height, 72px) !important;
  bottom: 0 !important;
  width: 280px !important;
  height: auto !important;
  border-radius: 0 !important;
  background: #f9f9f9 !important;
  box-shadow: none !important;
}
.sidebar.is-overlay-panel .sidebar-header { display: none !important; }

.sidebar-quick-actions { display: grid !important; grid-template-columns: minmax(0, 1fr); gap: 4px !important; }
.sidebar.is-overlay-panel .sidebar-quick-action { min-height: 38px !important; justify-content: flex-start !important; white-space: nowrap; }
.sidebar.is-overlay-panel .sidebar-nav-row svg { width: 20px; height: 20px; }
.sidebar-quick-action.secondary { color: #525252 !important; background: transparent !important; }
.sidebar-quick-action.secondary .quick-action-icon { font-size: 18px; }

.session-pin { flex: 0 0 auto; color: #737373; }
.session-title-wrap { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.session-title-wrap .session-title { width: 100%; }
.session-title-wrap small { overflow: hidden; color: #8a8a8a; font-size: 10px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.session-temporary-badge { flex: 0 0 auto; padding: 2px 5px; border-radius: 5px; background: #ececec; color: #737373; font-size: 10px; }
.session-item { position: relative; }
.session-rename-input { min-width: 0; width: 100%; height: 28px; padding: 0 7px; border: 1px solid #bdbdbd; border-radius: 6px; outline: none; background: #fff; color: #171717; }
.session-action-menu {
  position: absolute;
  top: calc(100% - 4px);
  right: 6px;
  z-index: 20;
  width: 142px;
  padding: 5px;
  border: 1px solid #dedede;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(0,0,0,.14);
}
.session-action-menu button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px; border: 0; border-radius: 6px; background: transparent; color: #404040; font-size: 12px; cursor: pointer; }
.session-action-menu button:hover { background: #f2f2f2; }
.session-action-menu button.danger { color: #dc2626; }

.bohai-sidebar-panel-enter-active,
.bohai-sidebar-panel-leave-active {
  transition: opacity 240ms ease, transform 300ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.bohai-sidebar-panel-enter-from,
.bohai-sidebar-panel-leave-to {
  opacity: 0;
  transform: translateX(-100%) !important;
}

.sidebar .sidebar-nav-row,
.sidebar .sidebar-quick-actions,
.sidebar .sidebar-section-title,
.sidebar .sidebar-footer {
  animation: sidebar-content-enter 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.sidebar .sidebar-quick-actions { animation-delay: 35ms; }
.sidebar .sidebar-section-title { animation-delay: 70ms; }
.sidebar .sidebar-footer { animation-delay: 100ms; }

.sidebar .session-item {
  animation: sidebar-session-enter 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(min(var(--session-order, 0), 10) * 24ms + 85ms);
  transition: transform 150ms ease, background-color 150ms ease, border-color 150ms ease, color 150ms ease !important;
}

.sidebar .session-item:hover { transform: translateX(2px); }
.sidebar .session-item:active { transform: scale(0.985); }

.sidebar .session-action-menu {
  animation: sidebar-menu-enter 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: top right;
}

.sidebar button {
  transition: transform 140ms ease, background-color 160ms ease, color 160ms ease, border-color 160ms ease !important;
}

.sidebar button:active { transform: scale(0.96); }

@keyframes sidebar-content-enter {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes sidebar-session-enter {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes sidebar-menu-enter {
  from { opacity: 0; transform: translateY(-4px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .sidebar *,
  .sidebar *::before,
  .sidebar *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
  }
}

[data-theme="dark"] .session-action-menu { background: #2b2b2b; border-color: #454545; }
[data-theme="dark"] .session-action-menu button { color: #e5e5e5; }
[data-theme="dark"] .session-action-menu button:hover { background: #3b3b3b; }
.sidebar[data-theme="dark"] .session-action-menu { background: #2b2b2b; border-color: #454545; }
.sidebar[data-theme="dark"] .session-action-menu button { color: #e5e5e5; }
.sidebar[data-theme="dark"] .session-action-menu button:hover { background: #3b3b3b; }

@media (max-width: 1023px) {
  .sidebar.is-overlay-panel {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    padding-top: 0 !important;
    z-index: 2147483050 !important;
  }
}

/* Dark mode sidebar */
[data-theme="dark"] .sidebar,
[data-theme="dark"] .sidebar.is-embedded,
.sidebar[data-theme="dark"],
.sidebar.is-embedded[data-theme="dark"] {
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

/* Keep overlay layers ordered within the browser's valid z-index range. */
.bohai-page.overlay-mode .sidebar-overlay {
  z-index: 2147483400 !important;
}

.bohai-page.overlay-mode .sidebar {
  z-index: 2147483450 !important;
}

/* ================================================================
   以下为侧栏独立组件后，原本在 shell-header.css / adaptive-layout.css
   中 scoped 到 BOHAIMain 的规则失效，在此全局补回
   ================================================================ */

/* --- 侧栏定位（:global() 规则中缺失 position/inset/z-index） --- */
.sidebar {
  position: fixed !important;
  inset: 0 auto 0 0 !important;
  z-index: 2147483450 !important;
}

.sidebar.open {
  transform: translateX(0) !important;
}

/* --- 侧栏嵌入模式定位 --- */
.sidebar.is-embedded {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483450 !important;
}

.bohai-page.embedded-mode .sidebar {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483450 !important;
}

/* --- 侧栏遮罩层（:global() 规则中完全缺失） --- */
.sidebar-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483400 !important;
  background: rgba(0, 0, 0, 0.28) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  animation: sidebar-overlay-fade 0.2s ease !important;
}

@keyframes sidebar-overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.sidebar-overlay.is-embedded {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483400 !important;
}

.bohai-page.embedded-mode .sidebar-overlay {
  top: var(--userspace-top-offset, 80px) !important;
  bottom: calc(var(--userspace-bottom-nav-offset, 80px) + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483400 !important;
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
    z-index: 2147483450 !important;
    transform: none !important;
    border-radius: 0 !important;
    background: #f9f9f9 !important;
    isolation: isolate !important;
    border-right: 1px solid rgba(148, 163, 184, 0.14) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  .bohai-page.embedded-mode .sidebar {
    top: var(--userspace-top-offset, 0px) !important;
    bottom: var(--userspace-bottom-nav-offset, 0px) !important;
    z-index: 2147483450 !important;
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
    border-radius: 8px !important;
  }
}

/* Must follow the legacy embedded/full-page rules above. */
.bohai-page.embedded-mode .sidebar.is-overlay-panel,
.bohai-page.overlay-mode .sidebar.is-overlay-panel {
  position: relative !important;
  inset: auto !important;
  width: 260px !important;
  height: 100% !important;
  flex: 0 0 260px !important;
  padding-top: 0 !important;
  transform: none !important;
  border-radius: 0 !important;
}

@media (max-width: 1023px) {
  .bohai-page.embedded-mode .sidebar.is-overlay-panel,
  .bohai-page.overlay-mode .sidebar.is-overlay-panel {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
  }
}

/* Keep transition transforms above legacy sidebar transform overrides. */
.sidebar.bohai-sidebar-panel-enter-from,
.sidebar.bohai-sidebar-panel-leave-to {
  opacity: 0 !important;
  transform: translateX(-100%) !important;
}

.sidebar.reduce-motion,
.sidebar.reduce-motion *,
.sidebar.reduce-motion *::before,
.sidebar.reduce-motion *::after {
  animation-duration: 1ms !important;
  animation-delay: 0ms !important;
  transition-duration: 1ms !important;
}
</style>
