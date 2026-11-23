import { describe, expect, it } from 'vitest';

import {
  fromLocalInputValue,
  isXmasBackendMissing,
  toLocalInputValue,
} from '../../src/utils/api/xmas-exchange-api.js';

/**
 * 这两个纯函数看起来微不足道，但它们是「管理台改时间 → 活动提前/延后揭晓」的唯一通道。
 * datetime-local 给的是**不带时区的本地时间**，直接丢给 PostgREST 会被当 UTC 解析，
 * 北京时间会凭空差 8 小时 —— 活动要么提前 8 小时开奖，要么延后 8 小时。
 */
describe('xmas exchange api helpers', () => {
  it('treats a missing function as "backend not deployed"', () => {
    expect(isXmasBackendMissing({ code: 'PGRST202' })).toBe(true);
    expect(isXmasBackendMissing({ code: '42883' })).toBe(true);
    expect(
      isXmasBackendMissing({
        message: 'Could not find the function public.xmas_roster(p_slug) in the schema cache',
      }),
    ).toBe(true);
  });

  it('does not mistake a business failure for a missing backend', () => {
    // 这两类必须区分：前者要回退 mock，后者要把「名额满了」原样告诉用户
    expect(isXmasBackendMissing({ code: 'FULL', message: '树上挂满啦' })).toBe(false);
    expect(isXmasBackendMissing({ code: 'NOT_AUTHED', message: '先登录再来挂头像' })).toBe(false);
    expect(isXmasBackendMissing(null)).toBe(false);
  });

  it('keeps the wall clock when converting local input to ISO', () => {
    const iso = fromLocalInputValue('2026-12-20T20:00');
    const back = new Date(iso);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(11);
    expect(back.getDate()).toBe(20);
    expect(back.getHours()).toBe(20);
    expect(back.getMinutes()).toBe(0);
  });

  it('round-trips through the datetime-local representation', () => {
    const iso = '2026-12-20T12:00:00.000Z';
    expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso);
  });

  it('returns null for empty or invalid input instead of an invalid date', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('not-a-date')).toBeNull();
    expect(toLocalInputValue('')).toBe('');
    expect(toLocalInputValue('nope')).toBe('');
  });
});
