import { describe, it, expect } from 'vitest';
import {
  getGiftCompletedAt,
  isGiftExpiredCompleted,
  getExpiredActiveGiftIds,
  markGiftsAsHistory,
} from '../../src/utils/gift-archive.js';

describe('getGiftCompletedAt', () => {
  it('returns null for non-completed gift', () => {
    const gift = { gift_status: 'pending', completed_at: '2026-01-01' };
    expect(getGiftCompletedAt(gift)).toBeNull();
  });

  it('returns null for null/undefined gift', () => {
    expect(getGiftCompletedAt(null)).toBeNull();
    expect(getGiftCompletedAt(undefined)).toBeNull();
  });

  it('prefers completed_at over updated_at', () => {
    const gift = {
      gift_status: 'completed',
      completed_at: '2026-03-15T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z'
    };
    const result = getGiftCompletedAt(gift);
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-03-15T10:00:00.000Z');
  });

  it('falls back to updated_at when completed_at is missing', () => {
    const gift = {
      gift_status: 'completed',
      updated_at: '2026-04-01T10:00:00Z'
    };
    const result = getGiftCompletedAt(gift);
    expect(result.toISOString()).toBe('2026-04-01T10:00:00.000Z');
  });

  it('falls back to created_at when completed_at and updated_at are missing', () => {
    const gift = {
      gift_status: 'completed',
      created_at: '2026-02-01T10:00:00Z'
    };
    const result = getGiftCompletedAt(gift);
    expect(result.toISOString()).toBe('2026-02-01T10:00:00.000Z');
  });

  it('returns null for invalid date', () => {
    const gift = { gift_status: 'completed', completed_at: 'not-a-date' };
    expect(getGiftCompletedAt(gift)).toBeNull();
  });
});

describe('isGiftExpiredCompleted', () => {
  it('returns false for inactive gift', () => {
    const gift = { is_active: false, gift_status: 'completed', completed_at: '2026-01-01' };
    expect(isGiftExpiredCompleted(gift)).toBe(false);
  });

  it('returns false for non-completed gift', () => {
    const gift = { is_active: true, gift_status: 'pending' };
    expect(isGiftExpiredCompleted(gift)).toBe(false);
  });

  it('returns true for gift completed more than 1 month ago (default)', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const gift = {
      is_active: true,
      gift_status: 'completed',
      completed_at: '2026-04-01T10:00:00Z'
    };
    expect(isGiftExpiredCompleted(gift, 1, now)).toBe(true);
  });

  it('returns false for gift completed less than 1 month ago', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const gift = {
      is_active: true,
      gift_status: 'completed',
      completed_at: '2026-06-01T10:00:00Z'
    };
    expect(isGiftExpiredCompleted(gift, 1, now)).toBe(false);
  });

  it('respects custom months parameter', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    // 2 months ago = 2026-04-15. completed_at 2026-05-01 is NOT expired for 2 months
    const gift1 = {
      is_active: true,
      gift_status: 'completed',
      completed_at: '2026-05-01T10:00:00Z'
    };
    expect(isGiftExpiredCompleted(gift1, 2, now)).toBe(false);
    // 1 month ago = 2026-05-15. completed_at 2026-05-01 is expired for 1 month
    expect(isGiftExpiredCompleted(gift1, 1, now)).toBe(true);
  });
});

describe('getExpiredActiveGiftIds', () => {
  it('returns empty array for non-array input', () => {
    expect(getExpiredActiveGiftIds(null)).toEqual([]);
    expect(getExpiredActiveGiftIds('not-array')).toEqual([]);
  });

  it('returns empty array when no gifts are expired', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const gifts = [
      { id: 'g1', is_active: true, gift_status: 'completed', completed_at: '2026-06-10T10:00:00Z' },
      { id: 'g2', is_active: true, gift_status: 'completed', completed_at: '2026-06-14T10:00:00Z' }
    ];
    expect(getExpiredActiveGiftIds(gifts, 1, now)).toEqual([]);
  });

  it('returns ids of expired gifts', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const gifts = [
      { id: 'g1', is_active: true, gift_status: 'completed', completed_at: '2026-04-01T10:00:00Z' },
      { id: 'g2', is_active: true, gift_status: 'completed', completed_at: '2026-06-10T10:00:00Z' },
      { id: 'g3', is_active: true, gift_status: 'completed', completed_at: '2026-03-01T10:00:00Z' }
    ];
    expect(getExpiredActiveGiftIds(gifts, 1, now)).toEqual(['g1', 'g3']);
  });
});

describe('markGiftsAsHistory', () => {
  it('returns empty array for non-array input', () => {
    expect(markGiftsAsHistory(null)).toEqual([]);
  });

  it('returns unchanged gifts when no ids to mark', () => {
    const gifts = [{ id: 'g1', is_active: true }, { id: 'g2', is_active: true }];
    expect(markGiftsAsHistory(gifts, [])).toEqual(gifts);
  });

  it('marks specified gifts as inactive', () => {
    const gifts = [
      { id: 'g1', is_active: true, name: 'Gift 1' },
      { id: 'g2', is_active: true, name: 'Gift 2' },
      { id: 'g3', is_active: true, name: 'Gift 3' }
    ];
    const result = markGiftsAsHistory(gifts, ['g1', 'g3']);
    expect(result[0].is_active).toBe(false);
    expect(result[1].is_active).toBe(true);
    expect(result[2].is_active).toBe(false);
  });

  it('does not mutate original objects', () => {
    const gifts = [{ id: 'g1', is_active: true }];
    const result = markGiftsAsHistory(gifts, ['g1']);
    expect(result[0].is_active).toBe(false);
    expect(gifts[0].is_active).toBe(true);
  });
});