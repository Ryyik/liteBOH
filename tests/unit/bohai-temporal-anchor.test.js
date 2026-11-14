/**
 * bohai-temporal-anchor.test.js — 锁「今天几号」这个锚点（2026-11-12）
 *
 * 为什么值得单独测：
 *   ① 它是**唯一**告诉模型「今天几号」的地方，一错就是全站时效判断跟着错，且不报错；
 *   ② 它必须是 **UTC+8 固定时区** —— 用本地时区写，跑在美国机器上就会差一天，
 *      而这类 bug 在本地（UTC+8 开发机）**永远测不出来**。所以用例全部从 UTC 输入推北京时间。
 */
import { describe, expect, it } from 'vitest';
import {
  TEMPORAL_TIME_ZONE,
  formatTemporalAnchor,
} from '../../src/views/BOHAI/utils/temporal-anchor';

describe('BOHAI 时间锚点（temporal-anchor）', () => {
  it('UTC 12:28 → 北京时间 20:28，同一天，星期正确', () => {
    const text = formatTemporalAnchor(new Date('2026-11-12T12:28:52Z'));
    expect(text).toContain('2026-11-12 20:28');
    expect(text).toContain('周四');
    expect(text).toContain('北京时间');
    expect(text.startsWith('<temporal_anchor>')).toBe(true);
    expect(text.trimEnd().endsWith('</temporal_anchor>')).toBe(true);
  });

  it('跨日进位：UTC 16:00 → 北京次日 00:00（星期也要跟着换）', () => {
    const text = formatTemporalAnchor(new Date('2026-11-12T16:00:00Z'));
    expect(text).toContain('2026-11-13 00:00');
    expect(text).toContain('周五');
    expect(text).not.toContain('周四');
  });

  it('不出现 24:00（h23 口径），午夜就是 00:00', () => {
    const text = formatTemporalAnchor(new Date('2026-11-12T16:00:00Z'));
    expect(text).not.toContain('24:00');
  });

  it('月/日补零：1 月 5 日不会被写成 1 月 5 日以外的形态', () => {
    const text = formatTemporalAnchor(new Date('2026-01-05T02:05:00Z'));
    expect(text).toContain('2026-01-05 10:05');
  });

  it('含「不要用训练数据猜今天」这条硬指令（去掉它就等于只给了个数字、没给用法）', () => {
    const text = formatTemporalAnchor(new Date('2026-11-12T12:28:52Z'));
    expect(text).toContain('不要用训练数据里的时间猜测今天几号');
    expect(text).toContain('以本锚点为基准');
  });

  it('非法时间 → 空串（调用方 filter 掉，不留空标签）', () => {
    expect(formatTemporalAnchor(new Date('not-a-date'))).toBe('');
    expect(formatTemporalAnchor('')).toBe('');
  });

  it('字符串时间戳同样可用（RFC3339 输入）', () => {
    const text = formatTemporalAnchor('2026-11-12T12:28:52.000Z');
    expect(text).toContain('2026-11-12 20:28');
  });

  it('时区常量就是 Asia/Shanghai（单一真源，别在别处写第二份）', () => {
    expect(TEMPORAL_TIME_ZONE).toBe('Asia/Shanghai');
  });
});
