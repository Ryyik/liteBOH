/**
 * post-draft.js — 发帖 / 页面草稿的本地构建（领域数据 + 解析规则）
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 2「domain 数据沉淀」
 * 与 Step 3「utils 归位」合并推进）。值逐字不变；`bohai-engine-helpers.js` 仍作为临时 barrel 转出口。
 *
 * ⚠️ `POST_DRAFT_*` 两条模式是**领域知识**（中文「发帖」意图的噪音词表），逐字保留、禁止重新发明。
 */
import {
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS,
  ACTION_POST_TRIGGER_PATTERN,
} from '../composables/chat-engine-config.js';
import { normalizePromptLine } from '../utils/text/normalize.js';

export const normalizeActionInput = (text) =>
  String(text || '')
    .replace(/\r/g, '')
    .trim();

export const stripLeadingActionPhrase = (text) => {
  let output = String(text || '').trim();
  output = output.replace(/^(请你|请帮我|帮我|替我|代我|我想|我要|帮忙)\s*/i, '');
  output = output.replace(/^(给我|帮我)\s*/i, '');
  return output.trim();
};

export const extractSingleLineField = (text, labels = []) => {
  const safeText = String(text || '');
  const joined = labels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!joined) return '';
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${joined})\\s*[：:]\\s*([^\\n]{1,220})`, 'i');
  const matched = safeText.match(pattern);
  return normalizePromptLine(matched?.[1] || '', 220);
};

export const extractMultilineField = (
  text,
  labels = [],
  maxChars = ACTION_DRAFT_CONTENT_MAX_CHARS,
) => {
  const safeText = String(text || '');
  const joined = labels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!joined) return '';
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${joined})\\s*[：:]\\s*([\\s\\S]+)$`, 'i');
  const matched = safeText.match(pattern);
  return normalizePromptLine(matched?.[1] || '', maxChars);
};

export const trimLeadingDraftDelimiters = (text) =>
  String(text || '')
    .replace(/^[，,。；;、\s]+/g, '')
    .trim();

export const extractFieldUntilNextLabel = (
  text,
  labels = [],
  nextLabels = [],
  maxChars = ACTION_DRAFT_CONTENT_MAX_CHARS,
) => {
  const safeText = String(text || '');
  const joined = labels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!joined) return '';

  const nextJoined = nextLabels
    .map((label) => String(label || '').trim())
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const lookAhead = nextJoined ? `(?=(?:\\s*(?:${nextJoined})\\s*[：:])|$)` : '$';
  const pattern = new RegExp(`(?:${joined})\\s*[：:]\\s*([\\s\\S]*?)${lookAhead}`, 'i');
  const matched = safeText.match(pattern);
  return normalizePromptLine(trimLeadingDraftDelimiters(matched?.[1] || ''), maxChars);
};

export const cleanPostDraftIdeaText = (text) => {
  let ideaText = stripLeadingActionPhrase(text);
  ideaText = ideaText.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
  ideaText = ideaText.replace(/(?:标题|title)\s*[：:][^\n]+/gi, ' ');
  ideaText = ideaText.replace(/(?:内容|正文|body|想法)(?:是)?\s*[：:]/gi, ' ');
  ideaText = ideaText.replace(/^(?:请你|请帮我|帮我|替我|代我|我想|我要|帮忙|麻烦你?)\s*/gi, ' ');
  ideaText = ideaText.replace(
    /^(?:起草|生成|写|整理)\s*(?:一条|一篇|一个)?\s*(?:论坛|社区|帖子|发布文案|标题和正文)\s*/gi,
    ' ',
  );
  return normalizePromptLine(trimLeadingDraftDelimiters(ideaText), ACTION_DRAFT_CONTENT_MAX_CHARS);
};

