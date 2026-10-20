import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 论坛图片「审核来源」接线守卫（2026-10-20）
 *
 * 背景（线上只读实测）：forum_post_images 全表 128 行 moderation_source 只有
 * 'client_nsfwjs' 一个值 —— 而同期 ai_quota_log 有 6 次 moderation-image 云端调用成功。
 * 根因有两条，本文件守「客户端这条」：
 *   ① `uploadApprovedForumImage` 构造 normalizeForumImage 时**不传** source
 *      ⇒ 即使 moderateImageWithFallback 返回了 'gemini'，也会被回落成 'client_nsfwjs'；
 *   ② 服务端两个 RPC 把来源写死（那条由 supabase/migrations/2026102005 修）。
 *
 * 判据：给定审核裁决 source='gemini'，上传结果里的 moderationSource 必须是 'gemini'。
 * 反向对照：把 forum-images-api.js 里 `moderationSource: moderation.source || …` 删掉，
 * 本文件第 1 条立刻红（实测 2026-10-20）。
 */

const hoisted = vi.hoisted(() => ({
  uploadImageToCloudinary: vi.fn(),
  assertCloudinaryUploadAllowed: vi.fn(),
  normalizeDbError: vi.fn((e, fallback) => ({ message: fallback, cause: e })),
}));

vi.mock('@/utils/supabase-client.js', () => ({ supabase: {} }), { virtual: true });
vi.mock('../../src/utils/cloudinary-client.js', async (importOriginal) => {
  // 部分 mock：只替换网络上传与准入校验，保留 forum-format 依赖的 URL 变换等纯函数。
  const actual = await importOriginal();
  return {
    ...actual,
    assertCloudinaryUploadAllowed: hoisted.assertCloudinaryUploadAllowed,
    uploadImageToCloudinary: hoisted.uploadImageToCloudinary,
    deleteCloudinaryAssetByToken: vi.fn(),
    deleteCloudinaryAssetsByPublicIds: vi.fn(),
  };
});

vi.mock('../../src/utils/cloud-upload-guard.js', () => ({
  CLOUD_UPLOAD_MAX_CONCURRENCY: 3,
  CLOUD_UPLOAD_MAX_CONCURRENCY_CEILING: 4,
  resolveCloudUploadConcurrency: () => 3,
}));

vi.mock('../../src/utils/supabase-client.js', () => ({ supabase: {} }));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../../src/utils/request-core.js', () => ({
  normalizeDbError: hoisted.normalizeDbError,
}));

const uploadedRow = {
  url: 'https://res.cloudinary.com/demo/image/upload/forum/a.jpg',
  publicId: 'forum/a',
  width: 800,
  height: 600,
  format: 'jpg',
};

function makeFile() {
  return new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
}

describe('uploadApprovedForumImage · 审核来源必须与裁决同源', () => {
  let uploadApprovedForumImage;

  beforeEach(async () => {
    hoisted.uploadImageToCloudinary.mockReset();
    hoisted.uploadImageToCloudinary.mockResolvedValue(uploadedRow);
    hoisted.assertCloudinaryUploadAllowed.mockReset();
    hoisted.assertCloudinaryUploadAllowed.mockResolvedValue(true);
    ({ uploadApprovedForumImage } = await import('../../src/utils/api/forum-images-api.js'));
  });

  it('云端裁决 source=gemini ⇒ 落库来源必须是 gemini（不是 client_nsfwjs）', async () => {
    const result = await uploadApprovedForumImage(makeFile(), {
      status: 'approved',
      score: 0.12,
      reason: '云端审核通过',
      source: 'gemini',
    });
    expect(result.ok).toBe(true);
    expect(result.data.moderationSource).toBe('gemini');
  });

  it('本地兜底 source=local_fallback ⇒ 来源如实标本地', async () => {
    const result = await uploadApprovedForumImage(makeFile(), {
      status: 'approved',
      score: 0.02,
      reason: '本地兜底检测通过',
      source: 'local_fallback',
    });
    expect(result.data.moderationSource).toBe('local_fallback');
  });

  it('低置信放行（local_fallback_borderline）也必须如实记录', async () => {
    const result = await uploadApprovedForumImage(makeFile(), {
      status: 'approved',
      score: 0.47,
      reason: '本地兜底放行（检测低置信 0.47，建议后台抽查）',
      source: 'local_fallback_borderline',
    });
    expect(result.data.moderationSource).toBe('local_fallback_borderline');
  });

  it('裁决缺 source 时回落 client_nsfwjs（安全默认，不产生空值）', async () => {
    const result = await uploadApprovedForumImage(makeFile(), {
      status: 'approved',
      score: 0.01,
      reason: '通过',
    });
    expect(result.data.moderationSource).toBe('client_nsfwjs');
  });

  it('未通过审核时不得上传（来源修复不放松状态机）', async () => {
    const result = await uploadApprovedForumImage(makeFile(), {
      status: 'rejected',
      reason: '含违规内容',
      source: 'gemini',
    });
    expect(result.ok).toBe(false);
    expect(hoisted.uploadImageToCloudinary).not.toHaveBeenCalled();
  });
});
