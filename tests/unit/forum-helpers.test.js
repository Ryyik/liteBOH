import { describe, expect, it } from 'vitest';
import { buildReplyDraft, truncateTextSafe, escapeHtml } from '../../src/utils/forum-helpers.js';

// ============================================================
// buildReplyDraft：单参数提及格式（引用内容已移除，仅生成 @提及）
// ============================================================
describe('buildReplyDraft', () => {
  it('有效 username 生成 @提及 + 尾随空格', () => {
    expect(buildReplyDraft('testuser')).toBe('@testuser ');
  });

  it('参数为 null/undefined/空字符串时返回空字符串', () => {
    expect(buildReplyDraft(null)).toBe('');
    expect(buildReplyDraft(undefined)).toBe('');
    expect(buildReplyDraft('')).toBe('');
    expect(buildReplyDraft()).toBe('');
  });

  it('username 仅有空白字符时返回空字符串', () => {
    expect(buildReplyDraft('   ')).toBe('');
  });

  it('包含特殊字符的 username 正常拼接', () => {
    expect(buildReplyDraft('user_123')).toBe('@user_123 ');
  });

  it('中文用户名正常处理', () => {
    expect(buildReplyDraft('测试用户')).toBe('@测试用户 ');
  });

  it('参数是数字类型时转为字符串处理', () => {
    // Number 会被 String() 转为字符串
    expect(buildReplyDraft(12345)).toBe('@12345 ');
  });
});

// ============================================================
// Bug #6 修复验证: truncateTextSafe 按码点截断，不产生乱码
// ============================================================
describe('truncateTextSafe', () => {
  it('短文本不截断', () => {
    expect(truncateTextSafe('hello', 20)).toBe('hello');
    expect(truncateTextSafe('你好世界', 20)).toBe('你好世界');
  });

  it('超长文本按码点截断', () => {
    const longText = '这是一段超过二十个字符的中文测试文本内容需要被截断';
    expect(truncateTextSafe(longText, 20)).toBe('这是一段超过二十个字符的中文测试文本内容');
    expect([...truncateTextSafe(longText, 20)].length).toBe(20);
  });

  it('包含 emoji 时不会截断在中间产生乱码', () => {
    // "😀" 在 UTF-16 中占 2 个 code unit，用 substring(0,1) 会截断
    const textWithEmoji = '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀'; // 21 个 emoji
    const result = truncateTextSafe(textWithEmoji, 20);
    expect([...result].length).toBe(20);
    // 确保没有产生替换字符 U+FFFD
    expect(result).not.toContain('\uFFFD');
  });

  it('混合中英文和 emoji 正确截断', () => {
    const mixed = 'Hello你好😀World世界🌍Test测试';
    // 总字符数（按码点）: 5 + 2 + 1 + 5 + 2 + 1 + 4 + 2 = 22
    const result = truncateTextSafe(mixed, 20);
    expect([...result].length).toBe(20);
    expect(result).not.toContain('\uFFFD');
  });

  it('text 为 null/undefined 时返回空字符串', () => {
    expect(truncateTextSafe(null, 20)).toBe('');
    expect(truncateTextSafe(undefined, 20)).toBe('');
  });

  it('默认 maxChars 为 20', () => {
    const text = 'a'.repeat(30);
    expect(truncateTextSafe(text).length).toBe(20);
  });

  it('text.length 已经小于 maxChars 时不进行码点展开', () => {
    // 纯 ASCII 字符串的 length 等于码点数，走快速路径
    const ascii = 'hello';
    expect(truncateTextSafe(ascii, 20)).toBe('hello');
  });
});

// ============================================================
// escapeHtml 基础验证
// ============================================================
describe('escapeHtml', () => {
  it('转义 HTML 特殊字符', () => {
    expect(escapeHtml('<script>alert("XSS")</script>'))
      .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });

  it('转义单引号', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('转义 & 符号', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('空值和 undefined 安全处理', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});