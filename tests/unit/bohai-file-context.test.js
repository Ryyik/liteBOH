import { describe, it, expect } from 'vitest';
import {
  parseFileContextTags,
  stripFileContextTags,
  truncateFileContent,
  sliceFileByRange,
  buildFileContextBlock,
  estimateContextSize,
  isSafeRelativePath,
  inferLanguageFromPath,
  MAX_FILE_BYTES,
  MAX_CONTEXT_FILES
} from '../../src/utils/bohai-file-context.js';

describe('bohai-file-context: parseFileContextTags', () => {
  it('parses single #file: tag', () => {
    const r = parseFileContextTags('帮我看 #file:src/utils/foo.js 里的 bug');
    expect(r.files).toHaveLength(1);
    expect(r.files[0].path).toBe('src/utils/foo.js');
  });

  it('parses line range', () => {
    const r = parseFileContextTags('看 #file:src/a.js#L10-L30 这段');
    expect(r.files[0].range).toEqual({ start: 10, end: 30 });
  });

  it('parses multiple files and dirs', () => {
    const text = '看 #file:src/a.js 和 #file:src/b.ts#L5-L20，以及 #dir:src/utils';
    const r = parseFileContextTags(text);
    expect(r.files).toHaveLength(2);
    expect(r.dirs).toEqual(['src/utils']);
  });

  it('parses search tags', () => {
    const r = parseFileContextTags('搜 #search:TODO 这关键词');
    expect(r.searches).toEqual(['TODO']);
  });

  it('returns empty arrays for plain text', () => {
    const r = parseFileContextTags('hello world');
    expect(r.files).toEqual([]);
    expect(r.dirs).toEqual([]);
    expect(r.searches).toEqual([]);
  });

  it('handles non-string input', () => {
    expect(parseFileContextTags(null).files).toEqual([]);
    expect(parseFileContextTags(undefined).dirs).toEqual([]);
  });
});

describe('bohai-file-context: stripFileContextTags', () => {
  it('removes tags from message but preserves meaning', () => {
    expect(stripFileContextTags('看 #file:src/a.js 这个文件')).toBe('看 这个文件');
  });

  it('collapses extra spaces', () => {
    expect(stripFileContextTags('a  #file:x.js  b')).toBe('a b');
  });

  it('handles all 3 tag types', () => {
    const r = stripFileContextTags('A #file:x.js B #dir:y C #search:foo D');
    expect(r).toBe('A B C D');
  });
});

describe('bohai-file-context: truncateFileContent', () => {
  it('returns content unchanged when under limit', () => {
    const r = truncateFileContent('short content');
    expect(r.text).toBe('short content');
    expect(r.truncated).toBe(false);
  });

  it('truncates at line boundary when over limit', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
    const r = truncateFileContent(lines, 100);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(lines.length);
    expect(r.text).toContain('已截断');
  });

  it('handles non-string', () => {
    expect(truncateFileContent(null).text).toBe('');
  });
});

describe('bohai-file-context: sliceFileByRange', () => {
  it('extracts a line range', () => {
    const text = 'a\nb\nc\nd\ne';
    const sliced = sliceFileByRange(text, { start: 2, end: 4 });
    expect(sliced).toContain('[L2-L4 / 共 5 行]');
    expect(sliced).toContain('b\nc\nd');
    expect(sliced).not.toContain('a');
    expect(sliced).not.toContain('e');
  });

  it('clamps range to file bounds', () => {
    const text = 'a\nb\nc';
    const sliced = sliceFileByRange(text, { start: 0, end: 100 });
    expect(sliced).toContain('a\nb\nc');
  });
});

describe('bohai-file-context: buildFileContextBlock', () => {
  it('builds a context block with multiple files', () => {
    const block = buildFileContextBlock([
      { path: 'src/a.js', content: 'const a = 1;' },
      { path: 'src/b.ts', content: 'const b: number = 2;', range: { start: 5, end: 10 } }
    ]);
    expect(block).toContain('### src/a.js');
    expect(block).toContain('### src/b.ts (L5-L10)');
    expect(block).toContain('const a = 1;');
  });

  it('respects MAX_CONTEXT_FILES cap', () => {
    const files = Array.from({ length: 30 }, (_, i) => ({
      path: `f${i}.js`,
      content: `c${i}`
    }));
    const block = buildFileContextBlock(files);
    expect(block).toContain('还有 10 个文件未载入');
  });
});

describe('bohai-file-context: isSafeRelativePath', () => {
  it('accepts safe relative paths', () => {
    expect(isSafeRelativePath('src/utils/foo.js')).toBe(true);
    expect(isSafeRelativePath('a/b/c.ts')).toBe(true);
  });

  it('rejects .. traversal', () => {
    expect(isSafeRelativePath('../etc/passwd')).toBe(false);
    expect(isSafeRelativePath('a/../b')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
    expect(isSafeRelativePath('~/foo')).toBe(false);
    expect(isSafeRelativePath('C:\\Windows')).toBe(false);
  });

  it('rejects empty or too-long', () => {
    expect(isSafeRelativePath('')).toBe(false);
    expect(isSafeRelativePath('a'.repeat(501))).toBe(false);
  });
});

describe('bohai-file-context: inferLanguageFromPath', () => {
  it('maps common extensions', () => {
    expect(inferLanguageFromPath('foo.js')).toBe('javascript');
    expect(inferLanguageFromPath('foo.ts')).toBe('typescript');
    expect(inferLanguageFromPath('foo.py')).toBe('python');
    expect(inferLanguageFromPath('foo.vue')).toBe('vue');
    expect(inferLanguageFromPath('foo.md')).toBe('markdown');
  });

  it('returns empty for unknown extensions', () => {
    expect(inferLanguageFromPath('foo.unknownext')).toBe('');
    expect(inferLanguageFromPath('noext')).toBe('');
  });
});

describe('bohai-file-context: constants', () => {
  it('exposes the constants', () => {
    expect(MAX_FILE_BYTES).toBe(8 * 1024);
    expect(MAX_CONTEXT_FILES).toBe(20);
  });
});

describe('bohai-file-context: estimateContextSize', () => {
  it('sums content lengths', () => {
    const size = estimateContextSize([
      { content: 'a'.repeat(100) },
      { content: 'b'.repeat(50) }
    ]);
    expect(size).toBe(150);
  });

  it('handles missing content', () => {
    expect(estimateContextSize([{ content: undefined }])).toBe(0);
    expect(estimateContextSize(null)).toBe(0);
  });
});
