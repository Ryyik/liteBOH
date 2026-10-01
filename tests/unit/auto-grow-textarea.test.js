import { describe, expect, it } from 'vitest';
import { resolveAutoGrowHeight } from '@/composables/useAutoGrowTextarea.js';

// 本文件只测「算术」——真实布局（换行点、键盘遮挡、收缩路径）由
// scripts/probes/probe-reply-autogrow.mjs 在浏览器里验，两边不重复。
describe('resolveAutoGrowHeight', () => {
  it('border-box 下把边框补回去（scrollHeight 含内边距、不含边框）', () => {
    // 空内容时 scrollHeight 已含 rows 撑出的高度与内边距：padding 24 + 内容 60 = 84，边框 2
    expect(
      resolveAutoGrowHeight({
        scrollHeight: 84,
        paddingTop: 12,
        paddingBottom: 12,
        borderTop: 1,
        borderBottom: 1,
        boxSizing: 'border-box',
      }),
    ).toBe(86);
  });

  it('content-box 下把内边距减掉（scrollHeight 里那份内边距不该算进 height）', () => {
    expect(
      resolveAutoGrowHeight({
        scrollHeight: 84,
        paddingTop: 12,
        paddingBottom: 12,
        borderTop: 1,
        borderBottom: 1,
        boxSizing: 'content-box',
      }),
    ).toBe(60);
  });

  it('超过上限就停在上限（上限来自 CSS max-height，JS 不写第二份像素值）', () => {
    expect(resolveAutoGrowHeight({ scrollHeight: 400, maxHeight: 168 })).toBe(168);
  });

  it('未设上限（none / NaN）视为无上限', () => {
    expect(resolveAutoGrowHeight({ scrollHeight: 400, maxHeight: Number.NaN })).toBe(400);
    expect(resolveAutoGrowHeight({ scrollHeight: 400 })).toBe(400);
  });

  it('上限为 0 / 负数一律视为无上限，避免把框压成 0 高', () => {
    expect(resolveAutoGrowHeight({ scrollHeight: 120, maxHeight: 0 })).toBe(120);
    expect(resolveAutoGrowHeight({ scrollHeight: 120, maxHeight: -10 })).toBe(120);
  });

  it('测不到 scrollHeight 时退化为 0，不写 NaN 进 style', () => {
    expect(resolveAutoGrowHeight({ scrollHeight: Number.NaN })).toBe(0);
    expect(resolveAutoGrowHeight()).toBe(0);
  });

  it('结果取整，避免半像素高度在连续换行时抖动', () => {
    expect(resolveAutoGrowHeight({ scrollHeight: 84.4 })).toBe(84);
    expect(resolveAutoGrowHeight({ scrollHeight: 84.6 })).toBe(85);
  });

  it('永不返回负数', () => {
    expect(
      resolveAutoGrowHeight({
        scrollHeight: 4,
        paddingTop: 12,
        paddingBottom: 12,
        boxSizing: 'content-box',
      }),
    ).toBe(0);
  });
});
