import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatSmartTime } from '../../src/utils/time.js';

describe('formatSmartTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for empty input', () => {
    expect(formatSmartTime('')).toBe('');
  });

  it('formats recent time as 刚刚', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00+08:00'));
    expect(formatSmartTime(new Date(Date.now() - 30 * 1000).toISOString())).toBe('刚刚');
  });

  it('formats minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00+08:00'));
    expect(formatSmartTime(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5分钟前');
  });

  it('formats two days ago as 前天', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00+08:00'));
    expect(formatSmartTime(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()).startsWith('前天')).toBe(true);
  });
});
