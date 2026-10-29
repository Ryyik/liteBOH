import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments, squeezeSource } from '../helpers/source.js';

/* 发帖队列的「不卡死」守卫（2026-10-29 代码审查后补）。
 *
 * 四条断言分别锁住四件**在浏览器里极难自证**的事 —— 它们都不会抛错、不会红，
 * 只会表现为「发帖卡住了 / 整页一阵一阵地卡 / 有帖永远发不出去」：
 *   1. 失败中断队列后，「编辑」这条处置路径必须重新拉起 worker；
 *   2. `runPublishQueue` 的失败分支用 break 等用户处置 ⇒ 其余三条路径都得拉起（对照）；
 *   3. 组件重建后要接手队列，并把在途任务重新挂回常驻岛（watch 必须 immediate）；
 *   4. 发布进度 tick 不得触发虚拟列表 observer 全量重建 / 不得同值重绘。
 *
 * 全是源码级断言，一律过 tests/helpers/source.js 的归一函数（prettier 会重排）。
 * 每条都配一句「反证」，确保切片真的取到了函数体 —— 否则 indexOf 落空时断言会假绿。
 */

const root = resolve(import.meta.dirname, '../..');
const readScript = (rel) => stripComments(scriptSection(readFileSync(resolve(root, rel), 'utf8')));
const readSource = (rel) => stripComments(readFileSync(resolve(root, rel), 'utf8'));

const FORUM_MAIN = 'src/views/Forum/ForumMain.vue';
const VIRTUAL_FEED = 'src/views/Forum/composables/useForumVirtualFeed.js';

const forumMain = readScript(FORUM_MAIN);

/** 取 `from` 到下一个 `to` 之间的切片。两个边界都是函数/常量声明，格式化不会改写它们。 */
const sliceBetween = (src, from, to) => {
  const start = src.indexOf(from);
  const end = start < 0 ? -1 : src.indexOf(to, start + from.length);
  expect(start, `找不到起点 ${from}`).toBeGreaterThan(-1);
  expect(end, `找不到终点 ${to}`).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('发帖队列：失败中断后不得把后面的帖永久卡死', () => {
  it('「编辑」（内容交还编辑器）必须重新拉起 worker', () => {
    const body = sliceBetween(forumMain, 'const editFailedPublish', 'const isForumImageViewerOpen');
    // 反证：切片确实落在这个函数里（这条摘掉，下面那条就会因为切到空串而假绿）
    expect(body).toContain('removeOptimisticPost');
    expect(body).toContain('runPublishQueue');
  });

  it('对照：重试 / 取消 / 移除违规图三条处置路径同样都拉起 worker', () => {
    const cases = [
      ['const retryPublish', 'const handleNetworkOnline'],
      ['const cancelPublish', 'const fixModerationPublish'],
      ['const fixModerationPublish', 'const editFailedPublish'],
    ];
    for (const [from, to] of cases) {
      const body = sliceBetween(forumMain, from, to);
      // 反证：三条分支都各自改状态，切片没取到就会先在这条失败
      expect(body, from).toContain('publishQueueStore.');
      expect(body, from).toContain('runPublishQueue');
    }
  });
});

describe('发帖队列：组件重建后要接手并重新可见', () => {
  it('挂载时接手 queued（worker 锁是实例级的，新实例不会自动跑）', () => {
    const tail = sliceBetween(forumMain, 'const runPublishQueue', 'const retryPublish');
    // 反证：切片覆盖 runPublishQueue 之后的那段（接手逻辑就插在这里）
    expect(tail).toContain('publishWorkerRunning');
    expect(tail).toContain('onMounted');
    expect(tail).toContain("i.state === 'queued'");
  });

  it('常驻任务岛同步 watch 必须 immediate（否则重建后在途帖看不见、也点不到按钮）', () => {
    const code = squeezeSource(forumMain);
    expect(code).toContain(squeezeSource('{ deep: true, immediate: true }'));
    // 反证：旧的「只有 deep」形态必须已经不存在（否则 immediate 那条可能是别的 watch）
    expect(code).not.toContain(squeezeSource('{ deep: true }'));
  });
});

describe('发帖进度 tick 不得引起整页重绘', () => {
  it('虚拟列表 observer 按「卡片集合」重建，不按 forumData 的数组引用', () => {
    const code = readSource(VIRTUAL_FEED);
    expect(code).toContain('visibleForumPostSignature');
    // 反证：调度函数仍在，且旧写法（直接 watch 数组）已删除
    expect(code).toContain('setupForumWindowObserverOnce');
    expect(code).not.toContain('watch(visibleForumPosts');
  });

  it('进度只在整数百分比变化时写回（同值 tick 不替换 forumData）', () => {
    const body = sliceBetween(
      forumMain,
      'const processPublishImagesForQueue',
      'const runPublishQueue',
    );
    // 反证：切片落在图片流水线里
    expect(body).toContain('pending');
    expect(body).toContain('lastRenderedProgress');
  });
});
