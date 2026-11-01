import { describe, it, expect } from 'vitest';
import { resolveShellChunks } from '../../scripts/lib/shell-chunk-resolve.mjs';

/**
 * 这段判定的职责不是「让日志好看」，而是「在合并分块这种跨平台差异下，
 * 仍然对真正的缺失报警」。所以每个用例都按「它必须会红」的方向写：
 * 只要把判定改成无条件静音，第 3、4 例就会失败。
 */

const chunk = (fileName, modules = [], isEntry = false) => ({
  fileName,
  isEntry,
  modules: Object.fromEntries(modules.map((m) => [m, {}])),
});

const levels = (messages) => messages.map((m) => m.level);

describe('resolveShellChunks', () => {
  it('独立成 chunk：收进 shellJs，不产生任何消息', () => {
    const { shellJs, messages } = resolveShellChunks({
      chunks: [
        chunk('static/js/app-abc123.js', ['/repo/src/main.js'], true),
        chunk('static/js/auth-api-D6X.js', ['/repo/src/utils/api/auth-api.js']),
      ],
      shellChunks: ['auth-api'],
    });

    expect(messages).toEqual([]);
    expect([...shellJs]).toContain('auth-api-D6X.js');
  });

  it('被并入入口 chunk：降级为 info（Linux CI 的跨平台分块差异，覆盖不受影响）', () => {
    const { shellJs, messages } = resolveShellChunks({
      chunks: [
        chunk(
          'static/js/app-abc123.js',
          ['/repo/src/main.js', '/repo/src/utils/api/auth-api.js'],
          true,
        ),
      ],
      shellChunks: ['auth-api'],
    });

    expect(levels(messages)).toEqual(['info']);
    expect(messages[0].text).toContain('已并入 app-abc123.js');
    expect([...shellJs]).toContain('app-abc123.js');
  });

  it('被并入非壳 chunk：仍然 warn —— 真警报不允许被静音', () => {
    const { messages } = resolveShellChunks({
      chunks: [
        chunk('static/js/app-abc123.js', ['/repo/src/main.js'], true),
        chunk('static/js/DataAdmin-DFep.js', ['/repo/src/utils/api/auth-api.js']),
      ],
      shellChunks: ['auth-api'],
    });

    expect(levels(messages)).toEqual(['warn']);
    expect(messages[0].text).toContain('不在壳预缓存范围');
  });

  it('产物里彻底没有该模块：仍然 warn', () => {
    const { messages } = resolveShellChunks({
      chunks: [chunk('static/js/app-abc123.js', ['/repo/src/main.js'], true)],
      shellChunks: ['auth-api'],
    });

    expect(levels(messages)).toEqual(['warn']);
    expect(messages[0].text).toContain('在产物里找不到');
  });

  it('shellJs 始终包含入口 chunk，供壳样式范围计算使用', () => {
    const { shellJs } = resolveShellChunks({
      chunks: [
        chunk('static/js/app-abc123.js', ['/repo/src/main.js'], true),
        chunk('static/js/ui-icons-BDvW.js', ['/repo/src/components/icons/index.js']),
      ],
      shellChunks: ['ui-icons'],
    });

    expect(shellJs.has('app-abc123.js')).toBe(true);
    expect(shellJs.has('ui-icons-BDvW.js')).toBe(true);
  });
});
