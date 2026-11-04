/**
 * 结算单计算与预检（2026-11-03）
 *
 * 这套断言的来历：确认订单页的金额与「能不能提交」全部由 buildCheckoutSummary 决定，
 * 它算错一次就是钱的事故（显示 ¥11.90、实扣 ¥13.90）。所以每条规则都锁一遍：
 *   · 实时价 > 快照价（服务端下单按 products 重算，前端不能自己另算一套）；
 *   · 下架 / 售罄 / 超库存 / 积分不足 —— 必须是 block，且在 removableKeys 里能定位到行；
 *   · 价格变动只 warn，不拦提交。
 */
import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_ISSUE,
  buildCheckoutSummary,
  buildPaymentSummary,
  formatPriceText,
  lineIssueLabel,
} from '@/views/Shop/checkout-summary.js';

const bagItem = (over = {}) => ({
  id: 1,
  title: '围巾小狗',
  image: 'dog.webp',
  selectedSpec: 's1',
  selectedSpecLabel: '默认规格',
  quantity: 1,
  points_cost: 45,
  rmb_price: 690,
  payment_mode: 'combined',
  ...over,
});

const product = (over = {}) => ({
  id: 1,
  title: '围巾小狗',
  points_cost: 45,
  rmb_price: 690,
  payment_mode: 'combined',
  stock: 10,
  is_purchasable: true,
  ...over,
});

describe('buildCheckoutSummary', () => {
  it('组合支付：积分与现金分别合计，总计文案两段都要有', () => {
    const summary = buildCheckoutSummary({
      bagItems: [bagItem({ quantity: 2 })],
      products: [product()],
      pointsBalance: 200,
    });
    expect(summary.totalPoints).toBe(90);
    expect(summary.totalCents).toBe(1380);
    expect(summary.totalText).toBe('90 积分 + ¥13.80');
    expect(summary.remainingPoints).toBe(110);
    expect(summary.canSubmit).toBe(true);
  });

  it('实时价覆盖快照价：快照 690 → 实时 990 时按 990 计，并给出 PRICE_CHANGED 提醒', () => {
    const summary = buildCheckoutSummary({
      bagItems: [bagItem()],
      products: [product({ rmb_price: 990 })],
      pointsBalance: 500,
    });
    expect(summary.totalCents).toBe(990);
    expect(summary.priceChanged).toBe(true);
    expect(summary.issues.map((issue) => issue.code)).toContain(CHECKOUT_ISSUE.PRICE_CHANGED);
    // 只是提醒，不拦提交
    expect(summary.blocking).toBe(false);
    expect(summary.canSubmit).toBe(true);
  });

  it('商品已下架：拦截提交，且该行进 removableKeys', () => {
    const summary = buildCheckoutSummary({
      bagItems: [bagItem()],
      products: [],
      pointsBalance: 500,
    });
    expect(summary.blocking).toBe(true);
    expect(summary.canSubmit).toBe(false);
    expect(summary.removableKeys).toEqual(['1-s1']);
    // 下架时仍显示当时的价格，不是 0
    expect(summary.lines[0].priceText).toBe('45 积分 + ¥6.90');
    expect(lineIssueLabel(summary.lines[0])).toBe('已下架');
  });

  it('售罄拦截；数量超库存拦截并写明剩余件数', () => {
    const soldOut = buildCheckoutSummary({
      bagItems: [bagItem()],
      products: [product({ stock: 0 })],
      pointsBalance: 500,
    });
    expect(soldOut.blocking).toBe(true);
    expect(lineIssueLabel(soldOut.lines[0])).toBe('已售罄');

    const over = buildCheckoutSummary({
      bagItems: [bagItem({ quantity: 3 })],
      products: [product({ stock: 2 })],
      pointsBalance: 500,
    });
    expect(over.blocking).toBe(true);
    expect(lineIssueLabel(over.lines[0])).toBe('仅剩 2 件');
    expect(over.issues.some((issue) => issue.code === CHECKOUT_ISSUE.OVER_STOCK)).toBe(true);
  });

  it('积分不足：拦截，并给出还差多少', () => {
    const summary = buildCheckoutSummary({
      bagItems: [bagItem({ quantity: 2 })],
      products: [product()],
      pointsBalance: 50,
    });
    expect(summary.insufficientPoints).toBe(true);
    expect(summary.blocking).toBe(true);
    const issue = summary.issues.find((item) => item.code === CHECKOUT_ISSUE.INSUFFICIENT_POINTS);
    expect(issue.message).toBe('积分不足，还差 40');
  });

  it('纯现金商品不消耗积分', () => {
    const summary = buildCheckoutSummary({
      bagItems: [bagItem({ payment_mode: 'rmb_only', points_cost: 0, rmb_price: 500 })],
      products: [product({ payment_mode: 'rmb_only', points_cost: 0, rmb_price: 500 })],
      pointsBalance: 0,
    });
    expect(summary.totalPoints).toBe(0);
    expect(summary.totalCents).toBe(500);
    expect(summary.blocking).toBe(false);
    expect(summary.totalText).toBe('¥5.00');
  });

  it('纯积分商品不产生现金', () => {
    const summary = buildCheckoutSummary({
      bagItems: [bagItem({ payment_mode: 'points_only', rmb_price: null })],
      products: [product({ payment_mode: 'points_only', rmb_price: null })],
      pointsBalance: 100,
    });
    expect(summary.totalPoints).toBe(45);
    expect(summary.totalCents).toBe(0);
    expect(summary.totalText).toBe('45 积分');
  });

  it('空购物袋：拦截且不可提交', () => {
    const summary = buildCheckoutSummary({ bagItems: [], products: [], pointsBalance: 0 });
    expect(summary.canSubmit).toBe(false);
    expect(summary.issues[0].code).toBe(CHECKOUT_ISSUE.EMPTY_BAG);
  });

  it('地址未就绪：只提醒、不判 block', () => {
    const summary = buildCheckoutSummary({
      bagItems: [bagItem()],
      products: [product()],
      pointsBalance: 500,
      addressReady: false,
    });
    expect(summary.blocking).toBe(false);
    expect(summary.canSubmit).toBe(false);
    expect(summary.issues.some((issue) => issue.code === CHECKOUT_ISSUE.MISSING_ADDRESS)).toBe(
      true,
    );
  });
});

describe('文案工具', () => {
  it('formatPriceText 空值回落破折号，不渲染 ¥0.00', () => {
    expect(formatPriceText(0, 0)).toBe('—');
    expect(formatPriceText(45, 0)).toBe('45 积分');
    expect(formatPriceText(0, 690)).toBe('¥6.90');
  });

  it('buildPaymentSummary 按支付模式取段', () => {
    expect(buildPaymentSummary({ points: 45, cents: 690, mode: 'combined' })).toBe(
      '45 积分 + ¥6.90',
    );
    expect(buildPaymentSummary({ points: 45, cents: 0, mode: 'points_only' })).toBe('45 积分');
    expect(buildPaymentSummary({ points: 0, cents: 690, mode: 'rmb_only' })).toBe('¥6.90');
  });
});
