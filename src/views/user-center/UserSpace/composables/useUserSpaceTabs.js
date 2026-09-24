import { computed, reactive, ref } from 'vue';
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';

// 2026-09-23 恢复五席：社区（现名「方块」）回到 UserSpace —— 论坛（官方 + 最新/关注/
// 新闻/活动/成员/印象）重新由本页承载，首页 `/` 是它的下滑直达入口（同一套分区壳，单源复用）。
export const USER_SPACE_VALID_TABS = ['community', 'posts', 'assets', 'messages', 'settings'];

/* 用户空间主导航单源：底部胶囊（UserSpaceBottomNav）与横屏左栏（UserSpaceSideRail）
   共用同一份；他人空间（ProfileMain）的横屏左栏也引用它 —— 改这里三处同步生效。
   2026-09-23：items 仍由 @/config/bottom-nav 注入（全站唯一一组：
   方块 / 我的 / 资产 / 消息 / 设置），第一席「方块」就是论坛。 */
export const userSpaceNavItems = BOTTOM_NAV_ITEMS;

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
