import { describe, expect, it } from 'vitest';
import {
  composeActivityDateInput,
  formatActivityDate,
  groupActivitiesByMonth,
  hasDayPrecision,
  normalizeActivityDateInput,
  parseActivityDate
} from '../../src/utils/activity-date.js';

// 真库快照（2026-09-17 实测 17 行，id 升序）——三种格式混录是本次重构的原始约束
const REAL_ROWS = [
  { id: 1, title: '方块之家4周年庆典', date: '2022/7/21' },
  { id: 2, title: '国庆特别活动[2022]', date: '2022/10' },
  { id: 3, title: '圣诞活动[2022]', date: '2022/12/26' },
  { id: 4, title: '农夫乐事', date: '2023/8' },
  { id: 5, title: '方块之家5周年庆典', date: '2023/7/21' },
  { id: 6, title: '国庆特别活动[2023]', date: '2023/10' },
  { id: 7, title: '冬眠生存', date: '2023/12/1' },
  { id: 8, title: '农夫乐事方块街', date: '2024/2' },
  { id: 9, title: 'MC卡车', date: '2024/7' },
  { id: 10, title: '2024新年活动', date: '2024/12/31' },
  { id: 11, title: '新年跑酷', date: '2024/12/31' },
  { id: 12, title: '方块之家7周年庆典', date: '2025/7/21' },
  { id: 13, title: '国庆特别活动[2025]', date: '2025/10' },
  { id: 14, title: '方块博物馆来袭', date: '2025/12/12' },
  { id: 15, title: '冬眠生存第四季', date: '2026/2/3' },
  { id: 16, title: '八周年·沉默乐章剧本杀', date: '2026-07-21' },
  { id: 17, title: '《沉默乐章·错位音》剧本杀', date: '2026-08-10' }
];

describe('parseActivityDate', () => {
  it('解析 YYYY/M/D（有「日」）', () => {
    const parsed = parseActivityDate('2026/2/3');
    expect(parsed.valid).toBe(true);
    expect(parsed).toMatchObject({ year: 2026, month: 2, day: 3, hasDay: true, precision: 'day' });
    expect(parsed.monthKey).toBe('2026-02');
    expect(parsed.monthOrd).toBe(202602);
    expect(parsed.sortKey).toBe(20260203);
    expect(parsed.dateLabel).toBe('2026年2月3日');
  });

  it('解析 YYYY-MM-DD（有「日」）', () => {
    const parsed = parseActivityDate('2026-08-10');
    expect(parsed.valid).toBe(true);
    expect(parsed).toMatchObject({ year: 2026, month: 8, day: 10, hasDay: true });
    expect(parsed.monthKey).toBe('2026-08');
    expect(parsed.sortKey).toBe(20260810);
  });

  it('解析 YYYY/M（缺「日」，hasDay 为 false 且文案不补「1日」）', () => {
    const parsed = parseActivityDate('2025/10');
    expect(parsed.valid).toBe(true);
    expect(parsed.hasDay).toBe(false);
    expect(parsed.day).toBeNull();
    expect(parsed.precision).toBe('month');
    expect(parsed.monthLabel).toBe('2025年10月');
    expect(parsed.dateLabel).toBe('2025年10月');
    expect(parsed.dateLabel).not.toContain('1日');
    // 排序键落 0：同月内「缺日」排在有日之后
    expect(parsed.sortKey).toBe(20251000);
  });

  it('支持 YYYY-MM（缺「日」）', () => {
    const parsed = parseActivityDate('2025-10');
    expect(parsed.valid).toBe(true);
    expect(parsed.hasDay).toBe(false);
    expect(parsed.monthKey).toBe('2025-10');
  });

  it('拒绝非法输入，不交给 Date 宽松解析兜底', () => {
    ['', '   ', null, undefined, '待定', '2026/13', '2026/2/31', '2026/0/5', 'abc'].forEach((raw) => {
      expect(parseActivityDate(raw).valid).toBe(false);
    });
    // '2024-7' 若交给 new Date 会被静默补成 2024-07-01 —— 这里必须仍判定为合法但缺「日」
    const loose = parseActivityDate('2024-7');
    expect(loose.valid).toBe(true);
    expect(loose.hasDay).toBe(false);
    expect(loose.day).toBeNull();
  });

  it('闰年边界按真实月末判定', () => {
    expect(parseActivityDate('2024/2/29').valid).toBe(true);
    expect(parseActivityDate('2025/2/29').valid).toBe(false);
  });
});

describe('formatActivityDate / hasDayPrecision', () => {
  it('按精度输出不同文案', () => {
    expect(formatActivityDate('2026/2/3')).toBe('2026年2月3日');
    expect(formatActivityDate('2026/2/3', 'short')).toBe('2月3日');
    expect(formatActivityDate('2025/10')).toBe('2025年10月');
    expect(formatActivityDate('2025/10', 'short')).toBe('10月');
    expect(formatActivityDate('2025/10', 'month')).toBe('2025年10月');
  });

  it('无效日期回退原始字符串', () => {
    expect(formatActivityDate('待定')).toBe('待定');
  });

  it('hasDayPrecision 区分精度', () => {
    expect(hasDayPrecision('2026/2/3')).toBe(true);
    expect(hasDayPrecision('2025/10')).toBe(false);
    expect(hasDayPrecision('bad')).toBe(false);
  });
});