export const stripPostDraftTitleNoise = (text) =>
  normalizePromptLine(text, ACTION_DRAFT_TITLE_MAX_CHARS)
    .replace(/^(?:AI草稿|草稿|标题|帖子|论坛|社区)\s*[：:：-]?\s*/i, '')
    .replace(/^(?:关于|有关)\s*/, '')
    .replace(/^(?:我最近|最近|我发现|我想|想问问大家|想和大家聊聊|请教一下)\s*/i, '')
    .replace(/(?:想问问大家|大家怎么看|有没有人遇到|有没有遇到过|欢迎大家).*/i, '')
    .trim();

export const buildLocalPostDraftTitle = (text) => {
  const safeText = normalizePromptLine(text, ACTION_DRAFT_CONTENT_MAX_CHARS);
  const firstSentence =
    safeText
      .split(/[。！？!?；;\n]/)
      .map((item) => item.trim())
      .find(Boolean) || safeText;
  const cleaned = stripPostDraftTitleNoise(firstSentence)
    .replace(/^(?:这个|这件事|这个情况)\s*/, '')
    .replace(/[，,、：:]\s*$/g, '')
    .trim();

  if (cleaned.length >= 4) {
    const clipped = cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
    return normalizePromptLine(clipped, ACTION_DRAFT_TITLE_MAX_CHARS);
  }

  return '想听听大家的看法';
};

export const buildLocalPostDraftContent = (text) => {
  const ideaText = cleanPostDraftIdeaText(text);
  if (!ideaText) return '';

  const hasQuestionTone =
    /(吗|么|怎么办|怎么|如何|为什么|原因|有没有|是否|可不可以|行不行|建议|办法|解决)/.test(
      ideaText,
    );
  const endMark = /[。！？!?]$/.test(ideaText) ? '' : '。';
  const lead = hasQuestionTone ? '我想和大家请教一下：' : '我想和大家分享一个想法：';
  const tail = hasQuestionTone
    ? '如果你也遇到过类似情况，欢迎分享一下原因、处理办法或经验。'
    : '也想听听大家怎么看，欢迎补充不同的经验或建议。';

  return normalizePromptLine(
    `${lead}${ideaText}${endMark}\n\n${tail}`,
    ACTION_DRAFT_CONTENT_MAX_CHARS,
  );
};

