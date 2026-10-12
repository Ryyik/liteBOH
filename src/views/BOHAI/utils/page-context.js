/**
 * page-context.js — 页面上下文块构建
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 *
 * 用途：把附加的页面上下文构建为结构化的 `<page_context>` 块，
 * 与用户问题分离，不占用 `MAX_USER_INPUT_CHARS` 预算。
 */

import { estimateTokens } from './tokens.js';

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

/**
 * 采集「当前页面」作为可附加上下文（2026-10-12）。
 *
 * 用途：灵动岛形态（浮在别的页面上）里「引用当前页面」这一口的真源 —— 独立页形态时
 * 「当前页面」就是 AI 自己，没有可引的东西，所以入口在组件上按 `overlayMode` 收掉。
 *
 * ⚠️ **刻意不采 `content`（整页正文）**：一是 `document.body.innerText` 又长又噪，
 *    把一整页糊进 prompt 不是用户要的；二是 `buildPageContextBlock` 内部会再截断到
 *    `MAX_PAGE_CONTEXT_CHARS`，采了也白采。需要正文的调用方（例如 Cloud+ 详情页）
 *    自己显式传 `content`。这里只采「标题 / 地址 / 描述 / **用户选中的内容**」——
 *    选区是用户主动表达过的、最有信息量的那一部分。
 *
 * ⚠️ token 估算复用 `utils/tokens.js` 的 `estimateTokens`（单源，含 CJK 加权），
 *    不要在这里另写一套。
 */
export const captureCurrentPageContext = () => {
  if (typeof document === 'undefined') return null;
  const selection = String(window.getSelection?.()?.toString?.() || '')
    .trim()
    .slice(0, MAX_PAGE_CONTEXT_CHARS);
  const description = String(
    document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
  )
    .trim()
    .slice(0, 400);

  const ctx = {
    title: String(document.title || '')
      .trim()
      .slice(0, 200),
    url: String(window.location?.href || ''),
    description,
    selection,
    content: '',
  };
  if (!ctx.title && !ctx.url && !ctx.selection) return null;

  ctx.tokenEstimate = Math.max(
    1,
    Math.round(estimateTokens([ctx.title, ctx.description, ctx.selection].join('\n'))),
  );
  return ctx;
};
