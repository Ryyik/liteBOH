import { describe, it, expect } from 'vitest';
import {
  buildWordHtml,
  buildConversationCsv,
  buildRichTextHtml,
  sanitizeFilename,
  SUPPORTED_EXPORT_FORMATS
} from '../../src/utils/bohai-message-exporter.js';

describe('bohai-message-exporter: word html', () => {
  it('builds a Word-compatible HTML wrapper', () => {
    const html = buildWordHtml('# 标题\n\n内容', { title: '测试' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('xmlns:w=');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<p>内容</p>');
  });

  it('escapes html special characters', () => {
    const html = buildWordHtml('a < b & c > d', { title: 'x' });
    expect(html).toContain('a &lt; b &amp; c &gt; d');
  });

  it('preserves code fences as pre/code', () => {
    const html = buildWordHtml('```js\nconst x = 1;\n```', { title: 'x' });
    expect(html).toContain('<pre');
    expect(html).toContain('const x = 1;');
  });
});

describe('bohai-message-exporter: csv', () => {
  it('wraps fields containing comma, quote, or newline', () => {
    const csv = buildConversationCsv([
      { role: 'user', content: 'hi, "friend"\nnext line' },
      { role: 'assistant', content: 'ok' }
    ], { withBom: false });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('轮次,角色,时间,内容');
    expect(lines[1]).toContain('"hi, ""friend""');
    expect(lines[1]).toContain('next line"');
  });

  it('adds UTF-8 BOM by default for Excel compatibility', () => {
    const csv = buildConversationCsv([{ role: 'user', content: '中文' }]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });
});

describe('bohai-message-exporter: rich text', () => {
  it('converts ** / ` / # to html tags', () => {
    const html = buildRichTextHtml('**粗体** 和 `代码`\n\n# 标题\n\n正文');
    expect(html).toContain('<strong>粗体</strong>');
    expect(html).toContain('<code>代码</code>');
    expect(html).toContain('<h1>标题</h1>');
  });

  it('handles *italic* and unordered lists', () => {
    const html = buildRichTextHtml('*斜体*\n\n- 项一\n- 项二');
    expect(html).toContain('<em>斜体</em>');
    expect(html).toContain('<li>项一</li>');
    expect(html).toContain('<li>项二</li>');
  });
});

describe('bohai-message-exporter: filename safety', () => {
  it('strips path separators and illegal chars', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('falls back to default when empty', () => {
    expect(sanitizeFilename('')).toBe('bohai');
    expect(sanitizeFilename('///')).toBe('bohai');
  });

  it('caps length to 80 chars', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeFilename(long).length).toBe(80);
  });
});

describe('bohai-message-exporter: format list', () => {
  it('exposes supported formats', () => {
    expect(SUPPORTED_EXPORT_FORMATS).toEqual(['markdown', 'word', 'csv', 'rtf', 'pdf']);
  });
});
