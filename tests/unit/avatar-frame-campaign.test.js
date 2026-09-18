import { describe, expect, it } from 'vitest';
import {
  freeUntilMs,
  isFrameFreeNow,
  resolveFrameTier,
  msUntilFreeEnds,
  freeUntilLabel
} from '../../src/utils/avatar-frame-campaign.js';

/**
 * 头像框限时免费口径的边界测试。
 *
 * 为什么单独测边界：UI 探针只能证明「某个时刻界面对」，而 freeUntil 的成败全在
 * 截止日那一秒——23:59:59.999 还算免费、次日 00:00:00.000 必须切 Ultra。
 * 错一天就会让限免少一整天（或多送一整天），肉眼在页面上看不出来。
 */
const ELF = { id: 'elf-flower', tier: 'ultra', freeUntil: '2026-09-25' };
const PLAIN_FREE = { id: 'orange-cat', tier: 'free' };
const PLAIN_ULTRA = { id: 'x', tier: 'ultra' };

/** 本地时区时间串 -> 毫秒（判定用的是本地日界，不能用 Date.parse 的 UTC 语义） */
const T = (s) => new Date(s).getTime();

describe('freeUntilMs', () => {
  it('解析为当日 23:59:59.999', () => {
    expect(freeUntilMs(ELF)).toBe(T('2026-09-25T23:59:59.999'));
  });

  it('无 freeUntil 返回 null', () => {
    expect(freeUntilMs(PLAIN_FREE)).toBeNull();
  });

  it('非法格式返回 null（不接受 2026/09/25 这类斜杠写法）', () => {
    expect(freeUntilMs({ freeUntil: '2026/09/25' })).toBeNull();
    expect(freeUntilMs({ freeUntil: '25-09-2026' })).toBeNull();
  });
});

describe('resolveFrameTier · 限免窗口边界', () => {
  it('限免期内（首日之前）判 free', () => {
    expect(resolveFrameTier(ELF, T('2026-09-18T00:00:00'))).toBe('free');
  });

  it('截止日当天 00:00 判 free', () => {
    expect(resolveFrameTier(ELF, T('2026-09-25T00:00:00'))).toBe('free');
  });

  it('截止日最后一毫秒仍判 free（端点含当日）', () => {
    expect(resolveFrameTier(ELF, T('2026-09-25T23:59:59.999'))).toBe('free');
  });

  it('次日第一毫秒切回声明档位 ultra', () => {
    expect(resolveFrameTier(ELF, T('2026-09-26T00:00:00.000'))).toBe('ultra');
  });

  it('到期之后持续为 ultra', () => {
    expect(resolveFrameTier(ELF, T('2026-09-27T10:00:00'))).toBe('ultra');
  });

  it('回归 · 截止日当天不得被误判为 ultra', () => {
    // 若实现误写成 now < 截止日 00:00，会让限免整整少一天且不报错
    expect(resolveFrameTier(ELF, T('2026-09-25T12:00:00'))).not.toBe('ultra');
  });
});

describe('resolveFrameTier · 非限免框不受影响', () => {
  it('普通 free 框恒为 free', () => {
    expect(resolveFrameTier(PLAIN_FREE, T('2026-01-01T00:00:00'))).toBe('free');
  });

  it('普通 ultra 框恒为 ultra', () => {
    expect(resolveFrameTier(PLAIN_ULTRA, T('2026-09-25T12:00:00'))).toBe('ultra');
  });

  it('null frame 兜底 free', () => {
    expect(resolveFrameTier(null, Date.now())).toBe('free');
  });
});

describe('isFrameFreeNow / msUntilFreeEnds', () => {
  it('限免期内为 true', () => {
    expect(isFrameFreeNow(ELF, T('2026-09-20T08:00:00'))).toBe(true);
  });

  it('到期后为 false', () => {
    expect(isFrameFreeNow(ELF, T('2026-09-26T08:00:00'))).toBe(false);
  });

  it('剩余毫秒按截止时刻计', () => {
    expect(msUntilFreeEnds(ELF, T('2026-09-24T23:59:59.999'))).toBe(86400000);
  });

  it('到期后剩余毫秒为 null', () => {
    expect(msUntilFreeEnds(ELF, T('2026-09-26T00:00:00'))).toBeNull();
  });
});

describe('freeUntilLabel', () => {
  it('输出 M/D 形式', () => {
    expect(freeUntilLabel(ELF)).toBe('9/25');
  });

  it('无 freeUntil 返回空串', () => {
    expect(freeUntilLabel(PLAIN_FREE)).toBe('');
  });
});
