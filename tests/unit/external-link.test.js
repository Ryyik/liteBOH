import { describe, expect, it } from 'vitest';
import { toSafeExternalHref, toSafeNavHref } from '../../src/utils/external-link.js';

/**
 * 这两条断言是**反证式**的：把实现退回「原样 trim 后直接用」，
 * 第一个用例就会红 —— 这正是 2026-11-05 审查里那条
 * 「联网搜索的 url 未校验协议」的漏洞面。
 */
describe('toSafeExternalHref — 外链协议闸门', () => {
  it('伪协议一律拒绝（javascript: / data: / blob: / vbscript:）', () => {
    expect(toSafeExternalHref('javascript:alert(1)')).toBe('');
    expect(toSafeExternalHref('JaVaScRiPt:alert(1)')).toBe('');
    expect(toSafeExternalHref('  javascript:alert(1)')).toBe('');
    expect(toSafeExternalHref('java\tscript:alert(1)')).toBe('');
    expect(toSafeExternalHref('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(toSafeExternalHref('blob:https://x/y')).toBe('');
    expect(toSafeExternalHref('vbscript:msgbox(1)')).toBe('');
  });

  it('只放行 http / https，并归一化成绝对地址', () => {
    expect(toSafeExternalHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(toSafeExternalHref('http://example.com')).toBe('http://example.com/');
  });

  it('空值 / 非字符串 / 解析失败都返回空串', () => {
    expect(toSafeExternalHref('')).toBe('');
    expect(toSafeExternalHref(null)).toBe('');
    expect(toSafeExternalHref(undefined)).toBe('');
    expect(toSafeExternalHref('not a url')).toBe('');
    expect(toSafeExternalHref('/relative/path')).toBe('');
  });
});

describe('toSafeNavHref — 站内路径放宽一档', () => {
  it('站内绝对路径放行', () => {
    expect(toSafeNavHref('/user-space?tab=posts')).toBe('/user-space?tab=posts');
  });

  it('协议相对地址（//host）当外链处理：没有 base 解析不出绝对地址 ⇒ 返回空串', () => {
    expect(toSafeNavHref('//evil.example.com/x')).toBe('');
  });

  it('伪协议仍拒绝', () => {
    expect(toSafeNavHref('javascript:alert(1)')).toBe('');
  });
});