export const isWeakPostDraftTitle = (title, rawText, content) => {
  const normalizedTitle = normalizePromptLine(title, ACTION_DRAFT_TITLE_MAX_CHARS);
  if (!normalizedTitle) return true;
  if (/^(?:AI草稿|草稿|帮我|请帮我|请你|我要|我想|生成|起草|写|整理|发帖)/i.test(normalizedTitle))
    return true;

  const compactTitle = normalizedTitle.replace(/\s+/g, '');
  const compactRaw = normalizePromptLine(rawText, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(
    /\s+/g,
    '',
  );
  const compactContent = normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(
    /\s+/g,
    '',
  );
  if (compactRaw && compactTitle === compactRaw) return true;
  if (compactContent && compactTitle.length > 18 && compactContent.startsWith(compactTitle))
    return true;
  return false;
};

export const buildPostDraftFromText = (text) => {
  const safeText = normalizeActionInput(text);
  const normalized = stripLeadingActionPhrase(safeText);
  const explicitTitle =
    extractFieldUntilNextLabel(
      normalized,
      ['标题', 'title'],
      ['内容', '正文', 'body'],
      ACTION_DRAFT_TITLE_MAX_CHARS,
    ) || extractSingleLineField(normalized, ['标题', 'title']);
  let content =
    extractFieldUntilNextLabel(
      normalized,
      ['内容', '正文', 'body'],
      [],
      ACTION_DRAFT_CONTENT_MAX_CHARS,
    ) ||
    extractMultilineField(normalized, ['内容', '正文', 'body'], ACTION_DRAFT_CONTENT_MAX_CHARS);

  if (!content) {
    let fallback = normalized;
    fallback = fallback.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
    fallback = fallback.replace(/(?:标题|title)\s*[：:][^\n]+/gi, '');
    fallback = fallback.replace(/(?:内容|正文|body|想法)(?:是)?\s*[：:]/gi, '');
    content = buildLocalPostDraftContent(trimLeadingDraftDelimiters(fallback));
  }

  if (!content) {
    content = '（请在这里填写帖子正文）';
  }

  const suggestedTitle = buildLocalPostDraftTitle(content);
  const title = normalizePromptLine(explicitTitle || suggestedTitle, ACTION_DRAFT_TITLE_MAX_CHARS);

  return {
    title,
    content: normalizePromptLine(content, ACTION_DRAFT_CONTENT_MAX_CHARS),
  };
};

/**
 * Noise pattern for post draft idea extraction.
 *
 * NOTE (2026-06-09): Core Chinese conjunctions (和/与/并且/然后/可以/需要)
 * are intentionally excluded from noise removal per P1-B-6 fix.
 * Only directive/action verbs are stripped.
 */
export const POST_DRAFT_IDEA_NOISE_PATTERN =
  /(帮我|替我|代我|请帮我|请你|我想|我要|想要|麻烦|先|直接|自动|起草|生成|写|整理|发布|发出去|标题|正文|内容|文案|草稿|一下|一条|一篇|一个|论坛|社区|帖子|发帖|发布文案|编辑后|可直接)/g;
export const POST_DRAFT_PLACEHOLDER_PATTERN =
  /(请在这里填写帖子正文|先起草标题和正文|起草标题和正文|标题和正文|发帖内容|发布文案)/;

export const hasPostDraftUserIdea = (rawText, draft = {}) => {
  const raw = normalizePromptLine(rawText, ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (!raw) return false;
  const fallbackContent = normalizePromptLine(draft.content, ACTION_DRAFT_CONTENT_MAX_CHARS);
  if (!fallbackContent || POST_DRAFT_PLACEHOLDER_PATTERN.test(fallbackContent)) return false;

  const explicitBody = extractFieldUntilNextLabel(
    raw,
    ['内容', '正文', 'body', '想法'],
    [],
    ACTION_DRAFT_CONTENT_MAX_CHARS,
  );
  if (explicitBody && explicitBody.replace(/\s+/g, '').length >= 4) return true;

  let ideaText = raw;
  ideaText = ideaText.replace(new RegExp(ACTION_POST_TRIGGER_PATTERN.source, 'ig'), ' ');
  ideaText = ideaText.replace(/(?:标题|title)\s*[：:][^\n]+/gi, ' ');
  ideaText = ideaText.replace(/(?:内容|正文|body|想法)\s*[：:]/gi, ' ');
  ideaText = ideaText.replace(POST_DRAFT_IDEA_NOISE_PATTERN, ' ');
  ideaText = normalizePromptLine(ideaText, ACTION_DRAFT_CONTENT_MAX_CHARS).replace(/\s+/g, '');
  return ideaText.length >= 4;
};

export const buildPageDraftFromText = (text) => {
  const safeText = normalizeActionInput(text);
  const normalized = stripLeadingActionPhrase(safeText);
  const pageTypeMatched = normalized.match(
    /(首页|主页|落地页|活动页|公告页|展示页|介绍页|个人介绍|作品集|登录页|注册页|关于页|联系我们|产品页|宣传页|推广页|营销页)/,
  );
  const pageType = pageTypeMatched?.[1] || '展示页';
  const description =
    extractMultilineField(normalized, ['描述', '要求', '需求', '说明'], 420) ||
    normalized
      .replace(
        /(创建网页|创建页面|生成网页|生成页面|做个网页|做个页面|做个主页|做个落地页|搭建网页|搭建页面|设计网页|设计页面|建个网页|建个页面|制作网页|制作页面|网页设计|页面设计)/gi,
        '',
      )
      .replace(
        /(首页|主页|落地页|活动页|公告页|展示页|介绍页|个人介绍|作品集|登录页|注册页|关于页|联系我们|产品页|宣传页|推广页|营销页)/g,
        '',
      )
      .replace(/(帮我|替我|代我|请帮我|请你|我想|我要|想要|需要|帮忙)/gi, '')
      .trim();
  return {
    pageType,
    description: normalizePromptLine(description || '一个简洁美观的展示页面', 420),
  };
};
