import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FORUM_DETAIL_IMAGE_TRANSFORM,
  FORUM_UPLOAD_IMAGE_MAX_DIMENSION,
  FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS,
  FORUM_UPLOAD_IMAGE_TARGET_SIZE_MB,
} from '../../src/utils/api/forum-format.js';
import { getImageCompressionPlan } from '../../src/utils/image-compression.js';
import { readFileSync } from 'node:fs';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';
import { readImagePipelineSource } from '../helpers/forum-image-pipeline.js';

/**
 * 论坛上传档位守卫（2026-10-29）。
 *
 * 守住的不变量只有一条：**上传端长边不得超过展示端真正会加载的宽度**。
 * 背景：展示侧最大只取 w_1600（列表 w_720、详情 w_1600、ForumImageViewer 的取图顺序
 * 恒以 detailUrl 打头 ⇒ originalUrl 永不被下载），所以上传超过 1600 的像素是死像素 ——
 * 只付上行时间和 Cloudinary 存储，用户一个像素也看不到。
 *
 * 反证方式（改回旧行为必红）：
 *   · 把 FORUM_UPLOAD_IMAGE_MAX_DIMENSION 改回 2048 → 第 2 条行为断言红；
 *   · 把 ForumMain 的传参改回裸 `{ optimizeForUpload: true }`（用全局默认 2048）→ 第 4 条红。
 */

const stubImageDimensions = (width, height) => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:tier-test'),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width;
      naturalHeight = height;
      set src(_value) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('forum upload image tier: 单一不变量', () => {
  it('上传长边 ≤ 详情展示宽度（否则就是白付带宽的死像素）', () => {
    const detailWidth = Number((FORUM_DETAIL_IMAGE_TRANSFORM.match(/w_(\d+)/) || [])[1]);
    expect(detailWidth).toBeGreaterThan(0);
    expect(FORUM_UPLOAD_IMAGE_MAX_DIMENSION).toBeLessThanOrEqual(detailWidth);
  });

  it('论坛档位确实收在 1600，而不是沿用全局默认 2048', async () => {
    stubImageDimensions(4032, 3024);
    const plan = await getImageCompressionPlan(
      { name: 'camera.jpg', type: 'image/jpeg', size: 1024 * 1024 },
      FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS,
    );

    expect(plan.shouldOptimize).toBe(true);
    expect(plan.maxWidthOrHeight).toBe(1600);
    expect(plan.targetSizeMB).toBe(FORUM_UPLOAD_IMAGE_TARGET_SIZE_MB);
  });

  it('手机照片一定触发优化；小于档位的图不被无谓重编码', async () => {
    stubImageDimensions(4032, 3024);
    const big = await getImageCompressionPlan(
      { name: 'camera.jpg', type: 'image/jpeg', size: 1024 * 1024 },
      FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS,
    );
    expect(big.shouldCompress).toBe(true);

    stubImageDimensions(1200, 900);
    const small = await getImageCompressionPlan(
      { name: 'chat.jpg', type: 'image/jpeg', size: 200 * 1024 },
      FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS,
    );
    expect(small.shouldCompress).toBe(false);
  });
});

describe('forum upload image tier: 图片管线接线', () => {
  it('prepareForumImageForUpload 用论坛档位常量，不写裸 optimizeForUpload', () => {
    // 2026-10-30：函数已随图片管线外搬到 composables/useForumDraftImagePipelines.js，
    // 断言主体改为读两文件并集（见 helpers/forum-image-pipeline.js）；断言内容一字未改。
    const code = squeezeSource(stripComments(readImagePipelineSource()));

    const start = code.indexOf('const prepareForumImageForUpload');
    // 起点找不到就直接红：切片落空时下面的 toContain 会变成对空串断言 ⇒ 假绿
    expect(start).toBeGreaterThan(0);
    const body = code.slice(start, start + 1600);

    expect(body).toContain('getImageCompressionPlan');
    expect(body).toContain('FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS');
    // 反向：裸对象会静默落回 image-compression 的全局默认 2048
    expect(body).not.toContain('{ optimizeForUpload: true }');
  });

  it('宿主不得留第二份 prepareForumImageForUpload（两份实现 = 档位可以各自漂移）', () => {
    const host = squeezeSource(
      stripComments(
        scriptSection(
          readFileSync(new URL('../../src/views/Forum/ForumMain.vue', import.meta.url), 'utf8'),
        ),
      ),
    );
    expect(host).not.toContain('const prepareForumImageForUpload');
  });
});
