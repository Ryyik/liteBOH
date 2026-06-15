import { beforeEach, describe, expect, it, vi } from 'vitest';

const fm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fm.supabaseFrom,
    rpc: fm.supabaseRpc,
  },
}));

vi.mock('../../src/utils/cloudinary-client.js', () => ({
  assertCloudinaryUploadAllowed: vi.fn(() => Promise.resolve()),
  deleteCloudinaryAssetByToken: vi.fn(() => Promise.resolve({ ok: true })),
  deleteCloudinaryAssetsByPublicIds: vi.fn(() => Promise.resolve({ ok: true })),
  uploadImageToCloudinary: vi.fn(() => Promise.resolve({
    url: 'https://cdn.example.com/img.jpg',
    public_id: 'pub-1',
    delete_token: 'del-1',
  })),
  getCloudinaryTransformedUrl: vi.fn((url) => url),
  getCloudinaryUrl: vi.fn((id) => `https://cdn.example.com/${id}`),
  getCloudinaryPublicId: vi.fn(() => 'pub-1'),
}));

vi.mock('../../src/utils/forum-format.js', () => ({
  APPROVED_STATUS: 'approved',
  FORUM_ALLOWED_IMAGE_MIME_TYPES: new Set(['image/jpeg', 'image/png', 'image/webp']),
  FORUM_CLOUDINARY_FOLDER: 'boh-cloud-plus/forum',
  FORUM_IMAGE_MAX_SIZE_BYTES: 10 * 1024 * 1024,
  FORUM_IMAGE_MAX_SIZE_MB: 10,
  normalizeForumImage: vi.fn((img) => ({ ...img, id: img.id || 'normalized' })),
  normalizeForumImageUploadError: vi.fn((err) => ({ message: err?.message || 'Upload error' })),
  normalizeForumImages: vi.fn((images) => images),
}));

vi.mock('../../src/utils/forum-image-moderation.js', () => ({
  preloadForumImageModerationModel: vi.fn(() => Promise.resolve()),
  moderateForumImageFile: vi.fn(() => Promise.resolve({ status: 'approved', score: 0.95, reason: 'OK' })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import {
  getForumPostImages,
  deleteUploadedForumImage,
} from '../../src/utils/api/forum-images-api.js';

function makeQuery(result, calls = []) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn((col, val) => { calls.push({ method: 'eq', col, val }); return q; }),
    order: vi.fn(() => q),
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return q;
}

describe('forum-images-api: getForumPostImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('rejects empty postId', async () => {
    const result = await getForumPostImages('');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns approved images', async () => {
    const images = [
      { id: 'img-1', url: 'https://cdn.example.com/img1.jpg', public_id: 'pub-1', sort_order: 1 },
      { id: 'img-2', url: 'https://cdn.example.com/img2.jpg', public_id: 'pub-2', sort_order: 2 },
    ];
    fm.supabaseFrom.mockReturnValue(makeQuery({ data: images, error: null }));

    const result = await getForumPostImages('post-1');
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('handles database error', async () => {
    fm.supabaseFrom.mockReturnValue(makeQuery({
      data: null,
      error: { message: 'Database error', code: 'DB_ERROR' },
    }));

    const result = await getForumPostImages('post-1');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('forum-images-api: deleteUploadedForumImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestCache();
  });

  it('deletes image by deleteToken', async () => {
    const result = await deleteUploadedForumImage({
      deleteToken: 'tok-123',
      publicId: 'pub-1',
    });
    expect(result.ok).toBe(true);
  });

  it('returns ok for empty image object', async () => {
    const result = await deleteUploadedForumImage({});
    expect(result.ok).toBe(true);
  });

  it('returns ok for undefined image', async () => {
    const result = await deleteUploadedForumImage();
    expect(result.ok).toBe(true);
  });
});