describe('groupActivitiesByMonth（真库 17 行）', () => {
  const { groups, undated } = groupActivitiesByMonth(REAL_ROWS);

  it('无未排期记录', () => {
    expect(undated).toHaveLength(0);
  });

  it('月份严格降序，且 7 月不再被排到 12 月前面', () => {
    const keys = groups.map((g) => g.monthKey);
    const sortedDesc = [...keys].sort().reverse();
    expect(keys).toEqual(sortedDesc);
    // 字符串比较会出错的这一对：2025-12 必须早于 2025-07
    expect(keys.indexOf('2025-12')).toBeLessThan(keys.indexOf('2025-07'));
  });

  it('最新月份在首位', () => {
    expect(groups[0].monthKey).toBe('2026-08');
    expect(groups[1].monthKey).toBe('2026-07');
    expect(groups[2].monthKey).toBe('2026-02');
  });

  it('缺「日」的 2025年10月 与有「日」的月份都能正确成组', () => {
    const oct = groups.find((g) => g.monthKey === '2025-10');
    expect(oct).toBeTruthy();
    expect(oct.monthLabel).toBe('2025年10月');
    expect(oct.items.map((r) => r.id)).toEqual([13]);
  });

  it('同月同日（2024/12/31 两条）顺序稳定且可重复', () => {
    const dec = groups.find((g) => g.monthKey === '2024-12');
    const apr = groups.find((g) => g.monthKey === '2022-12');
    expect(dec.items).toHaveLength(2);
    expect(dec.items.map((r) => r.id)).toEqual([11, 10]);
    // 重复调用结果一致（不受 Array.sort 不稳定影响）
    const again = groupActivitiesByMonth(REAL_ROWS).groups.find((g) => g.monthKey === '2024-12');
    expect(again.items.map((r) => r.id)).toEqual(dec.items.map((r) => r.id));
    expect(apr.items.map((r) => r.id)).toEqual([3]);
  });

  it('全部 17 条都被分组，无丢失', () => {
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(REAL_ROWS.length);
    expect(groups).toHaveLength(16);
  });

  it('数据密度：17 条摊成 16 个月，仅 2024-12 有 2 张卡', () => {
    // 这是「每月一轨道」方案的现实约束——绝大多数轨道只有 1 张卡
    const sizes = groups.map((g) => g.items.length);
    expect(sizes.filter((n) => n > 1)).toHaveLength(1);
    expect(groups.find((g) => g.monthKey === '2024-12').items).toHaveLength(2);
    expect(sizes.filter((n) => n === 1)).toHaveLength(15);
  });

  it('非法日期进 undated 而不是被静默丢弃', () => {
    const result = groupActivitiesByMonth([{ id: 99, title: '待定活动', date: '待定' }]);
    expect(result.groups).toHaveLength(0);
    expect(result.undated.map((r) => r.id)).toEqual([99]);
  });

  it('空输入安全', () => {
    expect(groupActivitiesByMonth()).toEqual({ groups: [], undated: [] });
    expect(groupActivitiesByMonth(null)).toEqual({ groups: [], undated: [] });
  });
});

describe('数据管理侧的日期写回（精度必须保留）', () => {
  it('normalizeActivityDateInput 保留缺「日」的精度', () => {
    expect(normalizeActivityDateInput('2025/10')).toBe('2025-10');
    expect(normalizeActivityDateInput('2026/2/3')).toBe('2026-02-03');
    expect(normalizeActivityDateInput('2025-10')).toBe('2025-10');
    expect(normalizeActivityDateInput('bad')).toBe('');
  });

  it('composeActivityDateInput：留空「日」写成年月，不留空写出年月日', () => {
    expect(composeActivityDateInput('2025', '10', '')).toBe('2025-10');
    expect(composeActivityDateInput('2025', '10', '1')).toBe('2025-10-01');
    expect(composeActivityDateInput('2026', '2', '3')).toBe('2026-02-03');
  });

  it('composeActivityDateInput 拒绝非法值', () => {
    expect(composeActivityDateInput('', '10', '')).toBe('');
    expect(composeActivityDateInput('2025', '13', '')).toBe('');
    expect(composeActivityDateInput('2025', '2', '30')).toBe('');
  });

  it('回归：旧 toDateInputValue 会把 2025/10 改写成 2025-10-01（精度丢失）', () => {
    const legacy = (value) => {
      const raw = String(value ?? '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    expect(legacy('2025/10')).toBe('2025-10-01');
    expect(normalizeActivityDateInput('2025/10')).toBe('2025-10');
  });
});
