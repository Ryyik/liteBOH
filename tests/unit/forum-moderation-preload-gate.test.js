import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 只 mock 冷却判定，避免把整条审核管线（含 supabase 客户端）拖进来
vi.mock('@/utils/image-moderation-pipeline.js', () => ({
  isCloudModerationCoolingDown: vi.fn(),
}));

import { isCloudModerationCoolingDown } from '@/utils/image-moderation-pipeline.js';
import { useForumImageModerationPreload } from '@/views/Forum/composables/useForumImageModerationPreload.js';

// =====================================================================
// §9.3 P3：本地兜底模型（nsfwjs）的预载守卫
//
//   背景：`nsfw-weights` chunk 实测 3516 KB raw / **2477 KB gzip**，且整个文件里
//   最长一行 360 万字符（权重内联成 JS 串，要下载**并当 JS 解析**）。
//   云端审核可达时这个模型一次都用不上 ⇒ 预载只在云端**已被判定不可达**（冷却中）时才做。
//
//   这几条断言的价值在于锁住**顺序**：守卫必须在 `hasScheduledPreload = true` 之前，
//   否则「云端可达时提前返回」会把已排期标志置位，云端后来真挂了也再排不上预载
//   （症状是兜底首图要现下载模型 —— 恰好退回这次想修的问题）。
//
//   反证（已做）：把守卫那行 `if (!shouldPreloadLocalModel()) return;` 删掉 →
//   第 1 条「云端可达时不预载」当场 FAIL。
// =====================================================================

describe('useForumImageModerationPreload：本地模型预载守卫', () => {
  const realWindow = globalThis.window;

  beforeEach(() => {
    vi.useFakeTimers();
    // 测试环境是 node（不是 jsdom）：只需要造 window（Node 没有这个全局，可写）。
    // ⚠️ **不要**去 stub `navigator` —— Node 22 的 `globalThis.navigator` 是只读 getter，
    //    赋值会抛 `Cannot set property navigator ... which has only a getter`（4 条测试全红）。
    //    也不需要：Node 自带的 navigator 上没有 `connection`，于是
    //    `hasUsableConnection()` 的省流量/2g 判定天然走「可用」分支，正是被测前提。
    globalThis.window = { setTimeout, clearTimeout };
    isCloudModerationCoolingDown.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (realWindow === undefined) delete globalThis.window;
    else globalThis.window = realWindow;
  });

  const scheduleAndFlush = async (preload, opts) => {
    const { scheduleForumImageModerationPreload } = useForumImageModerationPreload(preload);
    scheduleForumImageModerationPreload(opts);
    await vi.runAllTimersAsync();
    return scheduleForumImageModerationPreload;
  };

  it('云端可达时**不**预载（省掉 2.4MB gzip 的权重 chunk）', async () => {
    isCloudModerationCoolingDown.mockReturnValue(false);
    const preload = vi.fn(() => Promise.resolve());

    await scheduleAndFlush(preload, { immediate: true });

    expect(preload).not.toHaveBeenCalled();
  });

  it('云端冷却中（已判定不可达）时才预载', async () => {
    isCloudModerationCoolingDown.mockReturnValue(true);
    const preload = vi.fn(() => Promise.resolve());

    await scheduleAndFlush(preload, { immediate: true });

    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('云端可达时提前返回**不置位**，之后冷却开始仍能排上预载', async () => {
    isCloudModerationCoolingDown.mockReturnValue(false);
    const preload = vi.fn(() => Promise.resolve());
    const schedule = await scheduleAndFlush(preload, { immediate: true });
    expect(preload).not.toHaveBeenCalled();

    // 云端此时挂了（冷却开始）—— 必须还能排上
    isCloudModerationCoolingDown.mockReturnValue(true);
    schedule({ immediate: true });
    await vi.runAllTimersAsync();

    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('非 immediate（页面空闲）路径同样受守卫约束', async () => {
    isCloudModerationCoolingDown.mockReturnValue(false);
    const preload = vi.fn(() => Promise.resolve());

    await scheduleAndFlush(preload, {});

    expect(preload).not.toHaveBeenCalled();
  });
});
