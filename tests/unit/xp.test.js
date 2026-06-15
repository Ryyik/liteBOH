import { describe, it, expect } from 'vitest';
import { getLevelInfo, XP_REWARDS } from '../../src/utils/xp.js';

describe('getLevelInfo', () => {
  it('returns level 1 with 0 progress for 0 XP', () => {
    const result = getLevelInfo(0);
    expect(result.level).toBe(1);
    expect(result.currentLevelXP).toBe(0);
    expect(result.nextLevelXP).toBe(100);
    expect(result.progress).toBe(0);
    expect(result.totalXP).toBe(0);
  });

  it('returns level 1 for XP less than 100', () => {
    const result = getLevelInfo(50);
    expect(result.level).toBe(1);
    expect(result.currentLevelXP).toBe(50);
    expect(result.nextLevelXP).toBe(100);
    expect(result.progress).toBe(50);
  });

  it('returns level 2 for exactly 100 XP', () => {
    const result = getLevelInfo(100);
    expect(result.level).toBe(2);
    expect(result.currentLevelXP).toBe(0);
    expect(result.nextLevelXP).toBe(200);
    expect(result.progress).toBe(0);
  });

  it('returns level 2 with partial progress for 150 XP', () => {
    const result = getLevelInfo(150);
    expect(result.level).toBe(2);
    expect(result.currentLevelXP).toBe(50);
    expect(result.nextLevelXP).toBe(200);
    expect(result.progress).toBe(25);
  });

  it('handles level 3 correctly (100 + 200 = 300 XP needed)', () => {
    const result = getLevelInfo(300);
    expect(result.level).toBe(3);
    expect(result.currentLevelXP).toBe(0);
    expect(result.nextLevelXP).toBe(300);
  });

  it('handles level 5 (100+200+300+400 = 1000 XP needed)', () => {
    const result = getLevelInfo(1000);
    expect(result.level).toBe(5);
    expect(result.currentLevelXP).toBe(0);
    expect(result.nextLevelXP).toBe(500);
  });

  it('progress never exceeds 100', () => {
    const result = getLevelInfo(299);
    expect(result.level).toBe(2);
    expect(result.progress).toBeLessThanOrEqual(100);
  });

  it('handles very large XP values', () => {
    const result = getLevelInfo(100000);
    expect(result.level).toBeGreaterThan(10);
    expect(result.progress).toBeLessThanOrEqual(100);
  });

  it('handles negative XP gracefully', () => {
    const result = getLevelInfo(-50);
    expect(result.level).toBe(1);
    expect(result.currentLevelXP).toBe(-50);
    expect(result.totalXP).toBe(-50);
  });

  it('handles non-integer XP', () => {
    const result = getLevelInfo(50.7);
    expect(result.level).toBe(1);
    expect(result.totalXP).toBe(50.7);
  });
});

describe('XP_REWARDS', () => {
  it('defines all reward types', () => {
    expect(XP_REWARDS).toHaveProperty('POST');
    expect(XP_REWARDS).toHaveProperty('REPLY');
    expect(XP_REWARDS).toHaveProperty('LIKE');
    expect(XP_REWARDS).toHaveProperty('BE_LIKED');
  });

  it('POST reward is greater than REPLY reward', () => {
    expect(XP_REWARDS.POST).toBeGreaterThan(XP_REWARDS.REPLY);
  });

  it('BE_LIKED reward is greater than LIKE reward', () => {
    expect(XP_REWARDS.BE_LIKED).toBeGreaterThan(XP_REWARDS.LIKE);
  });
});