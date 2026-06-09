import { describe, it, expect } from 'vitest';
import {
  containsStackTrace,
  hasDebugIntentKeyword,
  sniffLanguage,
  isDebugRequest,
  extractErrorSummary,
  buildDebugPromptAppendix,
  analyzeDebugRequest
} from '../../src/utils/bohai-debug-detector.js';

describe('bohai-debug-detector: stack trace detection', () => {
  it('detects Node.js-style stack', () => {
    const text = `TypeError: Cannot read properties of undefined
    at handleRequest (/app/server.js:42:7)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)`;
    expect(containsStackTrace(text)).toBe(true);
  });

  it('detects Python Traceback', () => {
    const text = `Traceback (most recent call last):
  File "/app/main.py", line 12, in <module>
    foo()
  File "/app/main.py", line 8, in foo
    raise ValueError("bad")
ValueError: bad`;
    expect(containsStackTrace(text)).toBe(true);
  });

  it('detects Java exception in thread', () => {
    const text = `Exception in thread "main" java.lang.NullPointerException
    at com.example.App.process(App.java:25)`;
    expect(containsStackTrace(text)).toBe(true);
  });

  it('detects Node error codes', () => {
    expect(containsStackTrace('Error: ECONNREFUSED 127.0.0.1:5432')).toBe(true);
  });

  it('detects HTTP 5xx', () => {
    expect(containsStackTrace('Server returned HTTP/1.1 502 Bad Gateway')).toBe(true);
  });

  it('returns false for non-code text', () => {
    expect(containsStackTrace('我今天心情不太好')).toBe(false);
    expect(containsStackTrace('')).toBe(false);
    expect(containsStackTrace(null)).toBe(false);
  });
});

describe('bohai-debug-detector: debug intent', () => {
  it('matches Chinese debug keywords', () => {
    expect(hasDebugIntentKeyword('帮我看看这个报错')).toBe(true);
    expect(hasDebugIntentKeyword('代码崩溃了')).toBe(true);
    expect(hasDebugIntentKeyword('接口超时')).toBe(true);
  });

  it('matches English debug keywords', () => {
    expect(hasDebugIntentKeyword('help me debug this exception')).toBe(true);
  });

  it('does NOT match emotional "崩溃"', () => {
    // 单独"崩溃"会命中，但 isDebugRequest 会要求代码标记，避免误判
    expect(hasDebugIntentKeyword('我崩溃了')).toBe(true);
    expect(isDebugRequest('我崩溃了')).toBe(false);
  });
});

describe('bohai-debug-detector: language sniffing', () => {
  it('sniffs JavaScript from keywords + error type', () => {
    expect(sniffLanguage('const foo = bar;\nTypeError: Cannot read property')).toBe('javascript');
  });

  it('sniffs Python from Traceback + def', () => {
    expect(sniffLanguage('Traceback (most recent call last)\n  def foo():')).toBe('python');
  });

  it('sniffs Java from "at x.y.z" + class', () => {
    expect(sniffLanguage('at com.example.Foo.bar(Foo.java:42)\npublic class Foo {}')).toBe('java');
  });

  it('sniffs SQL from MySQL error', () => {
    expect(sniffLanguage('1064 [Error]: You have an error in your SQL syntax')).toBe('sql');
  });

  it('returns empty string when no signal', () => {
    expect(sniffLanguage('hello world')).toBe('');
  });
});

describe('bohai-debug-detector: isDebugRequest', () => {
  it('returns true for stack trace', () => {
    expect(isDebugRequest('TypeError: x is undefined\n  at foo (a.js:1:1)')).toBe(true);
  });

  it('returns true for debug intent + code markers', () => {
    expect(isDebugRequest('帮我看这个报错: function foo() { return undefined.x; }')).toBe(true);
  });

  it('returns false for emotional "崩溃"', () => {
    expect(isDebugRequest('我崩溃了')).toBe(false);
  });

  it('returns false for short casual text', () => {
    expect(isDebugRequest('你好')).toBe(false);
  });
});

describe('bohai-debug-detector: error summary', () => {
  it('extracts first Error/Exception line', () => {
    const text = `node v18.0.0
TypeError: Cannot read properties of undefined
    at /app/index.js:5:10
    at process.processTicksAndRejections`;
    expect(extractErrorSummary(text)).toBe('TypeError: Cannot read properties of undefined');
  });

  it('caps summary at 200 chars', () => {
    const long = 'Error: ' + 'a'.repeat(500);
    const summary = extractErrorSummary(long);
    expect(summary.length).toBe(200);
  });
});

describe('bohai-debug-detector: prompt appendix', () => {
  it('contains the 4-step structure', () => {
    const md = buildDebugPromptAppendix({ text: 'TypeError: x', language: 'javascript' });
    expect(md).toContain('根因分析');
    expect(md).toContain('复现路径');
    expect(md).toContain('修复方案');
    expect(md).toContain('验证步骤');
  });

  it('includes the language hint', () => {
    const md = buildDebugPromptAppendix({ text: 'TypeError', language: 'python' });
    expect(md).toContain('python');
  });
});

describe('bohai-debug-detector: end-to-end analyzeDebugRequest', () => {
  it('returns isDebug: false for casual text', () => {
    const r = analyzeDebugRequest('今天天气怎么样');
    expect(r.isDebug).toBe(false);
  });

  it('returns full payload for stack trace', () => {
    const r = analyzeDebugRequest('TypeError: x is undefined\n  at foo (a.js:1:1)');
    expect(r.isDebug).toBe(true);
    expect(r.language).toBe('javascript');
    expect(r.summary).toContain('TypeError');
    expect(r.promptAppendix).toContain('根因分析');
  });
});
