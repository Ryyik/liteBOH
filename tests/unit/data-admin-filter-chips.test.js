import { describe, expect, it } from 'vitest';

import {
  DATE_CHIP_ID,
  RULE_CHIP_PREFIX,
  SEARCH_CHIP_ID,
  STATUS_CHIP_ID,
  buildFilterChips,
} from '@/views/DataManagement/composables/data-admin-filter-chips.js';

const FIELD_LABELS = { title: '标题', created_at: '创建时间', status: '状态' };

describe('buildFilterChips：无筛选时不出 chip', () => {
  it('空参数返回空数组', () => {
    expect(buildFilterChips({})).toEqual([]);
  });

  it('纯空白关键词不算生效条件', () => {
    expect(buildFilterChips({ keyword: '   ' })).toEqual([]);
  });

  it('高级规则为空数组时不出 rule chip', () => {
    expect(buildFilterChips({ rules: [] })).toEqual([]);
  });
});

describe('buildFilterChips：四类条件各自的 id 与文案', () => {
  it('关键词走 search id，并 trim', () => {
    const [chip] = buildFilterChips({ keyword: '  围巾  ' });
    expect(chip.id).toBe(SEARCH_CHIP_ID);
    expect(chip.label).toBe('关键词：围巾');
  });

  it('状态用中文标签，标签缺失时退回原值', () => {
    const [withLabel] = buildFilterChips({ status: 'approved', statusLabel: '已通过' });
    expect(withLabel.id).toBe(STATUS_CHIP_ID);
    expect(withLabel.label).toBe('状态：已通过');

    const [raw] = buildFilterChips({ status: 'approved' });
    expect(raw.label).toBe('状态：approved');
  });

  it('日期三种形态（区间 / 只有起 / 只有止）文案不同', () => {
    const [range] = buildFilterChips({
      dateFieldLabel: '创建时间',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-09',
    });
    expect(range.id).toBe(DATE_CHIP_ID);
    expect(range.label).toBe('创建时间：2026-11-01 ~ 2026-11-09');

    const [fromOnly] = buildFilterChips({ dateFieldLabel: '创建时间', dateFrom: '2026-11-01' });
    expect(fromOnly.label).toBe('创建时间：≥ 2026-11-01');

    const [toOnly] = buildFilterChips({ dateFieldLabel: '创建时间', dateTo: '2026-11-09' });
    expect(toOnly.label).toBe('创建时间：≤ 2026-11-09');
  });

  it('高级规则 id 带 rule: 前缀，算子翻成中文、字段翻成标签', () => {
    const [chip] = buildFilterChips({
      rules: [{ id: 'r1', field: 'title', operator: 'contains', value: '围巾' }],
      fieldLabels: FIELD_LABELS,
    });
    expect(chip.id).toBe(`${RULE_CHIP_PREFIX}r1`);
    expect(chip.kind).toBe('rule');
    expect(chip.label).toBe('标题包含围巾');
  });

  it('算子不在映射表里时退化为原算子，不产出 undefined', () => {
    const [chip] = buildFilterChips({
      rules: [{ id: 'r2', field: 'title', operator: 'mystery', value: 'x' }],
      fieldLabels: FIELD_LABELS,
    });
    expect(chip.label).toBe('标题mysteryx');
    expect(chip.label).not.toContain('undefined');
  });
});

describe('buildFilterChips：顺序稳定（搜索 → 状态 → 日期 → 高级）', () => {
  it('四类齐全时按固定顺序排列', () => {
    const chips = buildFilterChips({
      keyword: 'kw',
      status: 'approved',
      statusLabel: '已通过',
      dateFieldLabel: '创建时间',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-09',
      rules: [{ id: 'r1', field: 'title', operator: 'contains', value: '围巾' }],
      fieldLabels: FIELD_LABELS,
    });
    expect(chips.map((chip) => chip.kind)).toEqual(['search', 'status', 'date', 'rule']);
  });

  it('多条高级规则保持传入顺序', () => {
    const chips = buildFilterChips({
      rules: [
        { id: 'a', field: 'title', operator: 'eq', value: '1' },
        { id: 'b', field: 'title', operator: 'eq', value: '2' },
      ],
      fieldLabels: FIELD_LABELS,
    });
    expect(chips.map((chip) => chip.id)).toEqual([`${RULE_CHIP_PREFIX}a`, `${RULE_CHIP_PREFIX}b`]);
  });
});

describe('buildFilterChips：超长值截断，但 title 保留全文', () => {
  it('label 截断到 32 字符加省略号，title 不截断', () => {
    const long = 'x'.repeat(60);
    const [chip] = buildFilterChips({ keyword: long });
    expect(chip.label).toBe(`关键词：${'x'.repeat(32)}…`);
    expect(chip.title).toContain(long);
  });
});
