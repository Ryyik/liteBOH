<template>
  <div class="data-management-page console-shell" :data-theme="theme">
    <AdminSidebar
      :active-module="activeModule"
      :denied-ids="deniedIds"
      :is-open="sidebarOpen"
      :modules="modules"
      :search-query="searchQuery"
      :show-quick-actions="false"
      @module-click="handleModuleClick"
      @denied-click="handleDeniedClick"
      @update:searchQuery="searchQuery = $event"
    />

    <div v-if="sidebarOpen" class="console-shell-scrim" @click="sidebarOpen = false"></div>

    <main class="console-shell-main">
      <!-- 窄屏下侧栏是抽屉，没有把手就等于没有导航：必须给一个可见入口 -->
      <button
        type="button"
        class="console-shell-toggle"
        :aria-expanded="sidebarOpen"
        aria-label="打开管理导航"
        @click="sidebarOpen = !sidebarOpen"
      >
        <Menu :size="18" aria-hidden="true" />
        <span>导航</span>
      </button>

      <slot />
    </main>

    <p v-if="notice" class="console-shell-notice" role="status">{{ notice }}</p>
  </div>
</template>

<script setup>
/**
 * AdminConsoleShell —— 独立控制台页（开屏 / 首页装修 / 商城装修 / 头像框）的统一外壳。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 这四个页面是 `/admin/*-console` 独立路由，进页后**整个侧栏消失**：
 * 想切到别的模块只能先退回数据管理，用户报障「非常不方便」。
 * 外壳把 AdminSidebar 常驻进来，四个页面共用同一份导航 / 权限 / 主题口径。
 *
 * ── 两条不能想当然的地方 ────────────────────────────────────────────
 * ① **token 作用域**：侧栏的宽度、配色、间距全部来自
 *    `.data-management-page` 下定义的 `--dm-sidebar-width` / `--sidebar-*` /
 *    `--dm-liquid-sidebar` 等变量。这些页面原先没有那层作用域，直接把
 *    AdminSidebar 塞进来会拿到 `width: var(--dm-sidebar-width)` 的无效值
 *    （宽度塌成 0、边框与配色全丢）。所以根元素必须带 `data-management-page`
 *    类，并由本组件自己 `@import` 一份 base.css。
 * ② **`--dm-nav-height` 必须归零**：那组变量的 64px 是给「带 AdminHeader 的
 *    data-management」用的；这四个页面 `hideNavbar: true`、页内也没有固定头，
 *    沿用 64px 会让侧栏顶部凭空空出一条。见下方 scoped 样式里的覆盖。
 *
 * 导航落点复用 `ROUTE_MAP`（单一真源），本组件不另写一份路径表。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Menu } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import AdminSidebar from './AdminSidebar.vue';
import { tabModules } from '../config/tabs.js';
import { ROUTE_MAP } from '../composables/useDataAdminNavigation.js';
import { canViewModule, getDeniedModuleIds, getRoleLabel, getUserRole } from '../config/rbac.js';
import { useAuthStore } from '@/stores/auth';
import { themeManager } from '@/utils/theme-manager.js';

const props = defineProps({
  /** 当前页对应的侧栏模块 id（gate-console / hero-console / shop-console / avatar-console），用于高亮 */
  activeModule: { type: String, required: true },
});

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

/* 主题：与 data-management 同一写入点（themeManager），不另存一份偏好 */
const normalizeTheme = (value) => (value === 'dark' ? 'dark' : 'light');
const theme = ref(normalizeTheme(themeManager.getTheme()));
const handleThemeChange = (next) => {
  theme.value = normalizeTheme(next);
};
onMounted(() => themeManager.addListener(handleThemeChange));
onBeforeUnmount(() => themeManager.removeListener(handleThemeChange));

const sidebarOpen = ref(false);
const searchQuery = ref('');
const notice = ref('');

const modules = computed(() => tabModules.map((mod) => ({ ...mod })));
const role = computed(() => getUserRole(userInfo.value));
const deniedIds = computed(() => getDeniedModuleIds(modules.value, role.value));

let noticeTimer = 0;
const showNotice = (text) => {
  notice.value = text;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.value = '';
  }, 3200);
};
onBeforeUnmount(() => window.clearTimeout(noticeTimer));

const handleDeniedClick = (mod) => {
  showNotice(`当前角色（${getRoleLabel(role.value)}）无权访问「${mod?.label || mod?.id}」`);
};

const goTo = (path) => {
  sidebarOpen.value = false;
  if (router.currentRoute.value.fullPath === path) return;
  router.push(path).catch(() => {});
};

/**
 * 侧栏点击 → 落点。
 * 与 `useDataAdminNavigation.handleModuleClick` 保持同一套 URL 约定
 * （`/admin/data-management?section=&tab=`），但这里没有 DataAdmin 的
 * switchTab 上下文，所以一律用 URL 表达状态 —— 面板那边本来就从 query 恢复。
 */
