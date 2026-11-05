import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  clip,
  extractRawReports,
  normalizeReport,
  parseCspReports,
  toBlockedHost,
  toLedgerRow,
  toPathOnly,
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
      'dir-0',
      'dir-1',
      'dir-2',
      'dir-3',
      'dir-4',
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

/**
 * 落库形态（2026-11-05，台账 csp_violations）
 *
 * 这一组守的不是「解析对不对」，而是两条**不能被改回去**的性质：
 *   1. 隐私：document-uri 的查询串绝不允许进库（里面有分享 token / 邀请码）；
 *   2. 收敛：同一个第三方域名的不同 URL 必须塌缩成同一个 blocked_host，
 *      否则聚合表就退化成明细表，匿名端点的存储增长重新与流量挂钩。
 */
describe('CSP 台账行归一化', () => {
  describe('toPathOnly —— 隐私边界', () => {
    it('剥掉查询串（分享链接里的 token 不许入库）', () => {
      const path = toPathOnly('https://www.blockofhome.cn/forum/post/123?token=secret-abc&from=wx');

      expect(path).toBe('/forum/post/123');
      expect(path).not.toContain('secret-abc');
      expect(path).not.toContain('?');
    });

    it('剥掉 hash 片段', () => {
      expect(toPathOnly('https://www.blockofhome.cn/shop#order-9527')).toBe('/shop');
    });

    it('非 http(s) 协议只保留协议名（扩展 URL 里的 ID 属于指纹，不留）', () => {
      expect(toPathOnly('chrome-extension://abcdefghijkl/content.js')).toBe('chrome-extension');
      expect(toPathOnly('about:blank')).toBe('about');
    });

    it('不是合法 URL 时按第一个 ? 或 # 截断', () => {
      expect(toPathOnly('/forum/post/1?token=abc')).toBe('/forum/post/1');
    });

    it('空值返回空串，不抛错', () => {
      expect(toPathOnly('')).toBe('');
      expect(toPathOnly(null)).toBe('');
      expect(toPathOnly(undefined)).toBe('');
    });
  });

  describe('toBlockedHost —— 聚合键收敛', () => {
    it('完整 URL 取 host', () => {
      expect(toBlockedHost('https://tracker.example.com/a.js?v=1')).toBe('tracker.example.com');
    });

    it('同一域名下不同路径必须收敛成同一个键（否则表会退化成明细）', () => {
      const a = toBlockedHost('https://cdn.evil.example/a.js');
      const b = toBlockedHost('https://cdn.evil.example/b.js');
      const c = toBlockedHost('https://cdn.evil.example/nested/deep/c.js?x=1');

      expect(a).toBe('cdn.evil.example');
      expect(b).toBe(a);
      expect(c).toBe(a);
    });

    it('浏览器关键字原样保留（inline 与 eval 是要重点观察的两类）', () => {
      expect(toBlockedHost('inline')).toBe('inline');
      expect(toBlockedHost('eval')).toBe('eval');
      expect(toBlockedHost('INLINE')).toBe('inline');
    });

    it('data: / blob: 塌缩成协议名', () => {
      expect(toBlockedHost('data:text/html,<b>x</b>')).toBe('data');
      expect(toBlockedHost('blob:https://www.blockofhome.cn/uuid-1')).toBe('blob');
    });

    it('空值归到 unknown（不产生空字符串主键）', () => {
      expect(toBlockedHost('')).toBe('unknown');
      expect(toBlockedHost(null)).toBe('unknown');
    });

    it('不是 URL 的垃圾值原样截断保留', () => {
      expect(toBlockedHost('some-garbage-value')).toBe('some-garbage-value');
    });
  });

  describe('toLedgerRow —— 与表列一一对应', () => {
    it('完整报告映射成一行（含通道标记）', () => {
      const [report] = parseCspReports({
        type: 'csp-violation',
        body: {
          documentURL: 'https://www.blockofhome.cn/forum?token=abc',
          blockedURL: 'https://evil.example/x.js',
          effectiveDirective: 'script-src-elem',
          disposition: 'report',
        },
      });

      expect(toLedgerRow(report)).toEqual({
        directive: 'script-src-elem',
        blocked_host: 'evil.example',
        disposition: 'report',
        document_path: '/forum',
        format: 'reporting-api',
      });
    });

    it('空报告给出可入库的兜底值（主键列不允许 NULL / 空串）', () => {
      expect(toLedgerRow(normalizeReport({}))).toEqual({
        directive: 'unknown',
        blocked_host: 'unknown',
        disposition: 'report',
        document_path: '',
        format: 'unknown',
      });
    });

    it('legacy 通道同样能映射（两条上报通道都要能落库）', () => {
      const [report] = parseCspReports({
        'csp-report': {
          'document-uri': 'https://www.blockofhome.cn/shop?order=1',
          'blocked-uri': 'inline',
          'effective-directive': 'script-src',
          disposition: 'enforce',
        },
      });

      expect(toLedgerRow(report)).toEqual({
        directive: 'script-src',
        blocked_host: 'inline',
        disposition: 'enforce',
        document_path: '/shop',
        format: 'legacy',
      });
    });
  });
});
