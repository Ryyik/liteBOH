/**
 * 检测并发接线的源码守卫（2026-10-29）。
 *
 * 行为契约由 `image-moderation-concurrency.test.js` 锁（跑真函数）；
 * 这里只锁「接线本身还在」—— 因为论坛预热的管线是写在 `ForumMain.vue` 里的，
 * 没有被单独导出，跑不到函数级。两条容易在重构中被无声改坏的接线：
 *
 *  ① 检测必须进**有界池**（acquire/release + finally 释放），不能退回
 *     `Promise.all` 或退回一条全局 promise 链；
 *  ② 池容量必须是 2~3 这种小数值，不能"顺手放大到 6 路" —— 6 路并发打满云端会
 *     放大约束（见 image-moderation-pipeline 的 cloudInFlight 注释）。
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const ROOT = process.cwd();
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');

const forumScript = async () =>
  stripComments(scriptSection(await read('src/views/Forum/ForumMain.vue')));

describe('论坛检测并发接线', () => {
  it('检测走有界池：acquire 在 moderateForumImage 之前，release 在 finally 里', async () => {
    const code = await forumScript();
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

  it('全局串行链已被移除（不许退回"云端也串行"）', async () => {
    const code = await forumScript();
    // 注释里会讲到这段历史，所以先剥注释再断言
    expect(code).not.toContain('draftPipelineChain');
  });

  it('池容量是 2~3，不许放大到全量并发', async () => {
    const code = await forumScript();
    const match = code.match(/const MODERATION_CONCURRENCY = (\d+);/);
    expect(match).not.toBeNull();
    const value = Number(match[1]);
    expect(value).toBeGreaterThanOrEqual(2);
    expect(value).toBeLessThanOrEqual(3);
  });

  it('本地兜底在 pipeline 层单并发（不是靠调用方自觉）', async () => {
    const src = await read('src/utils/image-moderation-pipeline.js');
    // 互斥链必须在 pipeline 模块内部：调用方无法预知"这次会不会降级到本地"，
    // 按入口并发数判断会漏（3 路同时云端失败 ⇒ 3 路同时降级）。
    expect(src).toContain('let localFallbackChain = Promise.resolve();');
    expect(src).toMatch(/await prev;[\s\S]{0,200}runLocalFallbackModerate\(file\)/);
    // 释放必须在 finally：否则一次抛错会把后续所有本地检测永久卡住
    expect(squeezeSource(src)).toMatch(/finally \{[\s\S]{0,120}release\(\);[\s\S]{0,20}\}/);
  });
});
