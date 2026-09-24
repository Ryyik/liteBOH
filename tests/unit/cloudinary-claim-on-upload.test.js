import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// 2026-09-24：cloudinary_pending_uploads 的 claimed 语义
//
// 背景：该表是「上传归属台账」，不是「上传队列」。
//   - 用户侧（论坛发帖等）上传 → 未认领（claimed_at = null），发帖成功后才 markClaimed，
//     「未认领」= 可能是垃圾草稿，用于兜底清理。
//   - 管理后台装修台（HeroConsole / ShopConsole / AvatarConsole）上传的是**平台素材**，
//     没有草稿语义 —— 若也留成未认领，线上正在用的图会被当成孤儿，
//     清理时会误删（实测 20 个「孤儿」里 8 个正被引用）。
//   故装修台走 claimPendingUpload: true，上传即写 claimed_at。
// ---------------------------------------------------------------------------

const { hoistedSupabase, hoistedGuard } = vi.hoisted(() => {
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'mycloud');
  vi.stubEnv('VITE_CLOUDINARY_DELIVERY_BASE_URL', 'https://cdn.example.com');
  vi.stubEnv('VITE_CLOUDINARY_UPLOAD_BASE_URL', 'https://api.example.com');
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET', 'cloud_plus_preset');

  const fromChain = {
    upsert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn()
  };
  fromChain.upsert.mockResolvedValue({ error: null });
  fromChain.eq.mockReturnValue(fromChain);
  fromChain.in.mockReturnValue(fromChain);
  fromChain.is.mockResolvedValue({ error: null });
  fromChain.update.mockReturnValue(fromChain);

  const hoistedSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    },
    from: vi.fn().mockReturnValue(fromChain),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    functions: { invoke: vi.fn() }
  };

  const hoistedGuard = {
    validateCloudinaryUploadResult: vi.fn(),
    validateImageFileBeforeUpload: vi.fn().mockResolvedValue(undefined),
    CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024
  };

  return { hoistedSupabase, hoistedGuard };
});

vi.mock('../../src/utils/supabase-client.js', () => ({ supabase: hoistedSupabase }));

vi.mock('../../src/utils/cloud-upload-guard.js', async () => {
  const actual = await vi.importActual('../../src/utils/cloud-upload-guard.js');
  return {
    ...actual,
    validateCloudinaryUploadResult: hoistedGuard.validateCloudinaryUploadResult,
    validateImageFileBeforeUpload: hoistedGuard.validateImageFileBeforeUpload
  };
});

const { registerCloudinaryPendingUpload } = await import('../../src/utils/cloudinary-client.js');

/** 取最近一次写到 cloudinary_pending_uploads 的 upsert payload */
const lastPendingPayload = () => {
  const chain = hoistedSupabase.from.mock.results
    .filter((r, i) => hoistedSupabase.from.mock.calls[i][0] === 'cloudinary_pending_uploads')
    .pop()?.value;
  return chain?.upsert?.mock?.calls?.at(-1)?.[0];
};

beforeEach(() => {
  vi.clearAllMocks();
  hoistedSupabase.from.mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ error: null }) }) }) }),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn()
  });
});

describe('cloudinary_pending_uploads 的 claimed 语义', () => {
  it('默认（用户侧上传）登记为未认领', async () => {
    await registerCloudinaryPendingUpload(
      { publicId: 'boh-cloud-plus/forum/a1', url: 'https://cdn/x.jpg' },
      { source: 'forum' }
    );
    const payload = lastPendingPayload();
    expect(payload).toBeTruthy();
    expect(payload.claimed_at).toBeNull();
  });

  it('claimed: true（装修台上传即投产）直接写入认领时间', async () => {
    await registerCloudinaryPendingUpload(
      { publicId: 'boh-cloud-plus/admin-hero-console/b2', url: 'https://cdn/y.jpg' },
      { source: 'hero-console', claimed: true }
    );
    const payload = lastPendingPayload();
    expect(payload).toBeTruthy();
    expect(typeof payload.claimed_at).toBe('string');
    expect(Number.isNaN(Date.parse(payload.claimed_at))).toBe(false);
    expect(payload.deleted_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 源码守卫：三个装修台的每一处上传都必须带 claimPendingUpload。
// 少标一处，该来源的线上素材就会永久停在未归属态 —— 这类漏标没有运行时症状，
// 只有清理时才会暴露（且是误删），因此用结构断言把它钉住。
// ---------------------------------------------------------------------------
describe('装修台上传归属守卫', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const consoles = [
    ['HeroConsole', 'src/views/HeroConsole/index.vue'],
    ['ShopConsole', 'src/views/ShopConsole/index.vue'],
    ['AvatarConsole', 'src/views/AvatarConsole/index.vue']
  ];

  it.each(consoles)('%s 的每处 uploadImageToCloudinary 都声明了 claimPendingUpload', (_name, rel) => {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // 逐个调用点切片：从 uploadImageToCloudinary( 到本次调用的收尾 `);`
    const calls = [...source.matchAll(/uploadImageToCloudinary\([\s\S]*?\)\s*;/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThan(0);
    const missing = calls.filter((c) => !c.includes('claimPendingUpload'));
    expect(missing).toEqual([]);
  });
});
