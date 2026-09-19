import { computed, reactive, ref } from 'vue';
import { MessageCircle, Settings, User, Users, Wallet } from 'lucide-vue-next';

// 2026-09 IA 重构：底栏 = 社区(论坛+成员+收藏+印象) / 内容(身份卡+帖子+shows+草稿) / 资产 / 消息(+AI) / 设置
export const USER_SPACE_VALID_TABS = ['community', 'posts', 'assets', 'messages', 'settings'];

/* 用户空间主导航单源：底部胶囊（UserSpaceBottomNav）与横屏左栏（UserSpaceSideRail）
   共用同一份；他人空间（ProfileMain）的横屏左栏也引用它 —— 改这里三处同步生效 */
export const userSpaceNavItems = [
  { id: 'community', label: '社区', icon: Users },
  { id: 'posts', label: '我的', icon: User },
  { id: 'assets', label: '资产', icon: Wallet },
  { id: 'messages', label: '消息', icon: MessageCircle },
  { id: 'settings', label: '设置', icon: Settings }
];

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
