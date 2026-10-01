import { computed, reactive, ref } from 'vue';
import { BOTTOM_NAV_ITEMS, resolveBottomNavIdForUserSpaceTab } from '@/config/bottom-nav';

// 2026-09-30 底栏收敛为四席（内容 / 消息 / AI / 我）：assets 与 settings 已下沉进「我」页，
// 不再是底栏项，但仍保留为合法 tab 值（URL 深链与内部跳转仍在用）。
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
    settings: safeInitialTab === 'settings',
  });
  if (Object.prototype.hasOwnProperty.call(mountedTabs, safeInitialTab)) {
    mountedTabs[safeInitialTab] = true;
  }

  // 高亮索引必须走映射：assets / settings 不在 navItems 里，直接 findIndex 会得 -1，
  // 经 Math.max(0,…) 变成「高亮第一席（内容）」—— 那是错的，应落到「我」。
  const activeNavIndex = computed(() => {
    const mappedId = resolveBottomNavIdForUserSpaceTab(currentTab.value) || currentTab.value;
    return Math.max(
      0,
      navItems.findIndex((item) => item.id === mappedId),
    );
  });

  const navIndicatorStyle = computed(() => ({
    '--active-nav-index': activeNavIndex.value,
    '--active-nav-center': `${((activeNavIndex.value + 0.5) / navItems.length) * 100}%`,
    '--nav-count': navItems.length,
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
    ensureTabMounted,
  };
};
