import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { tabModules } from '../config/tabs.js';
import { tabs, ADMIN_PAGE_META } from '../config.js';
import { ADMIN_SECTION_DEFAULT_TABS } from '../query-config.js';
import { setAdminTabJumpSearch } from './useAdminTabIntent.js';

// section -> module 映射
const SECTION_TO_MODULE_MAP = {
  overview: 'overview',
  data: 'users',
  'keys-models': 'ai-config',
  'api-keys': 'ai-config',
  freemodels: 'ai-config',
  'moderation-model': 'ai-config',
  'lab-ai-model': 'ai-config',
  media: 'system',
  settings: 'system',
};

// 归属于 'data' section 的模块：保留用户已选模块，避免被 'data' → 'users' 覆盖
const DATA_SECTION_MODULES = new Set([
  'users',
  'gifts',
  'shop',
  'community',
  'operations',
  'moderation',
  'lottery',
  'ai-config',
  'logs',
  'shop-console',
  'hero-console',
  'gate-console',
  'avatar-console',
]);

// section / 模块 → 实际路由路径。
// ⚠️ 单一真源：**面板内的页面一律走 /admin/data-management**，靠 `?section=&tab=` 定位。
// 曾经 'api-keys' 特判到 /admin/api-keys，导致同一个侧栏动作在两条代码路径下
// 写出两种 URL（handleModuleClick 写 data-management、handleAdminNavClick 写 api-keys）。
// /admin/api-keys 路由现仅作为**对外兼容别名**保留（旧书签可用），内部导航不再指向它。
// 导出仅为单测可断言「每个 page 型模块都有落点」——漏一条的后果是点侧栏静默无反应。
export const ROUTE_MAP = {
  overview: '/admin/data-management',
  'keys-models': '/admin/data-management',
  'api-keys': '/admin/data-management',
  'moderation-model': '/admin/data-management',
  'lab-ai-model': '/admin/data-management',
  'shop-console': '/admin/shop-console',
  'hero-console': '/admin/hero-console',
  'gate-console': '/admin/gate-console',
  'avatar-console': '/admin/avatar-console',
  data: '/admin/data-management',
  media: '/admin/data-management',
  settings: '/admin/data-management',
};

