import { describe, expect, it } from 'vitest';
import {
  PAYMENT_MODE_OPTIONS,
  buildPricePatch,
  centsToYuanInput,
  formatPriceDisplay,
  normalizePaymentMode,
  parsePointsCost,
  parseRmbYuanToCents,
  paymentModeLabel,
  validatePricePatch,
} from '../../src/utils/product-pricing.js';

/**
 * 商品定价：三档支付方式 + 元/分换算 + 与 DB 同源的校验。
 *
 * 这一组测试守的是「用户看到的价」与「库里存的价」不能分叉：
 *   · 单位混了（元当分存）→ 9.90 元的商品实收 990 元；
 *   · 校验漏了 → 保存时弹一句英文约束名 `chk_products_points_required`；
 *   · 切模式没清价 → 卡片上显示「纯积分 ¥9.90」这种自相矛盾的文案。
 * 三种都不会崩，只会**安静地错**，所以必须在源码层钉住。
 */
describe('product-pricing', () => {
  it('三档支付方式与 DB check 白名单一致', () => {
    expect(PAYMENT_MODE_OPTIONS.map((item) => item.value)).toEqual([
      'points_only',
      'rmb_only',
      'combined',
    ]);
    expect(paymentModeLabel('rmb_only')).toBe('纯现金');
  });

  it('支付方式脏值回落纯积分（与 DB 列默认值同口径）', () => {
    expect(normalizePaymentMode(undefined)).toBe('points_only');
    expect(normalizePaymentMode('')).toBe('points_only');
    expect(normalizePaymentMode('RMB_ONLY')).toBe('points_only');
    expect(normalizePaymentMode('combined')).toBe('combined');
  });

  it('积分：非正数一律归 0（列是 NOT NULL，不能给 null）', () => {
    expect(parsePointsCost('200')).toBe(200);
    expect(parsePointsCost(12.6)).toBe(13);
    expect(parsePointsCost('')).toBe(0);
    expect(parsePointsCost('abc')).toBe(0);
    expect(parsePointsCost(-5)).toBe(0);
    expect(parsePointsCost(null)).toBe(0);
  });

  it('元 → 分：9.90 元存 990 分，空/非法一律 null（未定价）', () => {
    expect(parseRmbYuanToCents('9.9')).toBe(990);
    expect(parseRmbYuanToCents('9.99')).toBe(999);
    expect(parseRmbYuanToCents('0.01')).toBe(1);
    expect(parseRmbYuanToCents('')).toBeNull();
    expect(parseRmbYuanToCents('0')).toBeNull();
    expect(parseRmbYuanToCents('abc')).toBeNull();
    expect(parseRmbYuanToCents(null)).toBeNull();
  });

  it('分 → 元输入框显示（去掉整元的小数尾巴，避免「10.00」看着像必填两位）', () => {
    expect(centsToYuanInput(990)).toBe('9.90');
    expect(centsToYuanInput(1000)).toBe('10');
    expect(centsToYuanInput(0)).toBe('');
    expect(centsToYuanInput(null)).toBe('');
  });

  it('切模式清掉不属于该模式的价（否则卡片文案自相矛盾）', () => {
    const onlyPoints = buildPricePatch({
      mode: 'points_only',
      points: '200',
      rmbYuan: '9.90',
      purchasable: true,
    });
    expect(onlyPoints).toEqual({
      payment_mode: 'points_only',
      points_cost: 200,
      rmb_price: null,
      is_purchasable: true,
    });

    const onlyRmb = buildPricePatch({
      mode: 'rmb_only',
      points: '200',
      rmbYuan: '9.90',
      purchasable: true,
    });
    expect(onlyRmb).toEqual({
      payment_mode: 'rmb_only',
      points_cost: 0,
      rmb_price: 990,
      is_purchasable: true,
    });

    const combined = buildPricePatch({
      mode: 'combined',
      points: '200',
      rmbYuan: '9.90',
      purchasable: true,
    });
    expect(combined).toEqual({
      payment_mode: 'combined',
      points_cost: 200,
      rmb_price: 990,
      is_purchasable: true,
    });
  });

  it('校验：0 价 + 勾允许购买必须被拦住（镜像 chk_products_* 两条 CHECK）', () => {
    const zeroPoints = buildPricePatch({
      mode: 'points_only',
      points: '0',
      rmbYuan: '',
      purchasable: true,
    });
    expect(validatePricePatch(zeroPoints)).not.toBe('');

    const zeroRmb = buildPricePatch({
      mode: 'rmb_only',
      points: '',
      rmbYuan: '',
      purchasable: true,
    });
    expect(validatePricePatch(zeroRmb)).not.toBe('');
  });

  it('校验：0 价但关掉「允许购买」是合法的（新建商品的初始状态就是它）', () => {
    const draft = buildPricePatch({
      mode: 'points_only',
      points: '0',
      rmbYuan: '',
      purchasable: false,
    });
    expect(validatePricePatch(draft)).toBe('');
  });

  it('校验：混合模式要求两边都有价（DB 不管，但前台会判成不可购买）', () => {
    const halfFilled = buildPricePatch({
      mode: 'combined',
      points: '200',
      rmbYuan: '',
      purchasable: true,
    });
    expect(validatePricePatch(halfFilled)).toContain('现金价');

    const ok = buildPricePatch({
      mode: 'combined',
      points: '200',
      rmbYuan: '9.90',
      purchasable: true,
    });
    expect(validatePricePatch(ok)).toBe('');
  });

  it('展示口径：积分 + 现金并列，没有价时说「暂无报价」而不是 ¥0.00', () => {
    expect(formatPriceDisplay({ points_cost: 200, rmb_price: null })).toBe('200 积分');
    expect(formatPriceDisplay({ points_cost: 200, rmb_price: 990 })).toBe('200 积分 + ¥9.90');
    expect(formatPriceDisplay({ points_cost: 0, rmb_price: 990 })).toBe('¥9.90');
    expect(formatPriceDisplay({ points_cost: 0, rmb_price: null })).toBe('暂无报价');
  });
});
