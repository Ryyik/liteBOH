/**
 * data-admin-filter-chips.js — 「当前生效条件」chips 的构造纯函数（plans/042 A4）
 *
 * 为什么单独抽出来：这些条件原本只在**展开的筛选面板里**可见，用户看到空列表
 * 时无法判断是哪一条（关键词？状态？某个高级条件？）把结果挡住了。chips 要
 * 「常驻 + 可单条删除」，就必须先有一份与真实查询条件**同源**的清单 ——
 * 否则 chips 说「状态=已通过」而实际查询没带，比不显示更糟。
 *
 * 约束：本文件只做「状态 → 展示标签」的映射，不读 ref、不发请求。
 */

import { ADVANCED_OPERATOR_LABELS, hasFilterValue } from './useDataAdminFilters.js';

/** chip id 公约：单例条件用固定 id，高级条件用 `rule:<ruleId>` */
export const SEARCH_CHIP_ID = 'search';
export const STATUS_CHIP_ID = 'status';
export const DATE_CHIP_ID = 'date';
export const RULE_CHIP_PREFIX = 'rule:';

const MAX_VALUE_LENGTH = 32;

const clip = (text) => {
  const value = String(text ?? '');
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
};

/**
 * 构造「当前生效条件」chips。
 *
 * @param {Object} params
 * @param {string} params.keyword           - 搜索关键词（已 trim 前调用也可，内部会 trim）
 * @param {string} params.status            - 状态筛选值（空串 = 未筛选）
 * @param {string} params.statusLabel       - 状态的中文标签（落库值 → 展示）
 * @param {string} params.dateFieldLabel    - 日期字段的中文标签（如「创建时间」）
 * @param {string} params.dateFrom
 * @param {string} params.dateTo
 * @param {Array}  params.rules             - **已过滤后的**高级规则（activeAdvancedRules）
 * @param {Object} params.fieldLabels       - { 字段 key: 中文标签 }
 * @returns {Array<{ id: string, kind: string, label: string, title: string }>}
 */
export const buildFilterChips = ({
  keyword = '',
  status = '',
  statusLabel = '',
  dateFieldLabel = '日期',
  dateFrom = '',
  dateTo = '',
  rules = [],
  fieldLabels = {},
} = {}) => {
  const chips = [];

  const trimmedKeyword = String(keyword || '').trim();
  if (trimmedKeyword) {
    chips.push({
      id: SEARCH_CHIP_ID,
      kind: 'search',
      label: `关键词：${clip(trimmedKeyword)}`,
      title: `搜索关键词「${trimmedKeyword}」`,
    });
  }

  // 布尔状态列的「否」是 false —— 真值判断会让这条 chip 静默消失
  if (hasFilterValue(status)) {
    chips.push({
      id: STATUS_CHIP_ID,
      kind: 'status',
      label: `状态：${clip(statusLabel || status)}`,
      title: `状态筛选 = ${statusLabel || status}`,
    });
  }

  if (dateFrom || dateTo) {
    const range =
      dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}` : dateFrom ? `≥ ${dateFrom}` : `≤ ${dateTo}`;
    chips.push({
      id: DATE_CHIP_ID,
      kind: 'date',
      label: `${dateFieldLabel}：${range}`,
      title: `${dateFieldLabel} ${range}`,
    });
  }

  rules.forEach((rule) => {
    const field = String(rule?.field || '').trim();
    const operator = String(rule?.operator || '').trim();
    const value = clip(rule?.value);
    const fieldLabel = fieldLabels[field] || field;
    const operatorLabel = ADVANCED_OPERATOR_LABELS[operator] || operator || '包含';
    chips.push({
      id: `${RULE_CHIP_PREFIX}${rule.id}`,
      kind: 'rule',
      label: `${fieldLabel}${operatorLabel}${value}`,
      title: `高级条件：${fieldLabel} ${operatorLabel} ${rule.value}`,
    });
  });

  return chips;
};
