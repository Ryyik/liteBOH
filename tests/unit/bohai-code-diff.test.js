import { describe, it, expect } from 'vitest';
import {
  buildDiff,
  summarizeDiff,
  groupDiffIntoHunks,
  renderDiffHtml,
  shouldShowDiff,
  extractFilePathFromCodeBlock,
  extractCodeBlocksWithPaths
} from '../../src/utils/bohai-code-diff.js';

describe('bohai-code-diff: buildDiff', () => {
  it('detects pure addition', () => {
    const diff = buildDiff('', 'line1\nline2');
    expect(diff).toHaveLength(2);
    expect(diff[0].type).toBe('add');
    expect(diff[1].type).toBe('add');
  });

  it('detects pure removal', () => {
    const diff = buildDiff('line1\nline2', '');
    expect(diff.every((d) => d.type === 'remove')).toBe(true);
  });

  it('detects mixed add/remove with equal preserved', () => {
    const original = 'a\nb\nc';
    const modified = 'a\nB\nc';
    const diff = buildDiff(original, modified);
    const summary = summarizeDiff(diff);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
    expect(summary.equal).toBe(2);
  });

  it('handles multi-line change', () => {
    const original = 'line1\nline2\nline3\nline4';
    const modified = 'line1\nNEW\nline3\nline4';
    const diff = buildDiff(original, modified);
    const types = diff.map((d) => d.type);
    expect(types).toContain('remove');
    expect(types).toContain('add');
    expect(types.filter((t) => t === 'equal').length).toBe(3);
  });
});

describe('bohai-code-diff: groupDiffIntoHunks', () => {
  it('groups remove+add into modify hunk', () => {
    const original = 'a\nb\nc';
    const modified = 'a\nB\nc';
    const diff = buildDiff(original, modified);
    const hunks = groupDiffIntoHunks(diff);
    // 期望: 2 个 context(开头 + 结尾) + 1 个 modify hunk
    expect(hunks.length).toBeGreaterThanOrEqual(2);
    const modifyHunk = hunks.find((h) => h.type === 'modify');
    expect(modifyHunk).toBeDefined();
    expect(modifyHunk.oldLines).toHaveLength(1);
    expect(modifyHunk.newLines).toHaveLength(1);
  });

  it('keeps pure add/remove as their own hunks', () => {
    const original = 'a\nb';
    const modified = 'a\nb\nc';
    const diff = buildDiff(original, modified);
    const hunks = groupDiffIntoHunks(diff);
    const addHunk = hunks.find((h) => h.type === 'add');
    expect(addHunk).toBeDefined();
    expect(addHunk.lines).toHaveLength(1);
  });
});

describe('bohai-code-diff: renderDiffHtml', () => {
  it('uses +/-/space prefixes', () => {
    const diff = buildDiff('a', 'b');
    const html = renderDiffHtml(diff);
    expect(html).toContain('diff-line diff-remove');
    expect(html).toContain('>-<');
    expect(html).toContain('diff-line diff-add');
    expect(html).toContain('>+<');
  });

  it('escapes html', () => {
    const diff = buildDiff('<script>', 'a & b');
    const html = renderDiffHtml(diff);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });
});

describe('bohai-code-diff: shouldShowDiff', () => {
  it('returns false for identical content', () => {
    expect(shouldShowDiff('abc', 'abc')).toBe(false);
  });

  it('returns true for moderate change', () => {
    expect(shouldShowDiff('line1\nline2\nline3', 'line1\nNEW\nline3')).toBe(true);
  });

  it('returns false when 95%+ lines change', () => {
    const original = Array.from({ length: 100 }, (_, i) => `old${i}`).join('\n');
    const modified = Array.from({ length: 100 }, (_, i) => `new${i}`).join('\n');
    expect(shouldShowDiff(original, modified)).toBe(false);
  });
});

describe('bohai-code-diff: file path extraction', () => {
  it('extracts path from ```js:path/to/file syntax', () => {
    const raw = '```js:src/utils/foo.js\nconst x = 1;\n```';
    expect(extractFilePathFromCodeBlock(raw)).toBe('src/utils/foo.js');
  });

  it('extracts path from // @file: comment', () => {
    const raw = '```ts\n// @file: src/utils/bar.ts\nconst x: number = 1;\n```';
    expect(extractFilePathFromCodeBlock(raw)).toBe('src/utils/bar.ts');
  });

  it('extracts from # path: comment', () => {
    const raw = '```python\n# path: scripts/run.py\nprint(1)\n```';
    expect(extractFilePathFromCodeBlock(raw)).toBe('scripts/run.py');
  });

  it('returns empty when no path marker', () => {
    expect(extractFilePathFromCodeBlock('```js\nconst x = 1;\n```')).toBe('');
  });
});

describe('bohai-code-diff: extractCodeBlocksWithPaths', () => {
  it('extracts multiple code blocks with paths', () => {
    const md = `Here's the change:

\`\`\`js:src/a.js
const a = 1;
\`\`\`

And another:

\`\`\`ts:src/b.ts
const b: number = 2;
\`\`\`
`;
    const blocks = extractCodeBlocksWithPaths(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].path).toBe('src/a.js');
    expect(blocks[0].lang).toBe('js');
    expect(blocks[1].path).toBe('src/b.ts');
    expect(blocks[1].lang).toBe('ts');
  });

  it('skips blocks without path', () => {
    const md = '```js\nconst x = 1;\n```';
    const blocks = extractCodeBlocksWithPaths(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].path).toBe('');
  });
});
