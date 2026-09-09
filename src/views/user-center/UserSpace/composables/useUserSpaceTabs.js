import { computed, reactive, ref } from 'vue';

// 2026-09 IA 重构：底栏 = 社区(论坛+成员+收藏+印象) / 内容(身份卡+帖子+shows+草稿) / 资产 / 消息(+AI) / 设置
export const USER_SPACE_VALID_TABS = ['community', 'posts', 'assets', 'messages', 'settings'];

export const useUserSpaceTabs = (navItems, initialTab = 'community') => {
  const safeInitialTab = USER_SPACE_VALID_TABS.includes(initialTab) ? initialTab : 'community';
  const currentTab = ref(safeInitialTab);
  const mountedTabs = reactive({
    community: safeInitialTab === 'community',
    posts: safeInitialTab === 'posts',
    assets: safeInitialTab === 'assets',
    messages: safeInitialTab === 'messages',
    settings: safeInitialTab === 'settings'
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

  return {
    currentTab,
    navIndicatorStyle,
    mountedTabs,
    activeNavIndex,
    ensureTabMounted
  };
};
