import { computed, reactive, ref } from 'vue';

export const USER_SPACE_VALID_TABS = ['posts', 'community', 'messages', 'profile', 'shows', 'ai'];

export const useUserSpaceTabs = (navItems) => {
  const currentTab = ref('posts');
  const profileSection = ref('home');
  const isAICollapsed = ref(true);
  const mountedTabs = reactive({
    posts: true,
    community: false,
    messages: false,
    shows: false,
    ai: false,
    profile: false
  });

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
