/**
 * page-context.js — 页面上下文块构建
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口，消费方零改动。
 *
 * 用途：把附加的页面上下文构建为结构化的 `<page_context>` 块，
 * 与用户问题分离，不占用 `MAX_USER_INPUT_CHARS` 预算。
 */

export const MAX_PAGE_CONTEXT_CHARS = 4000;

export const buildPageContextBlock = (pageContext = null) => {
  if (!pageContext) return '';
  const { title = '', url = '', selection = '', content = '', description = '' } = pageContext;
  if (!title && !url && !selection && !content) return '';

  const sections = [];
  if (title) sections.push(`页面标题：${title}`);
  if (url) sections.push(`页面地址：${url}`);
  if (description) sections.push(`页面描述：${description}`);
  if (selection) sections.push(`选中的内容：\n${selection}`);
  if (content) {
    const trimmed = content.slice(0, MAX_PAGE_CONTEXT_CHARS);
    sections.push(`页面正文：\n${trimmed}`);
  }

  return `<page_context>\n${sections.join('\n')}\n</page_context>`;
};
