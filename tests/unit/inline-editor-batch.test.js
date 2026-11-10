import { describe, expect, it, vi } from 'vitest';
import { provideInlineEditor } from '@/composables/useInlineEditor.js';

/**
 * 就地编辑的「多字段原子写入」（`commitMany` / `saveMany`）。
 *
 * 为什么单独一组用例：定价一次要写 4 列（payment_mode / points_cost /
 * rmb_price / is_purchasable），而 products 上有 `chk_products_points_required`
 * 逐条校验 —— 分次写会在中间态撞 23514（2026-11-10 用服务端 SQL 实测复现）。
 * 所以「只发一次 UPDATE」与「撤销只退一步」必须是**行为**断言，
 * 不能只靠读源码。
 *
 * 说明：上下文在组件外构造（本仓测试环境是 node，没有 DOM）。
 * `provide()` 在无实例时是 no-op，只会有一次 Vue 告警 —— 这里把 warn 静音，
 * 免得上百行噪声盖住真正的断言失败。
 */
const makeContext = (overrides = {}) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const ctx = provideInlineEditor({
    startActive: true,
    save: vi.fn().mockResolvedValue(undefined),
    saveMany: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    ...overrides,
  });
  warn.mockRestore();
  return ctx;
};

const ROW = () => ({
  id: 7,
  payment_mode: 'rmb_only',
  points_cost: 0,
  rmb_price: 990,
  is_purchasable: true,
  stock: 3,
  description: '旧说明',
});

const PATCH = () => ({
  payment_mode: 'combined',
  points_cost: 200,
  rmb_price: 1990,
  is_purchasable: true,
  stock: 7,
  description: '新说明',
});

/** 改前状态 = 只含 patch 里那几列的原值（撤销要整体写回它） */
const PREVIOUS = () => ({
  payment_mode: 'rmb_only',
  points_cost: 0,
  rmb_price: 990,
  is_purchasable: true,
  stock: 3,
  description: '旧说明',
});

describe('inline-editor 多字段原子写入', () => {
  it('六列只发一次 saveMany：分次写会踩 CHECK 的中间态', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saveMany = vi.fn().mockResolvedValue(undefined);
    const ctx = makeContext({ save, saveMany });

    const row = ROW();
    const patch = PATCH();
    Object.assign(row, patch);

    await ctx.commitMany(row, patch, PREVIOUS(), '', '商品设置');

    expect(saveMany).toHaveBeenCalledTimes(1);
    expect(saveMany).toHaveBeenCalledWith(row, patch, '');
    expect(save).not.toHaveBeenCalled();
    expect(ctx.undoCount).toBe(1);
  });

  it('撤销只退一步：整体写回 previous，并同步还原界面值', async () => {
    const saveMany = vi.fn().mockResolvedValue(undefined);
    const ctx = makeContext({ saveMany });

    const row = ROW();
    const patch = PATCH();
    const previous = PREVIOUS();
    Object.assign(row, patch);

    await ctx.commitMany(row, patch, previous, '', '商品设置');
    await ctx.undo();

    expect(saveMany).toHaveBeenCalledTimes(2);
    expect(saveMany).toHaveBeenLastCalledWith(row, previous, '');
    // 界面值也回到改前（否则「点了撤销但页面没变」）
    expect(row.payment_mode).toBe('rmb_only');
    expect(row.points_cost).toBe(0);
    expect(row.description).toBe('旧说明');
    expect(ctx.undoCount).toBe(0);
  });

  it('写入失败：历史不入栈（撤销不该退到一个没落库的状态）', async () => {
    const saveMany = vi.fn().mockRejectedValue(new Error('23514'));
    const ctx = makeContext({ saveMany });

    await expect(ctx.commitMany(ROW(), PATCH(), PREVIOUS(), '', '商品设置')).rejects.toThrow(
      '23514',
    );
    expect(ctx.undoCount).toBe(0);
  });

  it('单字段 commit 仍然只走 save，不会被批量通道吞掉', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saveMany = vi.fn().mockResolvedValue(undefined);
    const ctx = makeContext({ save, saveMany });

    const row = ROW();
    await ctx.commit(row, 'title', '新标题', '旧标题', '');

    expect(save).toHaveBeenCalledWith(row, 'title', '新标题', '');
    expect(saveMany).not.toHaveBeenCalled();
  });
});
