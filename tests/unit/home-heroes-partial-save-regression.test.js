import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

// 源码文本型守卫必须先剥离块注释，只看生效代码
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('home hero partial-save regression', () => {
  it('does not clear image configuration during a sort-only update', () => {
    const source = read('src/stores/homeHeroes.ts');
    const saveHeroSource = source.slice(
      source.indexOf('const saveHero ='),
      source.indexOf('// 发布英雄区')
    );

    // saveHero 已重构为 editableFields 循环 + showcase_config 非空守卫，
    // 部分保存语义不变：未传字段不得写入，showcase_config 禁止写 null。
    expect(saveHeroSource).toContain('if (payload[field] !== undefined) {');
    expect(saveHeroSource).toContain(
      "updatePayload[field] = field === 'showcase_config' && payload[field] == null"
    );
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

  // 行级延迟渲染已整体移除（is-deferred 占位 + IntersectionObserver + 空闲预热）：
  // 占位高度与真实高度有 100~300px 漂移，滚动中页面总高反复变化（实测 6097→6402→6277），
  // 且 content-visibility:auto 在 iOS Safari 触发 WebKit bug 321501（行进视口后保持
  // 过期的零高度布局、不自愈，程序化 scrollTo 不复现）。现改为全部行从首帧直接渲染
  // （7 行静态模板的 DOM 构建成本仅几 ms），排序后新首行不再有"未渲染"中间态，
  // 原回归场景在结构上已不可能发生。此用例转为防回归守卫。
  // 注意：守卫必须先剥离注释——组件顶部注释正是"解释为什么不用这些机制"，
  // 直接匹配原文会把解释性提及误判成违规实现。
  it('renders every hero row eagerly (no row-level virtualization)', () => {
    const source = stripCssComments(read('src/views/Home/components/HomeHeroRow.vue'));

    expect(source).not.toContain('content-visibility');
    expect(source).not.toContain('IntersectionObserver');
    expect(source).not.toContain('is-deferred');
    expect(source).not.toMatch(/watch\(\(\) => props\.eager/);
  });
});
