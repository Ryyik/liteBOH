import { describe, expect, it } from 'vitest';
import {
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

  it('归一化：脏值 / 空值 / 大小写混写一律回落 banner', () => {
    expect(normalizeCardLayout(undefined)).toBe(PRODUCT_CARD_LAYOUT.BANNER);
    expect(normalizeCardLayout(null)).toBe(PRODUCT_CARD_LAYOUT.BANNER);
    expect(normalizeCardLayout('')).toBe(PRODUCT_CARD_LAYOUT.BANNER);
    expect(normalizeCardLayout('huge')).toBe(PRODUCT_CARD_LAYOUT.BANNER);
    expect(normalizeCardLayout('SMALL')).toBe(PRODUCT_CARD_LAYOUT.BANNER);
  });

  it('归一化前会 trim：库里带空格的值不该被当成脏值', () => {
    expect(normalizeCardLayout('  large  ')).toBe(PRODUCT_CARD_LAYOUT.LARGE);
  });

  it('循环顺序 small → banner → large → small（点一次换一档）', () => {
    expect(nextCardLayout('small')).toBe('banner');
    expect(nextCardLayout('banner')).toBe('large');
    expect(nextCardLayout('large')).toBe('small');
    // 从脏值出发也应回到正常循环，而不是卡在某一档
    expect(nextCardLayout('nope')).toBe('large');
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
    expect(cardLayoutLabel(undefined)).toBe('横幅');
  });
});
