/**
 * 检测并发接线的源码守卫（2026-10-29）。
 *
 * 行为契约由 `image-moderation-concurrency.test.js` 锁（跑真函数）；
 * 这里只锁「接线本身还在」—— 两条容易在重构中被无声改坏的接线：
 *
 *  ① 检测必须进**有界池**（acquire/release + finally 释放），不能退回
 *     `Promise.all` 或退回一条全局 promise 链；
 *  ② 池容量必须是 2~3 这种小数值，不能"顺手放大到 6 路" —— 6 路并发打满云端会
 *     放大约束（见 image-moderation-pipeline 的 cloudInFlight 注释）。
 *
 * ⚠️ **2026-10-30：图片管线已从 ForumMain.vue 外搬到
 * `composables/useForumDraftImagePipelines.js`（审查报告 P1-1 第 2 步）。**
 * 所以断言主体改成读「图片管线两文件并集」（`helpers/forum-image-pipeline.js`），
 * 契约本身一字未改；同时补一条**否定**断言 —— 外搬最危险的失败模式不是「搬丢了」，
 * 而是「宿主留了一份」：两份独立池会让实际并发悄悄翻到 6 路，正好绕开下面第 3 条，
 * 而且谁都不会报错。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';
import { readImagePipelineSource } from '../helpers/forum-image-pipeline.js';

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const imagePipelineScript = () => stripComments(readImagePipelineSource());
const forumMainScript = () => stripComments(scriptSection(read('src/views/Forum/ForumMain.vue')));

describe('论坛检测并发接线', () => {
  it('检测走有界池：acquire 在 moderateForumImage 之前，release 在 finally 里', () => {
    const code = imagePipelineScript();
    const acquireAt = code.indexOf('acquireModerationSlot()');
    const moderateAt = code.indexOf('moderateForumImage(entry.file)');
    const releaseAt = code.indexOf('releaseModerationSlot()');

    expect(acquireAt).toBeGreaterThan(-1);
    expect(moderateAt).toBeGreaterThan(-1);
    expect(releaseAt).toBeGreaterThan(-1);
    // 先取槽、再检测：反过来等于没限流
    expect(acquireAt).toBeLessThan(moderateAt);
    // 释放必须在 finally 块里：漏在成功分支上 ⇒ 一张坏图就把池子占死，整批检测停摆
    expect(squeezeSource(code)).toMatch(/finally \{ releaseModerationSlot\(\);/);
  });

  it('全局串行链已被移除（不许退回"云端也串行"）', () => {
    // 注释里会讲到这段历史，所以先剥注释再断言
    expect(imagePipelineScript()).not.toContain('draftPipelineChain');
  });

  it('池容量是 2~3，不许放大到全量并发', () => {
    const match = imagePipelineScript().match(/const MODERATION_CONCURRENCY = (\d+);/);
    expect(match).not.toBeNull();
    const value = Number(match[1]);
    expect(value).toBeGreaterThanOrEqual(2);
    expect(value).toBeLessThanOrEqual(3);
  });

  it('本地兜底在 pipeline 层单并发（不是靠调用方自觉）', () => {
    const src = read('src/utils/image-moderation-pipeline.js');
    // 互斥链必须在 pipeline 模块内部：调用方无法预知"这次会不会降级到本地"，
    // 按入口并发数判断会漏（3 路同时云端失败 ⇒ 3 路同时降级）。
    expect(src).toContain('let localFallbackChain = Promise.resolve();');
    expect(src).toMatch(/await prev;[\s\S]{0,200}runLocalFallbackModerate\(file\)/);
    // 释放必须在 finally：否则一次抛错会把后续所有本地检测永久卡住
    expect(squeezeSource(src)).toMatch(/finally \{[\s\S]{0,120}release\(\);[\s\S]{0,20}\}/);
  });
});

describe('外搬后：池只有一个实现，且宿主确实挂上了它', () => {
  it('宿主调用 useForumDraftImagePipelines 并把状态注入进去', () => {
    const code = squeezeSource(forumMainScript());
    expect(code).toContain('useForumDraftImagePipelines(');
    // 注入的必须是宿主那一份 ref（不是 composable 内部另建的）：否则模板上的图与管线互不相识
    expect(code).toContain(squeezeSource('postImages,'));
    expect(code).toContain(squeezeSource('postImageUploadStatus,'));
  });

  it('宿主不得再自带并发池（两份池 = 实际并发翻倍，绕开 3 路上限）', () => {
    const code = squeezeSource(forumMainScript());
    for (const forbidden of [
      'acquireModerationSlot',
      'releaseModerationSlot',
      'MODERATION_CONCURRENCY',
      'acquireCompressionSlot',
      'COMPRESSION_CONCURRENCY',
      'const scheduleDraftImagePipeline',
    ]) {
      expect(code, `宿主里不该再有 ${forbidden}`).not.toContain(squeezeSource(forbidden));
    }
  });
});
