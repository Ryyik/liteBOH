import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('home hero partial-save regression', () => {
  it('does not clear image configuration during a sort-only update', () => {
    const source = read('src/stores/homeHeroes.ts');
    const saveHeroSource = source.slice(
      source.indexOf('const saveHero ='),
      source.indexOf('// 发布英雄区')
    );

    expect(saveHeroSource).toContain('if (payload[field] !== undefined) updatePayload[field] = payload[field]');
    expect(saveHeroSource).not.toContain('image_config: payload.image_config || {}');
  });

  it('keeps cached editor drafts aligned with a successful reorder', () => {
    const source = read('src/views/HeroConsole/index.vue');

    expect(source).toContain('drafts[current.id].sort_order = targetOrder');
    expect(source).toContain('drafts[target.id].sort_order = currentOrder');
  });
});
