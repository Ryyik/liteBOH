/**
 * post.js — 帖子标题/正文解析 + 关系缺失错误判定
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import { normalizePromptLine } from '../text/normalize.js';

export const isMissingRelationError = (error, relation = '') => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const target = String(relation || '').toLowerCase();
  if (code === '42P01') return true;
  if (!target) return false;
  return message.includes(target);
};

export const parsePostTitleAndBody = (rawContent) => {
  const raw = String(rawContent || '').trim();
  if (!raw) {
    return { title: '无标题', body: '' };
  }

  const matched = raw.match(/^【([^】]{1,80})】\s*([\s\S]*)$/u);
  if (matched) {
    const parsedTitle = normalizePromptLine(matched[1], 48) || '无标题';
    const parsedBody = normalizePromptLine(matched[2], 600);
    return { title: parsedTitle, body: parsedBody };
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const firstLine = normalizePromptLine(lines[0], 48) || '无标题';
  return { title: firstLine, body: normalizePromptLine(raw, 600) };
};

export const getPostTitleAndBody = (post = {}) => {
  const explicitTitle = normalizePromptLine(post?.title, 80);
  const explicitBody = normalizePromptLine(post?.body, 900);
  if (explicitTitle || explicitBody) {
    return {
      title: explicitTitle || '无标题',
      body: explicitBody || normalizePromptLine(post?.content, 900),
    };
  }
  return parsePostTitleAndBody(post?.content);
};
