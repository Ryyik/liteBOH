import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  clip,
  extractRawReports,
  normalizeReport,
  parseCspReports,
} from '../../supabase/functions/_shared/csp-report-parser.ts';

/**
 * 这些断言来自线上真实载荷形态，不是想象的样例。
 * 背景：上线后 csp-report 从真实浏览器收到 150+ 次 POST 204，但日志里
 * directive/blocked/document/source 全空、只有 disposition 有值 ——
 * 因为 report-to 通道用的是驼峰键名。下面两组用例分别锁死两条通道。
 */
describe('csp-report 解析：legacy（report-uri）通道', () => {
  const payload = {
    'csp-report': {
      'document-uri': 'https://www.blockofhome.cn/shop',
      'violated-directive': 'script-src-elem',
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'inline',
      'source-file': 'https://www.blockofhome.cn/assets/index-abc.js',
      'line-number': 42,
      disposition: 'report',
    },
  };

  it('连字符键名必须全部读出（不能只剩 disposition）', () => {
    const [report] = parseCspReports(payload);
    expect(report).toMatchObject({
      directive: 'script-src-elem',
      blocked: 'inline',
      document: 'https://www.blockofhome.cn/shop',
      source: 'https://www.blockofhome.cn/assets/index-abc.js',
      line: 42,
      disposition: 'report',
      format: 'legacy',
    });
  });
});

describe('csp-report 解析：report-to（Reporting API）通道', () => {
  it('驼峰键名必须全部读出 —— 这正是线上字段全空的根因', () => {
    const payload = [
      {
        type: 'csp-violation',
        age: 12,
        url: 'https://www.blockofhome.cn/',
        body: {
          documentURL: 'https://www.blockofhome.cn/',
          blockedURL: 'inline',
          effectiveDirective: 'script-src-elem',
          sourceFile: 'https://www.blockofhome.cn/assets/vendor.js',
          lineNumber: 7,
          disposition: 'report',
        },
      },
    ];
    const [report] = parseCspReports(payload);
    // 反证点：旧实现下这四项会全部是空串、line 为 null
    expect(report.directive).toBe('script-src-elem');
    expect(report.blocked).toBe('inline');
    expect(report.document).toBe('https://www.blockofhome.cn/');
    expect(report.source).toBe('https://www.blockofhome.cn/assets/vendor.js');
    expect(report.line).toBe(7);
    expect(report.format).toBe('reporting-api');
  });

  it('单个（非数组）报告对象也要能解析', () => {
    const [report] = parseCspReports({
      type: 'csp-violation',
      body: { documentURL: 'https://a.test/', effectiveDirective: 'img-src' },
    });
    expect(report.directive).toBe('img-src');
    expect(report.document).toBe('https://a.test/');
  });

  it('同一数组里的多条都要取到，且受 limit 约束', () => {
    const payload = Array.from({ length: 9 }, (_, i) => ({
      type: 'csp-violation',
      body: { effectiveDirective: `dir-${i}` },
    }));
    expect(parseCspReports(payload)).toHaveLength(5);
    expect(parseCspReports(payload).map((r) => r.directive)).toEqual([
      'dir-0', 'dir-1', 'dir-2', 'dir-3', 'dir-4',
    ]);
  });
});

describe('csp-report 解析：防御性行为', () => {
  it('两种命名同时出现时，优先取 effective 系列', () => {
    const [report] = parseCspReports({
      'csp-report': {
        'violated-directive': 'default-src',
        'effective-directive': 'img-src',
      },
    });
    expect(report.directive).toBe('img-src');
  });

  it('换行/制表符被压平，不能伪造日志行', () => {
    const [report] = parseCspReports({
      'csp-report': { 'blocked-uri': 'evil\n[csp-report] fake', 'document-uri': 'a\tb' },
    });
    expect(report.blocked).not.toContain('\n');
    expect(report.blocked).toContain('\u0020[csp-report] fake');
    expect(report.document).toBe('a b');
  });

  it('超长字段被截断', () => {
    const [report] = parseCspReports({ 'csp-report': { 'blocked-uri': 'x'.repeat(5000) } });
    expect(report.blocked.length).toBe(300);
  });

  it('非法行号归 null，而不是 NaN', () => {
    for (const bad of ['abc', 0, -1, null, undefined]) {
      const [report] = parseCspReports({ 'csp-report': { 'line-number': bad } });
      expect(report.line).toBeNull();
    }
  });

  it('无关键字的载荷与垃圾输入返回空数组', () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports('hello')).toEqual([]);
    expect(parseCspReports(123)).toEqual([]);
    expect(parseCspReports({})).toEqual([]);
    expect(extractRawReports({ foo: 'bar' })).toEqual([]);
    expect(parseCspReports([{ type: 'csp-violation' }])).toEqual([]);
  });

  it('clip 对 null/undefined 返回空串', () => {
    expect(clip(null)).toBe('');
    expect(clip(undefined)).toBe('');
  });

  it('body 上限常量为 8KB', () => {
    expect(MAX_BODY_BYTES).toBe(8 * 1024);
  });

  it('normalizeReport 对空对象给出全空结构而非抛错', () => {
    expect(normalizeReport({})).toEqual({
      directive: '',
      blocked: '',
      document: '',
      source: '',
      line: null,
      disposition: '',
      format: 'unknown',
      keys: '',
    });
  });

  it('keys 只记录键名（自证形状），不泄露值', () => {
    const [report] = parseCspReports({
      type: 'csp-violation',
      body: { documentURL: 'https://secret.example/path?token=abc', effectiveDirective: 'img-src' },
    });
    expect(report.keys).toBe('documentURL,effectiveDirective');
    expect(report.keys).not.toContain('secret.example');
    expect(report.keys).not.toContain('abc');
  });
});
