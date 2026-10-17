import { describe, expect, it } from 'vitest';
import {
  sumDiagnosticIssues,
  toFiniteCount,
} from '@/views/DataManagement/composables/data-admin-diagnostics.js';

describe('sumDiagnosticIssues（概览待处理事项）', () => {
  it('正常计数相加', () => {
    expect(
      sumDiagnosticIssues({
        moderationPendingCount: 2,
        dueDraws: 3,
        notificationJobs: 4,
        schedulerFailed: true,
      }),
    ).toBe(10);
  });

  it('undefined / NaN / 数字字符串都不会污染成 NaN', () => {
    expect(
      sumDiagnosticIssues({
        moderationPendingCount: undefined,
        dueDraws: '3',
        notificationJobs: NaN,
        schedulerFailed: false,
      }),
    ).toBe(3);
    expect(sumDiagnosticIssues()).toBe(0);
  });

  it('toFiniteCount 只接受有限数', () => {
    expect(toFiniteCount('12')).toBe(12);
    expect(toFiniteCount('abc')).toBe(0);
    expect(toFiniteCount(Infinity)).toBe(0);
    expect(toFiniteCount(null)).toBe(0);
  });
});
