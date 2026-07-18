import { describe, expect, it } from 'vitest';
import { useUserSpaceTabs } from '../../src/views/user-center/UserSpace/composables/useUserSpaceTabs.js';

const navItems = [
  { id: 'posts' },
  { id: 'community' },
  { id: 'messages' },
  { id: 'profile' },
  { id: 'ai' },
];

describe('useUserSpaceTabs', () => {
  it('mounts the requested route tab on the first render', () => {
    const tabs = useUserSpaceTabs(navItems, 'profile');

    expect(tabs.currentTab.value).toBe('profile');
    expect(tabs.mountedTabs.profile).toBe(true);
    expect(tabs.mountedTabs.posts).toBe(false);
  });

  it('falls back to posts for an invalid initial tab', () => {
    const tabs = useUserSpaceTabs(navItems, 'unknown');

    expect(tabs.currentTab.value).toBe('posts');
    expect(tabs.mountedTabs.posts).toBe(true);
  });
});
