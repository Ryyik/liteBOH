/**
 * boh-markdown.js — BOH AI 消息的 markdown 渲染（从 `BOHAIMain.vue` 原样迁出）
 *
 * plans/025 v2 · Step 6-3：`renderMarkdown` 原本长在壳里（`BOHAIMain.vue`），
 * 但它的唯一消费方是消息流（`BohChatStream.vue`）⇒ 随块搬到消息流侧，
 * **逐字保留**原实现（marked 配置 / hljs 语言子集 / 缓存上限 160 / DOMPurify 白名单）。
 *
 * ⚠️ 安全口径不变：`marked.parse` 的输出**必须过 `DOMPurify.sanitize`**（白名单见下）。
 * ⚠️ 缓存是**模块级**的，`Map` 超过 160 条就淘汰最早一条（原实现同款）。
 */
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import 'highlight.js/styles/github.css';
import DOMPurify from '@/utils/dompurify.js';

const HIGHLIGHT_LANGUAGE_SUBSET = [
  'javascript',
  'typescript',
  'json',
  'bash',
  'xml',
  'css',
  'markdown',
  'python',
];

const MARKDOWN_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
    'del',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
};

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);

marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        return hljs.highlightAuto(code, HIGHLIGHT_LANGUAGE_SUBSET).value;
      }
    }
    return hljs.highlightAuto(code, HIGHLIGHT_LANGUAGE_SUBSET).value;
  },
  breaks: true,
  gfm: true,
});

const MARKDOWN_CACHE_LIMIT = 160;
const markdownRenderCache = new Map();

export const renderMarkdown = (content) => {
  if (!content) return '';
  const source = typeof content === 'string' ? content : JSON.stringify(content);
  const cached = markdownRenderCache.get(source);
  if (cached) return cached;
  const parsed = marked.parse(source);
  const parsedHtml = typeof parsed === 'string' ? parsed : String(parsed || '');
  const sanitized = DOMPurify.sanitize(parsedHtml, MARKDOWN_SANITIZE_OPTIONS);
  markdownRenderCache.set(source, sanitized);
  if (markdownRenderCache.size > MARKDOWN_CACHE_LIMIT) {
    const firstKey = markdownRenderCache.keys().next().value;
    markdownRenderCache.delete(firstKey);
  }
  return sanitized;
};

export const clearMarkdownCache = () => markdownRenderCache.clear();
