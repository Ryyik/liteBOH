import { describe, it, expect } from 'vitest';
import {
  splitForumPostContent,
  getForumPostParts,
  getForumPostTitle,
  getForumPostBody,
  getForumPostExcerpt,
} from '../../src/utils/forum-post-format.js';

describe('splitForumPostContent', () => {
  it('returns default title and empty body for empty input', () => {
    expect(splitForumPostContent('')).toEqual({ title: '无标题', body: '' });
  });

  it('returns default title and raw body when no 【】 wrapper', () => {
    const result = splitForumPostContent('这是一段普通文本');
    expect(result).toEqual({ title: '无标题', body: '这是一段普通文本' });
  });

  it('splits title from body using 【】 delimiter', () => {
    const result = splitForumPostContent('【我的标题】\n这是正文内容');
    expect(result).toEqual({ title: '我的标题', body: '这是正文内容' });
  });

  it('splits title from body without trailing newline', () => {
    const result = splitForumPostContent('【标题】正文直接跟着');
    expect(result).toEqual({ title: '标题', body: '正文直接跟着' });
  });

  it('trims whitespace in title', () => {
    const result = splitForumPostContent('【  带空格的标题  】\n正文');
    expect(result.title).toBe('带空格的标题');
  });

  it('handles empty title in 【】', () => {
    const result = splitForumPostContent('【】\n正文');
    expect(result.title).toBe('无标题');
    expect(result.body).toBe('正文');
  });

  it('handles multiline body', () => {
    const result = splitForumPostContent('【标题】\n第一行\n第二行\n第三行');
    expect(result.title).toBe('标题');
    expect(result.body).toBe('第一行\n第二行\n第三行');
  });

  it('prefers explicit title/body parameters over content parsing', () => {
    const result = splitForumPostContent('', '显式标题', '显式正文');
    expect(result).toEqual({ title: '显式标题', body: '显式正文' });
  });

  it('strips legacy title prefix from explicit body', () => {
    const result = splitForumPostContent('', '我的标题', '【我的标题】正文');
    expect(result).toEqual({ title: '我的标题', body: '正文' });
  });

  it('does not strip unmatched title prefix', () => {
    const result = splitForumPostContent('', '其他标题', '【我的标题】正文');
    expect(result).toEqual({ title: '其他标题', body: '【我的标题】正文' });
  });
});

describe('getForumPostParts', () => {
  it('works with object input', () => {
    const result = getForumPostParts({ content: '【标题】\n正文' });
    expect(result).toEqual({ title: '标题', body: '正文' });
  });

  it('works with string input', () => {
    const result = getForumPostParts('【标题】\n正文');
    expect(result).toEqual({ title: '标题', body: '正文' });
  });

  it('works with object having title and body fields', () => {
    const result = getForumPostParts({ title: '显式标题', body: '显式正文' });
    expect(result).toEqual({ title: '显式标题', body: '显式正文' });
  });
});

describe('getForumPostTitle', () => {
  it('extracts title from post content', () => {
    expect(getForumPostTitle('【标题】\n正文')).toBe('标题');
  });

  it('returns default title when no title found', () => {
    expect(getForumPostTitle('普通文本')).toBe('无标题');
  });
});

describe('getForumPostBody', () => {
  it('extracts body from post content', () => {
    expect(getForumPostBody('【标题】\n正文内容')).toBe('正文内容');
  });

  it('returns empty string for empty content', () => {
    expect(getForumPostBody('')).toBe('');
  });
});

describe('getForumPostExcerpt', () => {
  it('returns full text when shorter than maxLength', () => {
    const excerpt = getForumPostExcerpt('【标题】\n短文本', 50);
    expect(excerpt).toBe('短文本');
  });

  it('truncates text longer than maxLength', () => {
    const excerpt = getForumPostExcerpt('【标题】\n' + 'a'.repeat(100), 10);
    expect(excerpt).toBe('aaaaaaaaaa...');
    expect(excerpt.length).toBe(13); // 10 chars + '...'
  });

  it('falls back to title when body is empty', () => {
    const result = getForumPostExcerpt('【我的标题】', 50);
    expect(result).toBe('我的标题');
  });

  it('returns excerpt from object input', () => {
    const excerpt = getForumPostExcerpt({ content: '【标题】\n正文' });
    expect(excerpt).toBe('正文');
  });
});