export const createNavigationCenter = ({
  activeAdminSectionRef,
  isAdminSidebarOpenRef,
  isDataTreeCollapsedRef,
  currentTabRef,
  currentPageRef,
  suppressNextPageFetchRef,
  searchQueryRef,
  selectedItemsRef,
  userPickerKeywordRef,
  showUserPickerModalRef,
  sortKeyRef,
  isPlaceholderAdminSectionRef,
  lotteryOpsTabs,
  resetFiltersForTab,
  clearFieldErrors,
  fetchTabData,
  loadLotterySchedulerStatus,
}) => {
  const router = useRouter();
  const activeModule = ref('overview');

  const sidebarModules = computed(() => tabModules.map((m) => ({ ...m })));

  const currentModule = computed(
    () => tabModules.find((m) => m.id === activeModule.value) || tabModules[0],
  );

  const currentModuleTabIds = computed(() => currentModule.value?.tabIds || []);

  const currentAdminPageMeta = computed(
    () => ADMIN_PAGE_META[activeModule.value] || ADMIN_PAGE_META.overview,
  );

  const getTabLabel = (tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    return tab?.label || tabId;
  };

  // 当 section 切换时同步 module，但避免 'data' section 覆盖已选数据模块
  const syncModuleFromSection = (section) => {
    if (section === 'data' && DATA_SECTION_MODULES.has(activeModule.value)) {
      return;
    }
    const mod = SECTION_TO_MODULE_MAP[section] || 'overview';
    if (activeModule.value !== mod) activeModule.value = mod;
  };

  const navigateTo = (path) => {
    if (router.currentRoute.value.path !== path) {
      router.push(path).catch(() => {});
    }
  };

  const handleModuleClick = (mod) => {
    activeModule.value = mod.id;

    if (mod.id === 'overview') {
      activeAdminSectionRef.value = 'overview';
      navigateTo('/admin/data-management');
      isAdminSidebarOpenRef.value = false;
      return;
    }

    // 独立页面模块：直接跳转到外部子应用页
    if (mod.type === 'page' && ROUTE_MAP[mod.id]) {
      navigateTo(ROUTE_MAP[mod.id]);
      isAdminSidebarOpenRef.value = false;
      return;
    }

    if (mod.id === 'system') {
      activeAdminSectionRef.value = 'media';
      navigateTo('/admin/data-management');
      isAdminSidebarOpenRef.value = false;
      return;
    }

    // ai-config 模块：使用独立 section，避免被 syncModuleFromSection 覆盖
    if (mod.id === 'ai-config') {
      activeAdminSectionRef.value = mod.defaultTab; // 'api-keys'
      if (mod.defaultTab) currentTabRef.value = mod.defaultTab;
      navigateTo('/admin/data-management');
      isAdminSidebarOpenRef.value = false;
      return;
    }

    // data modules (users/content/moderation/lottery)
    activeAdminSectionRef.value = 'data';
    if (mod.defaultTab) {
      switchTab(mod.defaultTab);
    }
    navigateTo('/admin/data-management');
    isAdminSidebarOpenRef.value = false;
  };

  const handleAdminNavClick = (item) => {
    if (item.id === 'data' && activeAdminSectionRef.value === 'data') {
      isDataTreeCollapsedRef.value = !isDataTreeCollapsedRef.value;
      return;
    }
    if (item.id === 'ai-config') {
      // 点击 AI 配置父项：落到第一个子项（api-keys）。
      // 必须与 handleModuleClick 的 ai-config 分支**写成同一个 URL**，否则同一个
      // 侧栏动作会因走哪条代码路径而产生两种地址（本次统一：都走 data-management）。
      activeAdminSectionRef.value = 'api-keys';
      if (currentTabRef.value !== 'api-keys') switchTab('api-keys');
      navigateTo('/admin/data-management');
      isAdminSidebarOpenRef.value = false;
      return;
    }
    activeAdminSectionRef.value = item.id;
    if (item.id === 'data') {
      isDataTreeCollapsedRef.value = false;
    }
    const target = ROUTE_MAP[item.id];
    if (target) navigateTo(target);
    const defaultTab = ADMIN_SECTION_DEFAULT_TABS[item.id];
    if (defaultTab) {
      switchTab(defaultTab);
    }
    isAdminSidebarOpenRef.value = false;
  };

  const handleOverviewTabClick = (tabId) => {
    activeAdminSectionRef.value = 'data';
    switchTab(tabId);
    isAdminSidebarOpenRef.value = false;
  };

  const handleSidebarTabClick = (tabId) => {
    activeAdminSectionRef.value = 'data';
    isDataTreeCollapsedRef.value = false;
    switchTab(tabId);
    isAdminSidebarOpenRef.value = false;
  };

  const handlePlaceholderAction = (action) => {
    if (action?.route) {
      router.push(action.route);
      isAdminSidebarOpenRef.value = false;
      return;
    }
    if (action?.section && !action?.tab) {
      activeAdminSectionRef.value = action.section;
      isAdminSidebarOpenRef.value = false;
      return;
    }
    if (!action?.tab) return;
    activeAdminSectionRef.value = action.section || 'data';
    switchTab(action.tab);
    isAdminSidebarOpenRef.value = false;
  };

  const getTabsByGroup = (group) => {
    const tabIds = new Set(group?.tabIds || []);
    return tabs.filter((tab) => tabIds.has(tab.id));
  };

  const switchTab = (tabId, options = {}) => {
    if (activeAdminSectionRef.value === 'overview' || isPlaceholderAdminSectionRef.value) {
      activeAdminSectionRef.value = 'data';
    }
    isAdminSidebarOpenRef.value = false;
    currentTabRef.value = tabId;
    const tabInfo = tabs.find((t) => t.id === tabId);
    if (tabInfo?.module && activeModule.value !== tabInfo.module) {
      activeModule.value = tabInfo.module;
    }
    isDataTreeCollapsedRef.value = false;
    if (currentPageRef.value !== 1) {
      suppressNextPageFetchRef.value = true;
      currentPageRef.value = 1;
    }
    selectedItemsRef.value = [];
    searchQueryRef.value = options.search || '';
    // 跳转携带的关键词必须能活过「写 URL query → 组件重建」这一跳：
    // 组件 key 为 fullPath，重建后 searchQuery 归零，onMounted 的 fetchData 会用
    // 空关键词覆盖掉带过滤的查询（名单跳转失效的根因）。
    setAdminTabJumpSearch(options.search || '');
    resetFiltersForTab();
    userPickerKeywordRef.value = '';
    showUserPickerModalRef.value = false;
    sortKeyRef.value = '';
    clearFieldErrors();
    fetchTabData(tabId, { useCache: true });
    if (lotteryOpsTabs.has(tabId)) {
      loadLotterySchedulerStatus();
    }
  };

  return {
    activeModule,
    sidebarModules,
    currentModule,
    currentModuleTabIds,
    currentAdminPageMeta,
    getTabLabel,
    syncModuleFromSection,
    handleModuleClick,
    handleAdminNavClick,
    handleOverviewTabClick,
    handleSidebarTabClick,
    handlePlaceholderAction,
    getTabsByGroup,
    switchTab,
  };
};
