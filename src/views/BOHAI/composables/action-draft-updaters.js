import {
  ACTION_DRAFT_CONTENT_MAX_CHARS,
  ACTION_DRAFT_TITLE_MAX_CHARS
} from './chat-engine-config.js';
import {
  extractFieldUntilNextLabel,
  extractMultilineField,
  extractSingleLineField,
  normalizePromptLine
} from './bohai-engine-helpers.js';

export const updatePostDraftFromText = (draft, text) => {
  const safeText = String(text || '').trim();
  if (!safeText || !draft) return false;
  let changed = false;

  const nextTitle = normalizePromptLine(
    extractFieldUntilNextLabel(safeText, ['标题', 'title'], ['内容', '正文', 'body'], ACTION_DRAFT_TITLE_MAX_CHARS)
    || extractSingleLineField(safeText, ['标题', 'title']),
    ACTION_DRAFT_TITLE_MAX_CHARS
  );
  if (nextTitle) {
    draft.postTitle = nextTitle;
    changed = true;
  }

  const nextContent = normalizePromptLine(
    extractFieldUntilNextLabel(safeText, ['内容', '正文', 'body'], [], ACTION_DRAFT_CONTENT_MAX_CHARS)
    || extractMultilineField(safeText, ['内容', '正文', 'body'], ACTION_DRAFT_CONTENT_MAX_CHARS),
    ACTION_DRAFT_CONTENT_MAX_CHARS
  );
  if (nextContent) {
    draft.postContent = nextContent;
    changed = true;
  }

  if (!changed) {
    draft.postContent = normalizePromptLine(safeText, ACTION_DRAFT_CONTENT_MAX_CHARS);
    changed = true;
  }

  return changed;
};
