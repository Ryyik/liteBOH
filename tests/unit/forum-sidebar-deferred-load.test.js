import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const src = readFileSync(resolve(root, 'src/views/Forum/ForumMain.vue'), 'utf8');

// 论坛首屏取数波次守卫（2026-11-16）。
// 实测证据（本地 dev 跑 probe-forum-feed-load）：改造前挂载后 6 条请求同时在空中 ——
// avatar_frames / news / activities / posts / forum_weekly_reports / advertisements，
// `request-core` 的 6 个并发槽被占满，紧随其后的 get_user_subscription_tiers 与 comments
// 只能排队。周报与广告都不在首屏可见区，抢槽纯属浪费。
//
// 这里锁两件事：
//   ① 周报 / 广告**不得**在 onMounted 里裸调用（必须走 startDeferredSidebarLoad）；
//   ② 延后触发器必须挂在 `isLoading` 上，且 watch 要建在 initializeForumData 之前
//      —— 命中会话快照的分支是**同步**把 isLoading 置假的，晚建 watch 收不到。
// 断言用宽容正则，防 prettier 重排导致假红（仓库既有纪律）。
// 反证：把 `startDeferredSidebarLoad` 里的两行 `void load…()` 提到 onMounted 顶层 → 第 1 条必红。

describe('论坛首屏取数波次：周报 / 广告延后', () => {
  it('周报与广告不在挂载时裸发', () => {
    // 裸调用（行首独立一句、无 void / await 前缀）只可能来自"又改回即时加载"
    expect(src).not.toMatch(/^\s*loadForumWeeklyReport\(\);\s*$/m);
    expect(src).not.toMatch(/^\s*loadActiveAds\(\);\s*$/m);
  });

  it('延后触发器挂在 isLoading 上，且 watch 先于 initializeForumData', () => {
    expect(src).toMatch(/watch\(\s*isLoading\s*,\s*\(loading\)\s*=>/);
    expect(src).toMatch(/startDeferredSidebarLoad/);

    const iWatch = src.indexOf('stopDeferredSidebarWatch = watch(');
    const iInit = src.indexOf('void initializeForumData();');
    expect(iWatch).toBeGreaterThan(-1);
    expect(iInit).toBeGreaterThan(-1);
    expect(iWatch).toBeLessThan(iInit);
  });

  it('卸载时清理 watch / 兜底定时器 / 空闲句柄', () => {
    const seg = src.slice(src.indexOf('onUnmounted(() => {'));
    expect(seg).toMatch(/stopDeferredSidebarWatch\?\.\(\)/);
    expect(seg).toMatch(/deferredSidebarFallbackTimer/);
    expect(seg).toMatch(/cancelDeferredSidebarLoad\?\.\(\)/);
  });
});
