import { describe, it, expect, beforeEach, vi } from 'vitest';

// Need to mock window.sessionStorage before importing the module
const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

// Stub global window with sessionStorage
vi.stubGlobal('window', {
  sessionStorage: sessionStorageMock,
});

import {
  saveForumReturnState,
  readForumReturnState,
  clearForumReturnState,
  getForumReturnKeyFromQuery,
  isSafePostDetailHistoryReturn,
} from '../../src/utils/forum-return-state.js';

describe('forum-return-state', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('saveForumReturnState', () => {
    it('saves state to sessionStorage', () => {
      const result = saveForumReturnState('forum', { scrollY: 500, tab: 'latest' });
      expect(result).toBe(true);
      const key = 'boh_forum_return_state:forum';
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        key,
        expect.stringContaining('"scrollY":500')
      );
    });

    it('normalizes key to lowercase', () => {
      saveForumReturnState('FORUM', { scrollY: 100 });
      const key = 'boh_forum_return_state:forum';
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        key,
        expect.any(String)
      );
    });

    it('maps user-space key correctly', () => {
      saveForumReturnState('user-space', { scrollY: 100 });
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'boh_forum_return_state:user-space',
        expect.any(String)
      );
    });
  });

  describe('readForumReturnState', () => {
    it('reads saved state', () => {
      saveForumReturnState('forum', { scrollY: 500 });
      const state = readForumReturnState('forum');
      expect(state).toBeDefined();
      expect(state.scrollY).toBe(500);
      expect(state.key).toBe('forum');
    });

    it('returns null for expired state', () => {
      const expiredPayload = JSON.stringify({
        scrollY: 500,
        key: 'forum',
        savedAt: Date.now() - 31 * 60 * 1000 // 31 minutes ago
      });
      sessionStorageMock.setItem('boh_forum_return_state:forum', expiredPayload);

      const state = readForumReturnState('forum');
      expect(state).toBeNull();
    });

    it('returns null for non-existent key', () => {
      expect(readForumReturnState('forum')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      sessionStorageMock.setItem('boh_forum_return_state:forum', 'not-json');
      expect(readForumReturnState('forum')).toBeNull();
    });
  });

  describe('clearForumReturnState', () => {
    it('clears state from sessionStorage', () => {
      saveForumReturnState('forum', { scrollY: 500 });
      clearForumReturnState('forum');
      const key = 'boh_forum_return_state:forum';
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(key);
    });
  });

  describe('getForumReturnKeyFromQuery', () => {
    it('returns normalized key from query', () => {
      expect(getForumReturnKeyFromQuery({ returnKey: 'user-space' })).toBe('user-space');
      expect(getForumReturnKeyFromQuery({ returnKey: 'forum' })).toBe('forum');
    });

    it('returns fallback when no returnKey', () => {
      expect(getForumReturnKeyFromQuery({}, 'forum')).toBe('forum');
    });

    it('handles array returnKey', () => {
      expect(getForumReturnKeyFromQuery({ returnKey: ['user-space'] })).toBe('user-space');
    });
  });

  describe('isSafePostDetailHistoryReturn', () => {
    it('accepts the matching forum and user-space history entries', () => {
      expect(isSafePostDetailHistoryReturn('/user-space?tab=posts', 'user-space')).toBe(true);
      expect(isSafePostDetailHistoryReturn('/forum?restore=1', 'forum')).toBe(true);
      expect(isSafePostDetailHistoryReturn('/user-space?tab=posts', 'forum')).toBe(true);
    });

    it('rejects unrelated or mismatched history entries', () => {
      expect(isSafePostDetailHistoryReturn('/', 'forum')).toBe(false);
      expect(isSafePostDetailHistoryReturn('/user-space?tab=posts', 'profile')).toBe(false);
      expect(isSafePostDetailHistoryReturn('', 'user-space')).toBe(false);
    });
  });
});
