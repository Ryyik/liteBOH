import { describe, expect, it } from 'vitest';
import {
  getNextBirthdayDistance,
  isBirthdayToday,
  normalizeBirthday,
} from '../../src/utils/birthday.js';

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

  /* 「今天」的判据是**北京时间**，与 /birthday 页、boh_enqueue_birthday_mails() 同口径。
     反证：这条在 UTC 机器上跑，若实现退回设备本地时区，getDate() 会得到 15 日 ⇒ 必红。 */
  it('按北京时间判「今天」，不随设备时区漂移', () => {
    // 北京时间 5/16 00:30 == UTC 5/15 16:30
    const shanghaiAfterMidnight = new Date('2026-05-16T00:30:00+08:00');
    expect(isBirthdayToday('5', '16', shanghaiAfterMidnight)).toBe(true);
    expect(isBirthdayToday('5', '15', shanghaiAfterMidnight)).toBe(false);
  });

  it('calculates the next birthday distance', () => {
    const today = new Date('2026-05-15T10:30:00+08:00');
    expect(getNextBirthdayDistance('5', '15', today)?.daysUntil).toBe(0);
    expect(getNextBirthdayDistance('5', '16', today)?.daysUntil).toBe(1);
    expect(getNextBirthdayDistance('5', '14', today)?.daysUntil).toBe(364);
  });
});
