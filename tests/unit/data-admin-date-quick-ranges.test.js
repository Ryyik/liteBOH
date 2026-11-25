import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DATE_QUICK_RANGES,
  describeDateQuickRange,
  detectDateQuickRange,
  resolveDateQuickRange,
  toLocalDateValue,
} from '@/views/DataManagement/composables/date-quick-ranges.js';

/**
 * 日期快捷筛选（plans/050 期 2）。
 *
 * 口径：全部按**本地日期**算（不走 toISOString，东八区 00:00–08:00 会差一天）；
 * 「近 7 天」= 含今天共 7 天。
 *
 * 反证：
 *   - 把 last7 的 `days - 1` 改成 `days` ⇒ 「含今天共 7 天」红
 *   - 把本地日期换回 toISOString ⇒ 「不使用 UTC 序列化」红
 *   - 让 detect 在空值时返回 'custom' ⇒ 「全部」红
 */

const readSrc = (relPath) => readFileSync(resolve(process.cwd(), relPath), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// 固定「现在」= 本地时间 2026-03-01 15:30（2026 年 2 月只有 28 天）
const NOW = new Date(2026, 2, 1, 15, 30);

describe('日期快捷档计算', () => {
  it('今天 = 起止同一天（本地日期，不含时间）', () => {
    expect(resolveDateQuickRange('today', NOW)).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
  });

  it('近 7 天 = 含今天共 7 天（today-6 .. today）', () => {
    expect(resolveDateQuickRange('last7', NOW)).toEqual({
      from: '2026-02-23',
      to: '2026-03-01',
    });
  });

  it('近 30 天能正确跨月', () => {
    expect(resolveDateQuickRange('last30', NOW)).toEqual({
      from: '2026-01-31',
      to: '2026-03-01',
    });
  });

  it('全部 = 两个空串（不产生日期条件）', () => {
    expect(resolveDateQuickRange('all', NOW)).toEqual({ from: '', to: '' });
  });

  it('未知档位返回 null（调用方不要动筛选）', () => {
    expect(resolveDateQuickRange('last365', NOW)).toBeNull();
  });

  it('跨年边界：1 月 3 日的近 7 天回到上一年', () => {
    expect(resolveDateQuickRange('last7', new Date(2026, 0, 3, 9, 0))).toEqual({
      from: '2025-12-28',
      to: '2026-01-03',
    });
  });

  it('本地日期格式化不受 UTC 偏移影响', () => {
    // 本地 00:10：若用 toISOString 会变成前一天
    const justAfterMidnight = new Date(2026, 5, 1, 0, 10);
    expect(toLocalDateValue(justAfterMidnight)).toBe('2026-06-01');
  });
});

describe('当前筛选命中哪一档', () => {
  it('空值 = 全部', () => {
    expect(detectDateQuickRange('', '', NOW)).toBe('all');
  });

  it('命中近 7 天', () => {
    expect(detectDateQuickRange('2026-02-23', '2026-03-01', NOW)).toBe('last7');
  });

  it('对不上任何档位 = 自定义', () => {
    expect(detectDateQuickRange('2026-02-01', '2026-02-10', NOW)).toBe('custom');
  });
});

describe('tooltip 文案', () => {
  it('把档位展开成具体日期', () => {
    expect(describeDateQuickRange('last7', NOW)).toBe('2026-02-23 至 2026-03-01');
    expect(describeDateQuickRange('today', NOW)).toBe('2026-03-01');
    expect(describeDateQuickRange('all', NOW)).toBe('不限制日期');
  });
});

describe('接入点与实现约束（源码级）', () => {
  const helperSrc = stripComments(
    readSrc('src/views/DataManagement/composables/date-quick-ranges.js'),
  );
  const adminSrc = stripComments(readSrc('src/views/DataManagement/DataAdmin.vue'));

  it('不使用 UTC 序列化（会差一天）', () => {
    expect(helperSrc).not.toContain('toISOString');
  });

  it('快捷档与「全部」都在同一张表里（单一真源）', () => {
    expect(DATE_QUICK_RANGES.map((r) => r.id)).toEqual(['all', 'today', 'last7', 'last30']);
  });

  it('点档位只写起止日期并复用 handleFilterChange（不新增查询链路）', () => {
    expect(adminSrc).toContain('const applyDateQuickRange');
    expect(adminSrc).toMatch(/dateFromFilter\.value = resolved\.from/);
    expect(adminSrc).toMatch(/dateToFilter\.value = resolved\.to/);
    expect(adminSrc).toMatch(/applyDateQuickRange[\s\S]{0,400}handleFilterChange\(\)/);
  });

  it('快捷档只在「该表有日期列」时渲染', () => {
    expect(adminSrc).toMatch(/v-if="currentDateFilterField"[\s\S]{0,600}DATE_QUICK_RANGES/);
  });
});
