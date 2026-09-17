<template>
  <header class="g-topbar">
    <div class="g-topbar-left">
      <button
        type="button"
        class="g-icon-btn round is-ghost"
        :aria-label="isSidebarOpen ? '折叠侧栏' : '展开侧栏'"
        :title="isSidebarOpen ? '折叠侧栏' : '展开侧栏'"
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
          aria-label="返回站点首页"
          title="返回站点首页"
          @click="$emit('home')"
        >
          <Home :size="16" />
          <span>返回首页</span>
        </button>
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
        <!-- 通知：跳转到通知管理（待复核数徽标），单语言产品不设语言切换 -->
        <button
          type="button"
          class="g-icon-btn round is-ghost g-notify-btn"
          aria-label="查看通知"
          title="查看通知"
          @click="$emit('notify')"
        >
          <Bell :size="18" />
          <span v-if="notificationCount > 0" class="g-notify-badge" aria-hidden="true">
            {{ notificationCount > 99 ? '99+' : notificationCount }}
          </span>
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
          <div class="g-user-menu-wrap" ref="userMenuWrap">
            <button
              type="button"
              class="g-topbar-avatar"
              :title="userLabel || '管理员'"
              :aria-label="`当前用户：${userLabel || '管理员'}，点击打开用户菜单`"
              :aria-expanded="showUserMenu"
              @click="showUserMenu = !showUserMenu"
            >
              <img
                v-if="avatarUrl && !avatarBroken"
                :src="avatarUrl"
                alt="用户头像"
                class="g-topbar-avatar-img"
                loading="lazy"
                @error="avatarBroken = true"
              />
              <template v-else>{{ userInitial }}</template>
            </button>
            <div v-if="showUserMenu" class="g-user-menu" role="menu">
              <div class="g-user-menu-head">
                <strong>{{ userLabel || '管理员' }}</strong>
                <span v-if="userSub">{{ userSub }}</span>
              </div>
              <button type="button" role="menuitem" @click="onHome">
                <Home :size="14" />返回站点
              </button>
              <button type="button" role="menuitem" class="is-danger" @click="onLogout">
                <LogOut :size="14" />退出登录
              </button>
            </div>
          </div>
        </slot>
      </slot>
    </div>
  </header>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Bell,
  Home,
  LogOut,
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
  theme: { type: String, default: 'light' },
  /** 当前登录用户名（真实头像/用户菜单用） */
  userLabel: { type: String, default: '' },
  /** 用户副标题（如角色名） */
  userSub: { type: String, default: '' },
  /** 真实头像 URL（来自 userInfo.avatarUrl；为空或加载失败时回退首字母） */
  avatarUrl: { type: String, default: '' },
  /** 待处理通知数（审核待复核等） */
  notificationCount: { type: Number, default: 0 }
});

const emit = defineEmits([
  'refresh', 'create', 'toggle-sidebar', 'search', 'update:searchValue',
  'toggle-theme', 'notify', 'home', 'logout'
]);

const searchModel = ref(props.searchValue);
const showUserMenu = ref(false);
const userMenuWrap = ref(null);
const avatarBroken = ref(false);

// 同步父级 searchValue 变化（如外部清空）
watch(() => props.searchValue, (v) => {
  if (v !== searchModel.value) searchModel.value = v;
});

// 头像地址变化时重置失败标记，允许重试加载
watch(() => props.avatarUrl, () => {
  avatarBroken.value = false;
});

const userInitial = computed(() => {
  const label = (props.userLabel || 'A').trim();
  return (label.charAt(0) || 'A').toUpperCase();
});

const onSearchInput = () => {
  emit('update:searchValue', searchModel.value);
};

const clearSearch = () => {
  searchModel.value = '';
  emit('update:searchValue', '');
};

const onHome = () => {
  showUserMenu.value = false;
  emit('home');
};

const onLogout = () => {
  showUserMenu.value = false;
  emit('logout');
};

const onOutsideClick = (e) => {
  if (showUserMenu.value && userMenuWrap.value && !userMenuWrap.value.contains(e.target)) {
    showUserMenu.value = false;
  }
};

const onEscape = (e) => {
  if (e.key === 'Escape') showUserMenu.value = false;
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
  document.addEventListener('click', onOutsideClick);
  document.addEventListener('keydown', onEscape);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('click', onOutsideClick);
  document.removeEventListener('keydown', onEscape);
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
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
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

.g-notify-btn { position: relative; }
.g-notify-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--destructive, #e5484d);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.g-user-menu-wrap { position: relative; }
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
  cursor: pointer;
  font-family: inherit;
  overflow: hidden;
  padding: 0;
}
.g-topbar-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.g-user-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 200px;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
  padding: calc(var(--spacing) * 2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1100;
}
.g-user-menu-head {
  display: grid;
  gap: 2px;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border-bottom: 1px solid var(--border);
  margin-bottom: calc(var(--spacing) * 1);
}
.g-user-menu-head strong { font-size: 0.85rem; color: var(--foreground); }
.g-user-menu-head span { font-size: 0.72rem; color: var(--muted-foreground); }
.g-user-menu button {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  width: 100%;
  border: none;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 0.82rem;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer;
  text-align: left;
}
.g-user-menu button:hover { background: var(--accent, var(--muted)); }
.g-user-menu button.is-danger { color: var(--destructive, #e5484d); }

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
