/**
 * 商品详情「价格语义」守卫（2026-11-11 用户报障）
 *
 * 报障原话：「感觉商品详情的语义不清，还以为是现金价可以买下，而不是组合」。
 *
 * 现场：详情页把 `combined` 商品渲染成并排两行 ——
 *    积分价  39 积分
 *    现金价  ¥7.90
 * 用户读成两个独立报价（以为付 ¥7.90 就能拿走），实际是**两者都要付**。
 *
 * 改法：浏览态只给一行结论（`39 积分 + ¥7.90` —— 加号即组合），
 * 逐项明细只在就地编辑态出现，那里才需要分别点改。
 * 曾加过一行「积分 + 现金 · 两者都要付」的说明，用户看过实机后要求删掉，已删。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatPriceDisplay } from '@/utils/product-pricing.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

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

  it('浏览态用一句结论，而不是两行并列的「积分价 / 现金价」', () => {
    expect(sheet).toContain('price-total');
    // 结论来自 product-pricing.js 的单一真源，不在这里另拼一份
    expect(sheet).toContain('formatPriceDisplay');
  });

  it('不再有「支付方式说明」那一行（用户明确要求删掉）', () => {
    expect(sheet).not.toContain('price-hint');
    expect(sheet).not.toContain('paymentSummary');
    expect(sheet).not.toContain('paymentModeSummary');
  });

  it('逐项明细只在就地编辑态展开（`v-else` 分支），避免普通用户误读成二选一', () => {
    expect(sheet).toMatch(/v-if="!inlineEditing"[\s\S]{0,200}price-total/);
    expect(sheet).toMatch(/v-else[\s\S]{0,200}price-line/);
  });
});
