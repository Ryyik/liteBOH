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

    expect(source).toContain('homeHeroesStore.reorderHeroes(orderedIds)');
    expect(source).toContain('drafts[id].sort_order = order');
  });

  it('remounts moved hero rows so image nodes are not reused after sorting', () => {
    const source = read('src/views/Home/index.vue');

    expect(source).toContain(":key=\"(hero.template === 'builtin' ? 'builtin:' + hero.builtin_key : hero.id) + ':' + hero.sort_order\"");
  });

  it('renders a row when it becomes the eager first hero after sorting', () => {
    const source = read('src/views/Home/components/HomeHeroRow.vue');

    expect(source).toContain("watch(() => props.eager, (eager) => {");
    expect(source).toContain('if (eager) shouldRender.value = true;');
  });
});
