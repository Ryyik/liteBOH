import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getNotificationStoreSync,
  loadNotificationStore,
} from '@/stores/notification-loader';

vi.mock('@/stores/notifications', () => ({
  useNotificationStore: vi.fn(() => ({
    unreadCount: 0,
    notifications: [],
    loadNotifications: vi.fn(),
  })),
}));

describe('notification-loader', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset the module-level variables by re-importing
  });

  describe('getNotificationStoreSync', () => {
    it('returns null before store is loaded', () => {
      const store = getNotificationStoreSync();
      expect(store).toBeNull();
    });
  });

  describe('loadNotificationStore', () => {
    it('loads and returns the notification store', async () => {
      const store = await loadNotificationStore();
      expect(store).toBeDefined();
      expect(store.unreadCount).toBe(0);
      expect(store.notifications).toEqual([]);
    });

    it('returns cached instance on subsequent calls', async () => {
      const store1 = await loadNotificationStore();
      const store2 = await loadNotificationStore();
      expect(store1).toBe(store2);
    });

    it('sync getter returns the store after loading', async () => {
      await loadNotificationStore();
      const store = getNotificationStoreSync();
      expect(store).toBeDefined();
      expect(store).not.toBeNull();
    });
  });
});