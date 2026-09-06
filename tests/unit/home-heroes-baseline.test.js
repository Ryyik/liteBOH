import { describe, expect, it } from 'vitest';
import { HOME_HERO_BASELINE } from '../../src/stores/homeHeroes.ts';

describe('home hero baseline', () => {
  it('renders the published builtin heroes before the remote configuration returns', () => {
    expect(HOME_HERO_BASELINE.map((hero) => hero.builtin_key)).toEqual([
      'mascot-new',
      'agent-preview',
      'birthday',
      'block-wall',
      'anniversary-8',
      'cloud-cafe',
      'fuzhou',
      'special-custom',
      'split-brand-letter'
    ]);
    expect(HOME_HERO_BASELINE.every((hero) => (
      hero.template === 'builtin' && hero.status === 'published' && !hero.is_archived
    ))).toBe(true);
  });
});
