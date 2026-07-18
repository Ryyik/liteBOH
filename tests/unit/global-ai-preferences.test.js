import { describe, expect, it } from 'vitest';

import { matchesGlobalAiShortcut } from '../../src/composables/useGlobalAiPreferences.js';

describe('global AI shortcut matching', () => {
  it('matches Mod+K on Ctrl and Command keyboards', () => {
    expect(matchesGlobalAiShortcut({ key: 'k', ctrlKey: true }, 'mod+k')).toBe(true);
    expect(matchesGlobalAiShortcut({ key: 'K', metaKey: true }, 'mod+k')).toBe(true);
  });

  it('supports alternative shortcuts without cross-matching', () => {
    expect(matchesGlobalAiShortcut({ key: 'j', metaKey: true }, 'mod+j')).toBe(true);
    expect(matchesGlobalAiShortcut({ key: ' ', ctrlKey: true }, 'mod+space')).toBe(true);
    expect(matchesGlobalAiShortcut({ key: 'k', ctrlKey: true }, 'mod+j')).toBe(false);
  });

  it('requires a platform modifier', () => {
    expect(matchesGlobalAiShortcut({ key: 'k' }, 'mod+k')).toBe(false);
  });
});
