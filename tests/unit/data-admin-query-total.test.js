import { describe, expect, it } from 'vitest';
import { resolveQueryTotal } from '@/views/DataManagement/composables/resolve-query-total.js';

// =====================================================================
// 页脚总数口径守卫（2026-10-19 用户报障）
//
//   现象：数据管理面板「总记录数」翻页就变 —— 第 1 页 20 条显示 20，
//   第 2 页 11 行显示 11。根因：缺 count 时旧实现退化成 currentData.length。
//   本守卫锁死「总数绝不等于当前页行数」这个不变量。
//
//   反证：把 resolveQueryTotal 的 queryTotal 分支删掉 → 第 1 条必红；
//        把 tableTotal 回退删掉 → 第 2 条必红（会落到 rowCount）。
// =====================================================================

describe('resolveQueryTotal · 页脚总数取值优先级', () => {
  it('① 列表查询 count 优先（含筛选，翻页不变）', () => {
    expect(resolveQueryTotal({ queryTotal: 31, tableTotal: 150, rowCount: 20 })).toBe(31);
    expect(resolveQueryTotal({ queryTotal: 0, tableTotal: 150, rowCount: 20 })).toBe(0);
  });

  it('② 缺 count 时回退全表计数，**绝不**回退成当前页行数', () => {
    expect(resolveQueryTotal({ queryTotal: undefined, tableTotal: 150, rowCount: 20 })).toBe(150);
    expect(resolveQueryTotal({ queryTotal: null, tableTotal: 150, rowCount: 11 })).toBe(150);
    expect(resolveQueryTotal({ queryTotal: Number.NaN, tableTotal: 150, rowCount: 11 })).toBe(150);
  });

  it('③ 两者都拿不到才用页长兜底（异常路径，正常不应命中）', () => {
    expect(resolveQueryTotal({ queryTotal: undefined, tableTotal: null, rowCount: 11 })).toBe(11);
    expect(resolveQueryTotal({})).toBe(0);
  });

  it('负数/clamp：任何输入都返回非负数', () => {
    expect(resolveQueryTotal({ queryTotal: -3, tableTotal: 10, rowCount: 5 })).toBe(0);
    expect(resolveQueryTotal({ queryTotal: ' 42 ', tableTotal: 0, rowCount: 5 })).toBe(42);
  });
});