const handleModuleClick = (mod) => {
  if (!mod) return;
  if (!canViewModule(role.value, mod.id)) {
    handleDeniedClick(mod);
    return;
  }
  if (mod.id === props.activeModule) {
    sidebarOpen.value = false;
    return;
  }

  // page 型：跳它自己的独立路由（其中就包括当前这一族控制台）
  if (mod.type === 'page' && ROUTE_MAP[mod.id]) {
    goTo(ROUTE_MAP[mod.id]);
    return;
  }
  if (mod.id === 'overview') {
    goTo('/admin/data-management?section=overview');
    return;
  }
  // AI 配置的 section 名就是它的 defaultTab（api-keys），见 useDataAdminNavigation
  if (mod.id === 'ai-config') {
    const tab = mod.defaultTab || 'api-keys';
    goTo(`/admin/data-management?section=${tab}&tab=${tab}`);
    return;
  }
  const section = mod.section === 'system' ? 'media' : 'data';
  const tab = mod.defaultTab || (Array.isArray(mod.tabIds) ? mod.tabIds[0] : '');
  goTo(`/admin/data-management?section=${section}${tab ? `&tab=${tab}` : ''}`);
};
</script>

<style>
/* 侧栏与后台组件全部依赖 .data-management-page 作用域下的 token，
   独立控制台页没有这层作用域 ⇒ 必须自己引一份，否则侧栏宽度/配色全部失效。 */
@import '../styles/base.css';
</style>

<style scoped>
.console-shell {
  /* 这四个控制台页都 hideNavbar、页内无固定头 ⇒ 侧栏必须贴顶。
     base.css 的 64px 是给「带 AdminHeader 的 data-management」用的。 */
  --dm-nav-height: 0px;
  /* 暗色下把四个亮色页面当「一张纸」呈现时用的画布（见下方暗色块）。
     值刻意是亮色：这四页的配色全部写死亮色，只有亮底才读得出字。
     定义在这里而不是暗色块里，是为了让它走 token（check:dark-tokens 只盯暗色块内的
     裸色，且 token 本就是让调色只改一处）。 */
  --console-canvas: #ffffff;
  --console-canvas-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
  display: flex;
  align-items: stretch;
  min-height: 100vh;
  min-height: 100dvh;
  /* 刻意不写 background：让 base.css 的 .data-management-page 淡光晕底露出来，
     侧栏那层液态玻璃才有东西可透。写死 var(--background) 会把四个页面压成纯白，
     与后台其余页面脱节（2026-11-01 实测观感）。 */
}

.console-shell-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ── 暗色 ────────────────────────────────────────────────────────────────
   这四个页面的内容区**零暗色适配**：配色全部写死亮色（GateConsole 的 `.gc` 是
   #f6f4f1，Hero/Shop 是 #fff，AvatarConsole 连自己的背景都没写、只有 #1f2430
   这种暗字），而侧栏走 base.css 的暗色 token（`--sidebar: #171717`）。
   ⇒ 暗色下原本是「深色侧栏 + 亮块」，而 **AvatarConsole 更糟：没有背景 ⇒ 直接
   变成暗底暗字，整页读不了**（2026-11-01 截图实测）。

   本次不重做四页配色（工作量与回归面都不划算），改为把它们呈现成
   **「深色工作区里的一张纸」**：12px 深色边 + 圆角 + 投影，并且**强制亮底**
   —— 内容区的字色是写死的暗色，只有亮底才读得出来。`color-scheme: light`
   是给 select / date 这类原生控件用的，否则它们会跟着系统暗色渲染成黑底。

   浅色下不加任何边距 / 圆角 / 背景 —— 保持与改动前逐像素一致（探针几何也不动）。
   ⚠️ 四页内均无 `position: sticky`，所以这里 `overflow: hidden` 安全；
   将来谁在控制台页里加 sticky，要改成给内层元素单独加圆角。 */
.console-shell[data-theme='dark'] .console-shell-main {
  padding: 12px;
  background: var(--background);
}

/* 排除汉堡按钮：它是 `position: fixed` 的窄屏把手，套上纸边会变成一块带投影的怪块 */
.console-shell[data-theme='dark'] .console-shell-main > :deep(*:not(.console-shell-toggle)) {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--console-canvas-shadow);
  background: var(--console-canvas);
  color-scheme: light;
}

/* GateConsole 是四页里唯一写死 `min-height: 100vh` 的：12px 边距会把页面顶出
   24px 滚动条。这里只中和这一处，不设全局（其余三页按内容高度，别硬拉）。 */
.console-shell[data-theme='dark'] .console-shell-main > :deep(.gc) {
  min-height: calc(100vh - 24px);
}

/* z-index 三层必须分清：汉堡 1000 < 遮罩 1001 < 侧栏 1002（侧栏的 1002 写在自己组件里）。
   遮罩压在汉堡上是对的 —— 抽屉开着时点遮罩即关，不该还能点到把手。 */
.console-shell-scrim {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.32);
  z-index: 1001;
}

.console-shell-toggle {
  display: none;
}

.console-shell-notice {
  position: fixed;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 1100;
  margin: 0;
  padding: 10px 16px;
  border-radius: 10px;
  background: var(--foreground);
  color: var(--background);
  font-size: 0.8rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
}

@media (max-width: 768px), (orientation: landscape) and (max-height: 500px) {
  .console-shell-toggle {
    position: fixed;
    left: 12px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 1000;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card-solid, #ffffff);
    color: var(--foreground);
    font-size: 0.8rem;
    line-height: 1;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.16);
    cursor: pointer;
  }
}
</style>
