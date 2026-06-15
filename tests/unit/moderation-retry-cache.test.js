import { describe, expect, it, beforeEach } from 'vitest';
import {
  POST_REJECTED_NOTICE_TEXT,
  POST_REJECTED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTICE_TEXT,
  COMMENT_REJECTED_NOTIFICATION_TYPE,
  MODERATION_RETRY_STORAGE_KEY,
  loadRetriedNotificationIdSet,
  persistRetriedNotificationIdSet,
  markRetriedNotificationId,
  canRetryModerationNotificationBySet,
} from '../../src/utils/moderation-retry-cache.js';

describe('moderation-retry-cache: constants', () => {
  it('defines post rejection notice', () => {
    expect(POST_REJECTED_NOTICE_TEXT).toContain('未通过审查');
  });

  it('defines comment rejection notice', () => {
    expect(COMMENT_REJECTED_NOTICE_TEXT).toContain('未通过审查');
  });

  it('defines correct notification types', () => {
    expect(POST_REJECTED_NOTIFICATION_TYPE).toBe('post_rejected');
    expect(COMMENT_REJECTED_NOTIFICATION_TYPE).toBe('comment_rejected');
  });

  it('defines storage key', () => {
    expect(MODERATION_RETRY_STORAGE_KEY).toContain('boh_post_moderation_retry');
  });
});

describe('moderation-retry-cache: loadRetriedNotificationIdSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty set when localStorage is empty', () => {
    const result = loadRetriedNotificationIdSet();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('loads persisted IDs', () => {
    localStorage.setItem(MODERATION_RETRY_STORAGE_KEY, JSON.stringify(['n1', 'n2', 'n3']));
    const result = loadRetriedNotificationIdSet();
    expect(result.size).toBe(3);
    expect(result.has('n1')).toBe(true);
    expect(result.has('n2')).toBe(true);
    expect(result.has('n3')).toBe(true);
  });

  it('handles corrupt JSON gracefully', () => {
    localStorage.setItem(MODERATION_RETRY_STORAGE_KEY, 'not-json');
    const result = loadRetriedNotificationIdSet();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('handles non-array JSON gracefully', () => {
    localStorage.setItem(MODERATION_RETRY_STORAGE_KEY, JSON.stringify({ a: 1 }));
    const result = loadRetriedNotificationIdSet();
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('converts all IDs to strings', () => {
    localStorage.setItem(MODERATION_RETRY_STORAGE_KEY, JSON.stringify([1, 2, 3]));
    const result = loadRetriedNotificationIdSet();
    expect(result.has('1')).toBe(true);
    expect(result.has(1)).toBe(false);
  });

  it('accepts custom storage key', () => {
    localStorage.setItem('custom_key', JSON.stringify(['c1']));
    const result = loadRetriedNotificationIdSet('custom_key');
    expect(result.has('c1')).toBe(true);
  });
});

describe('moderation-retry-cache: persistRetriedNotificationIdSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists a set to localStorage', () => {
    const idSet = new Set(['a', 'b', 'c']);
    persistRetriedNotificationIdSet(idSet);
    const stored = JSON.parse(localStorage.getItem(MODERATION_RETRY_STORAGE_KEY));
    expect(stored).toEqual(['a', 'b', 'c']);
  });

  it('persists empty set as empty array', () => {
    persistRetriedNotificationIdSet(new Set());
    const stored = JSON.parse(localStorage.getItem(MODERATION_RETRY_STORAGE_KEY));
    expect(stored).toEqual([]);
  });

  it('uses custom storage key', () => {
    const idSet = new Set(['x']);
    persistRetriedNotificationIdSet(idSet, 'custom_save_key');
    expect(localStorage.getItem('custom_save_key')).toBe(JSON.stringify(['x']));
  });
});

describe('moderation-retry-cache: markRetriedNotificationId', () => {
  it('adds ID to set and returns true', () => {
    const idSet = new Set(['existing']);
    const result = markRetriedNotificationId(idSet, 'new-id');
    expect(result).toBe(true);
    expect(idSet.has('new-id')).toBe(true);
    expect(idSet.size).toBe(2);
  });

  it('returns false for empty ID', () => {
    const idSet = new Set();
    expect(markRetriedNotificationId(idSet, '')).toBe(false);
    expect(markRetriedNotificationId(idSet, '  ')).toBe(false);
  });
});

describe('moderation-retry-cache: canRetryModerationNotificationBySet', () => {
  it('returns true for valid post rejected notification', () => {
    const notification = { id: 'n1', type: 'post_rejected', post: { id: 'p1' } };
    const retriedSet = new Set();
    expect(canRetryModerationNotificationBySet(notification, retriedSet)).toBe(true);
  });

  it('returns false when already retried', () => {
    const notification = { id: 'n1', type: 'post_rejected', post: { id: 'p1' } };
    const retriedSet = new Set(['n1']);
    expect(canRetryModerationNotificationBySet(notification, retriedSet)).toBe(false);
  });

  it('returns false for wrong notification type', () => {
    const notification = { id: 'n1', type: 'like', post: { id: 'p1' } };
    const retriedSet = new Set();
    expect(canRetryModerationNotificationBySet(notification, retriedSet)).toBe(false);
  });

  it('returns false when missing post ID', () => {
    const notification = { id: 'n1', type: 'post_rejected', post: {} };
    const retriedSet = new Set();
    expect(canRetryModerationNotificationBySet(notification, retriedSet)).toBe(false);
  });

  it('returns falsy when missing notification ID', () => {
    const notification = { id: '', type: 'post_rejected', post: { id: 'p1' } };
    const retriedSet = new Set();
    expect(canRetryModerationNotificationBySet(notification, retriedSet)).toBeFalsy();
  });

  it('accepts post_id as fallback', () => {
    const notification = { id: 'n1', type: 'post_rejected', post_id: 'p1' };
    const retriedSet = new Set();
    expect(canRetryModerationNotificationBySet(notification, retriedSet)).toBe(true);
  });

  it('supports comment rejected type', () => {
    const notification = { id: 'n2', type: 'comment_rejected', post: { id: 'p1' } };
    const retriedSet = new Set();
    expect(canRetryModerationNotificationBySet(notification, retriedSet, 'comment_rejected')).toBe(true);
  });
});