import { describe, expect, it } from 'vitest';
import {
  HOME_CAT_THEME,
  HOME_CAT_ASSETS,
  HOME_CAT_POOLS,
  getHomeCatTypeBySeed,
  getHomeCatAsset,
  isHomeCatTheme,
} from '../../src/utils/home-cat-theme.js';

describe('home-cat-theme: constants', () => {
  it('HOME_CAT_THEME is "home-cat"', () => {
    expect(HOME_CAT_THEME).toBe('home-cat');
  });

  it('HOME_CAT_ASSETS has expected keys', () => {
    expect(HOME_CAT_ASSETS).toHaveProperty('uploading');
    expect(HOME_CAT_ASSETS).toHaveProperty('failed');
    expect(HOME_CAT_ASSETS).toHaveProperty('success');
    expect(HOME_CAT_ASSETS).toHaveProperty('like');
    expect(HOME_CAT_ASSETS).toHaveProperty('decor');
    expect(HOME_CAT_ASSETS).toHaveProperty('delete');
    expect(HOME_CAT_ASSETS).toHaveProperty('theme');
    expect(HOME_CAT_ASSETS).toHaveProperty('decorAlt');
    expect(HOME_CAT_ASSETS).toHaveProperty('mobileGap');
    expect(HOME_CAT_ASSETS).toHaveProperty('cardExtra');
  });

  it('HOME_CAT_POOLS has expected pools', () => {
    expect(HOME_CAT_POOLS).toHaveProperty('ambient');
    expect(HOME_CAT_POOLS).toHaveProperty('card');
    expect(HOME_CAT_POOLS).toHaveProperty('background');
    expect(HOME_CAT_POOLS).toHaveProperty('state');
    expect(HOME_CAT_POOLS).toHaveProperty('reaction');
  });
});

describe('home-cat-theme: getHomeCatTypeBySeed', () => {
  it('returns a valid type from ambient pool', () => {
    const result = getHomeCatTypeBySeed('test-seed');
    expect(HOME_CAT_POOLS.ambient).toContain(result);
  });

  it('returns consistent result for same seed', () => {
    const a = getHomeCatTypeBySeed('consistent-seed', 'ambient');
    const b = getHomeCatTypeBySeed('consistent-seed', 'ambient');
    expect(a).toBe(b);
  });

  it('returns different results for different seeds', () => {
    const results = new Set();
    for (let i = 0; i < 50; i++) {
      results.add(getHomeCatTypeBySeed(`seed-${i}`, 'ambient'));
    }
    // Should produce at least 2 different types
    expect(results.size).toBeGreaterThanOrEqual(2);
  });

  it('uses specified pool', () => {
    const result = getHomeCatTypeBySeed('test', 'state');
    expect(HOME_CAT_POOLS.state).toContain(result);
  });

  it('falls back to ambient pool for unknown pool name', () => {
    const result = getHomeCatTypeBySeed('test', 'nonexistent');
    expect(HOME_CAT_POOLS.ambient).toContain(result);
  });

  it('excludes specified types', () => {
    const pool = HOME_CAT_POOLS.ambient;
    // Exclude all but one type
    const exclude = pool.slice(0, pool.length - 1);
    const result = getHomeCatTypeBySeed('test', 'ambient', { exclude });
    expect(result).toBe(pool[pool.length - 1]);
  });

  it('uses full pool when all types excluded', () => {
    const result = getHomeCatTypeBySeed('test', 'ambient', {
      exclude: HOME_CAT_POOLS.ambient,
    });
    expect(HOME_CAT_POOLS.ambient).toContain(result);
  });
});

describe('home-cat-theme: getHomeCatAsset', () => {
  it('returns asset for valid type', () => {
    const asset = getHomeCatAsset('decor');
    expect(asset).toBeDefined();
    expect(typeof asset).toBe('string');
  });

  it('falls back to decor for unknown type', () => {
    const asset = getHomeCatAsset('nonexistent');
    expect(asset).toBe(HOME_CAT_ASSETS.decor);
  });

  it('returns decor for empty type', () => {
    const asset = getHomeCatAsset('');
    expect(asset).toBe(HOME_CAT_ASSETS.decor);
  });
});

describe('home-cat-theme: isHomeCatTheme', () => {
  it('returns true for home-cat theme', () => {
    expect(isHomeCatTheme('home-cat')).toBe(true);
  });

  it('returns false for other themes', () => {
    expect(isHomeCatTheme('dark')).toBe(false);
    expect(isHomeCatTheme('light')).toBe(false);
    expect(isHomeCatTheme('')).toBe(false);
  });
});