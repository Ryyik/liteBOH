/**
 * Cloud+ 图库多图上传：并发池 + 保序 + 上传链路与论坛对齐（2026-10-04 建，2026-10-18 扩）
 *
 * 背景：`CloudPlusMain.vue` 的 `handleImageSelection` 此前是
 * `for (const file of file)` **纯串行** —— 一次选满 9 张（CLOUD_BATCH_LIMIT）就是
 * 9 次串行上传。论坛发帖与影集编辑器早已并发，这条线漏了。
 *
 * 2026-10-18 第二轮（用户报障「为啥还有图片上传失败 / 不显示原因」）：
 * Cloud+ 的上传链路与论坛**根本不是同一条**：
 *   · 不传 `folder` → 用 cloudinary-client 的默认值，改目录要动别处
 *   · 不传 `pendingSource` → 成功的图不进 `cloudinary_pending_uploads`，
 *     放弃发布的草稿图变孤儿（论坛侧有兜底清理，Cloud+ 侧以前没有）
 *   · 预检 source 落到 'generic' → 与装修台等路径共用同一套限流计数，互相挤占
 *   · 失败只存 `uploadError.message`，且**面板上不显示**，用户只看到「N 张图片上传失败」
 * 本轮把这三项补齐 + 把真实原因渲染出来。
 *
 * 为什么这里是**源码层**守卫而不是行为单测：`CloudPlusMain.vue` 是 2600+ 行的 SFC，
 * 挂载它要 mock supabase / auth store / router / 灵动岛等一大串，成本远高于收益。
 * 本仓库对这个文件本来就是这个路子（见 `tests/unit/cloud-album-order.test.js`）。
 *
 * 反向对照（改坏任一条即红）：
 *   · 把 `resolveCloudUploadConcurrency()` 换回字面量 3 → 「真源唯一」那条红；
 *   · 把 `uploadedByIndex[index]` 改成 `uploadedImages.value.push(...)` 直接推 →
 *     「按下标落位」那条红（并发下相册照片会乱序）；
 *   · 把并发池换回 `for (const file of files)` → 「不再串行」那条红；
 *   · 把 `folder` / `pendingSource` 参数删掉 → 「上传链路对齐论坛」整组红。
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
    // 进度改为「每张图自己的 onProgress 汇总」（2026-10-18）：之前的
    // settledCount/totalFiles 在 3 路并发下会长时间停在 0%/33%/66%，是假进度。
    expect(code).not.toMatch(/settledCount \/ totalFiles/);
    expect(code).toContain('syncProgress()');
    // 2026-10-19 起进度条覆盖「压缩 + 上传」两段（旧的是单一 uploadPct）
    expect(code).toContain('const uploadPctByIndex = new Array(totalFiles).fill(0)');
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
    // 2026-10-18：error 现在是**归一化后的可读文案**（限流码前缀会被剥掉），
    // 不再是裸的 error.message —— 用户报障「不显示原因」的修复点。
    expect(code).toMatch(/const reason = normalizeDbError\(/);
    expect(code).toMatch(/error: reason\?\.message \|\| uploadError\?\.message \|\| '上传失败'/);
    expect(code).toContain('cloudState.upload.failedImages.map((item) => item.file)');
    // 取消仍不计入失败列表（两条路径都要标记 aborted 并提前返回）
    const flat = cloudPlusFlat();
    expect(flat).toContain("AbortError'||uploadController.signal.aborted){aborted=true;return;}");
    expect(flat).toContain('if(uploadController.signal.aborted){aborted=true;return;}');
  });
});

describe('Cloud+ 上传链路：与论坛对齐（2026-10-18）', () => {
  it('逐图上传显式指定 folder 与归属标记，与论坛发帖同一套参数', () => {
    const code = cloudPlusCode();
    expect(code).toContain('folder: CLOUD_PLUS_CLOUDINARY_FOLDER');
    expect(code).toContain('pendingSource: CLOUD_PLUS_UPLOAD_SOURCE');
    // 预检已在批次开始时整批做过，逐图再查一次只是把并发池打成串行
    expect(code).toContain('skipUploadPreflight: true');
    expect(code).toContain('onProgress:');
  });

  it('批次开始时做一次额度预检，source 用 Cloud+ 专属标记而不是 generic', () => {
    // 用 flatten：`{ source: X }` 被 squeeze 后会留下开括号后的空格，两侧不同串
    const flat = cloudPlusFlat();
    expect(flat).toContain('assertCloudinaryUploadAllowed({source:CLOUD_PLUS_UPLOAD_SOURCE})');
    // 预检失败时把原因写进失败列表（否则用户看不到「为什么发不出去」）
    expect(cloudPlusCode()).toContain('cloudState.upload.failedImages = files.map((file) => ({');
  });

  it('Cloud+ 的 source / folder 只在 api 层定义一次，视图层不内联字面量', () => {
    const view = read('src/views/user-center/Cloud+/CloudPlusMain.vue');
    expect(view).not.toMatch(/['"]cloud_plus['"]\s*\}/);
    expect(view).not.toMatch(/['"]boh-cloud-plus['"]/);

    const api = flattenSource(read('src/utils/api/boh-cloud-api.js'));
    expect(api).toContain("exportconstCLOUD_PLUS_UPLOAD_SOURCE='cloud_plus'");
    expect(api).toContain('exportconstCLOUD_PLUS_CLOUDINARY_FOLDER=');
  });

  it('上传失败的真实原因会渲染到面板上（不只写进灵动岛）', () => {
    const view = read('src/views/user-center/Cloud+/CloudPlusMain.vue');
    expect(view).toContain('composer-failed-list');
    expect(view).toContain('failedUploadItems');
    // 每条失败项都要展示文件名 + 原因，且最多列 4 条
    expect(view).toContain('class="composer-failed-name"');
    expect(view).toContain('class="composer-failed-reason"');
    expect(view).toMatch(/failedUploadItems\.length/);
  });
});

describe('Cloud+ 上传前压缩：与论坛同一条管线（2026-10-19）', () => {
  const compression = () => read('src/utils/image-compression.js');

  it('上传前先过压缩计划（optimizeForUpload 与论坛同款口径）', () => {
    const code = cloudPlusCode();
    // 动态 import：vendor chunk（≈40KB gz）不进 Cloud+ 面板首屏闭包，与 ForumMain 同款做法
    expect(code).toContain("await import('@/utils/image-compression.js')");
    expect(code).toMatch(/getImageCompressionPlan\(file, \{\s*optimizeForUpload: true,?\s*\}\)/);
    expect(code).toContain('compressImageFileToUploadLimit(file, plan, {');
  });

  it('不可压缩格式（GIF 动图）超限时给出可读文案，压缩后仍超限也拦下', () => {
    const code = cloudPlusCode();
    expect(code).toContain('if (!plan.canCompress)');
    expect(code).toContain(
      '图片超过上传限制，且当前格式不支持自动压缩，请换成 JPG、PNG 或 WebP 后重试',
    );
    expect(code).toContain('压缩后仍超过限制');
    // 二次校验用的体积格式化函数来自同一模块
    expect(code).toContain('formatImageFileSize');
  });

  it('进度条覆盖「压缩 + 上传」两段，阶段文案随压缩段切换', () => {
    const code = cloudPlusCode();
    expect(code).toContain('const compressPctByIndex = new Array(totalFiles).fill(100)');
    expect(code).toContain('const uploadPctByIndex = new Array(totalFiles).fill(0)');
    expect(code).toContain('compressPctByIndex[index] || 0) * 0.5');
    expect(code).toContain('(uploadPctByIndex[index] || 0) * 0.5');
    expect(code).toContain(
      "cloudState.upload.phase = stillCompressing ? 'compressing' : 'uploading'",
    );
  });

  it('压缩管线真源依旧唯一：论坛 / 影集 / Cloud+ 都只调用 image-compression 的导出', () => {
    // 反证：把 compressImageFileToUploadLimit 的实现内联进任何调用方都会破坏这组断言
    const code = flattenSource(compression());
    expect(code).toContain('exportasyncfunctiongetImageCompressionPlan(');
    expect(code).toContain('exportasyncfunctioncompressImageFileToUploadLimit(');
    // worker 必须显式同源 libURL（jsdelivr 在大陆网络挂起 → 压缩 Promise 永不 settle）
    expect(code).toContain('libURL:useWebWorker?compressionWorkerLibUrl:undefined');
  });
});

describe('上传限流文案：错误里不许带规则码前端（2026-10-18）', () => {
  const requestCore = () => read('src/utils/request-core.js');

  it('normalizeDbError 剥掉 CLOUDINARY_UPLOAD_RATE_LIMIT: 前缀', () => {
    const code = flattenSource(requestCore());
    expect(code).toContain("rawMessage.startsWith('CLOUDINARY_UPLOAD_RATE_LIMIT:')");
    expect(code).toContain("code:'CLOUDINARY_UPLOAD_RATE_LIMIT'");
  });

  it('签名网关调用有超时兜底，不会把用户卡在「上传中 0%」', () => {
    const code = flattenSource(read('src/utils/cloudinary-client.js'));
    expect(code).toContain('CLOUDINARY_SIGN_TIMEOUT_MS');
    expect(code).toContain('CLOUDINARY_SIGN_TIMEOUT_MS,');
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
