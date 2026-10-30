import { describe, expect, it, vi } from 'vitest';

/* 2026-10-30 复审：`toPositiveInt` 的 fallback 语义。
 *
 * 背景：这轮修复把 `Math.max(1, Number(v || fallback))` 换成「有限数就夹 ≥1」，
 * 治好了 `?page=abc` 的 NaN，但顺手把 `0 / null / ''` 从「走 fallback」变成了「夹到 1」——
 * `pageSize: 0` 会从「默认 10 条」静默变成「1 条」，列表页只剩一条还没有报错。
 * 三个 falsy 值都不是「合法的 1」，它们是「没传」。
 *
 * 另一条口径：函数名叫 `toPositiveInt`，而 page/pageSize/limit 最终都进
 * PostgREST `.range()` 或 RPC 的 `p_page`，那里只接受整数 ⇒ 必须取整。
 */

vi.mock('../../src/utils/supabase-client.js', () => ({ supabase: { from: vi.fn() } }));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/utils/api/notifications-api.js', () => ({
  createNotification: vi.fn(),
  sendPushplusForNotification: vi.fn(),
}));
vi.mock('../../src/utils/unified-content-moderation.js', () => ({
  writeModerationAuditLog: vi.fn(),
}));

import { toNonNegativeNumber, toPositiveInt } from '../../src/utils/api/forum/_shared.js';

describe('toPositiveInt：缺省值必须走 fallback，不能夹到 1', () => {
  it.each([
    ['未传（undefined）', undefined, 10, 10],
    ['0（falsy，语义是「没传」）', 0, 10, 10],
    ['null（老接口/可选参数常见）', null, 20, 20],
    ['空串（深链 ?pageSize=）', '', 20, 20],
    ['非数字字符串', 'abc', 20, 20],
    ['负数', -5, 20, 20],
    ['正常值', 3, 10, 3],
    ['字符串数字', '25', 10, 25],
    ['小数向下取整（.range 只吃整数）', 10.9, 20, 10],
  ])('%s', (_label, value, fallback, expected) => {
    expect(toPositiveInt(value, fallback)).toBe(expected);
  });

  it('fallback 本身非法时兜到 1（而不是 NaN 流进 range）', () => {
    expect(toPositiveInt(0, NaN)).toBe(1);
    expect(toPositiveInt(0, 0)).toBe(1);
    expect(toPositiveInt(0, -3)).toBe(1);
    expect(toPositiveInt(undefined, 'abc')).toBe(1);
  });

  it('不传 fallback 时默认 1（page 的语义）', () => {
    expect(toPositiveInt(undefined)).toBe(1);
    expect(toPositiveInt(0)).toBe(1);
    expect(toPositiveInt(7)).toBe(7);
  });
});

describe('toNonNegativeNumber：0 是合法值，与缺省不是一回事', () => {
  it('0 保留为 0', () => {
    expect(toNonNegativeNumber(0, 5)).toBe(0);
  });

  it('转不了才用 fallback', () => {
    expect(toNonNegativeNumber('abc', 5)).toBe(5);
    expect(toNonNegativeNumber(undefined, 5)).toBe(5);
  });

  it('负数夹到 0', () => {
    expect(toNonNegativeNumber(-9, 5)).toBe(0);
  });
});
