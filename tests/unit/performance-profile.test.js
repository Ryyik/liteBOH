import { describe, expect, it } from 'vitest';
import { applyPerformanceProfile, getPerformanceProfile } from '../../src/utils/performance-profile.js';

describe('performance profile', () => {
  it('selects lite mode for data-saving and constrained devices', () => {
    expect(getPerformanceProfile({ connection: { saveData: true } }).lite).toBe(true);
    expect(getPerformanceProfile({ deviceMemory: 2, hardwareConcurrency: 2 }).lite).toBe(true);
    expect(getPerformanceProfile({ deviceMemory: 4, hardwareConcurrency: 4 }).lite).toBe(false);
    expect(getPerformanceProfile({ deviceMemory: 8, hardwareConcurrency: 8 }).lite).toBe(false);
  });

  it('applies profile attributes before rendering', () => {
    const root = {
      classList: {
        toggle: (name, value) => { root[name] = value; },
        add: (name) => { root[name] = true; },
      },
      dataset: {},
    };
    const profile = applyPerformanceProfile({
      navigator: { connection: { saveData: true } },
      document: { documentElement: root },
      matchMedia: () => ({ matches: false }),
    });
    expect(profile.lite).toBe(true);
    expect(root['boh-perf-lite']).toBe(true);
    expect(root.dataset.performanceProfile).toBe('lite');
  });
});
