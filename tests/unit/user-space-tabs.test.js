import { describe, expect, it } from 'vitest';
import { useUserSpaceTabs } from '../../src/views/user-center/UserSpace/composables/useUserSpaceTabs.js';

// 2026-09 IA 重构后的底栏（与 UserSpaceMain.vue 的 navItems 一致）
const navItems = [
  { id: 'community' },
  { id: 'posts' },
  { id: 'assets' },
  { id: 'messages' },
  { id: 'settings' },
];

describe('useUserSpaceTabs', () => {
  it('mounts the requested route tab on the first render', () => {
    const tabs = useUserSpaceTabs(navItems, 'assets');

    expect(tabs.currentTab.value).toBe('assets');
    expect(tabs.mountedTabs.assets).toBe(true);
    expect(tabs.mountedTabs.community).toBe(false);
  });

  it('falls back to community for an invalid initial tab', () => {
    const tabs = useUserSpaceTabs(navItems, 'unknown');

    expect(tabs.currentTab.value).toBe('community');
    expect(tabs.mountedTabs.community).toBe(true);
  });
});
