import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { tabModules } from '../config/tabs.js';
import { tabs, ADMIN_PAGE_META } from '../config.js';
import { ADMIN_SECTION_DEFAULT_TABS } from '../query-config.js';

// section -> module 映射
const SECTION_TO_MODULE_MAP = {
  overview: 'overview',
  data: 'users',
  'api-keys': 'ai-config',
  freemodels: 'ai-config',
  'moderation-model': 'ai-config',
  'lab-ai-model': 'ai-config',
  media: 'system',
  settings: 'system'
};

// 归属于 'data' section 的模块：保留用户已选模块，避免被 'data' → 'users' 覆盖
const DATA_SECTION_MODULES = new Set(['users', 'gifts', 'content', 'moderation', 'lottery', 'ai-config']);

const ROUTE_MAP = {
  overview: '/admin/data-management',
  'api-keys': '/admin/api-keys',
  'moderation-model': '/admin/data-management',
  'lab-ai-model': '/admin/data-management',
  data: '/admin/data-management',
  media: '/admin/data-management',
  settings: '/admin/data-management'
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
  loadLotterySchedulerStatus
}) => {
  const router = useRouter();
  const activeModule = ref('overview');

  const sidebarModules = computed(() => tabModules.map(m => ({ ...m })));

  const currentModule = computed(() =>
    tabModules.find(m => m.id === activeModule.value) || tabModules[0]
  );

  const currentModuleTabIds = computed(() => currentModule.value?.tabIds || []);

  const currentAdminPageMeta = computed(
    () => ADMIN_PAGE_META[activeModule.value] || ADMIN_PAGE_META.overview
  );

  const getTabLabel = (tabId) => {
    const tab = tabs.find(t => t.id === tabId);
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
      // 点击 AI 配置父项：导航到第一个子项
      activeAdminSectionRef.value = 'api-keys';
      navigateTo(ROUTE_MAP['api-keys']);
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
      return;
    }
    if (action?.section && !action?.tab) {
      activeAdminSectionRef.value = action.section;
      return;
    }
    if (!action?.tab) return;
    activeAdminSectionRef.value = action.section || 'data';
    switchTab(action.tab);
  };

  const getTabsByGroup = (group) => {
    const tabIds = new Set(group?.tabIds || []);
    return tabs.filter((tab) => tabIds.has(tab.id));
  };

  const switchTab = (tabId, options = {}) => {
    if (activeAdminSectionRef.value === 'overview' || isPlaceholderAdminSectionRef.value) {
      activeAdminSectionRef.value = 'data';
    }
    currentTabRef.value = tabId;
    const tabInfo = tabs.find(t => t.id === tabId);
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
    switchTab
  };
};
