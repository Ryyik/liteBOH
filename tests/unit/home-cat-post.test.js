import { describe, expect, it } from 'vitest';

import {
  getPostBackgroundCatSrc,
  getPostCardCatSeed,
  getPostCardCatSrc,
  getPostCardCatType,
  getPostCardCatVariant,
  shouldShowPostBackgroundCat,
} from '../../src/utils/home-cat-post.js';

// 这 6 个函数原本在 PostCard.vue 与 ProfileMain.vue 各存一份、逐字节相同（2026-09-29 合并）。
// 合并前它们躺在 SFC 内部，测试够不着 —— 本文件就是「搬出来之后才有能力锁住」的那部分收益：
// 以后任何一次改动若让两边行为分叉，这里会红，而不是等到用户发现两个页面的帖子卡不一样。
describe('getPostCardCatType：已点赞或赞数 ≥8 用 like，否则按 index 轮转', () => {
  it('已点赞 → like（优先于轮转）', () => {
    expect(getPostCardCatType(0, { isLiked: true })).toBe('like');
    expect(getPostCardCatType(3, { isLiked: true, like_count: 0 })).toBe('like');
  });

  it('赞数 ≥ 8 → like', () => {
    expect(getPostCardCatType(0, { like_count: 8 })).toBe('like');
    expect(getPostCardCatType(0, { like_count: 99 })).toBe('like');
  });

  it('赞数 7 不触发 like', () => {
    expect(getPostCardCatType(0, { like_count: 7 })).not.toBe('like');
  });

  it('按 index % 5 轮转，且 5 个位置互不相同', () => {
    const pool = ['decorAlt', 'decor', 'theme', 'cardExtra', 'mobileGap'];
    pool.forEach((expected, index) => {
      expect(getPostCardCatType(index, {})).toBe(expected);
    });
    expect(new Set(pool.map((_, i) => getPostCardCatType(i, {}))).size).toBe(5);
  });

  it('index ≥5 回绕，字符串 index 也能解析', () => {
    expect(getPostCardCatType(5, {})).toBe(getPostCardCatType(0, {}));
    expect(getPostCardCatType('2', {})).toBe('theme');
  });

  it('index 缺失时返回 undefined —— 这是**原函数的既有行为**，搬迁时刻意保留', () => {
    // Number(undefined) === NaN，NaN % 5 === NaN，数组取 NaN 索引得 undefined。
    // 搬迁（PostCard.vue / ProfileMain.vue → 本模块）时逐字节照搬，**没有顺手"修好"它**：
    // 本次目标是零行为变更，任何行为改动都要单独评估。
    // 实际调用点都是 v-for 的 index，永远是真数字，所以线上不会触发。
    // 若将来要收紧，应作为独立改动（并同步评估调用方），不要混在"搬迁"里做。
    expect(getPostCardCatType(undefined, {})).toBeUndefined();
  });
});

describe('getPostCardCatVariant：4 档循环类名', () => {
  it('是 cat-variant-N 且 N 在 0..3', () => {
    for (let i = 0; i < 12; i += 1) {
      const variant = getPostCardCatVariant(i);
      expect(variant).toMatch(/^cat-variant-[0-3]$/);
      expect(variant).toBe(`cat-variant-${i % 4}`);
    }
  });
});

describe('getPostCardCatSeed：同一帖子必须得到同一个 seed', () => {
  it('优先用 post.id', () => {
    expect(getPostCardCatSeed({ id: 'p1' }, 0)).toBe('p1:card');
    expect(getPostCardCatSeed({ id: 'p1' }, 7)).toBe('p1:card');
  });

  it('没有 id 时回落到 index', () => {
    expect(getPostCardCatSeed({}, 3)).toBe('3:card');
    expect(getPostCardCatSeed(null, 3)).toBe('3:card');
  });

  it('suffix 可区分卡片猫与背景猫', () => {
    expect(getPostCardCatSeed({ id: 'p1' }, 0, 'bg')).toBe('p1:bg');
  });
});

describe('getPostCardCatSrc / getPostBackgroundCatSrc：返回可用资源且稳定', () => {
  it('两者都返回非空字符串', () => {
    const card = getPostCardCatSrc({ id: 'p1' }, 0);
    const bg = getPostBackgroundCatSrc({ id: 'p1' }, 0);
    expect(typeof card).toBe('string');
    expect(typeof bg).toBe('string');
    expect(card.length).toBeGreaterThan(0);
    expect(bg.length).toBeGreaterThan(0);
  });

  it('同一帖子重复调用结果稳定（不会每次渲染换一只猫）', () => {
    expect(getPostBackgroundCatSrc({ id: 'p1' }, 2)).toBe(getPostBackgroundCatSrc({ id: 'p1' }, 2));
    expect(getPostCardCatSrc({ id: 'p1' }, 2)).toBe(getPostCardCatSrc({ id: 'p1' }, 2));
  });

  it('不同帖子能取到不同的背景猫（背景池确实按 seed 打散）', () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => getPostBackgroundCatSrc({ id: `post-${i}` }, i)),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('shouldShowPostBackgroundCat：约 1/3 的卡片出现背景猫', () => {
  it('对同一输入是确定性的（纯函数）', () => {
    expect(shouldShowPostBackgroundCat({ id: 'p1' }, 0)).toBe(
      shouldShowPostBackgroundCat({ id: 'p1' }, 0),
    );
  });

  it('40 个连续 id 的命中数落在合理区间（不是恒真也不是恒假）', () => {
    const hits = Array.from({ length: 40 }, (_, i) =>
      shouldShowPostBackgroundCat({ id: `post-${i}` }, i),
    ).filter(Boolean).length;
    expect(hits).toBeGreaterThan(3);
    expect(hits).toBeLessThan(37);
  });

  it('没有 id 时用 index，且不抛错', () => {
    expect(typeof shouldShowPostBackgroundCat({}, 1)).toBe('boolean');
    expect(typeof shouldShowPostBackgroundCat(null, 1)).toBe('boolean');
  });
});
