/**
 * Cloud+ 图库多图上传：并发池 + 保序 + 并发上限真源唯一（2026-10-04）
 *
 * 背景：`CloudPlusMain.vue` 的 `handleImageSelection` 此前是
 * `for (const file of files)` **纯串行** —— 一次选满 9 张（CLOUD_BATCH_LIMIT）就是
 * 9 次串行上传。论坛发帖与影集编辑器早已并发，这条线漏了。
 *
 * 为什么这里是**源码层**守卫而不是行为单测：`CloudPlusMain.vue` 是 2600+ 行的 SFC，
 * 挂载它要 mock supabase / auth store / router / 灵动岛等一大串，成本远高于收益。
 * 本仓库对这个文件本来就是这个路子（见 `tests/unit/cloud-album-order.test.js`）。
 *
 * 反向对照（改坏任一条即红）：
 *   · 把 `resolveCloudUploadConcurrency()` 换回字面量 3 → 「真源唯一」那条红；
 *   · 把 `uploadedByIndex[index]` 改成 `uploadedImages.value.push(...)` 直接推 →
 *     「按下标落位」那条红（并发下相册照片会乱序）；
 *   · 把并发池换回 `for (const file of files)` → 「不再串行」那条红。
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

// .vue 必须先取 <script> 区再剥注释（模板里的 `accept="image/*"` 会与远处的注释收尾错配）
const cloudPlusScript = () =>
  stripComments(scriptSection(read('src/views/user-center/Cloud+/CloudPlusMain.vue')));
const cloudPlusCode = () => squeezeSource(cloudPlusScript());
// 断言跨行结构时用「全空白移除」版：squeeze 会在 `if (` 之后留下一个空格，
// 与人类写法 `if (x)` 不是同一个串（见 tests/helpers/source.js 的实测记录）
const cloudPlusFlat = () => flattenSource(cloudPlusScript());

describe('Cloud+ 多图上传：并发池与保序（2026-10-04）', () => {
  it('不再串行 for-of 上传，改用有界并发池', () => {
    const code = cloudPlusCode();
    expect(code).not.toMatch(/for \(const file of files\)/);
    // 并发池三件套：上限解析 + 队列 + 泵
    expect(code).toContain('resolveCloudUploadConcurrency()');
    expect(code).toMatch(/while \(activeCount < concurrency && queue\.length\)/);
    expect(code).toMatch(
      /cloudState\.upload\.progress = Math\.round\(\(settledCount \/ totalFiles\) \* 100\)/,
    );
  });

  it('结果按下标落位（并发完成顺序 ≠ 选图顺序，直接 push 会让相册乱序）', () => {
    const code = cloudPlusCode();
    expect(code).toMatch(/uploadedByIndex\[index\] = \{/);
    expect(code).toMatch(/failedByIndex\[index\] = \{/);
    // 落库时按原顺序展开，而不是按完成顺序逐个 push
    expect(code).toContain('uploadedImages.value.push(...uploaded)');
    expect(code).toContain('cloudState.upload.failedImages = failed');
  });

  it('失败重试列表语义不变（retryFailedUploads 依赖 {file,error,name}）', () => {
    const code = cloudPlusCode();
    expect(code).toMatch(/error: uploadError\?\.message \|\| '上传失败'/);
    expect(code).toContain('cloudState.upload.failedImages.map((item) => item.file)');
    // 取消仍不计入失败列表（两条路径都要标记 aborted 并提前返回）
    const flat = cloudPlusFlat();
    expect(flat).toContain("AbortError'||uploadController.signal.aborted){aborted=true;return;}");
    expect(flat).toContain('if(uploadController.signal.aborted){aborted=true;return;}');
  });
});

describe('多图上传并发上限：真源唯一（2026-10-04）', () => {
  const guard = () => read('src/utils/cloud-upload-guard.js');
  const forum = () => read('src/utils/api/forum-images-api.js');
  const album = () => read('src/views/PhotoAlbumEditor/composables/useAlbumEditor.js');

  it('上限只在 cloud-upload-guard.js 定义一次', () => {
    const code = flattenSource(guard());
    expect(code).toContain('exportconstCLOUD_UPLOAD_MAX_CONCURRENCY=3');
    expect(code).toContain('exportconstCLOUD_UPLOAD_MAX_CONCURRENCY_LOW_END=2');
    expect(code).toContain('exportfunctionresolveCloudUploadConcurrency()');
  });

  it('论坛上传队列与影集上传池都引用真源，不内联数字', () => {
    expect(flattenSource(forum())).toContain(
      'constMAX_CONCURRENT_UPLOADS=CLOUD_UPLOAD_MAX_CONCURRENCY',
    );
    expect(squeezeSource(forum())).not.toContain('MAX_CONCURRENT_UPLOADS = 3');

    const albumCode = flattenSource(album());
    expect(albumCode).toContain('constconcurrency=resolveCloudUploadConcurrency()');
    expect(albumCode).not.toContain('constconcurrency=3');
  });
});
