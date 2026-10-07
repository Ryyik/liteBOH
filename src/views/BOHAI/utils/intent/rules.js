/**
 * rules.js — 意图判定（操作类问题 → 站点手册）
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import { normalizeText } from '../text/normalize.js';

export const isOperationQuestion = (text) => {
  const normalized = normalizeText(text);
  const operationKeywords = [
    '如何',
    '怎么',
    '步骤',
    '入口',
    '路径',
    '路由',
    '在哪',
    '在哪里',
    '使用',
    '操作',
    '教程',
    '指引',
    '写印象',
    '发帖',
    '发布',
    '查看',
    '进入',
    '打开',
  ];
  return operationKeywords.some((keyword) => normalized.includes(keyword));
};

export const shouldUseSiteGuide = (text) => {
  return isOperationQuestion(text);
};
