import { describe, expect, it } from 'vitest';
import { getNextBirthdayDistance, isBirthdayToday, normalizeBirthday } from '../../src/utils/birthday.js';

describe('birthday utilities', () => {
  it('normalizes valid birthday strings', () => {
    expect(normalizeBirthday('5', '15')).toEqual({ month: 5, day: 15 });
  });

  it('rejects impossible dates', () => {
    expect(normalizeBirthday('2', '31')).toBeNull();
    expect(normalizeBirthday('13', '1')).toBeNull();
  });

  it('detects the current birthday', () => {
    const today = new Date('2026-05-15T10:30:00+08:00');
    expect(isBirthdayToday('5', '15', today)).toBe(true);
    expect(isBirthdayToday('5', '16', today)).toBe(false);
  });

  it('calculates the next birthday distance', () => {
    const today = new Date('2026-05-15T10:30:00+08:00');
    expect(getNextBirthdayDistance('5', '15', today)?.daysUntil).toBe(0);
    expect(getNextBirthdayDistance('5', '16', today)?.daysUntil).toBe(1);
    expect(getNextBirthdayDistance('5', '14', today)?.daysUntil).toBe(364);
  });
});
