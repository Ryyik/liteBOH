import { computed, reactive, ref } from 'vue';

export const USER_SPACE_VALID_TABS = ['posts', 'community', 'messages', 'profile', 'shows', 'ai'];

export const useUserSpaceTabs = (navItems, initialTab = 'posts') => {
  const safeInitialTab = USER_SPACE_VALID_TABS.includes(initialTab) ? initialTab : 'posts';
  const currentTab = ref(safeInitialTab);
  const profileSection = ref('home');
  const isAICollapsed = ref(true);
  const mountedTabs = reactive({
    posts: safeInitialTab === 'posts',
    community: false,
    messages: false,
    shows: false,
    ai: false,
    profile: safeInitialTab === 'profile'
  });
  if (Object.prototype.hasOwnProperty.call(mountedTabs, safeInitialTab)) {
    mountedTabs[safeInitialTab] = true;
  }

  const activeNavIndex = computed(() => Math.max(
    0,
    navItems.findIndex((item) => item.id === currentTab.value)
  ));

  const navIndicatorStyle = computed(() => ({
    '--active-nav-index': activeNavIndex.value,
    '--active-nav-center': `${((activeNavIndex.value + 0.5) / navItems.length) * 100}%`,
    '--nav-count': navItems.length
  }));

  const ensureTabMounted = (tabId) => {
    if (Object.prototype.hasOwnProperty.call(mountedTabs, tabId)) {
      mountedTabs[tabId] = true;
    }
  };

  const toggleAICollapsed = () => {
    isAICollapsed.value = !isAICollapsed.value;
  };

  return {
    currentTab,
    profileSection,
    isAICollapsed,
    mountedTabs,
    activeNavIndex,
    navIndicatorStyle,
    ensureTabMounted,
    toggleAICollapsed
  };
};
