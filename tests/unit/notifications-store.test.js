import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const nm = vi.hoisted(() => ({
  getUserNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  getCurrentUser: vi.fn(),
  subscribeToNotifications: vi.fn().mockResolvedValue({
    unsubscribe: vi.fn(),
    on: vi.fn(function () { return this; }),
    subscribe: vi.fn(function (cb) { if (cb) cb('SUBSCRIBED'); return this; }),
  }),
  supabase: { removeChannel: vi.fn() },
  invalidateByTags: vi.fn(),
}));

vi.mock('@/utils/auth.js', () => ({
  getUserNotifications: nm.getUserNotifications,
  getUnreadNotificationCount: nm.getUnreadNotificationCount,
  getCurrentUser: nm.getCurrentUser,
  subscribeToNotifications: nm.subscribeToNotifications,
  supabase: nm.supabase,
  invalidateByTags: nm.invalidateByTags,
}));

vi.mock('@/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Force static import before store to register mock for dynamic import interception
// eslint-disable-next-line no-restricted-imports
import * as _auth from '@/utils/auth.js';
void _auth;

import { useNotificationStore } from '@/stores/notifications';

describe('notifications store: basic state', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('initializes with default values', () => {
    const store = useNotificationStore();
    expect(store.unreadCount).toBe(0);
    expect(store.showToast).toBe(false);
    expect(store.toastTitle).toBe('');
    expect(store.toastDesc).toBe('');
    expect(store.toastIcon).toBe('🔔');
  });
});

describe('notifications store: displayToast / hideToast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays toast with custom params', () => {
    const store = useNotificationStore();
    store.displayToast('标题', '描述', '🎉');
    expect(store.showToast).toBe(true);
    expect(store.toastTitle).toBe('标题');
    expect(store.toastDesc).toBe('描述');
    expect(store.toastIcon).toBe('🎉');
  });

  it('uses default icon when not provided', () => {
    const store = useNotificationStore();
    store.displayToast('标题', '描述');
    expect(store.toastIcon).toBe('🔔');
  });

  it('auto-hides toast after 1500ms', () => {
    const store = useNotificationStore();
    store.displayToast('标题', '描述');
    expect(store.showToast).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(store.showToast).toBe(false);
  });

  it('replaces existing toast timer', () => {
    const store = useNotificationStore();
    store.displayToast('First', 'desc');
    store.displayToast('Second', 'desc');
    vi.advanceTimersByTime(1500);
    expect(store.toastTitle).toBe('Second');
  });

  it('hideToast clears immediately', () => {
    const store = useNotificationStore();
    store.displayToast('标题', '描述');
    store.hideToast();
    expect(store.showToast).toBe(false);
  });
});

describe('notifications store: setUnreadCount / resetState', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('setUnreadCount updates count', () => {
    const store = useNotificationStore();
    store.setUnreadCount(5);
    expect(store.unreadCount).toBe(5);
  });

  it('resetState clears all state', () => {
    const store = useNotificationStore();
    store.setUnreadCount(5);
    store.displayToast('title', 'desc');
    store.resetState();
    expect(store.unreadCount).toBe(0);
    expect(store.showToast).toBe(false);
  });
});

// All async tests that depend on loadAuthApi() dynamic import in one block
// to avoid vitest mock caching issues across describe blocks
describe('notifications store: async operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('startNotificationListener: skips when no userId provided', async () => {
    setActivePinia(createPinia());
    const store = useNotificationStore();
    await store.startNotificationListener('');
    expect(store.currentUserId).toBeNull();
  });

  it('refreshUnreadCount: fetches unread count when userId is set', async () => {
    setActivePinia(createPinia());
    nm.getUnreadNotificationCount.mockResolvedValue({ count: 3 });

    const store = useNotificationStore();
    store.$patch({ currentUserId: 'u1' });

    await store.refreshUnreadCount();
    expect(store.unreadCount).toBe(3);
    expect(nm.getUnreadNotificationCount).toHaveBeenCalledWith('u1');
  });

  it('refreshUnreadCount: resolves userId from getCurrentUser when not set', async () => {
    setActivePinia(createPinia());
    nm.getCurrentUser.mockResolvedValue({ id: 'auto-user' });
    nm.getUnreadNotificationCount.mockResolvedValue({ count: 7 });

    const store = useNotificationStore();

    await store.refreshUnreadCount();
    expect(store.unreadCount).toBe(7);
    expect(nm.getCurrentUser).toHaveBeenCalled();
    expect(nm.getUnreadNotificationCount).toHaveBeenCalledWith('auto-user');
  });

  it('stopNotificationListener: handles no handler gracefully', () => {
    setActivePinia(createPinia());
    const store = useNotificationStore();
    expect(() => store.stopNotificationListener()).not.toThrow();
  });

  it('stopNotificationListener: cleans up event listener', async () => {
    setActivePinia(createPinia());
    const store = useNotificationStore();
    await store.startNotificationListener('u1');
    await store.stopNotificationListener();
    // 不应抛出错误
  });

  it('startNotificationListener: sets userId and refreshes unread count', async () => {
    setActivePinia(createPinia());
    nm.getCurrentUser.mockResolvedValue({ id: 'u1' });
    nm.getUnreadNotificationCount.mockResolvedValue({ count: 2 });

    const store = useNotificationStore();
    await store.startNotificationListener('u1');

    expect(store.currentUserId).toBe('u1');
    expect(nm.getUnreadNotificationCount).toHaveBeenCalledWith('u1');
    expect(store.unreadCount).toBe(2);
  });
});