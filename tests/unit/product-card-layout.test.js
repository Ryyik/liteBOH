import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CARD_LAYOUT,
  PRODUCT_CARD_LAYOUT,
  PRODUCT_CARD_LAYOUT_OPTIONS,
  cardLayoutLabel,
  nextCardLayout,
  normalizeCardLayout,
} from '../../src/config/product-card-layout.js';

/**
 * 商品卡片形态档位的单一真源。
 *
 * 这几个函数的「错法」都很安静：脏值回落不生效 → 卡片变成没有 layout 类的裸卡；
 * 循环顺序写错 → 点「尺寸」胶囊时来回跳同一档。都是肉眼要试半天才发现的那种，
 * 所以在源码层先钉住。
 */
describe('product-card-layout', () => {
  it('归一化：合法的三档原样返回', () => {
    expect(normalizeCardLayout('small')).toBe(PRODUCT_CARD_LAYOUT.SMALL);
    expect(normalizeCardLayout('banner')).toBe(PRODUCT_CARD_LAYOUT.BANNER);
    expect(normalizeCardLayout('large')).toBe(PRODUCT_CARD_LAYOUT.LARGE);
  });

  /* 默认档是「新建商品长什么样」这件事的唯一真源。2026-11-10 它从 banner 改成
     small；如果只改了 DB 的列默认值、忘了这里，后台新增出来的商品仍会是横幅。 */
  it('默认档是小卡，且脏值 / 空值一律回落到它', () => {
    expect(DEFAULT_CARD_LAYOUT).toBe(PRODUCT_CARD_LAYOUT.SMALL);
    expect(normalizeCardLayout(undefined)).toBe(DEFAULT_CARD_LAYOUT);
    expect(normalizeCardLayout(null)).toBe(DEFAULT_CARD_LAYOUT);
    expect(normalizeCardLayout('')).toBe(DEFAULT_CARD_LAYOUT);
    expect(normalizeCardLayout('huge')).toBe(DEFAULT_CARD_LAYOUT);
    // 大小写混写不算合法值：DB 的 check 也只认全小写
    expect(normalizeCardLayout('SMALL')).toBe(DEFAULT_CARD_LAYOUT);
  });

  it('归一化前会 trim：库里带空格的值不该被当成脏值', () => {
    expect(normalizeCardLayout('  large  ')).toBe(PRODUCT_CARD_LAYOUT.LARGE);
  });

  it('循环顺序 small → banner → large → small（点一次换一档）', () => {
    expect(nextCardLayout('small')).toBe('banner');
    expect(nextCardLayout('banner')).toBe('large');
    expect(nextCardLayout('large')).toBe('small');
    // 从脏值出发也应回到正常循环（先归一化成默认档 small，再进下一档）
    expect(nextCardLayout('nope')).toBe('banner');
  });

  it('三档选项与短标签一一对应（选项漏一档会让后台下拉框少一项）', () => {
    expect(PRODUCT_CARD_LAYOUT_OPTIONS.map((item) => item.value)).toEqual([
      'small',
      'banner',
      'large',
    ]);
    expect(cardLayoutLabel('small')).toBe('小卡');
    expect(cardLayoutLabel('banner')).toBe('横幅');
    expect(cardLayoutLabel('large')).toBe('大图');
    expect(cardLayoutLabel(undefined)).toBe('小卡');
  });
});
