import { describe, expect, it } from 'vitest';
import { captureOrigin, clearOrigin, peekOrigin } from '../../src/utils/motion-origin.js';

/* plans/035 复核（2026-10-31）：来源矩形表必须有上限。
 *
 * 背景：每条 entry 都持有触发元素的引用（`peekOrigin` 要「现量」位置，否则滚动后
 * 落点是旧坐标）。而 `clearOrigin` 全仓只有一处调用 —— 横屏弹窗、reduce-motion、
 * 两个图片查看器都是只 peek 不 clear。不加上限，一场桌面会话开几十篇帖子就会留下
 * 几十棵卸载后的卡片子树。 */

const fakeEl = (seed) => ({
  isConnected: true,
  getBoundingClientRect: () => ({ left: seed, top: seed, width: 100, height: 50 }),
});

describe('motion-origin：条目上限与淘汰', () => {
  it('超过 40 条时淘汰最旧的一批，最新一条仍然可查', () => {
    for (let i = 0; i < 45; i += 1) captureOrigin(`k-${i}`, fakeEl(i));

    // 45 条采集、上限 40 ⇒ 最早的 5 条出局
    expect(peekOrigin('k-0')).toBeNull();
    expect(peekOrigin('k-4')).toBeNull();
    expect(peekOrigin('k-5')).not.toBeNull();
    expect(peekOrigin('k-44')).not.toBeNull();
  });

  it('淘汰不会误伤刚采集的那条（同一毫秒内连续采集也不掉）', () => {
    for (let i = 0; i < 60; i += 1) captureOrigin(`burst-${i}`, fakeEl(i));
    const latest = peekOrigin('burst-59');
    expect(latest).not.toBeNull();
    expect(Math.round(latest.left)).toBe(59);
  });

  it('clearOrigin 之后立刻查不到 —— 返回时用完即删的口径不变', () => {
    captureOrigin('cleared', fakeEl(1));
    expect(peekOrigin('cleared')).not.toBeNull();
    clearOrigin('cleared');
    expect(peekOrigin('cleared')).toBeNull();
  });

  it('元素脱离文档后退回存下来的矩形，而不是抛错或返回 0×0', () => {
    const el = fakeEl(7);
    captureOrigin('detached', el);
    el.isConnected = false;
    // 触发一次采集，让清理逻辑看到「已卸载」（只会摘掉引用，不改行为）
    captureOrigin('other', fakeEl(8));
    const rect = peekOrigin('detached');
    expect(rect).not.toBeNull();
    expect(Math.round(rect.width)).toBe(100);
  });
});
