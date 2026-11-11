/**
 * 商品详情「价格语义」守卫（2026-11-11 用户报障）
 *
 * 报障原话：「感觉商品详情的语义不清，还以为是现金价可以买下，而不是组合」。
 *
 * 现场：详情页把 `combined` 商品渲染成并排两行 ——
 *    积分价  39 积分
 *    现金价  ¥7.90
 * 用户读成两个独立报价（以为付 ¥7.90 就能拿走），实际是**两者都要付**。
 * 价格数字本身表达不了「同时付」，只能靠一句明确的说明。
 *
 * 改法：浏览态一行结论（`39 积分 + ¥7.90`）+ 一行支付方式说明
 * （`积分 + 现金 · 两者都要付`，文案取自 PAYMENT_MODE_OPTIONS 单一真源）；
 * 逐项明细只在就地编辑态出现，那里才需要分别点改。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatPriceDisplay,
  paymentModeSummary,
  PAYMENT_MODE_OPTIONS,
} from '@/utils/product-pricing.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('支付方式说明（价格数字说不清「同时付」）', () => {
  it('组合支付必须写出「两者都要付」', () => {
    const summary = paymentModeSummary('combined');
    expect(summary).toContain('积分');
    expect(summary).toContain('现金');
    expect(summary).toContain('两者都要付');
  });

  it('纯积分 / 纯现金各自说清，不出现另一侧的付款方式', () => {
    expect(paymentModeSummary('points_only')).toContain('积分');
    expect(paymentModeSummary('points_only')).not.toContain('现金');
    expect(paymentModeSummary('rmb_only')).toContain('现金');
    expect(paymentModeSummary('rmb_only')).not.toContain('积分');
  });

  it('脏模式回落纯积分（与 DB 列默认值同口径）', () => {
    expect(paymentModeSummary('')).toBe(paymentModeSummary('points_only'));
    expect(paymentModeSummary(null)).toBe(paymentModeSummary('points_only'));
    expect(paymentModeSummary('whatever')).toBe(paymentModeSummary('points_only'));
  });

  it('文案取自 PAYMENT_MODE_OPTIONS（后台定价面板同一份），不是详情页另写的第二份', () => {
    for (const option of PAYMENT_MODE_OPTIONS) {
      expect(paymentModeSummary(option.value)).toBe(`${option.label} · ${option.hint}`);
    }
  });
});

describe('价格展示', () => {
  it('组合商品拼成一句 `N 积分 + ¥M`，顺序固定为积分在前', () => {
    expect(formatPriceDisplay({ points_cost: 39, rmb_price: 790 })).toBe('39 积分 + ¥7.90');
  });

  it('单侧定价不拖另一侧的尾巴', () => {
    expect(formatPriceDisplay({ points_cost: 95, rmb_price: null })).toBe('95 积分');
    expect(formatPriceDisplay({ points_cost: 0, rmb_price: 1690 })).toBe('¥16.90');
  });

  it('没有价时明确写「暂无报价」，不显示 ¥0.00', () => {
    expect(formatPriceDisplay({ points_cost: 0, rmb_price: null })).toBe('暂无报价');
  });
});

describe('详情页渲染结构', () => {
  const sheet = read('src/views/Shop/ProductDetailSheet.vue');

  it('浏览态用一句结论 + 支付说明，而不是两行并列的「积分价 / 现金价」', () => {
    expect(sheet).toContain('price-total');
    expect(sheet).toContain('price-hint');
    // 结论与说明都来自 product-pricing.js 的单一真源
    expect(sheet).toContain('formatPriceDisplay');
    expect(sheet).toContain('paymentModeSummary');
  });

  it('逐项明细只在就地编辑态展开（`v-else` 分支），避免普通用户误读成二选一', () => {
    expect(sheet).toMatch(/v-if="!inlineEditing"[\s\S]{0,200}price-total/);
    expect(sheet).toMatch(/v-else[\s\S]{0,200}price-line/);
  });
});
